import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildActivePlayerProjection,
  buildOnlineDeckProjectionRemoval,
  buildPublicOnlineDeckProjection,
} from './projections.js'

const privacyVersion = 'privacy-current'
const account = {
  uid: 'owner',
  status: 'ready',
  nickname: 'Owner_1',
  nicknameCanonical: 'owner_1',
  privacy: {
    currentVersion: privacyVersion,
    acknowledgements: { [privacyVersion]: 100 },
  },
  preferences: { discoverable: true, presence: true },
}

const head = {
  id: 'deck-one',
  ownerId: 'owner',
  visibility: 'public',
  status: 'active',
  latestVersion: 3,
  title: 'Biology 101',
  description: 'Cell basics',
  cardCount: 12,
  updatedAt: 1234,
  cards: { secret: true },
  studyGuide: 'must never project',
}

test('active player requires current privacy, both opt-ins, and actual live session', () => {
  assert.deepEqual(buildActivePlayerProjection(account, 'owner', { tab: true }, privacyVersion), {
    uid: 'owner', nickname: 'Owner_1', nicknameCanonical: 'owner_1',
  })
  assert.equal(buildActivePlayerProjection(account, 'owner', {}, privacyVersion), null)
  assert.equal(buildActivePlayerProjection({ ...account, preferences: { discoverable: false, presence: true } }, 'owner', { tab: true }, privacyVersion), null)
  assert.equal(buildActivePlayerProjection(account, 'owner', { tab: true }, 'privacy-next'), null)
})

test('tombstone cleanup targets catalog and every known owner index', () => {
  assert.deepEqual(buildOnlineDeckProjectionRemoval('deck-one', 'owner', 'previous-owner'), {
    catalogDeckId: 'deck-one',
    ownerDeckIds: ['owner', 'previous-owner'],
  })
  assert.deepEqual(buildOnlineDeckProjectionRemoval('deck-one', 'owner', 'owner').ownerDeckIds, ['owner'])
})

test('deck catalog exposes only safe metadata for active public heads and discoverable current owners', () => {
  const projection = buildPublicOnlineDeckProjection(head, 'deck-one', account, privacyVersion)
  assert.deepEqual(projection, {
    id: 'deck-one', ownerId: 'owner', ownerNickname: 'Owner_1', ownerNicknameCanonical: 'owner_1',
    title: 'Biology 101', titleCanonical: 'biology 101', description: 'Cell basics', cardCount: 12,
    latestVersion: 3, updatedAt: 1234,
  })
  assert.equal(Object.hasOwn(projection ?? {}, 'cards'), false)
  assert.equal(Object.hasOwn(projection ?? {}, 'studyGuide'), false)
  assert.equal(buildPublicOnlineDeckProjection({ ...head, status: 'archived' }, 'deck-one', account, privacyVersion), null)
  assert.equal(buildPublicOnlineDeckProjection({ ...head, visibility: 'unlisted' }, 'deck-one', account, privacyVersion), null)
  assert.equal(buildPublicOnlineDeckProjection(head, 'deck-one', { ...account, preferences: { discoverable: false, presence: true } }, privacyVersion), null)
})
