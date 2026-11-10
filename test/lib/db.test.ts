import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDB } from 'idb'
import {
  addLocalCard,
  deleteLocalCard,
  deleteLocalDeck,
  forkLocalDeck,
  getCardsByDeck,
  getDeck,
  getOfflineSnapshotRecord,
  reorderLocalCards,
  replaceLocalDeckCards,
  saveDeckWithCards,
  saveOnlineDeckOfflineSnapshot,
  setDatabaseUser,
  updateLocalCardContent,
  updateLocalDeckMetadata,
} from '../../src/lib/db'
import type { KognitDB, OnlineDeckOfflineSnapshot } from '../../src/types/domain'

const DB_NAME = 'FlashcardAppDB'
let db: Awaited<ReturnType<typeof rawDatabase>>

async function rawDatabase() {
  return openDB<KognitDB>(DB_NAME, 2)
}

beforeEach(async () => {
  setDatabaseUser('')
  db ??= await rawDatabase()
  const tx = db.transaction(['decks', 'cards', 'offlineSnapshots', 'migrationState'], 'readwrite')
  await Promise.all([
    tx.objectStore('decks').clear(),
    tx.objectStore('cards').clear(),
    tx.objectStore('offlineSnapshots').clear(),
    tx.objectStore('migrationState').clear(),
  ])
  await tx.done
})

describe('safe local deck mutations', () => {
  it('owner-checks metadata and card content mutations without leaking records', async () => {
    setDatabaseUser('owner-a')
    const saved = await saveDeckWithCards(
      { id: 'deck-a', title: 'Original', description: 'Before', createdAt: 100 },
      [{ id: 'card-a', question: 'Q', answer: 'A', interval: 6, repetition: 3, easinessFactor: 2.8, nextReviewDate: 900 }],
    )

    setDatabaseUser('owner-b')
    await expect(updateLocalDeckMetadata(saved.id, { title: 'Stolen' })).rejects.toThrow('not found')
    await expect(updateLocalCardContent(saved.cards[0].id, { answer: 'Stolen' }, 1_000)).rejects.toThrow('not found')
    expect(await getDeck(saved.id)).toBeUndefined()
    expect(await getCardsByDeck(saved.id)).toEqual([])

    setDatabaseUser('owner-a')
    expect((await getDeck(saved.id))?.title).toBe('Original')
    expect((await getCardsByDeck(saved.id))[0].answer).toBe('A')
  })

  it('resets only a content-changed stable card schedule', async () => {
    setDatabaseUser('owner')
    const saved = await saveDeckWithCards(
      { id: 'deck-reset', title: 'Reset', createdAt: 100 },
      [
        { id: 'changed', question: 'Q1', answer: 'A1', interval: 9, repetition: 4, easinessFactor: 2.9, nextReviewDate: 9_000 },
        { id: 'unchanged', question: 'Q2', answer: 'A2', interval: 5, repetition: 2, easinessFactor: 2.3, nextReviewDate: 8_000 },
      ],
    )

    const updated = await updateLocalCardContent('changed', { answer: 'A1 revised' }, 500)
    expect(updated).toMatchObject({
      id: 'changed',
      answer: 'A1 revised',
      interval: 0,
      repetition: 0,
      easinessFactor: 2.5,
      nextReviewDate: 500,
    })
    const noChange = await updateLocalCardContent('unchanged', { question: ' Q2 ' }, 600)
    expect(noChange).toMatchObject({ interval: 5, repetition: 2, easinessFactor: 2.3, nextReviewDate: 8_000 })
    expect(saved.cards.map((card) => card.id)).toEqual(['changed', 'unchanged'])
  })

  it('updates cardCount and order atomically across add, reorder, and delete', async () => {
    setDatabaseUser('owner')
    await saveDeckWithCards(
      { id: 'deck-order', title: 'Order' },
      [
        { id: 'first', question: 'First', answer: '1' },
        { id: 'third', question: 'Third', answer: '3' },
      ],
    )

    const added = await addLocalCard('deck-order', { id: 'second', question: 'Second', answer: '2' }, 1)
    expect(added.order).toBe(1)
    expect((await getDeck('deck-order'))?.cardCount).toBe(3)
    expect((await getCardsByDeck('deck-order')).map((card) => [card.id, card.order])).toEqual([
      ['first', 0], ['second', 1], ['third', 2],
    ])

    await reorderLocalCards('deck-order', ['third', 'first', 'second'])
    expect((await getCardsByDeck('deck-order')).map((card) => card.id)).toEqual(['third', 'first', 'second'])

    await deleteLocalCard('first')
    expect((await getDeck('deck-order'))?.cardCount).toBe(2)
    expect((await getCardsByDeck('deck-order')).map((card) => [card.id, card.order])).toEqual([
      ['third', 0], ['second', 1],
    ])
  })

  it('rolls back invalid reorder and collision attempts', async () => {
    setDatabaseUser('owner-a')
    await saveDeckWithCards(
      { id: 'deck-rollback', title: 'Rollback' },
      [
        { id: 'one', question: 'One', answer: '1' },
        { id: 'two', question: 'Two', answer: '2' },
      ],
    )
    setDatabaseUser('owner-b')
    await saveDeckWithCards(
      { id: 'other-deck', title: 'Other' },
      [{ id: 'foreign-card', question: 'Foreign', answer: 'F' }],
    )

    setDatabaseUser('owner-a')
    await expect(reorderLocalCards('deck-rollback', ['two'])).rejects.toThrow('exactly once')
    await expect(addLocalCard('deck-rollback', { id: 'foreign-card', question: 'New', answer: 'N' })).rejects.toThrow('collision')
    expect((await getCardsByDeck('deck-rollback')).map((card) => card.id)).toEqual(['one', 'two'])
    expect((await getDeck('deck-rollback'))?.cardCount).toBe(2)

    await expect(saveDeckWithCards(
      { id: 'other-deck', title: 'Overwrite attempt' },
      [{ id: 'new-card', question: 'New', answer: 'N' }],
    )).rejects.toThrow('collision')
    setDatabaseUser('owner-b')
    expect((await getDeck('other-deck'))?.title).toBe('Other')
  })

  it('forks with new deck, lineage, and card ids while preserving schedules and order', async () => {
    setDatabaseUser('owner')
    const source = await saveDeckWithCards(
      { id: 'source', lineageId: 'old-lineage', title: 'Source', createdAt: 100 },
      [
        { id: 'source-a', question: 'A', answer: 'a', interval: 4, repetition: 2, easinessFactor: 2.7, nextReviewDate: 4_000 },
        { id: 'source-b', question: 'B', answer: 'b', interval: 10, repetition: 5, easinessFactor: 2.2, nextReviewDate: 8_000 },
      ],
    )

    const fork = await forkLocalDeck(source.id, { title: 'Fork', createdAt: 200 })
    expect(fork.id).not.toBe(source.id)
    expect(fork.lineageId).toBeTruthy()
    expect(fork.lineageId).not.toBe(source.lineageId)
    expect(fork.cards.map((card) => card.id)).not.toEqual(source.cards.map((card) => card.id))
    expect(fork.cards.map(({ interval, repetition, easinessFactor, nextReviewDate, order }) => ({ interval, repetition, easinessFactor, nextReviewDate, order }))).toEqual(
      source.cards.map(({ interval, repetition, easinessFactor, nextReviewDate, order }) => ({ interval, repetition, easinessFactor, nextReviewDate, order })),
    )
  })

  it('cascades an owned local deck, cards, and offline provenance atomically', async () => {
    setDatabaseUser('owner')
    const snapshot: OnlineDeckOfflineSnapshot = {
      provenance: {
        source: 'online-deck', deckId: 'online-source', ownerId: 'publisher', version: 1,
        savedByUid: 'owner', savedAt: 500, creatorMaxQuestions: 10,
        saverQuestionLimit: 1, selectedQuestionCount: 1,
      },
      title: 'Offline', description: 'Snapshot',
      cards: [{ id: 'online-card', order: 0, contentRevision: 1, question: 'Q', answer: 'A', distractors: [] }],
    }
    const saved = await saveOnlineDeckOfflineSnapshot(snapshot)
    expect(await getOfflineSnapshotRecord(saved.id)).toBeTruthy()

    await deleteLocalDeck(saved.id)
    expect(await getDeck(saved.id)).toBeUndefined()
    expect(await getCardsByDeck(saved.id)).toEqual([])
    expect(await getOfflineSnapshotRecord(saved.id)).toBeUndefined()
  })

  it('replaces all cards using fresh ids and schedules, and rejects duplicates without mutation', async () => {
    setDatabaseUser('owner')
    const source = await saveDeckWithCards(
      { id: 'replace', title: 'Replace' },
      [{ id: 'old', question: 'Old', answer: 'Old', interval: 20, repetition: 8, easinessFactor: 2.9, nextReviewDate: 99_000 }],
    )

    const replaced = await replaceLocalDeckCards('replace', [
      { id: 'ignored-a', question: 'New A', answer: 'A', interval: 100, repetition: 50 },
      { id: 'ignored-b', question: 'New B', answer: 'B' },
    ], 700)
    expect(replaced).toHaveLength(2)
    expect(replaced.every((card) => card.id !== source.cards[0].id && card.id !== 'ignored-a' && card.id !== 'ignored-b')).toBe(true)
    expect(replaced.map((card) => ({ interval: card.interval, repetition: card.repetition, easinessFactor: card.easinessFactor, nextReviewDate: card.nextReviewDate, order: card.order }))).toEqual([
      { interval: 0, repetition: 0, easinessFactor: 2.5, nextReviewDate: 700, order: 0 },
      { interval: 0, repetition: 0, easinessFactor: 2.5, nextReviewDate: 700, order: 1 },
    ])
    expect((await getDeck('replace'))?.cardCount).toBe(2)

    await expect(replaceLocalDeckCards('replace', [
      { question: 'Same question', answer: 'Same answer', distractors: ['X'] },
      { question: ' same   question ', answer: 'same answer', distractors: ['x'] },
    ], 800)).rejects.toThrow('duplicate')
    expect((await getCardsByDeck('replace')).map((card) => card.id)).toEqual(replaced.map((card) => card.id))
  })

  it('aborts cascade when inconsistent foreign-owned child data is present', async () => {
    setDatabaseUser('owner')
    await saveDeckWithCards({ id: 'guarded', title: 'Guarded' }, [{ id: 'owned', question: 'Q', answer: 'A' }])
    const db = await rawDatabase()
    await db.put('cards', {
      id: 'foreign-child', deckId: 'guarded', ownerId: 'attacker', order: 1,
      question: 'X', answer: 'Y', distractors: [], interval: 0, repetition: 0,
      easinessFactor: 2.5, nextReviewDate: 0,
    })
    db.close()

    await expect(deleteLocalDeck('guarded')).rejects.toThrow('ownership conflict')
    expect(await getDeck('guarded')).toBeTruthy()
    expect((await getCardsByDeck('guarded')).map((card) => card.id)).toEqual(['owned'])
    const raw = await rawDatabase()
    expect(await raw.get('cards', 'foreign-child')).toBeTruthy()
    raw.close()
  })
})
