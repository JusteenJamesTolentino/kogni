import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eligibleTestAccount as account, memoryDatabase } from '../../../functions/src/core-test-helpers'
import { followEdgeId } from '../../../functions/src/social-core'

vi.mock('server-only', () => ({}))
const backend = vi.hoisted(() => ({ database: undefined as unknown, verify: vi.fn() }))
vi.mock('../../../src/lib/firebase-admin', () => ({
  adminDatabase: () => backend.database,
  adminAuth: () => ({ verifyIdToken: backend.verify }),
  AdminConfigurationError: class extends Error {},
  ADMIN_CONFIG_MESSAGE: 'Firebase Admin service is not configured correctly.',
}))

import { GET as online } from '../players/online/route'
import { GET as profile } from '../players/[uid]/route'
import { GET as decks } from '../players/[uid]/decks/route'
import { GET as summary } from '../players/me/social-summary/route'
import { GET as presence } from '../players/[uid]/presence/route'
import { POST as follow } from '../social/follow/route'
import { POST as unfollow } from '../social/unfollow/route'

function request(path: string, body?: string, token = true) {
  return new Request(`http://test.local${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { authorization: 'Bearer synthetic-token' } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body,
  })
}
function ctx(uid: string) { return { params: Promise.resolve({ uid }) } }
let memory: ReturnType<typeof memoryDatabase>

beforeEach(() => {
  vi.stubGlobal('process', { ...process, env: {} })
  backend.verify.mockReset().mockResolvedValue({ uid: 'alice' })
  memory = memoryDatabase({ accounts: { alice: account('alice'), bob: account('bob') }, leaderboard: { bob: { xp: 19 } }, presenceSessions: { bob: { tab: true } } })
  backend.database = memory.database
})

describe('server route contracts with in-memory database', () => {
  it('returns exact private owner summary and safe paginated deck metadata', async () => {
    memory.write(`playerFollowEdges/${followEdgeId('bob', 'alice')}`, { followerUid: 'bob', followedUid: 'alice', createdAt: 1 })
    memory.write(`playerFollowEdges/${followEdgeId('alice', 'bob')}`, { followerUid: 'alice', followedUid: 'bob', createdAt: 2 })
    memory.write('accounts/alice/preferences/discoverable', false)
    const owner = await summary(request('/api/players/me/social-summary'))
    expect(owner.status).toBe(200)
    expect(await owner.json()).toEqual({ followerCount: 1, followingCount: 1 })

    memory.write('accounts/alice/preferences/discoverable', true)
    for (let index = 0; index < 21; index += 1) {
      const id = `deck-${String(index).padStart(2, '0')}`
      memory.write(`onlineDecks/${id}`, { head: {
        id, ownerId: 'bob', visibility: 'public', status: 'active', latestVersion: 1,
        title: `Deck ${index}`, description: 'Safe', cardCount: 5, updatedAt: 100 - Math.floor(index / 2),
      }, versions: { private: { cards: { secret: true } } } })
    }
    memory.write('onlineDecks/private', { head: { id: 'private', ownerId: 'bob', visibility: 'private', status: 'active' } })
    const response = await decks(request('/api/players/bob/decks'), ctx('bob'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const page = await response.json() as { items: Record<string, unknown>[]; hasMore: boolean; nextCursor: string }
    expect(Object.keys(page).sort()).toEqual(['hasMore', 'items', 'nextCursor'])
    expect(page.items).toHaveLength(20)
    expect(page.hasMore).toBe(true)
    expect(Object.keys(page.items[0]!).sort()).toEqual([
      'cardCount', 'description', 'id', 'latestVersion', 'ownerId', 'ownerNickname',
      'ownerNicknameCanonical', 'title', 'titleCanonical', 'updatedAt',
    ])
    expect(JSON.stringify(page)).not.toContain('versions')
    expect(JSON.stringify(page)).not.toContain('cards')
    const next = await decks(request(`/api/players/bob/decks?cursor=${encodeURIComponent(page.nextCursor)}`), ctx('bob'))
    expect(await next.json()).toMatchObject({ items: [expect.objectContaining({ id: 'deck-20' })], hasMore: false })
  })

  it('sanitizes summary/deck auth, input, privacy and block failures', async () => {
    expect((await summary(request('/api/players/me/social-summary', undefined, false))).status).toBe(401)
    expect((await decks(request('/api/players/bob/decks', undefined, false), ctx('bob'))).status).toBe(401)
    for (const query of ['?cursor=', '?cursor=bad', '?cursor=x&cursor=y', '?unknown=true']) {
      expect((await decks(request(`/api/players/bob/decks${query}`), ctx('bob'))).status).toBe(400)
    }
    memory.write('playerBlocks/bob/alice', 1)
    const blocked = await decks(request('/api/players/bob/decks'), ctx('bob'))
    expect(blocked.status).toBe(404)
    expect(await blocked.json()).toEqual({ error: 'Player is unavailable.' })
  })

  it('returns agreed follow/unfollow/profile/presence/page shapes without Cloud Functions', async () => {
    const result = await follow(request('/api/social/follow', JSON.stringify({ uid: 'bob' })))
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({ targetUid: 'bob', following: true })
    expect(memory.read('publicPlayerProfiles/bob/followerCount')).toBe(1)
    expect(memory.read(`playerFollowEdges/${followEdgeId('alice', 'bob')}`)).toBeTruthy()
    const player = await profile(request('/api/players/bob'), ctx('bob'))
    expect(player.status).toBe(200)
    expect(await player.json()).toEqual({ profile: {
      uid: 'bob', nickname: 'User_bob', nicknameCanonical: 'user_bob', communityXp: 19,
      xpTrust: 'client-reported', followerCount: 1, followingCount: 0, publishedDeckCount: 0,
    }, social: { following: true, followedBy: false } })
    const state = await presence(request('/api/players/bob/presence'), ctx('bob'))
    expect(await state.json()).toEqual({ online: true })
    const page = await online(request('/api/players/online'))
    expect(await page.json()).toEqual({ items: [{ uid: 'bob', nickname: 'User_bob', nicknameCanonical: 'user_bob' }], hasMore: false })
    expect(page.headers.get('cache-control')).toBe('private, no-store')
    const removed = await unfollow(request('/api/social/unfollow', JSON.stringify({ uid: 'bob' })))
    expect(await removed.json()).toEqual({ targetUid: 'bob', following: false })
    expect(memory.read('publicPlayerProfiles/bob/followerCount')).toBe(0)
    expect(memory.reads.every(({ path }) => path !== 'accounts')).toBe(true)
  })

  it('keeps the exact browser page schema even with a real 21st sentinel', async () => {
    for (let index = 0; index < 22; index += 1) {
      const uid = `p${String(index).padStart(3, '0')}`
      memory.write(`accounts/${uid}`, account(uid))
      memory.write(`presenceSessions/${uid}`, { tab: true })
    }
    const response = await online(request('/api/players/online'))
    expect(response.status).toBe(200)
    const page = await response.json() as { items: { uid: string }[]; hasMore: boolean }
    expect(Object.keys(page).sort()).toEqual(['hasMore', 'items'])
    expect(page.items).toHaveLength(20)
    expect(page.hasMore).toBe(true)
    const after = page.items[19]?.uid
    const next = await (await online(request(`/api/players/online?after=${after}`))).json() as { items: { uid: string }[]; hasMore: boolean }
    expect(next.items).toHaveLength(3)
    expect(next.hasMore).toBe(false)
  })

  it('returns input 400 for malformed JSON/null/extra fields/path/self and invalid pagination', async () => {
    for (const body of ['{', 'null', '[]', '{}', '{"uid":"a/b"}', '{"uid":"alice"}', '{"uid":"bob","extra":true}']) {
      expect((await follow(request('/api/social/follow', body))).status).toBe(400)
      expect((await unfollow(request('/api/social/unfollow', body))).status).toBe(400)
    }
    expect((await profile(request('/api/players/bad'), ctx('a/b'))).status).toBe(400)
    expect((await presence(request('/api/players/bad/presence'), ctx('a/b'))).status).toBe(400)
    for (const query of ['?after=', '?after=a%2Fb', '?after=bob&after=bob', '?unknown=true']) {
      expect((await online(request(`/api/players/online${query}`))).status).toBe(400)
    }
  })

  it('returns bearer auth 401 for all routes, without database reads', async () => {
    expect((await online(request('/api/players/online', undefined, false))).status).toBe(401)
    expect((await profile(request('/api/players/bob', undefined, false), ctx('bob'))).status).toBe(401)
    expect((await presence(request('/api/players/bob/presence', undefined, false), ctx('bob'))).status).toBe(401)
    expect((await follow(request('/api/social/follow', '{"uid":"bob"}', false))).status).toBe(401)
    expect((await unfollow(request('/api/social/unfollow', '{"uid":"bob"}', false))).status).toBe(401)
    expect(memory.reads).toHaveLength(0)
  })

  it('private/blocked profiles and follow return generic 404, presence is indistinguishably offline', async () => {
    memory.write('playerBlocks/bob/alice', 1)
    const player = await profile(request('/api/players/bob'), ctx('bob'))
    expect(player.status).toBe(404)
    expect(await player.json()).toEqual({ error: 'Player is unavailable.' })
    expect((await follow(request('/api/social/follow', '{"uid":"bob"}'))).status).toBe(404)
    expect(await (await presence(request('/api/players/bob/presence'), ctx('bob'))).json()).toEqual({ online: false })
    expect(await (await presence(request('/api/players/missing/presence'), ctx('missing'))).json()).toEqual({ online: false })
  })

  it('returns sanitized 503 for stale caller and database errors', async () => {
    memory.write('accounts/alice/privacy/currentVersion', 'stale')
    expect((await online(request('/api/players/online'))).status).toBe(503)
    expect((await profile(request('/api/players/bob'), ctx('bob'))).status).toBe(503)
    memory.write('accounts/alice', account('alice'))
    backend.database = { ref: () => ({ get: () => Promise.reject(new Error('synthetic-sensitive-sdk-detail')) }) }
    const response = await presence(request('/api/players/bob/presence'), ctx('bob'))
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('synthetic-sensitive-sdk-detail')
  })
})
