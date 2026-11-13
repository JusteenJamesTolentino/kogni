import {
  get,
  limitToLast,
  onValue,
  orderByChild,
  query,
  ref,
  runTransaction,
  serverTimestamp,
  update,
} from 'firebase/database'
import type { DataSnapshot, TransactionResult, Unsubscribe } from 'firebase/database'
import type { User } from 'firebase/auth'
import { database } from './firebase'
import { isRecord } from './errors'
import type {
  AwardReviewXpResult,
  LeaderboardRecord,
  LevelProgress,
  RankedLeaderboardEntry,
} from '../types/domain'

const REVIEW_EVENTS_KEY = 'kognit_leaderboard_review_events'
const pendingEvents = new Set<string>()
const MAX_EVENT_ID_LENGTH = 200
const MAX_SCOPE_ID_LENGTH = 200
const MAX_FUTURE_DUE_MS = 1000 * 60 * 60 * 24 * 365 * 100

export const XP_BY_QUALITY: readonly number[] = Object.freeze([2, 4, 6, 8, 10, 12])
export const XP_PER_LEVEL = 100

function requireEventId(eventId: unknown): string {
  if (typeof eventId !== 'string' || !eventId.trim() || eventId.length > MAX_EVENT_ID_LENGTH) {
    throw new TypeError(`eventId must be a non-empty string of at most ${MAX_EVENT_ID_LENGTH} characters`)
  }
  return eventId.trim()
}

function requireScopeId(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a non-empty string`)
  const normalized = value.trim()
  if (!normalized || normalized.length > MAX_SCOPE_ID_LENGTH || /[.#$[\]/]/.test(normalized)) {
    throw new TypeError(`${label} must be a valid Firebase key of at most ${MAX_SCOPE_ID_LENGTH} characters`)
  }
  return normalized
}

function requireUser(user: User | null | undefined): User {
  if (!user || typeof user.uid !== 'string' || !user.uid) {
    throw new TypeError('An authenticated user is required')
  }
  return user
}

function cleanProfileString(value: unknown, maxLength: number): string {
  return Array.from(String(value ?? ''))
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .trim()
    .slice(0, maxLength)
}

function idempotencyKey(uid: string, eventId: string, lineageId?: string): string {
  return `${uid}:${lineageId || 'global'}:${eventId}`
}

function readSubmittedEvents(): string[] {
  if (typeof localStorage === 'undefined') return []

  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(REVIEW_EVENTS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function hasSubmitted(key: string): boolean {
  return readSubmittedEvents().includes(key)
}

function markSubmitted(key: string): void {
  if (typeof localStorage === 'undefined') return
  const events = readSubmittedEvents().filter((item) => item !== key)
  events.push(key)
  localStorage.setItem(REVIEW_EVENTS_KEY, JSON.stringify(events.slice(-2000)))
}

function readNonNegativeSafeInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0 ? value : 0
}

function isLeaderboardRecord(value: unknown): value is LeaderboardRecord {
  if (!isRecord(value)) return false
  return (
    typeof value.uid === 'string' &&
    typeof value.displayName === 'string' &&
    typeof value.photoURL === 'string' &&
    typeof value.xp === 'number' &&
    typeof value.reviews === 'number' &&
    (typeof value.lastReviewAt === 'number' || isRecord(value.lastReviewAt))
  )
}

function isValidLeaderboardUid(value: unknown): value is string {
  return typeof value === 'string' &&
    value === value.trim() &&
    value.length > 0 &&
    value.length <= MAX_SCOPE_ID_LENGTH &&
    !/[.#$[\]/]/.test(value)
}

/** Converts Firebase child entries into uniquely keyed, descending-XP rankings. */
export function parseRankedLeaderboardEntries(
  entries: Iterable<readonly [string | null, unknown]>,
): RankedLeaderboardEntry[] {
  const leaders: LeaderboardRecord[] = []
  const seenUids = new Set<string>()

  for (const [childKey, value] of entries) {
    if (
      !isValidLeaderboardUid(childKey) ||
      !isLeaderboardRecord(value) ||
      value.uid !== childKey ||
      seenUids.has(childKey)
    ) {
      continue
    }
    seenUids.add(childKey)
    leaders.push({ ...value, uid: childKey })
  }

  leaders.sort((a, b) => (Number(b.xp) || 0) - (Number(a.xp) || 0))
  return leaders.map((leader, index) => ({ ...leader, rank: index + 1 }))
}

function profileFor(user: User): Pick<LeaderboardRecord, 'uid' | 'displayName' | 'photoURL'> {
  return {
    uid: user.uid,
    displayName: cleanProfileString(user.displayName || 'Anonymous learner', 80),
    photoURL: '',
  }
}

function nextLeaderboardRecord(
  current: unknown,
  user: User,
  xpAwarded: number,
  reviewedAt: number = Date.now(),
): LeaderboardRecord {
  const currentRecord = isRecord(current) ? current : {}
  return {
    ...profileFor(user),
    xp: readNonNegativeSafeInteger(currentRecord, 'xp') + xpAwarded,
    reviews: readNonNegativeSafeInteger(currentRecord, 'reviews') + 1,
    lastReviewAt: serverTimestamp(),
    streakDays: computeNextStreakDays(currentRecord, reviewedAt),
    lastReviewDay: localDayKey(reviewedAt),
  }
}

/** Local-calendar day (YYYY-MM-DD) shifted by whole days from the given timestamp. */
export function localDayKey(timestamp: number, dayOffset = 0): string {
  const date = new Date(timestamp)
  date.setDate(date.getDate() + dayOffset)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Any review extends the streak: same-day reviews keep it, a yesterday review grows it
 * by one, anything older resets it to one. Date arithmetic (not raw ms subtraction)
 * keeps the yesterday check correct across DST shifts.
 */
export function computeNextStreakDays(currentRecord: unknown, reviewedAt: number): number {
  const record = isRecord(currentRecord) ? currentRecord : {}
  const previousStreak = Math.max(1, readNonNegativeSafeInteger(record, 'streakDays'))
  const lastDay = typeof record.lastReviewDay === 'string' ? record.lastReviewDay : ''
  if (lastDay === localDayKey(reviewedAt)) return previousStreak
  if (lastDay === localDayKey(reviewedAt, -1)) return previousStreak + 1
  return 1
}

function rankedEntries(snapshot: DataSnapshot): RankedLeaderboardEntry[] {
  const entries: Array<readonly [string | null, unknown]> = []
  snapshot.forEach((child) => {
    entries.push([child.key, child.val()])
  })
  return parseRankedLeaderboardEntries(entries)
}

export function getReviewXp(quality: unknown): number {
  const parsedQuality = Number(quality)
  if (!Number.isInteger(parsedQuality) || parsedQuality < 0 || parsedQuality > 5) {
    throw new RangeError('quality must be an integer from 0 to 5')
  }
  return XP_BY_QUALITY[parsedQuality]
}

export function getLevelFromXp(xp: unknown): number {
  const normalizedXp = Math.max(0, Math.trunc(Number(xp) || 0))
  return Math.floor(normalizedXp / XP_PER_LEVEL) + 1
}

export function getLevelProgress(xp: unknown): LevelProgress {
  const normalizedXp = Math.max(0, Math.trunc(Number(xp) || 0))
  return {
    level: getLevelFromXp(normalizedXp),
    current: normalizedXp % XP_PER_LEVEL,
    required: XP_PER_LEVEL,
  }
}

export interface ScheduledReviewInput {
  eventId: unknown
  quality: unknown
  cardId: unknown
  deckId: unknown
  ownerId: unknown
  dueAt: unknown
  lineageId?: unknown
  reviewedAt?: unknown
}

/**
 * Records XP only for an authenticated owner's due card. The event marker,
 * global leaderboard, and optional deck leaderboard are committed atomically.
 */
export async function recordScheduledReview(
  user: User | null | undefined,
  input: ScheduledReviewInput,
): Promise<AwardReviewXpResult> {
  const authenticatedUser = requireUser(user)
  if (!input || !isRecord(input)) throw new TypeError('input must be an object')

  const eventId = requireEventId(input.eventId)
  const cardId = requireScopeId(input.cardId, 'cardId')
  const deckId = requireScopeId(input.deckId, 'deckId')
  const ownerId = requireScopeId(input.ownerId, 'ownerId')
  if (ownerId !== authenticatedUser.uid) throw new Error('The reviewed card must belong to the authenticated user')

  const reviewedAt = typeof input.reviewedAt === 'number' && Number.isFinite(input.reviewedAt)
    ? Math.trunc(input.reviewedAt)
    : Date.now()
  const dueAt = typeof input.dueAt === 'number' && Number.isFinite(input.dueAt)
    ? Math.trunc(input.dueAt)
    : Number.NaN
  if (!Number.isSafeInteger(dueAt) || dueAt < 0 || dueAt > reviewedAt || dueAt > Date.now() + MAX_FUTURE_DUE_MS) {
    throw new Error('The reviewed card is not due')
  }

  const lineageId = input.lineageId === undefined
    ? undefined
    : requireScopeId(input.lineageId, 'lineageId')
  const key = idempotencyKey(authenticatedUser.uid, eventId, lineageId)
  const xpAwarded = getReviewXp(input.quality)
  if (hasSubmitted(key) || pendingEvents.has(key)) {
    return { awarded: false, xpAwarded: 0, reason: 'duplicate' }
  }

  pendingEvents.add(key)
  try {
    const eventRef = ref(database, `reviewEvents/${authenticatedUser.uid}/${eventId}`)
    const existing = await get(eventRef)
    if (existing.exists()) {
      markSubmitted(key)
      return { awarded: false, xpAwarded: 0, reason: 'duplicate' }
    }

    const globalSnapshot = await get(ref(database, `leaderboard/${authenticatedUser.uid}`))
    const globalRecord = nextLeaderboardRecord(globalSnapshot.val(), authenticatedUser, xpAwarded, reviewedAt)
    const updates: Record<string, unknown> = {
      [`reviewEvents/${authenticatedUser.uid}/${eventId}`]: {
        uid: authenticatedUser.uid,
        cardId,
        deckId,
        lineageId: lineageId || '',
        dueAt,
        reviewedAt: serverTimestamp(),
        xpAwarded,
      },
      [`leaderboard/${authenticatedUser.uid}`]: globalRecord,
    }

    if (lineageId) {
      const deckSnapshot = await get(ref(database, `deckLeaderboards/${lineageId}/${authenticatedUser.uid}`))
      updates[`deckLeaderboards/${lineageId}/${authenticatedUser.uid}`] = nextLeaderboardRecord(
        deckSnapshot.val(),
        authenticatedUser,
        xpAwarded,
      )
    }

    await update(ref(database), updates)
    markSubmitted(key)
    return { awarded: true, xpAwarded, record: globalRecord }
  } finally {
    pendingEvents.delete(key)
  }
}

export async function awardReviewXp(
  user: User | null | undefined,
  eventId: unknown,
  quality: unknown,
  lineageId?: unknown,
): Promise<AwardReviewXpResult> {
  const authenticatedUser = requireUser(user)
  const normalizedEventId = requireEventId(eventId)
  const normalizedLineageId = lineageId === undefined
    ? undefined
    : requireScopeId(lineageId, 'lineageId')
  const key = idempotencyKey(authenticatedUser.uid, normalizedEventId, normalizedLineageId)
  const xpAwarded = getReviewXp(quality)

  if (hasSubmitted(key) || pendingEvents.has(key)) {
    return { awarded: false, xpAwarded: 0, reason: 'duplicate' }
  }

  pendingEvents.add(key)
  try {
    const leaderboardRef = ref(database, `leaderboard/${authenticatedUser.uid}`)
    const result: TransactionResult = await runTransaction(leaderboardRef, (current: unknown) =>
      nextLeaderboardRecord(current, authenticatedUser, xpAwarded),
    )

    if (!result.committed) throw new Error('The Study XP transaction was not committed')
    const record: unknown = result.snapshot.val()
    if (!isLeaderboardRecord(record)) {
      throw new Error('The Study XP transaction returned an invalid record')
    }

    if (normalizedLineageId) {
      await runTransaction(
        ref(database, `deckLeaderboards/${normalizedLineageId}/${authenticatedUser.uid}`),
        (current: unknown) => nextLeaderboardRecord(current, authenticatedUser, xpAwarded),
      )
    }

    markSubmitted(key)
    return { awarded: true, xpAwarded, record }
  } finally {
    pendingEvents.delete(key)
  }
}

function subscribeToLeaderboardPath(
  path: string,
  callback: (leaders: RankedLeaderboardEntry[]) => void,
  error?: (error: Error) => void,
): Unsubscribe {
  if (typeof callback !== 'function') throw new TypeError('callback must be a function')
  const leaderboardQuery = query(ref(database, path), orderByChild('xp'), limitToLast(50))
  return onValue(
    leaderboardQuery,
    (snapshot) => callback(rankedEntries(snapshot)),
    typeof error === 'function' ? error : undefined,
  )
}

export function subscribeToLeaderboard(
  callback: (leaders: RankedLeaderboardEntry[]) => void,
  error?: (error: Error) => void,
  lineageId?: unknown,
): Unsubscribe {
  if (lineageId !== undefined) {
    const normalizedLineageId = requireScopeId(lineageId, 'lineageId')
    return subscribeToLeaderboardPath(`deckLeaderboards/${normalizedLineageId}`, callback, error)
  }
  return subscribeToLeaderboardPath('leaderboard', callback, error)
}

export function subscribeToDeckLeaderboard(
  lineageId: unknown,
  callback: (leaders: RankedLeaderboardEntry[]) => void,
  error?: (error: Error) => void,
): Unsubscribe {
  const normalizedLineageId = requireScopeId(lineageId, 'lineageId')
  return subscribeToLeaderboardPath(`deckLeaderboards/${normalizedLineageId}`, callback, error)
}

/** Live cloud record (XP, streak) for one user; null while the user has no reviews yet. */
export function subscribeToMyLeaderboardRecord(
  uid: unknown,
  callback: (record: LeaderboardRecord | null) => void,
  error?: (error: Error) => void,
): Unsubscribe {
  const normalizedUid = requireScopeId(uid, 'uid')
  return onValue(
    ref(database, `leaderboard/${normalizedUid}`),
    (snapshot) => {
      const value: unknown = snapshot.val()
      callback(isLeaderboardRecord(value) ? value : null)
    },
    typeof error === 'function' ? error : undefined,
  )
}
