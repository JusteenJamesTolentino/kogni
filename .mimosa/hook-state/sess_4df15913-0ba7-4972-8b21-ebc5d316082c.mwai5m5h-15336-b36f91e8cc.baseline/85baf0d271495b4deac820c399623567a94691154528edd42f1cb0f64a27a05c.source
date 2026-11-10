import { createHash } from 'node:crypto'
import type { Database, DataSnapshot } from 'firebase-admin/database'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { isPlainRecord, readEligibleAccount } from './projections.js'

export const XP_TRUST = 'client-reported' as const
export const SOCIAL_UNAVAILABLE_MESSAGE = 'Player is unavailable.'
export const SOCIAL_SERVICE_UNAVAILABLE_MESSAGE = 'Player service is unavailable.'

const UID_PATTERN = /^[^.#$[\]/]{1,128}$/
const PROFILE_FIELDS = [
  'uid',
  'nickname',
  'nicknameCanonical',
  'communityXp',
  'xpTrust',
  'followerCount',
  'followingCount',
  'publishedDeckCount',
] as const

export interface PublicPlayerProfile {
  uid: string
  nickname: string
  nicknameCanonical: string
  communityXp: number
  xpTrust: typeof XP_TRUST
  followerCount: number
  followingCount: number
  publishedDeckCount: number
}

export interface FollowEdge {
  followerUid: string
  followedUid: string
  createdAt: number
}

export interface PlayerProfileResult {
  profile: PublicPlayerProfile
  social: {
    following: boolean
    followedBy: boolean
  }
}

export interface FollowResult {
  targetUid: string
  following: boolean
}

export interface BlockResult {
  targetUid: string
  blocked: boolean
}

interface TargetInput {
  uid: unknown
}

interface CallableAuth {
  uid: string
}

export class SocialUnavailableError extends Error {
  constructor(message = SOCIAL_UNAVAILABLE_MESSAGE) {
    super(message)
    this.name = 'SocialUnavailableError'
  }
}

export function requireTargetUid(data: unknown): string {
  if (!isPlainRecord(data) || Object.keys(data).length !== 1 || !Object.hasOwn(data, 'uid')) {
    throw new HttpsError('invalid-argument', 'A valid uid is required.')
  }
  const uid = (data as unknown as TargetInput).uid
  if (typeof uid !== 'string' || !UID_PATTERN.test(uid)) {
    throw new HttpsError('invalid-argument', 'A valid uid is required.')
  }
  return uid
}

export function followEdgeId(followerUid: string, followedUid: string): string {
  return createHash('sha256').update(followerUid).update('\0').update(followedUid).digest('hex')
}

export function isFollowEdge(value: unknown): value is FollowEdge {
  return isPlainRecord(value) &&
    Object.keys(value).length === 3 &&
    typeof value.followerUid === 'string' && UID_PATTERN.test(value.followerUid) &&
    typeof value.followedUid === 'string' && UID_PATTERN.test(value.followedUid) &&
    value.followerUid !== value.followedUid &&
    typeof value.createdAt === 'number' && Number.isSafeInteger(value.createdAt) && value.createdAt >= 0
}

export function isPublicPlayerProfile(value: unknown): value is PublicPlayerProfile {
  if (!isPlainRecord(value) || Object.keys(value).length !== PROFILE_FIELDS.length) return false
  if (!PROFILE_FIELDS.every((field) => Object.hasOwn(value, field))) return false
  return typeof value.uid === 'string' && UID_PATTERN.test(value.uid) &&
    typeof value.nickname === 'string' && /^[A-Za-z0-9_]{3,24}$/.test(value.nickname) &&
    value.nicknameCanonical === value.nickname.toLowerCase() &&
    typeof value.communityXp === 'number' && Number.isSafeInteger(value.communityXp) && value.communityXp >= 0 &&
    value.xpTrust === XP_TRUST &&
    isSafeCount(value.followerCount) &&
    isSafeCount(value.followingCount) &&
    isSafeCount(value.publishedDeckCount)
}

function isSafeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function buildPublicPlayerProfile(
  accountValue: unknown,
  uid: string,
  expectedPrivacyVersion: string,
  sources: {
    leaderboardValue: unknown
    followerCount: number
    followingCount: number
    publishedDeckCount: number
  },
): PublicPlayerProfile | null {
  const account = readEligibleAccount(accountValue, uid, expectedPrivacyVersion)
  if (!account?.preferences.discoverable) return null
  const leaderboard = isPlainRecord(sources.leaderboardValue) ? sources.leaderboardValue : null
  const communityXp = leaderboard && Number.isSafeInteger(leaderboard.xp) && (leaderboard.xp as number) >= 0
    ? leaderboard.xp as number
    : 0
  return {
    uid,
    nickname: account.nickname,
    nicknameCanonical: account.nicknameCanonical,
    communityXp,
    xpTrust: XP_TRUST,
    followerCount: normalizeCount(sources.followerCount),
    followingCount: normalizeCount(sources.followingCount),
    publishedDeckCount: normalizeCount(sources.publishedDeckCount),
  }
}

function normalizeCount(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function requireAuth(request: CallableRequest<unknown>): CallableAuth {
  const uid = request.auth?.uid
  if (typeof uid !== 'string' || !UID_PATTERN.test(uid)) {
    throw new HttpsError('unauthenticated', 'Authentication is required.')
  }
  return { uid }
}

async function requireCurrentCaller(
  database: Database,
  uid: string,
  expectedPrivacyVersion: string,
): Promise<void> {
  const account = (await database.ref(`accounts/${uid}`).get()).val()
  if (!readEligibleAccount(account, uid, expectedPrivacyVersion)) {
    throw new HttpsError('failed-precondition', SOCIAL_SERVICE_UNAVAILABLE_MESSAGE)
  }
}

async function readBlockState(database: Database, leftUid: string, rightUid: string): Promise<boolean> {
  const [left, right] = await Promise.all([
    database.ref(`playerBlocks/${leftUid}/${rightUid}`).get(),
    database.ref(`playerBlocks/${rightUid}/${leftUid}`).get(),
  ])
  return left.exists() || right.exists()
}

async function readFollowEdge(database: Database, followerUid: string, followedUid: string): Promise<boolean> {
  return (await database.ref(`playerFollowEdges/${followEdgeId(followerUid, followedUid)}`).get()).exists()
}

function countChildren(snapshot: DataSnapshot): number {
  return snapshot.numChildren()
}

function countPublishedDecks(snapshot: DataSnapshot, uid: string): number {
  let count = 0
  snapshot.forEach((child) => {
    const deck = child.val() as unknown
    const head = isPlainRecord(deck) && isPlainRecord(deck.head) ? deck.head : null
    if (head?.ownerId === uid && head.visibility === 'public' && head.status === 'active') count += 1
  })
  return count
}

export async function reconcilePublicPlayerProfile(
  database: Database,
  uid: string,
  expectedPrivacyVersion: string,
): Promise<PublicPlayerProfile | null> {
  const outgoingQuery = database.ref('playerFollowEdges').orderByChild('followerUid').equalTo(uid)
  const incomingQuery = database.ref('playerFollowEdges').orderByChild('followedUid').equalTo(uid)
  const ownedDecksQuery = database.ref('onlineDecks').orderByChild('head/ownerId').equalTo(uid)
  const [accountSnapshot, leaderboardSnapshot, outgoingSnapshot, incomingSnapshot, decksSnapshot] = await Promise.all([
    database.ref(`accounts/${uid}`).get(),
    database.ref(`leaderboard/${uid}`).get(),
    outgoingQuery.get(),
    incomingQuery.get(),
    ownedDecksQuery.get(),
  ])

  const profile = buildPublicPlayerProfile(accountSnapshot.val(), uid, expectedPrivacyVersion, {
    leaderboardValue: leaderboardSnapshot.val(),
    followerCount: countChildren(incomingSnapshot),
    followingCount: countChildren(outgoingSnapshot),
    publishedDeckCount: countPublishedDecks(decksSnapshot, uid),
  })

  // Re-read eligibility immediately before publishing so stale async work cannot
  // intentionally expose a profile after an opt-out. The account trigger is the
  // final repair path for the unavoidable write race between these two operations.
  const latestAccount = (await database.ref(`accounts/${uid}`).get()).val()
  if (!readEligibleAccount(latestAccount, uid, expectedPrivacyVersion)?.preferences.discoverable) {
    await database.ref(`publicPlayerProfiles/${uid}`).remove()
    return null
  }
  if (!profile) {
    await database.ref(`publicPlayerProfiles/${uid}`).remove()
    return null
  }
  const latestProfile = buildPublicPlayerProfile(latestAccount, uid, expectedPrivacyVersion, {
    leaderboardValue: leaderboardSnapshot.val(),
    followerCount: profile.followerCount,
    followingCount: profile.followingCount,
    publishedDeckCount: profile.publishedDeckCount,
  })
  if (!latestProfile) {
    await database.ref(`publicPlayerProfiles/${uid}`).remove()
    return null
  }
  await database.ref(`publicPlayerProfiles/${uid}`).set(latestProfile)
  return latestProfile
}

async function targetIsFollowable(
  database: Database,
  actorUid: string,
  targetUid: string,
  expectedPrivacyVersion: string,
): Promise<boolean> {
  const [actorSnapshot, targetSnapshot, blocked] = await Promise.all([
    database.ref(`accounts/${actorUid}`).get(),
    database.ref(`accounts/${targetUid}`).get(),
    readBlockState(database, actorUid, targetUid),
  ])
  const actor = readEligibleAccount(actorSnapshot.val(), actorUid, expectedPrivacyVersion)
  const target = readEligibleAccount(targetSnapshot.val(), targetUid, expectedPrivacyVersion)
  return Boolean(actor?.preferences.discoverable && target?.preferences.discoverable && !blocked)
}

export async function reconcileFollowProjection(
  database: Database,
  edgeId: string,
  beforeValue: unknown,
  afterValue: unknown,
  expectedPrivacyVersion: string,
): Promise<void> {
  const before = isFollowEdge(beforeValue) ? beforeValue : null
  const after = isFollowEdge(afterValue) ? afterValue : null
  const identities = new Map<string, FollowEdge>()
  if (before) identities.set(`${before.followerUid}\0${before.followedUid}`, before)
  if (after) identities.set(`${after.followerUid}\0${after.followedUid}`, after)

  const currentSnapshot = await database.ref(`playerFollowEdges/${edgeId}`).get()
  const currentValue: unknown = currentSnapshot.val()
  const current = isFollowEdge(currentValue) && followEdgeId(currentValue.followerUid, currentValue.followedUid) === edgeId
    ? currentValue
    : null
  const updates: Record<string, unknown> = {}
  for (const edge of identities.values()) {
    const isCurrentPair = current?.followerUid === edge.followerUid && current.followedUid === edge.followedUid
    const marker = isCurrentPair ? { edgeId, createdAt: current.createdAt } : null
    updates[`playerFollowing/${edge.followerUid}/${edge.followedUid}`] = marker
    updates[`playerFollowers/${edge.followedUid}/${edge.followerUid}`] = marker
  }
  if (Object.keys(updates).length > 0) await database.ref().update(updates)

  const affectedUids = new Set<string>()
  for (const edge of identities.values()) {
    affectedUids.add(edge.followerUid)
    affectedUids.add(edge.followedUid)
  }
  const reconciliations = [...affectedUids].map((uid) => reconcilePublicPlayerProfile(database, uid, expectedPrivacyVersion))
  await Promise.all(reconciliations)
}

async function removeFollowEdge(
  database: Database,
  followerUid: string,
  followedUid: string,
  expectedPrivacyVersion: string,
): Promise<boolean> {
  const edgeId = followEdgeId(followerUid, followedUid)
  const edgeRef = database.ref(`playerFollowEdges/${edgeId}`)
  const before = (await edgeRef.get()).val() as unknown
  if (!isFollowEdge(before)) {
    await reconcileFollowProjection(database, edgeId, null, null, expectedPrivacyVersion)
    return false
  }
  await edgeRef.remove()
  await reconcileFollowProjection(database, edgeId, before, null, expectedPrivacyVersion)
  return true
}

export async function followPlayerService(
  database: Database,
  actorUid: string,
  targetUid: string,
  expectedPrivacyVersion: string,
  now = Date.now(),
): Promise<FollowResult> {
  if (actorUid === targetUid) throw new HttpsError('invalid-argument', 'You cannot follow yourself.')
  await requireCurrentCaller(database, actorUid, expectedPrivacyVersion)
  if (!await targetIsFollowable(database, actorUid, targetUid, expectedPrivacyVersion)) {
    throw new HttpsError('not-found', SOCIAL_UNAVAILABLE_MESSAGE)
  }

  const edgeId = followEdgeId(actorUid, targetUid)
  const edgeRef = database.ref(`playerFollowEdges/${edgeId}`)
  const transaction = await edgeRef.transaction((current) => {
    if (isFollowEdge(current) && current.followerUid === actorUid && current.followedUid === targetUid) return current
    return { followerUid: actorUid, followedUid: targetUid, createdAt: now } satisfies FollowEdge
  })
  const edge = transaction.snapshot.val() as unknown

  // Close the block/privacy race. If either changed while the edge transaction
  // committed, roll the canonical edge back before returning to the caller.
  if (!await targetIsFollowable(database, actorUid, targetUid, expectedPrivacyVersion)) {
    await edgeRef.remove()
    await reconcileFollowProjection(database, edgeId, edge, null, expectedPrivacyVersion)
    throw new HttpsError('not-found', SOCIAL_UNAVAILABLE_MESSAGE)
  }
  await reconcileFollowProjection(database, edgeId, null, edge, expectedPrivacyVersion)
  return { targetUid, following: true }
}

export async function unfollowPlayerService(
  database: Database,
  actorUid: string,
  targetUid: string,
  expectedPrivacyVersion: string,
): Promise<FollowResult> {
  if (actorUid === targetUid) throw new HttpsError('invalid-argument', 'You cannot unfollow yourself.')
  await requireCurrentCaller(database, actorUid, expectedPrivacyVersion)
  await removeFollowEdge(database, actorUid, targetUid, expectedPrivacyVersion)
  return { targetUid, following: false }
}

export async function blockPlayerService(
  database: Database,
  actorUid: string,
  targetUid: string,
  expectedPrivacyVersion: string,
  now = Date.now(),
): Promise<BlockResult> {
  if (actorUid === targetUid) throw new HttpsError('invalid-argument', 'You cannot block yourself.')
  await requireCurrentCaller(database, actorUid, expectedPrivacyVersion)
  const targetAccount = (await database.ref(`accounts/${targetUid}`).get()).val()
  if (!readEligibleAccount(targetAccount, targetUid, expectedPrivacyVersion)) {
    throw new HttpsError('not-found', SOCIAL_UNAVAILABLE_MESSAGE)
  }

  const blockRef = database.ref(`playerBlocks/${actorUid}/${targetUid}`)
  await blockRef.transaction((current) => (
    typeof current === 'number' && Number.isSafeInteger(current) && current >= 0 ? current : now
  ))
  await Promise.all([
    removeFollowEdge(database, actorUid, targetUid, expectedPrivacyVersion),
    removeFollowEdge(database, targetUid, actorUid, expectedPrivacyVersion),
  ])
  return { targetUid, blocked: true }
}

export async function unblockPlayerService(
  database: Database,
  actorUid: string,
  targetUid: string,
  expectedPrivacyVersion: string,
): Promise<BlockResult> {
  if (actorUid === targetUid) throw new HttpsError('invalid-argument', 'You cannot unblock yourself.')
  await requireCurrentCaller(database, actorUid, expectedPrivacyVersion)
  await database.ref(`playerBlocks/${actorUid}/${targetUid}`).remove()
  return { targetUid, blocked: false }
}

export async function getPlayerProfileService(
  database: Database,
  actorUid: string,
  targetUid: string,
  expectedPrivacyVersion: string,
): Promise<PlayerProfileResult> {
  await requireCurrentCaller(database, actorUid, expectedPrivacyVersion)
  const [targetAccountSnapshot, blocked] = await Promise.all([
    database.ref(`accounts/${targetUid}`).get(),
    readBlockState(database, actorUid, targetUid),
  ])
  const target = readEligibleAccount(targetAccountSnapshot.val(), targetUid, expectedPrivacyVersion)
  if (!target?.preferences.discoverable || blocked) {
    throw new HttpsError('not-found', SOCIAL_UNAVAILABLE_MESSAGE)
  }
  const profile = await reconcilePublicPlayerProfile(database, targetUid, expectedPrivacyVersion)
  if (!profile) throw new HttpsError('not-found', SOCIAL_UNAVAILABLE_MESSAGE)
  const [following, followedBy] = await Promise.all([
    readFollowEdge(database, actorUid, targetUid),
    readFollowEdge(database, targetUid, actorUid),
  ])
  return { profile, social: { following, followedBy } }
}

export async function cleanupPrivatePlayer(
  database: Database,
  uid: string,
  expectedPrivacyVersion: string,
): Promise<void> {
  const account = (await database.ref(`accounts/${uid}`).get()).val()
  const eligible = readEligibleAccount(account, uid, expectedPrivacyVersion)
  if (eligible?.preferences.discoverable) {
    // Identity/profile publication is owned by Functions, not by account clients.
    // Repair legacy projections if onboarding/preferences were written by an older client.
    await database.ref().update({
      [`publicAccounts/${uid}`]: {
        uid,
        nickname: eligible.nickname,
        nicknameCanonical: eligible.nicknameCanonical,
        updatedAt: Date.now(),
      },
      [`publicProfiles/${uid}`]: {
        uid,
        displayName: eligible.nickname,
        displayNameNormalized: eligible.nicknameCanonical,
        photoURL: '',
        updatedAt: Date.now(),
      },
    })
    await reconcilePublicPlayerProfile(database, uid, expectedPrivacyVersion)
    return
  }

  // Remove public projections first. Exact profile reads are callable-gated as a
  // second layer, while active/catalog rules never expose these deleted records.
  await database.ref().update({
    [`publicPlayerProfiles/${uid}`]: null,
    [`activePlayers/${uid}`]: null,
    [`publicAccounts/${uid}`]: null,
    [`publicProfiles/${uid}`]: null,
    [`onlineDecksByOwner/${uid}`]: null,
  })

  const [outgoing, incoming, catalog] = await Promise.all([
    database.ref('playerFollowEdges').orderByChild('followerUid').equalTo(uid).get(),
    database.ref('playerFollowEdges').orderByChild('followedUid').equalTo(uid).get(),
    database.ref('publicOnlineDeckCatalog').orderByChild('ownerId').equalTo(uid).get(),
  ])
  const updates: Record<string, null> = {}
  const edgeValues = new Map<string, FollowEdge>()
  for (const snapshot of [outgoing, incoming]) {
    snapshot.forEach((child) => {
      const value: unknown = child.val()
      if (child.key && isFollowEdge(value)) {
        updates[`playerFollowEdges/${child.key}`] = null
        edgeValues.set(child.key, value)
      }
    })
  }
  catalog.forEach((child) => {
    if (child.key) updates[`publicOnlineDeckCatalog/${child.key}`] = null
  })
  if (Object.keys(updates).length > 0) await database.ref().update(updates)
  await Promise.all([...edgeValues].map(([edgeId, edge]) => (
    reconcileFollowProjection(database, edgeId, edge, null, expectedPrivacyVersion)
  )))
}

export function createSocialCallableHandlers(database: Database, privacyVersion: () => string) {
  return {
    getPlayerProfile: async (request: CallableRequest<unknown>) => {
      const actor = requireAuth(request)
      return getPlayerProfileService(database, actor.uid, requireTargetUid(request.data), privacyVersion())
    },
    followPlayer: async (request: CallableRequest<unknown>) => {
      const actor = requireAuth(request)
      return followPlayerService(database, actor.uid, requireTargetUid(request.data), privacyVersion())
    },
    unfollowPlayer: async (request: CallableRequest<unknown>) => {
      const actor = requireAuth(request)
      return unfollowPlayerService(database, actor.uid, requireTargetUid(request.data), privacyVersion())
    },
    blockPlayer: async (request: CallableRequest<unknown>) => {
      const actor = requireAuth(request)
      return blockPlayerService(database, actor.uid, requireTargetUid(request.data), privacyVersion())
    },
    unblockPlayer: async (request: CallableRequest<unknown>) => {
      const actor = requireAuth(request)
      return unblockPlayerService(database, actor.uid, requireTargetUid(request.data), privacyVersion())
    },
  }
}
