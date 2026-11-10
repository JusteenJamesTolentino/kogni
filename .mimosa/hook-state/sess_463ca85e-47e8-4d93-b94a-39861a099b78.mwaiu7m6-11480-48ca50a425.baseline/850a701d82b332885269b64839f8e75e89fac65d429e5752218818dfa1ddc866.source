import type { User } from 'firebase/auth'
import { get, ref, update } from 'firebase/database'
import { database } from './firebase'
import { isRecord } from './errors'
import { hasCompleteStudyGuideCoverage, STUDY_GUIDE_COVERAGE } from './studyGuideCoverage'
import type {
  DeckPortalCard,
  DeckPortalLookupResult,
  DeckPortalRecord,
  DeckPortalSnapshot,
  StudyCard,
  StudyDeck,
} from '../types/domain'

export const PORTAL_CODE_LENGTH = 12
export const PORTAL_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
export const PORTAL_INVALID_MESSAGE = 'This deck portal is invalid or unavailable.'

const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const MAX_TITLE_LENGTH = 160
const MAX_OWNER_NAME_LENGTH = 80
const MAX_DESCRIPTION_LENGTH = 2000
const MAX_STUDY_GUIDE_LENGTH = 8000
const MAX_CARDS = 500
const MAX_CARD_TEXT_LENGTH = 10000
const MAX_DISTRACTORS = 10
const MAX_ID_LENGTH = 200
const MAX_CODE_ATTEMPTS = 5

function cleanString(value: unknown, maxLength: number): string {
  return Array.from(String(value ?? ''))
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .trim()
    .slice(0, maxLength)
}

function requireFirebaseKey(value: unknown, label: string): string {
  const normalized = cleanString(value, MAX_ID_LENGTH)
  if (!normalized || /[.#$[\]/]/.test(normalized)) {
    throw new TypeError(`${label} must be a valid non-empty Firebase key`)
  }
  return normalized
}

function requireUser(user: User | null | undefined): User {
  if (!user || typeof user.uid !== 'string' || !user.uid) {
    throw new TypeError('An authenticated user is required')
  }
  return user
}

function finiteTimestamp(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative finite timestamp`)
  }
  return value
}

/** Returns the canonical database key or an empty string for malformed input. */
export function normalizePortalCode(value: unknown): string {
  if (typeof value !== 'string') return ''
  const normalized = value.normalize('NFKC').toUpperCase().replace(/[\s-]+/g, '')
  return normalized.length === PORTAL_CODE_LENGTH &&
    Array.from(normalized).every((character) => CROCKFORD_BASE32.includes(character))
    ? normalized
    : ''
}

/** Returns XXXX-XXXX-XXXX, or an empty string when the code is malformed. */
export function formatPortalCode(value: unknown): string {
  const normalized = normalizePortalCode(value)
  return normalized
    ? `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8)}`
    : ''
}

/** Generates 60 bits of code entropy using the platform CSPRNG. */
export function generatePortalCode(): string {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('A cryptographically secure random number generator is required')
  }
  const random = new Uint8Array(PORTAL_CODE_LENGTH)
  globalThis.crypto.getRandomValues(random)
  return Array.from(random, (byte) => CROCKFORD_BASE32[byte & 31]).join('')
}

export interface CreateDeckPortalSnapshotInput {
  deck: StudyDeck
  cards: StudyCard[]
}

/** Builds the immutable, schedule-free content copied into a portal. */
export function createDeckPortalSnapshot(input: CreateDeckPortalSnapshotInput): DeckPortalSnapshot {
  if (!input || !isRecord(input.deck) || !Array.isArray(input.cards)) {
    throw new TypeError('A deck and cards are required')
  }
  const sourceDeckId = requireFirebaseKey(input.deck.id, 'deck.id')
  const ownerId = requireFirebaseKey(input.deck.ownerId, 'deck.ownerId')
  if (input.cards.length < 1 || input.cards.length > MAX_CARDS) {
    throw new RangeError(`cards must contain 1 to ${MAX_CARDS} items`)
  }

  const cards: Record<string, DeckPortalCard> = {}
  input.cards.forEach((card, index) => {
    if (!isRecord(card) || card.deckId !== sourceDeckId || card.ownerId !== ownerId) {
      throw new Error('Every portal card must belong to the selected deck and its owner')
    }
    const id = `card_${index}`
    cards[id] = {
      id,
      question: cleanString(card.question, MAX_CARD_TEXT_LENGTH),
      answer: cleanString(card.answer, MAX_CARD_TEXT_LENGTH),
      distractors: Array.isArray(card.distractors)
        ? card.distractors
            .slice(0, MAX_DISTRACTORS)
            .map((item) => cleanString(item, MAX_CARD_TEXT_LENGTH))
        : [],
    }
  })

  const studyGuide = typeof input.deck.studyGuide === 'string'
    ? input.deck.studyGuide.trim().slice(0, MAX_STUDY_GUIDE_LENGTH)
    : ''
  return {
    lineageId: requireFirebaseKey(input.deck.lineageId || sourceDeckId, 'deck.lineageId'),
    title: cleanString(input.deck.title || 'Untitled deck', MAX_TITLE_LENGTH),
    description: cleanString(input.deck.description, MAX_DESCRIPTION_LENGTH),
    ...(studyGuide ? { studyGuide } : {}),
    ...(studyGuide && hasCompleteStudyGuideCoverage(studyGuide, Object.values(cards))
      ? { studyGuideCoverage: STUDY_GUIDE_COVERAGE }
      : {}),
    cardCount: input.cards.length,
    cards,
  }
}

export function invalidPortalLookupResult(): DeckPortalLookupResult {
  return {
    ok: false,
    code: 'invalid_portal',
    message: PORTAL_INVALID_MESSAGE,
  }
}

function isPortalCard(value: unknown, key: string): value is DeckPortalCard {
  return isRecord(value) &&
    value.id === key &&
    typeof value.question === 'string' &&
    typeof value.answer === 'string' &&
    Array.isArray(value.distractors) &&
    value.distractors.length <= MAX_DISTRACTORS &&
    value.distractors.every((item) => typeof item === 'string')
}

export function isDeckPortalRecord(value: unknown, code?: string): value is DeckPortalRecord {
  if (!isRecord(value) || !isRecord(value.snapshot) || !isRecord(value.snapshot.cards)) return false
  const normalizedCode = normalizePortalCode(code ?? value.id)
  const cardEntries = Object.entries(value.snapshot.cards)
  return Boolean(normalizedCode) &&
    value.id === normalizedCode &&
    typeof value.ownerId === 'string' &&
    typeof value.ownerDisplayName === 'string' &&
    typeof value.sourceDeckId === 'string' &&
    (value.status === 'active' || value.status === 'revoked') &&
    typeof value.createdAt === 'number' &&
    typeof value.expiresAt === 'number' &&
    (value.revokedAt === undefined || typeof value.revokedAt === 'number') &&
    typeof value.snapshot.lineageId === 'string' &&
    typeof value.snapshot.title === 'string' &&
    typeof value.snapshot.description === 'string' &&
    (value.snapshot.studyGuide === undefined || typeof value.snapshot.studyGuide === 'string') &&
    (value.snapshot.studyGuideCoverage === undefined || value.snapshot.studyGuideCoverage === STUDY_GUIDE_COVERAGE) &&
    typeof value.snapshot.cardCount === 'number' &&
    value.snapshot.cardCount === cardEntries.length &&
    cardEntries.every(([key, card]) => isPortalCard(card, key))
}

export function canReadDeckPortal(
  portal: DeckPortalRecord,
  userId: string,
  now: number = Date.now(),
): boolean {
  return portal.ownerId === userId ||
    (portal.status === 'active' && portal.expiresAt > now)
}

export interface CreateDeckPortalInput extends CreateDeckPortalSnapshotInput {
  ownerDisplayName?: unknown
}

export interface DeckPortalExpiryOptions {
  /** Portal lifetime in whole days. Defaults to the maximum of 30 days. */
  expiresInDays?: number
  /** Injectable clock for deterministic callers and tests. */
  now?: number
}

function portalExpiry(options: DeckPortalExpiryOptions = {}): { now: number; expiresAt: number } {
  const now = finiteTimestamp(options.now ?? Date.now(), 'now')
  const expiresInDays = options.expiresInDays ?? 30
  if (!Number.isSafeInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30) {
    throw new RangeError('expiresInDays must be a whole number from 1 to 30')
  }
  return { now, expiresAt: now + expiresInDays * 24 * 60 * 60 * 1000 }
}

export function getDeckPortalExpiry(options: DeckPortalExpiryOptions = {}): {
  now: number
  expiresAt: number
} {
  return portalExpiry(options)
}

function portalRecord(
  user: User,
  code: string,
  input: CreateDeckPortalInput,
  now: number,
  expiresAt: number,
): DeckPortalRecord {
  const sourceDeckId = requireFirebaseKey(input.deck.id, 'deck.id')
  if (input.deck.ownerId !== user.uid) throw new Error('Only the deck owner can create a portal')
  return {
    id: code,
    ownerId: user.uid,
    ownerDisplayName: cleanString(
      input.ownerDisplayName || user.displayName || 'Kognit learner',
      MAX_OWNER_NAME_LENGTH,
    ),
    sourceDeckId,
    status: 'active',
    createdAt: now,
    expiresAt,
    snapshot: createDeckPortalSnapshot(input),
  }
}

/** Creates a portal and its one-per-source-deck mapping in one atomic update. */
export async function createDeckPortal(
  user: User | null | undefined,
  input: CreateDeckPortalInput,
  options: DeckPortalExpiryOptions = {},
): Promise<DeckPortalRecord> {
  const authenticatedUser = requireUser(user)
  const { now, expiresAt } = portalExpiry(options)

  let lastError: unknown
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = generatePortalCode()
    const portal = portalRecord(authenticatedUser, code, input, now, expiresAt)
    try {
      await update(ref(database), {
        [`deckPortals/${code}`]: portal,
        [`portalByDeck/${authenticatedUser.uid}/${portal.sourceDeckId}`]: code,
      })
      return portal
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to create deck portal')
}

/** Performs a direct, exact-key lookup and never exposes why lookup failed. */
export async function lookupDeckPortal(
  user: User | null | undefined,
  value: unknown,
  now: number = Date.now(),
): Promise<DeckPortalLookupResult> {
  const userId = user?.uid
  const code = normalizePortalCode(value)
  if (!userId || !code) return invalidPortalLookupResult()

  try {
    const portalValue: unknown = (await get(ref(database, `deckPortals/${code}`))).val()
    if (!isDeckPortalRecord(portalValue, code) || !canReadDeckPortal(portalValue, userId, now)) {
      return invalidPortalLookupResult()
    }
    return { ok: true, portal: portalValue }
  } catch {
    return invalidPortalLookupResult()
  }
}

async function getOwnedPortal(user: User, value: unknown): Promise<DeckPortalRecord> {
  const code = normalizePortalCode(value)
  if (!code) throw new TypeError(PORTAL_INVALID_MESSAGE)
  const portalValue: unknown = (await get(ref(database, `deckPortals/${code}`))).val()
  if (!isDeckPortalRecord(portalValue, code) || portalValue.ownerId !== user.uid) {
    throw new Error(PORTAL_INVALID_MESSAGE)
  }
  return portalValue
}

export async function renewDeckPortal(
  user: User | null | undefined,
  value: unknown,
  options: DeckPortalExpiryOptions = {},
): Promise<DeckPortalRecord> {
  const authenticatedUser = requireUser(user)
  const { expiresAt } = portalExpiry(options)
  const portal = await getOwnedPortal(authenticatedUser, value)
  if (portal.status !== 'active') throw new Error('A revoked deck portal cannot be renewed')
  const renewed = { ...portal, expiresAt }
  await update(ref(database, `deckPortals/${portal.id}`), { expiresAt: renewed.expiresAt })
  return renewed
}

export async function revokeDeckPortal(
  user: User | null | undefined,
  value: unknown,
  now: number = Date.now(),
): Promise<DeckPortalRecord> {
  const authenticatedUser = requireUser(user)
  const revokedAt = finiteTimestamp(now, 'now')
  const portal = await getOwnedPortal(authenticatedUser, value)
  if (portal.status === 'revoked') return portal

  const revoked: DeckPortalRecord = { ...portal, status: 'revoked', revokedAt }
  await update(ref(database), {
    [`deckPortals/${portal.id}/status`]: 'revoked',
    [`deckPortals/${portal.id}/revokedAt`]: revokedAt,
    [`portalByDeck/${authenticatedUser.uid}/${portal.sourceDeckId}`]: null,
  })
  return revoked
}

/** Permanently revokes the prior code and atomically maps a fresh code. */
export async function rotateDeckPortal(
  user: User | null | undefined,
  value: unknown,
  options: DeckPortalExpiryOptions = {},
): Promise<DeckPortalRecord> {
  const authenticatedUser = requireUser(user)
  const { now: rotatedAt, expiresAt } = portalExpiry(options)
  const existing = await getOwnedPortal(authenticatedUser, value)
  if (existing.status !== 'active') throw new Error('A revoked deck portal cannot be rotated')

  let lastError: unknown
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = generatePortalCode()
    if (code === existing.id) continue
    const replacement: DeckPortalRecord = {
      ...existing,
      id: code,
      status: 'active',
      createdAt: rotatedAt,
      expiresAt,
    }
    delete replacement.revokedAt
    try {
      await update(ref(database), {
        [`deckPortals/${existing.id}/status`]: 'revoked',
        [`deckPortals/${existing.id}/revokedAt`]: rotatedAt,
        [`deckPortals/${code}`]: replacement,
        [`portalByDeck/${authenticatedUser.uid}/${existing.sourceDeckId}`]: code,
      })
      return replacement
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to rotate deck portal')
}

export async function getDeckPortalCode(
  user: User | null | undefined,
  sourceDeckIdValue: unknown,
): Promise<string | null> {
  const authenticatedUser = requireUser(user)
  const sourceDeckId = requireFirebaseKey(sourceDeckIdValue, 'sourceDeckId')
  const value: unknown = (await get(
    ref(database, `portalByDeck/${authenticatedUser.uid}/${sourceDeckId}`),
  )).val()
  return typeof value === 'string' && normalizePortalCode(value) === value ? value : null
}
