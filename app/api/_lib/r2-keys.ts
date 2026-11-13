/**
 * Pure R2 key-scope helpers. Every object key is forced under the `kogni/` prefix so the
 * bucket stays shareable with non-Kogni content and storage use is measurable per scope.
 * Kept free of server-only/AWS imports so it is unit-testable.
 */
export const KOGNI_PREFIX = 'kogni/'
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024
export const AVATAR_CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
})
const AVATAR_RANDOM_BYTES = 16
const UID_PATTERN = /^[^.#$[\]/\s]{1,128}$/

function randomToken(): string {
  const bytes = new Uint8Array(AVATAR_RANDOM_BYTES)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Builds the storage key for one avatar object: `kogni/avatars/<uid>/<token>.<ext>`.
 * The uid segment keeps ownership checks a pure prefix test at commit time.
 */
export function buildAvatarKey(uid: string, contentType: string, randomHex = randomToken()): string {
  const extension = AVATAR_CONTENT_TYPES[contentType]
  if (!extension) throw new TypeError('Unsupported avatar content type')
  const normalizedUid = uid.trim()
  if (!UID_PATTERN.test(normalizedUid)) throw new TypeError('Invalid avatar owner id')
  return `${KOGNI_PREFIX}avatars/${normalizedUid}/${randomHex}.${extension}`
}

/** Returns true only when the key is this user's avatar object: `kogni/avatars/<uid>/<token>.<ext>`. */
export function isOwnedAvatarKey(uid: string, key: string): boolean {
  const normalizedUid = uid.trim()
  if (!normalizedUid || !UID_PATTERN.test(normalizedUid)) return false
  const scope = `avatars/${normalizedUid}/`
  if (!key.startsWith(KOGNI_PREFIX) || key.includes('..')) return false
  const remainder = key.slice(KOGNI_PREFIX.length)
  return remainder.startsWith(scope) && /^[0-9a-f]{32}\.(?:jpg|png|webp)$/.test(remainder.slice(scope.length))
}
