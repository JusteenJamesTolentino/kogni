import { openDB } from 'idb'
import { assertNonEmptyString, assertRecord } from './errors'
import { hasCompleteStudyGuideCoverage, STUDY_GUIDE_COVERAGE } from './studyGuideCoverage'
import type {
  KognitDB,
  LocalOfflineSnapshotRecord,
  OnlineDeckOfflineSnapshot,
  StudyCard,
  StudyDeck,
  StudyDeckWithCards,
} from '../types/domain'

const DB_NAME = 'FlashcardAppDB'
const DB_VERSION = 2
const DECKS_STORE = 'decks'
const CARDS_STORE = 'cards'
const OFFLINE_SNAPSHOTS_STORE = 'offlineSnapshots'
const MIGRATION_STATE_STORE = 'migrationState'
let currentUserId = ''
const dbPromise = createDatabasePromise()

function createDatabasePromise() {
  return openDB<KognitDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(DECKS_STORE)) {
        const decks = db.createObjectStore(DECKS_STORE, { keyPath: 'id' })
        decks.createIndex('createdAt', 'createdAt')
      }

      if (!db.objectStoreNames.contains(CARDS_STORE)) {
        const cards = db.createObjectStore(CARDS_STORE, { keyPath: 'id' })
        cards.createIndex('deckId', 'deckId')
        cards.createIndex('nextReviewDate', 'nextReviewDate')
      }

      if (!db.objectStoreNames.contains(OFFLINE_SNAPSHOTS_STORE)) {
        const snapshots = db.createObjectStore(OFFLINE_SNAPSHOTS_STORE, { keyPath: 'id' })
        snapshots.createIndex('ownerId', 'ownerId')
        snapshots.createIndex('sourceDeckId', 'sourceDeckId')
      }

      if (!db.objectStoreNames.contains(MIGRATION_STATE_STORE)) {
        db.createObjectStore(MIGRATION_STATE_STORE, { keyPath: 'id' })
      }
    },
  })
}

export function setDatabaseUser(userId: unknown): void {
  currentUserId = typeof userId === 'string' ? userId : ''
}

function requireCurrentUser(): string {
  if (!currentUserId) throw new Error('An authenticated user is required for local data')
  return currentUserId
}

function randomId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  return `${prefix}_${random}`
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function optionalId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized ? normalized.slice(0, 200) : undefined
}

function normalizeDistractors(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
}

function normalizeCardContent(value: Record<string, unknown>): Pick<StudyCard, 'question' | 'answer' | 'distractors'> {
  return {
    question: String(value.question || '').trim(),
    answer: String(value.answer || '').trim(),
    distractors: normalizeDistractors(value.distractors),
  }
}

function canonicalCardContent(value: Pick<StudyCard, 'question' | 'answer' | 'distractors'>): string {
  const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
  return JSON.stringify([
    normalize(value.question),
    normalize(value.answer),
    value.distractors.map(normalize),
  ])
}

function assertNoDuplicateCardContent(
  cards: Array<Pick<StudyCard, 'question' | 'answer' | 'distractors'>>,
): void {
  const canonical = new Set<string>()
  for (const card of cards) {
    const key = canonicalCardContent(card)
    if (canonical.has(key)) throw new TypeError('cardsData contains duplicate card content')
    canonical.add(key)
  }
}

function compareCardsByOrder(left: StudyCard, right: StudyCard): number {
  const leftOrder = Number.isSafeInteger(left.order) ? left.order as number : Number.MAX_SAFE_INTEGER
  const rightOrder = Number.isSafeInteger(right.order) ? right.order as number : Number.MAX_SAFE_INTEGER
  return leftOrder - rightOrder || left.id.localeCompare(right.id)
}

function assertTimestamp(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative finite timestamp`)
  }
}

export interface SaveDeckCopyOptions {
  lineageId?: unknown
  createdAt?: unknown
}

export interface LocalDeckMetadataUpdate {
  title?: unknown
  description?: unknown
  studyGuide?: unknown
}

export interface LocalCardContentUpdate {
  question?: unknown
  answer?: unknown
  distractors?: unknown
}

export interface ForkLocalDeckOptions extends LocalDeckMetadataUpdate {
  createdAt?: unknown
}

export async function saveDeckWithCards(
  deckData: unknown,
  cardsData: unknown,
): Promise<StudyDeckWithCards> {
  assertRecord(deckData, 'deckData')
  if (!Array.isArray(cardsData) || cardsData.length === 0) {
    throw new TypeError('cardsData must be a non-empty array')
  }

  const ownerId = requireCurrentUser()
  const createdAt = finiteNumber(deckData.createdAt, Date.now())
  const deckId = typeof deckData.id === 'string' && deckData.id ? deckData.id : randomId('deck')
  const lineageId = optionalId(deckData.lineageId)
  const deck: StudyDeck = {
    id: deckId,
    ownerId,
    ...(lineageId ? { lineageId } : {}),
    title: String(deckData.title || 'Untitled deck').trim(),
    description: String(deckData.description || '').trim(),
    ...(typeof deckData.studyGuide === 'string' && deckData.studyGuide.trim()
      ? { studyGuide: deckData.studyGuide.trim().slice(0, 8000) }
      : {}),
    cardCount: cardsData.length,
    createdAt,
  }

  const cards: StudyCard[] = cardsData.map((card: unknown, index) => {
    assertRecord(card, 'card')
    return {
      id: typeof card.id === 'string' && card.id ? card.id : randomId('card'),
      deckId: deck.id,
      ownerId,
      order: index,
      ...normalizeCardContent(card),
      interval: finiteNumber(card.interval, 0),
      repetition: finiteNumber(card.repetition, 0),
      easinessFactor: finiteNumber(card.easinessFactor, 2.5),
      nextReviewDate: finiteNumber(card.nextReviewDate, createdAt),
    }
  })
  const cardIds = new Set(cards.map((card) => card.id))
  if (cardIds.size !== cards.length) throw new TypeError('cardsData contains duplicate card ids')
  const covered = typeof deck.studyGuide === 'string' && hasCompleteStudyGuideCoverage(deck.studyGuide, cards)
  if (deckData.studyGuideCoverage === STUDY_GUIDE_COVERAGE && !covered) {
    throw new Error('Study guide verification failed for one or more card answers')
  }
  if (covered) deck.studyGuideCoverage = STUDY_GUIDE_COVERAGE

  const db = await dbPromise
  const tx = db.transaction([DECKS_STORE, CARDS_STORE], 'readwrite')
  const deckStore = tx.objectStore(DECKS_STORE)
  const cardStore = tx.objectStore(CARDS_STORE)
  if (await deckStore.get(deck.id)) {
    throw new Error(`Deck id collision: ${deck.id}`)
  }
  for (const card of cards) {
    if (await cardStore.get(card.id)) {
      throw new Error(`Card id collision: ${card.id}`)
    }
  }
  await deckStore.add(deck)
  await Promise.all(cards.map((card) => cardStore.add(card)))
  await tx.done

  return { ...deck, cards }
}

/**
 * Saves an independent local copy of a deck. Source IDs, ownership, and review
 * schedules are intentionally ignored; lineage is the only shared identity.
 */
export async function saveDeckCopy(
  deckData: unknown,
  cardsData: unknown,
  options: SaveDeckCopyOptions = {},
): Promise<StudyDeckWithCards> {
  assertRecord(deckData, 'deckData')
  if (!Array.isArray(cardsData) || cardsData.length === 0) {
    throw new TypeError('cardsData must be a non-empty array')
  }

  const sourceDeckId = optionalId(deckData.id)
  const lineageId = optionalId(options.lineageId) ?? optionalId(deckData.lineageId) ?? sourceDeckId
  if (!lineageId) throw new TypeError('A lineageId or source deck id is required')

  const createdAt = finiteNumber(options.createdAt, Date.now())
  const copyDeck = {
    title: String(deckData.title || 'Untitled deck').trim(),
    description: String(deckData.description || '').trim(),
    ...(typeof deckData.studyGuide === 'string' && deckData.studyGuide.trim()
      ? { studyGuide: deckData.studyGuide.trim().slice(0, 8000) }
      : {}),
    ...(deckData.studyGuideCoverage === STUDY_GUIDE_COVERAGE
      ? { studyGuideCoverage: STUDY_GUIDE_COVERAGE }
      : {}),
    lineageId,
    createdAt,
  }
  const copyCards = cardsData.map((card: unknown) => {
    assertRecord(card, 'card')
    return {
      ...normalizeCardContent(card),
      interval: 0,
      repetition: 0,
      easinessFactor: 2.5,
      nextReviewDate: createdAt,
    }
  })

  return saveDeckWithCards(copyDeck, copyCards)
}

export async function saveOnlineDeckOfflineSnapshot(
  snapshot: OnlineDeckOfflineSnapshot,
): Promise<StudyDeckWithCards> {
  const ownerId = requireCurrentUser()
  if (snapshot.provenance.savedByUid !== ownerId) {
    throw new Error('Offline snapshot saver does not match the authenticated user')
  }
  const saved = await saveDeckCopy(
    {
      id: `${snapshot.provenance.deckId}-v${snapshot.provenance.version}`,
      lineageId: snapshot.provenance.deckId,
      title: snapshot.title,
      description: snapshot.description,
      studyGuide: snapshot.studyGuide,
    },
    snapshot.cards,
    { lineageId: snapshot.provenance.deckId, createdAt: snapshot.provenance.savedAt },
  )
  const record: LocalOfflineSnapshotRecord = {
    id: saved.id,
    ownerId,
    sourceDeckId: snapshot.provenance.deckId,
    sourceOwnerId: snapshot.provenance.ownerId,
    sourceVersion: snapshot.provenance.version,
    sourceCardCount: snapshot.provenance.creatorMaxQuestions,
    includedCardCount: snapshot.provenance.selectedQuestionCount,
    questionLimit: snapshot.provenance.saverQuestionLimit,
    selectedSourceCardIds: snapshot.cards.map((card) => card.id),
    savedAt: snapshot.provenance.savedAt,
  }
  const db = await dbPromise
  await db.put(OFFLINE_SNAPSHOTS_STORE, record)
  return saved
}

export async function getOfflineSnapshotRecord(deckId: string): Promise<LocalOfflineSnapshotRecord | undefined> {
  const ownerId = requireCurrentUser()
  const db = await dbPromise
  const record = await db.get(OFFLINE_SNAPSHOTS_STORE, deckId)
  return record?.ownerId === ownerId ? record : undefined
}

export async function getAllDecks(): Promise<StudyDeck[]> {
  const ownerId = requireCurrentUser()
  const db = await dbPromise
  const decks = await db.getAll(DECKS_STORE)
  return decks
    .filter((deck) => deck.ownerId === ownerId)
    .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
}

export async function getDeck(id: unknown): Promise<StudyDeck | undefined> {
  assertNonEmptyString(id, 'id')
  const ownerId = requireCurrentUser()
  const db = await dbPromise
  const deck = await db.get(DECKS_STORE, id)
  return deck?.ownerId === ownerId ? deck : undefined
}

export async function getCardsByDeck(deckId: unknown): Promise<StudyCard[]> {
  assertNonEmptyString(deckId, 'deckId')
  const ownerId = requireCurrentUser()
  const db = await dbPromise
  const cards = await db.getAllFromIndex(CARDS_STORE, 'deckId', deckId)
  return cards.filter((card) => card.ownerId === ownerId).sort(compareCardsByOrder)
}

export async function getDueCards(deckId?: unknown): Promise<StudyCard[]> {
  if (deckId !== undefined) assertNonEmptyString(deckId, 'deckId')
  const ownerId = requireCurrentUser()

  const db = await dbPromise
  const dueCards = await db.getAllFromIndex(
    CARDS_STORE,
    'nextReviewDate',
    IDBKeyRange.upperBound(Date.now()),
  )

  return dueCards
    .filter((card) => card.ownerId === ownerId && (!deckId || card.deckId === deckId))
    .sort(compareCardsByOrder)
}

export async function updateLocalDeckMetadata(
  deckId: unknown,
  updates: LocalDeckMetadataUpdate,
): Promise<StudyDeck> {
  assertNonEmptyString(deckId, 'deckId')
  assertRecord(updates, 'updates')
  const ownerId = requireCurrentUser()
  const db = await dbPromise
  const tx = db.transaction(DECKS_STORE, 'readwrite')
  const store = tx.objectStore(DECKS_STORE)
  const existing = await store.get(deckId)
  if (!existing || existing.ownerId !== ownerId) {
    throw new Error(`Deck not found: ${deckId}`)
  }

  const updated: StudyDeck = { ...existing }
  if ('title' in updates) {
    if (typeof updates.title !== 'string' || !updates.title.trim()) {
      throw new TypeError('updates.title must be a non-empty string')
    }
    updated.title = updates.title.trim().slice(0, 500)
  }
  if ('description' in updates) {
    if (typeof updates.description !== 'string') {
      throw new TypeError('updates.description must be a string')
    }
    updated.description = updates.description.trim().slice(0, 4000)
  }
  if ('studyGuide' in updates) {
    if (updates.studyGuide == null || updates.studyGuide === '') delete updated.studyGuide
    else if (typeof updates.studyGuide === 'string') updated.studyGuide = updates.studyGuide.trim().slice(0, 8000)
    else {
      throw new TypeError('updates.studyGuide must be a string, null, or undefined')
    }
  }

  await store.put(updated)
  await tx.done
  return updated
}

export async function updateLocalCardContent(
  cardId: unknown,
  updates: LocalCardContentUpdate,
  changedAt: number = Date.now(),
): Promise<StudyCard> {
  assertNonEmptyString(cardId, 'cardId')
  assertRecord(updates, 'updates')
  assertTimestamp(changedAt, 'changedAt')
  const ownerId = requireCurrentUser()
  const db = await dbPromise
  const tx = db.transaction([DECKS_STORE, CARDS_STORE], 'readwrite')
  const cardStore = tx.objectStore(CARDS_STORE)
  const existing = await cardStore.get(cardId)
  if (!existing || existing.ownerId !== ownerId) {
    throw new Error(`Card not found: ${cardId}`)
  }
  const deck = await tx.objectStore(DECKS_STORE).get(existing.deckId)
  if (!deck || deck.ownerId !== ownerId) {
    throw new Error(`Deck not found: ${existing.deckId}`)
  }

  const content = {
    question: 'question' in updates ? String(updates.question || '').trim() : existing.question,
    answer: 'answer' in updates ? String(updates.answer || '').trim() : existing.answer,
    distractors: 'distractors' in updates ? normalizeDistractors(updates.distractors) : existing.distractors,
  }
  const changed = canonicalCardContent(content) !== canonicalCardContent(existing)
  const updated: StudyCard = changed
    ? {
        ...existing,
        ...content,
        interval: 0,
        repetition: 0,
        easinessFactor: 2.5,
        nextReviewDate: changedAt,
      }
    : { ...existing, ...content }

  await cardStore.put(updated)
  await tx.done
  return updated
}

export async function addLocalCard(
  deckId: unknown,
  cardData: unknown,
  position?: number,
): Promise<StudyCard> {
  assertNonEmptyString(deckId, 'deckId')
  assertRecord(cardData, 'cardData')
  const ownerId = requireCurrentUser()
  const db = await dbPromise
  const tx = db.transaction([DECKS_STORE, CARDS_STORE], 'readwrite')
  const deckStore = tx.objectStore(DECKS_STORE)
  const cardStore = tx.objectStore(CARDS_STORE)
  const deck = await deckStore.get(deckId)
  if (!deck || deck.ownerId !== ownerId) {
    throw new Error(`Deck not found: ${deckId}`)
  }
  const existingCards = await cardStore.index('deckId').getAll(deckId)
  if (existingCards.some((card) => card.ownerId !== ownerId)) {
    throw new Error(`Deck card ownership conflict: ${deckId}`)
  }

  const requestedPosition = position ?? finiteNumber(cardData.order, existingCards.length)
  if (!Number.isSafeInteger(requestedPosition) || requestedPosition < 0 || requestedPosition > existingCards.length) {
    throw new RangeError('position must be an integer within the deck bounds')
  }
  const id = typeof cardData.id === 'string' && cardData.id ? cardData.id : randomId('card')
  if (await cardStore.get(id)) {
    throw new Error(`Card id collision: ${id}`)
  }
  const content = normalizeCardContent(cardData)
  const existingCanonical = new Set(existingCards.map(canonicalCardContent))
  if (existingCanonical.has(canonicalCardContent(content))) {
    throw new TypeError('cardData duplicates existing card content')
  }
  const createdAt = finiteNumber(cardData.nextReviewDate, Date.now())
  const card: StudyCard = {
    id,
    deckId,
    ownerId,
    order: requestedPosition,
    ...content,
    interval: finiteNumber(cardData.interval, 0),
    repetition: finiteNumber(cardData.repetition, 0),
    easinessFactor: finiteNumber(cardData.easinessFactor, 2.5),
    nextReviewDate: createdAt,
  }

  const reordered = existingCards.sort(compareCardsByOrder)
  reordered.splice(requestedPosition, 0, card)
  await Promise.all(reordered.map((item, order) => cardStore.put({ ...item, order })))
  await deckStore.put({ ...deck, cardCount: reordered.length })
  await tx.done
  return { ...card, order: requestedPosition }
}

export async function deleteLocalCard(cardId: unknown): Promise<void> {
  assertNonEmptyString(cardId, 'cardId')
  const ownerId = requireCurrentUser()
  const db = await dbPromise
  const tx = db.transaction([DECKS_STORE, CARDS_STORE], 'readwrite')
  const deckStore = tx.objectStore(DECKS_STORE)
  const cardStore = tx.objectStore(CARDS_STORE)
  const card = await cardStore.get(cardId)
  if (!card || card.ownerId !== ownerId) {
    throw new Error(`Card not found: ${cardId}`)
  }
  const deck = await deckStore.get(card.deckId)
  if (!deck || deck.ownerId !== ownerId) {
    throw new Error(`Deck not found: ${card.deckId}`)
  }
  const cards = await cardStore.index('deckId').getAll(card.deckId)
  if (cards.some((item) => item.ownerId !== ownerId)) {
    throw new Error(`Deck card ownership conflict: ${card.deckId}`)
  }
  const remaining = cards.filter((item) => item.id !== card.id).sort(compareCardsByOrder)
  await cardStore.delete(card.id)
  await Promise.all(remaining.map((item, order) => cardStore.put({ ...item, order })))
  await deckStore.put({ ...deck, cardCount: remaining.length })
  await tx.done
}

export async function reorderLocalCards(
  deckId: unknown,
  orderedCardIds: readonly string[],
): Promise<StudyCard[]> {
  assertNonEmptyString(deckId, 'deckId')
  if (!Array.isArray(orderedCardIds)) throw new TypeError('orderedCardIds must be an array')
  const ownerId = requireCurrentUser()
  const db = await dbPromise
  const tx = db.transaction([DECKS_STORE, CARDS_STORE], 'readwrite')
  const deck = await tx.objectStore(DECKS_STORE).get(deckId)
  if (!deck || deck.ownerId !== ownerId) {
    throw new Error(`Deck not found: ${deckId}`)
  }
  const cardStore = tx.objectStore(CARDS_STORE)
  const cards = await cardStore.index('deckId').getAll(deckId)
  const ids = new Set(orderedCardIds)
  if (
    ids.size !== orderedCardIds.length ||
    cards.length !== orderedCardIds.length ||
    cards.some((card) => card.ownerId !== ownerId || !ids.has(card.id))
  ) {
    throw new TypeError('orderedCardIds must contain every owned deck card exactly once')
  }
  const byId = new Map(cards.map((card) => [card.id, card]))
  const reordered = orderedCardIds.map((id, order) => ({ ...byId.get(id) as StudyCard, order }))
  await Promise.all(reordered.map((card) => cardStore.put(card)))
  await tx.done
  return reordered
}

export async function forkLocalDeck(
  sourceDeckId: unknown,
  options: ForkLocalDeckOptions = {},
): Promise<StudyDeckWithCards> {
  assertNonEmptyString(sourceDeckId, 'sourceDeckId')
  assertRecord(options, 'options')
  const ownerId = requireCurrentUser()
  const createdAt = finiteNumber(options.createdAt, Date.now())
  const db = await dbPromise
  const tx = db.transaction([DECKS_STORE, CARDS_STORE], 'readwrite')
  const deckStore = tx.objectStore(DECKS_STORE)
  const cardStore = tx.objectStore(CARDS_STORE)
  const source = await deckStore.get(sourceDeckId)
  if (!source || source.ownerId !== ownerId) {
    throw new Error(`Deck not found: ${sourceDeckId}`)
  }
  const sourceCards = (await cardStore.index('deckId').getAll(sourceDeckId)).sort(compareCardsByOrder)
  if (sourceCards.some((card) => card.ownerId !== ownerId)) {
    throw new Error(`Deck card ownership conflict: ${sourceDeckId}`)
  }

  let deckId = randomId('deck')
  while (await deckStore.get(deckId)) deckId = randomId('deck')
  const fork: StudyDeck = {
    ...source,
    id: deckId,
    lineageId: randomId('lineage'),
    title: typeof options.title === 'string' && options.title.trim() ? options.title.trim().slice(0, 500) : source.title,
    description: typeof options.description === 'string' ? options.description.trim().slice(0, 4000) : source.description,
    createdAt,
    cardCount: sourceCards.length,
  }
  if ('studyGuide' in options) {
    if (options.studyGuide == null || options.studyGuide === '') delete fork.studyGuide
    else if (typeof options.studyGuide === 'string') fork.studyGuide = options.studyGuide.trim().slice(0, 8000)
    else {
      throw new TypeError('options.studyGuide must be a string, null, or undefined')
    }
  }

  const forbiddenIds = new Set(sourceCards.map((card) => card.id))
  const cards: StudyCard[] = []
  for (const [order, sourceCard] of sourceCards.entries()) {
    let id = randomId('card')
    while (forbiddenIds.has(id) || await cardStore.get(id)) id = randomId('card')
    forbiddenIds.add(id)
    cards.push({ ...sourceCard, id, deckId, ownerId, order })
  }
  await deckStore.add(fork)
  await Promise.all(cards.map((card) => cardStore.add(card)))
  await tx.done
  return { ...fork, cards }
}

export async function deleteLocalDeck(deckId: unknown): Promise<void> {
  assertNonEmptyString(deckId, 'deckId')
  const ownerId = requireCurrentUser()
  const db = await dbPromise
  const tx = db.transaction([DECKS_STORE, CARDS_STORE, OFFLINE_SNAPSHOTS_STORE], 'readwrite')
  const deckStore = tx.objectStore(DECKS_STORE)
  const cardStore = tx.objectStore(CARDS_STORE)
  const snapshotStore = tx.objectStore(OFFLINE_SNAPSHOTS_STORE)
  const deck = await deckStore.get(deckId)
  if (!deck || deck.ownerId !== ownerId) {
    throw new Error(`Deck not found: ${deckId}`)
  }
  const cards = await cardStore.index('deckId').getAll(deckId)
  if (cards.some((card) => card.ownerId !== ownerId)) {
    throw new Error(`Deck card ownership conflict: ${deckId}`)
  }
  const snapshot = await snapshotStore.get(deckId)
  if (snapshot && snapshot.ownerId !== ownerId) {
    throw new Error(`Offline snapshot ownership conflict: ${deckId}`)
  }
  await Promise.all(cards.map((card) => cardStore.delete(card.id)))
  if (snapshot) await snapshotStore.delete(deckId)
  await deckStore.delete(deckId)
  await tx.done
}

export async function replaceLocalDeckCards(
  deckId: unknown,
  cardsData: unknown,
  replacedAt: number = Date.now(),
): Promise<StudyCard[]> {
  assertNonEmptyString(deckId, 'deckId')
  if (!Array.isArray(cardsData)) throw new TypeError('cardsData must be an array')
  assertTimestamp(replacedAt, 'replacedAt')
  const ownerId = requireCurrentUser()
  const contents = cardsData.map((card: unknown) => {
    assertRecord(card, 'card')
    return normalizeCardContent(card)
  })
  assertNoDuplicateCardContent(contents)

  const db = await dbPromise
  const tx = db.transaction([DECKS_STORE, CARDS_STORE], 'readwrite')
  const deckStore = tx.objectStore(DECKS_STORE)
  const cardStore = tx.objectStore(CARDS_STORE)
  const deck = await deckStore.get(deckId)
  if (!deck || deck.ownerId !== ownerId) {
    throw new Error(`Deck not found: ${deckId}`)
  }
  const oldCards = await cardStore.index('deckId').getAll(deckId)
  if (oldCards.some((card) => card.ownerId !== ownerId)) {
    throw new Error(`Deck card ownership conflict: ${deckId}`)
  }
  const forbiddenIds = new Set(oldCards.map((card) => card.id))
  const cards: StudyCard[] = []
  for (const [order, content] of contents.entries()) {
    let id = randomId('card')
    while (forbiddenIds.has(id) || await cardStore.get(id)) id = randomId('card')
    forbiddenIds.add(id)
    cards.push({
      id,
      deckId,
      ownerId,
      order,
      ...content,
      interval: 0,
      repetition: 0,
      easinessFactor: 2.5,
      nextReviewDate: replacedAt,
    })
  }
  await Promise.all(oldCards.map((card) => cardStore.delete(card.id)))
  await Promise.all(cards.map((card) => cardStore.add(card)))
  await deckStore.put({ ...deck, cardCount: cards.length })
  await tx.done
  return cards
}

export interface ScheduledCardProgress {
  interval: unknown
  repetition: unknown
  easinessFactor: unknown
  nextReviewDate: unknown
}

export async function recordCardScheduledReview(
  cardId: unknown,
  schedule: ScheduledCardProgress,
  reviewedAt: number = Date.now(),
): Promise<StudyCard> {
  assertNonEmptyString(cardId, 'cardId')
  assertRecord(schedule, 'schedule')
  assertTimestamp(reviewedAt, 'reviewedAt')

  const ownerId = requireCurrentUser()
  const db = await dbPromise
  const tx = db.transaction(CARDS_STORE, 'readwrite')
  const store = tx.objectStore(CARDS_STORE)
  const existing = await store.get(cardId)
  if (!existing || existing.ownerId !== ownerId) {
    throw new Error(`Card not found: ${cardId}`)
  }
  if (!Number.isFinite(existing.nextReviewDate) || existing.nextReviewDate > reviewedAt) {
    throw new Error(`Card is not due: ${cardId}`)
  }

  const interval = finiteNumber(schedule.interval, Number.NaN)
  const repetition = finiteNumber(schedule.repetition, Number.NaN)
  const easinessFactor = finiteNumber(schedule.easinessFactor, Number.NaN)
  const nextReviewDate = finiteNumber(schedule.nextReviewDate, Number.NaN)
  if (
    !Number.isFinite(interval) || interval < 0 ||
    !Number.isSafeInteger(repetition) || repetition < 0 ||
    !Number.isFinite(easinessFactor) || easinessFactor < 1.3 ||
    !Number.isFinite(nextReviewDate) || nextReviewDate < reviewedAt
  ) {
    throw new TypeError('schedule contains invalid review values')
  }

  const updated: StudyCard = {
    ...existing,
    interval,
    repetition,
    easinessFactor,
    nextReviewDate,
  }
  await store.put(updated)
  await tx.done
  return updated
}

export async function updateCardProgress(card: unknown): Promise<StudyCard> {
  assertRecord(card, 'card')
  assertNonEmptyString(card.id, 'card.id')
  assertNonEmptyString(card.deckId, 'card.deckId')

  const ownerId = requireCurrentUser()
  const db = await dbPromise
  const tx = db.transaction(CARDS_STORE, 'readwrite')
  const store = tx.objectStore(CARDS_STORE)
  const existing = await store.get(card.id)

  if (!existing || existing.ownerId !== ownerId) {
    throw new Error(`Card not found: ${card.id}`)
  }

  const updated: StudyCard = {
    ...existing,
    interval: finiteNumber(card.interval, existing.interval),
    repetition: finiteNumber(card.repetition, existing.repetition),
    easinessFactor: finiteNumber(card.easinessFactor, existing.easinessFactor),
    nextReviewDate: finiteNumber(card.nextReviewDate, existing.nextReviewDate),
  }
  await store.put(updated)
  await tx.done
  return updated
}
