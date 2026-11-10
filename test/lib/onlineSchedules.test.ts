import { describe, expect, it } from 'vitest'
import { resetScheduleForChangedContent } from '../../src/lib/onlineSchedules'
import type { OnlineCardScheduleState } from '../../src/types/domain'

const current: OnlineCardScheduleState = {
  deckId: 'deck-one',
  cardId: 'card-one',
  deckVersion: 1,
  contentRevision: 3,
  scheduleRevision: 7,
  reviewCount: 7,
  interval: 12,
  repetition: 4,
  easinessFactor: 2.7,
  nextReviewDate: 900,
  lastReviewedAt: 500,
  lastEventId: 'event-seven',
  updatedAt: 500,
}

describe('online schedule content isolation', () => {
  it('preserves progress when only the published deck version changes', () => {
    expect(resetScheduleForChangedContent(current, {
      deckId: 'deck-one',
      cardId: 'card-one',
      deckVersion: 2,
      contentRevision: 3,
      now: 600,
    })).toEqual({ ...current, deckVersion: 2, updatedAt: 600 })
  })

  it('resets progress when a stable card ID receives changed content', () => {
    expect(resetScheduleForChangedContent(current, {
      deckId: 'deck-one',
      cardId: 'card-one',
      deckVersion: 2,
      contentRevision: 4,
      now: 600,
    })).toEqual({
      deckId: 'deck-one',
      cardId: 'card-one',
      deckVersion: 2,
      contentRevision: 4,
      scheduleRevision: 0,
      reviewCount: 0,
      interval: 0,
      repetition: 0,
      easinessFactor: 2.5,
      nextReviewDate: 600,
      lastReviewedAt: 0,
      lastEventId: '',
      updatedAt: 600,
    })
  })

  it('does not carry progress across deck or card paths', () => {
    const isolated = resetScheduleForChangedContent(current, {
      deckId: 'deck-two',
      cardId: 'card-one',
      deckVersion: 1,
      contentRevision: 3,
      now: 700,
    })
    expect(isolated.scheduleRevision).toBe(0)
    expect(isolated.deckId).toBe('deck-two')
  })
})
