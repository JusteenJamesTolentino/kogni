import { get, ref, update } from 'firebase/database'
import type { User } from 'firebase/auth'
import { database } from './firebase'
import { authenticatedRequest } from './vercel-api'
import type { ApiRequestOptions } from './vercel-api'
import { isRecord } from './errors'

/**
 * Quiz-code helpers and strict browser contracts for the school quiz system.
 * Codes are 4-4 alphanumeric (`XXXX-XXXX`) so teacher-shared URLs like
 * /quiz?code=ABCD-EFGH are easy to type.
 */

export const QUIZ_LIMITS = Object.freeze({
  maxQuestions: 50,
  minQuestions: 1,
  maxPromptLength: 500,
  minChoices: 2,
  maxChoices: 4,
  maxChoiceLength: 200,
  maxTitleLength: 160,
  maxDescriptionLength: 2000,
})

export const QUIZ_INTEGRITY_NOTICE_VERSION = 'quiz-integrity-v1' as const
export const QUIZ_QUESTION_DURATION_MS = 30_000
export const QUIZ_INTEGRITY_EVENT_BATCH_LIMIT = 20
export const QUIZ_INTEGRITY_TIMELINE_LIMIT = 200

/** Unambiguous code alphabet (no 0/O/1/I/L) so hand-typed classroom codes stay readable. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const QUIZ_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/
const QUESTION_ID_PATTERN = /^q_(0|[1-9][0-9]?)$/
const UID_PATTERN = /^[^.#$[\]/]{1,128}$/
const QUIZ_PASS_PERCENT = 70

export interface QuizDraftQuestion {
  prompt: string
  choices: string[]
  correctIndex: number
}

/** Persisted only when Integrity Mode is enabled; omission means disabled. */
export interface QuizIntegrityPolicy {
  enabled: true
  noticeVersion: typeof QUIZ_INTEGRITY_NOTICE_VERSION
  authorityAcknowledgedAt: number
}

/** Safe student-facing policy projection; authority acknowledgement is never exposed. */
export interface QuizIntegrityView {
  enabled: boolean
  noticeVersion: typeof QUIZ_INTEGRITY_NOTICE_VERSION
}

export interface CreatedQuiz {
  quizId: string
  code: string
  title: string
  createdAt: number
  integrityMode: boolean
}

export interface OwnedQuizSummary {
  quizId: string
  code: string
  title: string
  createdAt: number
  integrityMode: boolean
}

function hasExactFields(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const allowed = new Set([...required, ...optional])
  const keys = Object.keys(value)
  return required.every((field) => Object.hasOwn(value, field)) && keys.every((field) => allowed.has(field))
}

function isSafeIntegerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum
}

const MAX_JAVASCRIPT_DATE_MS = 8_640_000_000_000_000

function isTimestamp(value: unknown): value is number {
  return isSafeIntegerBetween(value, 0, MAX_JAVASCRIPT_DATE_MS)
}

function isBoundedString(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === 'string' && value.length >= minimum && value.length <= maximum
}

function requirePattern(value: unknown, label: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new TypeError(`${label} is invalid`)
  }
  return value
}

export function isQuizIntegrityPolicy(value: unknown): value is QuizIntegrityPolicy {
  return hasExactFields(value, ['enabled', 'noticeVersion', 'authorityAcknowledgedAt']) &&
    value.enabled === true &&
    value.noticeVersion === QUIZ_INTEGRITY_NOTICE_VERSION &&
    isTimestamp(value.authorityAcknowledgedAt)
}

/** Uppercases and strips separators; returns null unless exactly 8 alphanumeric characters remain. */
export function normalizeQuizCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z0-9]{8}$/.test(compact) ? `${compact.slice(0, 4)}-${compact.slice(4)}` : null
}

/** Formats a normalized code for display while the user types. */
export function formatQuizCodeInput(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  return compact.length > 4 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact
}

function requireQuizOwner(user: User | null | undefined): User {
  if (!user || typeof user.uid !== 'string' || !user.uid) {
    throw new TypeError('An authenticated teacher is required')
  }
  return user
}

function randomCodeToken(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
}

export function validateQuizDraft(title: string, description: string, questions: QuizDraftQuestion[]): void {
  const trimmedTitle = title.trim()
  if (!trimmedTitle || trimmedTitle.length > QUIZ_LIMITS.maxTitleLength) {
    throw new TypeError(`Quiz title must be 1 to ${QUIZ_LIMITS.maxTitleLength} characters.`)
  }
  if (description.length > QUIZ_LIMITS.maxDescriptionLength) {
    throw new TypeError(`Quiz description must be at most ${QUIZ_LIMITS.maxDescriptionLength} characters.`)
  }
  if (questions.length < QUIZ_LIMITS.minQuestions || questions.length > QUIZ_LIMITS.maxQuestions) {
    throw new TypeError(`A quiz needs ${QUIZ_LIMITS.minQuestions} to ${QUIZ_LIMITS.maxQuestions} questions.`)
  }
  questions.forEach((question, index) => {
    const label = `Question ${index + 1}`
    if (!question.prompt.trim() || question.prompt.length > QUIZ_LIMITS.maxPromptLength) {
      throw new TypeError(`${label} needs a prompt of 1 to ${QUIZ_LIMITS.maxPromptLength} characters.`)
    }
    if (question.choices.length < QUIZ_LIMITS.minChoices || question.choices.length > QUIZ_LIMITS.maxChoices) {
      throw new TypeError(`${label} needs ${QUIZ_LIMITS.minChoices} to ${QUIZ_LIMITS.maxChoices} choices.`)
    }
    if (question.choices.some((choice) => !choice.trim() || choice.length > QUIZ_LIMITS.maxChoiceLength)) {
      throw new TypeError(`${label} has an empty or oversized choice.`)
    }
    const normalizedChoices = question.choices.map((choice) => choice.trim().toLowerCase())
    if (new Set(normalizedChoices).size !== normalizedChoices.length) {
      throw new TypeError(`${label} has duplicate choices.`)
    }
    if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex >= question.choices.length) {
      throw new TypeError(`${label} needs its correct answer marked.`)
    }
  })
}

function generateCode(): string {
  const token = randomCodeToken()
  return `${token.slice(0, 4)}-${token.slice(4)}`
}

function isPermissionDeniedError(value: unknown): boolean {
  return isRecord(value) && (
    value.code === 'PERMISSION_DENIED' || value.code === 'permission_denied' || value.code === 'database/permission-denied' ||
    (typeof value.message === 'string' && /permission[_ -]?denied/i.test(value.message))
  )
}

/**
 * Creates a quiz atomically. Integrity policy is opt-in and omitted entirely for
 * ordinary and legacy-compatible quizzes.
 */
export async function createQuiz(
  user: User | null | undefined,
  title: string,
  description: string,
  questions: QuizDraftQuestion[],
  integrity?: QuizIntegrityPolicy,
): Promise<CreatedQuiz> {
  const owner = requireQuizOwner(user)
  validateQuizDraft(title, description, questions)
  if (integrity !== undefined && !isQuizIntegrityPolicy(integrity)) {
    throw new TypeError('Integrity Mode requires a valid authority acknowledgement.')
  }

  const quizId = `quiz_${crypto.randomUUID()}`
  const trimmedTitle = title.trim()
  const now = Date.now()
  const questionMap: Record<string, { prompt: string; choices: string[] }> = {}
  const correct: Record<string, number> = {}
  questions.forEach((question, index) => {
    const questionId = `q_${index}`
    questionMap[questionId] = {
      prompt: question.prompt.trim(),
      choices: question.choices.map((choice) => choice.trim()),
    }
    correct[questionId] = question.correctIndex
  })

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode()
    const integrityFields = integrity ? { integrity: { ...integrity } } : {}
    try {
      await update(ref(database), {
        [`quizzes/${quizId}`]: {
          id: quizId,
          ownerId: owner.uid,
          title: trimmedTitle,
          description: description.trim(),
          questionCount: questions.length,
          questions: questionMap,
          createdAt: now,
          updatedAt: now,
          ...integrityFields,
        },
        [`quizAnswers/${quizId}`]: { ownerId: owner.uid, correct },
        [`quizCodes/${code}`]: { quizId, ownerId: owner.uid, createdAt: now },
        [`quizzesByOwner/${owner.uid}/${quizId}`]: {
          code,
          title: trimmedTitle,
          createdAt: now,
          ...integrityFields,
        },
      })
      return { quizId, code, title: trimmedTitle, createdAt: now, integrityMode: Boolean(integrity) }
    } catch (cause: unknown) {
      if (!isPermissionDeniedError(cause) || attempt === 4) throw cause
      // A code collision denies the atomic write. Retry with a new code. Other
      // permission failures are bounded to five attempts before surfacing.
    }
  }
  throw new Error('Could not find a free quiz code. Try again.')
}

/** Reads the signed-in teacher's own quiz index for the hub list. */
export async function listOwnedQuizzes(uid: string): Promise<OwnedQuizSummary[]> {
  const value: unknown = (await get(ref(database, `quizzesByOwner/${uid}`))).val()
  if (!isRecord(value)) return []
  return Object.entries(value)
    .filter((entry) => {
      const record = entry[1]
      return isRecord(record) &&
        typeof record.code === 'string' &&
        typeof record.title === 'string' &&
        typeof record.createdAt === 'number'
    })
    .map(([quizId, value]) => {
      const record = value as Record<string, unknown>
      return {
        quizId,
        code: record.code as string,
        title: record.title as string,
        createdAt: record.createdAt as number,
        integrityMode: isQuizIntegrityPolicy(record.integrity),
      }
    })
    .sort((left, right) => right.createdAt - left.createdAt)
}

// ---------------------------------------------------------------------------
// Student-safe quiz content and graded results.
// ---------------------------------------------------------------------------

export interface QuizQuestionView {
  id: string
  prompt: string
  choices: string[]
}

export interface GradedQuestionView {
  id: string
  prompt: string
  choices: string[]
  chosenIndex: number
  correctIndex: number
  correct: boolean
}

export interface QuizIntegritySummary {
  eventCount: number
  monitoringLimited: boolean
  deleteAfter: number
}

export interface QuizAttemptResult {
  uid: string
  nickname: string
  quizId: string
  quizTitle: string
  answers?: Record<string, number>
  correctCount: number
  questionCount: number
  score: number
  passed: boolean
  gradedAt: number
  breakdown: GradedQuestionView[]
  integritySummary?: QuizIntegritySummary
}

export interface QuizRankStats {
  quizzesTaken: number
  quizzesPassed: number
  currentStreak: number
  bestStreak: number
  totalCorrect: number
  totalQuestions: number
  lifetimeAccuracy: number
}

function hasValidChoices(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length < QUIZ_LIMITS.minChoices || value.length > QUIZ_LIMITS.maxChoices) return false
  if (!value.every((choice) => isBoundedString(choice, 1, QUIZ_LIMITS.maxChoiceLength) && choice.trim().length > 0)) return false
  const normalized = value.map((choice) => choice.trim().toLowerCase())
  return new Set(normalized).size === normalized.length
}

function isQuizQuestionView(value: unknown): value is QuizQuestionView {
  return hasExactFields(value, ['id', 'prompt', 'choices']) &&
    typeof value.id === 'string' && QUESTION_ID_PATTERN.test(value.id) &&
    isBoundedString(value.prompt, 1, QUIZ_LIMITS.maxPromptLength) && value.prompt.trim().length > 0 &&
    hasValidChoices(value.choices)
}

function isQuizIntegritySummary(value: unknown): value is QuizIntegritySummary {
  return hasExactFields(value, ['eventCount', 'monitoringLimited', 'deleteAfter']) &&
    isSafeIntegerBetween(value.eventCount, 0, Number.MAX_SAFE_INTEGER) &&
    typeof value.monitoringLimited === 'boolean' &&
    isTimestamp(value.deleteAfter)
}

function isGradedQuestionView(value: unknown): value is GradedQuestionView {
  if (!hasExactFields(value, ['id', 'prompt', 'choices', 'chosenIndex', 'correctIndex', 'correct'])) return false
  if (
    typeof value.id !== 'string' || !QUESTION_ID_PATTERN.test(value.id) ||
    !isBoundedString(value.prompt, 1, QUIZ_LIMITS.maxPromptLength) || !value.prompt.trim() ||
    !hasValidChoices(value.choices) ||
    !isSafeIntegerBetween(value.chosenIndex, -1, value.choices.length - 1) ||
    !isSafeIntegerBetween(value.correctIndex, 0, value.choices.length - 1) ||
    typeof value.correct !== 'boolean'
  ) return false
  return value.correct === (value.chosenIndex === value.correctIndex)
}

function isAnswerMap(value: unknown, questionIds: ReadonlySet<string>): value is Record<string, number> {
  if (!isRecord(value)) return false
  const entries = Object.entries(value)
  if (entries.length > questionIds.size) return false
  return entries.every(([questionId, chosenIndex]) =>
    questionIds.has(questionId) && isSafeIntegerBetween(chosenIndex, -1, QUIZ_LIMITS.maxChoices - 1),
  )
}

export function isQuizAttemptResult(value: unknown): value is QuizAttemptResult {
  if (!hasExactFields(
    value,
    ['uid', 'nickname', 'quizId', 'quizTitle', 'correctCount', 'questionCount', 'score', 'passed', 'gradedAt', 'breakdown'],
    ['answers', 'integritySummary'],
  )) return false
  if (
    typeof value.uid !== 'string' || !UID_PATTERN.test(value.uid) ||
    !isBoundedString(value.nickname, 1, 80) ||
    typeof value.quizId !== 'string' || !QUIZ_ID_PATTERN.test(value.quizId) ||
    !isBoundedString(value.quizTitle, 0, QUIZ_LIMITS.maxTitleLength) ||
    !isSafeIntegerBetween(value.questionCount, 1, QUIZ_LIMITS.maxQuestions) ||
    !isSafeIntegerBetween(value.correctCount, 0, value.questionCount) ||
    !isSafeIntegerBetween(value.score, 0, 100) ||
    typeof value.passed !== 'boolean' || value.passed !== (value.score >= QUIZ_PASS_PERCENT) ||
    !isTimestamp(value.gradedAt) ||
    !Array.isArray(value.breakdown) || value.breakdown.length !== value.questionCount ||
    (value.integritySummary !== undefined && !isQuizIntegritySummary(value.integritySummary))
  ) return false

  const seen = new Set<string>()
  let actualCorrect = 0
  for (const question of value.breakdown) {
    if (!isGradedQuestionView(question) || seen.has(question.id)) return false
    seen.add(question.id)
    if (question.correct) actualCorrect += 1
  }
  if (actualCorrect !== value.correctCount) return false
  if (Math.round((actualCorrect / value.questionCount) * 100) !== value.score) return false
  if (value.answers !== undefined && !isAnswerMap(value.answers, seen)) return false
  return value.integritySummary === undefined || value.integritySummary.deleteAfter >= value.gradedAt
}

export function isQuizRankStats(value: unknown): value is QuizRankStats {
  if (!hasExactFields(value, [
    'quizzesTaken', 'quizzesPassed', 'currentStreak', 'bestStreak',
    'totalCorrect', 'totalQuestions', 'lifetimeAccuracy',
  ])) return false
  if (
    !isSafeIntegerBetween(value.quizzesTaken, 0, Number.MAX_SAFE_INTEGER) ||
    !isSafeIntegerBetween(value.quizzesPassed, 0, value.quizzesTaken) ||
    !isSafeIntegerBetween(value.currentStreak, 0, value.quizzesPassed) ||
    !isSafeIntegerBetween(value.bestStreak, value.currentStreak, value.quizzesPassed) ||
    !isSafeIntegerBetween(value.totalQuestions, 0, Number.MAX_SAFE_INTEGER) ||
    !isSafeIntegerBetween(value.totalCorrect, 0, value.totalQuestions) ||
    !isSafeIntegerBetween(value.lifetimeAccuracy, 0, 100)
  ) return false
  const expectedAccuracy = value.totalQuestions > 0
    ? Math.round((value.totalCorrect / value.totalQuestions) * 100)
    : 0
  return value.lifetimeAccuracy === expectedAccuracy
}

export interface QuizResolutionMetadata {
  quizId: string
  title: string
  description: string
  questionCount: number
  integrity: QuizIntegrityView
}

export type ResolveQuizCodeResponse =
  | { status: 'available' | 'active'; code: string; quiz: QuizResolutionMetadata }
  | { status: 'completed'; code: string; quiz: QuizResolutionMetadata; result: QuizAttemptResult; stats?: QuizRankStats }

function isQuizResolutionMetadata(value: unknown): value is QuizResolutionMetadata {
  return hasExactFields(value, ['quizId', 'title', 'description', 'questionCount', 'integrity']) &&
    typeof value.quizId === 'string' && QUIZ_ID_PATTERN.test(value.quizId) &&
    isBoundedString(value.title, 1, QUIZ_LIMITS.maxTitleLength) &&
    isBoundedString(value.description, 0, QUIZ_LIMITS.maxDescriptionLength) &&
    isSafeIntegerBetween(value.questionCount, 1, QUIZ_LIMITS.maxQuestions) &&
    hasExactFields(value.integrity, ['enabled', 'noticeVersion']) &&
    typeof value.integrity.enabled === 'boolean' &&
    value.integrity.noticeVersion === QUIZ_INTEGRITY_NOTICE_VERSION
}

export function isResolveQuizCodeResponse(value: unknown): value is ResolveQuizCodeResponse {
  if (!isRecord(value) || (value.status !== 'available' && value.status !== 'active' && value.status !== 'completed')) return false
  if (typeof value.code !== 'string' || normalizeQuizCode(value.code) !== value.code || !isQuizResolutionMetadata(value.quiz)) return false
  if (value.status === 'completed') {
    return hasExactFields(value, ['status', 'code', 'quiz', 'result'], ['stats']) &&
      isQuizAttemptResult(value.result) &&
      (value.stats === undefined || isQuizRankStats(value.stats))
  }
  return hasExactFields(value, ['status', 'code', 'quiz'])
}

/** Resolves metadata and prior attempt state without downloading any questions. */
export async function resolveQuizCode(codeValue: string, options?: ApiRequestOptions): Promise<ResolveQuizCodeResponse> {
  const code = normalizeQuizCode(codeValue)
  if (!code) throw new TypeError('A quiz code looks like ABCD-EFGH.')
  return authenticatedRequest('/api/quiz/resolve', isResolveQuizCodeResponse, {
    ...options,
    method: 'POST',
    body: { code },
  })
}

// ---------------------------------------------------------------------------
// Authoritative timed-attempt API contracts.
// ---------------------------------------------------------------------------

export type QuizFullscreenStart = 'not-requested' | 'entered' | 'unsupported' | 'denied'
export type QuizFullscreenStartStatus = QuizFullscreenStart

export interface QuizAttemptIntegrityState extends QuizIntegrityView {
  fullscreenStart: QuizFullscreenStart
  deleteAfter?: number
}

export interface QuizAttemptActiveState {
  schemaVersion: 2
  attemptId: string
  sessionId: string
  serverNow: number
  startedAt: number
  questionIndex: number
  questionCount: number
  questionStartedAt: number
  question: QuizQuestionView
  deadlineAt: number
  durationMs: number
  integrity: QuizAttemptIntegrityState
}

export type StartQuizAttemptResponse =
  | { status: 'already'; result: QuizAttemptResult; stats?: QuizRankStats }
  | ({ status: 'started' | 'resumed' } & QuizAttemptActiveState)

export interface AnswerQuizQuestionInput {
  quizId: string
  attemptId: string
  sessionId: string
  questionId: string
  operationId: string
  chosenIndex: number
}

export type QuizAttemptConflictReason = 'session-replaced' | 'operation-reused'

export type AnswerQuizQuestionResponse =
  | ({ status: 'active' } & QuizAttemptActiveState)
  | { status: 'completed'; result: QuizAttemptResult; stats?: QuizRankStats }
  | { status: 'conflict'; reason: QuizAttemptConflictReason }

function isQuizFullscreenStart(value: unknown): value is QuizFullscreenStart {
  return value === 'not-requested' || value === 'entered' || value === 'unsupported' || value === 'denied'
}

function isQuizAttemptIntegrityState(value: unknown): value is QuizAttemptIntegrityState {
  return hasExactFields(value, ['enabled', 'noticeVersion', 'fullscreenStart'], ['deleteAfter']) &&
    typeof value.enabled === 'boolean' &&
    value.noticeVersion === QUIZ_INTEGRITY_NOTICE_VERSION &&
    isQuizFullscreenStart(value.fullscreenStart) &&
    (value.deleteAfter === undefined || isTimestamp(value.deleteAfter))
}

function isActiveAttemptState(value: Record<string, unknown>): value is Record<string, unknown> & QuizAttemptActiveState {
  if (
    value.schemaVersion !== 2 ||
    typeof value.attemptId !== 'string' || !OPAQUE_ID_PATTERN.test(value.attemptId) ||
    typeof value.sessionId !== 'string' || !OPAQUE_ID_PATTERN.test(value.sessionId) ||
    !isTimestamp(value.serverNow) ||
    !isTimestamp(value.startedAt) ||
    !isTimestamp(value.questionStartedAt) ||
    !isSafeIntegerBetween(value.questionCount, 1, QUIZ_LIMITS.maxQuestions) ||
    !isSafeIntegerBetween(value.questionIndex, 0, value.questionCount - 1) ||
    !isQuizQuestionView(value.question) ||
    !isTimestamp(value.deadlineAt) ||
    value.durationMs !== QUIZ_QUESTION_DURATION_MS ||
    !isQuizAttemptIntegrityState(value.integrity)
  ) return false
  if (value.deadlineAt <= value.serverNow || value.deadlineAt - value.serverNow > QUIZ_QUESTION_DURATION_MS) return false
  return value.integrity.deleteAfter === undefined || value.integrity.deleteAfter >= value.serverNow
}

function isResultEnvelope(
  value: Record<string, unknown>,
  status: 'already' | 'completed',
): boolean {
  return value.status === status &&
    isQuizAttemptResult(value.result) &&
    (value.stats === undefined || isQuizRankStats(value.stats))
}

export function isStartQuizAttemptResponse(value: unknown): value is StartQuizAttemptResponse {
  if (!isRecord(value)) return false
  if (value.status === 'already') {
    return hasExactFields(value, ['status', 'result'], ['stats']) && isResultEnvelope(value, 'already')
  }
  if (value.status !== 'started' && value.status !== 'resumed') return false
  if (!hasExactFields(value, [
    'status', 'schemaVersion', 'attemptId', 'sessionId', 'serverNow', 'startedAt', 'questionIndex', 'questionCount',
    'questionStartedAt', 'question', 'deadlineAt', 'durationMs', 'integrity',
  ])) return false
  return isActiveAttemptState(value)
}

export function isAnswerQuizQuestionResponse(value: unknown): value is AnswerQuizQuestionResponse {
  if (!isRecord(value)) return false
  if (value.status === 'active') {
    if (!hasExactFields(value, [
      'status', 'schemaVersion', 'attemptId', 'sessionId', 'serverNow', 'startedAt', 'questionIndex', 'questionCount',
      'questionStartedAt', 'question', 'deadlineAt', 'durationMs', 'integrity',
    ])) return false
    return isActiveAttemptState(value)
  }
  if (value.status === 'completed') {
    return hasExactFields(value, ['status', 'result'], ['stats']) && isResultEnvelope(value, 'completed')
  }
  return hasExactFields(value, ['status', 'reason']) &&
    value.status === 'conflict' &&
    (value.reason === 'session-replaced' || value.reason === 'operation-reused')
}

export async function startQuizAttempt(
  quizIdValue: string,
  sessionIdValue: string,
  fullscreenStart: QuizFullscreenStart,
  options?: ApiRequestOptions,
): Promise<StartQuizAttemptResponse> {
  const quizId = requirePattern(quizIdValue, 'quizId', QUIZ_ID_PATTERN)
  const sessionId = requirePattern(sessionIdValue, 'sessionId', OPAQUE_ID_PATTERN)
  if (!isQuizFullscreenStart(fullscreenStart)) throw new TypeError('fullscreenStart is invalid')
  return authenticatedRequest('/api/quiz/start', isStartQuizAttemptResponse, {
    ...options,
    method: 'POST',
    body: { quizId, sessionId, fullscreenStart },
  })
}

export async function answerQuizQuestion(
  input: AnswerQuizQuestionInput,
  options?: ApiRequestOptions,
): Promise<AnswerQuizQuestionResponse> {
  if (!hasExactFields(input, ['quizId', 'attemptId', 'sessionId', 'questionId', 'operationId', 'chosenIndex'])) {
    throw new TypeError('answer input is invalid')
  }
  const quizId = requirePattern(input.quizId, 'quizId', QUIZ_ID_PATTERN)
  const attemptId = requirePattern(input.attemptId, 'attemptId', OPAQUE_ID_PATTERN)
  const sessionId = requirePattern(input.sessionId, 'sessionId', OPAQUE_ID_PATTERN)
  const questionId = requirePattern(input.questionId, 'questionId', QUESTION_ID_PATTERN)
  const operationId = requirePattern(input.operationId, 'operationId', OPAQUE_ID_PATTERN)
  if (!isSafeIntegerBetween(input.chosenIndex, -1, QUIZ_LIMITS.maxChoices - 1)) {
    throw new TypeError('chosenIndex is invalid')
  }
  return authenticatedRequest('/api/quiz/answer', isAnswerQuizQuestionResponse, {
    ...options,
    method: 'POST',
    body: { quizId, attemptId, sessionId, questionId, operationId, chosenIndex: input.chosenIndex },
  })
}

// ---------------------------------------------------------------------------
// Bounded Integrity Mode signal API contracts.
// ---------------------------------------------------------------------------

export const QUIZ_INTEGRITY_EVENT_TYPES = Object.freeze([
  'page-hidden',
  'fullscreen-ended',
  'connection-interrupted',
  'session-replaced',
  'monitoring-limited',
] as const)

export type QuizIntegrityEventType = typeof QUIZ_INTEGRITY_EVENT_TYPES[number]

export interface QuizIntegrityEventInput {
  eventId: string
  type: QuizIntegrityEventType
  /** Untrusted browser-observed wall-clock timestamp. */
  startedAt: number
  /** Untrusted browser-observed wall-clock timestamp. */
  endedAt?: number
  questionId?: string
  sequence: number
}

export interface QuizIntegrityEventRecord extends QuizIntegrityEventInput {
  receivedAt: number
  durationMs: number
}

export interface RecordQuizIntegrityEventsInput {
  quizId: string
  attemptId: string
  sessionId: string
  events: QuizIntegrityEventInput[]
}

export interface RecordQuizIntegrityEventsResponse {
  acceptedEventIds: string[]
  serverNow: number
}

export interface QuizIntegrityEventsResult {
  summary: QuizIntegritySummary
  events: QuizIntegrityEventRecord[]
}

function isQuizIntegrityEventType(value: unknown): value is QuizIntegrityEventType {
  return typeof value === 'string' && (QUIZ_INTEGRITY_EVENT_TYPES as readonly string[]).includes(value)
}

export function isQuizIntegrityEventInput(value: unknown): value is QuizIntegrityEventInput {
  if (!hasExactFields(value, ['eventId', 'type', 'startedAt', 'sequence'], ['endedAt', 'questionId'])) return false
  return typeof value.eventId === 'string' && OPAQUE_ID_PATTERN.test(value.eventId) &&
    isQuizIntegrityEventType(value.type) &&
    isTimestamp(value.startedAt) &&
    (value.endedAt === undefined || (isTimestamp(value.endedAt) && value.endedAt >= value.startedAt)) &&
    (value.questionId === undefined || (typeof value.questionId === 'string' && QUESTION_ID_PATTERN.test(value.questionId))) &&
    isSafeIntegerBetween(value.sequence, 0, Number.MAX_SAFE_INTEGER)
}

function isQuizIntegrityEventRecord(value: unknown): value is QuizIntegrityEventRecord {
  if (!hasExactFields(
    value,
    ['eventId', 'type', 'startedAt', 'sequence', 'receivedAt', 'durationMs'],
    ['endedAt', 'questionId'],
  )) return false
  const input: unknown = {
    eventId: value.eventId,
    type: value.type,
    startedAt: value.startedAt,
    sequence: value.sequence,
    ...(value.endedAt === undefined ? {} : { endedAt: value.endedAt }),
    ...(value.questionId === undefined ? {} : { questionId: value.questionId }),
  }
  if (
    !isQuizIntegrityEventInput(input) ||
    !isTimestamp(value.receivedAt) ||
    !isSafeIntegerBetween(value.durationMs, 0, Number.MAX_SAFE_INTEGER)
  ) return false
  const observedDuration = input.endedAt === undefined ? 0 : input.endedAt - input.startedAt
  return value.durationMs === observedDuration
}

function hasUniqueOrderedEvents(events: readonly QuizIntegrityEventInput[]): boolean {
  const ids = new Set<string>()
  const sequences = new Set<number>()
  let previousSequence = -1
  for (const event of events) {
    if (ids.has(event.eventId) || sequences.has(event.sequence) || event.sequence <= previousSequence) return false
    ids.add(event.eventId)
    sequences.add(event.sequence)
    previousSequence = event.sequence
  }
  return true
}

export function isRecordQuizIntegrityEventsResponse(value: unknown): value is RecordQuizIntegrityEventsResponse {
  if (!hasExactFields(value, ['acceptedEventIds', 'serverNow'])) return false
  if (!Array.isArray(value.acceptedEventIds) || value.acceptedEventIds.length > QUIZ_INTEGRITY_EVENT_BATCH_LIMIT) return false
  const ids = new Set<string>()
  for (const eventId of value.acceptedEventIds) {
    if (typeof eventId !== 'string' || !OPAQUE_ID_PATTERN.test(eventId) || ids.has(eventId)) return false
    ids.add(eventId)
  }
  return isTimestamp(value.serverNow)
}

export function isQuizIntegrityEventsResult(value: unknown): value is QuizIntegrityEventsResult {
  if (!hasExactFields(value, ['summary', 'events'])) return false
  const summary = value.summary
  const events = value.events
  if (!isQuizIntegritySummary(summary)) return false
  if (!Array.isArray(events) || events.length > QUIZ_INTEGRITY_TIMELINE_LIMIT) return false
  if (!events.every(isQuizIntegrityEventRecord) || !hasUniqueOrderedEvents(events)) return false
  if (summary.eventCount < events.length) return false
  return events.every((event) => event.receivedAt <= summary.deleteAfter)
}

export async function recordQuizIntegrityEvents(
  input: RecordQuizIntegrityEventsInput,
  options?: ApiRequestOptions,
): Promise<RecordQuizIntegrityEventsResponse> {
  if (!hasExactFields(input, ['quizId', 'attemptId', 'sessionId', 'events'])) {
    throw new TypeError('integrity event input is invalid')
  }
  const quizId = requirePattern(input.quizId, 'quizId', QUIZ_ID_PATTERN)
  const attemptId = requirePattern(input.attemptId, 'attemptId', OPAQUE_ID_PATTERN)
  const sessionId = requirePattern(input.sessionId, 'sessionId', OPAQUE_ID_PATTERN)
  if (
    !Array.isArray(input.events) || input.events.length < 1 ||
    input.events.length > QUIZ_INTEGRITY_EVENT_BATCH_LIMIT ||
    !input.events.every(isQuizIntegrityEventInput) ||
    !hasUniqueOrderedEvents(input.events)
  ) {
    throw new TypeError(`events must contain 1 to ${QUIZ_INTEGRITY_EVENT_BATCH_LIMIT} ordered unique events`)
  }
  const events = input.events.map((event) => ({ ...event }))
  const submittedIds = new Set(events.map((event) => event.eventId))
  const validatesAcknowledgement = (value: unknown): value is RecordQuizIntegrityEventsResponse =>
    isRecordQuizIntegrityEventsResponse(value) && value.acceptedEventIds.every((eventId) => submittedIds.has(eventId))
  return authenticatedRequest('/api/quiz/events', validatesAcknowledgement, {
    ...options,
    method: 'POST',
    body: { quizId, attemptId, sessionId, events },
  })
}

export async function getQuizIntegrityEvents(
  quizIdValue: string,
  uidValue: string,
  options?: ApiRequestOptions,
): Promise<QuizIntegrityEventsResult> {
  const quizId = requirePattern(quizIdValue, 'quizId', QUIZ_ID_PATTERN)
  const uid = requirePattern(uidValue, 'uid', UID_PATTERN)
  return authenticatedRequest(
    `/api/quiz/results/${encodeURIComponent(quizId)}/${encodeURIComponent(uid)}/signals`,
    isQuizIntegrityEventsResult,
    options,
  )
}
