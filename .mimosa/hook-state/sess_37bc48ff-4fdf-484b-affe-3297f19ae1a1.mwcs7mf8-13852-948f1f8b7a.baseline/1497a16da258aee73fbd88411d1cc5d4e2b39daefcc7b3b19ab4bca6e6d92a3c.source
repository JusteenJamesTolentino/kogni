import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  initializeApp: vi.fn((config: unknown) => ({ config })),
  getApp: vi.fn(() => ({ existing: true })),
  getApps: vi.fn(() => [] as unknown[]),
  provider: { setCustomParameters: vi.fn() },
}))
vi.mock('firebase/app', () => ({ initializeApp: mocks.initializeApp, getApp: mocks.getApp, getApps: mocks.getApps }))
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  GoogleAuthProvider: class { setCustomParameters = mocks.provider.setCustomParameters },
}))
vi.mock('firebase/database', () => ({ getDatabase: vi.fn(() => ({})) }))
vi.mock('firebase/analytics', () => ({ isSupported: vi.fn().mockResolvedValue(false), getAnalytics: vi.fn() }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('Next browser Firebase environment configuration', () => {
  it('initializes with direct NEXT_PUBLIC Firebase values without relying on Vite env', async () => {
    const values = {
      NEXT_PUBLIC_FIREBASE_API_KEY: 'browser-test-key',
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
      NEXT_PUBLIC_FIREBASE_DATABASE_URL: 'https://test.example.test',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'test-project',
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'test.firebasestorage.app',
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123',
      NEXT_PUBLIC_FIREBASE_APP_ID: 'test-app',
      NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: 'test-measurement',
    }
    for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value)
    await import('../../src/lib/firebase')
    expect(mocks.initializeApp).toHaveBeenCalledWith({
      apiKey: values.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: values.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      databaseURL: values.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
      projectId: values.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: values.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: values.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: values.NEXT_PUBLIC_FIREBASE_APP_ID,
      measurementId: values.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    })
    expect(mocks.provider.setCustomParameters).toHaveBeenCalledWith({ prompt: 'select_account' })
  })

  it('preserves the legacy public project fallback without requiring private env', async () => {
    for (const key of ['API_KEY', 'AUTH_DOMAIN', 'DATABASE_URL', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID', 'MEASUREMENT_ID']) {
      vi.stubEnv(`NEXT_PUBLIC_FIREBASE_${key}`, '')
    }
    const { analyticsPromise } = await import('../../src/lib/firebase')
    expect(mocks.initializeApp.mock.calls[0][0]).toMatchObject({ projectId: 'kogni-ai', authDomain: 'kogni-ai.firebaseapp.com' })
    expect(Object.keys(mocks.initializeApp.mock.calls[0][0] as object)).toEqual([
      'apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId',
    ])
    await expect(analyticsPromise).resolves.toBeNull()
  })
})
