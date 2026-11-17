// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from 'firebase/auth'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  createQuiz: vi.fn(),
}))

vi.mock('../../src/lib/quizzes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/quizzes')>()
  return { ...actual, createQuiz: mocks.createQuiz }
})

import QuizCreator from '../../src/components/QuizCreator'
import { QUIZ_INTEGRITY_NOTICE_VERSION } from '../../src/lib/quizzes'

const user = { uid: 'teacher-1' } as User

function renderCreator() {
  return render(<MemoryRouter><QuizCreator user={user} onExit={vi.fn()} /></MemoryRouter>)
}

function fillValidDraft(): void {
  fireEvent.change(screen.getByPlaceholderText('e.g. Biology — Cell Structure'), { target: { value: 'Cell quiz' } })
  fireEvent.change(screen.getByPlaceholderText('What do you want to ask?'), { target: { value: 'What is ATP?' } })
  fireEvent.change(screen.getByPlaceholderText('Choice 1'), { target: { value: 'Energy currency' } })
  fireEvent.change(screen.getByPlaceholderText('Choice 2'), { target: { value: 'A protein' } })
}

beforeEach(() => {
  mocks.createQuiz.mockReset().mockResolvedValue({
    quizId: 'quiz-one',
    code: 'ABCD-EFGH',
    title: 'Cell quiz',
    createdAt: 1,
    integrityMode: false,
  })
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('QuizCreator Integrity Mode', () => {
  it('is off by default and omits the policy from the create payload', async () => {
    renderCreator()
    expect((screen.getByRole('checkbox', { name: 'Enable Integrity Mode' }) as HTMLInputElement).checked).toBe(false)
    expect(screen.queryByText(/cannot detect passive split view/i)).toBeNull()

    fillValidDraft()
    fireEvent.click(screen.getByRole('button', { name: /publish quiz/i }))

    await waitFor(() => expect(mocks.createQuiz).toHaveBeenCalledTimes(1))
    expect(mocks.createQuiz.mock.calls[0]).toHaveLength(4)
    expect(mocks.createQuiz).toHaveBeenCalledWith(
      user,
      'Cell quiz',
      '',
      [{ prompt: 'What is ATP?', choices: ['Energy currency', 'A protein'], correctIndex: 0 }],
    )
  })

  it('requires the authority acknowledgement and sends the exact enabled policy', async () => {
    renderCreator()
    fillValidDraft()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable Integrity Mode' }))

    expect(screen.getByText(/cannot detect passive split view or activity on another screen or device/i)).toBeTruthy()
    expect(screen.getByText(/camera, microphone, screen recording, keystroke collection, or location/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /publish quiz/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/acknowledge your authority/i)
    expect(mocks.createQuiz).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('checkbox', { name: /i am authorized to use this feature/i }))
    mocks.createQuiz.mockResolvedValueOnce({
      quizId: 'quiz-one',
      code: 'ABCD-EFGH',
      title: 'Cell quiz',
      createdAt: 1,
      integrityMode: true,
    })
    fireEvent.click(screen.getByRole('button', { name: /publish quiz/i }))

    await waitFor(() => expect(mocks.createQuiz).toHaveBeenCalledTimes(1))
    expect(mocks.createQuiz.mock.calls[0]?.[4]).toEqual({
      enabled: true,
      noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
      authorityAcknowledgedAt: 1_700_000_000_000,
    })
    expect(await screen.findByText('On')).toBeTruthy()
  })

  it('resets the published creator locally for another quiz', async () => {
    renderCreator()
    fillValidDraft()
    fireEvent.click(screen.getByRole('button', { name: /publish quiz/i }))
    await screen.findByText('Quiz published')

    fireEvent.click(screen.getByRole('button', { name: 'Create another quiz' }))
    expect(screen.getByRole('heading', { name: 'Create a quiz' })).toBeTruthy()
    expect((screen.getByPlaceholderText('e.g. Biology — Cell Structure') as HTMLInputElement).value).toBe('')
    expect((screen.getByRole('checkbox', { name: 'Enable Integrity Mode' }) as HTMLInputElement).checked).toBe(false)
  })
})
