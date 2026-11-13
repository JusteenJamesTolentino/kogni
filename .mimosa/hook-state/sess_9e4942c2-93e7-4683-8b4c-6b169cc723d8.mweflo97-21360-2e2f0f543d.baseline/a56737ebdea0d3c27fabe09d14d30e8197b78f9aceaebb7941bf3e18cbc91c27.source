import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { metadata } from '../../app/layout'
import packageMetadata from '../../package.json'
import packageLock from '../../package-lock.json'
import functionsPackageMetadata from '../../functions/package.json'

const root = process.cwd()

function source(path: string): string {
  return readFileSync(`${root}/${path}`, 'utf8')
}

describe('Kogni brand migration', () => {
  it('uses the Kogni display brand in browser metadata and primary navigation', () => {
    expect(metadata.title).toBe('Kogni — Learn once. Remember longer.')
    expect(source('src/components/Navbar.tsx')).toContain('<span>Kogni</span>')
    expect(source('src/components/SignInScreen.tsx')).toContain('New to Kogni?')
    expect(source('src/router/LoadingScreen.tsx')).toContain('Kogni')
  })

  it('renames private package metadata and pins the compatible Firebase Admin runtime', () => {
    expect(packageMetadata.name).toBe('kogni')
    expect(packageMetadata.engines).toEqual({ node: '22.x' })
    expect(packageMetadata.dependencies['firebase-admin']).toBe('13.7.0')
    const packages = packageLock.packages as Record<string, { version?: string }>
    expect(packages['node_modules/firebase-admin']?.version).toBe('13.7.0')
    expect(packages['node_modules/jwks-rsa']?.version).toBe('3.2.2')
    expect(packages['node_modules/jose']?.version).toBe('4.15.9')
    expect(functionsPackageMetadata.name).toBe('kogni-functions')
  })

  it('preserves stable storage, cache, server and deployment identifiers', () => {
    expect(source('src/routes/AppShell.tsx')).toContain("'kognit_theme'")
    expect(source('src/lib/leaderboard.ts')).toContain("'kognit_leaderboard_review_events'")
    expect(source('public/sw.js')).toContain("'kognit-shell-v1'")
    expect(source('src/lib/firebase-admin.ts')).toContain("'kognit-next-admin'")
    expect(source('app/api/health/route.ts')).toContain("'kognit-api'")
    expect(source('app/api/_lib/privacy.ts')).toContain('KOGNIT_PRIVACY_VERSION')
    expect(source('src/lib/firebase.ts')).toContain("'kogni-ai'")
  })
})
