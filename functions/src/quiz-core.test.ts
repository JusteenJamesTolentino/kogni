import assert from 'node:assert/strict'
import test from 'node:test'
import {
  QUIZ_INTEGRITY_NOTICE_VERSION,
  QUIZ_INTEGRITY_RETENTION_MS,
  QUIZ_PASS_PERCENT,
  QUIZ_TIME_LIMIT_MS,
  advanceExpiredAttempt,
  applyAnswerOperation,
  applyCompletedAttemptStats,
  buildCompletedResult,
  buildCurrentQuestionResponse,
  createQuizAttempt,
  parseLegacyCompletedQuizResult,
  parseCompletedQuizAttempt,
  parseQuizAnswerKey,
  parseQuizAttemptV2,
  parseQuizRecord,
} from './quiz-core.js'
import type {
  ActiveQuizAttemptV2,
  ApplyAnswerOperationInput,
  NewQuizAttemptInput,
  ParsedQuizAnswerKey,
  ParsedQuizRecord,
  QuizAttemptV2,
} from './quiz-core.js'

function rawQuiz(questionCount = 2, integrity?: unknown): Record<string, unknown> {
  const questions: Record<string, unknown> = {}
  for (let index = 0; index < questionCount; index += 1) {
    questions[`q_${index}`] = {
      prompt: `Question ${index + 1}`,
      choices: index === 0 ? ['A', 'B'] : { 0: 'A', 1: 'B', 2: 'C' },
    }
  }
  return {
    id: 'quiz-one',
    ownerId: 'teacher-one',
    title: 'Cell quiz',
    description: 'Cells',
    questionCount,
    questions,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...(integrity === undefined ? {} : { integrity }),
  }
}

function rawAnswerKey(questionCount = 2): Record<string, unknown> {
  const correct: Record<string, number> = {}
  for (let index = 0; index < questionCount; index += 1) correct[`q_${index}`] = index === 0 ? 0 : 1
  return { ownerId: 'teacher-one', correct }
}

function fixture(questionCount = 2, integrity?: unknown): { quiz: ParsedQuizRecord; key: ParsedQuizAnswerKey } {
  const quiz = parseQuizRecord(rawQuiz(questionCount, integrity), 'quiz-one')
  assert.ok(quiz)
  const key = parseQuizAnswerKey(rawAnswerKey(questionCount), quiz)
  assert.ok(key)
  return { quiz, key }
}

function newAttempt(quiz: ParsedQuizRecord, overrides: Partial<NewQuizAttemptInput> = {}): ActiveQuizAttemptV2 {
  return createQuizAttempt(quiz, {
    attemptId: 'attempt-one',
    sessionId: 'session-one',
    uid: 'student-one',
    nickname: 'Student_One',
    startedAt: 0,
    ...overrides,
  })
}

function answerInput(overrides: Partial<ApplyAnswerOperationInput> = {}): ApplyAnswerOperationInput {
  return {
    attemptId: 'attempt-one',
    sessionId: 'session-one',
    operationId: 'operation-one',
    questionId: 'q_0',
    chosenIndex: 0,
    receivedAt: 1,
    ...overrides,
  }
}

function requireTransitionAttempt(result: ReturnType<typeof applyAnswerOperation>): QuizAttemptV2 {
  assert.notEqual(result.kind, 'rejected')
  return result.attempt
}

function cloneRecord<T>(value: T): T {
  return structuredClone(value)
}

test('exports fixed quiz timing, pass, notice, and retention contracts', () => {
  assert.equal(QUIZ_TIME_LIMIT_MS, 30_000)
  assert.equal(QUIZ_PASS_PERCENT, 70)
  assert.equal(QUIZ_INTEGRITY_NOTICE_VERSION, 'quiz-integrity-v1')
  assert.equal(QUIZ_INTEGRITY_RETENTION_MS, 30 * 24 * 60 * 60 * 1_000)
})

test('strict quiz/key parsers accept legacy-disabled and acknowledged integrity records', () => {
  const legacy = parseQuizRecord(rawQuiz(), 'quiz-one')
  assert.ok(legacy)
  assert.deepEqual(legacy.integrity, {
    enabled: false,
    noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
  })
  assert.deepEqual(legacy.questions.map((question) => question.id), ['q_0', 'q_1'])
  assert.deepEqual(legacy.questions[1]?.choices, ['A', 'B', 'C'])
  assert.ok(parseQuizAnswerKey(rawAnswerKey(), legacy))

  const enabled = parseQuizRecord(rawQuiz(2, {
    enabled: true,
    noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
    authorityAcknowledgedAt: 12_345,
  }))
  assert.deepEqual(enabled?.integrity, {
    enabled: true,
    noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
    authorityAcknowledgedAt: 12_345,
  })

  const disabled = parseQuizRecord(rawQuiz(2, {
    enabled: false,
    noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
  }))
  assert.deepEqual(disabled?.integrity, {
    enabled: false,
    noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
  })
})

test('strict quiz/key parsers reject malformed counts, gaps, choices, integrity, and keys', () => {
  const countMismatch = rawQuiz()
  countMismatch.questionCount = 1
  assert.equal(parseQuizRecord(countMismatch), null)

  const gapped = rawQuiz()
  const gappedQuestions = gapped.questions as Record<string, unknown>
  gappedQuestions.q_2 = gappedQuestions.q_1
  delete gappedQuestions.q_1
  assert.equal(parseQuizRecord(gapped), null)

  const sparseChoices = rawQuiz()
  ;((sparseChoices.questions as Record<string, unknown>).q_0 as Record<string, unknown>).choices = { 0: 'A', 2: 'C' }
  assert.equal(parseQuizRecord(sparseChoices), null)

  assert.equal(parseQuizRecord(rawQuiz(2, {
    enabled: true,
    noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
  })), null)
  assert.equal(parseQuizRecord(rawQuiz(2, {
    enabled: false,
    noticeVersion: 'other-version',
  })), null)

  const { quiz } = fixture()
  const missing = rawAnswerKey()
  delete (missing.correct as Record<string, unknown>).q_1
  assert.equal(parseQuizAnswerKey(missing, quiz), null)
  const extra = rawAnswerKey()
  ;(extra.correct as Record<string, unknown>).q_2 = 0
  assert.equal(parseQuizAnswerKey(extra, quiz), null)
  const outOfRange = rawAnswerKey()
  ;(outOfRange.correct as Record<string, unknown>).q_0 = 2
  assert.equal(parseQuizAnswerKey(outOfRange, quiz), null)
  assert.equal(parseQuizAnswerKey({ ...rawAnswerKey(), ownerId: 'other-teacher' }, quiz), null)
})

test('new attempt is canonical, parseable with absent empty RTDB maps, and response-safe', () => {
  const { quiz, key } = fixture()
  const attempt = newAttempt(quiz, { questionOrder: ['q_1', 'q_0'] })
  const objectStyle = createQuizAttempt({
    quiz,
    uid: 'student-two',
    nickname: 'Student_Two',
    attemptId: 'attempt-two',
    sessionId: 'session-two',
    fullscreenStart: 'not-requested',
    now: 500,
  })
  assert.equal(objectStyle.startedAt, 500)
  assert.deepEqual(attempt, {
    schemaVersion: 2,
    status: 'active',
    attemptId: 'attempt-one',
    sessionId: 'session-one',
    uid: 'student-one',
    nickname: 'Student_One',
    quizId: 'quiz-one',
    quizTitle: 'Cell quiz',
    startedAt: 0,
    questionOrder: ['q_1', 'q_0'],
    currentIndex: 0,
    questionStartedAt: 0,
    deadlineAt: 30_000,
    answers: {},
    timings: {},
    answerOperations: {},
  })
  assert.ok(parseQuizAttemptV2(attempt, quiz, key))

  const persisted = cloneRecord(attempt) as unknown as Record<string, unknown>
  delete persisted.answers
  delete persisted.timings
  delete persisted.answerOperations
  const parsed = parseQuizAttemptV2(persisted, quiz, key)
  assert.ok(parsed)
  assert.deepEqual(parsed.answers, {})

  const response = buildCurrentQuestionResponse(attempt, quiz, 2_000)
  assert.deepEqual(response?.question, { id: 'q_1', prompt: 'Question 2', choices: ['A', 'B', 'C'] })
  assert.equal(response?.questionIndex, 0)
  assert.equal(response?.durationMs, QUIZ_TIME_LIMIT_MS)
  assert.equal(response?.deadlineAt, 30_000)
  assert.equal(JSON.stringify(response).includes('correct'), false)
  assert.equal(buildCompletedResult(attempt), null)
})

test('deadline minus one and exact deadline remain eligible, while plus one expires', () => {
  const { quiz, key } = fixture()

  for (const receivedAt of [QUIZ_TIME_LIMIT_MS - 1, QUIZ_TIME_LIMIT_MS]) {
    const result = applyAnswerOperation(newAttempt(quiz), quiz, key, answerInput({ receivedAt }))
    assert.equal(result.kind, 'accepted')
    assert.equal(result.outcome, 'accepted')
    assert.equal(result.attempt.status, 'active')
    assert.equal(result.attempt.answers.q_0, 0)
    assert.equal(result.attempt.currentIndex, 1)
    assert.equal(result.attempt.questionStartedAt, receivedAt)
    assert.equal(result.attempt.deadlineAt, receivedAt + QUIZ_TIME_LIMIT_MS)
  }

  const late = applyAnswerOperation(newAttempt(quiz), quiz, key, answerInput({ receivedAt: QUIZ_TIME_LIMIT_MS + 1 }))
  assert.equal(late.kind, 'expired')
  assert.equal(late.outcome, 'expired')
  assert.equal(late.attempt.status, 'active')
  assert.equal(late.attempt.answers.q_0, -1)
  assert.equal(late.attempt.answers.q_1, undefined)
  assert.equal(late.attempt.currentIndex, 1)
  assert.equal(late.attempt.questionStartedAt, QUIZ_TIME_LIMIT_MS)
  assert.equal(late.attempt.deadlineAt, QUIZ_TIME_LIMIT_MS * 2)
  assert.equal(late.operation.outcome, 'expired')
})

test('chosen -1 is a valid timely answer and starts the next slot at receipt time', () => {
  const { quiz, key } = fixture()
  const result = applyAnswerOperation(newAttempt(quiz), quiz, key, answerInput({ chosenIndex: -1, receivedAt: 20_000 }))
  assert.equal(result.kind, 'accepted')
  assert.equal(result.attempt.answers.q_0, -1)
  assert.deepEqual(result.attempt.timings.q_0, {
    questionId: 'q_0',
    startedAt: 0,
    deadlineAt: 30_000,
    outcome: 'answered',
    answeredAt: 20_000,
  })
  assert.equal(result.attempt.questionStartedAt, 20_000)
  assert.equal(result.attempt.deadlineAt, 50_000)
})

test('suspended/offline catch-up times out consecutive slots without pausing', () => {
  const { quiz, key } = fixture(3)
  const atSecondDeadline = advanceExpiredAttempt(newAttempt(quiz), quiz, key, 60_000)
  assert.equal(atSecondDeadline.status, 'active')
  assert.equal(atSecondDeadline.currentIndex, 1)
  assert.deepEqual(atSecondDeadline.answers, { q_0: -1 })

  const caughtUp = advanceExpiredAttempt(newAttempt(quiz), quiz, key, 60_001)
  assert.equal(caughtUp.status, 'active')
  assert.equal(caughtUp.currentIndex, 2)
  assert.deepEqual(caughtUp.answers, { q_0: -1, q_1: -1 })
  assert.deepEqual(caughtUp.timings.q_1, {
    questionId: 'q_1',
    startedAt: 30_000,
    deadlineAt: 60_000,
    outcome: 'timeout',
  })
  assert.equal(caughtUp.questionStartedAt, 60_000)
  assert.equal(caughtUp.deadlineAt, 90_000)
})

test('all expired questions complete and grade atomically', () => {
  const { quiz, key } = fixture(2)
  const completed = advanceExpiredAttempt(newAttempt(quiz), quiz, key, 60_001)
  assert.equal(completed.status, 'completed')
  if (completed.status !== 'completed') return
  assert.equal(completed.currentIndex, 2)
  assert.deepEqual(completed.answers, { q_0: -1, q_1: -1 })
  assert.deepEqual({
    correctCount: completed.correctCount,
    questionCount: completed.questionCount,
    score: completed.score,
    passed: completed.passed,
    gradedAt: completed.gradedAt,
  }, { correctCount: 0, questionCount: 2, score: 0, passed: false, gradedAt: 60_000 })
  assert.ok(parseQuizAttemptV2(completed, quiz, key))
})

test('final accepted answer completes with backward-compatible grading fields', () => {
  const { quiz, key } = fixture()
  const first = applyAnswerOperation(newAttempt(quiz), quiz, key, answerInput({ receivedAt: 10_000 }))
  const second = applyAnswerOperation(requireTransitionAttempt(first), quiz, key, answerInput({
    operationId: 'operation-two',
    questionId: 'q_1',
    chosenIndex: 2,
    receivedAt: 20_000,
  }))
  assert.equal(second.kind, 'accepted')
  assert.equal(second.attempt.status, 'completed')
  if (second.attempt.status !== 'completed') return
  assert.deepEqual({
    correctCount: second.attempt.correctCount,
    questionCount: second.attempt.questionCount,
    score: second.attempt.score,
    passed: second.attempt.passed,
    gradedAt: second.attempt.gradedAt,
  }, { correctCount: 1, questionCount: 2, score: 50, passed: false, gradedAt: 20_000 })
  assert.deepEqual(second.attempt.breakdown.map((item) => ({ id: item.id, chosen: item.chosenIndex, correct: item.correct })), [
    { id: 'q_0', chosen: 0, correct: true },
    { id: 'q_1', chosen: 2, correct: false },
  ])
  assert.ok(parseQuizAttemptV2(second.attempt, quiz, key))
  assert.ok(parseCompletedQuizAttempt(second.attempt, quiz, key))

  const dto = buildCompletedResult(second.attempt)
  assert.ok(dto)
  assert.deepEqual(Object.keys(dto).sort(), [
    'breakdown', 'correctCount', 'gradedAt', 'nickname', 'passed',
    'questionCount', 'quizId', 'quizTitle', 'score', 'uid',
  ])
  assert.equal(JSON.stringify(dto).includes('session-one'), false)
  assert.equal(JSON.stringify(dto).includes('operation-one'), false)
})

test('same operation payload replays idempotently and conflicting reuse is rejected', () => {
  const { quiz, key } = fixture()
  const initialInput = answerInput({ receivedAt: 10_000 })
  const first = applyAnswerOperation(newAttempt(quiz), quiz, key, initialInput)
  assert.equal(first.kind, 'accepted')
  const acceptedState = requireTransitionAttempt(first)

  const replay = applyAnswerOperation(acceptedState, quiz, key, { ...initialInput, receivedAt: 20_000 })
  assert.equal(replay.kind, 'replayed')
  assert.equal(replay.outcome, 'accepted')
  assert.equal(replay.persist, false)
  assert.equal(replay.operation.receivedAt, 10_000)
  assert.deepEqual(replay.attempt, acceptedState)

  const conflict = applyAnswerOperation(acceptedState, quiz, key, { ...initialInput, chosenIndex: 1, receivedAt: 20_000 })
  assert.deepEqual({ kind: conflict.kind, reason: conflict.kind === 'rejected' ? conflict.reason : null, persist: conflict.persist }, {
    kind: 'rejected', reason: 'operation-conflict', persist: false,
  })
  assert.deepEqual(conflict.attempt, acceptedState)
})

test('session and attempt mismatches return typed rejections without answering', () => {
  const { quiz, key } = fixture()
  const attempt = newAttempt(quiz)
  const wrongSession = applyAnswerOperation(attempt, quiz, key, answerInput({ sessionId: 'other-session' }))
  assert.equal(wrongSession.kind, 'rejected')
  assert.equal(wrongSession.kind === 'rejected' ? wrongSession.reason : null, 'session-mismatch')
  assert.deepEqual(wrongSession.attempt.answers, {})

  const wrongAttempt = applyAnswerOperation(attempt, quiz, key, answerInput({ attemptId: 'other-attempt' }))
  assert.equal(wrongAttempt.kind, 'rejected')
  assert.equal(wrongAttempt.kind === 'rejected' ? wrongAttempt.reason : null, 'attempt-mismatch')
  assert.deepEqual(wrongAttempt.attempt.answers, {})
})

test('late stale answer records an expired operation but does not corrupt the latest question', () => {
  const { quiz, key } = fixture()
  const late = applyAnswerOperation(newAttempt(quiz), quiz, key, answerInput({ chosenIndex: 1, receivedAt: 30_001 }))
  assert.equal(late.kind, 'expired')
  assert.equal(late.attempt.status, 'active')
  assert.equal(late.attempt.currentIndex, 1)
  assert.equal(late.attempt.answers.q_0, -1)
  assert.equal(late.attempt.answers.q_1, undefined)
  assert.equal(late.attempt.timings.q_1, undefined)
  assert.deepEqual(late.attempt.answerOperations['operation-one'], {
    operationId: 'operation-one',
    attemptId: 'attempt-one',
    sessionId: 'session-one',
    questionId: 'q_0',
    chosenIndex: 1,
    receivedAt: 30_001,
    outcome: 'expired',
  })

  const current = buildCurrentQuestionResponse(late.attempt, quiz, 30_001)
  assert.equal(current?.question.id, 'q_1')
  assert.equal(current?.questionStartedAt, 30_000)
})

test('strict v2 parser rejects malformed deadlines, partial state, bad ledgers, and forged grades', () => {
  const { quiz, key } = fixture()
  const valid = newAttempt(quiz)

  const badDeadline = cloneRecord(valid)
  badDeadline.deadlineAt += 1
  assert.equal(parseQuizAttemptV2(badDeadline, quiz, key), null)

  const prematureAnswer = cloneRecord(valid)
  prematureAnswer.answers.q_0 = 0
  assert.equal(parseQuizAttemptV2(prematureAnswer, quiz, key), null)

  const first = applyAnswerOperation(valid, quiz, key, answerInput({ receivedAt: 10_000 }))
  const accepted = requireTransitionAttempt(first)
  const badOperation = cloneRecord(accepted)
  badOperation.answerOperations['operation-one']!.attemptId = 'forged-attempt'
  assert.equal(parseQuizAttemptV2(badOperation, quiz, key), null)

  const completedResult = applyAnswerOperation(accepted, quiz, key, answerInput({
    operationId: 'operation-two', questionId: 'q_1', chosenIndex: 1, receivedAt: 20_000,
  }))
  assert.equal(completedResult.attempt.status, 'completed')
  const forged = cloneRecord(completedResult.attempt)
  if (forged.status !== 'completed') return
  forged.score = 0
  assert.equal(parseQuizAttemptV2(forged, quiz, key), null)
})

test('legacy completed-result parser accepts exact existing DTO and rejects inconsistency', () => {
  const { quiz, key } = fixture()
  const legacy = {
    uid: 'student-one',
    nickname: 'Student_One',
    quizId: 'quiz-one',
    quizTitle: 'Cell quiz',
    answers: { q_0: 0 },
    correctCount: 1,
    questionCount: 2,
    score: 50,
    passed: false,
    gradedAt: 99_000,
    breakdown: [
      { id: 'q_0', prompt: 'Question 1', choices: ['A', 'B'], chosenIndex: 0, correctIndex: 0, correct: true },
      { id: 'q_1', prompt: 'Question 2', choices: ['A', 'B', 'C'], chosenIndex: -1, correctIndex: 1, correct: false },
    ],
  }
  const parsed = parseLegacyCompletedQuizResult(legacy, quiz, key)
  assert.ok(parsed)
  assert.deepEqual(parsed.answers, { q_0: 0 })
  const expectedPublicResult = { ...legacy } as Record<string, unknown>
  delete expectedPublicResult.answers
  assert.deepEqual(buildCompletedResult(parsed), expectedPublicResult)
  assert.equal(parseCompletedQuizAttempt(legacy, quiz, key), null)

  assert.equal(parseLegacyCompletedQuizResult({ ...legacy, score: 100 }, quiz, key), null)
  assert.equal(parseLegacyCompletedQuizResult({ ...legacy, schemaVersion: 2 }, quiz, key), null)
  const forgedBreakdown = cloneRecord(legacy)
  forgedBreakdown.breakdown[0]!.correctIndex = 1
  assert.equal(parseLegacyCompletedQuizResult(forgedBreakdown, quiz, key), null)
})

test('completed-attempt stats are idempotent through their applied ledger', () => {
  const { quiz, key } = fixture(1)
  const transition = applyAnswerOperation(newAttempt(quiz), quiz, key, answerInput({ receivedAt: 10_000 }))
  assert.equal(transition.attempt.status, 'completed')
  if (transition.attempt.status !== 'completed') return
  const first = applyCompletedAttemptStats(null, transition.attempt)
  const second = applyCompletedAttemptStats(first, transition.attempt)
  assert.deepEqual(second, first)
  assert.deepEqual(first, {
    quizzesTaken: 1,
    quizzesPassed: 1,
    currentStreak: 1,
    bestStreak: 1,
    totalCorrect: 1,
    totalQuestions: 1,
    lastQuizAt: 10_000,
    appliedAttempts: { 'quiz-one': 'attempt-one' },
  })
})

test('integrity-enabled completion adds exact retention deleteAfter and safe DTO metadata', () => {
  const acknowledgedAt = 50_000
  const { quiz, key } = fixture(1, {
    enabled: true,
    noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
    authorityAcknowledgedAt: acknowledgedAt,
  })
  assert.throws(() => newAttempt(quiz), /fullscreen/i)
  const attempt = newAttempt(quiz, { fullscreenStart: 'entered' })
  assert.deepEqual(attempt.integrity, {
    enabled: true,
    noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
    fullscreenStart: 'entered',
    authorityAcknowledgedAt: acknowledgedAt,
  })

  const result = applyAnswerOperation(attempt, quiz, key, answerInput({ receivedAt: 10_000 }))
  assert.equal(result.attempt.status, 'completed')
  if (result.attempt.status !== 'completed') return
  assert.deepEqual(result.attempt.integrity, {
    enabled: true,
    noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
    fullscreenStart: 'entered',
    authorityAcknowledgedAt: acknowledgedAt,
    deleteAfter: 10_000 + QUIZ_INTEGRITY_RETENTION_MS,
  })
  assert.ok(parseQuizAttemptV2(result.attempt, quiz, key))
  assert.equal(Object.hasOwn(buildCompletedResult(result.attempt) ?? {}, 'integrity'), false)
  const completedResponse = buildCompletedResult(result.attempt)
  assert.deepEqual(completedResponse?.integritySummary, {
    eventCount: 0,
    monitoringLimited: false,
    deleteAfter: 10_000 + QUIZ_INTEGRITY_RETENTION_MS,
  })

  const forgedRetention = cloneRecord(result.attempt)
  assert.ok(forgedRetention.integrity)
  forgedRetention.integrity.deleteAfter! += 1
  assert.equal(parseQuizAttemptV2(forgedRetention, quiz, key), null)
})
