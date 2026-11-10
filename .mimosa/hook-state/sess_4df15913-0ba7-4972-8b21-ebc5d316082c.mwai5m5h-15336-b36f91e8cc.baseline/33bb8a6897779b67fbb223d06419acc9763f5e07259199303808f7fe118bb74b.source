import type { User } from 'firebase/auth'
import { ref, runTransaction } from 'firebase/database'
import type { TransactionResult } from 'firebase/database'
import { database } from './firebase'
import { isRecord } from './errors'
import type {
  OnlineCardScheduleRecord,
  OnlineCardScheduleState,
  OnlineReviewEvent,
  RecordOnlineReviewResult,
} from '../types/domain'

const MAX_ID_LENGTH = 200

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

function requireInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < minimum) {
    throw new TypeError(`${label} must be a safe integer of at least ${minimum}`)
  }
  return value
}

function requireFinite(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new TypeError(`${label} must be a finite number of at least ${minimum}`)
  }
  return value
}

export interface ResetOnlineScheduleInput {
  deckId: unknown
  cardId: unknown
  deckVersion: unknown
  contentRevision: unknown
  now?: number
}

/**
 * Returns a new-card schedule when published learning content changed. Reordering,
 * metadata edits, and a new deck version with the same contentRevision preserve progress.
 */
export function resetScheduleForChangedContent(
  current: OnlineCardScheduleState | null | undefined,
  input: ResetOnlineScheduleInput,
): OnlineCardScheduleState {
  const deckId = requireKey(input.deckId, 'deckId')
  const cardId = requireKey(input.cardId, 'cardId')
  const deckVersion = requireInteger(input.deckVersion, 'deckVersion', 1)
  const contentRevision = requireInteger(input.contentRevision, 'contentRevision', 1)
  const now = Math.trunc(requireFinite(input.now ?? Date.now(), 'now'))

  if (current && current.deckId === deckId && current.cardId === cardId && current.contentRevision === contentRevision) {
    return { ...current, deckVersion, updatedAt: now }
  }
  return {
    deckId,
    cardId,
    deckVersion,
    contentRevision,
    scheduleRevision: 0,
    reviewCount: 0,
    interval: 0,
    repetition: 0,
    easinessFactor: 2.5,
    nextReviewDate: now,
    lastReviewedAt: 0,
    lastEventId: '',
    updatedAt: now,
  }
}

export interface RecordOnlineReviewInput {
  eventId: unknown
  deckId: unknown
  cardId: unknown
  deckVersion: unknown
  contentRevision: unknown
  expectedScheduleRevision: unknown
  rating: unknown
  reviewedAt?: number
  interval: unknown
  repetition: unknown
  easinessFactor: unknown
  nextReviewDate: unknown
}

function readState(value: unknown): OnlineCardScheduleState | null {
  if (!isRecord(value)) return null
  return typeof value.deckId === 'string' && typeof value.cardId === 'string' &&
    Number.isSafeInteger(value.deckVersion) && Number.isSafeInteger(value.contentRevision) &&
    Number.isSafeInteger(value.scheduleRevision) && Number.isSafeInteger(value.reviewCount) &&
    typeof value.interval === 'number' && Number.isSafeInteger(value.repetition) &&
    typeof value.easinessFactor === 'number' && typeof value.nextReviewDate === 'number' &&
    typeof value.lastReviewedAt === 'number' && typeof value.lastEventId === 'string' &&
    typeof value.updatedAt === 'number'
    ? value as unknown as OnlineCardScheduleState
    : null
}

function readRecord(value: unknown): OnlineCardScheduleRecord | null {
  if (value === null) return { state: null as unknown as OnlineCardScheduleState }
  if (!isRecord(value)) return null
  const state = readState(value.state)
  if (!state) return null
  if (value.events !== undefined && !isRecord(value.events)) return null
  return { state, ...(isRecord(value.events) ? { events: value.events as Record<string, OnlineReviewEvent> } : {}) }
}

/**
 * Stores one idempotent review event and its resulting schedule in a card-scoped
 * RTDB transaction. This is an explicitly friendly-client trust model: rules
 * enforce ownership, immutability, bounds and monotonic revisions, but do not
 * claim that a client-computed rating or interval is cheat-proof.
 */
export async function recordOnlineReview(
  user: User | null | undefined,
  input: RecordOnlineReviewInput,
): Promise<RecordOnlineReviewResult> {
  const authenticatedUser = requireUser(user)
  if (!isRecord(input)) throw new TypeError('input must be an object')
  const eventId = requireKey(input.eventId, 'eventId')
  const deckId = requireKey(input.deckId, 'deckId')
  const cardId = requireKey(input.cardId, 'cardId')
  const deckVersion = requireInteger(input.deckVersion, 'deckVersion', 1)
  const contentRevision = requireInteger(input.contentRevision, 'contentRevision', 1)
  const expectedScheduleRevision = requireInteger(input.expectedScheduleRevision, 'expectedScheduleRevision')
  const rating = requireInteger(input.rating, 'rating')
  if (rating > 5) throw new RangeError('rating must be an integer from 0 to 5')
  const reviewedAt = Math.trunc(requireFinite(input.reviewedAt ?? Date.now(), 'reviewedAt'))
  const interval = requireFinite(input.interval, 'interval')
  const repetition = requireInteger(input.repetition, 'repetition')
  const easinessFactor = requireFinite(input.easinessFactor, 'easinessFactor', 1.3)
  const nextReviewDate = Math.trunc(requireFinite(input.nextReviewDate, 'nextReviewDate', reviewedAt))

  let duplicate = false
  let abortReason = 'The review transaction was not committed'
  let appliedEvent: OnlineReviewEvent | null = null
  const scheduleRef = ref(database, `onlineSchedules/${authenticatedUser.uid}/${deckId}/${cardId}`)
  const result: TransactionResult = await runTransaction(scheduleRef, (current) => {
    const record = readRecord(current)
    if (!record) {
      abortReason = 'The current online schedule is invalid'
      return undefined
    }
    if (record.events?.[eventId]) {
      duplicate = true
      return undefined
    }
    const baseState = resetScheduleForChangedContent(
      current === null ? null : record.state,
      { deckId, cardId, deckVersion, contentRevision, now: reviewedAt },
    )
    if (baseState.scheduleRevision !== expectedScheduleRevision) {
      abortReason = `Stale schedule revision: expected ${expectedScheduleRevision}, current ${baseState.scheduleRevision}`
      return undefined
    }
    const event: OnlineReviewEvent = {
      id: eventId,
      uid: authenticatedUser.uid,
      deckId,
      cardId,
      deckVersion,
      contentRevision,
      rating,
      reviewedAt,
      scheduleRevisionBefore: expectedScheduleRevision,
      interval,
      repetition,
      easinessFactor,
      nextReviewDate,
    }
    const state: OnlineCardScheduleState = {
      ...baseState,
      deckVersion,
      contentRevision,
      scheduleRevision: expectedScheduleRevision + 1,
      reviewCount: baseState.reviewCount + 1,
      interval,
      repetition,
      easinessFactor,
      nextReviewDate,
      lastReviewedAt: reviewedAt,
      lastEventId: eventId,
      updatedAt: reviewedAt,
    }
    appliedEvent = event
    return { state, events: { ...record.events, [eventId]: event } }
  })

  if (!result.committed) {
    const state = readState(isRecord(result.snapshot.val()) ? result.snapshot.val().state : null)
    if (duplicate && state) return { applied: false, reason: 'duplicate', state }
    throw new Error(abortReason)
  }
  const committed = readRecord(result.snapshot.val())
  if (!committed || !appliedEvent) throw new Error('The review transaction returned invalid data')
  return { applied: true, state: committed.state, event: appliedEvent }
}
