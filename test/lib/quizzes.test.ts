import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from 'firebase/auth'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  ref: vi.fn((_database: unknown, path?: string) => ({ path })),
  authenticatedRequest: vi.fn(),
}))

vi.mock('../../src/lib/firebase', () => ({ database: {} }))
vi.mock('firebase/database', () => ({ get: mocks.get, ref: mocks.ref, update: mocks.update }))
vi.mock('../../src/lib/vercel-api', () => ({ authenticatedRequest: mocks.authenticatedRequest }))

import {
  QUIZ_INTEGRITY_EVENT_BATCH_LIMIT,
  QUIZ_INTEGRITY_NOTICE_VERSION,
  answerQuizQuestion,
  createQuiz,
  formatQuizCodeInput,
  getQuizIntegrityEvents,
  isAnswerQuizQuestionResponse,
  isQuizIntegrityEventInput,
  isQuizIntegrityEventsResult,
  isQuizAttemptResult,
  isRecordQuizIntegrityEventsResponse,
  isStartQuizAttemptResponse,
  listOwnedQuizzes,
  normalizeQuizCode,
  recordQuizIntegrityEvents,
  startQuizAttempt,
  validateQuizDraft,
} from '../../src/lib/quizzes'
import type {
  QuizAttemptResult,
  QuizIntegrityEventInput,
  QuizIntegrityPolicy,
  QuizRankStats,
} from '../../src/lib/quizzes'

const teacher = { uid: 'teacher-1' } as User
const enabledIntegrity: QuizIntegrityPolicy = {
  enabled: true,
  noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
  authorityAcknowledgedAt: 1_700_000_000_000,
}

function draftQuestions() {
  return [
    { prompt: 'What is ATP?', choices: ['Energy currency', 'A protein'], correctIndex: 0 },
    { prompt: 'Pick B', choices: ['A', 'B', 'C'], correctIndex: 1 },
  ]
}

function question() {
  return { id: 'q_0', prompt: 'What is ATP?', choices: ['Energy currency', 'A protein'] }
}

function attempt(overrides: Partial<QuizAttemptResult> = {}): QuizAttemptResult {
  return {
    uid: 'student-1',
    nickname: 'Student1',
    quizId: 'quiz-one',
    quizTitle: 'Cell quiz',
    correctCount: 1,
    questionCount: 1,
    score: 100,
    passed: true,
    gradedAt: 1_700_000_010_000,
    breakdown: [{
      id: 'q_0',
      prompt: 'What is ATP?',
      choices: ['Energy currency', 'A protein'],
      chosenIndex: 0,
      correctIndex: 0,
      correct: true,
    }],
    ...overrides,
  }
}

const stats: QuizRankStats = {
  quizzesTaken: 1,
  quizzesPassed: 1,
  currentStreak: 1,
  bestStreak: 1,
  totalCorrect: 1,
  totalQuestions: 1,
  lifetimeAccuracy: 100,
}

function activeState() {
  return {
    schemaVersion: 2 as const,
    attemptId: 'attempt_1',
    sessionId: 'session_1',
    serverNow: 1_700_000_000_000,
    startedAt: 1_700_000_000_000,
    questionIndex: 0,
    questionCount: 2,
    questionStartedAt: 1_700_000_000_000,
    question: question(),
    deadlineAt: 1_700_000_030_000,
    durationMs: 30_000,
    integrity: {
      enabled: true,
      noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
      fullscreenStart: 'entered' as const,
      deleteAfter: 1_800_000_000_000,
    },
  }
}

function integrityEvent(overrides: Partial<QuizIntegrityEventInput> = {}): QuizIntegrityEventInput {
  return {
    eventId: 'event_0001',
    type: 'page-hidden',
    startedAt: 1_700_000_001_000,
    endedAt: 1_700_000_002_000,
    questionId: 'q_0',
    sequence: 1,
    ...overrides,
  }
}

beforeEach(() => {
  mocks.get.mockReset()
  mocks.update.mockReset()
  mocks.authenticatedRequest.mockReset()
  mocks.get.mockResolvedValue({ val: () => null })
})

describe('quiz code normalization', () => {
  it('normalizes shared URLs, lowercase, and stray separators into XXXX-XXXX', () => {
    expect(normalizeQuizCode('abcd-efgh')).toBe('ABCD-EFGH')
    expect(normalizeQuizCode(' ab cd ef gh ')).toBe('ABCD-EFGH')
    expect(normalizeQuizCode('ABCDEFGH')).toBe('ABCD-EFGH')
    expect(normalizeQuizCode('a1b2-c3d4')).toBe('A1B2-C3D4')
  })

  it('rejects anything that is not exactly 8 alphanumeric characters', () => {
    expect(normalizeQuizCode('')).toBeNull()
    expect(normalizeQuizCode('abc')).toBeNull()
    expect(normalizeQuizCode('abcdefghi')).toBeNull()
    expect(normalizeQuizCode('abcd-ef!h')).toBeNull()
    expect(normalizeQuizCode(42)).toBeNull()
    expect(normalizeQuizCode(null)).toBeNull()
  })

  it('formats typing into XXXX-XXXX progressively without blocking input', () => {
    expect(formatQuizCodeInput('a')).toBe('A')
    expect(formatQuizCodeInput('abcd')).toBe('ABCD')
    expect(formatQuizCodeInput('abcde')).toBe('ABCD-E')
    expect(formatQuizCodeInput('abcd-efgh-ijk')).toBe('ABCD-EFGH')
  })
})

describe('quiz draft validation', () => {
  it('accepts a well-formed draft', () => {
    expect(() => validateQuizDraft('Cell quiz', 'Chapter 1', draftQuestions())).not.toThrow()
  })

  it('rejects empty titles, bad question counts, unmarked answers, and duplicate choices', () => {
    expect(() => validateQuizDraft('   ', '', draftQuestions())).toThrow('title')
    expect(() => validateQuizDraft('Quiz', '', [])).toThrow('questions')
    expect(() => validateQuizDraft('Quiz', '', [{ prompt: 'Q', choices: ['A', 'B'], correctIndex: 2 }])).toThrow('correct answer')
    expect(() => validateQuizDraft('Quiz', '', [{ prompt: 'Q', choices: ['A', 'A'], correctIndex: 0 }])).toThrow('choices')
    expect(() => validateQuizDraft('Quiz', '', [{ prompt: '   ', choices: ['A', 'B'], correctIndex: 0 }])).toThrow('prompt')
  })
})

describe('createQuiz integrity policy', () => {
  it('keeps direct creation backward compatible and omits disabled integrity data', async () => {
    const created = await createQuiz(teacher, '  Cell quiz  ', ' Chapter 1 ', draftQuestions())

    expect(created).toMatchObject({ title: 'Cell quiz', integrityMode: false })
    expect(created.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    expect(created.quizId).toMatch(/^quiz_[0-9a-f-]{36}$/)
    expect(mocks.update).toHaveBeenCalledTimes(1)

    const writes = mocks.update.mock.calls[0]![1] as Record<string, unknown>
    const quizRoot = writes[`quizzes/${created.quizId}`] as Record<string, unknown>
    const answers = writes[`quizAnswers/${created.quizId}`] as Record<string, unknown>
    const code = writes[`quizCodes/${created.code}`] as Record<string, unknown>
    const byOwner = writes[`quizzesByOwner/teacher-1/${created.quizId}`] as Record<string, unknown>

    expect(quizRoot).toMatchObject({ ownerId: 'teacher-1', title: 'Cell quiz', questionCount: 2 })
    expect(Object.keys(quizRoot.questions as object)).toEqual(['q_0', 'q_1'])
    expect(quizRoot).not.toHaveProperty('integrity')
    expect(byOwner).not.toHaveProperty('integrity')
    expect(JSON.stringify(quizRoot)).not.toContain('correctIndex')
    expect(answers).toMatchObject({ ownerId: 'teacher-1', correct: { q_0: 0, q_1: 1 } })
    expect(code).toMatchObject({ quizId: created.quizId, ownerId: 'teacher-1' })
    expect(byOwner).toMatchObject({ code: created.code, title: 'Cell quiz' })
  })

  it('stores the exact enabled policy on the quiz and owner index', async () => {
    const created = await createQuiz(teacher, 'Cell quiz', '', draftQuestions(), enabledIntegrity)
    const writes = mocks.update.mock.calls[0]![1] as Record<string, unknown>

    expect(created.integrityMode).toBe(true)
    expect(writes[`quizzes/${created.quizId}`]).toMatchObject({ integrity: enabledIntegrity })
    expect(writes[`quizzesByOwner/teacher-1/${created.quizId}`]).toMatchObject({ integrity: enabledIntegrity })
  })

  it('rejects malformed or disabled pseudo-policies instead of persisting them', async () => {
    await expect(createQuiz(teacher, 'Cell quiz', '', draftQuestions(), {
      enabled: false,
      noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
      authorityAcknowledgedAt: Date.now(),
    } as unknown as QuizIntegrityPolicy)).rejects.toThrow('authority acknowledgement')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('regenerates the code after a denied collision and retries the atomic publish', async () => {
    mocks.update.mockRejectedValueOnce(Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' }))
    const created = await createQuiz(teacher, 'Cell quiz', '', draftQuestions())
    expect(created.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    expect(mocks.update).toHaveBeenCalledTimes(2)
    const firstWrites = mocks.update.mock.calls[0]![1] as Record<string, unknown>
    const secondWrites = mocks.update.mock.calls[1]![1] as Record<string, unknown>
    const firstCodePath = Object.keys(firstWrites).find((path) => path.startsWith('quizCodes/'))
    const secondCodePath = Object.keys(secondWrites).find((path) => path.startsWith('quizCodes/'))
    expect(secondCodePath).not.toBe(firstCodePath)
  })

  it('does not retry non-permission failures', async () => {
    mocks.update.mockRejectedValueOnce(new Error('network unavailable'))
    await expect(createQuiz(teacher, 'Cell quiz', '', draftQuestions())).rejects.toThrow('network unavailable')
    expect(mocks.update).toHaveBeenCalledTimes(1)
  })

  it('requires an authenticated teacher', async () => {
    await expect(createQuiz(null, 'Quiz', '', draftQuestions())).rejects.toThrow(TypeError)
  })
})

describe('owner summary integrity projections', () => {
  it('maps enabled, legacy, and malformed policies to an owner-only status flag', async () => {
    mocks.get.mockResolvedValueOnce({ val: () => ({
      legacy: { code: 'ABCD-EFGH', title: 'Legacy', createdAt: 1 },
      enabled: { code: 'JKLM-NPQR', title: 'Enabled', createdAt: 2, integrity: enabledIntegrity },
      malformed: { code: 'STUV-WXYZ', title: 'Malformed', createdAt: 3, integrity: { enabled: true } },
    }) })
    await expect(listOwnedQuizzes('teacher-1')).resolves.toEqual([
      { quizId: 'malformed', code: 'STUV-WXYZ', title: 'Malformed', createdAt: 3, integrityMode: false },
      { quizId: 'enabled', code: 'JKLM-NPQR', title: 'Enabled', createdAt: 2, integrityMode: true },
      { quizId: 'legacy', code: 'ABCD-EFGH', title: 'Legacy', createdAt: 1, integrityMode: false },
    ])
  })
})

describe('authoritative attempt response validators', () => {
  it('accepts exact started/resumed, active, completed, conflict, and already variants', () => {
    expect(isStartQuizAttemptResponse({ status: 'started', ...activeState() })).toBe(true)
    expect(isStartQuizAttemptResponse({ status: 'resumed', ...activeState() })).toBe(true)
    expect(isStartQuizAttemptResponse({ status: 'already', result: attempt(), stats })).toBe(true)
    expect(isStartQuizAttemptResponse({ status: 'already', result: attempt({ answers: { q_0: 0 } }), stats })).toBe(true)
    expect(isAnswerQuizQuestionResponse({ status: 'active', ...activeState() })).toBe(true)
    expect(isAnswerQuizQuestionResponse({ status: 'completed', result: attempt(), stats })).toBe(true)
    expect(isAnswerQuizQuestionResponse({ status: 'conflict', reason: 'session-replaced' })).toBe(true)
  })

  it('rejects answer keys, future questions, partial states, hostile extras, and inconsistent results', () => {
    expect(isStartQuizAttemptResponse({ status: 'started', ...activeState(), question: { ...question(), correctIndex: 0 } })).toBe(false)
    expect(isStartQuizAttemptResponse({ status: 'started', ...activeState(), questions: [question()] })).toBe(false)
    expect(isStartQuizAttemptResponse({ status: 'started', ...activeState(), deadlineAt: activeState().serverNow })).toBe(false)
    expect(isStartQuizAttemptResponse({ status: 'started', ...activeState(), durationMs: 31_000 })).toBe(false)
    expect(isAnswerQuizQuestionResponse({ status: 'active', ...activeState(), serverNow: undefined })).toBe(false)
    expect(isAnswerQuizQuestionResponse({ status: 'conflict', reason: 'unknown' })).toBe(false)
    expect(isQuizAttemptResult({ ...attempt(), correctCount: 0 })).toBe(false)
    expect(isQuizAttemptResult({ ...attempt(), breakdown: [{ ...attempt().breakdown[0], correctIndex: 9 }] })).toBe(false)
  })
})

describe('attempt request functions', () => {
  it('posts the exact start and answer bodies with the strict response guards', async () => {
    const started = { status: 'started', ...activeState() }
    const answered = { status: 'active', ...activeState(), questionIndex: 1, question: { id: 'q_1', prompt: 'Pick B', choices: ['A', 'B'] } }
    mocks.authenticatedRequest.mockResolvedValueOnce(started).mockResolvedValueOnce(answered)

    await expect(startQuizAttempt('quiz-one', 'session_1', 'entered')).resolves.toBe(started)
    const startCall = mocks.authenticatedRequest.mock.calls[0]!
    expect(startCall[0]).toBe('/api/quiz/start')
    expect(startCall[1]).toBe(isStartQuizAttemptResponse)
    expect(startCall[2]).toEqual({
      method: 'POST',
      body: { quizId: 'quiz-one', sessionId: 'session_1', fullscreenStart: 'entered' },
    })

    const input = {
      quizId: 'quiz-one', attemptId: 'attempt_1', sessionId: 'session_1',
      questionId: 'q_0', operationId: 'operation_1', chosenIndex: -1,
    }
    await expect(answerQuizQuestion(input)).resolves.toBe(answered)
    const answerCall = mocks.authenticatedRequest.mock.calls[1]!
    expect(answerCall[0]).toBe('/api/quiz/answer')
    expect(answerCall[1]).toBe(isAnswerQuizQuestionResponse)
    expect(answerCall[2]).toEqual({ method: 'POST', body: input })
  })

  it('rejects malformed request values before calling the API', async () => {
    await expect(startQuizAttempt('bad/quiz', 'session_1', 'entered')).rejects.toThrow('quizId')
    await expect(startQuizAttempt('quiz-one', 'session_1', 'automatic' as never)).rejects.toThrow('fullscreenStart')
    await expect(answerQuizQuestion({
      quizId: 'quiz-one', attemptId: 'attempt_1', sessionId: 'session_1',
      questionId: 'q_0', operationId: 'operation_1', chosenIndex: 4,
    })).rejects.toThrow('chosenIndex')
    await expect(answerQuizQuestion({
      quizId: 'quiz-one', attemptId: 'short', sessionId: 'session_1',
      questionId: 'q_0', operationId: 'operation_1', chosenIndex: 0,
    })).rejects.toThrow('attemptId')
    expect(mocks.authenticatedRequest).not.toHaveBeenCalled()
  })
})

describe('integrity event contracts and requests', () => {
  it('validates normalized episodes and rejects malformed timestamps, extras, and unknown types', () => {
    expect(isQuizIntegrityEventInput(integrityEvent())).toBe(true)
    expect(isQuizIntegrityEventInput(integrityEvent({ endedAt: 1_699_999_999_999 }))).toBe(false)
    expect(isQuizIntegrityEventInput({ ...integrityEvent(), type: 'window-blur' })).toBe(false)
    expect(isQuizIntegrityEventInput({ ...integrityEvent(), correctIndex: 0 })).toBe(false)
  })

  it('posts a bounded exact event batch and accepts only submitted acknowledgement IDs', async () => {
    const events = [integrityEvent(), integrityEvent({ eventId: 'event_0002', type: 'fullscreen-ended', sequence: 2 })]
    const response = { acceptedEventIds: ['event_0001', 'event_0002'], serverNow: 1_700_000_003_000 }
    mocks.authenticatedRequest.mockResolvedValue(response)

    const input = { quizId: 'quiz-one', attemptId: 'attempt_1', sessionId: 'session_1', events }
    await expect(recordQuizIntegrityEvents(input)).resolves.toBe(response)
    const call = mocks.authenticatedRequest.mock.calls[0]!
    expect(call[0]).toBe('/api/quiz/events')
    expect(call[2]).toEqual({ method: 'POST', body: input })
    expect((call[1] as (value: unknown) => boolean)(response)).toBe(true)
    expect((call[1] as (value: unknown) => boolean)({ ...response, acceptedEventIds: ['event_not_submitted_0001'] })).toBe(false)
  })

  it('rejects empty, oversized, duplicate, and out-of-order batches before the API call', async () => {
    const base = { quizId: 'quiz-one', attemptId: 'attempt_1', sessionId: 'session_1' }
    await expect(recordQuizIntegrityEvents({ ...base, events: [] })).rejects.toThrow('events')
    await expect(recordQuizIntegrityEvents({ ...base, events: [integrityEvent(), integrityEvent()] })).rejects.toThrow('events')
    await expect(recordQuizIntegrityEvents({ ...base, events: [integrityEvent({ sequence: 2 }), integrityEvent({ eventId: 'event_0002', sequence: 1 })] })).rejects.toThrow('events')
    const oversized = Array.from({ length: QUIZ_INTEGRITY_EVENT_BATCH_LIMIT + 1 }, (_, index) => integrityEvent({ eventId: `event_item_${index.toString().padStart(4, '0')}`, sequence: index }))
    await expect(recordQuizIntegrityEvents({ ...base, events: oversized })).rejects.toThrow('events')
    expect(mocks.authenticatedRequest).not.toHaveBeenCalled()
  })

  it('strictly validates acknowledgement and timeline response shapes', () => {
    expect(isRecordQuizIntegrityEventsResponse({ acceptedEventIds: ['event_0001'], serverNow: 10 })).toBe(true)
    expect(isRecordQuizIntegrityEventsResponse({ acceptedEventIds: ['event_0001', 'event_0001'], serverNow: 10 })).toBe(false)

    const timeline = {
      summary: { eventCount: 1, monitoringLimited: false, deleteAfter: 100 },
      events: [{ ...integrityEvent({ startedAt: 10, endedAt: 20 }), receivedAt: 30, durationMs: 10 }],
    }
    expect(isQuizIntegrityEventsResult(timeline)).toBe(true)
    expect(isQuizIntegrityEventsResult({ ...timeline, answerKey: { q_0: 0 } })).toBe(false)
    expect(isQuizIntegrityEventsResult({ ...timeline, summary: { ...timeline.summary, eventCount: 0 } })).toBe(false)
    expect(isQuizIntegrityEventsResult({ ...timeline, events: [{ ...timeline.events[0], durationMs: -1 }] })).toBe(false)
    expect(isQuizIntegrityEventsResult({ ...timeline, events: [{ ...timeline.events[0], durationMs: 9 }] })).toBe(false)
  })

  it('gets the encoded teacher/student signal path with the strict timeline guard', async () => {
    const response = { summary: { eventCount: 0, monitoringLimited: false, deleteAfter: 100 }, events: [] }
    mocks.authenticatedRequest.mockResolvedValue(response)
    await expect(getQuizIntegrityEvents('quiz-one', 'student:one')).resolves.toBe(response)
    expect(mocks.authenticatedRequest).toHaveBeenCalledWith(
      '/api/quiz/results/quiz-one/student%3Aone/signals',
      isQuizIntegrityEventsResult,
      undefined,
    )
  })
})
