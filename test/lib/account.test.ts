import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  ref: vi.fn((_database: unknown, path: string) => ({ path })),
  update: vi.fn(),
}))

vi.mock('../../src/lib/firebase', () => ({ database: {} }))
vi.mock('firebase/database', () => ({
  get: mocks.get,
  ref: mocks.ref,
  update: mocks.update,
  serverTimestamp: () => ({ '.sv': 'timestamp' }),
}))

import {
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  PRIVACY_VERSION,
  accountRole,
  acknowledgePrivacy,
  canonicalizeNickname,
  getAccount,
  isAccountRecord,
  isAccountRecordShape,
  nicknameIdentity,
  privacyAcknowledgementPending,
} from '../../src/lib/account'
import type { User } from 'firebase/auth'

describe('account nickname identity', () => {
  it('canonicalizes a valid nickname case-insensitively', () => {
    expect(canonicalizeNickname('  Ada_2026 ')).toBe('ada_2026')
  })

  it('accepts only 3-24 ASCII letters, digits, and underscore', () => {
    expect(NICKNAME_MIN_LENGTH).toBe(3)
    expect(NICKNAME_MAX_LENGTH).toBe(24)
    for (const invalid of ['ab', 'a'.repeat(25), 'has space', 'naïve', 'dash-name', '']) {
      expect(() => canonicalizeNickname(invalid)).toThrow('ASCII letters')
    }
  })

  it('validates ready account records and returns a safe canonical identity', () => {
    const account = {
      uid: 'user-1',
      status: 'ready' as const,
      nickname: 'Ada_2026',
      nicknameCanonical: 'ada_2026',
      createdAt: 1,
      updatedAt: 2,
      privacy: {
        currentVersion: PRIVACY_VERSION,
        acknowledgedAt: 1,
        acknowledgements: { [PRIVACY_VERSION]: 1 },
      },
      preferences: { discoverable: false, presence: false },
    }
    expect(isAccountRecord(account)).toBe(true)
    expect(nicknameIdentity(account)).toEqual({
      uid: 'user-1',
      nickname: 'Ada_2026',
      nicknameCanonical: 'ada_2026',
    })
    expect(isAccountRecord({ ...account, email: 'private@example.test' })).toBe(true)
    expect(isAccountRecord({ ...account, nicknameCanonical: 'ADA_2026' })).toBe(false)
  })

  it('treats missing roles as Student and rejects unknown role values', () => {
    const account = {
      uid: 'user-1',
      status: 'ready' as const,
      nickname: 'Ada_2026',
      nicknameCanonical: 'ada_2026',
      createdAt: 1,
      updatedAt: 2,
      privacy: {
        currentVersion: PRIVACY_VERSION,
        acknowledgedAt: 1,
        acknowledgements: { [PRIVACY_VERSION]: 1 },
      },
      preferences: { discoverable: false, presence: false },
    }
    expect(accountRole(account)).toBe('student')
    expect(accountRole({ ...account, role: 'teacher' })).toBe('teacher')
    expect(accountRole({ ...account, role: 'student' })).toBe('student')
    expect(isAccountRecord({ ...account, role: 'teacher' })).toBe(true)
    expect(isAccountRecord({ ...account, role: 'admin' })).toBe(false)
    expect(isAccountRecord({ ...account, role: 3 })).toBe(false)
  })
})

describe('stale-privacy account loading (re-acknowledgement wedge fix)', () => {
  const staleAccount = {
    uid: 'user-1',
    status: 'ready' as const,
    nickname: 'Ada_2026',
    nicknameCanonical: 'ada_2026',
    createdAt: 1,
    updatedAt: 2,
    privacy: {
      currentVersion: 'privacy-2026-11-10-ai-series-1',
      acknowledgedAt: 1,
      acknowledgements: { 'privacy-2026-11-10-ai-series-1': 1 },
    },
    preferences: { discoverable: false, presence: false },
  }
  const user = { uid: 'user-1' } as User

  beforeEach(() => {
    mocks.get.mockReset()
    mocks.update.mockReset()
    mocks.ref.mockClear()
  })

  it('keeps strict isAccountRecord rejecting stale acknowledgements but shape accepts them', () => {
    expect(isAccountRecord(staleAccount)).toBe(false)
    expect(isAccountRecordShape(staleAccount)).toBe(true)
    expect(privacyAcknowledgementPending(staleAccount)).toBe(true)
    expect(privacyAcknowledgementPending({ ...staleAccount, privacy: { ...staleAccount.privacy, currentVersion: PRIVACY_VERSION, acknowledgements: { [PRIVACY_VERSION]: 1 } } })).toBe(false)
  })

  it('loads stale-privacy accounts so the app can present the re-acknowledgement gate', async () => {
    mocks.get.mockResolvedValue({ val: () => staleAccount })
    await expect(getAccount(user)).resolves.toEqual(staleAccount)
  })

  it('acknowledgePrivacy replaces the privacy subtree with the current version', async () => {
    mocks.get.mockResolvedValueOnce({ val: () => staleAccount })
    mocks.get.mockResolvedValueOnce({
      val: () => ({ ...staleAccount, privacy: { currentVersion: PRIVACY_VERSION, acknowledgedAt: 9, acknowledgements: { [PRIVACY_VERSION]: 9 } } }),
    })
    const acknowledged = await acknowledgePrivacy(user)
    expect(acknowledged.privacy.currentVersion).toBe(PRIVACY_VERSION)
    expect(mocks.update).toHaveBeenCalledTimes(1)
    const writes = mocks.update.mock.calls[0]![1] as Record<string, unknown>
    expect(Object.keys(writes)).toEqual([`accounts/user-1/privacy`, `accounts/user-1/updatedAt`])
    const privacy = writes['accounts/user-1/privacy'] as { currentVersion: string; acknowledgements: Record<string, unknown> }
    expect(privacy.currentVersion).toBe(PRIVACY_VERSION)
    expect(Object.keys(privacy.acknowledgements)).toEqual([PRIVACY_VERSION])
  })

  it('is a no-op when the account already acknowledges the current version', async () => {
    const current = {
      ...staleAccount,
      privacy: { currentVersion: PRIVACY_VERSION, acknowledgedAt: 1, acknowledgements: { [PRIVACY_VERSION]: 1 } },
    }
    mocks.get.mockResolvedValue({ val: () => current })
    await expect(acknowledgePrivacy(user)).resolves.toEqual(current)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('requires an authenticated user', async () => {
    await expect(acknowledgePrivacy(null)).rejects.toThrow(TypeError)
  })
})
