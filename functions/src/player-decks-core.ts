import type { CoreDatabase as Database, CoreSnapshot as DataSnapshot } from './database-core'
import { buildPublicOnlineDeckProjection, isPlainRecord } from './projections'
import type { PublicOnlineDeckProjection } from './projections'
import {
  readBlockState,
  requireCurrentCaller,
  requireTargetUid,
  SocialError,
  SOCIAL_UNAVAILABLE_MESSAGE,
} from './social-core'
import { readEligibleAccount } from './projections'

export const PLAYER_DECK_PAGE_SIZE = 20
export const PLAYER_DECK_MAX_OWNER_RECORDS = 500
const OWNER_QUERY_LIMIT = PLAYER_DECK_MAX_OWNER_RECORDS + 1
const MAX_HEAD_REVALIDATIONS = 100
const FIREBASE_KEY_PATTERN = /^[^.#$[\]/\x00-\x1f\x7f]{1,200}$/
const CURSOR_PATTERN = /^([0-9]+):([A-Za-z0-9_-]+)$/

export interface PlayerDeckCursor {
  updatedAt: number
  id: string
}

export interface PlayerDeckPage {
  items: PublicOnlineDeckProjection[]
  hasMore: boolean
  nextCursor?: string
}

export function encodePlayerDeckCursor(cursor: PlayerDeckCursor): string {
  return `${cursor.updatedAt}:${Buffer.from(cursor.id, 'utf8').toString('base64url')}`
}

export function parsePlayerDeckCursor(value: unknown): PlayerDeckCursor | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length < 3 || value.length > 300) {
    throw new SocialError('invalid-argument', 'A valid deck cursor is required.')
  }
  const match = CURSOR_PATTERN.exec(value)
  if (!match?.[1] || !match[2]) throw new SocialError('invalid-argument', 'A valid deck cursor is required.')
  const updatedAt = Number(match[1])
  let id: string
  try {
    id = Buffer.from(match[2], 'base64url').toString('utf8')
  } catch {
    throw new SocialError('invalid-argument', 'A valid deck cursor is required.')
  }
  if (!Number.isSafeInteger(updatedAt) || updatedAt < 0 || !FIREBASE_KEY_PATTERN.test(id) || encodePlayerDeckCursor({ updatedAt, id }) !== value) {
    throw new SocialError('invalid-argument', 'A valid deck cursor is required.')
  }
  return { updatedAt, id }
}

function compareDecks(left: PublicOnlineDeckProjection, right: PublicOnlineDeckProjection): number {
  return right.updatedAt - left.updatedAt || left.id.localeCompare(right.id)
}

function isAfterCursor(deck: PublicOnlineDeckProjection, cursor: PlayerDeckCursor): boolean {
  return deck.updatedAt < cursor.updatedAt || (deck.updatedAt === cursor.updatedAt && deck.id.localeCompare(cursor.id) > 0)
}

function projectOwnerDecks(
  snapshot: DataSnapshot,
  targetUid: string,
  targetAccount: unknown,
  expectedPrivacyVersion: string,
): PublicOnlineDeckProjection[] {
  const items: PublicOnlineDeckProjection[] = []
  snapshot.forEach((child) => {
    if (!child.key) return
    const record = child.val()
    const head = isPlainRecord(record) ? record.head : null
    const projection = buildPublicOnlineDeckProjection(head, child.key, targetAccount, expectedPrivacyVersion)
    if (projection?.ownerId === targetUid) items.push(projection)
  })
  return items.sort(compareDecks)
}

async function requireVisibleTarget(
  database: Database,
  actorUid: string,
  targetUid: string,
  expectedPrivacyVersion: string,
): Promise<unknown> {
  const [targetSnapshot, blocked] = await Promise.all([
    database.ref(`accounts/${targetUid}`).get(),
    readBlockState(database, actorUid, targetUid),
  ])
  const targetAccount = targetSnapshot.val()
  if (!readEligibleAccount(targetAccount, targetUid, expectedPrivacyVersion)?.preferences.discoverable || blocked) {
    throw new SocialError('not-found', SOCIAL_UNAVAILABLE_MESSAGE)
  }
  return targetAccount
}

function sameProjection(left: PublicOnlineDeckProjection, right: PublicOnlineDeckProjection): boolean {
  return left.id === right.id && left.ownerId === right.ownerId &&
    left.ownerNickname === right.ownerNickname && left.ownerNicknameCanonical === right.ownerNicknameCanonical &&
    left.title === right.title && left.titleCanonical === right.titleCanonical &&
    left.description === right.description && left.cardCount === right.cardCount &&
    left.latestVersion === right.latestVersion && left.updatedAt === right.updatedAt
}

async function revalidatePageCandidates(
  database: Database,
  candidates: PublicOnlineDeckProjection[],
  targetUid: string,
  targetAccount: unknown,
  expectedPrivacyVersion: string,
): Promise<PublicOnlineDeckProjection[]> {
  const selected: PublicOnlineDeckProjection[] = []
  let reads = 0
  for (const candidate of candidates) {
    if (reads >= MAX_HEAD_REVALIDATIONS) break
    reads += 1
    const latestHead = (await database.ref(`onlineDecks/${candidate.id}/head`).get()).val()
    const latest = buildPublicOnlineDeckProjection(latestHead, candidate.id, targetAccount, expectedPrivacyVersion)
    if (latest?.ownerId === targetUid) {
      if (!sameProjection(latest, candidate)) {
        throw new SocialError('failed-precondition', 'Player deck listing is unavailable.')
      }
      selected.push(latest)
    }
    if (selected.length > PLAYER_DECK_PAGE_SIZE) break
  }
  if (reads === MAX_HEAD_REVALIDATIONS && selected.length <= PLAYER_DECK_PAGE_SIZE && candidates.length > reads) {
    throw new SocialError('failed-precondition', 'Player deck listing is unavailable.')
  }
  return selected.sort(compareDecks)
}

/**
 * Firebase RTDB supports one orderBy only. This performs an indexed owner query,
 * scans at most 501 canonical owner records, fails closed above 500, then applies
 * exact newest-first (updatedAt, id) keyset pagination in memory.
 */
export async function listPlayerDecksService(
  database: Database,
  actorUid: string,
  targetUid: string,
  expectedPrivacyVersion: string,
  cursorValue?: unknown,
): Promise<PlayerDeckPage> {
  requireTargetUid({ uid: targetUid })
  const cursor = parsePlayerDeckCursor(cursorValue)
  await requireCurrentCaller(database, actorUid, expectedPrivacyVersion)
  const targetAccount = await requireVisibleTarget(database, actorUid, targetUid, expectedPrivacyVersion)
  const snapshot = await database.ref('onlineDecks')
    .orderByChild('head/ownerId')
    .equalTo(targetUid)
    .limitToFirst(OWNER_QUERY_LIMIT)
    .get()
  if (snapshot.numChildren() > PLAYER_DECK_MAX_OWNER_RECORDS) {
    throw new SocialError('failed-precondition', 'Player deck listing is unavailable.')
  }

  const projected = projectOwnerDecks(snapshot, targetUid, targetAccount, expectedPrivacyVersion)
  const eligible = cursor ? projected.filter((deck) => isAfterCursor(deck, cursor)) : projected

  const latestTargetAccount = await requireVisibleTarget(database, actorUid, targetUid, expectedPrivacyVersion)
  const revalidated = await revalidatePageCandidates(
    database,
    eligible,
    targetUid,
    latestTargetAccount,
    expectedPrivacyVersion,
  )
  const pageItems = revalidated.slice(0, PLAYER_DECK_PAGE_SIZE)
  const hasMore = revalidated.length > PLAYER_DECK_PAGE_SIZE

  // Recheck both principals and blocks after the exact head reads, immediately
  // before serializing metadata to the response.
  await Promise.all([
    requireCurrentCaller(database, actorUid, expectedPrivacyVersion),
    requireVisibleTarget(database, actorUid, targetUid, expectedPrivacyVersion),
  ])

  const last = pageItems.at(-1)
  return {
    items: pageItems,
    hasMore,
    ...(hasMore && last ? { nextCursor: encodePlayerDeckCursor({ updatedAt: last.updatedAt, id: last.id }) } : {}),
  }
}
