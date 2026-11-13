import { listOnlinePlayersService } from '../../../../functions/src/discovery-core'
import { adminDatabase, requireUser } from '../../_lib/auth'
import { databaseWithDeadline } from '../../_lib/database'
import { errorResponse, InputError, jsonResult } from '../../_lib/http'
import { expectedPrivacyVersion } from '../../_lib/privacy'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const params = new URL(request.url).searchParams
    if ([...params.keys()].some((key) => key !== 'after') || params.getAll('after').length > 1) throw new InputError()
    const after = params.get('after') ?? undefined
    const page = await listOnlinePlayersService(databaseWithDeadline(adminDatabase()), user.uid, expectedPrivacyVersion(), after)
    return jsonResult({ items: page.items, hasMore: page.hasMore })
  } catch (error) { return errorResponse(error) }
}
