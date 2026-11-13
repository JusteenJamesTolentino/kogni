import type { CoreDatabase } from './database-core'
import { requireCurrentCaller, SocialError } from './social-core'
import { encodePlayerDeckCursor, parsePlayerDeckCursor } from './player-decks-core'
import { isPlainRecord } from './projections'

interface OwnerDeckHead {
  id: string
  ownerId: string
  visibility: 'private' | 'unlisted' | 'public'
  status: 'active' | 'archived' | 'deleted'
  latestVersion: number
  title: string
  description: string
  cardCount: number
  offlinePolicy: { allowed: boolean; maxQuestions: number }
  createdAt: number
  updatedAt: number
  seriesId?: string
  partNumber?: number
  archivedAt?: number
  deletedAt?: number
}

const MAX_OWNER_DECKS = 500
const PAGE_SIZE = 20

function isOwnerDeckHead(value: unknown): value is OwnerDeckHead {
  return isPlainRecord(value) && typeof value.id === 'string' && typeof value.ownerId === 'string' &&
    (value.visibility === 'private' || value.visibility === 'unlisted' || value.visibility === 'public') &&
    (value.status === 'active' || value.status === 'archived' || value.status === 'deleted') &&
    Number.isSafeInteger(value.latestVersion) && typeof value.latestVersion === 'number' && value.latestVersion >= 1 &&
    typeof value.title === 'string' && typeof value.description === 'string' &&
    Number.isSafeInteger(value.cardCount) && typeof value.cardCount === 'number' && value.cardCount >= 1 && value.cardCount <= 500 &&
    isPlainRecord(value.offlinePolicy) && typeof value.offlinePolicy.allowed === 'boolean' &&
    Number.isSafeInteger(value.offlinePolicy.maxQuestions) && typeof value.offlinePolicy.maxQuestions === 'number' &&
    typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) && value.createdAt >= 0 &&
    typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) && value.updatedAt >= 0 &&
    ((value.seriesId === undefined && value.partNumber === undefined) ||
      (typeof value.seriesId === 'string' && Number.isSafeInteger(value.partNumber) && typeof value.partNumber === 'number' && value.partNumber >= 1))
}

/** Canonical owner-only metadata; public discoverability is deliberately irrelevant. */
export interface OwnerDeckPage {
  items: OwnerDeckHead[]
  hasMore: boolean
  nextCursor?: string
}

export async function listOwnerDecksService(database: CoreDatabase, uid: string, privacyVersion: string, cursorValue?: unknown): Promise<OwnerDeckPage> {
  await requireCurrentCaller(database, uid, privacyVersion)
  const cursor = parsePlayerDeckCursor(cursorValue)
  const snapshot = await database.ref('onlineDecks').orderByChild('head/ownerId').equalTo(uid).limitToFirst(MAX_OWNER_DECKS + 1).get()
  if (snapshot.numChildren() > MAX_OWNER_DECKS) throw new SocialError('failed-precondition', 'Your library exceeds the supported listing limit.')
  const heads: OwnerDeckHead[] = []
  snapshot.forEach((child) => {
    const record: unknown = child.val()
    const head = isPlainRecord(record) ? record.head : null
    if (!isPlainRecord(head) || head.ownerId !== uid) return
    if (!isOwnerDeckHead(head) || head.id !== child.key) {
      throw new SocialError('failed-precondition', 'Your library contains invalid metadata.')
    }
    if (head.status === 'active') heads.push(head)
  })
  heads.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
  const eligible = cursor ? heads.filter((head) => head.updatedAt < cursor.updatedAt || (head.updatedAt === cursor.updatedAt && head.id.localeCompare(cursor.id) > 0)) : heads
  const items = eligible.slice(0, PAGE_SIZE)
  await requireCurrentCaller(database, uid, privacyVersion)
  const last = items.at(-1)
  const hasMore = eligible.length > PAGE_SIZE
  return { items, hasMore, ...(hasMore && last ? { nextCursor: encodePlayerDeckCursor(last) } : {}) }
}
