import { adminDatabase, requireUser } from '../../../_lib/auth'
import { errorResponse, InputError, jsonResult, readJson } from '../../../_lib/http'
import { deleteStoredObject, headStoredObject, publicUrlForKey } from '../../../_lib/r2'
import { isOwnedAvatarKey } from '../../../_lib/r2-keys'

export const runtime = 'nodejs'

/**
 * Finalizes an avatar upload: verifies the object landed in the caller's `kogni/avatars/<uid>/`
 * scope, deletes the previous avatar object to keep storage flat, and records the avatar on
 * the account. The client never supplies the URL — it is derived from the verified key.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = await readJson(request)
    if (typeof body !== 'object' || body === null) throw new InputError()
    const { key } = body as { key?: unknown }
    if (typeof key !== 'string' || !isOwnedAvatarKey(user.uid, key)) throw new InputError()
    const stored = await headStoredObject(key)
    if (!stored || stored.sizeBytes < 1) throw new InputError()

    const url = publicUrlForKey(key)
    const database = adminDatabase()
    const previous = (await database.ref(`accounts/${user.uid}/avatar`).get()).val() as unknown
    const previousPath = typeof previous === 'object' && previous !== null && typeof (previous as { path?: unknown }).path === 'string'
      ? (previous as { path: string }).path
      : ''

    const updatedAt = Date.now()
    await database.ref(`accounts/${user.uid}`).update({ avatar: { url, path: key, updatedAt } })

    // Best-effort cleanup: the new avatar is already recorded, so a failed delete of the
    // superseded object only leaves one orphan, never a broken profile.
    if (previousPath && previousPath !== key && isOwnedAvatarKey(user.uid, previousPath)) {
      try {
        await deleteStoredObject(previousPath)
      } catch {
        // Superseded object stays in storage; the next replacement retries the delete.
      }
    }

    return jsonResult({ url, path: key, updatedAt })
  } catch (error) {
    return errorResponse(error)
  }
}
