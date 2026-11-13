import { describe, expect, it } from 'vitest'
import { isValidOnlineDeckVersion, selectOnlineDeckOfflineSnapshot } from '../../src/lib/onlineDecks'
import type { OnlineDeckHead, OnlineDeckVersion } from '../../src/types/domain'

const head: OnlineDeckHead = {
  id: 'deck-one',
  ownerId: 'owner',
  visibility: 'public',
  status: 'active',
  latestVersion: 2,
  title: 'Biology',
  description: 'Cells',
  cardCount: 30,
  offlinePolicy: { allowed: true, maxQuestions: 30 },
  createdAt: 100,
  updatedAt: 200,
}

const version: OnlineDeckVersion = {
  deckId: 'deck-one',
  ownerId: 'owner',
  version: 2,
  baseVersion: 1,
  title: 'Biology',
  description: 'Cells',
  cardCount: 3,
  publishedAt: 200,
  cardOrder: { '0': 'stable-b', '1': 'stable-a', '2': 'stable-c' },
  cards: {
    'stable-a': { id: 'stable-a', order: 1, contentRevision: 1, question: 'A', answer: 'a', distractors: [] },
    'stable-b': { id: 'stable-b', order: 0, contentRevision: 2, question: 'B', answer: 'b', distractors: [] },
    'stable-c': { id: 'stable-c', order: 2, contentRevision: 1, question: 'C', answer: 'c', distractors: [] },
  },
}

describe('online deck offline snapshots', () => {
  it('selects deterministic first N cards bounded by the creator and saver', () => {
    const snapshot = selectOnlineDeckOfflineSnapshot(head, version, 'viewer', 3, 300)
    expect(snapshot.cards.map((card) => card.id)).toEqual(['stable-b', 'stable-a', 'stable-c'])
    expect(snapshot.provenance).toEqual({
      source: 'online-deck',
      deckId: 'deck-one',
      ownerId: 'owner',
      version: 2,
      savedByUid: 'viewer',
      savedAt: 300,
      creatorMaxQuestions: 30,
      saverQuestionLimit: 3,
      selectedQuestionCount: 3,
    })
  })

  it('honors a smaller saver choice and rejects creator-disabled offline use', () => {
    expect(selectOnlineDeckOfflineSnapshot(head, version, 'viewer', 1, 300).cards).toHaveLength(1)
    expect(() => selectOnlineDeckOfflineSnapshot(
      { ...head, offlinePolicy: { allowed: false, maxQuestions: 0 } },
      version,
      'viewer',
      1,
    )).toThrow('does not allow')
  })

  it('includes optional series provenance', () => {
    const snapshot = selectOnlineDeckOfflineSnapshot(
      { ...head, seriesId: 'series-one', partNumber: 2 },
      version,
      'viewer',
      30,
      300,
    )
    expect(snapshot.provenance).toMatchObject({ seriesId: 'series-one', partNumber: 2 })
  })
})

describe('online deck version validation', () => {
  const cloneVersion = (): OnlineDeckVersion => structuredClone(version)

  it('accepts Firebase array materialization for numeric cardOrder and numeric card IDs', () => {
    const candidate = cloneVersion() as unknown as Record<string, unknown>
    candidate.cardOrder = ['0', '1', '2']
    candidate.cards = [
      { id: '0', order: 0, contentRevision: 1, question: 'Q0', answer: 'A0' },
      { id: '1', order: 1, contentRevision: 1, question: 'Q1', answer: 'A1', distractors: ['X'] },
      { id: '2', order: 2, contentRevision: 1, question: 'Q2', answer: 'A2' },
    ]
    expect(isValidOnlineDeckVersion(candidate)).toBe(true)
  })

  it('rejects sparse Firebase arrays with missing cards', () => {
    const candidate = cloneVersion() as unknown as Record<string, unknown>
    candidate.cardOrder = ['0', '1', '2']
    candidate.cards = [
      { id: '0', order: 0, contentRevision: 1, question: 'Q0', answer: 'A0' },
      null,
      { id: '2', order: 2, contentRevision: 1, question: 'Q2', answer: 'A2' },
    ]
    expect(isValidOnlineDeckVersion(candidate)).toBe(false)
  })

  it('accepts a valid record with exact card keys, count, orders, and cardOrder', () => {
    expect(isValidOnlineDeckVersion(cloneVersion())).toBe(true)
  })

  it('rejects duplicate embedded card IDs stored under different Firebase keys', () => {
    const candidate = cloneVersion()
    candidate.cards['stable-c'] = { ...candidate.cards['stable-c'], id: 'stable-a' }
    expect(isValidOnlineDeckVersion(candidate)).toBe(false)
  })

  it('rejects duplicate and missing contiguous card orders', () => {
    const duplicateOrder = cloneVersion()
    duplicateOrder.cards['stable-c'] = { ...duplicateOrder.cards['stable-c'], order: 1 }
    expect(isValidOnlineDeckVersion(duplicateOrder)).toBe(false)

    const missingOrder = cloneVersion()
    missingOrder.cards['stable-c'] = { ...missingOrder.cards['stable-c'], order: 3 }
    expect(isValidOnlineDeckVersion(missingOrder)).toBe(false)
  })

  it('rejects cardOrder mappings with duplicates, missing cards, extras, or wrong positions', () => {
    const duplicate = cloneVersion()
    duplicate.cardOrder = { '0': 'stable-b', '1': 'stable-a', '2': 'stable-a' }
    expect(isValidOnlineDeckVersion(duplicate)).toBe(false)

    const missing = cloneVersion()
    missing.cardOrder = { '0': 'stable-b', '1': 'stable-a' }
    expect(isValidOnlineDeckVersion(missing)).toBe(false)

    const extra = cloneVersion()
    extra.cardOrder = { ...extra.cardOrder, '3': 'stable-c' }
    expect(isValidOnlineDeckVersion(extra)).toBe(false)

    const mismatched = cloneVersion()
    mismatched.cardOrder = { '0': 'stable-a', '1': 'stable-b', '2': 'stable-c' }
    expect(isValidOnlineDeckVersion(mismatched)).toBe(false)
  })
})
