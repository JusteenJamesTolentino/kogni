import { listPlayerDecksService } from '../../../../../functions/src/player-decks-core'
import { requireTargetUid } from '../../../../../functions/src/social-core'
import { adminDatabase, requireUser } from '../../../_lib/auth'
import { databaseWithDeadline } from '../../../_lib/database'
import { errorResponse, InputError, jsonResult } from '../../../_lib/http'
import { expectedPrivacyVersion } from '../../../_lib/privacy'

export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ uid: string }> }) {
  try {
    const user = await requireUser(request)
    const targetUid = requireTargetUid({ uid: (await context.params).uid })
    const params = new URL(request.url).searchParams
    if ([...params.keys()].some((key) => key !== 'cursor') || params.getAll('cursor').length > 1) throw new InputError()
    const cursor = params.get('cursor') ?? undefined
    const page = await listPlayerDecksService(
      databaseWithDeadline(adminDatabase()),
      user.uid,
      targetUid,
      expectedPrivacyVersion(),
      cursor,
    )
    return jsonResult(page)
  } catch (error) {
    return errorResponse(error)
  }
}
