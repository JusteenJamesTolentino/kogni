import {
  QUIZ_INTEGRITY_NOTICE_VERSION,
  applyAnswerOperation,
  buildCompletedResult,
  createQuizAttempt,
  parseQuizAnswerKey,
  parseQuizRecord,
} from '../../../functions/src/quiz-core'
import type {
  CompletedQuizAttempt,
  LegacyCompletedQuizResult,
  ParsedQuizAnswerKey,
  ParsedQuizRecord,
  QuizV2Attempt,
} from '../../../functions/src/quiz-core'
import { eligibleTestAccount, memoryDatabase } from '../../../functions/src/core-test-helpers'

export const NOW = 1_700_000_000_000
export const QUIZ_ID = 'quiz-one'
export const STUDENT_UID = 'student1'
export const OWNER_UID = 'teacher1'
export const OUTSIDER_UID = 'outsider1'
export const ATTEMPT_ID = 'attempt-one'
export const OTHER_ATTEMPT_ID = 'attempt-two'
export const SESSION_ID = 'session-one'
export const OTHER_SESSION_ID = 'session-two'
export const OPERATION_ID = 'operation-one'
export const OTHER_OPERATION_ID = 'operation-two'
export const AUTHORITY_ACKNOWLEDGED_AT = NOW - 10_000

export function rawQuizRecord(options: {
  integrity?: boolean
  ownerId?: string
  questionCount?: number
} = {}): Record<string, unknown> {
  const questionCount = options.questionCount ?? 2
  const questions: Record<string, unknown> = {}
  for (let index = 0; index < questionCount; index += 1) {
    questions[`q_${index}`] = {
      prompt: index === 0 ? 'Current question only' : `Future question ${index} must stay private`,
      choices: index === 0 ? ['Current A', 'Current B'] : ['Future A', 'Future B', 'Future C'],
    }
  }
  return {
    id: QUIZ_ID,
    ownerId: options.ownerId ?? OWNER_UID,
    title: 'Authoritative quiz',
    description: 'Server-owned timing and grading',
    questionCount,
    questions,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...(options.integrity
      ? {
          integrity: {
            enabled: true,
            noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
            authorityAcknowledgedAt: AUTHORITY_ACKNOWLEDGED_AT,
          },
        }
      : {}),
  }
}

export function rawAnswerKey(questionCount = 2, ownerId = OWNER_UID): Record<string, unknown> {
  const correct: Record<string, number> = {}
  for (let index = 0; index < questionCount; index += 1) correct[`q_${index}`] = index === 0 ? 0 : 1
  return { ownerId, correct }
}

export function parsedQuizFixture(options: {
  integrity?: boolean
  ownerId?: string
  questionCount?: number
} = {}): { quiz: ParsedQuizRecord; answerKey: ParsedQuizAnswerKey } {
  const questionCount = options.questionCount ?? 2
  const ownerId = options.ownerId ?? OWNER_UID
  const quiz = parseQuizRecord(rawQuizRecord({ ...options, ownerId, questionCount }), QUIZ_ID)
  if (!quiz) throw new Error('The synthetic quiz fixture is invalid.')
  const answerKey = parseQuizAnswerKey(rawAnswerKey(questionCount, ownerId), quiz)
  if (!answerKey) throw new Error('The synthetic answer-key fixture is invalid.')
  return { quiz, answerKey }
}

export function quizDatabaseSeed(options: {
  integrity?: boolean
  questionCount?: number
  studentUid?: string
} = {}): Record<string, unknown> {
  const questionCount = options.questionCount ?? 2
  const studentUid = options.studentUid ?? STUDENT_UID
  return {
    accounts: {
      [studentUid]: eligibleTestAccount(studentUid),
      [OWNER_UID]: eligibleTestAccount(OWNER_UID),
      [OUTSIDER_UID]: eligibleTestAccount(OUTSIDER_UID),
    },
    quizzes: { [QUIZ_ID]: rawQuizRecord({ integrity: options.integrity, questionCount }) },
    quizAnswers: { [QUIZ_ID]: rawAnswerKey(questionCount) },
  }
}

export function quizMemory(options: {
  integrity?: boolean
  questionCount?: number
  studentUid?: string
} = {}) {
  return memoryDatabase(quizDatabaseSeed(options))
}

export function completedAttempt(options: {
  integrity?: boolean
  questionCount?: number
  uid?: string
  attemptId?: string
  sessionId?: string
  fullscreenStart?: 'entered' | 'unsupported' | 'denied' | 'not-requested'
  startedAt?: number
  chosenIndexes?: number[]
} = {}): CompletedQuizAttempt {
  const questionCount = options.questionCount ?? 2
  const uid = options.uid ?? STUDENT_UID
  const { quiz, answerKey } = parsedQuizFixture({ integrity: options.integrity, questionCount })
  let attempt: QuizV2Attempt = createQuizAttempt({
    quiz,
    uid,
    nickname: eligibleTestAccount(uid).nickname,
    attemptId: options.attemptId ?? ATTEMPT_ID,
    sessionId: options.sessionId ?? SESSION_ID,
    fullscreenStart: options.fullscreenStart ?? (options.integrity ? 'entered' : 'not-requested'),
    now: options.startedAt ?? NOW,
  })
  for (let index = 0; index < questionCount; index += 1) {
    const transition = applyAnswerOperation(attempt, quiz, answerKey, {
      attemptId: attempt.attemptId,
      sessionId: attempt.sessionId,
      operationId: `operation-${String(index).padStart(4, '0')}`,
      questionId: `q_${index}`,
      chosenIndex: options.chosenIndexes?.[index] ?? answerKey.correct[`q_${index}`]!,
      receivedAt: (options.startedAt ?? NOW) + ((index + 1) * 1_000),
    })
    if (transition.kind === 'rejected') throw new Error(`Synthetic completion failed: ${transition.reason}`)
    attempt = transition.attempt
  }
  if (attempt.status !== 'completed') throw new Error('The synthetic attempt did not complete.')
  return attempt
}

export function legacyCompletedResult(options: {
  questionCount?: number
  uid?: string
  chosenIndexes?: number[]
} = {}): LegacyCompletedQuizResult {
  const completed = completedAttempt({
    questionCount: options.questionCount,
    uid: options.uid,
    chosenIndexes: options.chosenIndexes,
  })
  const result = buildCompletedResult(completed)
  if (!result) throw new Error('The synthetic completed result could not be projected.')
  return { ...result, answers: { ...completed.answers } }
}

export function integrityEvent(overrides: Partial<{
  eventId: string
  type: 'page-hidden' | 'fullscreen-ended' | 'connection-interrupted' | 'session-replaced' | 'monitoring-limited'
  startedAt: number
  endedAt: number
  questionId: string
  sequence: number
}> = {}) {
  return {
    eventId: 'event-0001',
    type: 'page-hidden' as const,
    startedAt: NOW + 100,
    endedAt: NOW + 200,
    questionId: 'q_0',
    sequence: 1,
    ...overrides,
  }
}
