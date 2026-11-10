import { followPlayerService, requireTargetUid } from '../../../../functions/src/social-core'
import { adminDatabase, requireUser } from '../../_lib/auth'
import { databaseWithDeadline } from '../../_lib/database'
import { errorResponse, jsonResult, readJson } from '../../_lib/http'
import { expectedPrivacyVersion } from '../../_lib/privacy'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const targetUid = requireTargetUid(await readJson(request))
    return jsonResult(await followPlayerService(databaseWithDeadline(adminDatabase()), user.uid, targetUid, expectedPrivacyVersion()))
  } catch (error) { return errorResponse(error) }
}
