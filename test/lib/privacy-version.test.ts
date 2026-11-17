import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// Import only the canonical account export; never initialize Firebase or load .env.local.
vi.mock('../../src/lib/firebase', () => ({ database: {} }))

import { PRIVACY_VERSION } from '../../src/lib/account'

const root = process.cwd()
const privacyVersionPattern = /privacy-\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*/g

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

function privacyVersions(path: string): string[] {
  return source(path).match(privacyVersionPattern) ?? []
}

describe('privacy-version configuration drift', () => {
  it('keeps every current source, config, rules, and documentation literal aligned with the account export', () => {
    const filesWithCurrentDefaults = [
      'src/lib/account.ts',
      'app/api/_lib/privacy.ts',
      'functions/src/config.ts',
      'functions/src/core-test-helpers.ts',
      'database.rules.json',
      'PRIVACY.md',
      'README.md',
      '.env.example',
    ]

    for (const path of filesWithCurrentDefaults) {
      const versions = privacyVersions(path)
      expect(versions.length, `${path} must declare the current privacy version`).toBeGreaterThan(0)
      expect(new Set(versions), `${path} contains a stale privacy-version literal`).toEqual(new Set([PRIVACY_VERSION]))
    }
  })

  it('keeps the Functions source/runtime and documented server environment contract deployable', () => {
    const firebaseConfig = JSON.parse(source('firebase.json')) as {
      functions?: { source?: unknown; runtime?: unknown; predeploy?: unknown }
    }
    const functionsPackage = JSON.parse(source('functions/package.json')) as {
      engines?: { node?: unknown }
    }
    const nodeMajor = functionsPackage.engines?.node

    expect(typeof nodeMajor).toBe('string')
    expect(firebaseConfig.functions).toEqual({
      source: 'functions',
      runtime: `nodejs${nodeMajor}`,
      predeploy: ['npm --prefix functions run build'],
    })

    const environmentExample = source('.env.example')
    expect(environmentExample).not.toMatch(/^\s*(?:export\s+)?(?:set\s+)?DOTENV_CONFIG_PATH\s*=/mi)
    for (const name of [
      'KOGNIT_PRIVACY_VERSION',
      'R2_ENDPOINT',
      'R2_BUCKET_NAME',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_PUBLIC_URL',
    ]) {
      const declarations = environmentExample.match(new RegExp(`^${name}=$`, 'gm')) ?? []
      expect(declarations, `${name} must appear exactly once without a committed value`).toHaveLength(1)
    }

    const readme = source('README.md')
    expect(readme).toContain('npm run deploy:functions')
    expect(readme).toContain('Node.js 22 Functions source from `functions/`')
  })
})
