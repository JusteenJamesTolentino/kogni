// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  ref: vi.fn((_database: unknown, path?: string) => ({ path })),
  getQuizIntegrityEvents: vi.fn(),
}))

vi.mock('../../src/lib/firebase', () => ({ database: {} }))
vi.mock('firebase/database', () => ({ get: mocks.get, ref: mocks.ref }))
vi.mock('../../src/lib/quizzes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/quizzes')>()
  return { ...actual, getQuizIntegrityEvents: mocks.getQuizIntegrityEvents }
})

import QuizResults from '../../src/components/QuizResults'
import type { QuizAttemptResult } from '../../src/lib/quizzes'

const BASE_TIME = new Date('2026-01-01T00:00:00.000Z').getTime()

function attempt(): QuizAttemptResult {
  return {
    uid: 'student-one',
    nickname: 'StudentOne',
    quizId: 'quiz-one',
    quizTitle: 'Cell quiz',
    correctCount: 1,
    questionCount: 1,
    score: 100,
    passed: true,
    gradedAt: BASE_TIME,
    breakdown: [{
      id: 'q_0',
      prompt: 'What is ATP?',
      choices: ['Energy currency', 'A protein'],
      chosenIndex: 0,
      correctIndex: 0,
      correct: true,
    }],
    integritySummary: {
      eventCount: 1,
      monitoringLimited: false,
      deleteAfter: BASE_TIME + 2_592_000_000,
    },
  }
}

function renderResults() {
  return render(<MemoryRouter><QuizResults quizId="quiz-one" ownerId="teacher-one" /></MemoryRouter>)
}

beforeEach(() => {
  mocks.get.mockReset()
  mocks.ref.mockClear()
  mocks.getQuizIntegrityEvents.mockReset()
  mocks.get
    .mockResolvedValueOnce({ val: () => ({
      ownerId: 'teacher-one',
      title: 'Cell quiz',
      integrity: {
        enabled: true,
        noticeVersion: 'quiz-integrity-v1',
        authorityAcknowledgedAt: BASE_TIME,
      },
    }) })
    .mockResolvedValueOnce({ val: () => ({ 'student-one': attempt() }) })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('QuizResults Integrity Mode signal review', () => {
  it('loads the signal log only on demand and shows neutral disclaimer and formatted timeline', async () => {
    mocks.getQuizIntegrityEvents.mockResolvedValue({
      summary: { eventCount: 1, monitoringLimited: false, deleteAfter: BASE_TIME + 2_592_000_000 },
      events: [{
        eventId: 'event_0001',
        type: 'page-hidden',
        startedAt: BASE_TIME + 1_000,
        endedAt: BASE_TIME + 3_500,
        questionId: 'q_0',
        sequence: 1,
        receivedAt: BASE_TIME + 4_000,
        durationMs: 2_500,
      }],
    })
    renderResults()

    const reviewButton = await screen.findByRole('button', { name: 'Review' })
    expect(mocks.getQuizIntegrityEvents).not.toHaveBeenCalled()
    fireEvent.click(reviewButton)

    await waitFor(() => expect(mocks.getQuizIntegrityEvents).toHaveBeenCalledWith('quiz-one', 'student-one'))
    expect(await screen.findByText(/limited technical signals with possible innocent causes/i)).toBeTruthy()
    expect(screen.getByText(/not evidence by themselves and never change the score/i)).toBeTruthy()
    expect(screen.getByText('Page attention interrupted')).toBeTruthy()
    expect(screen.getByText(/2.5 s/)).toBeTruthy()
  })

  it('distinguishes a loaded empty timeline from an unavailable log error', async () => {
    mocks.getQuizIntegrityEvents.mockResolvedValueOnce({
      summary: { eventCount: 0, monitoringLimited: true, deleteAfter: BASE_TIME + 2_592_000_000 },
      events: [],
    })
    renderResults()
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    expect(await screen.findByText('No technical signals were recorded.')).toBeTruthy()
    expect(screen.queryByText('Signal log unavailable')).toBeNull()

    cleanup()
    mocks.get
      .mockResolvedValueOnce({ val: () => ({
        ownerId: 'teacher-one', title: 'Cell quiz',
        integrity: { enabled: true, noticeVersion: 'quiz-integrity-v1', authorityAcknowledgedAt: BASE_TIME },
      }) })
      .mockResolvedValueOnce({ val: () => ({ 'student-one': attempt() }) })
    mocks.getQuizIntegrityEvents.mockRejectedValueOnce(new Error('The retained log has expired.'))
    renderResults()
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))

    expect(await screen.findByText('Signal log unavailable')).toBeTruthy()
    expect(screen.getByText('The retained log has expired.')).toBeTruthy()
    expect(screen.queryByText('No technical signals were recorded.')).toBeNull()
  })
})
