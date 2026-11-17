import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoreDatabase, CoreReference } from '../../../functions/src/database-core'
import { QUIZ_INTEGRITY_RETENTION_MS, QUIZ_TIME_LIMIT_MS } from '../../../functions/src/quiz-core'
import {
  isAnswerQuizQuestionResponse,
  isQuizIntegrityEventsResult,
  isStartQuizAttemptResponse,
} from '../../../src/lib/quizzes'
import {
  MAX_INTEGRITY_EVENTS_PER_ATTEMPT,
  QuizServiceError,
  answerQuizQuestionService,
  getIntegrityReviewService,
  reconcileCompletedAttempt,
  recordIntegrityEventsService,
  resolveQuizCodeService,
  startQuizAttemptService,
  writeIntegrityEvents,
} from '../_lib/quiz-service'
import {
  ATTEMPT_ID,
  NOW,
  OPERATION_ID,
  OTHER_ATTEMPT_ID,
  OTHER_OPERATION_ID,
  OTHER_SESSION_ID,
  OUTSIDER_UID,
  OWNER_UID,
  QUIZ_ID,
  SESSION_ID,
  STUDENT_UID,
  completedAttempt,
  integrityEvent,
  legacyCompletedResult,
  parsedQuizFixture,
  quizMemory,
} from './test-helpers'

type Memory = ReturnType<typeof quizMemory>

function startInput(overrides: Partial<Parameters<typeof startQuizAttemptService>[2]> = {}) {
  return {
    quizId: QUIZ_ID,
    sessionId: SESSION_ID,
    attemptId: ATTEMPT_ID,
    fullscreenStart: 'not-requested' as const,
    now: NOW,
    ...overrides,
  }
}

function answerInput(overrides: Partial<Parameters<typeof answerQuizQuestionService>[2]> = {}) {
  return {
    quizId: QUIZ_ID,
    attemptId: ATTEMPT_ID,
    sessionId: SESSION_ID,
    questionId: 'q_0',
    operationId: OPERATION_ID,
    chosenIndex: 0,
    now: NOW + 1_000,
    ...overrides,
  }
}

function eventsInput(overrides: Partial<Parameters<typeof recordIntegrityEventsService>[2]> = {}) {
  return {
    quizId: QUIZ_ID,
    attemptId: ATTEMPT_ID,
    sessionId: SESSION_ID,
    events: [integrityEvent()],
    now: NOW + 500,
    ...overrides,
  }
}

function operationPaths(memory: Memory): string[] {
  return memory.reads.map(({ path }) => path)
}

function expectServiceError(code: QuizServiceError['code']) {
  return expect.objectContaining({ name: 'QuizServiceError', code })
}

let memory: Memory

beforeEach(() => {
  vi.stubGlobal('process', { ...process, env: {} })
  memory = quizMemory()
})

describe('resolveQuizCodeService', () => {
  beforeEach(() => {
    memory.write('quizCodes/ABCD-EFGH', { quizId: QUIZ_ID, ownerId: OWNER_UID, createdAt: NOW })
  })

  it('returns metadata only and does not read the answer key before an attempt exists', async () => {
    const result = await resolveQuizCodeService(memory.database, STUDENT_UID, 'ABCD-EFGH')
    expect(result).toEqual({
      status: 'available',
      code: 'ABCD-EFGH',
      quiz: {
        quizId: QUIZ_ID,
        title: 'Authoritative quiz',
        description: 'Server-owned timing and grading',
        questionCount: 2,
        integrity: { enabled: false, noticeVersion: 'quiz-integrity-v1' },
      },
    })
    expect(operationPaths(memory)).not.toContain(`quizAnswers/${QUIZ_ID}`)
    expect(JSON.stringify(result)).not.toContain('Current question')
    expect(JSON.stringify(result)).not.toContain('correct')
  })

  it('reports active without reading the answer key and returns completed results safely', async () => {
    await startQuizAttemptService(memory.database, STUDENT_UID, startInput())
    memory.reads.length = 0
    await expect(resolveQuizCodeService(memory.database, STUDENT_UID, 'ABCD-EFGH')).resolves.toMatchObject({ status: 'active' })
    expect(operationPaths(memory)).not.toContain(`quizAnswers/${QUIZ_ID}`)

    memory.write(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}`, legacyCompletedResult())
    const completed = await resolveQuizCodeService(memory.database, STUDENT_UID, 'ABCD-EFGH')
    expect(completed).toMatchObject({ status: 'completed', result: { score: 100 } })
    expect(JSON.stringify(completed)).not.toContain('answers')
  })
})

describe('startQuizAttemptService', () => {
  it('requires a ready account with the current privacy acknowledgement before reading quiz data', async () => {
    for (const mutation of [
      () => memory.write(`accounts/${STUDENT_UID}/status`, 'pending'),
      () => memory.write(`accounts/${STUDENT_UID}/privacy/currentVersion`, 'stale-version'),
      () => memory.write(`accounts/${STUDENT_UID}/privacy/acknowledgements`, {}),
    ]) {
      memory = quizMemory()
      mutation()
      await expect(startQuizAttemptService(memory.database, STUDENT_UID, startInput())).rejects.toEqual(expectServiceError('failed-precondition'))
      expect(operationPaths(memory)).toEqual([`accounts/${STUDENT_UID}`])
      expect(memory.read(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}`)).toBeNull()
    }
  })

  it('rejects the quiz owner without creating an attempt', async () => {
    await expect(startQuizAttemptService(memory.database, OWNER_UID, startInput())).rejects.toEqual(expectServiceError('permission-denied'))
    expect(memory.read(`quizAttempts/${QUIZ_ID}/${OWNER_UID}`)).toBeNull()
  })

  it('creates one canonical attempt and returns only the current answer-free question', async () => {
    const result = await startQuizAttemptService(memory.database, STUDENT_UID, startInput())
    expect(result).toEqual({
      status: 'started',
      schemaVersion: 2,
      attemptId: ATTEMPT_ID,
      sessionId: SESSION_ID,
      serverNow: NOW,
      startedAt: NOW,
      questionIndex: 0,
      questionCount: 2,
      questionStartedAt: NOW,
      deadlineAt: NOW + QUIZ_TIME_LIMIT_MS,
      durationMs: QUIZ_TIME_LIMIT_MS,
      integrity: { enabled: false, noticeVersion: 'quiz-integrity-v1', fullscreenStart: 'not-requested' },
      question: { id: 'q_0', prompt: 'Current question only', choices: ['Current A', 'Current B'] },
    })
    const stored = memory.read(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}`) as Record<string, unknown>
    expect(stored).toMatchObject({
      schemaVersion: 2,
      status: 'active',
      attemptId: ATTEMPT_ID,
      sessionId: SESSION_ID,
      startedAt: NOW,
      deadlineAt: NOW + QUIZ_TIME_LIMIT_MS,
      questionOrder: ['q_0', 'q_1'],
    })
    expect(JSON.stringify(result)).not.toContain('Future question')
    expect(JSON.stringify(result)).not.toContain('correctIndex')
    expect(JSON.stringify(result)).not.toContain('answerOperations')
  })

  it('matches the strict client start-response validator', async () => {
    const result = await startQuizAttemptService(memory.database, STUDENT_UID, startInput())
    expect(isStartQuizAttemptResponse(result)).toBe(true)
  })

  it('resumes the original attempt for the same session without resetting its deadline', async () => {
    await startQuizAttemptService(memory.database, STUDENT_UID, startInput())
    const resumed = await startQuizAttemptService(memory.database, STUDENT_UID, startInput({
      attemptId: OTHER_ATTEMPT_ID,
      now: NOW + 5_000,
    }))
    expect(resumed).toMatchObject({
      status: 'resumed',
      attemptId: ATTEMPT_ID,
      sessionId: SESSION_ID,
      startedAt: NOW,
      deadlineAt: NOW + QUIZ_TIME_LIMIT_MS,
      serverNow: NOW + 5_000,
    })
    expect(memory.read(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}/attemptId`)).toBe(ATTEMPT_ID)
  })

  it('replaces a different session without resetting the deadline and logs one neutral event only when enabled', async () => {
    const disabled = quizMemory()
    await startQuizAttemptService(disabled.database, STUDENT_UID, startInput())
    const disabledReplacement = await startQuizAttemptService(disabled.database, STUDENT_UID, startInput({
      attemptId: OTHER_ATTEMPT_ID,
      sessionId: OTHER_SESSION_ID,
      now: NOW + 5_000,
    }))
    expect(disabledReplacement).toMatchObject({
      status: 'resumed', attemptId: ATTEMPT_ID, sessionId: OTHER_SESSION_ID,
      startedAt: NOW, deadlineAt: NOW + QUIZ_TIME_LIMIT_MS,
    })
    expect(disabled.read(`quizAttemptEvents/${QUIZ_ID}/${STUDENT_UID}`)).toBeNull()

    const enabled = quizMemory({ integrity: true })
    await startQuizAttemptService(enabled.database, STUDENT_UID, startInput({ fullscreenStart: 'entered' }))
    const replacement = await startQuizAttemptService(enabled.database, STUDENT_UID, startInput({
      attemptId: OTHER_ATTEMPT_ID,
      sessionId: OTHER_SESSION_ID,
      fullscreenStart: 'denied',
      now: NOW + 5_000,
    }))
    expect(replacement).toMatchObject({
      status: 'resumed', attemptId: ATTEMPT_ID, sessionId: OTHER_SESSION_ID,
      startedAt: NOW, deadlineAt: NOW + QUIZ_TIME_LIMIT_MS,
      integrity: { enabled: true, fullscreenStart: 'entered' },
    })
    const events = enabled.read(`quizAttemptEvents/${QUIZ_ID}/${STUDENT_UID}`) as Record<string, Record<string, unknown>>
    const replacementEventId = `replace_0_${OTHER_SESSION_ID}`
    expect(Object.keys(events)).toEqual([replacementEventId])
    expect(events[replacementEventId]).toEqual({
      eventId: replacementEventId,
      type: 'session-replaced',
      startedAt: NOW + 5_000,
      sequence: 0,
      sessionId: OTHER_SESSION_ID,
      attemptId: ATTEMPT_ID,
      receivedAt: NOW + 5_000,
      durationMs: 0,
    })
  })

  it('returns already for valid legacy and v2 completions without leaking stored internals', async () => {
    const records = [legacyCompletedResult(), completedAttempt()]
    for (const record of records) {
      memory = quizMemory()
      memory.write(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}`, record)
      const result = await startQuizAttemptService(memory.database, STUDENT_UID, startInput({ now: NOW + 10_000 }))
      expect(result.status).toBe('already')
      expect(result).toHaveProperty('result')
      if (!('result' in result)) throw new Error('Expected a completed result')
      expect(result.result).toMatchObject({ uid: STUDENT_UID, quizId: QUIZ_ID, score: 100, passed: true })
      expect(JSON.stringify(result)).not.toContain('session-one')
      expect(JSON.stringify(result)).not.toContain('operation-0000')
      expect(JSON.stringify(result)).not.toContain('answerOperations')
      expect(JSON.stringify(result)).not.toContain('appliedAttempts')
    }
  })

  it('fails closed on a malformed stored attempt instead of replacing it', async () => {
    const malformed = { ...completedAttempt(), deadlineAt: NOW + 123 }
    memory.write(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}`, malformed)
    await expect(startQuizAttemptService(memory.database, STUDENT_UID, startInput())).rejects.toEqual(expectServiceError('failed-precondition'))
    expect(memory.read(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}`)).toEqual(malformed)
  })
})

describe('answerQuizQuestionService', () => {
  beforeEach(async () => {
    await startQuizAttemptService(memory.database, STUDENT_UID, startInput())
  })

  it('accepts an answer received exactly at the deadline', async () => {
    const result = await answerQuizQuestionService(memory.database, STUDENT_UID, answerInput({ now: NOW + QUIZ_TIME_LIMIT_MS }))
    expect(result).toMatchObject({
      status: 'active',
      questionIndex: 1,
      question: { id: 'q_1', prompt: 'Future question 1 must stay private' },
      questionStartedAt: NOW + QUIZ_TIME_LIMIT_MS,
      deadlineAt: NOW + (2 * QUIZ_TIME_LIMIT_MS),
    })
    expect(memory.read(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}/answers/q_0`)).toBe(0)
  })

  it('matches the strict client active-answer validator', async () => {
    const result = await answerQuizQuestionService(memory.database, STUDENT_UID, answerInput({ now: NOW + QUIZ_TIME_LIMIT_MS }))
    expect(isAnswerQuizQuestionResponse(result)).toBe(true)
  })

  it('rejects an answer index outside the current question choices', async () => {
    await expect(answerQuizQuestionService(memory.database, STUDENT_UID, answerInput({ chosenIndex: 2 })))
      .rejects.toEqual(expectServiceError('invalid-argument'))
  })

  it('times out and advances after the deadline without accepting the stale answer', async () => {
    const lateAt = NOW + QUIZ_TIME_LIMIT_MS + 1
    const result = await answerQuizQuestionService(memory.database, STUDENT_UID, answerInput({ now: lateAt }))
    expect(result).toMatchObject({
      status: 'active',
      questionIndex: 1,
      question: { id: 'q_1' },
      questionStartedAt: NOW + QUIZ_TIME_LIMIT_MS,
      deadlineAt: NOW + (2 * QUIZ_TIME_LIMIT_MS),
    })
    expect(memory.read(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}/answers`)).toEqual({ q_0: -1 })
    expect(memory.read(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}/answerOperations/${OPERATION_ID}/outcome`)).toBe('expired')
  })

  it('replays an identical operation idempotently and rejects changed payload or session reuse', async () => {
    const first = await answerQuizQuestionService(memory.database, STUDENT_UID, answerInput())
    const snapshot = structuredClone(memory.read(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}`))
    const replay = await answerQuizQuestionService(memory.database, STUDENT_UID, answerInput({ now: NOW + 2_000 }))
    expect(replay).toEqual({ ...first, serverNow: NOW + 2_000 })
    expect(memory.read(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}`)).toEqual(snapshot)

    await expect(answerQuizQuestionService(memory.database, STUDENT_UID, answerInput({
      chosenIndex: 1,
      now: NOW + 2_000,
    }))).resolves.toEqual({ status: 'conflict', reason: 'operation-reused' })
    await expect(answerQuizQuestionService(memory.database, STUDENT_UID, answerInput({
      operationId: OTHER_OPERATION_ID,
      sessionId: OTHER_SESSION_ID,
      questionId: 'q_1',
      now: NOW + 2_000,
    }))).resolves.toEqual({ status: 'conflict', reason: 'session-replaced' })
    expect(memory.read(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}`)).toEqual(snapshot)
  })

  it('maps a wrong attempt id to a conflict without changing the canonical state', async () => {
    const snapshot = structuredClone(memory.read(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}`))
    await expect(answerQuizQuestionService(memory.database, STUDENT_UID, answerInput({
      attemptId: OTHER_ATTEMPT_ID,
    }))).rejects.toEqual(expectServiceError('conflict'))
    expect(memory.read(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}`)).toEqual(snapshot)
  })

  it('completes publicly, applies stats once, awards a perfect badge idempotently, and avoids XP/schedule/leaderboard paths', async () => {
    await answerQuizQuestionService(memory.database, STUDENT_UID, answerInput())
    memory.reads.length = 0
    const completed = await answerQuizQuestionService(memory.database, STUDENT_UID, answerInput({
      questionId: 'q_1',
      operationId: OTHER_OPERATION_ID,
      chosenIndex: 1,
      now: NOW + 2_000,
    }))
    expect(completed).toMatchObject({
      status: 'completed',
      result: { uid: STUDENT_UID, quizId: QUIZ_ID, correctCount: 2, questionCount: 2, score: 100, passed: true },
      stats: {
        quizzesTaken: 1,
        quizzesPassed: 1,
        currentStreak: 1,
        bestStreak: 1,
        totalCorrect: 2,
        totalQuestions: 2,
        lifetimeAccuracy: 100,
      },
    })
    expect(completed).toHaveProperty('stats')
    if (!('stats' in completed)) throw new Error('Expected completed stats')
    expect(Object.keys(completed.stats ?? {}).sort()).toEqual([
      'bestStreak', 'currentStreak', 'lifetimeAccuracy', 'quizzesPassed',
      'quizzesTaken', 'totalCorrect', 'totalQuestions',
    ])
    expect(JSON.stringify(completed)).not.toContain('appliedAttempts')
    expect(JSON.stringify(completed)).not.toContain('answerOperations')
    expect(memory.read(`badges/${STUDENT_UID}/perfect-round`)).toEqual({ awardedAt: NOW + 2_000, type: 'auto' })

    const replay = await answerQuizQuestionService(memory.database, STUDENT_UID, answerInput({
      questionId: 'q_1',
      operationId: OTHER_OPERATION_ID,
      chosenIndex: 1,
      now: NOW + 3_000,
    }))
    expect(replay.status).toBe('completed')
    expect(memory.read(`roleStats/${STUDENT_UID}`)).toMatchObject({
      quizzesTaken: 1, quizzesPassed: 1, totalCorrect: 2, totalQuestions: 2,
      appliedAttempts: { [QUIZ_ID]: ATTEMPT_ID },
    })
    expect(memory.read(`badges/${STUDENT_UID}/perfect-round`)).toEqual({ awardedAt: NOW + 2_000, type: 'auto' })

    const forbiddenPath = /(^|\/)(leaderboard|schedule|schedules|xp|userProgress|reviewSchedule)(\/|$)/i
    expect(operationPaths(memory).filter((path) => forbiddenPath.test(path))).toEqual([])
  })
})

describe('completion stats ledger', () => {
  it('uses appliedAttempts to increment counters once across repeated reconciliation and omits it publicly', async () => {
    const attempt = completedAttempt()
    const first = await reconcileCompletedAttempt(memory.database, attempt, OWNER_UID)
    const second = await reconcileCompletedAttempt(memory.database, attempt, OWNER_UID)
    expect(first).toEqual(second)
    expect(second).toEqual({
      quizzesTaken: 1,
      quizzesPassed: 1,
      currentStreak: 1,
      bestStreak: 1,
      totalCorrect: 2,
      totalQuestions: 2,
      lifetimeAccuracy: 100,
    })
    expect(memory.read(`roleStats/${STUDENT_UID}`)).toMatchObject({
      quizzesTaken: 1,
      quizzesPassed: 1,
      currentStreak: 1,
      bestStreak: 1,
      totalCorrect: 2,
      totalQuestions: 2,
      appliedAttempts: { [QUIZ_ID]: ATTEMPT_ID },
    })
    expect(second).not.toHaveProperty('appliedAttempts')
    expect(memory.read(`badges/${STUDENT_UID}/perfect-round`)).toEqual({ awardedAt: attempt.gradedAt, type: 'auto' })
  })

  it('recovers after interruption between the stats transaction and badge write without double-counting', async () => {
    const attempt = completedAttempt()
    const base = memory.database
    let failRootUpdate = true
    const interrupted: CoreDatabase = {
      ref(path?: string): CoreReference {
        const reference = base.ref(path)
        if ((path ?? '') !== '') return reference
        return {
          ...reference,
          async update(values) {
            if (failRootUpdate) {
              failRootUpdate = false
              throw new Error('synthetic interruption after stats transaction')
            }
            return reference.update(values)
          },
        }
      },
    }

    await expect(reconcileCompletedAttempt(interrupted, attempt, OWNER_UID)).rejects.toThrow('synthetic interruption')
    expect(memory.read(`roleStats/${STUDENT_UID}`)).toMatchObject({
      quizzesTaken: 1,
      appliedAttempts: { [QUIZ_ID]: ATTEMPT_ID },
    })
    expect(memory.read(`badges/${STUDENT_UID}/perfect-round`)).toBeNull()

    await expect(reconcileCompletedAttempt(interrupted, attempt, OWNER_UID)).resolves.toMatchObject({ quizzesTaken: 1 })
    expect(memory.read(`roleStats/${STUDENT_UID}/quizzesTaken`)).toBe(1)
    expect(memory.read(`badges/${STUDENT_UID}/perfect-round`)).toEqual({ awardedAt: attempt.gradedAt, type: 'auto' })
  })
})

describe('integrity event services and reviews', () => {
  it('rejects event recording when Integrity Mode is disabled', async () => {
    await startQuizAttemptService(memory.database, STUDENT_UID, startInput())
    await expect(recordIntegrityEventsService(memory.database, STUDENT_UID, eventsInput())).rejects.toEqual(expectServiceError('failed-precondition'))
    expect(memory.read(`quizAttemptEvents/${QUIZ_ID}/${STUDENT_UID}`)).toBeNull()
  })

  it('records exact bounded events, enforces the enum, and caps batches at 20', async () => {
    memory = quizMemory({ integrity: true })
    await startQuizAttemptService(memory.database, STUDENT_UID, startInput({ fullscreenStart: 'entered' }))
    await expect(recordIntegrityEventsService(memory.database, STUDENT_UID, eventsInput()))
      .resolves.toMatchObject({ acceptedEventIds: ['event-0001'] })
    const stored = memory.read(`quizAttemptEvents/${QUIZ_ID}/${STUDENT_UID}/event-0001`) as Record<string, unknown>
    expect(stored).not.toHaveProperty('device')
    expect(stored).not.toHaveProperty('ip')
    expect(stored).not.toHaveProperty('userAgent')

    const invalidEvents: unknown[] = [
      [{ ...integrityEvent({ eventId: 'event-bad1' }), type: 'window-blur' }],
      [{ ...integrityEvent({ eventId: 'event-bad2' }), endedAt: NOW }],
      [{ ...integrityEvent({ eventId: 'event-bad3' }), questionId: 'q_100' }],
      [],
      Array.from({ length: 21 }, (_, index) => integrityEvent({ eventId: `event-${String(index).padStart(4, '0')}`, sequence: index })),
    ]
    for (const [index, events] of invalidEvents.entries()) {
      await expect(recordIntegrityEventsService(memory.database, STUDENT_UID, eventsInput({
        events,
        now: NOW + 600 + index,
      }))).rejects.toEqual(expectServiceError('invalid-argument'))
    }
    expect(Object.keys(memory.read(`quizAttemptEvents/${QUIZ_ID}/${STUDENT_UID}`) as object)).toEqual(['event-0001'])
  })

  it('rejects device, IP, and other extra integrity event fields', async () => {
    memory = quizMemory({ integrity: true })
    await startQuizAttemptService(memory.database, STUDENT_UID, startInput({ fullscreenStart: 'entered' }))
    await expect(recordIntegrityEventsService(memory.database, STUDENT_UID, eventsInput({
      events: [{ ...integrityEvent(), device: 'fingerprint', ip: '127.0.0.1' }],
    }))).rejects.toEqual(expectServiceError('invalid-argument'))
  })

  it('accepts an identical duplicate once, rejects conflicting reuse, and makes receivedAt authoritative', async () => {
    memory = quizMemory({ integrity: true })
    await startQuizAttemptService(memory.database, STUDENT_UID, startInput({ fullscreenStart: 'entered' }))
    const first = await recordIntegrityEventsService(memory.database, STUDENT_UID, eventsInput())
    expect(first).toEqual({ acceptedEventIds: ['event-0001'], serverNow: NOW + 500 })
    const duplicate = await recordIntegrityEventsService(memory.database, STUDENT_UID, eventsInput({ now: NOW + 900 }))
    expect(duplicate).toEqual({ acceptedEventIds: ['event-0001'], serverNow: NOW + 900 })
    expect(Object.keys(memory.read(`quizAttemptEvents/${QUIZ_ID}/${STUDENT_UID}`) as object)).toHaveLength(1)
    expect(memory.read(`quizAttemptEvents/${QUIZ_ID}/${STUDENT_UID}/event-0001`)).toEqual({
      ...integrityEvent(),
      attemptId: ATTEMPT_ID,
      sessionId: SESSION_ID,
      receivedAt: NOW + 500,
      durationMs: 100,
    })
    await expect(recordIntegrityEventsService(memory.database, STUDENT_UID, eventsInput({
      events: [integrityEvent({ type: 'fullscreen-ended' })],
      now: NOW + 1_000,
    }))).rejects.toEqual(expectServiceError('conflict'))
  })

  it('enforces the 200-total-event cap and maps a full ledger to too-many-events', async () => {
    memory = quizMemory({ integrity: true })
    await startQuizAttemptService(memory.database, STUDENT_UID, startInput({ fullscreenStart: 'entered' }))
    const records: Record<string, unknown> = {}
    for (let index = 0; index < MAX_INTEGRITY_EVENTS_PER_ATTEMPT; index += 1) {
      const event = integrityEvent({ eventId: `seed-event-${String(index).padStart(4, '0')}`, sequence: index })
      records[event.eventId] = { ...event, attemptId: ATTEMPT_ID, receivedAt: NOW + index, durationMs: 100 }
    }
    memory.write(`quizAttemptEvents/${QUIZ_ID}/${STUDENT_UID}`, records)
    await expect(recordIntegrityEventsService(memory.database, STUDENT_UID, eventsInput({
      events: [integrityEvent({ eventId: 'overflow-event' })],
    }))).rejects.toEqual(expectServiceError('too-many-events'))
    expect(Object.keys(memory.read(`quizAttemptEvents/${QUIZ_ID}/${STUDENT_UID}`) as object)).toHaveLength(200)
  })

  it('allows the result subject and quiz owner to review, but denies outsiders', async () => {
    memory = quizMemory({ integrity: true, questionCount: 1 })
    const attempt = completedAttempt({ integrity: true, questionCount: 1 })
    memory.write(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}`, attempt)
    memory.write(`quizAttemptEvents/${QUIZ_ID}/${STUDENT_UID}/event-0001`, {
      ...integrityEvent(), attemptId: ATTEMPT_ID, receivedAt: attempt.gradedAt - 100, durationMs: 100,
    })
    const ownerReview = await getIntegrityReviewService(memory.database, OWNER_UID, QUIZ_ID, STUDENT_UID, attempt.gradedAt + 1)
    expect(isQuizIntegrityEventsResult(ownerReview)).toBe(true)
    expect(ownerReview.events[0]).not.toHaveProperty('attemptId')
    for (const actorUid of [STUDENT_UID, OWNER_UID]) {
      await expect(getIntegrityReviewService(memory.database, actorUid, QUIZ_ID, STUDENT_UID, attempt.gradedAt + 1)).resolves.toEqual({
        summary: {
          eventCount: 1,
          monitoringLimited: false,
          deleteAfter: attempt.gradedAt + QUIZ_INTEGRITY_RETENTION_MS,
        },
        events: [{ ...integrityEvent(), sequence: 0, receivedAt: attempt.gradedAt - 100, durationMs: 100 }],
      })
    }
    await expect(getIntegrityReviewService(memory.database, OUTSIDER_UID, QUIZ_ID, STUDENT_UID, attempt.gradedAt + 1)).rejects.toEqual(expectServiceError('permission-denied'))
  })

  it('accepts a queued final browser event immediately after completion and refreshes the summary', async () => {
    memory = quizMemory({ integrity: true, questionCount: 1 })
    await startQuizAttemptService(memory.database, STUDENT_UID, startInput({ fullscreenStart: 'entered' }))
    await answerQuizQuestionService(memory.database, STUDENT_UID, answerInput())
    await expect(recordIntegrityEventsService(memory.database, STUDENT_UID, eventsInput({ now: NOW + 1_500 })))
      .resolves.toMatchObject({ acceptedEventIds: ['event-0001'] })
    expect(memory.read(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}/integritySummary/eventCount`)).toBe(1)
  })

  it('returns not found after the exact 30-day retention boundary', async () => {
    memory = quizMemory({ integrity: true, questionCount: 1 })
    const attempt = completedAttempt({ integrity: true, questionCount: 1 })
    memory.write(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}`, attempt)
    expect(attempt.integritySummary?.deleteAfter).toBe(attempt.gradedAt + QUIZ_INTEGRITY_RETENTION_MS)
    await expect(getIntegrityReviewService(
      memory.database,
      STUDENT_UID,
      QUIZ_ID,
      STUDENT_UID,
      attempt.gradedAt + QUIZ_INTEGRITY_RETENTION_MS,
    )).rejects.toEqual(expectServiceError('not-found'))
  })

  it('distinguishes a retained zero-event log from unavailable logs', async () => {
    memory = quizMemory({ integrity: true, questionCount: 1 })
    const retained = completedAttempt({ integrity: true, questionCount: 1, fullscreenStart: 'entered' })
    expect(retained.integritySummary?.monitoringLimited).toBe(false)
    memory.write(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}`, retained)
    await expect(getIntegrityReviewService(memory.database, STUDENT_UID, QUIZ_ID, STUDENT_UID, retained.gradedAt + 1)).resolves.toEqual({
      summary: {
        eventCount: 0,
        monitoringLimited: false,
        deleteAfter: retained.gradedAt + QUIZ_INTEGRITY_RETENTION_MS,
      },
      events: [],
    })

    memory.write(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}`, null)
    await expect(getIntegrityReviewService(memory.database, STUDENT_UID, QUIZ_ID, STUDENT_UID, retained.gradedAt + 1)).rejects.toEqual(expectServiceError('not-found'))
  })

  it('preserves a monitoring-limited completion summary when no event row exists', async () => {
    memory = quizMemory({ integrity: true, questionCount: 1 })
    const retained = completedAttempt({ integrity: true, questionCount: 1, fullscreenStart: 'unsupported' })
    expect(retained.integritySummary?.monitoringLimited).toBe(true)
    memory.write(`quizAttempts/${QUIZ_ID}/${STUDENT_UID}`, retained)
    const review = await getIntegrityReviewService(memory.database, STUDENT_UID, QUIZ_ID, STUDENT_UID, retained.gradedAt + 1)
    expect(review.summary.monitoringLimited).toBe(true)
  })

  it('writeIntegrityEvents rejects disabled attempts even when passed directly', async () => {
    const { quiz } = parsedQuizFixture()
    const attempt = completedAttempt()
    await expect(writeIntegrityEvents(memory.database, STUDENT_UID, quiz, attempt, [integrityEvent()], NOW)).rejects.toEqual(expectServiceError('failed-precondition'))
  })
})

// memoryDatabase executes transaction callbacks synchronously and deterministically. These
// tests prove transition/idempotency logic, not real Firebase RTDB retry or concurrency semantics.
