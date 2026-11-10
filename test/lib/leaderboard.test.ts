import { describe, expect, it } from 'vitest'
import { getLevelFromXp, getLevelProgress, getReviewXp } from '../../src/lib/leaderboard'

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
