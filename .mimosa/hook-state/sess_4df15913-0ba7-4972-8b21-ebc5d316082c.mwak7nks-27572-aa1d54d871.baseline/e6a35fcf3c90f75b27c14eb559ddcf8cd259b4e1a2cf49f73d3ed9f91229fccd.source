import { initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { logger } from 'firebase-functions'
import { onValueWritten } from 'firebase-functions/v2/database'
import { onCall } from 'firebase-functions/v2/https'
import { expectedPrivacyVersion } from './config.js'
import {
  buildActivePlayerProjection,
  buildOnlineDeckProjectionRemoval,
  buildPublicOnlineDeckProjection,
  isPlainRecord,
} from './projections.js'
import {
  cleanupPrivatePlayer,
  createSocialCallableHandlers,
  reconcileFollowProjection,
  reconcilePublicPlayerProfile,
} from './social.js'

initializeApp()

const DATABASE_REGION = 'asia-southeast1'
const DATABASE_INSTANCE = 'kogni-ai-default-rtdb'
const databaseTriggerOptions = { region: DATABASE_REGION, instance: DATABASE_INSTANCE } as const
const callableOptions = { region: DATABASE_REGION } as const
const socialHandlers = createSocialCallableHandlers(getDatabase(), expectedPrivacyVersion)

export const getPlayerProfile = onCall(callableOptions, socialHandlers.getPlayerProfile)
export const followPlayer = onCall(callableOptions, socialHandlers.followPlayer)
export const unfollowPlayer = onCall(callableOptions, socialHandlers.unfollowPlayer)
export const blockPlayer = onCall(callableOptions, socialHandlers.blockPlayer)
export const unblockPlayer = onCall(callableOptions, socialHandlers.unblockPlayer)

async function reconcileActivePlayer(uid: string): Promise<void> {
  const database = getDatabase()
  const [accountSnapshot, sessionsSnapshot] = await Promise.all([
    database.ref(`accounts/${uid}`).get(),
    database.ref(`presenceSessions/${uid}`).get(),
  ])
  const projection = buildActivePlayerProjection(
    accountSnapshot.val(),
    uid,
    sessionsSnapshot.val(),
    expectedPrivacyVersion(),
  )
  await database.ref(`activePlayers/${uid}`).set(projection)
}

async function reconcileDeck(deckId: string, headValue?: unknown): Promise<void> {
  const database = getDatabase()
  const head = headValue === undefined
    ? (await database.ref(`onlineDecks/${deckId}/head`).get()).val()
    : headValue
  const ownerId = isPlainRecord(head) && typeof head.ownerId === 'string' ? head.ownerId : null
  const ownerAccount = ownerId ? (await database.ref(`accounts/${ownerId}`).get()).val() : null
  const projection = buildPublicOnlineDeckProjection(head, deckId, ownerAccount, expectedPrivacyVersion())
  const previousOwnerSnapshot = await database.ref(`publicOnlineDeckCatalog/${deckId}/ownerId`).get()
  const previousOwnerId = typeof previousOwnerSnapshot.val() === 'string'
    ? previousOwnerSnapshot.val() as string
    : null

  const removal = buildOnlineDeckProjectionRemoval(deckId, ownerId, previousOwnerId)
  const updates: Record<string, unknown> = {
    [`publicOnlineDeckCatalog/${removal.catalogDeckId}`]: projection,
  }
  for (const indexedOwnerId of removal.ownerDeckIds) {
    updates[`onlineDecksByOwner/${indexedOwnerId}/${deckId}`] = indexedOwnerId === projection?.ownerId
      ? projection
      : null
  }
  await database.ref().update(updates)

  const affectedOwners = new Set<string>()
  if (ownerId) affectedOwners.add(ownerId)
  if (previousOwnerId) affectedOwners.add(previousOwnerId)
  await Promise.all([...affectedOwners].map((uid) => (
    reconcilePublicPlayerProfile(database, uid, expectedPrivacyVersion())
  )))
}

async function reconcileOwnerDecks(uid: string): Promise<void> {
  const database = getDatabase()
  const indexSnapshot = await database.ref(`onlineDecksByOwner/${uid}`).get()
  const indexedDeckIds = isPlainRecord(indexSnapshot.val()) ? Object.keys(indexSnapshot.val() as object) : []
  const ownedHeadsSnapshot = await database.ref('onlineDecks').orderByChild('head/ownerId').equalTo(uid).get()
  const ownedDecks = isPlainRecord(ownedHeadsSnapshot.val())
    ? ownedHeadsSnapshot.val() as Record<string, unknown>
    : {}
  const deckIds = new Set([...indexedDeckIds, ...Object.keys(ownedDecks)])

  const accountValue = (await database.ref(`accounts/${uid}`).get()).val()
  const updates: Record<string, unknown> = {}
  for (const deckId of deckIds) {
    const deckValue = ownedDecks[deckId]
    const head = isPlainRecord(deckValue) ? deckValue.head : null
    const projection = buildPublicOnlineDeckProjection(head, deckId, accountValue, expectedPrivacyVersion())
    updates[`publicOnlineDeckCatalog/${deckId}`] = projection
    updates[`onlineDecksByOwner/${uid}/${deckId}`] = projection
  }
  if (Object.keys(updates).length > 0) await database.ref().update(updates)
}

export const reconcilePresenceProjection = onValueWritten(
  { ...databaseTriggerOptions, ref: '/presenceSessions/{uid}/{sessionId}' },
  async (event) => {
    await reconcileActivePlayer(event.params.uid)
  },
)

export const reconcileAccountProjections = onValueWritten(
  { ...databaseTriggerOptions, ref: '/accounts/{uid}', retry: true },
  async (event) => {
    const uid = event.params.uid
    const failures = await Promise.allSettled([
      reconcileActivePlayer(uid),
      reconcileOwnerDecks(uid),
      cleanupPrivatePlayer(getDatabase(), uid, expectedPrivacyVersion()),
    ])
    const rejected = failures.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (rejected.length > 0) {
      rejected.forEach((result) => logger.error('Account projection reconciliation failed', { uid, error: result.reason }))
      throw new AggregateError(rejected.map((result) => result.reason), `Failed to reconcile account projections for ${uid}`)
    }
  },
)

export const reconcileOnlineDeckProjection = onValueWritten(
  { ...databaseTriggerOptions, ref: '/onlineDecks/{deckId}/head', retry: true },
  async (event) => {
    await reconcileDeck(event.params.deckId, event.data.after.val())
  },
)

export const reconcileLeaderboardPlayerProfile = onValueWritten(
  { ...databaseTriggerOptions, ref: '/leaderboard/{uid}/xp', retry: true },
  async (event) => {
    await reconcilePublicPlayerProfile(getDatabase(), event.params.uid, expectedPrivacyVersion())
  },
)

export const reconcilePlayerFollowEdge = onValueWritten(
  { ...databaseTriggerOptions, ref: '/playerFollowEdges/{edgeId}', retry: true },
  async (event) => {
    await reconcileFollowProjection(
      getDatabase(),
      event.params.edgeId,
      event.data.before.val(),
      event.data.after.val(),
      expectedPrivacyVersion(),
    )
  },
)
