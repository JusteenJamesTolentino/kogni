import { listOwnerDecksService } from '../../../functions/src/owner-decks-core'
import { adminDatabase, requireUser } from '../_lib/auth'
import { databaseWithDeadline } from '../_lib/database'
import { errorResponse, InputError, jsonResult } from '../_lib/http'
import { expectedPrivacyVersion } from '../_lib/privacy'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const params = new URL(request.url).searchParams
    if ([...params.keys()].some((key) => key !== 'cursor') || params.getAll('cursor').length > 1) throw new InputError()
    return jsonResult(await listOwnerDecksService(databaseWithDeadline(adminDatabase()), user.uid, expectedPrivacyVersion(), params.get('cursor') ?? undefined))
  } catch (error) {
    return errorResponse(error)
  }
}
