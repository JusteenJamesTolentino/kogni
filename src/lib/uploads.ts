import type { User } from 'firebase/auth'
import { authenticatedRequest, ApiRequestError } from './vercel-api'
import { isRecord } from './errors'

/** Client-side mirror of the server avatar constraints, for instant feedback before upload. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024
export const AVATAR_CONTENT_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']

export interface UploadedAvatar {
  url: string
  path: string
  updatedAt: number
}

interface AvatarPresignResponse {
  key: string
  uploadUrl: string
  publicUrl: string
  expiresIn: number
}

function isAvatarPresign(value: unknown): value is AvatarPresignResponse {
  return isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.uploadUrl === 'string' &&
    typeof value.publicUrl === 'string' &&
    typeof value.expiresIn === 'number'
}

function isUploadedAvatar(value: unknown): value is UploadedAvatar {
  return isRecord(value) &&
    typeof value.url === 'string' &&
    typeof value.path === 'string' &&
    typeof value.updatedAt === 'number'
}

function validateAvatarFile(file: File): void {
  if (!AVATAR_CONTENT_TYPES.includes(file.type)) {
    throw new Error('Avatars must be JPEG, PNG, or WebP images.')
  }
  if (file.size < 1 || file.size > MAX_AVATAR_BYTES) {
    throw new Error(`Avatars must be smaller than ${Math.floor(MAX_AVATAR_BYTES / 1024 / 1024)} MB.`)
  }
}

/**
 * Uploads an avatar straight to cloud storage via a presigned PUT and commits the new
 * object on the account; the server deletes the replaced avatar object.
 */
export async function uploadAvatar(user: User, file: File, signal?: AbortSignal): Promise<UploadedAvatar> {
  validateAvatarFile(file)
  const presign = await authenticatedRequest('/api/uploads/avatar', isAvatarPresign, {
    method: 'POST',
    body: { contentType: file.type, sizeBytes: file.size },
    signal,
  })

  // The presigned URL is scope-limited and self-authenticating; extra headers
  // (like our Authorization bearer) must not be sent alongside it.
  const putResponse = await fetch(presign.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'content-type': file.type },
    signal,
  })
  if (!putResponse.ok) {
    throw new ApiRequestError('The avatar upload was rejected by storage. Try again.', 'http-error', putResponse.status)
  }

  return authenticatedRequest('/api/uploads/avatar/commit', isUploadedAvatar, {
    method: 'POST',
    body: { key: presign.key },
    signal,
    timeoutMs: 30_000,
  })
}
