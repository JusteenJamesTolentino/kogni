import type { User } from 'firebase/auth'
import { get, ref, runTransaction, update } from 'firebase/database'
import type { TransactionResult } from 'firebase/database'
import { database } from './firebase'
import { isRecord } from './errors'
import type {
  CreateOnlineDeckInput,
  OnlineDeckContentInput,
} from './onlineDecks'
import { buildOnlineDeckRecord } from './onlineDecks'
import type {
  DeckSeries,
  DeckSeriesPart,
  OnlineDeckRecord,
  OnlinePartProgress,
  RecordOnlinePartRatingResult,
} from '../types/domain'

export const SERIES_PART_CARD_COUNT = 30
const MAX_ID_LENGTH = 200
const MAX_TOPIC_LENGTH = 160

function requireUser(user: User | null | undefined): User {
  if (!user?.uid) throw new TypeError('An authenticated user is required')
  return user
}

function requireKey(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a valid Firebase key`)
  const normalized = value.trim()
  if (!normalized || normalized.length > MAX_ID_LENGTH || /[.#$[\]/]/.test(normalized)) {
    throw new TypeError(`${label} must be a valid Firebase key`)
  }
  return normalized
}

function requirePartNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError('partNumber must be a positive safe integer')
  }
  return value
}

function requireTimestamp(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative finite timestamp`)
  }
  return Math.trunc(value)
}

function requireTopic(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('topic must not be empty')
  const topic = value.replace(/\s+/g, ' ').trim().slice(0, MAX_TOPIC_LENGTH)
  if (!topic) throw new TypeError('topic must not be empty')
  return topic
}

function readPart(value: unknown): DeckSeriesPart | null {
  if (!isRecord(value)) return null
  return typeof value.seriesId === 'string' && Number.isSafeInteger(value.partNumber) &&
    typeof value.deckId === 'string' && typeof value.ownerId === 'string' &&
    typeof value.createdAt === 'number'
    ? value as unknown as DeckSeriesPart
    : null
}

function readSeries(value: unknown): DeckSeries | null {
  if (!isRecord(value) || !isRecord(value.parts)) return null
  const parts: Record<string, DeckSeriesPart> = {}
  for (const [key, candidate] of Object.entries(value.parts)) {
    const part = readPart(candidate)
    if (!part || String(part.partNumber) !== key) return null
    parts[key] = part
  }
  return typeof value.id === 'string' && typeof value.ownerId === 'string' &&
    typeof value.topic === 'string' && typeof value.rootDeckId === 'string' &&
    typeof value.latestDeckId === 'string' && Number.isSafeInteger(value.latestPartNumber) &&
    typeof value.createdAt === 'number' && typeof value.updatedAt === 'number'
    ? { ...value, parts } as unknown as DeckSeries
    : null
}

function transactionSeries(result: TransactionResult): DeckSeries {
  if (!result.committed) throw new Error('The deck series transaction was not committed')
  const series = readSeries(result.snapshot.val())
  if (!series) throw new Error('The deck series transaction returned invalid data')
  return series
}

export interface CreateDeckSeriesInput {
  seriesId: unknown
  topic: unknown
  rootDeckId: unknown
  cardCount: unknown
  now?: number
}

/** Creates part 1. Its online deck must be published atomically in the same root update. */
export async function createDeckSeries(
  user: User | null | undefined,
  input: CreateDeckSeriesInput,
): Promise<DeckSeries> {
  const owner = requireUser(user)
  if (!isRecord(input)) throw new TypeError('input must be an object')
  if (input.cardCount !== SERIES_PART_CARD_COUNT) throw new RangeError('Series parts must contain exactly 30 cards')
  const id = requireKey(input.seriesId, 'seriesId')
  const deckId = requireKey(input.rootDeckId, 'rootDeckId')
  const now = requireTimestamp(input.now ?? Date.now(), 'now')
  const part: DeckSeriesPart = { seriesId: id, partNumber: 1, deckId, ownerId: owner.uid, createdAt: now }
  const series: DeckSeries = {
    id,
    ownerId: owner.uid,
    topic: requireTopic(input.topic),
    rootDeckId: deckId,
    latestDeckId: deckId,
    latestPartNumber: 1,
    createdAt: now,
    updatedAt: now,
    parts: { '1': part },
  }
  const result = await runTransaction(ref(database, `deckSeries/${id}`), (current) => current === null ? series : undefined)
  return transactionSeries(result)
}

export interface AppendDeckSeriesPartInput {
  expectedLatestPartNumber: unknown
  deckId: unknown
  cardCount: unknown
  now?: number
}

/** Appends one monotonic part with a separate deck ID. */
export async function appendDeckSeriesPart(
  user: User | null | undefined,
  seriesIdValue: unknown,
  input: AppendDeckSeriesPartInput,
): Promise<DeckSeries> {
  const owner = requireUser(user)
  const seriesId = requireKey(seriesIdValue, 'seriesId')
  if (!isRecord(input)) throw new TypeError('input must be an object')
  if (input.cardCount !== SERIES_PART_CARD_COUNT) throw new RangeError('Series parts must contain exactly 30 cards')
  const expected = requirePartNumber(input.expectedLatestPartNumber)
  const deckId = requireKey(input.deckId, 'deckId')
  const now = requireTimestamp(input.now ?? Date.now(), 'now')
  let abortReason = 'Deck series not found'
  const result = await runTransaction(ref(database, `deckSeries/${seriesId}`), (current) => {
    const series = readSeries(current)
    if (!series) return undefined
    if (series.ownerId !== owner.uid) {
      abortReason = 'Only the series owner can append a part'
      return undefined
    }
    if (series.latestPartNumber !== expected) {
      abortReason = `Stale latest part: expected ${expected}, current ${series.latestPartNumber}`
      return undefined
    }
    if (Object.values(series.parts).some((part) => part.deckId === deckId)) {
      abortReason = 'Each series part must use a separate deck ID'
      return undefined
    }
    const partNumber = expected + 1
    const part: DeckSeriesPart = { seriesId, partNumber, deckId, ownerId: owner.uid, createdAt: now }
    return {
      ...series,
      latestDeckId: deckId,
      latestPartNumber: partNumber,
      updatedAt: now,
      parts: { ...series.parts, [String(partNumber)]: part },
    }
  })
  if (!result.committed) throw new Error(abortReason)
  return transactionSeries(result)
}

export interface PublishSeriesPartInput {
  seriesId: unknown
  topic?: unknown
  expectedLatestPartNumber: unknown
  deck: OnlineDeckRecord
}

/**
 * Builds the owner-only root update that publishes a separate online deck and
 * advances its series linkage atomically. Pass the result to update(ref(database), updates).
 */
export function buildSeriesPartPublishUpdates(
  user: User | null | undefined,
  input: PublishSeriesPartInput,
): Record<string, unknown> {
  const owner = requireUser(user)
  if (!isRecord(input) || !isRecord(input.deck) || !isRecord(input.deck.head)) throw new TypeError('input must include a deck')
  const seriesId = requireKey(input.seriesId, 'seriesId')
  const expected = typeof input.expectedLatestPartNumber === 'number' && input.expectedLatestPartNumber === 0
    ? 0
    : requirePartNumber(input.expectedLatestPartNumber)
  const head = input.deck.head
  if (head.ownerId !== owner.uid) throw new Error('Only the deck owner can publish a series part')
  if (head.cardCount !== SERIES_PART_CARD_COUNT) throw new RangeError('Series parts must contain exactly 30 cards')
  if (head.seriesId !== seriesId || head.partNumber !== expected + 1) {
    throw new Error('Online deck series linkage does not match the next part')
  }
  const deckId = requireKey(head.id, 'deckId')
  const part: DeckSeriesPart = {
    seriesId,
    partNumber: expected + 1,
    deckId,
    ownerId: owner.uid,
    createdAt: head.createdAt,
  }
  const updates: Record<string, unknown> = { [`onlineDecks/${deckId}`]: input.deck }
  if (expected === 0) {
    updates[`deckSeries/${seriesId}`] = {
      id: seriesId,
      ownerId: owner.uid,
      topic: requireTopic(input.topic),
      rootDeckId: deckId,
      latestDeckId: deckId,
      latestPartNumber: 1,
      createdAt: head.createdAt,
      updatedAt: head.updatedAt,
      parts: { '1': part },
    } satisfies DeckSeries
  } else {
    updates[`deckSeries/${seriesId}/latestDeckId`] = deckId
    updates[`deckSeries/${seriesId}/latestPartNumber`] = expected + 1
    updates[`deckSeries/${seriesId}/updatedAt`] = head.updatedAt
    updates[`deckSeries/${seriesId}/parts/${expected + 1}`] = part
  }
  return updates
}

export interface PublishReviewedSeriesDraftInput {
  seriesId: unknown
  topic?: unknown
  expectedLatestPartNumber: unknown
  deckId: unknown
  content: OnlineDeckContentInput
  visibility: CreateOnlineDeckInput['visibility']
  offlinePolicy: CreateOnlineDeckInput['offlinePolicy']
  now?: number
}

/**
 * Creates a reviewed draft as the next independently versioned online deck and
 * advances the series in one root update. The server rules re-check the stale
 * part number and linkage atomically.
 */
export async function publishReviewedSeriesDraft(
  user: User | null | undefined,
  input: PublishReviewedSeriesDraftInput,
): Promise<{ deck: OnlineDeckRecord; series: DeckSeries }> {
  const owner = requireUser(user)
  if (!isRecord(input) || !isRecord(input.content)) throw new TypeError('input must include reviewed content')
  const seriesId = requireKey(input.seriesId, 'seriesId')
  const expected = typeof input.expectedLatestPartNumber === 'number' && input.expectedLatestPartNumber === 0
    ? 0
    : requirePartNumber(input.expectedLatestPartNumber)
  const now = requireTimestamp(input.now ?? Date.now(), 'now')
  const priorQuestions = expected === 0 ? [] : await loadPriorSeriesQuestions(owner, seriesId, expected + 1)
  validateContinuationQuestions(priorQuestions, input.content)
  const deck = buildOnlineDeckRecord(owner, {
    ...input.content,
    deckId: input.deckId,
    expectedBaseVersion: 0,
    visibility: input.visibility,
    offlinePolicy: input.offlinePolicy,
    seriesId,
    partNumber: expected + 1,
    now,
  })
  const updates = buildSeriesPartPublishUpdates(owner, {
    seriesId,
    topic: input.topic,
    expectedLatestPartNumber: expected,
    deck,
  })
  await update(ref(database), updates)
  const series = readSeries((await get(ref(database, `deckSeries/${seriesId}`))).val())
  if (!series) throw new Error('The published deck series could not be read')
  return { deck, series }
}

export interface PriorSeriesQuestion {
  seriesId: string
  partNumber: number
  deckId: string
  cardId: string
  question: string
}

/** Loads every question from all prior recorded parts, including deleted middle parts. */
export async function loadPriorSeriesQuestions(
  user: User | null | undefined,
  seriesIdValue: unknown,
  beforePartNumberValue: unknown,
): Promise<PriorSeriesQuestion[]> {
  const owner = requireUser(user)
  const seriesId = requireKey(seriesIdValue, 'seriesId')
  const beforePartNumber = requirePartNumber(beforePartNumberValue)
  const series = readSeries((await get(ref(database, `deckSeries/${seriesId}`))).val())
  if (!series || series.ownerId !== owner.uid) throw new Error('Only the series owner can load prior questions')
  if (beforePartNumber > series.latestPartNumber + 1) throw new RangeError('beforePartNumber exceeds the next series part')

  const questions: PriorSeriesQuestion[] = []
  for (let partNumber = 1; partNumber < beforePartNumber; partNumber += 1) {
    const part = series.parts[String(partNumber)]
    if (!part) throw new Error(`Series part ${partNumber} is missing`)
    const deckValue = (await get(ref(database, `onlineDecks/${part.deckId}`))).val()
    if (!isRecord(deckValue) || !isRecord(deckValue.head) || !isRecord(deckValue.versions)) {
      throw new Error(`Series part ${partNumber} deck is unavailable`)
    }
    const latestVersion = deckValue.head.latestVersion
    const version = deckValue.versions[String(latestVersion)]
    if (!isRecord(version) || !isRecord(version.cards)) throw new Error(`Series part ${partNumber} version is unavailable`)
    const cards = Object.values(version.cards)
      .filter(isRecord)
      .sort((left, right) => Number(left.order) - Number(right.order))
    if (cards.length !== SERIES_PART_CARD_COUNT) throw new Error(`Series part ${partNumber} must contain exactly 30 cards`)
    for (const card of cards) {
      if (typeof card.id !== 'string' || typeof card.question !== 'string') throw new Error(`Series part ${partNumber} contains an invalid card`)
      questions.push({ seriesId, partNumber, deckId: part.deckId, cardId: card.id, question: card.question })
    }
  }
  return questions
}

/** Rejects a reviewed continuation if it repeats an exact normalized prior question. */
export function validateContinuationQuestions(
  priorQuestions: readonly PriorSeriesQuestion[],
  content: OnlineDeckContentInput,
): void {
  if (!isRecord(content) || !Array.isArray(content.cards) || content.cards.length !== SERIES_PART_CARD_COUNT) {
    throw new RangeError('Series parts must contain exactly 30 cards')
  }
  const normalize = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase()
  const seen = new Set(priorQuestions.map((entry) => normalize(entry.question)))
  content.cards.forEach((card, index) => {
    if (!isRecord(card)) throw new TypeError(`cards[${index}] must be an object`)
    const question = normalize(card.question)
    if (!question) throw new TypeError(`cards[${index}].question must not be empty`)
    if (seen.has(question)) throw new Error(`cards[${index}].question duplicates a prior series question`)
    seen.add(question)
  })
}

function readProgress(value: unknown): OnlinePartProgress | null {
  if (!isRecord(value) || !isRecord(value.ratedCardIds)) return null
  const ids = Object.values(value.ratedCardIds)
  return typeof value.uid === 'string' && typeof value.seriesId === 'string' &&
    Number.isSafeInteger(value.partNumber) && typeof value.deckId === 'string' &&
    Number.isSafeInteger(value.ratedCount) && value.ratedCount === ids.length &&
    typeof value.lastRatedCardId === 'string' && value.ratedCardIds[value.lastRatedCardId] === true &&
    ids.every((entry) => entry === true) && typeof value.complete === 'boolean' &&
    typeof value.updatedAt === 'number'
    ? value as unknown as OnlinePartProgress
    : null
}

export interface RecordOnlinePartRatingInput {
  seriesId: unknown
  partNumber: unknown
  deckId: unknown
  cardId: unknown
  now?: number
}

/** Counts each card ID once and flips complete only on the thirtieth distinct rating. */
export async function recordOnlinePartRating(
  user: User | null | undefined,
  input: RecordOnlinePartRatingInput,
): Promise<RecordOnlinePartRatingResult> {
  const authenticatedUser = requireUser(user)
  if (!isRecord(input)) throw new TypeError('input must be an object')
  const seriesId = requireKey(input.seriesId, 'seriesId')
  const partNumber = requirePartNumber(input.partNumber)
  const deckId = requireKey(input.deckId, 'deckId')
  const cardId = requireKey(input.cardId, 'cardId')
  const now = requireTimestamp(input.now ?? Date.now(), 'now')
  let duplicate = false
  let abortReason = 'The part progress transaction was not committed'
  const progressRef = ref(database, `onlinePartProgress/${authenticatedUser.uid}/${seriesId}/${partNumber}`)
  const result = await runTransaction(progressRef, (current) => {
    const existing = current === null ? null : readProgress(current)
    if (current !== null && !existing) {
      abortReason = 'The current part progress is invalid'
      return undefined
    }
    if (existing && (existing.deckId !== deckId || existing.partNumber !== partNumber || existing.seriesId !== seriesId)) {
      abortReason = 'Part progress does not match the requested series part'
      return undefined
    }
    if (existing?.ratedCardIds[cardId]) {
      duplicate = true
      return undefined
    }
    const ratedCardIds = { ...existing?.ratedCardIds, [cardId]: true as const }
    const ratedCount = Object.keys(ratedCardIds).length
    if (ratedCount > SERIES_PART_CARD_COUNT) {
      abortReason = 'A series part cannot rate more than 30 distinct cards'
      return undefined
    }
    const complete = ratedCount === SERIES_PART_CARD_COUNT
    return {
      uid: authenticatedUser.uid,
      seriesId,
      partNumber,
      deckId,
      ratedCardIds,
      ratedCount,
      lastRatedCardId: cardId,
      complete,
      ...(complete ? { completedAt: existing?.completedAt ?? now } : {}),
      updatedAt: now,
    } satisfies OnlinePartProgress
  })
  const progress = readProgress(result.snapshot.val())
  if (!result.committed) {
    if (duplicate && progress) return { applied: false, reason: 'duplicate', progress }
    throw new Error(abortReason)
  }
  if (!progress) throw new Error('The part progress transaction returned invalid data')
  return { applied: true, progress }
}
