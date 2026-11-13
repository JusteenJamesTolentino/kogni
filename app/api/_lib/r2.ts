import 'server-only'
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { AVATAR_CONTENT_TYPES, buildAvatarKey, MAX_AVATAR_BYTES } from './r2-keys'

export { AVATAR_CONTENT_TYPES, buildAvatarKey, isOwnedAvatarKey, KOGNI_PREFIX, MAX_AVATAR_BYTES } from './r2-keys'

const PRESIGN_EXPIRY_SECONDS = 600

export class R2ConfigurationError extends Error {
  constructor() {
    super('Cloud storage is not configured correctly.')
    this.name = 'R2ConfigurationError'
  }
}

interface R2Environment {
  endpoint: string
  bucket: string
  publicBaseUrl: string
  accessKeyId: string
  secretAccessKey: string
}

function readR2Environment(environment: Record<string, string | undefined>): R2Environment {
  const endpoint = environment.R2_ENDPOINT?.trim() ?? ''
  const bucket = environment.R2_BUCKET_NAME?.trim() ?? ''
  const publicBaseUrl = environment.R2_PUBLIC_URL?.trim().replace(/\/+$/, '') ?? ''
  const accessKeyId = environment.R2_ACCESS_KEY_ID?.trim() ?? ''
  const secretAccessKey = environment.R2_SECRET_ACCESS_KEY?.trim() ?? ''
  if (!/^https:\/\/[a-z0-9.-]+(?:\/[a-z0-9.-]+)*$/.test(endpoint) || !/^[a-z0-9][a-z0-9._-]{2,62}$/i.test(bucket) || !/^https:\/\/[a-z0-9.-]+(?:\/[a-z0-9.-]+)*$/.test(publicBaseUrl) || !accessKeyId || !secretAccessKey) {
    throw new R2ConfigurationError()
  }
  return { endpoint, bucket, publicBaseUrl, accessKeyId, secretAccessKey }
}

let cachedClient: { client: S3Client; bucket: string; publicBaseUrl: string } | null = null

function r2(): { client: S3Client; bucket: string; publicBaseUrl: string } {
  if (!cachedClient) {
    const { endpoint, bucket, publicBaseUrl, accessKeyId, secretAccessKey } = readR2Environment(process.env)
    cachedClient = {
      client: new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } }),
      bucket,
      publicBaseUrl,
    }
  }
  return cachedClient
}

export function publicUrlForKey(key: string): string {
  const { publicBaseUrl } = r2()
  return `${publicBaseUrl}/${key}`
}

export interface AvatarPresign {
  key: string
  uploadUrl: string
  publicUrl: string
  expiresIn: number
}

export async function presignAvatarUpload(uid: string, contentType: string, sizeBytes: number): Promise<AvatarPresign> {
  if (!AVATAR_CONTENT_TYPES[contentType]) throw new TypeError('Unsupported avatar content type')
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_AVATAR_BYTES) {
    throw new RangeError(`Avatar must be between 1 and ${MAX_AVATAR_BYTES} bytes`)
  }
  const { client, bucket } = r2()
  const key = buildAvatarKey(uid, contentType)
  // Only Content-Type and Content-Length are pinned: every signed header must be sent
  // verbatim by the browser, and the bucket CORS allowlist covers just Content-Type —
  // adding e.g. Cache-Control here would break the preflight for the browser PUT.
  const uploadUrl = await getSignedUrl(client, new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: sizeBytes,
  }), { expiresIn: PRESIGN_EXPIRY_SECONDS })
  return { key, uploadUrl, publicUrl: publicUrlForKey(key), expiresIn: PRESIGN_EXPIRY_SECONDS }
}

export async function headStoredObject(key: string): Promise<{ sizeBytes: number; contentType: string } | null> {
  const { client, bucket } = r2()
  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType ?? '' }
  } catch (error) {
    const code = error !== null && typeof error === 'object' && 'name' in error ? String(error.name) : ''
    if (code === 'NotFound' || code === 'NoSuchKey' || code === '404') return null
    throw error
  }
}

export async function deleteStoredObject(key: string): Promise<void> {
  const { client, bucket } = r2()
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}
