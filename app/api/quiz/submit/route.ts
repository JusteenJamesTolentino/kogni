import { adminDatabase, requireUser } from '../../_lib/auth'
import { databaseWithDeadline } from '../../_lib/database'
import { errorResponse, InputError, jsonResult, readJson } from '../../_lib/http'
import {
  QUIZ_ID_PATTERN,
  readStoredAttempt,
  requireQuizAccount,
} from '../../_lib/quiz-service'
import { buildCompletedAttemptResult } from '../../../../functions/src/quiz-core'

export const runtime = 'nodejs'

/**
 * Compatibility endpoint for older browser bundles. It can only return a result that
 * already exists; new attempts must use /start and /answer so deadlines cannot be bypassed.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = await readJson(request)
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new InputError()
    const fields = Object.keys(body)
    if (fields.length < 1 || fields.some((key) => key !== 'quizId' && key !== 'answers')) throw new InputError()
    if ('answers' in body && (typeof body.answers !== 'object' || body.answers === null || Array.isArray(body.answers))) throw new InputError()
    const quizId = (body as { quizId?: unknown }).quizId
    if (typeof quizId !== 'string' || !QUIZ_ID_PATTERN.test(quizId)) throw new InputError()

    const database = databaseWithDeadline(adminDatabase())
    await requireQuizAccount(database, user.uid)
    const stored = await readStoredAttempt(database, quizId, user.uid)
    if (!stored || ('status' in stored && stored.status === 'active')) {
      return jsonResult({ error: 'Start or resume this quiz in the current Kogni app.' }, { status: 409 })
    }
    const result = buildCompletedAttemptResult(stored)
    if (!result) throw new InputError()
    return jsonResult({ status: 'already', result })
  } catch (error) {
    return errorResponse(error)
  }
}
