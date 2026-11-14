import { get, ref } from 'firebase/database'
import { database } from './firebase'

/**
 * Quiz-code helpers for the school quiz system. Codes are 4-4 alphanumeric
 * (`XXXX-XXXX`) so teacher-shared URLs like /quiz?code=ABCD-EFGH are easy to
 * type. Code lookups are schedule-free and award nothing — they only resolve
 * the code to a quiz reference.
 */

export interface QuizCodeRecord {
  quizId: string
  ownerId: string
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
