import { describe, expect, it } from 'vitest'
import {
  KOGNIT_LAUNCH_ISO_DATE,
  isPioneer,
  profileBadges,
  rankFromStats,
  statusBadges,
} from '../../src/lib/badges'
import { PRIVACY_VERSION } from '../../src/lib/account'

const LAUNCH_MS = Date.parse(`${KOGNIT_LAUNCH_ISO_DATE}T00:00:00`)
const YEAR_MS = 365 * 24 * 60 * 60 * 1000

const account = (overrides: Record<string, unknown> = {}) => ({
  uid: 'user-1',
  status: 'ready' as const,
  nickname: 'Ada_2026',
  nicknameCanonical: 'ada_2026',
  createdAt: LAUNCH_MS + 1000,
  updatedAt: 2,
  privacy: {
    currentVersion: PRIVACY_VERSION,
    acknowledgedAt: 1,
    acknowledgements: { [PRIVACY_VERSION]: 1 },
  },
  preferences: { discoverable: false, presence: false },
  ...overrides,
})

describe('Pioneer status badge', () => {
  it('marks accounts created within the first year after launch', () => {
    expect(isPioneer(LAUNCH_MS + 1000)).toBe(true)
    expect(isPioneer(LAUNCH_MS + YEAR_MS - 1)).toBe(true)
  })

  it('rejects accounts from before launch or after the first year', () => {
    expect(isPioneer(LAUNCH_MS - 1)).toBe(false)
    expect(isPioneer(LAUNCH_MS + YEAR_MS)).toBe(false)
    expect(isPioneer(0)).toBe(false)
    expect(isPioneer(-5)).toBe(false)
    expect(isPioneer('not-a-date')).toBe(false)
  })
})

describe('quiz rank ladder (XP-free)', () => {
  it('defaults everyone to Learner without stats', () => {
    expect(rankFromStats(null)).toBe('learner')
    expect(rankFromStats({ quizzesPassed: 0, currentStreak: 0, lifetimeAccuracy: 0 })).toBe('learner')
  })

  it('advances by passed-quizzes thresholds with streak and accuracy gates', () => {
    expect(rankFromStats({ quizzesPassed: 5, currentStreak: 1, lifetimeAccuracy: 70 })).toBe('apprentice')
    expect(rankFromStats({ quizzesPassed: 15, currentStreak: 3, lifetimeAccuracy: 70 })).toBe('scholar')
    expect(rankFromStats({ quizzesPassed: 15, currentStreak: 2, lifetimeAccuracy: 90 })).toBe('apprentice')
    expect(rankFromStats({ quizzesPassed: 40, currentStreak: 5, lifetimeAccuracy: 85 })).toBe('strategist')
    expect(rankFromStats({ quizzesPassed: 100, currentStreak: 10, lifetimeAccuracy: 90 })).toBe('luminary')
  })

  it('ignores malformed counters instead of advancing ranks', () => {
    expect(rankFromStats({ quizzesPassed: Number.NaN, currentStreak: 5, lifetimeAccuracy: 100 })).toBe('learner')
    expect(rankFromStats({ quizzesPassed: -3, currentStreak: 12, lifetimeAccuracy: 120 })).toBe('learner')
  })
})

describe('status badge computation', () => {
  it('grants auto badges from their criteria', () => {
    expect(statusBadges({ pioneer: true, quizzesCreated: 0, hasPerfectAttempt: false, earlyEducator: false })).toEqual(['pioneer'])
    expect(statusBadges({ pioneer: true, quizzesCreated: 10, hasPerfectAttempt: true, earlyEducator: true })).toEqual([
      'pioneer', 'early-educator', 'quiz-architect', 'perfect-round',
    ])
    expect(statusBadges({ pioneer: false, quizzesCreated: 9, hasPerfectAttempt: false, earlyEducator: false })).toEqual([])
  })
})

describe('profile badge row', () => {
  it('always renders role and rank, plus Pioneer for first-year accounts', () => {
    const badges = profileBadges(account())
    expect(badges.slice(0, 2)).toEqual([
      { id: 'student', kind: 'role', label: 'Student' },
      { id: 'learner', kind: 'rank', label: 'Learner' },
    ])
    expect(badges.map((badge) => badge.id)).toContain('pioneer')
  })

  it('renders Teacher role badges without Pioneer for older accounts', () => {
    const badges = profileBadges(account({ role: 'teacher', createdAt: LAUNCH_MS + YEAR_MS + 1000 }))
    expect(badges[0]).toEqual({ id: 'teacher', kind: 'role', label: 'Teacher' })
    expect(badges.map((badge) => badge.id)).not.toContain('pioneer')
  })
})
