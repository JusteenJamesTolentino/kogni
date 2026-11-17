import assert from 'node:assert/strict'
import test from 'node:test'
import { memoryDatabase } from './core-test-helpers.js'
import { applyAnswerOperation, createQuizAttempt, parseQuizAnswerKey, parseQuizRecord } from './quiz-core.js'
import { reconcileQuizAttemptEffects, cleanupQuizIntegrityData } from './quiz-effects.js'

function fixture() {
  const quizValue = {
    id: 'quiz-one', ownerId: 'teacher-one', title: 'Quiz', description: '', questionCount: 1,
    questions: { q_0: { prompt: 'Q', choices: ['A', 'B'] } }, createdAt: 1, updatedAt: 1,
  }
  const answerValue = { ownerId: 'teacher-one', correct: { q_0: 0 } }
  const quiz = parseQuizRecord(quizValue, 'quiz-one')!
  const answerKey = parseQuizAnswerKey(answerValue, quiz)!
  const active = createQuizAttempt(quiz, {
    attemptId: 'attempt-one', sessionId: 'session-one', uid: 'student-one', nickname: 'StudentOne', now: 1_000,
  })
  const transition = applyAnswerOperation(active, quiz, answerKey, {
    attemptId: 'attempt-one', sessionId: 'session-one', operationId: 'operation-one', questionId: 'q_0', chosenIndex: 0, receivedAt: 2_000,
  })
  if (transition.attempt.status !== 'completed') throw new Error('Expected completion')
  return { quizValue, answerValue, attempt: transition.attempt }
}

test('retention cleanup completes abandoned attempts and deletes expired signal logs', async () => {
  const quizValue = {
    id: 'quiz-one', ownerId: 'teacher-one', title: 'Quiz', description: '', questionCount: 1,
    questions: { q_0: { prompt: 'Q', choices: ['A', 'B'] } }, createdAt: 1, updatedAt: 1,
    integrity: { enabled: true, noticeVersion: 'quiz-integrity-v1', authorityAcknowledgedAt: 1 },
  }
  const answerValue = { ownerId: 'teacher-one', correct: { q_0: 0 } }
  const quiz = parseQuizRecord(quizValue, 'quiz-one')!
  const active = createQuizAttempt(quiz, {
    attemptId: 'attempt-one', sessionId: 'session-one', uid: 'student-one', nickname: 'StudentOne', fullscreenStart: 'entered', now: 1_000,
  })
  const memory = memoryDatabase({
    quizzes: { 'quiz-one': quizValue },
    quizAnswers: { 'quiz-one': answerValue },
    quizAttempts: { 'quiz-one': { 'student-one': active } },
    quizAttemptEvents: { 'quiz-one': { 'student-one': { event: true } } },
  })
  assert.deepEqual(await cleanupQuizIntegrityData(memory.database, 31_001), {
    attemptsCompleted: 1,
    eventLogsDeleted: 0,
    invalidRecordsSkipped: 0,
  })
  const completed = memory.read('quizAttempts/quiz-one/student-one') as { gradedAt: number; integrity: { deleteAfter: number } }
  assert.equal(completed.gradedAt, 31_000)
  assert.equal(completed.integrity.deleteAfter, 31_000 + (30 * 24 * 60 * 60 * 1_000))
  assert.deepEqual(await cleanupQuizIntegrityData(memory.database, completed.integrity.deleteAfter), {
    attemptsCompleted: 0,
    eventLogsDeleted: 1,
    invalidRecordsSkipped: 0,
  })
  assert.equal(memory.read('quizAttemptEvents/quiz-one/student-one'), null)
})

test('completion recovery applies rank effects once and ignores retries', async () => {
  const { quizValue, answerValue, attempt } = fixture()
  const memory = memoryDatabase({
    quizzes: { 'quiz-one': quizValue },
    quizAnswers: { 'quiz-one': answerValue },
    quizAttempts: { 'quiz-one': { 'student-one': attempt } },
  })
  assert.equal(await reconcileQuizAttemptEffects(memory.database, 'quiz-one', 'student-one'), true)
  assert.equal(await reconcileQuizAttemptEffects(memory.database, 'quiz-one', 'student-one'), true)
  assert.deepEqual(memory.read('roleStats/student-one'), {
    quizzesTaken: 1,
    quizzesPassed: 1,
    currentStreak: 1,
    bestStreak: 1,
    totalCorrect: 1,
    totalQuestions: 1,
    lastQuizAt: 2_000,
    appliedAttempts: { 'quiz-one': 'attempt-one' },
  })
  assert.deepEqual(memory.read('badges/student-one/perfect-round'), { awardedAt: 2_000, type: 'auto' })
})

test('completion recovery fails closed for malformed or legacy records', async () => {
  const { quizValue, answerValue } = fixture()
  const memory = memoryDatabase({ quizzes: { 'quiz-one': quizValue }, quizAnswers: { 'quiz-one': answerValue }, quizAttempts: { 'quiz-one': { 'student-one': { score: 100 } } } })
  assert.equal(await reconcileQuizAttemptEffects(memory.database, 'quiz-one', 'student-one'), false)
  assert.equal(memory.read('roleStats/student-one'), null)
})
