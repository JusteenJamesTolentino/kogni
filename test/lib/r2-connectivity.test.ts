import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { AVATAR_CACHE_CONTROL, buildAvatarKey, KOGNI_PREFIX } from '../../app/api/_lib/r2-keys'

/**
 * Live Cloudflare R2 connectivity smoke test. Performs a full avatar-shaped round trip
 * (presign → PUT → HEAD → public GET → DELETE) against the real bucket and verifies
 * public-URL delivery. Skips automatically when R2 credentials are not configured, so
 * CI without storage secrets stays green.
 *
 * Run with: npm test (requires R2_* values in .env.local)
 */

interface R2TestConfig {
  endpoint: string
  bucket: string
  publicBaseUrl: string
  accessKeyId: string
  secretAccessKey: string
}

/** Minimal .env.local reader — Vitest does not load Next.js env files on its own. */
function loadR2Config(): R2TestConfig | null {
  const file = join(process.cwd(), '.env.local')
  let contents: string
  try {
    contents = readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const values = new Map<string, string>()
  for (const line of contents.split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue
    const assignment = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!assignment) continue
    values.set(assignment[1]!.toUpperCase(), assignment[2]!.replace(/^["']|["']$/g, ''))
  }
  const endpoint = values.get('R2_ENDPOINT') ?? ''
  const bucket = values.get('R2_BUCKET_NAME') ?? ''
  const publicBaseUrl = values.get('R2_PUBLIC_URL') ?? ''
  const accessKeyId = values.get('R2_ACCESS_KEY_ID') ?? ''
  const secretAccessKey = values.get('R2_SECRET_ACCESS_KEY') ?? ''
  if (!endpoint || !bucket || !publicBaseUrl || !accessKeyId || !secretAccessKey) return null
  return { endpoint, bucket, publicBaseUrl, accessKeyId, secretAccessKey }
}

/** Only public https hosts without credentials in the URL may be fetched from a test. */
function isSafePublicUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return false
    const hostname = url.hostname.toLowerCase()
    if (hostname === 'localhost' || hostname === '::1' || hostname.endsWith('.local') || hostname.endsWith('.internal')) return false
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false // no raw IPv4 (covers private ranges)
    if (hostname.includes(':')) return false // no IPv6 literals
    return true
  } catch {
    return false
  }
}

const config = loadR2Config()
const suite = config ? describe : describe.skip

/**
 * Live tests are environment-sensitive: corporate VPNs (e.g. Cloudflare WARP tunnels),
 * offline dev machines, or DNS hiccups can make the public host unreachable without
 * any code being wrong. Probe once and skip the suite instead of failing the build.
 */
let networkReachable: boolean | null = null

async function probeNetwork(): Promise<boolean> {
  if (networkReachable !== null) return networkReachable
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const response = await fetch(config!.publicBaseUrl, { method: 'HEAD', signal: controller.signal })
    clearTimeout(timer)
    networkReachable = response.status < 500
  } catch {
    networkReachable = false
  }
  return networkReachable
}

/** A valid 1×1 transparent PNG (67 bytes) — enough to satisfy a real object write. */
const TINY_PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (character) => character.charCodeAt(0))

suite('Cloudflare R2 storage connectivity', () => {
  const client = new S3Client({
    region: 'auto',
    endpoint: config!.endpoint,
    credentials: { accessKeyId: config!.accessKeyId, secretAccessKey: config!.secretAccessKey },
  })

  it('round-trips an avatar-shaped object through the kogni/ prefix', async (ctx) => {
    if (!await probeNetwork()) ctx.skip()
    const key = buildAvatarKey('connectivity-test-uid', 'image/png')
    expect(key.startsWith(`${KOGNI_PREFIX}avatars/`)).toBe(true)

    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({
      Bucket: config!.bucket,
      Key: key,
      ContentType: 'image/png',
      ContentLength: TINY_PNG.length,
      CacheControl: AVATAR_CACHE_CONTROL,
    }), { expiresIn: 120 })
    expect(isSafePublicUrl(uploadUrl)).toBe(true)

    // The browser-shaped PUT must succeed with exactly the signed headers.
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      body: TINY_PNG,
      headers: { 'content-type': 'image/png', 'cache-control': AVATAR_CACHE_CONTROL },
    })
    expect(put.status).toBe(200)

    const head = await client.send(new HeadObjectCommand({ Bucket: config!.bucket, Key: key }))
    expect(head.ContentLength).toBe(TINY_PNG.length)
    expect(head.ContentType).toBe('image/png')
    expect(head.CacheControl).toBe(AVATAR_CACHE_CONTROL)

    const objectUrl = `${config!.publicBaseUrl}/${key}`
    expect(isSafePublicUrl(objectUrl)).toBe(true)
    const publicRead = await fetch(objectUrl, { method: 'GET' })
    expect(publicRead.status).toBe(200)
    expect(Buffer.from(await publicRead.arrayBuffer()).equals(Buffer.from(TINY_PNG))).toBe(true)

    // No leftovers: the round trip cleans up after itself.
    await client.send(new DeleteObjectCommand({ Bucket: config!.bucket, Key: key }))
    const gone = await client.send(new HeadObjectCommand({ Bucket: config!.bucket, Key: key })).then(() => true, (error: unknown) => {
      const name = error !== null && typeof error === 'object' && 'name' in error ? String(error.name) : ''
      if (name === 'NotFound' || name === 'NoSuchKey' || name === '404') return false
      throw error
    })
    expect(gone).toBe(false)
  })

  it('serves known public objects with an image content type', async (ctx) => {
    if (!await probeNetwork()) ctx.skip()
    // Existing object committed through the public custom domain (verified manually 2026-11-14).
    const knownObjectUrl = `${config!.publicBaseUrl}/public/file_0000000007508211b4946faf91859f0c.png`
    expect(isSafePublicUrl(knownObjectUrl)).toBe(true)
    const response = await fetch(knownObjectUrl, { method: 'GET' })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    await response.body?.cancel()
  })
})
