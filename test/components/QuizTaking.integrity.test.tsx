// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from 'firebase/auth'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  startQuizAttempt: vi.fn(),
  answerQuizQuestion: vi.fn(),
  monitor: vi.fn(),
  monitorStop: vi.fn(),
  monitorReenter: vi.fn(),
  monitorClear: vi.fn(),
}))

vi.mock('../../src/lib/quizzes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/quizzes')>()
  return {
    ...actual,
    startQuizAttempt: mocks.startQuizAttempt,
    answerQuizQuestion: mocks.answerQuizQuestion,
  }
})

vi.mock('../../src/hooks/useQuizIntegrityMonitor', () => ({
  default: (options: unknown) => {
    mocks.monitor(options)
    return {
      returnWarning: null,
      clearReturnWarning: mocks.monitorClear,
      reenterFullscreen: mocks.monitorReenter,
      flush: vi.fn().mockResolvedValue(undefined),
      stop: mocks.monitorStop,
    }
  },
}))

import QuizTaking from '../../src/components/QuizTaking'
import { QUIZ_INTEGRITY_NOTICE_VERSION } from '../../src/lib/quizzes'
import type {
  QuizAttemptActiveState,
  QuizAttemptResult,
  QuizResolutionMetadata,
} from '../../src/lib/quizzes'

const BASE_TIME = new Date('2026-01-01T00:00:00.000Z').getTime()
const user = { uid: 'student-one' } as User
const ordinaryQuiz: QuizResolutionMetadata = {
  quizId: 'quiz-one',
  title: 'Cell quiz',
  description: 'Chapter one',
  questionCount: 2,
  integrity: { enabled: false, noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION },
}
const integrityQuiz: QuizResolutionMetadata = {
  ...ordinaryQuiz,
  integrity: { enabled: true, noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION },
}

function activeState(overrides: Partial<QuizAttemptActiveState> = {}): QuizAttemptActiveState {
  return {
    schemaVersion: 2,
    attemptId: 'attempt_0001',
    sessionId: 'session_0001',
    serverNow: BASE_TIME,
    startedAt: BASE_TIME,
    questionIndex: 0,
    questionCount: 2,
    questionStartedAt: BASE_TIME,
    question: { id: 'q_0', prompt: 'What is ATP?', choices: ['Energy currency', 'A protein'] },
    deadlineAt: BASE_TIME + 30_000,
    durationMs: 30_000,
    integrity: {
      enabled: true,
      noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
      fullscreenStart: 'entered',
      deleteAfter: BASE_TIME + 2_592_000_000,
    },
    ...overrides,
  }
}

function completedResult(): QuizAttemptResult {
  return {
    uid: 'student-one',
    nickname: 'StudentOne',
    quizId: 'quiz-one',
    quizTitle: 'Cell quiz',
    correctCount: 1,
    questionCount: 1,
    score: 100,
    passed: true,
    gradedAt: BASE_TIME + 10_000,
    breakdown: [{
      id: 'q_0',
      prompt: 'What is ATP?',
      choices: ['Energy currency', 'A protein'],
      chosenIndex: 0,
      correctIndex: 0,
      correct: true,
    }],
  }
}

function renderTaking(quiz = integrityQuiz, onFinished = vi.fn()) {
  return {
    onFinished,
    ...render(
      <QuizTaking
        user={user}
        quiz={quiz}
        code="ABCD-EFGH"
        onFinished={onFinished}
        onExit={vi.fn()}
      />,
    ),
  }
}

function acknowledgeIntegrity(): void {
  fireEvent.click(screen.getByRole('checkbox', { name: /i understand the one-attempt timing/i }))
}

function confirmOrdinary(): void {
  fireEvent.click(screen.getByRole('checkbox', { name: /i am ready to begin/i }))
}

async function startIntegrityWithoutFullscreen(): Promise<void> {
  acknowledgeIntegrity()
  fireEvent.click(screen.getByRole('button', { name: 'Continue without fullscreen' }))
  await screen.findByRole('heading', { name: 'What is ATP?' })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(BASE_TIME)
  mocks.startQuizAttempt.mockReset()
  mocks.answerQuizQuestion.mockReset()
  mocks.monitor.mockReset()
  mocks.monitorStop.mockReset().mockResolvedValue(undefined)
  mocks.monitorReenter.mockReset().mockResolvedValue(true)
  mocks.monitorClear.mockReset()
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null, writable: true })
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: undefined, writable: true })
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: vi.fn().mockResolvedValue(undefined), writable: true })
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true, writable: true })
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('QuizTaking Integrity Mode preflight and server flow', () => {
  it('does not start during preflight and allows unsupported fullscreen with neutral limited monitoring', async () => {
    mocks.startQuizAttempt.mockResolvedValue({ status: 'started', ...activeState({ integrity: { ...activeState().integrity, fullscreenStart: 'unsupported' } }) })
    renderTaking()

    expect(mocks.startQuizAttempt).not.toHaveBeenCalled()
    expect(mocks.monitor.mock.calls.every(([options]) => !(options as { active: boolean }).active)).toBe(true)
    expect(screen.getByText(/server-enforced 30-second deadline/i)).toBeTruthy()
    acknowledgeIntegrity()
    fireEvent.click(screen.getByRole('button', { name: 'Try fullscreen and start' }))

    expect(await screen.findByText(/fullscreen is unavailable here/i)).toBeTruthy()
    await waitFor(() => expect(mocks.startQuizAttempt).toHaveBeenCalledTimes(1))
    expect(mocks.startQuizAttempt.mock.calls[0]?.[2]).toBe('unsupported')
    expect(await screen.findByRole('heading', { name: 'What is ATP?' })).toBeTruthy()
    expect(mocks.monitor.mock.calls.some(([options]) => {
      const value = options as { enabled: boolean; active: boolean; currentQuestionId: string | null }
      return value.enabled && value.active && value.currentQuestionId === 'q_0'
    })).toBe(true)
  })

  it('never requests fullscreen or enables monitoring for an ordinary quiz', async () => {
    const requestFullscreen = vi.fn()
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: requestFullscreen })
    mocks.startQuizAttempt.mockResolvedValue({
      status: 'started',
      ...activeState({ integrity: { ...activeState().integrity, enabled: false, fullscreenStart: 'not-requested', deleteAfter: undefined } }),
    })
    renderTaking(ordinaryQuiz)
    confirmOrdinary()
    fireEvent.click(screen.getByRole('button', { name: 'Start quiz' }))

    await screen.findByRole('heading', { name: 'What is ATP?' })
    expect(requestFullscreen).not.toHaveBeenCalled()
    expect(mocks.startQuizAttempt.mock.calls[0]?.[2]).toBe('not-requested')
    expect(mocks.monitor.mock.calls.some(([options]) => (options as { enabled: boolean }).enabled)).toBe(false)
  })

  it('derives the countdown from the absolute server deadline and times out with -1 once', async () => {
    mocks.startQuizAttempt.mockResolvedValue({
      status: 'started',
      ...activeState({ serverNow: BASE_TIME + 5_000, deadlineAt: BASE_TIME + 20_000 }),
    })
    mocks.answerQuizQuestion.mockReturnValue(new Promise(() => undefined))
    renderTaking()
    await startIntegrityWithoutFullscreen()

    expect(screen.getByLabelText('15 seconds remaining')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })

    expect(mocks.answerQuizQuestion).toHaveBeenCalledTimes(1)
    expect(mocks.answerQuizQuestion.mock.calls[0]?.[0]).toMatchObject({ questionId: 'q_0', chosenIndex: -1 })
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(mocks.answerQuizQuestion).toHaveBeenCalledTimes(1)
  })

  it('guards rapid double-clicks and reuses the operation UUID on explicit retry', async () => {
    mocks.startQuizAttempt.mockResolvedValue({ status: 'started', ...activeState() })
    mocks.answerQuizQuestion.mockRejectedValueOnce(new Error('Temporary connection problem'))
    renderTaking()
    await startIntegrityWithoutFullscreen()

    const choice = screen.getByRole('button', { name: /energy currency/i })
    fireEvent.click(choice)
    fireEvent.click(choice)
    await screen.findByRole('button', { name: 'Retry answer' })
    expect(mocks.answerQuizQuestion).toHaveBeenCalledTimes(1)
    const firstOperationId = mocks.answerQuizQuestion.mock.calls[0]?.[0].operationId

    mocks.answerQuizQuestion.mockResolvedValueOnce({ status: 'completed', result: completedResult() })
    fireEvent.click(screen.getByRole('button', { name: 'Retry answer' }))
    await waitFor(() => expect(mocks.answerQuizQuestion).toHaveBeenCalledTimes(2))
    expect(mocks.answerQuizQuestion.mock.calls[1]?.[0].operationId).toBe(firstOperationId)
  })

  it('propagates an already-used start status distinctly', async () => {
    const onFinished = vi.fn()
    const result = completedResult()
    mocks.startQuizAttempt.mockResolvedValue({ status: 'already', result })
    renderTaking(integrityQuiz, onFinished)
    acknowledgeIntegrity()
    fireEvent.click(screen.getByRole('button', { name: 'Continue without fullscreen' }))

    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(result, undefined, true))
  })
})
