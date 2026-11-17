export const QUIZ_TIME_LIMIT_MS = 30_000
export const QUIZ_PASS_PERCENT = 70
export const QUIZ_INTEGRITY_NOTICE_VERSION = 'quiz-integrity-v1'
export const QUIZ_INTEGRITY_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000
export const QUIZ_ANSWER_OPERATION_LIMIT = 128

const QUIZ_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const FIREBASE_KEY_PATTERN = /^[^.#$[\]/\x00-\x1f\x7f]{1,128}$/
const QUESTION_ID_PATTERN = /^q_(0|[1-9][0-9]{0,2})$/

export interface QuizIntegrityConfiguration {
  enabled: boolean
  noticeVersion: typeof QUIZ_INTEGRITY_NOTICE_VERSION
  authorityAcknowledgedAt?: number
}

export interface QuizQuestion {
  id: string
  prompt: string
  choices: string[]
}

/** Canonical, answer-free representation of the immutable RTDB quiz record. */
export interface ParsedQuizRecord {
  id: string
  ownerId: string
  title: string
  description: string
  questionCount: number
  questions: QuizQuestion[]
  createdAt: number
  updatedAt: number
  integrity: QuizIntegrityConfiguration
}

export interface ParsedQuizAnswerKey {
  ownerId: string
  correct: Record<string, number>
}

export interface QuizQuestionTiming {
  questionId: string
  startedAt: number
  deadlineAt: number
  outcome: 'answered' | 'timeout'
  answeredAt?: number
}

export interface QuizAnswerOperationRecord {
  operationId: string
  attemptId: string
  sessionId: string
  questionId: string
  chosenIndex: number
  receivedAt: number
  outcome: 'accepted' | 'expired'
}

export type QuizIntegrityFullscreenStart = 'entered' | 'unsupported' | 'denied' | 'not-requested'

export interface QuizAttemptIntegrityState {
  enabled: boolean
  noticeVersion: typeof QUIZ_INTEGRITY_NOTICE_VERSION
  fullscreenStart: QuizIntegrityFullscreenStart
  authorityAcknowledgedAt?: number
  deleteAfter?: number
}

export interface GradedQuizQuestion {
  id: string
  prompt: string
  choices: string[]
  chosenIndex: number
  correctIndex: number
  correct: boolean
}

interface QuizAttemptV2Base {
  schemaVersion: 2
  status: 'active' | 'completed'
  attemptId: string
  sessionId: string
  uid: string
  nickname: string
  quizId: string
  quizTitle: string
  startedAt: number
  questionOrder: string[]
  currentIndex: number
  questionStartedAt: number
  deadlineAt: number
  answers: Record<string, number>
  timings: Record<string, QuizQuestionTiming>
  answerOperations: Record<string, QuizAnswerOperationRecord>
  integrity?: QuizAttemptIntegrityState
}

export interface ActiveQuizAttemptV2 extends QuizAttemptV2Base {
  status: 'active'
}

export interface QuizIntegritySummary {
  eventCount: number
  monitoringLimited: boolean
  deleteAfter: number
}

export interface CompletedQuizAttemptV2 extends QuizAttemptV2Base {
  status: 'completed'
  completedAt: number
  correctCount: number
  questionCount: number
  score: number
  passed: boolean
  gradedAt: number
  breakdown: GradedQuizQuestion[]
  integritySummary?: QuizIntegritySummary
}

export type QuizAttemptV2 = ActiveQuizAttemptV2 | CompletedQuizAttemptV2

export interface LegacyCompletedQuizResult {
  uid: string
  nickname: string
  quizId: string
  quizTitle: string
  answers: Record<string, number>
  correctCount: number
  questionCount: number
  score: number
  passed: boolean
  gradedAt: number
  breakdown: GradedQuizQuestion[]
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

export interface QuizStatsEffect {
  quizzesTaken: number
  quizzesPassed: number
  currentStreak: number
  bestStreak: number
  totalCorrect: number
  totalQuestions: number
  lastQuizAt: number
  appliedAttempts: Record<string, string>
}

function readNonnegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

/** Pure idempotent projection used by both the Next route and the recovery trigger. */
export function applyCompletedAttemptStats(
  current: unknown,
  attempt: CompletedQuizAttemptV2,
): QuizStatsEffect {
  const record = isRecord(current) ? current : {}
  const applied = isRecord(record.appliedAttempts)
    ? Object.fromEntries(Object.entries(record.appliedAttempts).filter((entry): entry is [string, string] => isFirebaseKey(entry[0]) && isFirebaseKey(entry[1])))
    : {}
  if (applied[attempt.quizId] === attempt.attemptId) {
    return {
      quizzesTaken: readNonnegativeInteger(record.quizzesTaken),
      quizzesPassed: readNonnegativeInteger(record.quizzesPassed),
      currentStreak: readNonnegativeInteger(record.currentStreak),
      bestStreak: readNonnegativeInteger(record.bestStreak),
      totalCorrect: readNonnegativeInteger(record.totalCorrect),
      totalQuestions: readNonnegativeInteger(record.totalQuestions),
      lastQuizAt: isSafeTimestamp(record.lastQuizAt) ? record.lastQuizAt : attempt.gradedAt,
      appliedAttempts: applied,
    }
  }
  const currentStreak = readNonnegativeInteger(record.currentStreak)
  const nextStreak = attempt.passed ? currentStreak + 1 : 0
  return {
    quizzesTaken: readNonnegativeInteger(record.quizzesTaken) + 1,
    quizzesPassed: readNonnegativeInteger(record.quizzesPassed) + (attempt.passed ? 1 : 0),
    currentStreak: nextStreak,
    bestStreak: Math.max(readNonnegativeInteger(record.bestStreak), nextStreak),
    totalCorrect: readNonnegativeInteger(record.totalCorrect) + attempt.correctCount,
    totalQuestions: readNonnegativeInteger(record.totalQuestions) + attempt.questionCount,
    lastQuizAt: attempt.gradedAt,
    appliedAttempts: { ...applied, [attempt.quizId]: attempt.attemptId },
  }
}

export interface NewQuizAttemptInput {
  quiz?: ParsedQuizRecord
  attemptId: string
  sessionId: string
  uid: string
  nickname: string
  startedAt?: number
  now?: number
  fullscreenStart?: QuizIntegrityFullscreenStart
  /** Optional permutation of every quiz question. Canonical quiz order is the default. */
  questionOrder?: string[]
}

export interface QuizCurrentQuestionResponse {
  schemaVersion: 2
  status: 'active'
  attemptId: string
  sessionId: string
  serverNow: number
  startedAt: number
  questionIndex: number
  questionCount: number
  questionStartedAt: number
  deadlineAt: number
  durationMs: typeof QUIZ_TIME_LIMIT_MS
  integrity: {
    enabled: boolean
    noticeVersion: typeof QUIZ_INTEGRITY_NOTICE_VERSION
    fullscreenStart: QuizIntegrityFullscreenStart
  }
  question: QuizQuestion
}

/** Safe completed-result DTO. Session, timing, and idempotency internals are omitted. */
export interface QuizCompletedResult {
  uid: string
  nickname: string
  quizId: string
  quizTitle: string
  correctCount: number
  questionCount: number
  score: number
  passed: boolean
  gradedAt: number
  breakdown: GradedQuizQuestion[]
  integritySummary?: QuizIntegritySummary
}

export interface ApplyAnswerOperationInput {
  attemptId: string
  sessionId: string
  operationId: string
  questionId: string
  chosenIndex: number
  /** Captured once by the trusted caller when the authenticated request is received. */
  receivedAt: number
}

export type QuizAnswerOperationCode =
  | 'accepted'
  | 'expired'
  | 'invalid-operation'
  | 'attempt-mismatch'
  | 'session-replaced'
  | 'operation-reused'
  | 'ledger-full'
  | 'question-not-current'
  | 'invalid-answer'
  | 'receipt-before-question'

export type QuizAnswerOperationRejectionReason =
  | 'invalid-operation'
  | 'attempt-mismatch'
  | 'session-mismatch'
  | 'operation-conflict'
  | 'ledger-full'
  | 'question-not-current'
  | 'invalid-answer'
  | 'receipt-before-question'

export type ApplyAnswerOperationResult =
  | {
      kind: 'accepted'
      code: 'accepted'
      outcome: 'accepted'
      attempt: QuizAttemptV2
      operation: QuizAnswerOperationRecord
      persist: true
    }
  | {
      kind: 'expired'
      code: 'expired'
      outcome: 'expired'
      attempt: QuizAttemptV2
      operation: QuizAnswerOperationRecord
      persist: true
    }
  | {
      kind: 'replayed'
      code: 'accepted' | 'expired'
      outcome: 'accepted' | 'expired'
      attempt: QuizAttemptV2
      operation: QuizAnswerOperationRecord
      persist: boolean
    }
  | {
      kind: 'rejected'
      code: QuizAnswerOperationCode
      reason: QuizAnswerOperationRejectionReason
      attempt: QuizAttemptV2
      persist: boolean
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed)
  return Object.keys(record).every((key) => keys.has(key))
}

function hasEveryKey(record: Record<string, unknown>, required: readonly string[]): boolean {
  return required.every((key) => hasOwn(record, key))
}

function isSafeTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isAcknowledgementTimestamp(value: unknown): value is number {
  return isSafeTimestamp(value) && value > 0
}

function safeTimestampSum(left: number, right: number): number | null {
  const result = left + right
  return Number.isSafeInteger(result) && result >= 0 ? result : null
}

function isFirebaseKey(value: unknown): value is string {
  return typeof value === 'string' && FIREBASE_KEY_PATTERN.test(value)
}

function isQuizId(value: unknown): value is string {
  return typeof value === 'string' && QUIZ_ID_PATTERN.test(value)
}

function isNonEmptyBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum
}

/** Accepts either a JavaScript array or the dense numeric-key object returned by RTDB. */
function denseValues(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) return null
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) return null
    }
    return [...value]
  }
  if (!isRecord(value)) return null
  const keys = Object.keys(value)
  for (let index = 0; index < keys.length; index += 1) {
    if (!hasOwn(value, String(index))) return null
  }
  return keys.length === 0 ? [] : keys.map((_, index) => value[String(index)])
}

function cloneBreakdown(breakdown: readonly GradedQuizQuestion[]): GradedQuizQuestion[] {
  return breakdown.map((item) => ({ ...item, choices: [...item.choices] }))
}

function questionMap(quiz: ParsedQuizRecord): Map<string, QuizQuestion> {
  return new Map(quiz.questions.map((question) => [question.id, question]))
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function sameQuestionOrder(order: readonly string[], quiz: ParsedQuizRecord): boolean {
  if (order.length !== quiz.questions.length || new Set(order).size !== order.length) return false
  const ids = new Set(quiz.questions.map((question) => question.id))
  return order.every((id) => ids.has(id))
}

export function parseQuizIntegrityConfiguration(value: unknown): QuizIntegrityConfiguration | null {
  if (!isRecord(value)) return null
  const allowed = ['enabled', 'noticeVersion', 'authorityAcknowledgedAt'] as const
  if (!hasOnlyKeys(value, allowed) || !hasEveryKey(value, ['enabled', 'noticeVersion'])) return null
  if (typeof value.enabled !== 'boolean' || value.noticeVersion !== QUIZ_INTEGRITY_NOTICE_VERSION) return null
  const acknowledged = hasOwn(value, 'authorityAcknowledgedAt')
    ? value.authorityAcknowledgedAt
    : undefined
  if (acknowledged !== undefined && !isAcknowledgementTimestamp(acknowledged)) return null
  if (value.enabled && acknowledged === undefined) return null
  return {
    enabled: value.enabled,
    noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
    ...(acknowledged !== undefined ? { authorityAcknowledgedAt: acknowledged } : {}),
  }
}

/**
 * Strictly parses the immutable quiz record. A missing `integrity` field is the
 * legacy, monitoring-disabled form; malformed configured integrity fails closed.
 */
export function parseQuizRecord(value: unknown, expectedQuizId?: string): ParsedQuizRecord | null {
  if (!isRecord(value)) return null
  const required = ['id', 'ownerId', 'title', 'questionCount', 'questions', 'createdAt', 'updatedAt'] as const
  const allowed = [...required, 'description', 'integrity'] as const
  if (!hasOnlyKeys(value, allowed) || !hasEveryKey(value, required)) return null
  if (!isQuizId(value.id) || (expectedQuizId !== undefined && value.id !== expectedQuizId)) return null
  if (!isFirebaseKey(value.ownerId) || !isNonEmptyBoundedString(value.title, 160)) return null
  if (!Number.isSafeInteger(value.questionCount) || typeof value.questionCount !== 'number' || value.questionCount < 1 || value.questionCount > 50) return null
  if (!isSafeTimestamp(value.createdAt) || !isSafeTimestamp(value.updatedAt) || value.createdAt !== value.updatedAt) return null
  if (hasOwn(value, 'description') && (typeof value.description !== 'string' || value.description.length > 2_000)) return null
  if (!isRecord(value.questions) || Object.keys(value.questions).length !== value.questionCount) return null

  const questions: QuizQuestion[] = []
  for (let index = 0; index < value.questionCount; index += 1) {
    const id = `q_${index}`
    if (!hasOwn(value.questions, id)) return null
    const rawQuestion = value.questions[id]
    if (!isRecord(rawQuestion) || !hasOnlyKeys(rawQuestion, ['prompt', 'choices']) || !hasEveryKey(rawQuestion, ['prompt', 'choices'])) return null
    if (!isNonEmptyBoundedString(rawQuestion.prompt, 500)) return null
    const rawChoices = denseValues(rawQuestion.choices)
    if (rawChoices === null || rawChoices.length < 2 || rawChoices.length > 4) return null
    const choices: string[] = []
    for (const choice of rawChoices) {
      if (!isNonEmptyBoundedString(choice, 200)) return null
      choices.push(choice)
    }
    questions.push({ id, prompt: rawQuestion.prompt, choices })
  }

  let integrity: QuizIntegrityConfiguration = {
    enabled: false,
    noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
  }
  if (hasOwn(value, 'integrity')) {
    const parsed = parseQuizIntegrityConfiguration(value.integrity)
    if (!parsed) return null
    integrity = parsed
  }

  return {
    id: value.id,
    ownerId: value.ownerId,
    title: value.title,
    description: typeof value.description === 'string' ? value.description : '',
    questionCount: value.questionCount,
    questions,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    integrity,
  }
}

/** Strictly parses an owner-bound answer key with exact question coverage. */
export function parseQuizAnswerKey(value: unknown, quiz: ParsedQuizRecord | null): ParsedQuizAnswerKey | null {
  if (!quiz) return null
  if (!isRecord(value) || !hasOnlyKeys(value, ['ownerId', 'correct']) || !hasEveryKey(value, ['ownerId', 'correct'])) return null
  if (value.ownerId !== quiz.ownerId || !isRecord(value.correct) || Object.keys(value.correct).length !== quiz.questionCount) return null
  const correct: Record<string, number> = {}
  for (const question of quiz.questions) {
    if (!hasOwn(value.correct, question.id)) return null
    const correctIndex = value.correct[question.id]
    if (typeof correctIndex !== 'number' || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= question.choices.length) return null
    correct[question.id] = correctIndex
  }
  return { ownerId: quiz.ownerId, correct }
}

function parseQuestionOrder(value: unknown, quiz?: ParsedQuizRecord): string[] | null {
  const raw = denseValues(value)
  if (raw === null || raw.length < 1 || raw.length > 50 || !raw.every((item): item is string => typeof item === 'string')) return null
  const order = [...raw]
  if (new Set(order).size !== order.length || !order.every((id) => QUESTION_ID_PATTERN.test(id))) return null
  if (quiz) return sameQuestionOrder(order, quiz) ? order : null
  const expected = new Set(Array.from({ length: order.length }, (_, index) => `q_${index}`))
  return order.every((id) => expected.has(id)) ? order : null
}

function answerIsValid(chosenIndex: unknown, question?: QuizQuestion): chosenIndex is number {
  if (typeof chosenIndex !== 'number' || !Number.isInteger(chosenIndex) || chosenIndex < -1) return false
  return question ? chosenIndex < question.choices.length : chosenIndex <= 3
}

function parseAnswers(
  value: unknown,
  order: readonly string[],
  quiz?: ParsedQuizRecord,
): Record<string, number> | null {
  if (value === undefined) return {}
  if (!isRecord(value) || Object.keys(value).length > order.length) return null
  const allowed = new Set(order)
  const questions = quiz ? questionMap(quiz) : undefined
  const answers: Record<string, number> = {}
  for (const [id, chosenIndex] of Object.entries(value)) {
    if (!allowed.has(id) || !answerIsValid(chosenIndex, questions?.get(id))) return null
    answers[id] = chosenIndex
  }
  return answers
}

function parseTiming(value: unknown, questionId: string): QuizQuestionTiming | null {
  if (!isRecord(value)) return null
  const required = ['questionId', 'startedAt', 'deadlineAt', 'outcome'] as const
  const allowed = [...required, 'answeredAt'] as const
  if (!hasOnlyKeys(value, allowed) || !hasEveryKey(value, required)) return null
  if (value.questionId !== questionId || !isSafeTimestamp(value.startedAt) || !isSafeTimestamp(value.deadlineAt)) return null
  if (safeTimestampSum(value.startedAt, QUIZ_TIME_LIMIT_MS) !== value.deadlineAt) return null
  if (value.outcome === 'timeout') {
    if (hasOwn(value, 'answeredAt')) return null
    return { questionId, startedAt: value.startedAt, deadlineAt: value.deadlineAt, outcome: 'timeout' }
  }
  if (value.outcome !== 'answered' || !isSafeTimestamp(value.answeredAt)) return null
  if (value.answeredAt < value.startedAt || value.answeredAt > value.deadlineAt) return null
  return {
    questionId,
    startedAt: value.startedAt,
    deadlineAt: value.deadlineAt,
    outcome: 'answered',
    answeredAt: value.answeredAt,
  }
}

function parseTimings(value: unknown, order: readonly string[]): Record<string, QuizQuestionTiming> | null {
  if (value === undefined) return {}
  if (!isRecord(value) || Object.keys(value).length > order.length) return null
  const allowed = new Set(order)
  const timings: Record<string, QuizQuestionTiming> = {}
  for (const [id, rawTiming] of Object.entries(value)) {
    if (!allowed.has(id)) return null
    const timing = parseTiming(rawTiming, id)
    if (!timing) return null
    timings[id] = timing
  }
  return timings
}

function parseAnswerOperation(
  value: unknown,
  operationId: string,
  order: readonly string[],
  attemptId: string,
  startedAt: number,
  quiz?: ParsedQuizRecord,
): QuizAnswerOperationRecord | null {
  if (!isRecord(value)) return null
  const required = ['operationId', 'attemptId', 'sessionId', 'questionId', 'chosenIndex', 'receivedAt', 'outcome'] as const
  if (!hasOnlyKeys(value, required) || !hasEveryKey(value, required)) return null
  if (value.operationId !== operationId || !isFirebaseKey(operationId)) return null
  if (value.attemptId !== attemptId || !isFirebaseKey(value.sessionId)) return null
  if (typeof value.questionId !== 'string' || !order.includes(value.questionId)) return null
  const question = quiz?.questions.find((item) => item.id === value.questionId)
  if (!answerIsValid(value.chosenIndex, question) || !isSafeTimestamp(value.receivedAt) || value.receivedAt < startedAt) return null
  if (value.outcome !== 'accepted' && value.outcome !== 'expired') return null
  return {
    operationId,
    attemptId,
    sessionId: value.sessionId,
    questionId: value.questionId,
    chosenIndex: value.chosenIndex,
    receivedAt: value.receivedAt,
    outcome: value.outcome,
  }
}

function parseAnswerOperations(
  value: unknown,
  order: readonly string[],
  attemptId: string,
  startedAt: number,
  quiz?: ParsedQuizRecord,
): Record<string, QuizAnswerOperationRecord> | null {
  if (value === undefined) return {}
  if (!isRecord(value) || Object.keys(value).length > QUIZ_ANSWER_OPERATION_LIMIT) return null
  const operations: Record<string, QuizAnswerOperationRecord> = {}
  for (const [operationId, rawOperation] of Object.entries(value)) {
    const operation = parseAnswerOperation(rawOperation, operationId, order, attemptId, startedAt, quiz)
    if (!operation) return null
    operations[operationId] = operation
  }
  return operations
}

function isFullscreenStart(value: unknown): value is QuizIntegrityFullscreenStart {
  return value === 'entered' || value === 'unsupported' || value === 'denied' || value === 'not-requested'
}

function parseAttemptIntegrity(value: unknown): QuizAttemptIntegrityState | null {
  if (!isRecord(value)) return null
  const allowed = ['enabled', 'noticeVersion', 'fullscreenStart', 'authorityAcknowledgedAt', 'deleteAfter'] as const
  if (!hasOnlyKeys(value, allowed) || !hasEveryKey(value, ['enabled', 'noticeVersion', 'fullscreenStart'])) return null
  if (typeof value.enabled !== 'boolean' || value.noticeVersion !== QUIZ_INTEGRITY_NOTICE_VERSION || !isFullscreenStart(value.fullscreenStart)) return null
  const acknowledged = hasOwn(value, 'authorityAcknowledgedAt') ? value.authorityAcknowledgedAt : undefined
  const deleteAfter = hasOwn(value, 'deleteAfter') ? value.deleteAfter : undefined
  if (acknowledged !== undefined && !isAcknowledgementTimestamp(acknowledged)) return null
  if (deleteAfter !== undefined && !isSafeTimestamp(deleteAfter)) return null
  if (value.enabled && acknowledged === undefined) return null
  if (value.enabled && value.fullscreenStart === 'not-requested') return null
  return {
    enabled: value.enabled,
    noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
    fullscreenStart: value.fullscreenStart,
    ...(acknowledged !== undefined ? { authorityAcknowledgedAt: acknowledged } : {}),
    ...(deleteAfter !== undefined ? { deleteAfter } : {}),
  }
}

function parseIntegritySummary(value: unknown, deleteAfter: number): QuizIntegritySummary | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['eventCount', 'monitoringLimited', 'deleteAfter']) ||
      !hasEveryKey(value, ['eventCount', 'monitoringLimited', 'deleteAfter'])) return null
  if (!Number.isSafeInteger(value.eventCount) || typeof value.eventCount !== 'number' || value.eventCount < 0 ||
      typeof value.monitoringLimited !== 'boolean' || value.deleteAfter !== deleteAfter) return null
  return { eventCount: value.eventCount, monitoringLimited: value.monitoringLimited, deleteAfter }
}

function parseBreakdown(
  value: unknown,
  order: readonly string[],
  answers: Readonly<Record<string, number>>,
  quiz?: ParsedQuizRecord,
  answerKey?: ParsedQuizAnswerKey,
): GradedQuizQuestion[] | null {
  const raw = denseValues(value)
  if (raw === null || raw.length !== order.length) return null
  const questions = quiz ? questionMap(quiz) : undefined
  const breakdown: GradedQuizQuestion[] = []
  for (let index = 0; index < order.length; index += 1) {
    const id = order[index]
    const item = raw[index]
    if (id === undefined || !isRecord(item)) return null
    const required = ['id', 'prompt', 'choices', 'chosenIndex', 'correctIndex', 'correct'] as const
    if (!hasOnlyKeys(item, required) || !hasEveryKey(item, required) || item.id !== id) return null
    if (!isNonEmptyBoundedString(item.prompt, 500) || typeof item.correct !== 'boolean') return null
    const rawChoices = denseValues(item.choices)
    if (rawChoices === null || rawChoices.length < 2 || rawChoices.length > 4 || !rawChoices.every((choice): choice is string => isNonEmptyBoundedString(choice, 200))) return null
    const question = questions?.get(id)
    if (question && (item.prompt !== question.prompt || !sameStringArray(rawChoices, question.choices))) return null
    if (!answerIsValid(item.chosenIndex, question ?? { id, prompt: item.prompt, choices: rawChoices })) return null
    if (answers[id] !== item.chosenIndex) return null
    if (typeof item.correctIndex !== 'number' || !Number.isInteger(item.correctIndex) || item.correctIndex < 0 || item.correctIndex >= rawChoices.length) return null
    if (answerKey && answerKey.correct[id] !== item.correctIndex) return null
    if (item.correct !== (item.chosenIndex === item.correctIndex)) return null
    breakdown.push({
      id,
      prompt: item.prompt,
      choices: [...rawChoices],
      chosenIndex: item.chosenIndex,
      correctIndex: item.correctIndex,
      correct: item.correct,
    })
  }
  return breakdown
}

function completedNumbersAreValid(
  record: Record<string, unknown>,
  breakdown: readonly GradedQuizQuestion[],
): record is Record<string, unknown> & {
  correctCount: number
  questionCount: number
  score: number
  passed: boolean
  gradedAt: number
} {
  const correctCount = breakdown.filter((item) => item.correct).length
  const score = Math.round((correctCount / breakdown.length) * 100)
  return Number.isSafeInteger(record.correctCount) && record.correctCount === correctCount &&
    Number.isSafeInteger(record.questionCount) && record.questionCount === breakdown.length &&
    Number.isSafeInteger(record.score) && record.score === score &&
    typeof record.passed === 'boolean' && record.passed === (score >= QUIZ_PASS_PERCENT) &&
    isSafeTimestamp(record.gradedAt)
}

/**
 * Strict parser for canonical schema-version 2 attempts. Empty RTDB maps may be
 * absent and are normalized to empty objects.
 */
export function parseQuizAttemptV2(
  value: unknown,
  quiz?: ParsedQuizRecord,
  answerKey?: ParsedQuizAnswerKey,
): QuizAttemptV2 | null {
  if (!isRecord(value) || value.schemaVersion !== 2 || (value.status !== 'active' && value.status !== 'completed')) return null
  const commonRequired = [
    'schemaVersion', 'status', 'attemptId', 'sessionId', 'uid', 'nickname', 'quizId', 'quizTitle',
    'startedAt', 'questionOrder', 'currentIndex', 'questionStartedAt', 'deadlineAt',
  ] as const
  const commonOptional = ['answers', 'timings', 'answerOperations', 'integrity'] as const
  const completionFields = ['completedAt', 'correctCount', 'questionCount', 'score', 'passed', 'gradedAt', 'breakdown'] as const
  const completionOptional = ['integritySummary'] as const
  const allowed = value.status === 'completed'
    ? [...commonRequired, ...commonOptional, ...completionFields, ...completionOptional]
    : [...commonRequired, ...commonOptional]
  if (!hasOnlyKeys(value, allowed) || !hasEveryKey(value, commonRequired)) return null
  if (value.status === 'completed' && !hasEveryKey(value, completionFields)) return null
  if (!isFirebaseKey(value.attemptId) || !isFirebaseKey(value.sessionId) || !isFirebaseKey(value.uid)) return null
  if (!isNonEmptyBoundedString(value.nickname, 80) || !isQuizId(value.quizId) || !isNonEmptyBoundedString(value.quizTitle, 160)) return null
  if (quiz && (value.quizId !== quiz.id || value.quizTitle !== quiz.title)) return null
  if (!isSafeTimestamp(value.startedAt) || !isSafeTimestamp(value.questionStartedAt) || !isSafeTimestamp(value.deadlineAt)) return null
  if (safeTimestampSum(value.questionStartedAt, QUIZ_TIME_LIMIT_MS) !== value.deadlineAt) return null
  const order = parseQuestionOrder(value.questionOrder, quiz)
  if (!order) return null
  if (typeof value.currentIndex !== 'number' || !Number.isInteger(value.currentIndex)) return null
  if (value.status === 'active' && (value.currentIndex < 0 || value.currentIndex >= order.length)) return null
  if (value.status === 'completed' && value.currentIndex !== order.length) return null

  const answers = parseAnswers(value.answers, order, quiz)
  const timings = parseTimings(value.timings, order)
  const operations = parseAnswerOperations(value.answerOperations, order, value.attemptId, value.startedAt, quiz)
  if (!answers || !timings || !operations) return null
  const processedCount = value.currentIndex
  if (Object.keys(answers).length !== processedCount || Object.keys(timings).length !== processedCount) return null

  let expectedStart = value.startedAt
  const acceptedOperationsByQuestion = new Map<string, number>()
  for (const operation of Object.values(operations)) {
    if (operation.outcome !== 'accepted') continue
    const timing = timings[operation.questionId]
    if (!timing || timing.outcome !== 'answered' || timing.answeredAt !== operation.receivedAt || answers[operation.questionId] !== operation.chosenIndex) return null
    acceptedOperationsByQuestion.set(operation.questionId, (acceptedOperationsByQuestion.get(operation.questionId) ?? 0) + 1)
  }

  for (let index = 0; index < order.length; index += 1) {
    const id = order[index]
    if (id === undefined) return null
    const processed = index < processedCount
    if (!processed) {
      if (hasOwn(answers, id) || hasOwn(timings, id)) return null
      continue
    }
    if (!hasOwn(answers, id)) return null
    const timing = timings[id]
    if (!timing || timing.startedAt !== expectedStart || safeTimestampSum(expectedStart, QUIZ_TIME_LIMIT_MS) !== timing.deadlineAt) return null
    if (timing.outcome === 'timeout') {
      if (answers[id] !== -1 || acceptedOperationsByQuestion.has(id)) return null
      expectedStart = timing.deadlineAt
    } else {
      if (acceptedOperationsByQuestion.get(id) !== 1 || timing.answeredAt === undefined) return null
      expectedStart = timing.answeredAt
    }
  }

  if (value.status === 'active') {
    if (value.questionStartedAt !== expectedStart) return null
  } else {
    const finalId = order.at(-1)
    const finalTiming = finalId ? timings[finalId] : undefined
    if (!finalTiming || value.questionStartedAt !== finalTiming.startedAt || value.deadlineAt !== finalTiming.deadlineAt) return null
  }

  let integrity: QuizAttemptIntegrityState | undefined
  if (hasOwn(value, 'integrity')) {
    const parsed = parseAttemptIntegrity(value.integrity)
    if (!parsed) return null
    integrity = parsed
  }
  const quizIntegrityEnabled = quiz?.integrity?.enabled === true
  if (quizIntegrityEnabled) {
    if (!integrity?.enabled || integrity.authorityAcknowledgedAt !== quiz.integrity?.authorityAcknowledgedAt) return null
  } else if (integrity?.enabled) return null
  if (value.status === 'active' && integrity?.deleteAfter !== undefined) return null

  const base = {
    schemaVersion: 2 as const,
    status: value.status,
    attemptId: value.attemptId,
    sessionId: value.sessionId,
    uid: value.uid,
    nickname: value.nickname,
    quizId: value.quizId,
    quizTitle: value.quizTitle,
    startedAt: value.startedAt,
    questionOrder: order,
    currentIndex: value.currentIndex,
    questionStartedAt: value.questionStartedAt,
    deadlineAt: value.deadlineAt,
    answers,
    timings,
    answerOperations: operations,
    ...(integrity ? { integrity } : {}),
  }

  if (value.status === 'active') return { ...base, status: 'active' }
  if (!isSafeTimestamp(value.completedAt) || value.completedAt !== value.gradedAt) return null
  const breakdown = parseBreakdown(value.breakdown, order, answers, quiz, answerKey)
  if (!breakdown || !completedNumbersAreValid(value, breakdown)) return null
  const finalTiming = timings[order[order.length - 1]!]
  const finalEffectiveAt = finalTiming?.outcome === 'answered' ? finalTiming.answeredAt : finalTiming?.deadlineAt
  if (finalEffectiveAt === undefined || value.gradedAt < finalEffectiveAt) return null
  if (integrity?.enabled) {
    const expectedDeleteAfter = safeTimestampSum(value.gradedAt, QUIZ_INTEGRITY_RETENTION_MS)
    if (expectedDeleteAfter === null || integrity.deleteAfter !== expectedDeleteAfter) return null
  } else if (integrity?.deleteAfter !== undefined) return null
  let integritySummary: QuizIntegritySummary | undefined
  if (hasOwn(value, 'integritySummary')) {
    if (!integrity?.enabled || integrity.deleteAfter === undefined) return null
    const parsed = parseIntegritySummary(value.integritySummary, integrity.deleteAfter)
    if (!parsed) return null
    integritySummary = parsed
  }

  return {
    ...base,
    status: 'completed',
    completedAt: value.completedAt,
    correctCount: value.correctCount,
    questionCount: value.questionCount,
    score: value.score,
    passed: value.passed,
    gradedAt: value.gradedAt,
    breakdown,
    ...(integritySummary ? { integritySummary } : {}),
  }
}

/** Strict parser for the pre-schemaVersion completed record already stored in production. */
export function parseLegacyCompletedQuizResult(
  value: unknown,
  quiz?: ParsedQuizRecord,
  answerKey?: ParsedQuizAnswerKey,
): LegacyCompletedQuizResult | null {
  if (!isRecord(value)) return null
  const required = [
    'uid', 'nickname', 'quizId', 'quizTitle', 'answers', 'correctCount', 'questionCount',
    'score', 'passed', 'gradedAt', 'breakdown',
  ] as const
  if (!hasOnlyKeys(value, required) || !hasEveryKey(value, required)) return null
  if (!isFirebaseKey(value.uid) || !isNonEmptyBoundedString(value.nickname, 80) || !isQuizId(value.quizId) || !isNonEmptyBoundedString(value.quizTitle, 160)) return null
  if (quiz && (value.quizId !== quiz.id || value.quizTitle !== quiz.title)) return null
  if (!Number.isSafeInteger(value.questionCount) || typeof value.questionCount !== 'number' || value.questionCount < 1 || value.questionCount > 50) return null
  const rawBreakdown = denseValues(value.breakdown)
  if (rawBreakdown === null || rawBreakdown.length !== value.questionCount) return null
  const order: string[] = []
  for (const rawItem of rawBreakdown) {
    if (!isRecord(rawItem) || typeof rawItem.id !== 'string' || !QUESTION_ID_PATTERN.test(rawItem.id) || order.includes(rawItem.id)) return null
    order.push(rawItem.id)
  }
  if (quiz && !sameQuestionOrder(order, quiz)) return null
  const answers = parseAnswers(value.answers, order, quiz)
  if (!answers) return null

  // Legacy sanitization omitted unanswered entries; normalize them to -1 only for validation.
  const normalizedAnswers = { ...answers }
  for (const id of order) if (!hasOwn(normalizedAnswers, id)) normalizedAnswers[id] = -1
  const breakdown = parseBreakdown(value.breakdown, order, normalizedAnswers, quiz, answerKey)
  if (!breakdown || !completedNumbersAreValid(value, breakdown)) return null
  for (const item of breakdown) {
    if (item.chosenIndex !== -1 && answers[item.id] !== item.chosenIndex) return null
    if (item.chosenIndex === -1 && hasOwn(answers, item.id) && answers[item.id] !== -1) return null
  }

  return {
    uid: value.uid,
    nickname: value.nickname,
    quizId: value.quizId,
    quizTitle: value.quizTitle,
    answers,
    correctCount: value.correctCount,
    questionCount: value.questionCount,
    score: value.score,
    passed: value.passed,
    gradedAt: value.gradedAt,
    breakdown,
  }
}

export const parseLegacyCompletedResult = parseLegacyCompletedQuizResult

function requireNewAttemptInput(input: NewQuizAttemptInput, startedAt: number): void {
  if (!isFirebaseKey(input.attemptId) || !isFirebaseKey(input.sessionId) || !isFirebaseKey(input.uid)) {
    throw new TypeError('Attempt, session, and user IDs must be valid Firebase keys.')
  }
  if (!isNonEmptyBoundedString(input.nickname, 80)) throw new TypeError('A valid nickname is required.')
  if (input.fullscreenStart !== undefined && !isFullscreenStart(input.fullscreenStart)) {
    throw new TypeError('A valid initial fullscreen state is required.')
  }
  if (!isSafeTimestamp(startedAt) || safeTimestampSum(startedAt, QUIZ_TIME_LIMIT_MS) === null) {
    throw new TypeError('A valid authoritative start timestamp is required.')
  }
}

/** Constructs the one canonical active schema-version 2 attempt. */
export function createQuizAttempt(quiz: ParsedQuizRecord, input: NewQuizAttemptInput): ActiveQuizAttemptV2
export function createQuizAttempt(input: NewQuizAttemptInput & { quiz: ParsedQuizRecord }): ActiveQuizAttemptV2
export function createQuizAttempt(
  quizOrInput: ParsedQuizRecord | (NewQuizAttemptInput & { quiz: ParsedQuizRecord }),
  maybeInput?: NewQuizAttemptInput,
): ActiveQuizAttemptV2 {
  const quiz = maybeInput ? quizOrInput as ParsedQuizRecord : (quizOrInput as NewQuizAttemptInput & { quiz: ParsedQuizRecord }).quiz
  const input = maybeInput ?? quizOrInput as NewQuizAttemptInput
  const startedAt = input.startedAt ?? input.now
  if (startedAt === undefined) throw new TypeError('A valid authoritative start timestamp is required.')
  requireNewAttemptInput(input, startedAt)
  const canonicalOrder = quiz.questions.map((question) => question.id)
  const order = input.questionOrder ? [...input.questionOrder] : canonicalOrder
  if (!sameQuestionOrder(order, quiz)) throw new TypeError('questionOrder must be an exact quiz-question permutation.')
  const deadlineAt = safeTimestampSum(startedAt, QUIZ_TIME_LIMIT_MS)
  if (deadlineAt === null) throw new TypeError('The question deadline is outside the supported timestamp range.')
  const integrity = quiz.integrity?.enabled
    ? (() => {
        if (input.fullscreenStart === undefined || input.fullscreenStart === 'not-requested') {
          throw new TypeError('Integrity-enabled attempts require the initial fullscreen outcome.')
        }
        return {
          enabled: true,
          noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
          fullscreenStart: input.fullscreenStart,
          authorityAcknowledgedAt: quiz.integrity.authorityAcknowledgedAt!,
        } satisfies QuizAttemptIntegrityState
      })()
    : undefined
  return {
    schemaVersion: 2,
    status: 'active',
    attemptId: input.attemptId,
    sessionId: input.sessionId,
    uid: input.uid,
    nickname: input.nickname,
    quizId: quiz.id,
    quizTitle: quiz.title,
    startedAt,
    questionOrder: order,
    currentIndex: 0,
    questionStartedAt: startedAt,
    deadlineAt,
    answers: {},
    timings: {},
    answerOperations: {},
    ...(integrity ? { integrity } : {}),
  }
}

export const createNewQuizAttempt = createQuizAttempt

function gradeAnswers(
  attempt: Pick<QuizAttemptV2Base, 'questionOrder' | 'answers'>,
  quiz: ParsedQuizRecord,
  answerKey: ParsedQuizAnswerKey,
): Pick<CompletedQuizAttemptV2, 'correctCount' | 'questionCount' | 'score' | 'passed' | 'breakdown'> {
  const questions = questionMap(quiz)
  const breakdown: GradedQuizQuestion[] = attempt.questionOrder.map((id) => {
    const question = questions.get(id)!
    const chosenIndex = attempt.answers[id] ?? -1
    const correctIndex = answerKey.correct[id]!
    return {
      id,
      prompt: question.prompt,
      choices: [...question.choices],
      chosenIndex,
      correctIndex,
      correct: chosenIndex === correctIndex,
    }
  })
  const correctCount = breakdown.filter((item) => item.correct).length
  const questionCount = breakdown.length
  const score = Math.round((correctCount / questionCount) * 100)
  return { correctCount, questionCount, score, passed: score >= QUIZ_PASS_PERCENT, breakdown }
}

function completeAttempt(
  attempt: ActiveQuizAttemptV2,
  quiz: ParsedQuizRecord,
  answerKey: ParsedQuizAnswerKey,
  gradedAt: number,
): CompletedQuizAttemptV2 {
  const grade = gradeAnswers(attempt, quiz, answerKey)
  let integrity = attempt.integrity
  let integritySummary: QuizIntegritySummary | undefined
  if (integrity?.enabled) {
    const deleteAfter = safeTimestampSum(gradedAt, QUIZ_INTEGRITY_RETENTION_MS)
    if (deleteAfter === null) throw new RangeError('Integrity retention exceeds the supported timestamp range.')
    integrity = { ...integrity, deleteAfter }
    integritySummary = {
      eventCount: 0,
      monitoringLimited: integrity.fullscreenStart !== 'entered',
      deleteAfter,
    }
  }
  return {
    ...attempt,
    status: 'completed',
    currentIndex: attempt.questionOrder.length,
    completedAt: gradedAt,
    gradedAt,
    ...grade,
    ...(integrity ? { integrity } : {}),
    ...(integritySummary ? { integritySummary } : {}),
  }
}

/**
 * Materializes every strictly expired deadline. Equality is deliberately not
 * expired, so a request received exactly at the deadline remains eligible.
 */
export function advanceExpiredAttempt(
  attempt: QuizAttemptV2,
  quiz: ParsedQuizRecord,
  answerKey: ParsedQuizAnswerKey,
  now: number,
): QuizAttemptV2 {
  if (!isSafeTimestamp(now)) throw new TypeError('now must be an authoritative timestamp.')
  let current: QuizAttemptV2 = attempt
  while (current.status === 'active' && current.deadlineAt < now) {
    const questionId = current.questionOrder[current.currentIndex]
    if (questionId === undefined) throw new TypeError('The active attempt has no current question.')
    const timedOut: ActiveQuizAttemptV2 = {
      ...current,
      answers: { ...current.answers, [questionId]: -1 },
      timings: {
        ...current.timings,
        [questionId]: {
          questionId,
          startedAt: current.questionStartedAt,
          deadlineAt: current.deadlineAt,
          outcome: 'timeout',
        },
      },
    }
    if (current.currentIndex + 1 >= current.questionOrder.length) {
      current = completeAttempt(timedOut, quiz, answerKey, current.deadlineAt)
      continue
    }
    const nextStartedAt = current.deadlineAt
    const nextDeadlineAt = safeTimestampSum(nextStartedAt, QUIZ_TIME_LIMIT_MS)
    if (nextDeadlineAt === null) throw new RangeError('The next deadline exceeds the supported timestamp range.')
    current = {
      ...timedOut,
      currentIndex: current.currentIndex + 1,
      questionStartedAt: nextStartedAt,
      deadlineAt: nextDeadlineAt,
    }
  }
  return current
}

function operationPayloadMatches(record: QuizAnswerOperationRecord, input: ApplyAnswerOperationInput): boolean {
  return record.attemptId === input.attemptId && record.sessionId === input.sessionId &&
    record.questionId === input.questionId && record.chosenIndex === input.chosenIndex
}

function transitionCode(reason: QuizAnswerOperationRejectionReason): QuizAnswerOperationCode {
  if (reason === 'session-mismatch') return 'session-replaced'
  if (reason === 'operation-conflict') return 'operation-reused'
  return reason
}

function rejected(
  reason: QuizAnswerOperationRejectionReason,
  attempt: QuizAttemptV2,
  persist: boolean,
): ApplyAnswerOperationResult {
  return { kind: 'rejected', code: transitionCode(reason), reason, attempt, persist }
}

function appendOperation(attempt: QuizAttemptV2, operation: QuizAnswerOperationRecord): QuizAttemptV2 {
  return {
    ...attempt,
    answerOperations: { ...attempt.answerOperations, [operation.operationId]: operation },
  }
}

/** Pure, idempotent transition for one authoritatively received answer operation. */
export function applyAnswerOperation(
  attempt: QuizAttemptV2,
  quiz: ParsedQuizRecord,
  answerKey: ParsedQuizAnswerKey,
  input: ApplyAnswerOperationInput,
): ApplyAnswerOperationResult {
  if (!isFirebaseKey(input.operationId) || !isFirebaseKey(input.attemptId) || !isFirebaseKey(input.sessionId) ||
      typeof input.questionId !== 'string' || !Number.isInteger(input.chosenIndex) || !isSafeTimestamp(input.receivedAt)) {
    return rejected('invalid-operation', attempt, false)
  }

  const advanced = advanceExpiredAttempt(attempt, quiz, answerKey, input.receivedAt)
  const advancedChanged = advanced !== attempt
  if (input.attemptId !== advanced.attemptId) return rejected('attempt-mismatch', advanced, advancedChanged)
  if (input.sessionId !== advanced.sessionId) return rejected('session-mismatch', advanced, advancedChanged)

  const existing = advanced.answerOperations[input.operationId]
  if (existing) {
    if (!operationPayloadMatches(existing, input)) return rejected('operation-conflict', advanced, advancedChanged)
    return {
      kind: 'replayed',
      code: existing.outcome,
      outcome: existing.outcome,
      attempt: advanced,
      operation: existing,
      persist: advancedChanged,
    }
  }
  if (Object.keys(advanced.answerOperations).length >= QUIZ_ANSWER_OPERATION_LIMIT) {
    return rejected('ledger-full', advanced, advancedChanged)
  }

  const questionIndex = advanced.questionOrder.indexOf(input.questionId)
  if (questionIndex < 0) return rejected('question-not-current', advanced, advancedChanged)
  const question = quiz.questions.find((item) => item.id === input.questionId)
  if (!question || !answerIsValid(input.chosenIndex, question)) return rejected('invalid-answer', advanced, advancedChanged)

  const isStale = advanced.status === 'completed' || questionIndex < advanced.currentIndex
  if (isStale) {
    const operation: QuizAnswerOperationRecord = {
      operationId: input.operationId,
      attemptId: input.attemptId,
      sessionId: input.sessionId,
      questionId: input.questionId,
      chosenIndex: input.chosenIndex,
      receivedAt: input.receivedAt,
      outcome: 'expired',
    }
    const next = appendOperation(advanced, operation)
    return { kind: 'expired', code: 'expired', outcome: 'expired', attempt: next, operation, persist: true }
  }
  if (advanced.status !== 'active' || questionIndex !== advanced.currentIndex) {
    return rejected('question-not-current', advanced, advancedChanged)
  }
  if (input.receivedAt < advanced.questionStartedAt) {
    return rejected('receipt-before-question', advanced, advancedChanged)
  }

  const operation: QuizAnswerOperationRecord = {
    operationId: input.operationId,
    attemptId: input.attemptId,
    sessionId: input.sessionId,
    questionId: input.questionId,
    chosenIndex: input.chosenIndex,
    receivedAt: input.receivedAt,
    outcome: 'accepted',
  }
  const answered: ActiveQuizAttemptV2 = {
    ...advanced,
    answers: { ...advanced.answers, [input.questionId]: input.chosenIndex },
    timings: {
      ...advanced.timings,
      [input.questionId]: {
        questionId: input.questionId,
        startedAt: advanced.questionStartedAt,
        deadlineAt: advanced.deadlineAt,
        outcome: 'answered',
        answeredAt: input.receivedAt,
      },
    },
    answerOperations: { ...advanced.answerOperations, [input.operationId]: operation },
  }

  if (answered.currentIndex + 1 >= answered.questionOrder.length) {
    const completed = completeAttempt(answered, quiz, answerKey, input.receivedAt)
    return { kind: 'accepted', code: 'accepted', outcome: 'accepted', attempt: completed, operation, persist: true }
  }
  const nextDeadlineAt = safeTimestampSum(input.receivedAt, QUIZ_TIME_LIMIT_MS)
  if (nextDeadlineAt === null) return rejected('invalid-operation', advanced, advancedChanged)
  const next: ActiveQuizAttemptV2 = {
    ...answered,
    currentIndex: answered.currentIndex + 1,
    questionStartedAt: input.receivedAt,
    deadlineAt: nextDeadlineAt,
  }
  return { kind: 'accepted', code: 'accepted', outcome: 'accepted', attempt: next, operation, persist: true }
}

/** Returns only the answer-free data needed to render the authoritative current question. */
export function buildCurrentQuestionResponse(
  attempt: QuizAttemptV2,
  quiz: ParsedQuizRecord,
  serverNow: number,
): QuizCurrentQuestionResponse | null {
  if (attempt.status !== 'active' || !isSafeTimestamp(serverNow)) return null
  const questionId = attempt.questionOrder[attempt.currentIndex]
  const question = quiz.questions.find((item) => item.id === questionId)
  if (!question) return null
  return {
    schemaVersion: 2,
    status: 'active',
    attemptId: attempt.attemptId,
    sessionId: attempt.sessionId,
    serverNow,
    startedAt: attempt.startedAt,
    questionIndex: attempt.currentIndex,
    questionCount: attempt.questionOrder.length,
    questionStartedAt: attempt.questionStartedAt,
    deadlineAt: attempt.deadlineAt,
    durationMs: QUIZ_TIME_LIMIT_MS,
    integrity: {
      enabled: attempt.integrity?.enabled === true,
      noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
      fullscreenStart: attempt.integrity?.fullscreenStart ?? 'not-requested',
    },
    question: { ...question, choices: [...question.choices] },
  }
}

/** Builds the backward-compatible completed DTO without session or operation internals. */
export function buildCompletedResult(
  attempt: QuizAttemptV2 | LegacyCompletedQuizResult,
): QuizCompletedResult | null {
  if ('status' in attempt && attempt.status !== 'completed') return null
  const integritySummary = 'status' in attempt && attempt.integritySummary
    ? { ...attempt.integritySummary }
    : undefined
  return {
    uid: attempt.uid,
    nickname: attempt.nickname,
    quizId: attempt.quizId,
    quizTitle: attempt.quizTitle,
    correctCount: attempt.correctCount,
    questionCount: attempt.questionCount,
    score: attempt.score,
    passed: attempt.passed,
    gradedAt: attempt.gradedAt,
    breakdown: cloneBreakdown(attempt.breakdown),
    ...(integritySummary ? { integritySummary } : {}),
  }
}

export const buildCompletedQuizResult = buildCompletedResult

export type ParsedQuiz = ParsedQuizRecord
export type QuizAnswerKey = ParsedQuizAnswerKey
export type QuizV2Attempt = QuizAttemptV2
export type CompletedQuizAttempt = CompletedQuizAttemptV2
export const parseQuiz = parseQuizRecord
export const parseQuizV2Attempt = parseQuizAttemptV2
export const buildActiveAttemptState = buildCurrentQuestionResponse
export const buildCompletedAttemptResult = buildCompletedResult

/** Parses either a canonical v2 completion or the immutable legacy result shape. */
export function parseCompletedQuizAttempt(
  value: unknown,
  quiz?: ParsedQuizRecord,
  answerKey?: ParsedQuizAnswerKey,
): CompletedQuizAttemptV2 | null {
  const v2 = parseQuizAttemptV2(value, quiz, answerKey)
  return v2?.status === 'completed' ? v2 : null
}
