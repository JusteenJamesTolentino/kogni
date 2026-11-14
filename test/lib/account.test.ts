import { describe, expect, it } from 'vitest'
import {
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  PRIVACY_VERSION,
  accountRole,
  canonicalizeNickname,
  isAccountRecord,
  nicknameIdentity,
} from '../../src/lib/account'

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
