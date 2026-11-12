import { generateKeyPairSync } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const sdk = vi.hoisted(() => ({ apps: [] as { name: string }[], initialize: vi.fn(), cert: vi.fn(), getAuth: vi.fn(), getDatabase: vi.fn() }))
vi.mock('firebase-admin/app', () => ({ getApps: () => sdk.apps, initializeApp: sdk.initialize, cert: sdk.cert }))
vi.mock('firebase-admin/auth', () => ({ getAuth: sdk.getAuth }))
vi.mock('firebase-admin/database', () => ({ getDatabase: sdk.getDatabase }))

import { AdminConfigurationError, getAdminApp, validateAdminEnvironment } from '../../../src/lib/firebase-admin'
import { requireUser } from '../_lib/auth'
import { databaseWithDeadline, withTimeout } from '../_lib/database'
import { errorResponse } from '../_lib/http'

const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const synthetic = () => ({
  FIREBASE_PROJECT_ID: 'demo-kognit-tests', FIREBASE_CLIENT_EMAIL: 'tester@demo-kognit-tests.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: privateKey, FIREBASE_DATABASE_URL: 'https://demo-kognit-tests-default-rtdb.firebaseio.com',
})

beforeEach(() => {
  sdk.apps.length = 0
  sdk.initialize.mockReset()
  sdk.cert.mockReset()
  sdk.getAuth.mockReset()
  sdk.getDatabase.mockReset()
  // Replace, rather than inspect, the inherited environment; never load .env secrets.
  vi.stubGlobal('process', { ...process, env: {} })
})

describe('Admin configuration', () => {
  it('accepts synthetic escaped/newline PEM and regional Firebase root URLs', () => {
    const config = validateAdminEnvironment({ ...synthetic(), FIREBASE_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n') })
    expect(config.privateKey).toBe(privateKey.trim())
    expect(validateAdminEnvironment({ ...synthetic(), FIREBASE_DATABASE_URL: 'https://demo-test.europe-west1.firebasedatabase.app/' }).databaseURL).toMatch(/^https:/)
  })

  it('sanitizes missing/invalid credentials and rejects non-Firebase, local/private or anomalous URLs', async () => {
    for (const field of Object.keys(synthetic())) {
      expect(() => validateAdminEnvironment({ ...synthetic(), [field]: '' })).toThrow(AdminConfigurationError)
    }
    for (const url of ['http://demo-test.firebaseio.com', 'https://127.0.0.1', 'https://10.0.0.1', 'https://[::1]', 'https://localhost', 'https://example.test', 'https://demo-test.firebaseio.com.evil.test', 'https://user:password@demo-test.firebaseio.com', 'https://demo-test.firebaseio.com/path', 'https://demo-test.firebaseio.com?ns=x', 'https://demo-test.firebaseio.com#x', 'https://demo-test.firebaseio.com:444']) {
      expect(() => validateAdminEnvironment({ ...synthetic(), FIREBASE_DATABASE_URL: url })).toThrow(AdminConfigurationError)
    }
    const sensitive = 'synthetic-private-secret-marker'
    let error: unknown
    try { validateAdminEnvironment({ ...synthetic(), FIREBASE_PRIVATE_KEY: sensitive }) } catch (value) { error = value }
    const response = errorResponse(error)
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain(sensitive)
    expect(() => validateAdminEnvironment({ ...synthetic(), FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9002' })).toThrow(AdminConfigurationError)
  })

  it('reuses only its named app, never a browser/unrelated app', () => {
    const unrelated = { name: '[DEFAULT]' }
    const server = { name: 'kognit-next-admin' }
    sdk.apps.push(unrelated)
    vi.stubGlobal('process', { ...process, env: synthetic() })
    sdk.initialize.mockImplementation(() => { sdk.apps.push(server); return server })
    expect(getAdminApp()).toBe(server)
    expect(getAdminApp()).toBe(server)
    expect(sdk.initialize).toHaveBeenCalledTimes(1)
    expect(sdk.initialize.mock.calls[0]?.[1]).toBe('kognit-next-admin')
  })
})

describe('auth and database errors', () => {
  it('maps missing/malformed/non-bearer auth to 401 before initializing Admin', async () => {
    for (const authorization of [undefined, '', 'Basic token', 'Bearer', 'Bearer token extra']) {
      const request = new Request('http://test.local/api', { headers: authorization ? { authorization } : {} })
      const error = await requireUser(request).catch((value: unknown) => value)
      expect(errorResponse(error).status).toBe(401)
    }
    expect(sdk.initialize).not.toHaveBeenCalled()
  })

  it('maps expired/invalid bearer to 401, missing config to 503 and SDK credentials failures to sanitized 503', async () => {
    const request = new Request('http://test.local/api', { headers: { authorization: 'Bearer synthetic-token' } })
    expect(errorResponse(await requireUser(request).catch((value: unknown) => value)).status).toBe(503)
    sdk.apps.push({ name: 'kognit-next-admin' })
    const verifyIdToken = vi.fn().mockRejectedValue({ code: 'auth/id-token-expired', message: 'secret-detail' })
    sdk.getAuth.mockReturnValue({ verifyIdToken })
    expect(errorResponse(await requireUser(request).catch((value: unknown) => value)).status).toBe(401)
    verifyIdToken.mockRejectedValue({ code: 'app/invalid-credential', message: 'secret-detail' })
    const response = errorResponse(await requireUser(request).catch((value: unknown) => value))
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('secret-detail')
  })

  it('bounds hung reads and prevents new operations after the deadline', async () => {
    await expect(withTimeout(() => new Promise(() => {}), 5)).rejects.toThrow('Player service is unavailable.')
    const get = vi.fn(() => new Promise(() => {}))
    const ref = { get, orderByKey() { return this }, limitToFirst() { return this } }
    const database = databaseWithDeadline({ ref: () => ref } as never, 5)
    await expect(database.ref('presenceSessions').orderByKey().limitToFirst(100).get()).rejects.toThrow('Player service is unavailable.')
    await expect(database.ref('accounts/alice').get()).rejects.toThrow('Player service is unavailable.')
    expect(get).toHaveBeenCalledTimes(1)
  })
})
