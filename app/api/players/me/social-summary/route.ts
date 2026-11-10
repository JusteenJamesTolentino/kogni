import { getSocialSummaryService } from '../../../../../functions/src/social-core'
import { adminDatabase, requireUser } from '../../../_lib/auth'
import { databaseWithDeadline } from '../../../_lib/database'
import { errorResponse, jsonResult } from '../../../_lib/http'
import { expectedPrivacyVersion } from '../../../_lib/privacy'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const summary = await getSocialSummaryService(
      databaseWithDeadline(adminDatabase()),
      user.uid,
      expectedPrivacyVersion(),
    )
    return jsonResult(summary)
  } catch (error) {
    return errorResponse(error)
  }
}
