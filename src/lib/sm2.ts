import { assertRecord } from './errors'
import type { CardSchedule } from '../types/domain'

const DAY_MS = 24 * 60 * 60 * 1000

function finiteNumber(value: unknown, fallback: number): number {
  return Number.isFinite(Number(value)) ? Number(value) : fallback
}

export function calculateSm2<T extends object>(
  card: T,
  quality: unknown,
  reviewedAt?: unknown,
): T & CardSchedule
export function calculateSm2(
  card: unknown,
  quality: unknown,
  reviewedAt: unknown = Date.now(),
): Record<string, unknown> & CardSchedule {
  assertRecord(card, 'card')

  const score = Number(quality)
  if (!Number.isInteger(score) || score < 0 || score > 5) {
    throw new RangeError('quality must be an integer from 0 to 5')
  }

  const reviewTime = finiteNumber(reviewedAt, Number.NaN)
  if (!Number.isFinite(reviewTime)) {
    throw new TypeError('reviewedAt must be a valid timestamp')
  }

  let repetition = Math.max(0, Math.trunc(finiteNumber(card.repetition, 0)))
  let interval = Math.max(0, finiteNumber(card.interval, 0))
  let easinessFactor = Math.max(1.3, finiteNumber(card.easinessFactor, 2.5))

  if (score < 3) {
    repetition = 0
    interval = 1
  } else {
    repetition += 1
    interval = repetition === 1 ? 1 : Math.max(1, interval * easinessFactor)
  }

  easinessFactor = Math.max(
    1.3,
    easinessFactor + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02)),
  )

  return {
    ...card,
    repetition,
    interval,
    easinessFactor,
    nextReviewDate: reviewTime + interval * DAY_MS,
  }
}

export const calculateSM2 = calculateSm2
export const sm2 = calculateSm2
export default calculateSm2
