import { describe, expect, it } from 'vitest'
import type { StudyCard, StudyDeck } from '../../src/types/domain'
import {
  PORTAL_INVALID_MESSAGE,
  PORTAL_LIFETIME_MS,
  canReadDeckPortal,
  createDeckPortalSnapshot,
  formatPortalCode,
  generatePortalCode,
  getDeckPortalExpiry,
  invalidPortalLookupResult,
  normalizePortalCode,
} from '../../src/lib/portal'

const deck: StudyDeck = {
  id: 'deck-local-1',
  ownerId: 'owner-user',
  lineageId: 'lineage-1',
  title: ' Biology ',
  description: ' Cells ',
  studyGuide: ' ATP guide ',
  cardCount: 1,
  createdAt: 10,
}

const cards: StudyCard[] = [{
  id: 'local-card-id',
  deckId: deck.id,
  ownerId: deck.ownerId,
  question: ' What is ATP? ',
  answer: ' Energy currency ',
  distractors: ['Protein'],
  interval: 12,
  repetition: 4,
  easinessFactor: 2.7,
  nextReviewDate: 99,
}]

describe('deck portal codes', () => {
  it('generates canonical 12-character Crockford Base32 codes', () => {
    const codes = Array.from({ length: 64 }, () => generatePortalCode())
    expect(codes.every((code) => /^[0-9A-HJKMNP-TV-Z]{12}$/.test(code))).toBe(true)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('normalizes accepted display separators without fuzzy character substitutions', () => {
    expect(normalizePortalCode(' abcd-efgh-jkmn ')).toBe('ABCDEFGHJKMN')
    expect(formatPortalCode('abcdefghjkmn')).toBe('ABCD-EFGH-JKMN')
    expect(normalizePortalCode('ABCD-EFGH-IJKL')).toBe('')
    expect(normalizePortalCode('short')).toBe('')
  })

  it('supports configurable whole-day expiry capped at 30 days', () => {
    expect(getDeckPortalExpiry({ now: 1_000, expiresInDays: 7 })).toEqual({
      now: 1_000,
      expiresAt: 1_000 + 7 * 24 * 60 * 60 * 1000,
    })
    expect(() => getDeckPortalExpiry({ expiresInDays: 0 })).toThrow('1 to 30')
    expect(() => getDeckPortalExpiry({ expiresInDays: 31 })).toThrow('1 to 30')
    expect(() => getDeckPortalExpiry({ expiresInDays: 1.5 })).toThrow('1 to 30')
  })
})

describe('deck portal snapshots', () => {
  it('copies content and lineage while excluding local IDs, ownership, and schedules', () => {
    const snapshot = createDeckPortalSnapshot({ deck, cards })
    expect(snapshot).toEqual({
      lineageId: 'lineage-1',
      title: 'Biology',
      description: 'Cells',
      studyGuide: 'ATP guide',
      cardCount: 1,
      cards: {
        card_0: {
          id: 'card_0',
          question: 'What is ATP?',
          answer: 'Energy currency',
          distractors: ['Protein'],
        },
      },
    })
    expect(JSON.stringify(snapshot)).not.toMatch(/ownerId|deckId|interval|repetition|nextReviewDate|local-card-id/)
  })

  it('rejects cards not owned by the selected deck owner', () => {
    expect(() => createDeckPortalSnapshot({
      deck,
      cards: [{ ...cards[0], ownerId: 'someone-else' }],
    })).toThrow('Every portal card must belong')
  })
})

describe('deck portal access decisions', () => {
  const portal = {
    id: 'ABCDEFGHJKMN',
    ownerId: deck.ownerId,
    ownerDisplayName: 'Owner Learner',
    sourceDeckId: deck.id,
    status: 'active' as const,
    createdAt: 1_000,
    expiresAt: 1_000 + PORTAL_LIFETIME_MS,
    snapshot: createDeckPortalSnapshot({ deck, cards }),
  }

  it('allows the owner regardless of expiry and others only while active and unexpired', () => {
    expect(canReadDeckPortal(portal, deck.ownerId, portal.expiresAt + 1)).toBe(true)
    expect(canReadDeckPortal(portal, 'reader', portal.expiresAt - 1)).toBe(true)
    expect(canReadDeckPortal(portal, 'reader', portal.expiresAt)).toBe(false)
    expect(canReadDeckPortal({ ...portal, status: 'revoked', revokedAt: 2_000 }, 'reader', 1_500)).toBe(false)
  })

  it('returns one generic invalid lookup shape', () => {
    expect(invalidPortalLookupResult()).toEqual({
      ok: false,
      code: 'invalid_portal',
      message: PORTAL_INVALID_MESSAGE,
    })
  })
})
