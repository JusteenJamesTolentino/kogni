import type { User } from 'firebase/auth'
import { get, ref, runTransaction, update } from 'firebase/database'
import type { TransactionResult } from 'firebase/database'
import { database } from './firebase'
import { isRecord } from './errors'
import { hasCompleteStudyGuideCoverage, STUDY_GUIDE_COVERAGE } from './studyGuideCoverage'
import type {
  OnlineDeckAccessGrant,
  OnlineDeckCard,
  OnlineDeckHead,
  OnlineDeckOfflinePolicy,
  OnlineDeckOfflineSnapshot,
  OnlineDeckRecord,
  OnlineDeckStatus,
  OnlineDeckVersion,
  OnlineDeckVisibility,
} from '../types/domain'

export const ONLINE_DECK_MAX_CARDS = 500
export const ONLINE_DECK_MAX_OFFLINE_QUESTIONS = 500

const MAX_ID_LENGTH = 200
const MAX_TITLE_LENGTH = 160
const MAX_DESCRIPTION_LENGTH = 2000
const MAX_STUDY_GUIDE_LENGTH = 8000
const MAX_CARD_TEXT_LENGTH = 10000
const MAX_DISTRACTORS = 10

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

function cleanString(value: unknown, maxLength: number): string {
  return Array.from(String(value ?? ''))
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .trim()
    .slice(0, maxLength)
}

function cleanMultilineString(value: unknown, maxLength: number): string {
  return Array.from(String(value ?? ''))
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code === 9 || code === 10 || code === 13 || code >= 32
    })
    .join('')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength)
}

function requireVersion(value: unknown, label = 'version'): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`)
  }
  return value
}

function normalizeSeriesLink(seriesIdValue: unknown, partNumberValue: unknown): { seriesId: string; partNumber: number } | null {
  if (seriesIdValue === undefined && partNumberValue === undefined) return null
  const seriesId = requireKey(seriesIdValue, 'seriesId')
  if (typeof partNumberValue !== 'number' || !Number.isSafeInteger(partNumberValue) || partNumberValue < 1) {
    throw new TypeError('partNumber must be a positive safe integer')
  }
  return { seriesId, partNumber: partNumberValue }
}

function requireTimestamp(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative finite timestamp`)
  }
  return Math.trunc(value)
}

function requireVisibility(value: unknown): OnlineDeckVisibility {
  if (value !== 'private' && value !== 'unlisted' && value !== 'public') {
    throw new TypeError('visibility must be private, unlisted, or public')
  }
  return value
}

function normalizeOfflinePolicy(value: unknown): OnlineDeckOfflinePolicy {
  if (!isRecord(value) || typeof value.allowed !== 'boolean') {
    throw new TypeError('offlinePolicy.allowed must be a boolean')
  }
  const maxQuestions = value.maxQuestions
  if (
    !Number.isSafeInteger(maxQuestions) ||
    typeof maxQuestions !== 'number' ||
    maxQuestions < 0 ||
    maxQuestions > ONLINE_DECK_MAX_OFFLINE_QUESTIONS ||
    (value.allowed && maxQuestions < 30) ||
    (!value.allowed && maxQuestions !== 0)
  ) {
    throw new RangeError(
      `offlinePolicy.maxQuestions must be ${value.allowed ? '30' : '0'} to ${value.allowed ? ONLINE_DECK_MAX_OFFLINE_QUESTIONS : '0'}`,
    )
  }
  return { allowed: value.allowed, maxQuestions }
}

export interface OnlineDeckCardInput {
  id: unknown
  question: unknown
  answer: unknown
  distractors?: unknown
}

export interface OnlineDeckContentInput {
  title: unknown
  description?: unknown
  studyGuide?: unknown
  cards: OnlineDeckCardInput[]
}

export interface CreateOnlineDeckInput extends OnlineDeckContentInput {
  deckId: unknown
  expectedBaseVersion: 0
  visibility: OnlineDeckVisibility
  offlinePolicy: OnlineDeckOfflinePolicy
  seriesId?: unknown
  partNumber?: unknown
  now?: number
}

export interface PublishOnlineDeckInput extends OnlineDeckContentInput {
  expectedBaseVersion: number
  now?: number
}

function sameContent(left: OnlineDeckCard, right: Omit<OnlineDeckCard, 'contentRevision'>): boolean {
  return left.question === right.question &&
    left.answer === right.answer &&
    left.distractors.length === right.distractors.length &&
    left.distractors.every((item, index) => item === right.distractors[index])
}

function orderedCards(version: OnlineDeckVersion | undefined): OnlineDeckCard[] {
  if (!version) return []
  return Object.values(version.cards).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

function buildVersion(
  deckId: string,
  ownerId: string,
  baseVersion: number,
  input: OnlineDeckContentInput,
  previous: OnlineDeckVersion | undefined,
  publishedAt: number,
): OnlineDeckVersion {
  if (!Array.isArray(input.cards) || input.cards.length < 1 || input.cards.length > ONLINE_DECK_MAX_CARDS) {
    throw new RangeError(`cards must contain 1 to ${ONLINE_DECK_MAX_CARDS} items`)
  }
  const title = cleanString(input.title, MAX_TITLE_LENGTH)
  if (!title) throw new TypeError('title must not be empty')
  const description = cleanString(input.description, MAX_DESCRIPTION_LENGTH)
  const studyGuide = cleanMultilineString(input.studyGuide, MAX_STUDY_GUIDE_LENGTH)
  const cards: Record<string, OnlineDeckCard> = {}
  const cardOrder: Record<string, string> = {}

  input.cards.forEach((candidate, order) => {
    if (!isRecord(candidate)) throw new TypeError(`cards[${order}] must be an object`)
    const id = requireKey(candidate.id, `cards[${order}].id`)
    if (cards[id]) throw new TypeError(`Duplicate card id: ${id}`)
    const distractors = Array.isArray(candidate.distractors)
      ? candidate.distractors.slice(0, MAX_DISTRACTORS).map((item) => cleanString(item, MAX_CARD_TEXT_LENGTH))
      : []
    const withoutRevision = {
      id,
      order,
      question: cleanString(candidate.question, MAX_CARD_TEXT_LENGTH),
      answer: cleanString(candidate.answer, MAX_CARD_TEXT_LENGTH),
      distractors,
    }
    const prior = previous?.cards[id]
    cards[id] = {
      ...withoutRevision,
      contentRevision: prior ? prior.contentRevision + (sameContent(prior, withoutRevision) ? 0 : 1) : 1,
    }
    cardOrder[String(order)] = id
  })

  const orderedCardValues = Object.values(cards)
  const coverage = studyGuide && hasCompleteStudyGuideCoverage(studyGuide, orderedCardValues)
    ? STUDY_GUIDE_COVERAGE
    : undefined

  return {
    deckId,
    ownerId,
    version: baseVersion + 1,
    baseVersion,
    title,
    description,
    ...(studyGuide ? { studyGuide } : {}),
    ...(coverage ? { studyGuideCoverage: coverage } : {}),
    cardCount: input.cards.length,
    publishedAt,
    cardOrder,
    cards,
  }
}

function isOnlineDeckVersion(value: unknown): value is OnlineDeckVersion {
  if (!isRecord(value) || !isRecord(value.cards) || !isRecord(value.cardOrder)) return false
  const cards = Object.values(value.cards)
  return typeof value.deckId === 'string' &&
    typeof value.ownerId === 'string' &&
    Number.isSafeInteger(value.version) &&
    Number.isSafeInteger(value.baseVersion) &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.cardCount === 'number' &&
    value.cardCount === cards.length &&
    typeof value.publishedAt === 'number' &&
    cards.every((card) => isRecord(card) && typeof card.id === 'string' &&
      typeof card.order === 'number' && typeof card.contentRevision === 'number' &&
      typeof card.question === 'string' && typeof card.answer === 'string' &&
      Array.isArray(card.distractors) && card.distractors.every((item) => typeof item === 'string'))
}

function isOnlineDeckHead(value: unknown): value is OnlineDeckHead {
  return isRecord(value) && typeof value.id === 'string' && typeof value.ownerId === 'string' &&
    (value.visibility === 'private' || value.visibility === 'unlisted' || value.visibility === 'public') &&
    (value.status === 'active' || value.status === 'archived' || value.status === 'deleted') &&
    Number.isSafeInteger(value.latestVersion) && typeof value.title === 'string' &&
    typeof value.description === 'string' && typeof value.cardCount === 'number' &&
    isRecord(value.offlinePolicy) && typeof value.offlinePolicy.allowed === 'boolean' &&
    typeof value.offlinePolicy.maxQuestions === 'number' && typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number' &&
    ((value.seriesId === undefined && value.partNumber === undefined) ||
      (typeof value.seriesId === 'string' && Number.isSafeInteger(value.partNumber) &&
        typeof value.partNumber === 'number' && value.partNumber >= 1 && value.cardCount === 30))
}

function readDeckRecord(value: unknown): OnlineDeckRecord | null {
  if (!isRecord(value) || !isOnlineDeckHead(value.head)) return null
  const versions: Record<string, OnlineDeckVersion> = {}
  if (value.versions !== undefined) {
    if (!isRecord(value.versions)) return null
    for (const [key, version] of Object.entries(value.versions)) {
      if (!isOnlineDeckVersion(version) || String(version.version) !== key) return null
      versions[key] = version
    }
  }
  return { head: value.head, ...(Object.keys(versions).length ? { versions } : {}) }
}

function transactionRecord(result: TransactionResult): OnlineDeckRecord {
  if (!result.committed) throw new Error('The online deck transaction was not committed')
  const record = readDeckRecord(result.snapshot.val())
  if (!record) throw new Error('The online deck transaction returned invalid data')
  return record
}

/** Builds a validated initial deck record without writing it. This is used by
 * root-level atomic publication flows such as series continuation publishing. */
export function buildOnlineDeckRecord(
  user: User | null | undefined,
  input: CreateOnlineDeckInput,
): OnlineDeckRecord {
  const authenticatedUser = requireUser(user)
  if (!isRecord(input) || input.expectedBaseVersion !== 0) {
    throw new TypeError('expectedBaseVersion must be 0 when creating a deck')
  }
  const deckId = requireKey(input.deckId, 'deckId')
  const visibility = requireVisibility(input.visibility)
  const offlinePolicy = normalizeOfflinePolicy(input.offlinePolicy)
  const seriesLink = input.seriesId === undefined && input.partNumber === undefined
    ? null
    : normalizeSeriesLink(input.seriesId, input.partNumber)
  const now = requireTimestamp(input.now ?? Date.now(), 'now')
  const version = buildVersion(deckId, authenticatedUser.uid, 0, input, undefined, now)
  if (seriesLink && version.cardCount !== 30) throw new RangeError('Series parts must contain exactly 30 cards')
  const head: OnlineDeckHead = {
    id: deckId,
    ownerId: authenticatedUser.uid,
    visibility,
    status: 'active',
    latestVersion: 1,
    title: version.title,
    description: version.description,
    cardCount: version.cardCount,
    offlinePolicy,
    createdAt: now,
    updatedAt: now,
    ...(seriesLink ?? {}),
  }
  return { head, versions: { '1': version } }
}

/** Atomically creates a head and immutable version 1 from expected base version 0. */
export async function createOnlineDeck(
  user: User | null | undefined,
  input: CreateOnlineDeckInput,
): Promise<OnlineDeckRecord> {
  const record = buildOnlineDeckRecord(user, input)
  const result = await runTransaction(ref(database, `onlineDecks/${record.head.id}`), (current) =>
    current === null ? record : undefined,
  )
  return transactionRecord(result)
}

/** Publishes exactly one successor. A stale expected base aborts without writing. */
export async function publishOnlineDeckVersion(
  user: User | null | undefined,
  deckIdValue: unknown,
  input: PublishOnlineDeckInput,
): Promise<OnlineDeckRecord> {
  const authenticatedUser = requireUser(user)
  const deckId = requireKey(deckIdValue, 'deckId')
  if (!isRecord(input)) throw new TypeError('input must be an object')
  const expectedBaseVersion = requireVersion(input.expectedBaseVersion, 'expectedBaseVersion')
  const now = requireTimestamp(input.now ?? Date.now(), 'now')
  let abortReason = 'Online deck not found'

  const result = await runTransaction(ref(database, `onlineDecks/${deckId}`), (current) => {
    const record = readDeckRecord(current)
    if (!record) return undefined
    if (record.head.ownerId !== authenticatedUser.uid) {
      abortReason = 'Only the deck owner can publish a version'
      return undefined
    }
    if (record.head.status !== 'active') {
      abortReason = 'Only an active deck can be published'
      return undefined
    }
    if (record.head.latestVersion !== expectedBaseVersion) {
      abortReason = `Stale base version: expected ${expectedBaseVersion}, current ${record.head.latestVersion}`
      return undefined
    }
    const previous = record.versions?.[String(expectedBaseVersion)]
    if (!previous) {
      abortReason = 'The expected base version is unavailable'
      return undefined
    }
    const version = buildVersion(deckId, authenticatedUser.uid, expectedBaseVersion, input, previous, now)
    return {
      ...record,
      head: {
        ...record.head,
        latestVersion: version.version,
        title: version.title,
        description: version.description,
        cardCount: version.cardCount,
        updatedAt: now,
      },
      versions: { ...record.versions, [String(version.version)]: version },
    }
  })
  if (!result.committed) throw new Error(abortReason)
  return transactionRecord(result)
}

export interface UpdateOnlineDeckPolicyInput {
  visibility?: OnlineDeckVisibility
  offlinePolicy?: OnlineDeckOfflinePolicy
  now?: number
}

export async function updateOnlineDeckPolicy(
  user: User | null | undefined,
  deckIdValue: unknown,
  input: UpdateOnlineDeckPolicyInput,
): Promise<OnlineDeckHead> {
  const authenticatedUser = requireUser(user)
  const deckId = requireKey(deckIdValue, 'deckId')
  const now = requireTimestamp(input.now ?? Date.now(), 'now')
  const result = await runTransaction(ref(database, `onlineDecks/${deckId}/head`), (current) => {
    if (!isOnlineDeckHead(current) || current.ownerId !== authenticatedUser.uid || current.status === 'deleted') return undefined
    return {
      ...current,
      ...(input.visibility === undefined ? {} : { visibility: requireVisibility(input.visibility) }),
      ...(input.offlinePolicy === undefined ? {} : { offlinePolicy: normalizeOfflinePolicy(input.offlinePolicy) }),
      updatedAt: now,
    }
  })
  if (!result.committed || !isOnlineDeckHead(result.snapshot.val())) throw new Error('Online deck policy update denied')
  return result.snapshot.val() as OnlineDeckHead
}

export async function setOnlineDeckStatus(
  user: User | null | undefined,
  deckIdValue: unknown,
  status: OnlineDeckStatus,
  nowValue: number = Date.now(),
): Promise<OnlineDeckHead> {
  const authenticatedUser = requireUser(user)
  const deckId = requireKey(deckIdValue, 'deckId')
  if (status !== 'active' && status !== 'archived' && status !== 'deleted') throw new TypeError('Invalid deck status')
  const now = requireTimestamp(nowValue, 'now')
  const result = await runTransaction(ref(database, `onlineDecks/${deckId}/head`), (current) => {
    if (!isOnlineDeckHead(current) || current.ownerId !== authenticatedUser.uid || current.status === 'deleted') return undefined
    if (status === 'active' && current.status !== 'archived') return undefined
    return {
      ...current,
      status,
      updatedAt: now,
      ...(status === 'archived' ? { archivedAt: now } : {}),
      ...(status === 'active' ? { archivedAt: null } : {}),
      ...(status === 'deleted' ? { deletedAt: now, visibility: 'private' as const } : {}),
    }
  })
  if (!result.committed || !isOnlineDeckHead(result.snapshot.val())) throw new Error('Online deck status update denied')
  return result.snapshot.val() as OnlineDeckHead
}

/** Grants private-deck read access. Visibility rules still deny archived/deleted decks to viewers. */
export async function grantOnlineDeckAccess(
  user: User | null | undefined,
  deckIdValue: unknown,
  viewerUidValue: unknown,
  nowValue: number = Date.now(),
): Promise<OnlineDeckAccessGrant> {
  const authenticatedUser = requireUser(user)
  const deckId = requireKey(deckIdValue, 'deckId')
  const uid = requireKey(viewerUidValue, 'viewerUid')
  const headValue: unknown = (await get(ref(database, `onlineDecks/${deckId}/head`))).val()
  if (!isOnlineDeckHead(headValue) || headValue.ownerId !== authenticatedUser.uid || headValue.status === 'deleted') {
    throw new Error('Only the owner of a non-deleted deck can grant access')
  }
  const grant: OnlineDeckAccessGrant = {
    deckId,
    uid,
    grantedBy: authenticatedUser.uid,
    grantedAt: requireTimestamp(nowValue, 'now'),
  }
  await update(ref(database), { [`onlineDeckAccess/${deckId}/${uid}`]: grant })
  return grant
}

export async function revokeOnlineDeckAccess(
  user: User | null | undefined,
  deckIdValue: unknown,
  viewerUidValue: unknown,
): Promise<void> {
  const authenticatedUser = requireUser(user)
  const deckId = requireKey(deckIdValue, 'deckId')
  const uid = requireKey(viewerUidValue, 'viewerUid')
  const headValue: unknown = (await get(ref(database, `onlineDecks/${deckId}/head`))).val()
  if (!isOnlineDeckHead(headValue) || headValue.ownerId !== authenticatedUser.uid) {
    throw new Error('Only the deck owner can revoke access')
  }
  await update(ref(database), { [`onlineDeckAccess/${deckId}/${uid}`]: null })
}

export async function getOnlineDeckHead(deckIdValue: unknown): Promise<OnlineDeckHead | null> {
  const deckId = requireKey(deckIdValue, 'deckId')
  const value: unknown = (await get(ref(database, `onlineDecks/${deckId}/head`))).val()
  return isOnlineDeckHead(value) ? value : null
}

export async function getOnlineDeckVersion(
  deckIdValue: unknown,
  versionValue: unknown,
): Promise<OnlineDeckVersion | null> {
  const deckId = requireKey(deckIdValue, 'deckId')
  const version = requireVersion(versionValue)
  const value: unknown = (await get(ref(database, `onlineDecks/${deckId}/versions/${version}`))).val()
  return isOnlineDeckVersion(value) ? value : null
}

/** Selects the first N published cards by canonical order, never randomly. */
export function selectOnlineDeckOfflineSnapshot(
  head: OnlineDeckHead,
  version: OnlineDeckVersion,
  savedByUidValue: unknown,
  saverQuestionLimitValue: unknown,
  savedAtValue: number = Date.now(),
): OnlineDeckOfflineSnapshot {
  if (!isOnlineDeckHead(head) || !isOnlineDeckVersion(version) || head.id !== version.deckId) {
    throw new TypeError('A matching online deck head and version are required')
  }
  if (!head.offlinePolicy.allowed) throw new Error('The creator does not allow offline snapshots')
  const savedByUid = requireKey(savedByUidValue, 'savedByUid')
  if (!Number.isSafeInteger(saverQuestionLimitValue) || typeof saverQuestionLimitValue !== 'number' || saverQuestionLimitValue < 1) {
    throw new RangeError('saverQuestionLimit must be a positive safe integer')
  }
  const selectedCount = Math.min(
    saverQuestionLimitValue,
    head.offlinePolicy.maxQuestions,
    version.cardCount,
  )
  return {
    provenance: {
      source: 'online-deck',
      deckId: head.id,
      ownerId: head.ownerId,
      version: version.version,
      savedByUid,
      savedAt: requireTimestamp(savedAtValue, 'savedAt'),
      creatorMaxQuestions: head.offlinePolicy.maxQuestions,
      saverQuestionLimit: saverQuestionLimitValue,
      selectedQuestionCount: selectedCount,
      ...(head.seriesId && head.partNumber
        ? { seriesId: head.seriesId, partNumber: head.partNumber }
        : {}),
    },
    title: version.title,
    description: version.description,
    ...(version.studyGuide ? { studyGuide: version.studyGuide } : {}),
    cards: orderedCards(version).slice(0, selectedCount),
  }
}
