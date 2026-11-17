import { adminDatabase, requireUser } from '../../../../../_lib/auth'
import { databaseWithDeadline } from '../../../../../_lib/database'
import { errorResponse, jsonResult } from '../../../../../_lib/http'
import { getIntegrityReviewService } from '../../../../../_lib/quiz-service'

export const runtime = 'nodejs'

interface SignalsRouteContext {
  params: Promise<{ quizId: string; uid: string }>
}

export async function GET(request: Request, context: SignalsRouteContext) {
  try {
    const user = await requireUser(request)
    const { quizId, uid } = await context.params
    return jsonResult(await getIntegrityReviewService(databaseWithDeadline(adminDatabase()), user.uid, quizId, uid))
  } catch (error) {
    return errorResponse(error)
  }
}
