import { get, ref, update } from 'firebase/database'
import type { User } from 'firebase/auth'
import { database } from './firebase'

/**
 * Quiz-code helpers for the school quiz system. Codes are 4-4 alphanumeric
 * (`XXXX-XXXX`) so teacher-shared URLs like /quiz?code=ABCD-EFGH are easy to
 * type. Quizzes award nothing and never touch schedules — creation writes the
 * question set, an owner-only answer key, and a join code atomically.
 */

export const QUIZ_LIMITS = Object.freeze({
  maxQuestions: 50,
  minQuestions: 1,
  maxPromptLength: 500,
  minChoices: 2,
  maxChoices: 4,
  maxChoiceLength: 200,
  maxTitleLength: 160,
  maxDescriptionLength: 2000,
})

/** Unambiguous code alphabet (no 0/O/1/I/L) so hand-typed classroom codes stay readable. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export interface QuizCodeRecord {
  quizId: string
  ownerId: string
  createdAt: number
}

export interface QuizDraftQuestion {
  prompt: string
  choices: string[]
  correctIndex: number
}

export interface CreatedQuiz {
  quizId: string
  code: string
  title: string
  createdAt: number
}

/** Uppercases and strips separators; returns null unless exactly 8 alphanumeric characters remain. */
export function normalizeQuizCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z0-9]{8}$/.test(compact) ? `${compact.slice(0, 4)}-${compact.slice(4)}` : null
}

/** Formats a normalized code for display while the user types. */
export function formatQuizCodeInput(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  return compact.length > 4 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact
}

export type QuizCodeLookup =
  | { status: 'found'; code: string; quiz: QuizCodeRecord }
  | { status: 'not-found'; code: string }

export async function lookupQuizCode(code: string): Promise<QuizCodeLookup> {
  const normalized = normalizeQuizCode(code)
  if (!normalized) throw new TypeError('A quiz code looks like ABCD-EFGH.')
  const value: unknown = (await get(ref(database, `quizCodes/${normalized}`))).val()
  if (
    typeof value === 'object' && value !== null &&
    typeof (value as { quizId?: unknown }).quizId === 'string' &&
    typeof (value as { ownerId?: unknown }).ownerId === 'string' &&
    typeof (value as { createdAt?: unknown }).createdAt === 'number'
  ) {
    const quiz = value as QuizCodeRecord
    return { status: 'found', code: normalized, quiz }
  }
  return { status: 'not-found', code: normalized }
}

function requireQuizOwner(user: User | null | undefined): User {
  if (!user || typeof user.uid !== 'string' || !user.uid) {
    throw new TypeError('An authenticated teacher is required')
  }
  return user
}

function randomCodeToken(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
}

export function validateQuizDraft(title: string, description: string, questions: QuizDraftQuestion[]): void {
  const trimmedTitle = title.trim()
  if (!trimmedTitle || trimmedTitle.length > QUIZ_LIMITS.maxTitleLength) {
    throw new TypeError(`Quiz title must be 1 to ${QUIZ_LIMITS.maxTitleLength} characters.`)
  }
  if (description.length > QUIZ_LIMITS.maxDescriptionLength) {
    throw new TypeError(`Quiz description must be at most ${QUIZ_LIMITS.maxDescriptionLength} characters.`)
  }
  if (questions.length < QUIZ_LIMITS.minQuestions || questions.length > QUIZ_LIMITS.maxQuestions) {
    throw new TypeError(`A quiz needs ${QUIZ_LIMITS.minQuestions} to ${QUIZ_LIMITS.maxQuestions} questions.`)
  }
  questions.forEach((question, index) => {
    const label = `Question ${index + 1}`
    if (!question.prompt.trim() || question.prompt.length > QUIZ_LIMITS.maxPromptLength) {
      throw new TypeError(`${label} needs a prompt of 1 to ${QUIZ_LIMITS.maxPromptLength} characters.`)
    }
    if (question.choices.length < QUIZ_LIMITS.minChoices || question.choices.length > QUIZ_LIMITS.maxChoices) {
      throw new TypeError(`${label} needs ${QUIZ_LIMITS.minChoices} to ${QUIZ_LIMITS.maxChoices} choices.`)
    }
    if (question.choices.some((choice) => !choice.trim() || choice.length > QUIZ_LIMITS.maxChoiceLength)) {
      throw new TypeError(`${label} has an empty or oversized choice.`)
    }
    const normalizedChoices = question.choices.map((choice) => choice.trim().toLowerCase())
    if (new Set(normalizedChoices).size !== normalizedChoices.length) {
      throw new TypeError(`${label} has duplicate choices.`)
    }
    if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex >= question.choices.length) {
      throw new TypeError(`${label} needs its correct answer marked.`)
    }
  })
}

function generateCode(): string {
  const token = randomCodeToken()
  return `${token.slice(0, 4)}-${token.slice(4)}`
}

/**
 * Creates a quiz atomically: the question set (no answers, readable by any signed-in
 * learner), the owner-only answer key, the join code, and the owner's quiz index.
 * Codes that collide with an existing code are regenerated and retried.
 */
export async function createQuiz(
  user: User | null | undefined,
  title: string,
  description: string,
  questions: QuizDraftQuestion[],
): Promise<CreatedQuiz> {
  const owner = requireQuizOwner(user)
  validateQuizDraft(title, description, questions)

  const quizId = `quiz_${crypto.randomUUID()}`
  const trimmedTitle = title.trim()
  const now = Date.now()
  const questionMap: Record<string, { prompt: string; choices: string[] }> = {}
  const correct: Record<string, number> = {}
  questions.forEach((question, index) => {
    const questionId = `q_${index}`
    questionMap[questionId] = {
      prompt: question.prompt.trim(),
      choices: question.choices.map((choice) => choice.trim()),
    }
    correct[questionId] = question.correctIndex
  })

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode()
    const existing = (await get(ref(database, `quizCodes/${code}`))).val()
    if (existing !== null) continue
    await update(ref(database), {
      [`quizzes/${quizId}`]: {
        id: quizId,
        ownerId: owner.uid,
        title: trimmedTitle,
        description: description.trim(),
        questionCount: questions.length,
        questions: questionMap,
        createdAt: now,
        updatedAt: now,
      },
      [`quizAnswers/${quizId}`]: { ownerId: owner.uid, correct },
      [`quizCodes/${code}`]: { quizId, ownerId: owner.uid, createdAt: now },
      [`quizzesByOwner/${owner.uid}/${quizId}`]: { code, title: trimmedTitle, createdAt: now },
    })
    return { quizId, code, title: trimmedTitle, createdAt: now }
  }
  throw new Error('Could not find a free quiz code. Try again.')
}

/** Reads the signed-in teacher's own quiz index for the hub list. */
export async function listOwnedQuizzes(uid: string): Promise<Array<{ quizId: string; code: string; title: string; createdAt: number }>> {
  const value: unknown = (await get(ref(database, `quizzesByOwner/${uid}`))).val()
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value as Record<string, unknown>)
    .filter((entry) => {
      const record = entry[1] as { code?: unknown; title?: unknown; createdAt?: unknown } | null
      return record !== null && typeof record.code === 'string' && typeof record.title === 'string' && typeof record.createdAt === 'number'
    })
    .map(([quizId, record]) => {
      const { code, title, createdAt } = record as { code: string; title: string; createdAt: number }
      return { quizId, code, title, createdAt }
    })
    .sort((left, right) => right.createdAt - left.createdAt)
}
