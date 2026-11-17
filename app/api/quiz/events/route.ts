import { adminDatabase, requireUser } from '../../_lib/auth'
import { databaseWithDeadline } from '../../_lib/database'
import { errorResponse, InputError, jsonResult, readJson } from '../../_lib/http'
import { recordIntegrityEventsService } from '../../_lib/quiz-service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = await readJson(request)
    if (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).some((key) => !['quizId', 'attemptId', 'sessionId', 'events'].includes(key))) {
      throw new InputError()
    }
    const input = body as Record<string, unknown>
    if (typeof input.quizId !== 'string' || typeof input.attemptId !== 'string' || typeof input.sessionId !== 'string') throw new InputError()
    const result = await recordIntegrityEventsService(databaseWithDeadline(adminDatabase()), user.uid, {
      quizId: input.quizId,
      attemptId: input.attemptId,
      sessionId: input.sessionId,
      events: input.events,
    })
    return jsonResult(result)
  } catch (error) {
    return errorResponse(error)
  }
}
