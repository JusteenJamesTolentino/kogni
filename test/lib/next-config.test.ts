import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'
import vercelConfig from '../../vercel.json'

const PUBLIC_FIREBASE_KEYS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_DATABASE_URL',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
]

describe('Next.js migration configuration', () => {
  it('embeds only explicitly public Firebase web configuration', () => {
    expect(Object.keys(nextConfig.env ?? {}).sort()).toEqual([...PUBLIC_FIREBASE_KEYS].sort())
    expect(nextConfig.env).not.toHaveProperty('FIREBASE_PRIVATE_KEY')
    expect(nextConfig.env).not.toHaveProperty('FIREBASE_CLIENT_EMAIL')
  })

  it('preserves API routes before applying the browser fallback', async () => {
    const rewrites = await nextConfig.rewrites!()
    expect(Array.isArray(rewrites)).toBe(false)
    if (Array.isArray(rewrites)) throw new Error('Browser rewrites must run after dynamic API routes')
    expect(rewrites.beforeFiles).toEqual([])
    expect(rewrites.afterFiles).toEqual([])
    expect(rewrites.fallback).toEqual([
      { source: '/:path((?!api(?:/|$)|_next(?:/|$)).*)', destination: '/' },
    ])
    const browserPath = /^(?!api(?:\/|$)|_next(?:\/|$)).*$/
    for (const path of ['api', 'api/players/online', 'api/players/test-user', '_next/static/test.js']) {
      expect(browserPath.test(path)).toBe(false)
    }
    for (const path of ['community', 'players/test-user', 'decks/example/study/due']) {
      expect(browserPath.test(path)).toBe(true)
    }
  })

  it('uses Vercel Next.js detection instead of a static index rewrite', () => {
    expect(vercelConfig).toEqual({ framework: 'nextjs' })
  })
})
