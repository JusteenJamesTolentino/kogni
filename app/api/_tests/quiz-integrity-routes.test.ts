import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoreDatabase } from '../../../functions/src/database-core'
import { memoryDatabase } from '../../../functions/src/core-test-helpers'
import { QuizServiceError } from '../_lib/quiz-service'
import {
  isAnswerQuizQuestionResponse,
  isQuizIntegrityEventsResult,
  isRecordQuizIntegrityEventsResponse,
  isStartQuizAttemptResponse,
} from '../../../src/lib/quizzes'

vi.mock('server-only', () => ({}))

const routeBackend = vi.hoisted(() => ({
  database: undefined as unknown,
  verify: vi.fn(),
  start: vi.fn(),
  answer: vi.fn(),
  events: vi.fn(),
  review: vi.fn(),
}))

vi.mock('../../../src/lib/firebase-admin', () => ({
  adminDatabase: () => routeBackend.database,
  adminAuth: () => ({ verifyIdToken: routeBackend.verify }),
  AdminConfigurationError: class extends Error {},
  ADMIN_CONFIG_MESSAGE: 'Firebase Admin service is not configured correctly.',
}))

vi.mock('../_lib/quiz-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_lib/quiz-service')>()
  return {
    ...actual,
    startQuizAttemptService: routeBackend.start,
    answerQuizQuestionService: routeBackend.answer,
    recordIntegrityEventsService: routeBackend.events,
    getIntegrityReviewService: routeBackend.review,
  }
})

import { POST as start } from '../quiz/start/route'
import { POST as answer } from '../quiz/answer/route'
import { POST as events } from '../quiz/events/route'
import { GET as signals } from '../quiz/results/[quizId]/[uid]/signals/route'

const TOKEN = 'synthetic-token'
const QUIZ_ID = 'quiz-one'
const UID = 'student1'
const ATTEMPT_ID = 'attempt-one'
const SESSION_ID = 'session-one'
const OPERATION_ID = 'operation-one'
const SERVER_NOW = 1_700_000_000_000

function request(path: string, options: {
  method?: 'GET' | 'POST'
  body?: string
  token?: boolean
  contentType?: string | null
  headers?: Record<string, string>
} = {}) {
  const headers: Record<string, string> = {
    ...(options.token === false ? {} : { authorization: `Bearer ${TOKEN}` }),
    ...(options.body === undefined || options.contentType === null
      ? {}
      : { 'content-type': options.contentType ?? 'application/json' }),
    ...options.headers,
  }
  return new Request(`http://test.local${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers,
    body: options.body,
  })
}

function post(path: string, body: unknown, options: Omit<Parameters<typeof request>[1], 'body' | 'method'> = {}) {
  return request(path, { ...options, method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) })
}

function signalContext(quizId = QUIZ_ID, uid = UID) {
  return { params: Promise.resolve({ quizId, uid }) }
}

function activeResponse(status: 'started' | 'resumed' | 'active' = 'active') {
  return {
    status,
    schemaVersion: 2 as const,
    attemptId: ATTEMPT_ID,
    sessionId: SESSION_ID,
    serverNow: SERVER_NOW,
    startedAt: SERVER_NOW,
    questionIndex: 0,
    questionCount: 2,
    questionStartedAt: SERVER_NOW,
    question: { id: 'q_0', prompt: 'Current question', choices: ['A', 'B'] },
    deadlineAt: SERVER_NOW + 30_000,
    durationMs: 30_000,
    integrity: {
      enabled: true,
      noticeVersion: 'quiz-integrity-v1' as const,
      fullscreenStart: 'entered' as const,
    },
  }
}

function publicResult() {
  return {
    uid: UID,
    nickname: 'Student_One',
    quizId: QUIZ_ID,
    quizTitle: 'Authoritative quiz',
    correctCount: 1,
    questionCount: 1,
    score: 100,
    passed: true,
    gradedAt: SERVER_NOW,
    breakdown: [{
      id: 'q_0',
      prompt: 'Current question',
      choices: ['A', 'B'],
      chosenIndex: 0,
      correctIndex: 0,
      correct: true,
    }],
  }
}

function assertPrivate(response: Response) {
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('vary')).toBe('Authorization')
}

async function expectResponse(
  response: Response,
  status: number,
  body?: unknown,
) {
  expect(response.status).toBe(status)
  assertPrivate(response)
  if (body !== undefined) expect(await response.json()).toEqual(body)
}

function validStartBody() {
  return { quizId: QUIZ_ID, sessionId: SESSION_ID, fullscreenStart: 'entered' }
}

function validAnswerBody() {
  return {
    quizId: QUIZ_ID,
    attemptId: ATTEMPT_ID,
    sessionId: SESSION_ID,
    questionId: 'q_0',
    operationId: OPERATION_ID,
    chosenIndex: 0,
  }
}

function validEventsBody() {
  return {
    quizId: QUIZ_ID,
    attemptId: ATTEMPT_ID,
    sessionId: SESSION_ID,
    events: [{
      eventId: 'event-0001',
      type: 'page-hidden',
      startedAt: SERVER_NOW - 200,
      endedAt: SERVER_NOW - 100,
      questionId: 'q_0',
      sequence: 1,
    }],
  }
}

beforeEach(() => {
  vi.stubGlobal('process', { ...process, env: {} })
  routeBackend.database = memoryDatabase().database
  routeBackend.verify.mockReset().mockResolvedValue({ uid: UID })
  routeBackend.start.mockReset().mockResolvedValue(activeResponse('started'))
  routeBackend.answer.mockReset().mockResolvedValue(activeResponse('active'))
  routeBackend.events.mockReset().mockResolvedValue({ acceptedEventIds: ['event-0001'], serverNow: SERVER_NOW })
  routeBackend.review.mockReset().mockResolvedValue({
    summary: { eventCount: 0, monitoringLimited: false, deleteAfter: SERVER_NOW + 1 },
    events: [],
  })
})

describe('quiz route authentication and private response headers', () => {
  it('authenticates before body parsing or database/service access on every route', async () => {
    const responses = [
      await start(request('/api/quiz/start', { method: 'POST', body: '{', token: false, contentType: 'text/plain' })),
      await answer(request('/api/quiz/answer', { method: 'POST', body: '{', token: false, contentType: 'text/plain' })),
      await events(request('/api/quiz/events', { method: 'POST', body: '{', token: false, contentType: 'text/plain' })),
      await signals(request(`/api/quiz/results/${QUIZ_ID}/${UID}/signals`, { token: false }), signalContext()),
    ]
    for (const response of responses) {
      await expectResponse(response, 401, { error: 'Authentication is required.' })
    }
    expect(routeBackend.start).not.toHaveBeenCalled()
    expect(routeBackend.answer).not.toHaveBeenCalled()
    expect(routeBackend.events).not.toHaveBeenCalled()
    expect(routeBackend.review).not.toHaveBeenCalled()
  })

  it('adds private/no-store and Vary headers to every successful route response', async () => {
    const responses = [
      await start(post('/api/quiz/start', validStartBody())),
      await answer(post('/api/quiz/answer', validAnswerBody())),
      await events(post('/api/quiz/events', validEventsBody())),
      await signals(request(`/api/quiz/results/${QUIZ_ID}/${UID}/signals`), signalContext()),
    ]
    for (const response of responses) {
      expect(response.status).toBe(200)
      assertPrivate(response)
    }
  })

  it('adds private/no-store and Vary headers across reachable 400/401/403/404/409/429/503 errors', async () => {
    const cases: Array<[number, QuizServiceError | Error]> = [
      [400, new QuizServiceError('invalid-argument', 'invalid')],
      [403, new QuizServiceError('permission-denied', 'private')],
      [404, new QuizServiceError('not-found', 'missing')],
      [409, new QuizServiceError('conflict', 'conflict')],
      [429, new QuizServiceError('too-many-events', 'limited')],
      [503, new Error('sensitive backend detail')],
    ]
    for (const [status, error] of cases) {
      routeBackend.review.mockRejectedValueOnce(error)
      const response = await signals(request(`/api/quiz/results/${QUIZ_ID}/${UID}/signals`), signalContext())
      expect(response.status).toBe(status)
      assertPrivate(response)
      if (status === 503) expect(await response.text()).not.toContain('sensitive backend detail')
    }
    const unauthorized = await signals(request(`/api/quiz/results/${QUIZ_ID}/${UID}/signals`, { token: false }), signalContext())
    expect(unauthorized.status).toBe(401)
    assertPrivate(unauthorized)
  })
})

describe('strict POST bodies and bounded JSON parsing', () => {
  it('requires application/json while allowing its charset parameter', async () => {
    for (const handler of [start, answer, events]) {
      const path = handler === start ? '/api/quiz/start' : handler === answer ? '/api/quiz/answer' : '/api/quiz/events'
      for (const contentType of [null, 'text/plain', 'application/problem+json']) {
        const response = await handler(post(path, {}, { contentType }))
        await expectResponse(response, 400, { error: 'Invalid request.' })
      }
    }
    const response = await start(post('/api/quiz/start', validStartBody(), { contentType: 'Application/JSON; Charset=UTF-8' }))
    expect(response.status).toBe(200)
  })

  it('rejects malformed, scalar, array, null, missing, and extra-field bodies before service calls', async () => {
    const cases: Array<[
      (request: Request) => Promise<Response>,
      string,
      Record<string, unknown>,
      ReturnType<typeof vi.fn>,
    ]> = [
      [start, '/api/quiz/start', validStartBody(), routeBackend.start],
      [answer, '/api/quiz/answer', validAnswerBody(), routeBackend.answer],
      [events, '/api/quiz/events', validEventsBody(), routeBackend.events],
    ]
    for (const [handler, path, valid, service] of cases) {
      service.mockClear()
      for (const body of ['{', 'null', '[]', 'true', '1', '"text"', '{}', JSON.stringify({ ...valid, unknown: true })]) {
        const response = await handler(post(path, body))
        expect(response.status).toBe(400)
        assertPrivate(response)
      }
      expect(service).not.toHaveBeenCalled()
    }
  })

  it('rejects falsey/mistyped required values without coercion', async () => {
    const startBodies = [
      { ...validStartBody(), quizId: null },
      { ...validStartBody(), sessionId: 1 },
      { ...validStartBody(), fullscreenStart: 'automatic' },
    ]
    for (const body of startBodies) expect((await start(post('/api/quiz/start', body))).status).toBe(400)

    const answerBodies = [
      { ...validAnswerBody(), attemptId: null },
      { ...validAnswerBody(), questionId: 1 },
      { ...validAnswerBody(), chosenIndex: 0.5 },
      { ...validAnswerBody(), operationId: false },
    ]
    for (const body of answerBodies) expect((await answer(post('/api/quiz/answer', body))).status).toBe(400)

    for (const body of [
      { ...validEventsBody(), quizId: 1 },
      { ...validEventsBody(), attemptId: null },
      { ...validEventsBody(), sessionId: false },
    ]) expect((await events(post('/api/quiz/events', body))).status).toBe(400)
  })

  it('rejects declared and actual JSON bodies over 64 KiB without reaching services', async () => {
    const declared = await start(post('/api/quiz/start', validStartBody(), {
      headers: { 'content-length': String((64 * 1024) + 1) },
    }))
    await expectResponse(declared, 400, { error: 'Invalid request.' })

    const oversized = JSON.stringify({
      ...validStartBody(),
      quizId: 'a'.repeat((64 * 1024) + 1),
    })
    const actual = await start(post('/api/quiz/start', oversized))
    await expectResponse(actual, 400, { error: 'Invalid request.' })
    expect(routeBackend.start).not.toHaveBeenCalled()
  })
})

describe('route input forwarding, status mapping, and response safety', () => {
  it('forwards only exact start/answer/events fields and route params to services', async () => {
    await start(post('/api/quiz/start', validStartBody()))
    expect(routeBackend.start).toHaveBeenCalledTimes(1)
    expect(routeBackend.start.mock.calls[0]?.[1]).toBe(UID)
    expect(routeBackend.start.mock.calls[0]?.[2]).toMatchObject(validStartBody())
    expect(routeBackend.start.mock.calls[0]?.[2].attemptId).toMatch(/^att_[0-9a-f-]{36}$/)
    expect(Object.keys(routeBackend.start.mock.calls[0]?.[2]).sort()).toEqual([
      'attemptId', 'fullscreenStart', 'quizId', 'sessionId',
    ])

    await answer(post('/api/quiz/answer', validAnswerBody()))
    expect(routeBackend.answer).toHaveBeenCalledWith(expect.anything(), UID, validAnswerBody())

    await events(post('/api/quiz/events', validEventsBody()))
    expect(routeBackend.events).toHaveBeenCalledWith(expect.anything(), UID, validEventsBody())

    await signals(request('/api/quiz/results/another-quiz/subject2/signals'), signalContext('another-quiz', 'subject2'))
    expect(routeBackend.review).toHaveBeenCalledWith(expect.anything(), UID, 'another-quiz', 'subject2')
  })

  it('maps service error codes consistently on POST routes', async () => {
    const cases: Array<[
      ReturnType<typeof vi.fn>,
      (request: Request) => Promise<Response>,
      string,
      unknown,
      QuizServiceError,
      number,
    ]> = [
      [routeBackend.start, start, '/api/quiz/start', validStartBody(), new QuizServiceError('permission-denied', 'Owner rejected.'), 403],
      [routeBackend.start, start, '/api/quiz/start', validStartBody(), new QuizServiceError('not-found', 'Quiz unavailable.'), 404],
      [routeBackend.answer, answer, '/api/quiz/answer', validAnswerBody(), new QuizServiceError('failed-precondition', 'No active attempt.'), 409],
      [routeBackend.events, events, '/api/quiz/events', validEventsBody(), new QuizServiceError('too-many-events', 'Event cap reached.'), 429],
    ]
    for (const [service, handler, path, body, error, status] of cases) {
      service.mockRejectedValueOnce(error)
      const response = await handler(post(path, body))
      expect(response.status).toBe(status)
      assertPrivate(response)
      expect(await response.json()).toEqual({ error: error.message })
    }
  })

  it('returns start/answer shapes accepted by strict client validators with one current question and no key/internal state', async () => {
    const startBody = activeResponse('started')
    const answerBody = activeResponse('active')
    routeBackend.start.mockResolvedValueOnce(startBody)
    routeBackend.answer.mockResolvedValueOnce(answerBody)
    const startJson = await (await start(post('/api/quiz/start', validStartBody()))).json()
    const answerJson = await (await answer(post('/api/quiz/answer', validAnswerBody()))).json()
    expect(isStartQuizAttemptResponse(startJson)).toBe(true)
    expect(isAnswerQuizQuestionResponse(answerJson)).toBe(true)
    for (const value of [startJson, answerJson]) {
      expect(Object.keys(value)).not.toContain('questions')
      expect(JSON.stringify(value)).not.toContain('Future question')
      expect(JSON.stringify(value)).not.toContain('correctIndex')
      expect(JSON.stringify(value)).not.toContain('answerKey')
      expect(JSON.stringify(value)).not.toContain('answerOperations')
    }
  })

  it('returns safe completion/conflict/event/review envelopes without private internals', async () => {
    routeBackend.answer.mockResolvedValueOnce({
      status: 'completed',
      result: publicResult(),
      stats: {
        quizzesTaken: 1,
        quizzesPassed: 1,
        currentStreak: 1,
        bestStreak: 1,
        totalCorrect: 1,
        totalQuestions: 1,
        lifetimeAccuracy: 100,
      },
    })
    const completed = await (await answer(post('/api/quiz/answer', validAnswerBody()))).json()
    expect(isAnswerQuizQuestionResponse(completed)).toBe(true)
    expect(JSON.stringify(completed)).not.toContain('appliedAttempts')
    expect(JSON.stringify(completed)).not.toContain(SESSION_ID)

    routeBackend.answer.mockResolvedValueOnce({ status: 'conflict', reason: 'session-replaced' })
    const conflict = await (await answer(post('/api/quiz/answer', validAnswerBody()))).json()
    expect(isAnswerQuizQuestionResponse(conflict)).toBe(true)

    const acknowledgement = await (await events(post('/api/quiz/events', validEventsBody()))).json()
    expect(isRecordQuizIntegrityEventsResponse(acknowledgement)).toBe(true)

    const review = await (await signals(request(`/api/quiz/results/${QUIZ_ID}/${UID}/signals`), signalContext())).json()
    expect(isQuizIntegrityEventsResult(review)).toBe(true)
    expect(JSON.stringify(review)).not.toContain('attemptId')
    expect(JSON.stringify(review)).not.toContain('device')
    expect(JSON.stringify(review)).not.toContain('ip')
  })

  it('sanitizes unexpected database/service failures to 503', async () => {
    routeBackend.start.mockRejectedValueOnce(new Error('synthetic-sensitive-sdk-detail'))
    const response = await start(post('/api/quiz/start', validStartBody()))
    expect(response.status).toBe(503)
    assertPrivate(response)
    expect(await response.text()).not.toContain('synthetic-sensitive-sdk-detail')
  })

  it('passes a database deadline wrapper rather than the raw database object', async () => {
    const raw = memoryDatabase().database as CoreDatabase
    routeBackend.database = raw
    await start(post('/api/quiz/start', validStartBody()))
    const received = routeBackend.start.mock.calls[0]?.[0] as CoreDatabase
    expect(received).not.toBe(raw)
    expect(received.ref('probe')).not.toBe(raw.ref('probe'))
  })
})
