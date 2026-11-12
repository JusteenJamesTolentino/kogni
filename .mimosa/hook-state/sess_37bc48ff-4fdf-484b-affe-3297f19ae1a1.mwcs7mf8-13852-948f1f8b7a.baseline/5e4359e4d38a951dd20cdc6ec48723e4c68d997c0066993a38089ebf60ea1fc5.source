import { describe, expect, it } from 'vitest'
import {
  getLevelFromXp,
  getLevelProgress,
  getReviewXp,
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
