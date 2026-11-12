import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eligibleTestAccount as account, memoryDatabase } from './core-test-helpers.js'
import { followEdgeId, followPlayerService, getPlayerProfileService, getSocialSummaryService, requireTargetUid, SocialError, unfollowPlayerService } from './social-core.js'
import { encodePlayerDeckCursor, listPlayerDecksService, PLAYER_DECK_MAX_OWNER_RECORDS } from './player-decks-core.js'
import { getPlayerPresenceService, listOnlinePlayersService, PRESENCE_BATCH_SIZE } from './discovery-core.js'

const version = 'privacy-2026-11-10-ai-series-1'

function seed() {
  return memoryDatabase({ accounts: { alice: account('alice'), bob: account('bob') }, leaderboard: { bob: { xp: 42 } } })
}

function deckHead(id: string, ownerId = 'bob', updatedAt = 100, overrides: Record<string, unknown> = {}) {
  return {
    id, ownerId, visibility: 'public', status: 'active', latestVersion: 1,
    title: `Deck ${id}`, description: 'Safe metadata', cardCount: 10, updatedAt,
    ...overrides,
  }
}

function seedDecks(count: number) {
  const db = seed()
  for (let index = 0; index < count; index += 1) {
    const id = `deck-${String(index).padStart(3, '0')}`
    db.write(`onlineDecks/${id}`, { head: deckHead(id, 'bob', 1000 - Math.floor(index / 3)), versions: { private: true } })
  }
  return db
}

test('owner summary uses canonical edges, works while private, and revalidates caller readiness', async () => {
  const db = seed()
  db.write('accounts/alice/preferences/discoverable', false)
  const incoming = { followerUid: 'bob', followedUid: 'alice', createdAt: 1 }
  const outgoing = { followerUid: 'alice', followedUid: 'bob', createdAt: 2 }
  db.write(`playerFollowEdges/${followEdgeId('bob', 'alice')}`, incoming)
  db.write(`playerFollowEdges/${followEdgeId('alice', 'bob')}`, outgoing)
  db.write('playerFollowEdges/not-canonical', incoming)
  db.write('playerFollowEdges/malformed', { ...outgoing, createdAt: -1 })
  assert.deepEqual(await getSocialSummaryService(db.database, 'alice', version), { followerCount: 1, followingCount: 1 })

  const original = db.database.ref.bind(db.database)
  let accountReads = 0
  db.database.ref = (path?: string) => {
    const reference = original(path)
    if (path === 'accounts/alice') {
      const get = reference.get.bind(reference)
      reference.get = async () => {
        accountReads += 1
        if (accountReads === 2) db.write('accounts/alice/privacy/currentVersion', 'stale')
        return get()
      }
    }
    return reference
  }
  await assert.rejects(() => getSocialSummaryService(db.database, 'alice', version), (error: unknown) => error instanceof SocialError && error.code === 'failed-precondition')
})

test('player decks filter canonical active public metadata and paginate ties without duplicates', async () => {
  const db = seedDecks(24)
  db.write('onlineDecks/private', { head: deckHead('private', 'bob', 2000, { visibility: 'private' }) })
  db.write('onlineDecks/archived', { head: deckHead('archived', 'bob', 2000, { status: 'archived' }) })
  db.write('onlineDecks/other', { head: deckHead('other', 'carol', 2000) })
  const first = await listPlayerDecksService(db.database, 'alice', 'bob', version)
  assert.equal(first.items.length, 20)
  assert.equal(first.hasMore, true)
  assert.ok(first.nextCursor)
  assert.ok(first.items.every((item) => Object.keys(item).sort().join(',') === 'cardCount,description,id,latestVersion,ownerId,ownerNickname,ownerNicknameCanonical,title,titleCanonical,updatedAt'))
  for (let index = 1; index < first.items.length; index += 1) {
    const previous = first.items[index - 1]!
    const current = first.items[index]!
    assert.ok(previous.updatedAt > current.updatedAt || (previous.updatedAt === current.updatedAt && previous.id < current.id))
  }
  const second = await listPlayerDecksService(db.database, 'alice', 'bob', version, first.nextCursor)
  assert.equal(second.items.length, 4)
  assert.equal(second.hasMore, false)
  assert.equal(second.nextCursor, undefined)
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 24)
  await assert.rejects(() => listPlayerDecksService(db.database, 'alice', 'bob', version, 'bad'), SocialError)
  await assert.rejects(() => listPlayerDecksService(db.database, 'alice', 'bob', version, encodePlayerDeckCursor({ updatedAt: 1, id: 'bad/id' })), SocialError)
})

test('player deck listing enforces privacy, both block directions and bounded owner work', async () => {
  for (const path of ['accounts/bob/preferences/discoverable', 'accounts/bob/privacy/currentVersion', 'playerBlocks/alice/bob', 'playerBlocks/bob/alice']) {
    const db = seedDecks(1)
    db.write(path, path.endsWith('discoverable') ? false : path.endsWith('currentVersion') ? 'stale' : 1)
    await assert.rejects(() => listPlayerDecksService(db.database, 'alice', 'bob', version), (error: unknown) => error instanceof SocialError && error.code === 'not-found')
  }
  const overflow = seedDecks(PLAYER_DECK_MAX_OWNER_RECORDS + 1)
  await assert.rejects(() => listPlayerDecksService(overflow.database, 'alice', 'bob', version), (error: unknown) => error instanceof SocialError && error.code === 'failed-precondition')
})

test('player deck response boundary refills deletion and fails closed on changed metadata', async () => {
  const refill = seedDecks(22)
  const original = refill.database.ref.bind(refill.database)
  refill.database.ref = (path?: string) => {
    const reference = original(path)
    if (path === 'onlineDecks/deck-005/head') {
      const get = reference.get.bind(reference)
      reference.get = async () => {
        refill.write('onlineDecks/deck-005/head/visibility', 'private')
        return get()
      }
    }
    return reference
  }
  const page = await listPlayerDecksService(refill.database, 'alice', 'bob', version)
  assert.equal(page.items.length, 20)
  assert.equal(page.hasMore, true)
  assert.ok(page.items.every((item) => item.id !== 'deck-005'))

  const mutation = seedDecks(22)
  const mutationOriginal = mutation.database.ref.bind(mutation.database)
  mutation.database.ref = (path?: string) => {
    const reference = mutationOriginal(path)
    if (path === 'onlineDecks/deck-000/head') {
      const get = reference.get.bind(reference)
      reference.get = async () => {
        mutation.write('onlineDecks/deck-000/head/title', 'Changed')
        return get()
      }
    }
    return reference
  }
  await assert.rejects(() => listPlayerDecksService(mutation.database, 'alice', 'bob', version), (error: unknown) => error instanceof SocialError && error.code === 'failed-precondition')
})

test('player deck listing revalidates caller and target at final response boundary', async () => {
  for (const target of ['accounts/alice', 'accounts/bob']) {
    const db = seedDecks(1)
    const original = db.database.ref.bind(db.database)
    let reads = 0
    db.database.ref = (path?: string) => {
      const reference = original(path)
      if (path === target) {
        const get = reference.get.bind(reference)
        reference.get = async () => {
          reads += 1
          if (reads >= (target.endsWith('alice') ? 2 : 3)) db.write(`${target}/privacy/currentVersion`, 'stale')
          return get()
        }
      }
      return reference
    }
    await assert.rejects(() => listPlayerDecksService(db.database, 'alice', 'bob', version), SocialError)
  }
})

test('core rejects invalid/path/control UIDs before any database reads', async () => {
  const db = seed()
  for (const uid of ['', 'a/b', 'a\u0000b', 'a\nb', '.', 1]) assert.throws(() => requireTargetUid({ uid }), SocialError)
  assert.throws(() => requireTargetUid({ uid: 'bob', extra: true }), SocialError)
  await assert.rejects(() => followPlayerService(db.database, 'alice', 'a/b', version), SocialError)
  assert.equal(db.reads.length, 0)
})

test('canonical follow is idempotent and reconciles counts synchronously; unfollow repairs orphan projections', async () => {
  const db = seed()
  const id = followEdgeId('alice', 'bob')
  await followPlayerService(db.database, 'alice', 'bob', version, 10)
  await followPlayerService(db.database, 'alice', 'bob', version, 20)
  assert.deepEqual(db.read(`playerFollowEdges/${id}`), { followerUid: 'alice', followedUid: 'bob', createdAt: 10 })
  assert.equal(db.read('playerFollowing/alice/bob/edgeId'), id)
  assert.equal(db.read('publicPlayerProfiles/alice/followingCount'), 1)
  assert.equal(db.read('publicPlayerProfiles/bob/followerCount'), 1)
  db.write('onlineDecks/public/head', { ownerId: 'bob', visibility: 'public', status: 'active' })
  db.write('onlineDecks/private/head', { ownerId: 'bob', visibility: 'private', status: 'active' })
  await followPlayerService(db.database, 'bob', 'alice', version, 30)
  const profile = await getPlayerProfileService(db.database, 'alice', 'bob', version)
  assert.equal(profile.profile.communityXp, 42)
  assert.equal(profile.profile.xpTrust, 'client-reported')
  assert.equal(profile.profile.publishedDeckCount, 1)
  assert.deepEqual(profile.social, { following: true, followedBy: true })
  await unfollowPlayerService(db.database, 'alice', 'bob', version)
  db.write('playerFollowing/alice/bob', { stale: true })
  db.write('playerFollowers/bob/alice', { stale: true })
  await unfollowPlayerService(db.database, 'alice', 'bob', version)
  assert.equal(db.read('playerFollowing/alice/bob'), null)
  assert.equal(db.read('playerFollowers/bob/alice'), null)
  assert.equal(db.read('publicPlayerProfiles/bob/followerCount'), 0)
})

test('follow/profile gate current caller, target privacy and both block directions', async () => {
  for (const path of ['accounts/bob/preferences/discoverable', 'accounts/bob/privacy/currentVersion', 'playerBlocks/alice/bob', 'playerBlocks/bob/alice']) {
    const db = seed()
    db.write(path, path.endsWith('discoverable') ? false : path.endsWith('currentVersion') ? 'stale' : 1)
    await assert.rejects(() => followPlayerService(db.database, 'alice', 'bob', version), (e: unknown) => e instanceof SocialError && e.code === 'not-found')
    await assert.rejects(() => getPlayerProfileService(db.database, 'alice', 'bob', version), (e: unknown) => e instanceof SocialError && e.code === 'not-found')
    assert.equal(db.read(`playerFollowEdges/${followEdgeId('alice', 'bob')}`), null)
  }
  const db = seed()
  db.write('accounts/alice/privacy/currentVersion', 'stale')
  await assert.rejects(() => unfollowPlayerService(db.database, 'alice', 'bob', version), (e: unknown) => e instanceof SocialError && e.code === 'failed-precondition')
})

test('presence uses true markers, both target opt-ins and privacy; unavailable/private/blocked look offline', async () => {
  const db = seed()
  for (const marker of [null, {}, { tab: false }, { tab: 1 }, { tab: 'true' }]) {
    db.write('presenceSessions/bob', marker)
    assert.deepEqual(await getPlayerPresenceService(db.database, 'alice', 'bob', version), { online: false })
  }
  db.write('presenceSessions/bob', { first: false, second: true })
  assert.deepEqual(await getPlayerPresenceService(db.database, 'alice', 'bob', version), { online: true })
  for (const path of ['accounts/bob/preferences/presence', 'accounts/bob/preferences/discoverable', 'accounts/bob/privacy/currentVersion', 'playerBlocks/bob/alice', 'playerBlocks/alice/bob']) {
    const isolated = seed()
    isolated.write('presenceSessions/bob', { tab: true })
    isolated.write(path, path.includes('preferences') ? false : path.includes('currentVersion') ? 'stale' : 1)
    assert.deepEqual(await getPlayerPresenceService(isolated.database, 'alice', 'bob', version), { online: false })
  }
  assert.deepEqual(await getPlayerPresenceService(db.database, 'alice', 'missing', version), { online: false })
})

function discoverySeed(count: number, invalidPrefix = 0) {
  const db = seed()
  for (let index = 0; index < count + invalidPrefix; index += 1) {
    const uid = `p${String(index).padStart(4, '0')}`
    db.write(`accounts/${uid}`, account(uid))
    db.write(`presenceSessions/${uid}`, { tab: index >= invalidPrefix })
  }
  return db
}

test('online gets a real 21st eligible sentinel, keyset continuation, bounded candidates and exact account reads', async () => {
  const exactly = discoverySeed(20, 120)
  const lastPage = await listOnlinePlayersService(exactly.database, 'alice', version)
  assert.equal(lastPage.items.length, 20)
  assert.equal(lastPage.hasMore, false)
  const more = discoverySeed(21, 120)
  const page = await listOnlinePlayersService(more.database, 'alice', version)
  assert.equal(page.items.length, 20)
  assert.equal(page.hasMore, true)
  const next = await listOnlinePlayersService(more.database, 'alice', version, page.nextCursor)
  assert.equal(next.items.length, 1)
  assert.equal(next.hasMore, false)
  assert.notEqual(next.items[0]?.uid, page.items[19]?.uid)
  assert.ok(more.reads.every(({ path }) => path !== 'accounts' && path !== ''))
  const presenceReads = more.reads.filter(({ path }) => path === 'presenceSessions')
  assert.ok(presenceReads.every(({ limit }) => limit === PRESENCE_BATCH_SIZE))
  assert.ok(presenceReads.some(({ after }) => after !== undefined))
})

test('online excludes caller/blocks/private/stale/opted-out accounts and rejects ineligible callers', async () => {
  const db = seed()
  db.write('presenceSessions/alice', { tab: true })
  db.write('presenceSessions/bob', { tab: true })
  db.write('playerBlocks/bob/alice', 1)
  assert.deepEqual(await listOnlinePlayersService(db.database, 'alice', version), { items: [], hasMore: false })
  db.write('playerBlocks/bob/alice', null)
  db.write('accounts/bob/preferences/presence', false)
  assert.deepEqual(await listOnlinePlayersService(db.database, 'alice', version), { items: [], hasMore: false })
  db.write('accounts/alice/privacy/currentVersion', 'stale')
  await assert.rejects(() => listOnlinePlayersService(db.database, 'alice', version), SocialError)
})

test('online revalidates selected candidates and refills after an opt-out/block race', async () => {
  const db = discoverySeed(23)
  const original = db.database.ref.bind(db.database)
  let reads = 0
  db.database.ref = (path?: string) => {
    const reference = original(path)
    if (path === 'accounts/p0000') {
      const get = reference.get.bind(reference)
      reference.get = async () => {
        reads += 1
        if (reads === 2) {
          db.write('accounts/p0000/preferences/discoverable', false)
          db.write('playerBlocks/p0001/alice', 1)
        }
        return get()
      }
    }
    return reference
  }
  const page = await listOnlinePlayersService(db.database, 'alice', version)
  assert.equal(page.items.length, 20)
  assert.equal(page.hasMore, true)
  assert.ok(page.items.every((player) => player.uid !== 'p0000' && player.uid !== 'p0001'))
})

test('exactly-full presence batches still revalidate when the next candidate batch is empty', async () => {
  const db = discoverySeed(20, 80)
  const original = db.database.ref.bind(db.database)
  let presenceReads = 0
  db.database.ref = (path?: string) => {
    const reference = original(path)
    if (path === 'presenceSessions') {
      const orderByKey = reference.orderByKey.bind(reference)
      reference.orderByKey = () => {
        const query = orderByKey()
        const startAfter = query.startAfter.bind(query)
        query.startAfter = (cursor) => {
          const after = startAfter(cursor)
          const limitToFirst = after.limitToFirst.bind(after)
          after.limitToFirst = (limit) => {
            const bounded = limitToFirst(limit)
            const get = bounded.get.bind(bounded)
            bounded.get = async () => {
              presenceReads += 1
              db.write('accounts/p0080/preferences/discoverable', false)
              return get()
            }
            return bounded
          }
          return after
        }
        return query
      }
    }
    return reference
  }
  const page = await listOnlinePlayersService(db.database, 'alice', version)
  assert.equal(presenceReads, 1)
  assert.equal(page.items.length, 19)
  assert.equal(page.hasMore, false)
  assert.ok(page.items.every((player) => player.uid !== 'p0080'))
})

test('scan cap fails closed instead of fabricating a hasMore sentinel', async () => {
  const db = discoverySeed(0, 1001)
  await assert.rejects(() => listOnlinePlayersService(db.database, 'alice', version), (e: unknown) => e instanceof SocialError && e.code === 'failed-precondition')
})
