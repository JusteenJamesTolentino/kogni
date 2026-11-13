import { getPlayerPresenceService } from '../../../../../functions/src/discovery-core'
import { requireTargetUid } from '../../../../../functions/src/social-core'
import { adminDatabase, requireUser } from '../../../_lib/auth'
import { databaseWithDeadline } from '../../../_lib/database'
import { errorResponse, jsonResult } from '../../../_lib/http'
import { expectedPrivacyVersion } from '../../../_lib/privacy'

export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ uid: string }> }) {
  try {
    const user = await requireUser(request)
    const targetUid = requireTargetUid({ uid: (await context.params).uid })
    return jsonResult(await getPlayerPresenceService(databaseWithDeadline(adminDatabase()), user.uid, targetUid, expectedPrivacyVersion()))
  } catch (error) { return errorResponse(error) }
}
