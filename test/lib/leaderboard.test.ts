import { describe, expect, it } from 'vitest'
import {
  computeNextStreakDays,
  getLevelFromXp,
  getLevelProgress,
  getReviewXp,
  localDayKey,
  parseRankedLeaderboardEntries,
} from '../../src/lib/leaderboard'

describe('leaderboard helpers', () => {
  it('awards bounded quality-based XP', () => {
    expect(getReviewXp(0)).toBe(2)
    expect(getReviewXp(5)).toBe(12)
    expect(() => getReviewXp(7)).toThrow(RangeError)
  })

  it('calculates levels and progress', () => {
    expect(getLevelFromXp(250)).toBe(3)
    expect(getLevelProgress(250)).toEqual({ level: 3, current: 50, required: 100 })
  })

  it('rejects malformed quality and normalizes negative XP', () => {
    expect(() => getReviewXp('2.5')).toThrow(RangeError)
    expect(getLevelFromXp(-200)).toBe(1)
    expect(getLevelProgress(Number.NaN)).toEqual({ level: 1, current: 0, required: 100 })
  })
})

describe('day streak computation', () => {
  // Fixed to a noon timestamp so local-day arithmetic never straddles midnight.
  const noon = new Date('2026-06-15T12:00:00').getTime()

  it('formats local calendar days with offsets', () => {
    expect(localDayKey(noon)).toBe('2026-06-15')
    expect(localDayKey(noon, -1)).toBe('2026-06-14')
  })

  it('keeps the streak on same-day reviews', () => {
    expect(computeNextStreakDays({ streakDays: 4, lastReviewDay: '2026-06-15' }, noon)).toBe(4)
  })

  it('grows the streak for yesterday reviews', () => {
    expect(computeNextStreakDays({ streakDays: 4, lastReviewDay: '2026-06-14' }, noon)).toBe(5)
  })

  it('resets the streak after a gap of two or more days', () => {
    expect(computeNextStreakDays({ streakDays: 9, lastReviewDay: '2026-06-12' }, noon)).toBe(1)
  })

  it('starts at one without prior history or malformed fields', () => {
    expect(computeNextStreakDays(null, noon)).toBe(1)
    expect(computeNextStreakDays({}, noon)).toBe(1)
    expect(computeNextStreakDays({ streakDays: -3, lastReviewDay: 42 }, noon)).toBe(1)
  })

  it('handles month boundaries when stepping back one day', () => {
    const juneFirstNoon = new Date('2026-06-01T12:00:00').getTime()
    expect(computeNextStreakDays({ streakDays: 7, lastReviewDay: '2026-05-31' }, juneFirstNoon)).toBe(8)
  })
})

describe('leaderboard snapshot parsing', () => {
  const record = (uid: string, xp: number) => ({
    uid,
    displayName: `Learner ${uid}`,
    photoURL: '',
    xp,
    reviews: 1,
    lastReviewAt: 100,
  })

  it('preserves unique Firebase child UIDs and ranks by XP', () => {
    expect(parseRankedLeaderboardEntries([
      ['uid-low', record('uid-low', 6)],
      ['uid-high', record('uid-high', 8)],
    ])).toEqual([
      { ...record('uid-high', 8), rank: 1 },
      { ...record('uid-low', 6), rank: 2 },
    ])
  })

  it('rejects child and embedded UID mismatches', () => {
    expect(parseRankedLeaderboardEntries([
      ['firebase-child', record('embedded-uid', 8)],
    ])).toEqual([])
  })

  it('defensively deduplicates repeated child UIDs without emitting React key 6/8 collisions', () => {
    const ranked = parseRankedLeaderboardEntries([
      ['6', record('6', 6)],
      ['8', record('8', 8)],
      ['6', record('6', 60)],
      ['8', record('8', 80)],
    ])

    expect(ranked.map(({ uid, xp, rank }) => ({ uid, xp, rank }))).toEqual([
      { uid: '8', xp: 8, rank: 1 },
      { uid: '6', xp: 6, rank: 2 },
    ])
    expect(new Set(ranked.map(({ uid }) => uid)).size).toBe(ranked.length)
  })
})
