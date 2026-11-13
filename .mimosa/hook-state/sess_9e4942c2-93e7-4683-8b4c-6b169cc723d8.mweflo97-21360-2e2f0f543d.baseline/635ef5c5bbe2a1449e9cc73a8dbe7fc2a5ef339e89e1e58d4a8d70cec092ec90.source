import assert from 'node:assert/strict'
import test from 'node:test'
import { eligibleTestAccount, memoryDatabase } from './core-test-helpers.js'
import { listOwnerDecksService } from './owner-decks-core.js'

const privacyVersion = 'privacy-current'

function head(id: string, ownerId = 'owner', updatedAt = 1) {
  return {
    id, ownerId, visibility: 'private' as const, status: 'active' as const, latestVersion: 1,
    title: id, description: '', cardCount: 1, offlinePolicy: { allowed: false, maxQuestions: 0 },
    createdAt: 1, updatedAt,
  }
}

test('owner library includes private decks without discoverability and excludes other owners', async () => {
  const account = eligibleTestAccount('owner', privacyVersion)
  account.preferences.discoverable = false
  const memory = memoryDatabase({ accounts: { owner: account }, onlineDecks: {
    mine: { head: head('mine') }, other: { head: head('other', 'other') }, archived: { head: { ...head('archived'), status: 'archived' } },
  } })
  const page = await listOwnerDecksService(memory.database, 'owner', privacyVersion)
  assert.deepEqual(page, { items: [head('mine')], hasMore: false })
})

test('owner library keyset pagination is stable and malformed owned metadata fails closed', async () => {
  const decks: Record<string, unknown> = {}
  for (let index = 0; index < 21; index += 1) {
    const id = `deck-${String(index).padStart(2, '0')}`
    decks[id] = { head: head(id, 'owner', 100 - Math.floor(index / 2)) }
  }
  const memory = memoryDatabase({ accounts: { owner: eligibleTestAccount('owner', privacyVersion) }, onlineDecks: decks })
  const first = await listOwnerDecksService(memory.database, 'owner', privacyVersion)
  assert.equal(first.items.length, 20)
  assert.equal(first.hasMore, true)
  const second = await listOwnerDecksService(memory.database, 'owner', privacyVersion, first.nextCursor)
  assert.deepEqual(second.items.map((item) => item.id), ['deck-20'])
  memory.write('onlineDecks/bad', { head: { id: 'bad', ownerId: 'owner', visibility: 'private', status: 'active', updatedAt: 999 } })
  await assert.rejects(() => listOwnerDecksService(memory.database, 'owner', privacyVersion), /invalid metadata/)
})
