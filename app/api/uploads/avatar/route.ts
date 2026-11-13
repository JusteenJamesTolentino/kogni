import { requireUser } from '../../_lib/auth'
import { errorResponse, InputError, jsonResult, readJson } from '../../_lib/http'
import { presignAvatarUpload } from '../../_lib/r2'
import { AVATAR_CONTENT_TYPES, MAX_AVATAR_BYTES } from '../../_lib/r2-keys'

export const runtime = 'nodejs'

/** Issues a short-lived presigned PUT into the caller's `kogni/avatars/<uid>/` scope. */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = await readJson(request)
    if (typeof body !== 'object' || body === null) throw new InputError()
    const { contentType, sizeBytes } = body as { contentType?: unknown; sizeBytes?: unknown }
    if (typeof contentType !== 'string' || !AVATAR_CONTENT_TYPES[contentType]) throw new InputError()
    if (typeof sizeBytes !== 'number' || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_AVATAR_BYTES) throw new InputError()
    return jsonResult(await presignAvatarUpload(user.uid, contentType, sizeBytes))
  } catch (error) {
    return errorResponse(error)
  }
}
