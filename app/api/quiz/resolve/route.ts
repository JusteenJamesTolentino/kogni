import { adminDatabase, requireUser } from '../../_lib/auth'
import { databaseWithDeadline } from '../../_lib/database'
import { errorResponse, InputError, jsonResult, readJson } from '../../_lib/http'
import { resolveQuizCodeService } from '../../_lib/quiz-service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = await readJson(request)
    if (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).length !== 1 || !('code' in body)) {
      throw new InputError()
    }
    const code = (body as { code?: unknown }).code
    if (typeof code !== 'string') throw new InputError()
    return jsonResult(await resolveQuizCodeService(databaseWithDeadline(adminDatabase()), user.uid, code))
  } catch (error) {
    return errorResponse(error)
  }
}
