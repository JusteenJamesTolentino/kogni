import type { Database } from 'firebase-admin/database'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import * as core from './social-core.js'

export {
  XP_TRUST,
  SOCIAL_UNAVAILABLE_MESSAGE,
  SOCIAL_SERVICE_UNAVAILABLE_MESSAGE,
  SocialUnavailableError,
  followEdgeId,
  isFollowEdge,
  isPublicPlayerProfile,
  buildPublicPlayerProfile,
  reconcilePublicPlayerProfile,
  reconcileFollowProjection,
  cleanupPrivatePlayer,
} from './social-core.js'
export type { PublicPlayerProfile, FollowEdge, PlayerProfileResult, FollowResult, BlockResult } from './social-core.js'

function translateError(error: unknown): never {
  if (error instanceof core.SocialError) throw new HttpsError(error.code, error.message)
  throw error
}

function callableCompatible<A extends unknown[], R>(operation: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    try { return await operation(...args) } catch (error) { return translateError(error) }
  }
}

export function requireTargetUid(data: unknown): string {
  try { return core.requireTargetUid(data) } catch (error) { return translateError(error) }
}

// Keep direct service exports compatible with callers that expect HttpsError.
export const followPlayerService = callableCompatible(core.followPlayerService)
export const unfollowPlayerService = callableCompatible(core.unfollowPlayerService)
export const blockPlayerService = callableCompatible(core.blockPlayerService)
export const unblockPlayerService = callableCompatible(core.unblockPlayerService)
export const getPlayerProfileService = callableCompatible(core.getPlayerProfileService)

function requireAuth(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid
  if (typeof uid !== 'string' || !core.UID_PATTERN.test(uid)) {
    throw new HttpsError('unauthenticated', 'Authentication is required.')
  }
  return uid
}

export function createSocialCallableHandlers(database: Database, privacyVersion: () => string) {
  return {
    getPlayerProfile: async (request: CallableRequest<unknown>) => getPlayerProfileService(database, requireAuth(request), requireTargetUid(request.data), privacyVersion()),
    followPlayer: async (request: CallableRequest<unknown>) => followPlayerService(database, requireAuth(request), requireTargetUid(request.data), privacyVersion()),
    unfollowPlayer: async (request: CallableRequest<unknown>) => unfollowPlayerService(database, requireAuth(request), requireTargetUid(request.data), privacyVersion()),
    blockPlayer: async (request: CallableRequest<unknown>) => blockPlayerService(database, requireAuth(request), requireTargetUid(request.data), privacyVersion()),
    unblockPlayer: async (request: CallableRequest<unknown>) => unblockPlayerService(database, requireAuth(request), requireTargetUid(request.data), privacyVersion()),
  }
}
