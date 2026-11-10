import type { CoreDatabase } from './database-core'
import { buildActivePlayerProjection, type ActivePlayerProjection } from './projections'
import { readBlockState, requireCurrentCaller, requireTargetUid, SocialError, SOCIAL_SERVICE_UNAVAILABLE_MESSAGE } from './social-core'

export const ONLINE_PAGE_SIZE = 20
export const PRESENCE_BATCH_SIZE = 100
export const PRESENCE_CANDIDATE_LIMIT = 1000

export interface OnlinePlayerPage {
  items: ActivePlayerProjection[]
  hasMore: boolean
  nextCursor?: string
}

async function revalidatePlayers(database: CoreDatabase, actorUid: string, version: string, players: ActivePlayerProjection[]) {
  const current = await Promise.all(players.map(async (player) => {
    const [account, presence, blocked] = await Promise.all([
      database.ref(`accounts/${player.uid}`).get(),
      database.ref(`presenceSessions/${player.uid}`).get(),
      readBlockState(database, actorUid, player.uid),
    ])
    return blocked ? null : buildActivePlayerProjection(account.val(), player.uid, presence.val(), version)
  }))
  return current.filter((player): player is ActivePlayerProjection => player !== null)
}

/** Keyset-scan presence candidates, never the accounts tree or trigger-owned projections. */
export async function listOnlinePlayersService(
  database: CoreDatabase,
  actorUid: string,
  expectedPrivacyVersion: string,
  after?: string,
): Promise<OnlinePlayerPage> {
  if (after !== undefined) requireTargetUid({ uid: after })
  await requireCurrentCaller(database, actorUid, expectedPrivacyVersion)
  const eligible: ActivePlayerProjection[] = []
  let cursor = after
  let exhausted = false
  let scanned = 0

  while (eligible.length <= ONLINE_PAGE_SIZE && scanned < PRESENCE_CANDIDATE_LIMIT) {
    let query = database.ref('presenceSessions').orderByKey()
    if (cursor !== undefined) query = query.startAfter(cursor)
    const snapshot = await query.limitToFirst(PRESENCE_BATCH_SIZE).get()
    const candidates: { uid: string; presence: unknown }[] = []
    snapshot.forEach((child) => {
      if (child.key !== null) candidates.push({ uid: child.key, presence: child.val() })
    })
    if (candidates.length === 0) {
      exhausted = true
      eligible.splice(0, eligible.length, ...await revalidatePlayers(database, actorUid, expectedPrivacyVersion, eligible))
      break
    }

    // Small concurrent windows cap account/block reads even for a dense candidate batch.
    for (let offset = 0; offset < candidates.length && eligible.length <= ONLINE_PAGE_SIZE; offset += 10) {
      const window = candidates.slice(offset, offset + 10)
      const results = await Promise.all(window.map(async ({ uid, presence }) => {
        try { requireTargetUid({ uid }) } catch { return null }
        if (uid === actorUid) return null
        const [account, blocked] = await Promise.all([
          database.ref(`accounts/${uid}`).get(),
          readBlockState(database, actorUid, uid),
        ])
        if (blocked) return null
        return buildActivePlayerProjection(account.val(), uid, presence, expectedPrivacyVersion)
      }))
      for (let index = 0; index < window.length; index += 1) {
        const candidate = window[index]
        if (!candidate) continue
        scanned += 1
        cursor = candidate.uid
        const player = results[index]
        if (player) eligible.push(player)
        if (eligible.length > ONLINE_PAGE_SIZE) break
      }
    }
    const consumedAll = cursor === candidates[candidates.length - 1]?.uid
    exhausted = consumedAll && candidates.length < PRESENCE_BATCH_SIZE
    if (eligible.length > ONLINE_PAGE_SIZE || exhausted || scanned >= PRESENCE_CANDIDATE_LIMIT) {
      eligible.splice(0, eligible.length, ...await revalidatePlayers(database, actorUid, expectedPrivacyVersion, eligible))
      if (eligible.length > ONLINE_PAGE_SIZE || exhausted) break
      // If privacy/block/presence changed, resume after the last consumed candidate to refill.
    }
  }

  await requireCurrentCaller(database, actorUid, expectedPrivacyVersion)
  // A scan cap is not evidence of another eligible player. Do not invent hasMore.
  if (eligible.length <= ONLINE_PAGE_SIZE && !exhausted) {
    throw new SocialError('failed-precondition', SOCIAL_SERVICE_UNAVAILABLE_MESSAGE)
  }
  const items = eligible.slice(0, ONLINE_PAGE_SIZE)
  const hasMore = eligible.length > ONLINE_PAGE_SIZE
  const last = items[items.length - 1]
  return { items, hasMore, ...(hasMore && last ? { nextCursor: last.uid } : {}) }
}

export async function getPlayerPresenceService(
  database: CoreDatabase,
  actorUid: string,
  targetUid: string,
  expectedPrivacyVersion: string,
): Promise<{ online: boolean }> {
  requireTargetUid({ uid: targetUid })
  await requireCurrentCaller(database, actorUid, expectedPrivacyVersion)
  const [account, presence, blocked] = await Promise.all([
    database.ref(`accounts/${targetUid}`).get(),
    database.ref(`presenceSessions/${targetUid}`).get(),
    readBlockState(database, actorUid, targetUid),
  ])
  if (blocked || !buildActivePlayerProjection(account.val(), targetUid, presence.val(), expectedPrivacyVersion)) {
    return { online: false }
  }
  // Recheck privacy and blocks at the response boundary after the asynchronous reads.
  const [latest, latestPresence, latestBlocked] = await Promise.all([
    database.ref(`accounts/${targetUid}`).get(),
    database.ref(`presenceSessions/${targetUid}`).get(),
    readBlockState(database, actorUid, targetUid),
    requireCurrentCaller(database, actorUid, expectedPrivacyVersion),
  ])
  return { online: Boolean(!latestBlocked && buildActivePlayerProjection(latest.val(), targetUid, latestPresence.val(), expectedPrivacyVersion)) }
}
