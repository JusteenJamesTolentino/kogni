import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from 'firebase/auth'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  ref: vi.fn((_database: unknown, path: string) => ({ path })),
}))

vi.mock('../../src/lib/firebase', () => ({ database: {} }))
vi.mock('firebase/database', () => ({ get: mocks.get, ref: mocks.ref, update: mocks.update }))

import { formatQuizCodeInput, normalizeQuizCode, createQuiz, validateQuizDraft } from '../../src/lib/quizzes'

const teacher = { uid: 'teacher-1' } as User

function draftQuestions() {
  return [
    { prompt: 'What is ATP?', choices: ['Energy currency', 'A protein'], correctIndex: 0 },
    { prompt: 'Pick B', choices: ['A', 'B', 'C'], correctIndex: 1 },
  ]
}

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

describe('createQuiz', () => {
  beforeEach(() => {
    mocks.get.mockReset()
    mocks.update.mockReset()
    mocks.get.mockResolvedValue({ val: () => null })
  })

  it('writes the question set, owner-only answer key, join code, and owner index atomically', async () => {
    const created = await createQuiz(teacher, '  Cell quiz  ', ' Chapter 1 ', draftQuestions())

    expect(created.title).toBe('Cell quiz')
    expect(created.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    expect(created.quizId).toMatch(/^quiz_[0-9a-f-]{36}$/)
    expect(mocks.update).toHaveBeenCalledTimes(1)

    const writes = mocks.update.mock.calls[0][1] as Record<string, unknown>
    const quizRoot = writes[`quizzes/${created.quizId}`] as Record<string, unknown>
    const answers = writes[`quizAnswers/${created.quizId}`] as Record<string, unknown>
    const code = writes[`quizCodes/${created.code}`] as Record<string, unknown>
    const byOwner = writes[`quizzesByOwner/teacher-1/${created.quizId}`] as Record<string, unknown>

    expect(quizRoot).toMatchObject({ ownerId: 'teacher-1', title: 'Cell quiz', questionCount: 2 })
    expect(Object.keys(quizRoot.questions as object)).toEqual(['q_0', 'q_1'])
    // The question set must not contain the answer key anywhere.
    expect(JSON.stringify(quizRoot)).not.toContain('correctIndex')
    expect(answers).toMatchObject({ ownerId: 'teacher-1', correct: { q_0: 0, q_1: 1 } })
    expect(code).toMatchObject({ quizId: created.quizId, ownerId: 'teacher-1' })
    expect(byOwner).toMatchObject({ code: created.code, title: 'Cell quiz' })
  })

  it('regenerates the code when a collision exists and retries', async () => {
    mocks.get.mockResolvedValueOnce({ val: () => ({ taken: true }) })
    const created = await createQuiz(teacher, 'Cell quiz', '', draftQuestions())
    expect(mocks.get).toHaveBeenCalledTimes(2)
    expect(created.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    expect(mocks.update).toHaveBeenCalledTimes(1)
  })

  it('requires an authenticated teacher', async () => {
    await expect(createQuiz(null, 'Quiz', '', draftQuestions())).rejects.toThrow(TypeError)
  })
})
