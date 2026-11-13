import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from 'firebase/auth'

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as null | { uid: string; getIdToken: ReturnType<typeof vi.fn> } },
  fetch: vi.fn(),
  get: vi.fn(),
  ref: vi.fn(),
  update: vi.fn(),
  query: vi.fn(),
}))
vi.mock('../../src/lib/firebase', () => ({ auth: mocks.auth, database: {} }))
vi.mock('firebase/database', () => ({
  get: mocks.get,
  ref: mocks.ref,
  update: mocks.update,
  query: mocks.query,
  orderByChild: (key: string) => ({ orderByChild: key }),
  limitToLast: (limit: number) => ({ limitToLast: limit }),
  serverTimestamp: () => 100,
}))

import { isActivePlayersPage, listActivePlayers, listPublicOnlineDecksByOwner, listRecentPublicOnlineDecks } from '../../src/lib/discovery'
import { blockPlayer, followPlayer, getPlayerProfile, getSocialSummary, isGetPlayerProfileResult, isPlayerDeckPage, isSocialSummary, listPlayerDecks, unfollowPlayer, unblockPlayer } from '../../src/lib/social'
import { PRIVACY_VERSION, updateAccountPreferences } from '../../src/lib/account'

const player = { uid: 'player-1', nickname: 'Player_One', nicknameCanonical: 'player_one' }
const profile = { ...player, communityXp: 10, xpTrust: 'client-reported', followerCount: 1, followingCount: 2, publishedDeckCount: 3 }
const profileResult = { profile, social: { following: false, followedBy: true } }
const deck = {
  id: 'deck-1', ownerId: 'player-1', ownerNickname: 'Player_One', ownerNicknameCanonical: 'player_one',
  title: 'Biology', titleCanonical: 'biology', description: 'Cells', cardCount: 10, latestVersion: 2, updatedAt: 100,
}

beforeEach(() => {
  mocks.auth.currentUser = { uid: 'viewer', getIdToken: vi.fn().mockResolvedValue('test-token') }
  mocks.fetch.mockReset()
  mocks.get.mockReset()
  mocks.update.mockReset().mockResolvedValue(undefined)
  mocks.ref.mockReset().mockImplementation((_database, path) => ({ path }))
  mocks.query.mockReset().mockImplementation((reference, ...constraints) => ({ reference, constraints }))
  vi.stubGlobal('fetch', mocks.fetch)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('server-owned player discovery and social operations', () => {
  it('validates exact bounded active-player pages including empty pages', async () => {
    const page = { items: [player], hasMore: false }
    expect(isActivePlayersPage(page)).toBe(true)
    expect(isActivePlayersPage({ items: [], hasMore: false })).toBe(true)
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(page)))
    expect(await listActivePlayers()).toEqual(page)
    expect(mocks.fetch).toHaveBeenCalledWith('/api/players/online', expect.any(Object))
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.ref).not.toHaveBeenCalled()
  })

  it.each([
    null, [], {}, { items: [], hasMore: 1 }, { items: {}, hasMore: false },
    { items: [null], hasMore: false }, { items: [{ ...player, email: 'private@example.test' }], hasMore: false },
    { items: [player, player], hasMore: false }, { items: [], hasMore: false, sessions: {} },
    { items: Array.from({ length: 21 }, (_, index) => ({ ...player, uid: `player-${index}` })), hasMore: true },
  ])('rejects malformed/private discovery pages without an RTDB fallback %j', async (body) => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(body)))
    await expect(listActivePlayers()).rejects.toMatchObject({ code: 'invalid-response' })
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.ref).not.toHaveBeenCalled()
  })

  it('strictly validates owner summaries and trusted deck pages with encoded cursors', async () => {
    expect(isSocialSummary({ followerCount: 1, followingCount: 2 })).toBe(true)
    expect(isSocialSummary({ followerCount: 1, followingCount: 2, uid: 'viewer' })).toBe(false)
    mocks.fetch.mockResolvedValueOnce(new Response('{"followerCount":1,"followingCount":2}'))
    expect(await getSocialSummary()).toEqual({ followerCount: 1, followingCount: 2 })
    expect(mocks.fetch).toHaveBeenNthCalledWith(1, '/api/players/me/social-summary', expect.any(Object))

    const cursor = '100:ZGVjay0x'
    const page = { items: [deck], hasMore: false }
    expect(isPlayerDeckPage(page)).toBe(true)
    expect(isPlayerDeckPage({ ...page, nextCursor: cursor })).toBe(false)
    expect(isPlayerDeckPage({ items: [deck], hasMore: true, nextCursor: cursor })).toBe(false)
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify(page)))
    expect(await listPlayerDecks('player-1', cursor)).toEqual(page)
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, `/api/players/player-1/decks?cursor=${encodeURIComponent(cursor)}`, expect.any(Object))
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.ref).not.toHaveBeenCalled()
  })

  it.each([
    null,
    {},
    { followerCount: -1, followingCount: 0 },
    { items: [], hasMore: true, nextCursor: '100:ZGVjaw' },
    { items: [deck, deck], hasMore: false },
    { items: [{ ...deck, cards: [] }], hasMore: false },
    { items: [{ ...deck, updatedAt: 1.5 }], hasMore: false },
  ])('rejects malformed summary/deck API data without a Firebase fallback %j', async (body) => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(body)))
    const operation = body && typeof body === 'object' && 'followerCount' in body
      ? getSocialSummary()
      : listPlayerDecks('player-1')
    await expect(operation).rejects.toMatchObject({ code: 'invalid-response' })
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.ref).not.toHaveBeenCalled()
  })

  it('loads exact profile and social fields from the authenticated profile endpoint', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(profileResult)))
    expect(await getPlayerProfile('player-1')).toEqual(profileResult)
    expect(mocks.fetch).toHaveBeenCalledWith('/api/players/player-1', expect.any(Object))
    expect(isGetPlayerProfileResult(profileResult)).toBe(true)
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it.each([
    null, [], {}, { ...profileResult, privateAccount: {} },
    { ...profileResult, profile: { ...profile, uid: 'other' } },
    { ...profileResult, profile: { ...profile, xpTrust: 'client-reported-v1' } },
    { ...profileResult, social: { following: true } },
    { ...profileResult, social: { following: false, followedBy: false, online: true } },
    { ...profileResult, social: { following: 'false', followedBy: true } },
  ])('rejects invalid or mismatched profiles without fallback %j', async (body) => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(body)))
    await expect(getPlayerProfile('player-1')).rejects.toMatchObject({ code: 'invalid-response' })
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('posts only the target uid and validates both follow and unfollow results', async () => {
    mocks.fetch.mockResolvedValueOnce(new Response('{"targetUid":"player-1","following":true}'))
      .mockResolvedValueOnce(new Response('{"targetUid":"player-1","following":false}'))
    expect(await followPlayer('player-1')).toEqual({ targetUid: 'player-1', following: true })
    expect(await unfollowPlayer('player-1')).toEqual({ targetUid: 'player-1', following: false })
    expect(mocks.fetch).toHaveBeenNthCalledWith(1, '/api/social/follow', expect.objectContaining({ method: 'POST', body: '{"uid":"player-1"}' }))
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, '/api/social/unfollow', expect.objectContaining({ method: 'POST', body: '{"uid":"player-1"}' }))
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each([
    ['follow', { targetUid: 'other', following: true }],
    ['follow', { targetUid: 'player-1', following: false }],
    ['unfollow', { targetUid: 'player-1', following: true }],
    ['unfollow', { targetUid: 'player-1', following: false, account: {} }],
    ['follow', { targetUid: 'player-1', following: 'true' }],
    ['follow', null],
  ] as const)('rejects invalid %s success data without any direct social write', async (operation, body) => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(body)))
    await expect((operation === 'follow' ? followPlayer : unfollowPlayer)('player-1')).rejects.toMatchObject({ code: 'invalid-response' })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.ref).not.toHaveBeenCalled()
  })

  it.each([listActivePlayers, () => getPlayerProfile('player-1'), () => followPlayer('player-1'), () => unfollowPlayer('player-1')])('propagates server/non-JSON/network/auth failures without reading/writing player RTDB data', async (operation) => {
    mocks.fetch.mockResolvedValueOnce(new Response('{"error":"Denied"}', { status: 403 }))
    await expect(operation()).rejects.toMatchObject({ message: 'Denied', status: 403 })
    mocks.fetch.mockResolvedValueOnce(new Response('<html>Unavailable</html>', { status: 500 }))
    await expect(operation()).rejects.toMatchObject({ code: 'http-error' })
    mocks.fetch.mockRejectedValueOnce(new Error('Offline'))
    await expect(operation()).rejects.toThrow('Offline')
    mocks.auth.currentUser = null
    await expect(operation()).rejects.toMatchObject({ code: 'authentication-required' })
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.ref).not.toHaveBeenCalled()
  })

  it('preserves explicit optional blocking/unblocking behavior', async () => {
    await expect(blockPlayer('player-1')).rejects.toThrow('optional social service')
    await expect(unblockPlayer('player-1')).rejects.toThrow('optional social service')
    await expect(blockPlayer('bad/uid')).rejects.toThrow('Firebase key')
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('passes caller cancellation through discovery/social request options', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(listActivePlayers({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    await expect(getPlayerProfile('player-1', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    await expect(followPlayer('player-1', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})

describe('unrelated browser RTDB contracts stay intact', () => {
  it('retains bounded recent and per-owner deck metadata queries', async () => {
    mocks.get.mockResolvedValue({ val: () => ({ 'deck-1': deck }) })
    expect(await listRecentPublicOnlineDecks()).toEqual({ items: [deck], hasMore: false })
    expect(await listPublicOnlineDecksByOwner('player-1')).toEqual({ items: [deck], hasMore: false })
    expect(mocks.query).toHaveBeenNthCalledWith(1, { path: 'publicOnlineDeckCatalog' }, { orderByChild: 'updatedAt' }, { limitToLast: 21 })
    expect(mocks.query).toHaveBeenNthCalledWith(2, { path: 'onlineDecksByOwner/player-1' }, { orderByChild: 'updatedAt' }, { limitToLast: 21 })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('updates opt-ins without deleting server-owned activePlayers data', async () => {
    const account = {
      uid: 'viewer', status: 'ready', nickname: 'Viewer', nicknameCanonical: 'viewer', createdAt: 1, updatedAt: 2,
      privacy: { currentVersion: PRIVACY_VERSION, acknowledgedAt: 1, acknowledgements: { [PRIVACY_VERSION]: 1 } },
      preferences: { presence: true, discoverable: true },
    }
    mocks.get.mockResolvedValue({ val: () => account })
    const updated = await updateAccountPreferences({ uid: 'viewer' } as User, { presence: false, discoverable: false })
    expect(updated.preferences).toEqual({ presence: false, discoverable: false })
    const patch = mocks.update.mock.calls[0][1]
    expect(patch['presenceSessions/viewer']).toBeNull()
    expect(patch['publicAccounts/viewer']).toBeNull()
    expect(patch['publicProfiles/viewer']).toBeNull()
    expect(Object.keys(patch).some((path) => path.startsWith('activePlayers/'))).toBe(false)
  })
})
