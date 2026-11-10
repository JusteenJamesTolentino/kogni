import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app'
import { getDatabase, type Database } from 'firebase-admin/database'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  blockPlayerService,
  buildPublicPlayerProfile,
  cleanupPrivatePlayer,
  followEdgeId,
  followPlayerService,
  getPlayerProfileService,
  isPublicPlayerProfile,
  reconcilePublicPlayerProfile,
  unblockPlayerService,
  unfollowPlayerService,
} from './social.js'

const privacyVersion = 'privacy-current'

function account(uid: string, discoverable = true) {
  const nickname = uid === 'alice' ? 'Alice_1' : uid === 'bob' ? 'Bob_1' : 'Cara_1'
  return {
    uid,
    status: 'ready',
    nickname,
    nicknameCanonical: nickname.toLowerCase(),
    privacy: {
      currentVersion: privacyVersion,
      acknowledgements: { [privacyVersion]: 1 },
    },
    preferences: { discoverable, presence: true },
  }
}

describe('social profile projection unit contract', () => {
  test('uses only exact safe fields and labels existing leaderboard XP as client-reported', () => {
    const profile = buildPublicPlayerProfile(account('alice'), 'alice', privacyVersion, {
      leaderboardValue: { xp: 42, email: 'must-not-project@example.test' },
      followerCount: 2,
      followingCount: 3,
      publishedDeckCount: 4,
    })
    assert.deepEqual(profile, {
      uid: 'alice',
      nickname: 'Alice_1',
      nicknameCanonical: 'alice_1',
      communityXp: 42,
      xpTrust: 'client-reported',
      followerCount: 2,
      followingCount: 3,
      publishedDeckCount: 4,
    })
    assert.equal(isPublicPlayerProfile(profile), true)
    assert.equal(isPublicPlayerProfile({ ...profile, online: true }), false)
    assert.equal(isPublicPlayerProfile({ ...profile, email: 'private@example.test' }), false)
  })

  test('does not project stale privacy or private accounts and safely defaults invalid XP', () => {
    assert.equal(buildPublicPlayerProfile(account('alice', false), 'alice', privacyVersion, {
      leaderboardValue: { xp: 9 }, followerCount: 0, followingCount: 0, publishedDeckCount: 0,
    }), null)
    assert.equal(buildPublicPlayerProfile(account('alice'), 'alice', 'privacy-next', {
      leaderboardValue: { xp: 9 }, followerCount: 0, followingCount: 0, publishedDeckCount: 0,
    }), null)
    const profile = buildPublicPlayerProfile(account('alice'), 'alice', privacyVersion, {
      leaderboardValue: { xp: -1 }, followerCount: -1, followingCount: 1.5, publishedDeckCount: 0,
    })
    assert.equal(profile?.communityXp, 0)
    assert.equal(profile?.followerCount, 0)
    assert.equal(profile?.followingCount, 0)
  })

  test('canonical edge IDs are stable, directional, and safe Firebase keys', () => {
    const first = followEdgeId('alice', 'bob')
    assert.equal(first, followEdgeId('alice', 'bob'))
    assert.notEqual(first, followEdgeId('bob', 'alice'))
    assert.match(first, /^[a-f0-9]{64}$/)
  })
})

const emulatorHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST
const integration = emulatorHost ? describe : describe.skip

integration('social services with Realtime Database emulator', { concurrency: false }, () => {
  let database: Database
  let appName = ''

  before(() => {
    appName = `social-test-${Date.now()}`
    const app = initializeApp({
      projectId: 'demo-kognit-rules',
      databaseURL: 'http://127.0.0.1:9002?ns=demo-kognit-rules',
    }, appName)
    database = getDatabase(app)
  })

  after(async () => {
    const app = getApps().find((candidate) => candidate.name === appName)
    if (app) await deleteApp(app)
  })

  beforeEach(async () => {
    await database.ref().set(null)
    await database.ref().update({
      'accounts/alice': account('alice'),
      'accounts/bob': account('bob'),
      'accounts/cara': account('cara'),
      'leaderboard/bob': { xp: 64 },
      'onlineDecks/public/head': {
        id: 'public', ownerId: 'bob', visibility: 'public', status: 'active', latestVersion: 1,
        title: 'Public', description: '', cardCount: 1, updatedAt: 1,
      },
      'onlineDecks/private/head': {
        id: 'private', ownerId: 'bob', visibility: 'private', status: 'active', latestVersion: 1,
        title: 'Private', description: '', cardCount: 1, updatedAt: 1,
      },
    })
  })

  test('follow and unfollow are immediate and idempotent with derived edges and counts', async () => {
    assert.deepEqual(await followPlayerService(database, 'alice', 'bob', privacyVersion, 100), {
      targetUid: 'bob', following: true,
    })
    await followPlayerService(database, 'alice', 'bob', privacyVersion, 200)

    const edgeId = followEdgeId('alice', 'bob')
    const root = (await database.ref().get()).val()
    assert.deepEqual(root.playerFollowEdges[edgeId], {
      followerUid: 'alice', followedUid: 'bob', createdAt: 100,
    })
    assert.equal(root.playerFollowing.alice.bob.edgeId, edgeId)
    assert.equal(root.playerFollowers.bob.alice.edgeId, edgeId)
    assert.equal(root.publicPlayerProfiles.alice.followingCount, 1)
    assert.equal(root.publicPlayerProfiles.bob.followerCount, 1)
    assert.equal(root.publicPlayerProfiles.bob.publishedDeckCount, 1)

    const read = await getPlayerProfileService(database, 'alice', 'bob', privacyVersion)
    assert.deepEqual(read.social, { following: true, followedBy: false })
    assert.equal(read.profile.communityXp, 64)
    assert.equal(read.profile.xpTrust, 'client-reported')

    await unfollowPlayerService(database, 'alice', 'bob', privacyVersion)
    await unfollowPlayerService(database, 'alice', 'bob', privacyVersion)
    assert.equal((await database.ref(`playerFollowEdges/${edgeId}`).get()).exists(), false)
    assert.equal((await database.ref('publicPlayerProfiles/alice/followingCount').get()).val(), 0)
    assert.equal((await database.ref('publicPlayerProfiles/bob/followerCount').get()).val(), 0)
  })

  test('rejects self, private targets, and either-direction blocks with generic unavailability', async () => {
    await assert.rejects(
      () => followPlayerService(database, 'alice', 'alice', privacyVersion),
      (error: unknown) => error instanceof HttpsError && error.code === 'invalid-argument',
    )
    await database.ref('accounts/bob/preferences/discoverable').set(false)
    await assert.rejects(
      () => followPlayerService(database, 'alice', 'bob', privacyVersion),
      (error: unknown) => error instanceof HttpsError && error.code === 'not-found' && error.message === 'Player is unavailable.',
    )
    await database.ref('accounts/bob/preferences/discoverable').set(true)
    await database.ref('playerBlocks/bob/alice').set(1)
    await assert.rejects(
      () => getPlayerProfileService(database, 'alice', 'bob', privacyVersion),
      (error: unknown) => error instanceof HttpsError && error.code === 'not-found' && error.message === 'Player is unavailable.',
    )
    await assert.rejects(
      () => followPlayerService(database, 'alice', 'bob', privacyVersion),
      (error: unknown) => error instanceof HttpsError && error.code === 'not-found' && error.message === 'Player is unavailable.',
    )
  })

  test('block is private and idempotent, removes both directions, and unblock never restores', async () => {
    await followPlayerService(database, 'alice', 'bob', privacyVersion, 10)
    await followPlayerService(database, 'bob', 'alice', privacyVersion, 20)
    await blockPlayerService(database, 'alice', 'bob', privacyVersion, 30)
    await blockPlayerService(database, 'alice', 'bob', privacyVersion, 40)

    assert.equal((await database.ref(`playerBlocks/alice/bob`).get()).val(), 30)
    assert.equal((await database.ref(`playerFollowEdges/${followEdgeId('alice', 'bob')}`).get()).exists(), false)
    assert.equal((await database.ref(`playerFollowEdges/${followEdgeId('bob', 'alice')}`).get()).exists(), false)
    assert.equal((await database.ref('publicPlayerProfiles/alice/followerCount').get()).val(), 0)
    assert.equal((await database.ref('publicPlayerProfiles/bob/followerCount').get()).val(), 0)

    await unblockPlayerService(database, 'alice', 'bob', privacyVersion)
    await unblockPlayerService(database, 'alice', 'bob', privacyVersion)
    assert.equal((await database.ref('playerBlocks/alice/bob').get()).exists(), false)
    assert.equal((await database.ref('playerFollowEdges').get()).exists(), false)
  })

  test('privacy cleanup removes profile, active/catalog data, all follows, and reconciles peers', async () => {
    await followPlayerService(database, 'alice', 'bob', privacyVersion, 10)
    await followPlayerService(database, 'bob', 'cara', privacyVersion, 20)
    await database.ref().update({
      'activePlayers/bob': { uid: 'bob', nickname: 'Bob_1', nicknameCanonical: 'bob_1' },
      'publicAccounts/bob': { uid: 'bob' },
      'publicProfiles/bob': { uid: 'bob' },
      'publicOnlineDeckCatalog/public': { ownerId: 'bob', updatedAt: 1 },
      'onlineDecksByOwner/bob/public': { ownerId: 'bob', updatedAt: 1 },
      'accounts/bob/preferences/discoverable': false,
    })
    await cleanupPrivatePlayer(database, 'bob', privacyVersion)

    for (const path of [
      'publicPlayerProfiles/bob', 'activePlayers/bob', 'publicAccounts/bob', 'publicProfiles/bob',
      'publicOnlineDeckCatalog/public', 'onlineDecksByOwner/bob',
      `playerFollowEdges/${followEdgeId('alice', 'bob')}`,
      `playerFollowEdges/${followEdgeId('bob', 'cara')}`,
    ]) {
      assert.equal((await database.ref(path).get()).exists(), false, path)
    }
    assert.equal((await database.ref('publicPlayerProfiles/alice/followingCount').get()).val(), 0)
    assert.equal((await database.ref('publicPlayerProfiles/cara/followerCount').get()).val(), 0)
  })

  test('profile reconciliation derives counts from canonical edges rather than client projections', async () => {
    await database.ref('playerFollowing/alice/bob').set({ forged: true })
    await database.ref('playerFollowers/bob/alice').set({ forged: true })
    const profile = await reconcilePublicPlayerProfile(database, 'bob', privacyVersion)
    assert.equal(profile?.followerCount, 0)
    assert.equal(profile?.followingCount, 0)
  })
})
