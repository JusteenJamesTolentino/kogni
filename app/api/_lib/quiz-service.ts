import type {
  CompletedQuizAttempt,
  ParsedQuiz,
  QuizAnswerKey,
  QuizIntegrityFullscreenStart,
  QuizRankStats,
  QuizV2Attempt,
  LegacyCompletedQuizResult,
} from '../../../functions/src/quiz-core'
import {
  QUIZ_INTEGRITY_RETENTION_MS,
  QUIZ_TIME_LIMIT_MS,
  advanceExpiredAttempt,
  applyAnswerOperation,
  applyCompletedAttemptStats,
  buildActiveAttemptState,
  buildCompletedAttemptResult,
  createQuizAttempt,
  parseCompletedQuizAttempt,
  parseLegacyCompletedQuizResult,
  parseQuiz,
  parseQuizAnswerKey,
  parseQuizV2Attempt,
} from '../../../functions/src/quiz-core'
import type { CoreDatabase } from '../../../functions/src/database-core'
import { expectedPrivacyVersion } from './privacy'

export const QUIZ_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
export const QUIZ_CODE_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/
export const QUIZ_OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/
export const QUIZ_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/
export const QUIZ_EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/
export const MAX_INTEGRITY_EVENTS_PER_REQUEST = 20
export const MAX_INTEGRITY_EVENTS_PER_ATTEMPT = 200
const MAX_JAVASCRIPT_DATE_MS = 8_640_000_000_000_000
const MAX_EVENT_CLOCK_SKEW_MS = 24 * 60 * 60 * 1_000

export type QuizIntegrityEventType =
  | 'page-hidden'
  | 'fullscreen-ended'
  | 'connection-interrupted'
  | 'session-replaced'
  | 'monitoring-limited'

export interface QuizIntegrityEventInput {
  eventId: string
  type: QuizIntegrityEventType
  startedAt: number
  endedAt?: number
  questionId?: string
  sequence: number
  sessionId?: string
}

export interface QuizIntegrityEventRecord extends QuizIntegrityEventInput {
  receivedAt: number
  durationMs: number
}

export interface QuizIntegritySummary {
  eventCount: number
  monitoringLimited: boolean
  deleteAfter: number
}

export interface QuizIntegrityReview {
  summary: QuizIntegritySummary
  events: QuizIntegrityEventRecord[]
}

export interface QuizAccount {
  uid: string
  nickname: string
  role?: 'student' | 'teacher'
}

export type QuizServiceErrorCode =
  | 'invalid-argument'
  | 'failed-precondition'
  | 'not-found'
  | 'permission-denied'
  | 'conflict'
  | 'too-many-events'

export class QuizServiceError extends Error {
  constructor(readonly code: QuizServiceErrorCode, message: string) {
    super(message)
    this.name = 'QuizServiceError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validId(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value)
}

function safeInteger(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum
}

function normalizeStats(value: unknown): QuizRankStats {
  const record = isRecord(value) ? value : {}
  const totalCorrect = safeInteger(record.totalCorrect) ? record.totalCorrect : 0
  const totalQuestions = safeInteger(record.totalQuestions) ? record.totalQuestions : 0
  return {
    quizzesTaken: safeInteger(record.quizzesTaken) ? record.quizzesTaken : 0,
    quizzesPassed: safeInteger(record.quizzesPassed) ? record.quizzesPassed : 0,
    currentStreak: safeInteger(record.currentStreak) ? record.currentStreak : 0,
    bestStreak: safeInteger(record.bestStreak) ? record.bestStreak : 0,
    totalCorrect,
    totalQuestions,
    lifetimeAccuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
  }
}

/** Requires a ready account that has acknowledged the deployment's current privacy notice. */
export async function requireQuizAccount(database: CoreDatabase, uid: string): Promise<QuizAccount> {
  const value = (await database.ref(`accounts/${uid}`).get()).val()
  if (!isRecord(value) || !isRecord(value.privacy) || !isRecord(value.privacy.acknowledgements)) {
    throw new QuizServiceError('failed-precondition', 'A ready Kogni account is required.')
  }
  const privacyVersion = expectedPrivacyVersion()
  if (
    value.uid !== uid ||
    value.status !== 'ready' ||
    typeof value.nickname !== 'string' ||
    !/^[A-Za-z0-9_]{3,24}$/.test(value.nickname) ||
    value.privacy.currentVersion !== privacyVersion ||
    value.privacy.acknowledgements[privacyVersion] === undefined ||
    (value.role !== undefined && value.role !== 'student' && value.role !== 'teacher')
  ) {
    throw new QuizServiceError('failed-precondition', 'A ready Kogni account with the current privacy acknowledgement is required.')
  }
  return { uid, nickname: value.nickname, ...(value.role ? { role: value.role } : {}) }
}

export interface QuizResolution {
  status: 'available' | 'active' | 'completed'
  code: string
  quiz: {
    quizId: string
    title: string
    description: string
    questionCount: number
    integrity: { enabled: boolean; noticeVersion: 'quiz-integrity-v1' }
  }
  result?: ReturnType<typeof buildCompletedAttemptResult>
  stats?: QuizRankStats
}

/** Resolves one exact shared code without exposing questions before the attempt starts. */
export async function resolveQuizCodeService(
  database: CoreDatabase,
  uid: string,
  code: string,
): Promise<QuizResolution> {
  if (!QUIZ_CODE_PATTERN.test(code)) throw new QuizServiceError('invalid-argument', 'A valid quiz code is required.')
  await requireQuizAccount(database, uid)
  const codeValue = (await database.ref(`quizCodes/${code}`).get()).val()
  if (!isRecord(codeValue) || !validId(codeValue.quizId, QUIZ_ID_PATTERN) || typeof codeValue.ownerId !== 'string') {
    throw new QuizServiceError('not-found', 'No live quiz is using that code.')
  }
  const quiz = await readQuizMetadata(database, codeValue.quizId)
  if (quiz.ownerId !== codeValue.ownerId) throw new QuizServiceError('not-found', 'No live quiz is using that code.')
  const metadata = {
    quizId: quiz.id,
    title: quiz.title,
    description: quiz.description,
    questionCount: quiz.questionCount,
    integrity: {
      enabled: quiz.integrity.enabled,
      noticeVersion: 'quiz-integrity-v1' as const,
    },
  }
  if (quiz.ownerId === uid) return { status: 'available', code, quiz: metadata }
  const stored = (await attemptReference(database, quiz.id, uid).get()).val()
  const active = parseQuizV2Attempt(stored, quiz)
  if (active?.status === 'active') return { status: 'active', code, quiz: metadata }
  if (stored === null || stored === undefined) return { status: 'available', code, quiz: metadata }

  const answerKey = parseQuizAnswerKey((await database.ref(`quizAnswers/${quiz.id}`).get()).val(), quiz)
  if (!answerKey) throw new QuizServiceError('not-found', 'This quiz is no longer available.')
  const completed = parseCompletedQuizAttempt(stored, quiz, answerKey)
    ?? parseLegacyCompletedQuizResult(stored, quiz, answerKey)
  if (completed) {
    const result = isV2CompletedAttempt(completed)
      ? buildCompletedAttemptResult(await finalizeIntegritySummary(database, completed))
      : buildCompletedAttemptResult(completed)
    if (!result) throw new QuizServiceError('failed-precondition', 'The stored quiz result is invalid.')
    return { status: 'completed', code, quiz: metadata, result, stats: await readStats(database, uid) }
  }
  return { status: 'available', code, quiz: metadata }
}

export interface QuizSource {
  quiz: ParsedQuiz
  answerKey: QuizAnswerKey
}

export async function readQuizMetadata(database: CoreDatabase, quizId: string): Promise<ParsedQuiz> {
  if (!QUIZ_ID_PATTERN.test(quizId)) throw new QuizServiceError('invalid-argument', 'A valid quiz is required.')
  const quiz = parseQuiz((await database.ref(`quizzes/${quizId}`).get()).val(), quizId)
  if (!quiz) throw new QuizServiceError('not-found', 'This quiz is no longer available.')
  return quiz
}

export async function readQuizSource(database: CoreDatabase, quizId: string): Promise<QuizSource> {
  if (!QUIZ_ID_PATTERN.test(quizId)) throw new QuizServiceError('invalid-argument', 'A valid quiz is required.')
  const [quizSnapshot, answerSnapshot] = await Promise.all([
    database.ref(`quizzes/${quizId}`).get(),
    database.ref(`quizAnswers/${quizId}`).get(),
  ])
  const quiz = parseQuiz(quizSnapshot.val(), quizId)
  const answerKey = parseQuizAnswerKey(answerSnapshot.val(), quiz)
  if (!quiz || !answerKey) throw new QuizServiceError('not-found', 'This quiz is no longer available.')
  return { quiz, answerKey }
}

function attemptReference(database: CoreDatabase, quizId: string, uid: string) {
  return database.ref(`quizAttempts/${quizId}/${uid}`)
}

function isV2CompletedAttempt(
  value: CompletedQuizAttempt | LegacyCompletedQuizResult,
): value is CompletedQuizAttempt {
  return 'schemaVersion' in value && value.schemaVersion === 2 && 'attemptId' in value
}

function integritySummaryFromAttempt(
  attempt: CompletedQuizAttempt,
  eventCount = attempt.integritySummary?.eventCount ?? 0,
  monitoringLimited = attempt.integritySummary?.monitoringLimited ?? attempt.integrity?.fullscreenStart !== 'entered',
) {
  const deleteAfter = attempt.integrity?.deleteAfter
  if (!attempt.integrity?.enabled || deleteAfter === undefined) return undefined
  return { eventCount, monitoringLimited, deleteAfter }
}

async function finalizeIntegritySummary(
  database: CoreDatabase,
  attempt: CompletedQuizAttempt,
): Promise<CompletedQuizAttempt> {
  if (!attempt.integrity?.enabled || attempt.integrity.deleteAfter === undefined) return attempt
  const eventsValue = (await database.ref(`quizAttemptEvents/${attempt.quizId}/${attempt.uid}`).get()).val()
  const records = isRecord(eventsValue) ? Object.values(eventsValue) : []
  const matching = records.filter((value) => isRecord(value) && value.attemptId === attempt.attemptId)
  const summary = integritySummaryFromAttempt(
    attempt,
    matching.length,
    attempt.integrity.fullscreenStart !== 'entered' || matching.some((value) => isRecord(value) && value.type === 'monitoring-limited'),
  )
  if (!summary) return attempt
  const next = { ...attempt, integritySummary: summary }
  await database.ref(`quizAttempts/${attempt.quizId}/${attempt.uid}`).update({ integritySummary: summary })
  return next
}

function completedResponse(
  result: CompletedQuizAttempt | LegacyCompletedQuizResult,
  statsValue?: unknown,
  status: 'already' | 'completed' = statsValue === undefined ? 'already' : 'completed',
): { status: 'already' | 'completed'; result: NonNullable<ReturnType<typeof buildCompletedAttemptResult>>; stats?: QuizRankStats } {
  const safeResult = buildCompletedAttemptResult(result)
  if (!safeResult) throw new QuizServiceError('failed-precondition', 'The stored quiz result is invalid.')
  return statsValue === undefined
    ? { status, result: safeResult }
    : { status, result: safeResult, stats: normalizeStats(statsValue) }
}

async function readStats(database: CoreDatabase, uid: string): Promise<QuizRankStats> {
  return normalizeStats((await database.ref(`roleStats/${uid}`).get()).val())
}

export interface StartQuizAttemptInput {
  quizId: string
  sessionId: string
  fullscreenStart: QuizIntegrityFullscreenStart
  attemptId: string
  now?: number
}

export async function startQuizAttemptService(
  database: CoreDatabase,
  uid: string,
  input: StartQuizAttemptInput,
) {
  if (!QUIZ_ID_PATTERN.test(input.quizId) || !QUIZ_SESSION_ID_PATTERN.test(input.sessionId) || !QUIZ_OPERATION_ID_PATTERN.test(input.attemptId)) {
    throw new QuizServiceError('invalid-argument', 'A valid quiz session is required.')
  }
  if (!['not-requested', 'entered', 'unsupported', 'denied'].includes(input.fullscreenStart)) {
    throw new QuizServiceError('invalid-argument', 'A valid fullscreen state is required.')
  }
  const now = input.now ?? Date.now()
  const account = await requireQuizAccount(database, uid)
  const { quiz, answerKey } = await readQuizSource(database, input.quizId)
  if (quiz.integrity.enabled && input.fullscreenStart === 'not-requested') {
    throw new QuizServiceError('invalid-argument', 'Integrity Mode requires a fullscreen availability result.')
  }
  if (!quiz.integrity.enabled && input.fullscreenStart !== 'not-requested') {
    throw new QuizServiceError('invalid-argument', 'Ordinary quizzes do not request fullscreen.')
  }
  if (quiz.ownerId === uid) throw new QuizServiceError('permission-denied', 'Quiz creators cannot take their own quiz.')

  const outcome = { value: 'resumed' as 'created' | 'resumed' | 'replaced' | 'completed' }
  const transaction = await attemptReference(database, quiz.id, uid).transaction((current) => {
    const completed = parseCompletedQuizAttempt(current, quiz, answerKey)
      ?? parseLegacyCompletedQuizResult(current, quiz, answerKey)
    if (completed) {
      outcome.value = 'completed'
      return current
    }
    const active = parseQuizV2Attempt(current, quiz)
    if (!active) {
      if (current !== null && current !== undefined) return undefined
      outcome.value = 'created'
      return createQuizAttempt({
        quiz,
        uid,
        nickname: account.nickname,
        attemptId: input.attemptId,
        sessionId: input.sessionId,
        fullscreenStart: input.fullscreenStart,
        now,
      })
    }
    const advanced = advanceExpiredAttempt(active, quiz, answerKey, now)
    if (advanced.status === 'completed') {
      outcome.value = 'completed'
      return advanced
    }
    if (advanced.sessionId !== input.sessionId) {
      outcome.value = 'replaced'
      return { ...advanced, sessionId: input.sessionId }
    }
    outcome.value = 'resumed'
    return advanced
  })
  if (!transaction.committed) throw new QuizServiceError('failed-precondition', 'The stored quiz attempt is invalid.')

  const stored = transaction.snapshot.val()
  const completed = parseCompletedQuizAttempt(stored, quiz, answerKey)
    ?? parseLegacyCompletedQuizResult(stored, quiz, answerKey)
  if (completed) {
    if (isV2CompletedAttempt(completed)) {
      await reconcileCompletedAttempt(database, completed, quiz.ownerId)
      const finalized = await finalizeIntegritySummary(database, completed)
      return completedResponse(finalized, await database.ref(`roleStats/${uid}`).get().then((snapshot) => snapshot.val()), 'already')
    }
    return completedResponse(completed, await database.ref(`roleStats/${uid}`).get().then((snapshot) => snapshot.val()), 'already')
  }
  const attempt = parseQuizV2Attempt(stored, quiz)
  if (!attempt || attempt.status !== 'active') throw new QuizServiceError('failed-precondition', 'The quiz attempt could not be resumed.')
  if (outcome.value === 'replaced' && quiz.integrity.enabled) {
    const eventsValue = (await database.ref(`quizAttemptEvents/${quiz.id}/${uid}`).get()).val()
    const eventCount = isRecord(eventsValue) ? Object.keys(eventsValue).length : 0
    const replacementEventId = `replace_${eventCount.toString(36)}_${input.sessionId}`
    await writeIntegrityEvents(database, uid, quiz, attempt, [{
      eventId: replacementEventId,
      type: 'session-replaced',
      sessionId: input.sessionId,
      startedAt: now,
      sequence: 0,
    }], now)
  }
  const responseNow = input.now ?? Date.now()
  const activeState = buildActiveAttemptState(attempt, quiz, responseNow)
  if (!activeState) throw new QuizServiceError('failed-precondition', 'The current quiz question is invalid.')
  return {
    ...activeState,
    status: outcome.value === 'created' ? 'started' as const : 'resumed' as const,
  }
}

export interface AnswerQuizQuestionInput {
  quizId: string
  attemptId: string
  sessionId: string
  questionId: string
  operationId: string
  chosenIndex: number
  now?: number
}

export async function answerQuizQuestionService(
  database: CoreDatabase,
  uid: string,
  input: AnswerQuizQuestionInput,
) {
  if (
    !QUIZ_ID_PATTERN.test(input.quizId) ||
    !QUIZ_OPERATION_ID_PATTERN.test(input.attemptId) ||
    !QUIZ_SESSION_ID_PATTERN.test(input.sessionId) ||
    !QUIZ_OPERATION_ID_PATTERN.test(input.operationId) ||
    !/^q_[0-9]{1,2}$/.test(input.questionId) ||
    !Number.isInteger(input.chosenIndex)
  ) throw new QuizServiceError('invalid-argument', 'A valid answer operation is required.')
  const now = input.now ?? Date.now()
  await requireQuizAccount(database, uid)
  const { quiz, answerKey } = await readQuizSource(database, input.quizId)
  let transitionCode: string | null = null
  const transaction = await attemptReference(database, quiz.id, uid).transaction((current) => {
    const completed = parseCompletedQuizAttempt(current, quiz, answerKey)
      ?? parseLegacyCompletedQuizResult(current, quiz, answerKey)
    if (completed) return current
    const active = parseQuizV2Attempt(current, quiz)
    if (!active) return undefined
    const currentQuestion = active.status === 'active' ? quiz.questions.find((question) => question.id === input.questionId) : undefined
    if (!currentQuestion || input.chosenIndex < -1 || input.chosenIndex >= currentQuestion.choices.length) {
      transitionCode = 'invalid-answer'
      return undefined
    }
    const transition = applyAnswerOperation(active, quiz, answerKey, {
      attemptId: input.attemptId,
      sessionId: input.sessionId,
      questionId: input.questionId,
      operationId: input.operationId,
      chosenIndex: input.chosenIndex,
      receivedAt: now,
    })
    transitionCode = transition.code
    if (transition.code === 'attempt-mismatch' || transition.code === 'session-replaced' || transition.code === 'operation-reused') return undefined
    return transition.attempt
  })
  if (!transaction.committed) {
    if (transitionCode === 'session-replaced' || transitionCode === 'operation-reused') {
      return { status: 'conflict' as const, reason: transitionCode }
    }
    if (transitionCode === 'attempt-mismatch') throw new QuizServiceError('conflict', 'The quiz attempt changed. Resume it and try again.')
    if (transitionCode === 'invalid-answer') throw new QuizServiceError('invalid-argument', 'The selected answer is invalid.')
    throw new QuizServiceError('failed-precondition', 'No active quiz attempt is available.')
  }
  const stored = transaction.snapshot.val()
  const completed = parseCompletedQuizAttempt(stored, quiz, answerKey)
    ?? parseLegacyCompletedQuizResult(stored, quiz, answerKey)
  if (completed) {
    if (isV2CompletedAttempt(completed)) {
      const stats = await reconcileCompletedAttempt(database, completed, quiz.ownerId)
      return completedResponse(await finalizeIntegritySummary(database, completed), stats)
    }
    return completedResponse(completed, await readStats(database, uid))
  }
  const attempt = parseQuizV2Attempt(stored, quiz)
  if (!attempt || attempt.status !== 'active') throw new QuizServiceError('failed-precondition', 'The quiz attempt is invalid.')
  const responseNow = input.now ?? Date.now()
  const activeState = buildActiveAttemptState(attempt, quiz, responseNow)
  if (!activeState) throw new QuizServiceError('failed-precondition', 'The current quiz question is invalid.')
  return { ...activeState, status: 'active' as const }
}

/** Idempotently applies rank statistics and auto badges for one completed v2 attempt. */
export async function reconcileCompletedAttempt(
  database: CoreDatabase,
  attempt: CompletedQuizAttempt,
  ownerId: string,
): Promise<QuizRankStats> {
  const statsResult = await database.ref(`roleStats/${attempt.uid}`).transaction((current) => (
    applyCompletedAttemptStats(current, attempt)
  ))
  const writes: Record<string, unknown> = {}
  if (attempt.score === 100) writes[`badges/${attempt.uid}/perfect-round`] = { awardedAt: attempt.gradedAt, type: 'auto' }
  const owned = (await database.ref(`quizzesByOwner/${ownerId}`).get()).val()
  if (isRecord(owned) && Object.keys(owned).length >= 10) {
    writes[`badges/${ownerId}/quiz-architect`] = { awardedAt: attempt.gradedAt, type: 'auto' }
  }
  if (Object.keys(writes).length > 0) await database.ref().update(writes)
  return normalizeStats(statsResult.snapshot.val())
}

function isIntegrityEventType(value: unknown): value is QuizIntegrityEventType {
  return value === 'page-hidden' || value === 'fullscreen-ended' || value === 'connection-interrupted' || value === 'session-replaced' || value === 'monitoring-limited'
}

function normalizeIntegrityEvents(value: unknown, now: number): QuizIntegrityEventInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_INTEGRITY_EVENTS_PER_REQUEST) {
    throw new QuizServiceError('invalid-argument', 'A bounded event batch is required.')
  }
  return value.map((event) => {
    if (
      !isRecord(event) ||
      Object.keys(event).some((key) => !['eventId', 'type', 'startedAt', 'endedAt', 'questionId', 'sequence', 'sessionId'].includes(key)) ||
      !validId(event.eventId, QUIZ_EVENT_ID_PATTERN) || !isIntegrityEventType(event.type) ||
      !safeInteger(event.startedAt) || event.startedAt > MAX_JAVASCRIPT_DATE_MS || Math.abs(event.startedAt - now) > MAX_EVENT_CLOCK_SKEW_MS ||
      (event.endedAt !== undefined && (!safeInteger(event.endedAt) || event.endedAt > MAX_JAVASCRIPT_DATE_MS || event.endedAt < event.startedAt || Math.abs(event.endedAt - now) > MAX_EVENT_CLOCK_SKEW_MS)) ||
      (event.questionId !== undefined && (typeof event.questionId !== 'string' || !/^q_[0-9]{1,2}$/.test(event.questionId))) ||
      (event.sessionId !== undefined && !validId(event.sessionId, QUIZ_SESSION_ID_PATTERN)) ||
      !safeInteger(event.sequence)
    ) throw new QuizServiceError('invalid-argument', 'An integrity event is invalid.')
    return {
      eventId: event.eventId,
      type: event.type,
      startedAt: event.startedAt,
      ...(event.endedAt === undefined ? {} : { endedAt: event.endedAt }),
      ...(event.questionId === undefined ? {} : { questionId: event.questionId }),
      ...(event.sessionId === undefined ? {} : { sessionId: event.sessionId }),
      sequence: event.sequence,
    }
  })
}

export async function writeIntegrityEvents(
  database: CoreDatabase,
  uid: string,
  quiz: ParsedQuiz,
  attempt: QuizV2Attempt,
  eventsValue: unknown,
  now = Date.now(),
): Promise<{ acceptedEventIds: string[]; serverNow: number }> {
  if (!quiz.integrity.enabled || !attempt.integrity?.enabled) {
    throw new QuizServiceError('failed-precondition', 'Integrity Mode is not enabled for this quiz.')
  }
  const events = normalizeIntegrityEvents(eventsValue, now)
  const accepted: string[] = []
  const path = `quizAttemptEvents/${quiz.id}/${uid}`
  const transaction = await database.ref(path).transaction((current) => {
    const records = isRecord(current) ? { ...current } : {}
    let count = Object.keys(records).length
    for (const event of events) {
      const existing = records[event.eventId]
      if (existing !== undefined) {
        if (
          !isRecord(existing) || existing.attemptId !== attempt.attemptId || existing.sessionId !== (event.sessionId ?? attempt.sessionId) ||
          existing.type !== event.type || existing.startedAt !== event.startedAt || existing.endedAt !== event.endedAt
        ) {
          throw new QuizServiceError('conflict', 'An integrity event identifier was reused.')
        }
        accepted.push(event.eventId)
        continue
      }
      if (count >= MAX_INTEGRITY_EVENTS_PER_ATTEMPT) throw new QuizServiceError('too-many-events', 'The integrity event limit was reached.')
      const durationMs = event.endedAt === undefined ? 0 : Math.max(0, event.endedAt - event.startedAt)
      records[event.eventId] = {
        ...event,
        attemptId: attempt.attemptId,
        sessionId: event.sessionId ?? attempt.sessionId,
        receivedAt: now,
        durationMs,
      }
      accepted.push(event.eventId)
      count += 1
    }
    return records
  })
  if (!transaction.committed) throw new QuizServiceError('failed-precondition', 'Integrity events could not be recorded.')
  return { acceptedEventIds: [...new Set(accepted)], serverNow: now }
}

export interface RecordIntegrityEventsInput {
  quizId: string
  attemptId: string
  sessionId: string
  events: unknown
  now?: number
}

export async function recordIntegrityEventsService(
  database: CoreDatabase,
  uid: string,
  input: RecordIntegrityEventsInput,
) {
  if (!QUIZ_ID_PATTERN.test(input.quizId) || !QUIZ_OPERATION_ID_PATTERN.test(input.attemptId) || !QUIZ_SESSION_ID_PATTERN.test(input.sessionId)) {
    throw new QuizServiceError('invalid-argument', 'A valid quiz session is required.')
  }
  const now = input.now ?? Date.now()
  await requireQuizAccount(database, uid)
  const { quiz, answerKey } = await readQuizSource(database, input.quizId)
  const attemptTransaction = await attemptReference(database, quiz.id, uid).transaction((current) => {
    const attempt = parseQuizV2Attempt(current, quiz, answerKey)
    if (!attempt || attempt.attemptId !== input.attemptId || attempt.sessionId !== input.sessionId) return undefined
    return advanceExpiredAttempt(attempt, quiz, answerKey, now)
  })
  if (!attemptTransaction.committed) throw new QuizServiceError('conflict', 'The quiz session was replaced or is unavailable.')
  const stored = attemptTransaction.snapshot.val()
  const attempt = parseQuizV2Attempt(stored, quiz, answerKey)
  if (!attempt || !attempt.integrity?.enabled) throw new QuizServiceError('failed-precondition', 'No Integrity Mode attempt is available.')
  if (attempt.status === 'completed' && (attempt.integrity.deleteAfter === undefined || attempt.integrity.deleteAfter <= now)) {
    throw new QuizServiceError('not-found', 'This integrity log has expired.')
  }
  if (attempt.status === 'completed') await reconcileCompletedAttempt(database, attempt, quiz.ownerId)
  const result = await writeIntegrityEvents(database, uid, quiz, attempt, input.events, now)
  if (attempt.status === 'completed') await finalizeIntegritySummary(database, attempt)
  return result
}

function readIntegrityRecord(value: unknown): (QuizIntegrityEventRecord & { sessionId?: string }) | null {
  if (
    !isRecord(value) || !validId(value.eventId, QUIZ_EVENT_ID_PATTERN) || !validId(value.attemptId, QUIZ_OPERATION_ID_PATTERN) ||
    (value.sessionId !== undefined && !validId(value.sessionId, QUIZ_SESSION_ID_PATTERN)) ||
    !isIntegrityEventType(value.type) || !safeInteger(value.startedAt) || !safeInteger(value.receivedAt) ||
    !safeInteger(value.durationMs) || !safeInteger(value.sequence)
  ) return null
  return {
    eventId: value.eventId,
    ...(typeof value.sessionId === 'string' ? { sessionId: value.sessionId } : {}),
    type: value.type,
    startedAt: value.startedAt,
    ...(safeInteger(value.endedAt) ? { endedAt: value.endedAt } : {}),
    ...(typeof value.questionId === 'string' ? { questionId: value.questionId } : {}),
    sequence: value.sequence,
    receivedAt: value.receivedAt,
    durationMs: value.durationMs,
  }
}

export async function getIntegrityReviewService(
  database: CoreDatabase,
  actorUid: string,
  quizId: string,
  subjectUid: string,
  now = Date.now(),
): Promise<QuizIntegrityReview> {
  if (!QUIZ_ID_PATTERN.test(quizId) || !validId(subjectUid, /^[A-Za-z0-9_-]{1,128}$/)) {
    throw new QuizServiceError('invalid-argument', 'A valid quiz result is required.')
  }
  await requireQuizAccount(database, actorUid)
  const { quiz, answerKey } = await readQuizSource(database, quizId)
  if (actorUid !== subjectUid && actorUid !== quiz.ownerId) throw new QuizServiceError('permission-denied', 'This integrity log is private.')
  const attemptValue = (await attemptReference(database, quizId, subjectUid).get()).val()
  const completed = parseCompletedQuizAttempt(attemptValue, quiz, answerKey)
  if (!completed?.integritySummary) throw new QuizServiceError('not-found', 'No integrity log is available.')
  if (completed.integritySummary.deleteAfter <= now) throw new QuizServiceError('not-found', 'This integrity log has expired.')
  const raw = (await database.ref(`quizAttemptEvents/${quizId}/${subjectUid}`).get()).val()
  const rawEvents = isRecord(raw)
    ? Object.values(raw)
      .filter((value) => isRecord(value) && value.attemptId === completed.attemptId)
      .map(readIntegrityRecord)
      .filter((event): event is QuizIntegrityEventRecord & { sessionId?: string } => event !== null)
      .sort((left, right) => left.receivedAt - right.receivedAt || left.sequence - right.sequence)
    : []
  const events = rawEvents.map(({ sessionId: _sessionId, ...event }, sequence) => ({ ...event, sequence }))
  return {
    summary: {
      eventCount: events.length,
      monitoringLimited: completed.integritySummary.monitoringLimited || events.some((event) => event.type === 'monitoring-limited'),
      deleteAfter: completed.integritySummary.deleteAfter,
    },
    events,
  }
}

export async function readStoredAttempt(
  database: CoreDatabase,
  quizId: string,
  uid: string,
): Promise<QuizV2Attempt | CompletedQuizAttempt | LegacyCompletedQuizResult | null> {
  const { quiz, answerKey } = await readQuizSource(database, quizId)
  const value = (await attemptReference(database, quizId, uid).get()).val()
  return parseCompletedQuizAttempt(value, quiz, answerKey)
    ?? parseLegacyCompletedQuizResult(value, quiz, answerKey)
    ?? parseQuizV2Attempt(value, quiz, answerKey)
}

export { QUIZ_INTEGRITY_RETENTION_MS, QUIZ_TIME_LIMIT_MS }
