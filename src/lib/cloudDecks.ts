import type { User } from 'firebase/auth'
import { onValue, ref } from 'firebase/database'
import { auth, database } from './firebase'
import { getErrorMessage, isRecord } from './errors'
import { authenticatedRequest } from './vercel-api'
import { createOnlineDeck, getOnlineDeckHead, getOnlineDeckVersion, isOnlineDeckHead } from './onlineDecks'
import { getOnlineDeckSchedules, getOnlineSchedules, recordOnlineReview, resetScheduleForChangedContent } from './onlineSchedules'
import { calculateSm2 } from './sm2'
import type { CardSchedule, OnlineCardScheduleState, OnlineDeckHead, OnlineDeckVersion, StudyCard, StudyDeck } from '../types/domain'

export function newCloudDeckId(): string { return `deck_${crypto.randomUUID()}` }

export async function withCloudDeadline<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('The cloud request timed out. It may still finish; retry to check its status.')), 20_000)
    })])
  } finally { clearTimeout(timer) }
}

function requireCurrentUser(user: User): void {
  if (auth.currentUser?.uid !== user.uid) throw new Error('Your account changed. Reload before continuing.')
}

async function requireConnection(user: User): Promise<void> {
  requireCurrentUser(user)
  await withCloudDeadline(new Promise<void>((resolve, reject) => {
    let unsubscribe: (() => void) | undefined
    const timer = setTimeout(() => { unsubscribe?.(); reject(new Error('Connect to the internet to save or review decks.')) }, 5_000)
    unsubscribe = onValue(ref(database, '.info/connected'), (snapshot) => {
      if (snapshot.val() === true) { clearTimeout(timer); unsubscribe?.(); resolve() }
    }, (error) => { clearTimeout(timer); unsubscribe?.(); reject(error) })
  }))
  requireCurrentUser(user)
}

export function describeCloudError(error: unknown, fallback: string): string {
  const code = isRecord(error) && typeof error.code === 'string' ? error.code.toLowerCase() : ''
  if (code.includes('permission') || code.includes('denied')) return 'You do not have access to this deck, or the server rejected this operation.'
  return getErrorMessage(error, fallback)
}

export function cloudStudyDeck(head: OnlineDeckHead, version?: OnlineDeckVersion): StudyDeck {
  return { id: head.id, ownerId: head.ownerId, title: version?.title ?? head.title, description: version?.description ?? head.description, cardCount: head.cardCount, createdAt: head.createdAt, ...(version?.studyGuide ? { studyGuide: version.studyGuide } : {}) }
}

export function cloudStudyCards(user: User, head: OnlineDeckHead, version: OnlineDeckVersion, schedules: Record<string, OnlineCardScheduleState>, now = Date.now()): StudyCard[] {
  return Object.values(version.cards).sort((a, b) => a.order - b.order).map((card) => {
    const state = resetScheduleForChangedContent(schedules[card.id], { deckId: head.id, cardId: card.id, deckVersion: version.version, contentRevision: card.contentRevision, now })
    return { id: card.id, deckId: head.id, ownerId: user.uid, order: card.order, question: card.question, answer: card.answer, distractors: card.distractors ?? [], interval: state.interval, repetition: state.repetition, easinessFactor: state.easinessFactor, nextReviewDate: state.nextReviewDate }
  })
}

export async function loadCloudDeck(user: User, deckId: string) {
  requireCurrentUser(user)
  const head = await withCloudDeadline(getOnlineDeckHead(deckId))
  if (!head || head.status !== 'active') throw new Error('This deck no longer exists or is not active.')
  const [version, schedules] = await withCloudDeadline(Promise.all([getOnlineDeckVersion(deckId, head.latestVersion), getOnlineDeckSchedules(user, deckId)]))
  requireCurrentUser(user)
  if (!version || version.ownerId !== head.ownerId) throw new Error('The saved deck version is missing or invalid.')
  return { head, version, schedules, deck: cloudStudyDeck(head, version), cards: cloudStudyCards(user, head, version, schedules) }
}

interface OwnerPage { items: OnlineDeckHead[]; hasMore: boolean; nextCursor?: string }
function isOwnerPage(value: unknown): value is OwnerPage {
  return isRecord(value) && Array.isArray(value.items) && value.items.every(isOnlineDeckHead) && typeof value.hasMore === 'boolean' && (!value.hasMore || typeof value.nextCursor === 'string')
}

export async function loadCloudLibrary(user: User, options: { signal?: AbortSignal } = {}) {
  requireCurrentUser(user)
  const heads: OnlineDeckHead[] = []
  let cursor: string | undefined
  const seen = new Set<string>()
  do {
    const page: OwnerPage = await authenticatedRequest(`/api/decks${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, isOwnerPage, options)
    for (const head of page.items) {
      if (head.ownerId !== user.uid || head.status !== 'active' || seen.has(head.id)) throw new Error('The cloud library response is invalid. Refresh it.')
      seen.add(head.id); heads.push(head)
    }
    if (heads.length > 500 || (page.hasMore && page.nextCursor === cursor)) throw new Error('The cloud library response is invalid.')
    cursor = page.hasMore ? page.nextCursor : undefined
  } while (cursor)
  const schedules = await withCloudDeadline(getOnlineSchedules(user))
  const dueCards: StudyCard[] = []
  const now = Date.now()
  // Limit concurrent version reads rather than firing hundreds of requests at once.
  for (let offset = 0; offset < heads.length; offset += 8) {
    options.signal?.throwIfAborted()
    const batch = await withCloudDeadline(Promise.all(heads.slice(offset, offset + 8).map(async (head) => {
      const version = await getOnlineDeckVersion(head.id, head.latestVersion)
      if (!version || version.ownerId !== head.ownerId) throw new Error('A deck version is missing or invalid. Refresh your library.')
      return cloudStudyCards(user, head, version, schedules[head.id] ?? {}, now).filter((card) => card.nextReviewDate <= now)
    })))
    dueCards.push(...batch.flat())
  }
  requireCurrentUser(user)
  options.signal?.throwIfAborted()
  return { decks: heads.map((head) => cloudStudyDeck(head)), dueCards }
}

export interface PrivateDeckContent {
  title?: string; description?: string; studyGuide?: string
  cards: Array<{ id?: string; question?: string; answer?: string; distractors?: string[] }>
}

function validatePrivateContent(content: PrivateDeckContent): void {
  if (!content.title?.trim() || content.title.length > 160 || (content.description?.length ?? 0) > 2000 || (content.studyGuide?.length ?? 0) > 8000) throw new Error('Deck metadata exceeds the cloud limits. Edit it before saving; no content was removed.')
  if (!content.cards.length || content.cards.length > 500) throw new Error('Cloud decks must contain 1–500 cards.')
  if (content.cards.some((card) => !card.question?.trim() || !card.answer?.trim() || card.question.length > 10000 || card.answer.length > 10000 || (card.distractors?.length ?? 0) > 10 || card.distractors?.some((item) => item.length > 10000))) throw new Error('A card is empty or exceeds the cloud limits. Edit it before saving.')
}

export async function createPrivateDeck(user: User, content: PrivateDeckContent, deckId = newCloudDeckId()): Promise<StudyDeck> {
  validatePrivateContent(content)
  await requireConnection(user)
  const existing = await withCloudDeadline(getOnlineDeckHead(deckId))
  if (existing) {
    if (existing.ownerId !== user.uid || existing.status !== 'active') throw new Error('This deck ID is unavailable.')
    // A retry checks the already-confirmed write rather than overwriting its versions.
    const version = await withCloudDeadline(getOnlineDeckVersion(deckId, existing.latestVersion))
    if (!version) throw new Error('The previous save cannot be verified.')
    const cards = Object.values(version.cards).sort((a, b) => a.order - b.order)
    if (version.title !== content.title?.trim() || version.description !== (content.description ?? '').trim() || (version.studyGuide ?? '') !== (content.studyGuide ?? '').trim() || cards.length !== content.cards.length || cards.some((card, index) => card.question !== content.cards[index].question?.trim() || card.answer !== content.cards[index].answer?.trim() || JSON.stringify(card.distractors ?? []) !== JSON.stringify(content.cards[index].distractors ?? []))) {
      throw new Error('A previous save already exists with different content. Open it from your library before editing.')
    }
    return cloudStudyDeck(existing, version)
  }
  const record = await withCloudDeadline(createOnlineDeck(user, { deckId, expectedBaseVersion: 0, visibility: 'private', offlinePolicy: { allowed: false, maxQuestions: 0 }, ...content, title: content.title, cards: content.cards.map((card, index) => ({ id: `card_${index}`, question: card.question, answer: card.answer, distractors: card.distractors })) }))
  requireCurrentUser(user)
  return cloudStudyDeck(record.head, record.versions?.['1'])
}

export async function copyPrivateDeck(user: User, content: PrivateDeckContent, sourceKey: string): Promise<StudyDeck> {
  const bytes = new TextEncoder().encode(`${user.uid}\n${sourceKey}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const id = `copy_${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
  return createPrivateDeck(user, content, id)
}

/** Each session keeps one event ID per card so an uncertain response can be retried safely. */
export function createCloudReviewSaver(user: User, loaded: Array<Awaited<ReturnType<typeof loadCloudDeck>>>) {
  const states = new Map<string, OnlineCardScheduleState>()
  const versions = new Map(loaded.map((item) => [item.head.id, item.version]))
  const activeEvents = new Map<string, { eventId: string; quality: number; reviewedAt: number; progress: CardSchedule; expected: number }>()
  const appliedEvents = new Map<string, { eventId: string; quality: number }>()
  for (const item of loaded) for (const card of item.cards) {
    states.set(`${card.deckId}/${card.id}`, resetScheduleForChangedContent(item.schedules[card.id], { deckId: card.deckId, cardId: card.id, deckVersion: item.version.version, contentRevision: item.version.cards[card.id].contentRevision, now: card.nextReviewDate }))
  }
  return async (card: StudyCard, quality: number): Promise<void> => {
    await requireConnection(user)
    const key = `${card.deckId}/${card.id}`
    const version = versions.get(card.deckId)
    const state = states.get(key)
    if (!version || !state) throw new Error('The session lost its deck version. Start it again.')
    const applied = appliedEvents.get(key)
    if (applied?.quality === quality) return
    let event = activeEvents.get(key)
    if (event && event.quality !== quality) throw new Error('Retry the same rating to confirm the pending review.')
    if (!event) {
      const reviewedAt = Date.now()
      event = { eventId: `review_${crypto.randomUUID()}`, quality, reviewedAt, progress: calculateSm2(state, quality, reviewedAt), expected: state.scheduleRevision }
      activeEvents.set(key, event)
    }
    const head = await withCloudDeadline(getOnlineDeckHead(card.deckId))
    if (!head || head.status !== 'active') throw new Error('This deck is no longer available for review.')
    const result = await withCloudDeadline(recordOnlineReview(user, { ...event.progress, eventId: event.eventId, deckId: card.deckId, cardId: card.id, deckVersion: version.version, contentRevision: state.contentRevision, expectedScheduleRevision: event.expected, rating: quality, reviewedAt: event.reviewedAt }))
    requireCurrentUser(user)
    states.set(key, result.state)
    activeEvents.delete(key)
    appliedEvents.set(key, { eventId: event.eventId, quality })
  }
}
