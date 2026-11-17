import { adminDatabase, requireUser } from '../../_lib/auth'
import { databaseWithDeadline } from '../../_lib/database'
import { errorResponse, InputError, jsonResult, readJson } from '../../_lib/http'
import { startQuizAttemptService } from '../../_lib/quiz-service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = await readJson(request)
    if (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).some((key) => !['quizId', 'sessionId', 'fullscreenStart'].includes(key))) {
      throw new InputError()
    }
    const input = body as { quizId?: unknown; sessionId?: unknown; fullscreenStart?: unknown }
    if (typeof input.quizId !== 'string' || typeof input.sessionId !== 'string' || !['not-requested', 'entered', 'unsupported', 'denied'].includes(String(input.fullscreenStart))) {
      throw new InputError()
    }
    const result = await startQuizAttemptService(databaseWithDeadline(adminDatabase()), user.uid, {
      quizId: input.quizId,
      sessionId: input.sessionId,
      attemptId: `att_${crypto.randomUUID()}`,
      fullscreenStart: input.fullscreenStart as 'not-requested' | 'entered' | 'unsupported' | 'denied',
    })
    return jsonResult(result)
  } catch (error) {
    return errorResponse(error)
  }
}
