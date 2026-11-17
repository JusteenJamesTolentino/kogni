import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { endAt, get, limitToFirst, limitToLast, orderByChild, orderByKey, query, ref, set, startAt, update } from 'firebase/database'

const PROJECT_ID = 'demo-kognit-rules'
const OWNER_ID = 'owner-user'
const RECIPIENT_ID = 'recipient-user'
const OUTSIDER_ID = 'outsider-user'
const SHARE_ID = 'share-example'
const PORTAL_CODE = '0123456789AB'
const ROTATED_PORTAL_CODE = 'CDEFGHJKMNPQ'
const PORTAL_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
const PRIVACY_VERSION = 'privacy-2026-11-17-quiz-integrity-1'

function accountRecord(
  uid: string,
  nickname: string,
  preferences = { discoverable: false, presence: false },
  role?: 'student' | 'teacher',
) {
  const now = Date.now()
  return {
    uid,
    status: 'ready',
    nickname,
    nicknameCanonical: nickname.toLowerCase(),
    createdAt: now,
    updatedAt: now,
    privacy: {
      currentVersion: PRIVACY_VERSION,
      acknowledgedAt: now,
      acknowledgements: { [PRIVACY_VERSION]: now },
    },
    preferences,
    ...(role ? { role, roleUpdatedAt: now } : {}),
  }
}
const ONLINE_DECK_ID = 'online-deck-example'
const ONLINE_CARD_ID = 'stable-card'

function onlineVersion(version: number, baseVersion: number, now = Date.now(), contentRevision = 1) {
  return {
    deckId: ONLINE_DECK_ID,
    ownerId: OWNER_ID,
    version,
    baseVersion,
    title: `Online Biology v${version}`,
    description: 'Cell basics',
    cardCount: 1,
    publishedAt: now,
    cardOrder: { 0: ONLINE_CARD_ID },
    cards: {
      [ONLINE_CARD_ID]: {
        id: ONLINE_CARD_ID,
        order: 0,
        contentRevision,
        question: 'What is ATP?',
        answer: 'Energy currency',
        distractors: ['Protein'],
      },
    },
  }
}

function onlineDeck(visibility: 'private' | 'unlisted' | 'public' = 'private', now = Date.now()) {
  const version = onlineVersion(1, 0, now)
  return {
    head: {
      id: ONLINE_DECK_ID,
      ownerId: OWNER_ID,
      visibility,
      status: 'active',
      latestVersion: 1,
      title: version.title,
      description: version.description,
      cardCount: 1,
      offlinePolicy: { allowed: false, maxQuestions: 0 },
      createdAt: now,
      updatedAt: now,
    },
    versions: { 1: version },
  }
}

function seriesOnlineDeck(now = Date.now()) {
  const cards: Record<string, { id: string; order: number; contentRevision: number; question: string; answer: string; distractors: string[] }> = {}
  const cardOrder: Record<string, string> = {}
  for (let index = 0; index < 30; index += 1) {
    const id = `series-card-${index + 1}`
    cards[id] = { id, order: index, contentRevision: 1, question: `Question ${index + 1}`, answer: `Answer ${index + 1}`, distractors: [] }
    cardOrder[String(index)] = id
  }
  const version = {
    deckId: 'series-deck-one', ownerId: OWNER_ID, version: 1, baseVersion: 0,
    title: 'Series Biology', description: '', cardCount: 30, publishedAt: now, cardOrder, cards,
  }
  return {
    head: {
      id: 'series-deck-one', ownerId: OWNER_ID, visibility: 'public', status: 'active', latestVersion: 1,
      title: version.title, description: '', cardCount: 30, offlinePolicy: { allowed: true, maxQuestions: 30 },
      createdAt: now, updatedAt: now, seriesId: 'series-one', partNumber: 1,
    },
    versions: { 1: version },
  }
}

function onlineReview(now = Date.now(), eventId = 'review-one') {
  return {
    state: {
      deckId: ONLINE_DECK_ID,
      cardId: ONLINE_CARD_ID,
      deckVersion: 1,
      contentRevision: 1,
      scheduleRevision: 1,
      reviewCount: 1,
      interval: 1,
      repetition: 1,
      easinessFactor: 2.5,
      nextReviewDate: now + 86400000,
      lastReviewedAt: now,
      lastEventId: eventId,
      updatedAt: now,
    },
    events: {
      [eventId]: {
        id: eventId,
        uid: RECIPIENT_ID,
        deckId: ONLINE_DECK_ID,
        cardId: ONLINE_CARD_ID,
        deckVersion: 1,
        contentRevision: 1,
        rating: 4,
        reviewedAt: now,
        scheduleRevisionBefore: 0,
        interval: 1,
        repetition: 1,
        easinessFactor: 2.5,
        nextReviewDate: now + 86400000,
      },
    },
  }
}

let testEnvironment: RulesTestEnvironment

const sharedDeck = {
  id: SHARE_ID,
  ownerId: OWNER_ID,
  recipientId: RECIPIENT_ID,
  senderDisplayName: 'Owner Learner',
  lineageId: 'lineage-example',
  title: 'Shared Biology',
  description: 'Cell basics',
  studyGuide: 'Cells exchange matter and energy.\n\nATP supports cellular work.',
  cardCount: 1,
  createdAt: Date.now(),
  cards: {
    card_0: {
      id: 'card_0',
      question: 'What is ATP?',
      answer: 'Energy currency',
      distractors: ['Protein'],
    },
  },
}

const inboxItem = {
  id: SHARE_ID,
  sharedDeckId: SHARE_ID,
  ownerId: OWNER_ID,
  senderDisplayName: 'Owner Learner',
  lineageId: 'lineage-example',
  title: 'Shared Biology',
  description: 'Cell basics',
  cardCount: 1,
  createdAt: sharedDeck.createdAt,
}

function portal(code: string, now = Date.now(), expiresInDays = 30) {
  return {
    id: code,
    ownerId: OWNER_ID,
    ownerDisplayName: 'Owner Learner',
    sourceDeckId: 'owner-local-deck',
    status: 'active',
    createdAt: now,
    expiresAt: now + expiresInDays * 24 * 60 * 60 * 1000,
    snapshot: {
      lineageId: 'lineage-example',
      title: 'Reusable Biology',
      description: 'Cell basics',
      studyGuide: 'Cells exchange matter and energy.',
      cardCount: 1,
      cards: {
        card_0: {
          id: 'card_0',
          question: 'What is ATP?',
          answer: 'Energy currency',
          distractors: ['Protein'],
        },
      },
    },
  }
}

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: {
      rules: readFileSync('database.rules.json', 'utf8'),
      host: '127.0.0.1',
      port: 9012,
    },
  })
})

afterAll(async () => {
  await testEnvironment.cleanup()
})

beforeEach(async () => {
  await testEnvironment.clearDatabase()
})

const describeRules = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? describe : describe.skip

describeRules('community database rules', () => {
  it('allows an owner to share atomically and only granted users to read the snapshot', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const recipientDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    const outsiderDatabase = testEnvironment.authenticatedContext(OUTSIDER_ID).database()

    await assertSucceeds(update(ref(ownerDatabase), {
      [`sharedDecks/${SHARE_ID}`]: sharedDeck,
      [`sharedWithMe/${RECIPIENT_ID}/${SHARE_ID}`]: inboxItem,
    }))

    await assertSucceeds(get(ref(recipientDatabase, `sharedDecks/${SHARE_ID}`)))
    await assertFails(get(ref(outsiderDatabase, `sharedDecks/${SHARE_ID}`)))
  })

  it('accepts legacy shares without a study guide and rejects oversized guides', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()

    await assertSucceeds(update(ref(ownerDatabase), {
      'sharedDecks/legacy-share': {
        ...sharedDeck,
        id: 'legacy-share',
        studyGuide: null,
        createdAt: Date.now(),
      },
    }))

    await assertFails(update(ref(ownerDatabase), {
      'sharedDecks/oversized-guide': {
        ...sharedDeck,
        id: 'oversized-guide',
        studyGuide: 'x'.repeat(8001),
        createdAt: Date.now(),
      },
    }))
  })

  it('prevents a recipient from forging another share', async () => {
    const recipientDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()

    await assertFails(update(ref(recipientDatabase), {
      'sharedDecks/forged-share': {
        ...sharedDeck,
        id: 'forged-share',
        ownerId: OWNER_ID,
      },
      [`sharedWithMe/${RECIPIENT_ID}/forged-share`]: {
        ...inboxItem,
        id: 'forged-share',
        sharedDeckId: 'forged-share',
      },
    }))
  })

  it('lets the recipient dismiss their inbox item without deleting the shared snapshot', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const recipientDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()

    await assertSucceeds(update(ref(ownerDatabase), {
      [`sharedDecks/${SHARE_ID}`]: { ...sharedDeck, createdAt: Date.now() },
      [`sharedWithMe/${RECIPIENT_ID}/${SHARE_ID}`]: { ...inboxItem, createdAt: Date.now() },
    }))
    await assertSucceeds(update(ref(recipientDatabase), {
      [`sharedWithMe/${RECIPIENT_ID}/${SHARE_ID}`]: null,
    }))
    const sharedSnapshot = await get(ref(recipientDatabase, `sharedDecks/${SHARE_ID}`))
    expect(sharedSnapshot.exists()).toBe(true)
  })
})

describeRules('deck portal database rules', () => {
  it('requires auth and permits exact-key reads only while active and unexpired', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const readerDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    const unauthenticatedDatabase = testEnvironment.unauthenticatedContext().database()
    const record = portal(PORTAL_CODE)

    await assertSucceeds(update(ref(ownerDatabase), {
      [`deckPortals/${PORTAL_CODE}`]: record,
      [`portalByDeck/${OWNER_ID}/${record.sourceDeckId}`]: PORTAL_CODE,
    }))
    await assertSucceeds(get(ref(readerDatabase, `deckPortals/${PORTAL_CODE}`)))
    await assertFails(get(ref(unauthenticatedDatabase, `deckPortals/${PORTAL_CODE}`)))
    await assertFails(get(ref(readerDatabase, 'deckPortals')))

    const expired = portal(ROTATED_PORTAL_CODE, Date.now() - 2 * 24 * 60 * 60 * 1000, 1)
    expired.sourceDeckId = 'expired-local-deck'
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), `deckPortals/${ROTATED_PORTAL_CODE}`), expired)
    })
    await assertFails(get(ref(readerDatabase, `deckPortals/${ROTATED_PORTAL_CODE}`)))
    await assertSucceeds(get(ref(ownerDatabase, `deckPortals/${ROTATED_PORTAL_CODE}`)))
  })

  it('lets only the owner renew and keeps immutable content and IDs', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const outsiderDatabase = testEnvironment.authenticatedContext(OUTSIDER_ID).database()
    const record = portal(PORTAL_CODE)
    await assertSucceeds(update(ref(ownerDatabase), {
      [`deckPortals/${PORTAL_CODE}`]: record,
      [`portalByDeck/${OWNER_ID}/${record.sourceDeckId}`]: PORTAL_CODE,
    }))

    await assertFails(update(ref(outsiderDatabase, `deckPortals/${PORTAL_CODE}`), {
      expiresAt: Date.now() + PORTAL_LIFETIME_MS,
    }))
    await assertSucceeds(update(ref(ownerDatabase, `deckPortals/${PORTAL_CODE}`), {
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    }))
    await assertFails(update(ref(ownerDatabase, `deckPortals/${PORTAL_CODE}`), {
      expiresAt: Date.now() + 31 * 24 * 60 * 60 * 1000,
    }))
    await assertFails(update(ref(ownerDatabase, `deckPortals/${PORTAL_CODE}`), {
      sourceDeckId: 'changed-source',
    }))
    await assertFails(update(ref(ownerDatabase, `deckPortals/${PORTAL_CODE}/snapshot`), {
      title: 'Changed title',
    }))
    await assertFails(update(ref(ownerDatabase, `deckPortals/${PORTAL_CODE}`), {
      ownerId: OUTSIDER_ID,
    }))
  })

  it('revokes permanently, removes the active mapping, and preserves owner access', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const readerDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    const record = portal(PORTAL_CODE)
    await assertSucceeds(update(ref(ownerDatabase), {
      [`deckPortals/${PORTAL_CODE}`]: record,
      [`portalByDeck/${OWNER_ID}/${record.sourceDeckId}`]: PORTAL_CODE,
    }))

    await assertSucceeds(update(ref(ownerDatabase), {
      [`deckPortals/${PORTAL_CODE}/status`]: 'revoked',
      [`deckPortals/${PORTAL_CODE}/revokedAt`]: Date.now(),
      [`portalByDeck/${OWNER_ID}/owner-local-deck`]: null,
    }))
    await assertSucceeds(get(ref(ownerDatabase, `deckPortals/${PORTAL_CODE}`)))
    await assertFails(get(ref(readerDatabase, `deckPortals/${PORTAL_CODE}`)))
    await assertFails(update(ref(ownerDatabase, `deckPortals/${PORTAL_CODE}`), {
      status: 'active',
      revokedAt: null,
    }))
    await assertFails(update(ref(ownerDatabase), {
      [`deckPortals/${PORTAL_CODE}`]: null,
    }))
    await assertFails(update(ref(ownerDatabase), {
      [`deckPortals/${PORTAL_CODE}`]: portal(PORTAL_CODE),
      [`portalByDeck/${OWNER_ID}/owner-local-deck`]: PORTAL_CODE,
    }))
  })

  it('rotates atomically and rejects a second active mapping', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const existing = portal(PORTAL_CODE)
    await assertSucceeds(update(ref(ownerDatabase), {
      [`deckPortals/${PORTAL_CODE}`]: existing,
      [`portalByDeck/${OWNER_ID}/${existing.sourceDeckId}`]: PORTAL_CODE,
    }))
    await assertFails(update(ref(ownerDatabase), {
      'deckPortals/RSTVWXYZ0123': portal('RSTVWXYZ0123'),
      [`portalByDeck/${OWNER_ID}/${existing.sourceDeckId}`]: 'RSTVWXYZ0123',
    }))
    const replacement = portal(ROTATED_PORTAL_CODE)

    await assertSucceeds(update(ref(ownerDatabase), {
      [`deckPortals/${PORTAL_CODE}/status`]: 'revoked',
      [`deckPortals/${PORTAL_CODE}/revokedAt`]: Date.now(),
      [`deckPortals/${ROTATED_PORTAL_CODE}`]: replacement,
      [`portalByDeck/${OWNER_ID}/owner-local-deck`]: ROTATED_PORTAL_CODE,
    }))
    await assertFails(update(ref(ownerDatabase), {
      'deckPortals/RSTVWXYZ0123': portal('RSTVWXYZ0123'),
    }))
  })

  it('enforces community-equivalent content limits and owner-local mapping', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const malformed = portal('23456789ABCD')
    malformed.snapshot.studyGuide = 'x'.repeat(8001)

    await assertFails(update(ref(ownerDatabase), {
      'deckPortals/23456789ABCD': malformed,
      [`portalByDeck/${OWNER_ID}/owner-local-deck`]: '23456789ABCD',
    }))
    const oneDay = portal(ROTATED_PORTAL_CODE, Date.now(), 1)
    oneDay.sourceDeckId = 'another-local-deck'
    await assertSucceeds(update(ref(ownerDatabase), {
      [`deckPortals/${ROTATED_PORTAL_CODE}`]: oneDay,
      [`portalByDeck/${OWNER_ID}/another-local-deck`]: ROTATED_PORTAL_CODE,
    }))
    const overlong = portal('3456789ABCDE', Date.now(), 31)
    overlong.sourceDeckId = 'third-local-deck'
    await assertFails(update(ref(ownerDatabase), {
      'deckPortals/3456789ABCDE': overlong,
      [`portalByDeck/${OWNER_ID}/third-local-deck`]: '3456789ABCDE',
    }))
    await assertFails(update(ref(ownerDatabase), {
      'portalByDeck/another-user/owner-local-deck': ROTATED_PORTAL_CODE,
    }))
  })
})

describeRules('account privacy, nickname, and presence rules', () => {
  it('atomically onboards with private defaults and a case-insensitive claim', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const outsiderDatabase = testEnvironment.authenticatedContext(OUTSIDER_ID).database()
    const account = accountRecord(OWNER_ID, 'Ada_2026')

    await assertSucceeds(update(ref(ownerDatabase), {
      [`nicknameClaims/${account.nicknameCanonical}`]: OWNER_ID,
      [`accounts/${OWNER_ID}`]: account,
    }))
    await assertSucceeds(get(ref(ownerDatabase, `accounts/${OWNER_ID}`)))
    await assertFails(get(ref(outsiderDatabase, `accounts/${OWNER_ID}`)))
    await assertFails(get(ref(ownerDatabase, `nicknameClaims/${account.nicknameCanonical}`)))
    await assertFails(update(ref(outsiderDatabase), {
      [`nicknameClaims/${account.nicknameCanonical}`]: OUTSIDER_ID,
      [`accounts/${OUTSIDER_ID}`]: accountRecord(OUTSIDER_ID, 'ADA_2026'),
    }))
  })

  it('allows re-acknowledging a newer privacy version on an existing account', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const stale = { ...accountRecord(OWNER_ID, 'Ada_2026'), privacy: {
      currentVersion: 'privacy-2026-11-10-ai-series-1',
      acknowledgedAt: 1,
      acknowledgements: { 'privacy-2026-11-10-ai-series-1': 1 },
    } }
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const database = context.database()
      await set(ref(database, `nicknameClaims/ada_2026`), OWNER_ID)
      await set(ref(database, `accounts/${OWNER_ID}`), stale)
    })

    const now = Date.now()
    await assertSucceeds(update(ref(ownerDatabase, `accounts/${OWNER_ID}`), {
      privacy: { currentVersion: PRIVACY_VERSION, acknowledgedAt: now, acknowledgements: { [PRIVACY_VERSION]: now } },
      updatedAt: now,
    }))
    const stored = (await get(ref(ownerDatabase, `accounts/${OWNER_ID}`))).val() as { privacy: { currentVersion: string } }
    expect(stored.privacy.currentVersion).toBe(PRIVACY_VERSION)

    // The stale privacy block itself is still rejected — only the current version validates.
    await assertFails(update(ref(ownerDatabase, `accounts/${OWNER_ID}`), {
      privacy: { currentVersion: 'privacy-2026-11-10-ai-series-1', acknowledgedAt: Date.now(), acknowledgements: { 'privacy-2026-11-10-ai-series-1': Date.now() } },
      updatedAt: Date.now(),
    }))
  })

  it('rejects malformed nicknames, old privacy acknowledgement, and public email fields', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const malformed = accountRecord(OWNER_ID, 'ab')
    const stale = accountRecord(OWNER_ID, 'Valid_Name')
    stale.privacy.currentVersion = 'privacy-old'

    await assertFails(update(ref(ownerDatabase), {
      'nicknameClaims/ab': OWNER_ID,
      [`accounts/${OWNER_ID}`]: malformed,
    }))
    await assertFails(update(ref(ownerDatabase), {
      'nicknameClaims/valid_name': OWNER_ID,
      [`accounts/${OWNER_ID}`]: stale,
    }))

    const discoverable = accountRecord(OWNER_ID, 'Visible_1', { discoverable: true, presence: false })
    await assertFails(update(ref(ownerDatabase), {
      'nicknameClaims/visible_1': OWNER_ID,
      [`accounts/${OWNER_ID}`]: discoverable,
      [`publicAccounts/${OWNER_ID}`]: {
        uid: OWNER_ID,
        nickname: 'Visible_1',
        nicknameCanonical: 'visible_1',
        email: 'must-not-be-public@example.test',
        updatedAt: Date.now(),
      },
    }))
  })

  it('renames atomically, releases the old claim, and updates the projection', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const account = accountRecord(OWNER_ID, 'First_Name')
    await assertSucceeds(update(ref(ownerDatabase), {
      'nicknameClaims/first_name': OWNER_ID,
      [`accounts/${OWNER_ID}`]: account,
    }))
    await assertSucceeds(update(ref(ownerDatabase), {
      'nicknameClaims/first_name': null,
      'nicknameClaims/next_name': OWNER_ID,
      [`accounts/${OWNER_ID}/nickname`]: 'Next_Name',
      [`accounts/${OWNER_ID}/nicknameCanonical`]: 'next_name',
      [`accounts/${OWNER_ID}/updatedAt`]: Date.now(),
    }))
    await assertFails(update(ref(ownerDatabase), {
      'nicknameClaims/next_name': null,
    }))
  })

  it('requires ready accounts and opt-in before presence reads or writes', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const readerDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    await assertFails(set(ref(ownerDatabase, `presenceSessions/${OWNER_ID}/tab-a`), true))

    const owner = accountRecord(OWNER_ID, 'Online_User')
    const reader = accountRecord(RECIPIENT_ID, 'Ready_Reader')
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await update(ref(context.database()), {
        [`accounts/${OWNER_ID}`]: { ...owner, preferences: { discoverable: false, presence: true } },
        [`accounts/${RECIPIENT_ID}`]: reader,
        'nicknameClaims/online_user': OWNER_ID,
        'nicknameClaims/ready_reader': RECIPIENT_ID,
      })
    })
    await assertSucceeds(set(ref(ownerDatabase, `presenceSessions/${OWNER_ID}/tab-a`), true))
    await assertSucceeds(set(ref(ownerDatabase, `presenceSessions/${OWNER_ID}/tab-b`), true))
    await assertSucceeds(get(ref(ownerDatabase, `presenceSessions/${OWNER_ID}`)))
    await assertFails(get(ref(readerDatabase, `presenceSessions/${OWNER_ID}`)))
    await assertFails(get(ref(readerDatabase, `presenceSessions/${OWNER_ID}/tab-a`)))
    await assertFails(set(ref(readerDatabase, `presenceSessions/${OWNER_ID}/forged`), true))
    await assertFails(set(ref(ownerDatabase, `presenceSessions/${OWNER_ID}/timestamp`), Date.now()))
    await assertSucceeds(set(ref(ownerDatabase, `presenceSessions/${OWNER_ID}/tab-a`), null))
    expect((await get(ref(ownerDatabase, `presenceSessions/${OWNER_ID}`))).val()).toEqual({ 'tab-b': true })
    await assertSucceeds(update(ref(ownerDatabase), {
      [`accounts/${OWNER_ID}/preferences/presence`]: false,
      [`accounts/${OWNER_ID}/updatedAt`]: Date.now(),
      [`presenceSessions/${OWNER_ID}`]: null,
    }))
    await assertFails(set(ref(ownerDatabase, `presenceSessions/${OWNER_ID}/tab-new`), true))
    await assertSucceeds(set(ref(ownerDatabase, `presenceSessions/${OWNER_ID}/tab-b`), null))
  })
})

describeRules('trusted discovery projection rules', () => {
  const activePlayer = {
    uid: OWNER_ID,
    nickname: 'Online_User',
    nicknameCanonical: 'online_user',
  }
  const catalogDeck = {
    id: ONLINE_DECK_ID,
    ownerId: OWNER_ID,
    ownerNickname: 'Online_User',
    ownerNicknameCanonical: 'online_user',
    title: 'Online Biology',
    titleCanonical: 'online biology',
    description: 'Cell basics',
    cardCount: 1,
    latestVersion: 1,
    updatedAt: Date.now(),
  }

  it('allows only bounded indexed reads and denies every client write', async () => {
    const readerDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    const unauthenticatedDatabase = testEnvironment.unauthenticatedContext().database()
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await update(ref(context.database()), {
        [`accounts/${RECIPIENT_ID}`]: accountRecord(RECIPIENT_ID, 'Ready_Reader'),
        [`activePlayers/${OWNER_ID}`]: activePlayer,
        [`publicOnlineDeckCatalog/${ONLINE_DECK_ID}`]: catalogDeck,
        [`onlineDecksByOwner/${OWNER_ID}/${ONLINE_DECK_ID}`]: catalogDeck,
      })
    })

    await assertSucceeds(get(query(ref(readerDatabase, 'activePlayers'), orderByKey(), limitToFirst(21))))
    await assertSucceeds(get(ref(readerDatabase, `activePlayers/${OWNER_ID}`)))
    await assertFails(get(ref(readerDatabase, 'activePlayers')))
    await assertFails(get(query(ref(readerDatabase, 'activePlayers'), orderByKey(), limitToFirst(22))))
    await assertFails(set(ref(readerDatabase, `activePlayers/${RECIPIENT_ID}`), { ...activePlayer, uid: RECIPIENT_ID }))

    await assertSucceeds(get(query(ref(readerDatabase, 'publicOnlineDeckCatalog'), orderByChild('updatedAt'), limitToLast(21))))
    await assertSucceeds(get(query(ref(readerDatabase, 'publicOnlineDeckCatalog'), orderByChild('titleCanonical'), startAt('online'), endAt('online\uf8ff'), limitToFirst(21))))
    await assertSucceeds(get(query(ref(readerDatabase, `onlineDecksByOwner/${OWNER_ID}`), orderByChild('updatedAt'), limitToLast(21))))
    await assertFails(get(ref(readerDatabase, 'publicOnlineDeckCatalog')))
    await assertFails(get(query(ref(readerDatabase, 'publicOnlineDeckCatalog'), orderByChild('updatedAt'), limitToLast(22))))
    await assertFails(set(ref(readerDatabase, `publicOnlineDeckCatalog/${ONLINE_DECK_ID}`), catalogDeck))
    await assertFails(get(ref(readerDatabase, `onlineDecksByOwner/${OWNER_ID}`)))
    await assertFails(get(query(ref(readerDatabase, `onlineDecksByOwner/${OWNER_ID}`), orderByChild('updatedAt'), limitToLast(22))))
    await assertFails(set(ref(readerDatabase, `onlineDecksByOwner/${OWNER_ID}/${ONLINE_DECK_ID}`), catalogDeck))
    await assertFails(get(query(ref(unauthenticatedDatabase, 'activePlayers'), orderByKey(), limitToFirst(21))))
  })

  it('denies active-player writes and deletes even for an eligible opted-in owner', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await update(ref(context.database()), {
        [`accounts/${OWNER_ID}`]: accountRecord(OWNER_ID, 'Online_User', { discoverable: true, presence: true }),
        [`presenceSessions/${OWNER_ID}/tab-a`]: true,
        [`activePlayers/${OWNER_ID}`]: activePlayer,
      })
    })
    await assertFails(set(ref(ownerDatabase, `activePlayers/${OWNER_ID}`), activePlayer))
    await assertFails(set(ref(ownerDatabase, `activePlayers/${OWNER_ID}`), null))
  })

  it('allows exact active-player projection reads but not raw presence', async () => {
    const readerDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await update(ref(context.database()), {
        [`accounts/${RECIPIENT_ID}`]: accountRecord(RECIPIENT_ID, 'Ready_Reader'),
        [`activePlayers/${OWNER_ID}`]: activePlayer,
        [`presenceSessions/${OWNER_ID}/tab-secret`]: true,
      })
    })
    await assertSucceeds(get(ref(readerDatabase, `activePlayers/${OWNER_ID}`)))
    await assertFails(get(ref(readerDatabase, `presenceSessions/${OWNER_ID}`)))
  })
})

describeRules('trusted social graph database rules', () => {
  const socialProfile = {
    uid: OWNER_ID,
    nickname: 'Owner_User',
    nicknameCanonical: 'owner_user',
    communityXp: 40,
    xpTrust: 'client-reported',
    followerCount: 1,
    followingCount: 0,
    publishedDeckCount: 2,
  }
  const edgeId = 'f'.repeat(64)
  const edge = { followerUid: RECIPIENT_ID, followedUid: OWNER_ID, createdAt: Date.now() }
  const marker = { edgeId, createdAt: edge.createdAt }

  it('denies all client access to canonical edges and public profile storage', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const recipientDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await update(ref(context.database()), {
        [`publicPlayerProfiles/${OWNER_ID}`]: socialProfile,
        [`playerFollowEdges/${edgeId}`]: edge,
      })
    })

    await assertFails(get(ref(ownerDatabase, `publicPlayerProfiles/${OWNER_ID}`)))
    await assertFails(get(ref(ownerDatabase, 'publicPlayerProfiles')))
    await assertFails(set(ref(ownerDatabase, `publicPlayerProfiles/${OWNER_ID}`), socialProfile))
    await assertFails(get(ref(recipientDatabase, `playerFollowEdges/${edgeId}`)))
    await assertFails(get(ref(recipientDatabase, 'playerFollowEdges')))
    await assertFails(set(ref(recipientDatabase, `playerFollowEdges/${edgeId}`), edge))
  })

  it('allows only owner exact reads of private derived follow and block records', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const recipientDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    const outsiderDatabase = testEnvironment.authenticatedContext(OUTSIDER_ID).database()
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await update(ref(context.database()), {
        [`playerFollowing/${RECIPIENT_ID}/${OWNER_ID}`]: marker,
        [`playerFollowers/${OWNER_ID}/${RECIPIENT_ID}`]: marker,
        [`playerBlocks/${OWNER_ID}/${OUTSIDER_ID}`]: Date.now(),
      })
    })

    await assertSucceeds(get(ref(recipientDatabase, `playerFollowing/${RECIPIENT_ID}/${OWNER_ID}`)))
    await assertSucceeds(get(ref(ownerDatabase, `playerFollowers/${OWNER_ID}/${RECIPIENT_ID}`)))
    await assertSucceeds(get(ref(ownerDatabase, `playerBlocks/${OWNER_ID}/${OUTSIDER_ID}`)))
    await assertFails(get(ref(outsiderDatabase, `playerFollowing/${RECIPIENT_ID}/${OWNER_ID}`)))
    await assertFails(get(ref(recipientDatabase, `playerFollowers/${OWNER_ID}/${RECIPIENT_ID}`)))
    await assertFails(get(ref(outsiderDatabase, `playerBlocks/${OWNER_ID}/${OUTSIDER_ID}`)))
    await assertFails(get(ref(ownerDatabase, `playerFollowers/${OWNER_ID}`)))
    await assertFails(get(ref(recipientDatabase, `playerFollowing/${RECIPIENT_ID}`)))
    await assertFails(get(ref(recipientDatabase, `playerFollowers/${OWNER_ID}`)))
    await assertFails(get(ref(ownerDatabase, 'playerFollowEdges')))
  })

  it('denies every client write to derived edges and private blocks', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const recipientDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await update(ref(context.database()), {
        [`accounts/${OWNER_ID}`]: accountRecord(OWNER_ID, 'Owner_User', { discoverable: true, presence: true }),
        [`accounts/${RECIPIENT_ID}`]: accountRecord(RECIPIENT_ID, 'Ready_Reader', { discoverable: true, presence: true }),
        [`playerFollowing/${RECIPIENT_ID}/${OWNER_ID}`]: marker,
        [`playerFollowers/${OWNER_ID}/${RECIPIENT_ID}`]: marker,
      })
    })
    await assertFails(set(ref(recipientDatabase, `playerFollowing/${RECIPIENT_ID}/${OWNER_ID}`), marker))
    await assertFails(set(ref(ownerDatabase, `playerFollowers/${OWNER_ID}/${RECIPIENT_ID}`), marker))
    await assertFails(set(ref(recipientDatabase, `playerFollowers/${OWNER_ID}/${RECIPIENT_ID}`), marker))
    await assertFails(set(ref(recipientDatabase, `playerFollowing/${RECIPIENT_ID}/${OWNER_ID}`), null))
    await assertFails(set(ref(recipientDatabase, `playerFollowers/${OWNER_ID}/${RECIPIENT_ID}`), null))
    await assertFails(set(ref(ownerDatabase, `playerBlocks/${OWNER_ID}/${OUTSIDER_ID}`), Date.now()))
  })
})

describeRules('versioned online deck database rules', () => {
  it('allows owner creation and visibility/access-scoped viewer reads', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const viewerDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    const outsiderDatabase = testEnvironment.authenticatedContext(OUTSIDER_ID).database()
    const record = onlineDeck('private')

    await assertSucceeds(set(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}`), record))
    await assertSucceeds(get(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}`)))
    await assertFails(get(ref(viewerDatabase, `onlineDecks/${ONLINE_DECK_ID}`)))
    await assertSucceeds(set(ref(ownerDatabase, `onlineDeckAccess/${ONLINE_DECK_ID}/${RECIPIENT_ID}`), {
      deckId: ONLINE_DECK_ID,
      uid: RECIPIENT_ID,
      grantedBy: OWNER_ID,
      grantedAt: Date.now(),
    }))
    await assertSucceeds(get(ref(viewerDatabase, `onlineDecks/${ONLINE_DECK_ID}`)))
    await assertFails(get(ref(outsiderDatabase, `onlineDecks/${ONLINE_DECK_ID}`)))
    await assertFails(set(ref(viewerDatabase, `onlineDeckAccess/${ONLINE_DECK_ID}/${OUTSIDER_ID}`), {
      deckId: ONLINE_DECK_ID,
      uid: OUTSIDER_ID,
      grantedBy: RECIPIENT_ID,
      grantedAt: Date.now(),
    }))
  })

  it('permits public exact reads but denies viewers after archive', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const viewerDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    await assertSucceeds(set(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}`), onlineDeck('public')))
    await assertSucceeds(get(ref(viewerDatabase, `onlineDecks/${ONLINE_DECK_ID}`)))
    await assertFails(get(ref(viewerDatabase, 'onlineDecks')))
    await assertSucceeds(update(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}/head`), {
      status: 'archived', archivedAt: Date.now(), updatedAt: Date.now(),
    }))
    await assertFails(get(ref(viewerDatabase, `onlineDecks/${ONLINE_DECK_ID}`)))
    await assertSucceeds(get(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}`)))
  })

  it('publishes only an owner successor and keeps old versions immutable', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const viewerDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    await assertSucceeds(set(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}`), onlineDeck('public')))
    const versionTwo = onlineVersion(2, 1, Date.now(), 2)
    const publish = {
      'head/latestVersion': 2,
      'head/title': versionTwo.title,
      'head/description': versionTwo.description,
      'head/updatedAt': Date.now(),
      'versions/2': versionTwo,
    }
    await assertFails(update(ref(viewerDatabase, `onlineDecks/${ONLINE_DECK_ID}`), publish))
    await assertSucceeds(update(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}`), publish))
    await assertFails(update(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}/versions/1/cards/${ONLINE_CARD_ID}`), {
      answer: 'Mutated answer',
    }))
  })

  it('makes deleted status terminal, preserves versions, and makes grants inert', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const viewerDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    await assertSucceeds(set(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}`), onlineDeck('private')))
    await assertSucceeds(set(ref(ownerDatabase, `onlineDeckAccess/${ONLINE_DECK_ID}/${RECIPIENT_ID}`), {
      deckId: ONLINE_DECK_ID, uid: RECIPIENT_ID, grantedBy: OWNER_ID, grantedAt: Date.now(),
    }))
    await assertSucceeds(update(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}/head`), {
      status: 'deleted', visibility: 'private', deletedAt: Date.now(), updatedAt: Date.now(),
    }))
    await assertFails(get(ref(viewerDatabase, `onlineDecks/${ONLINE_DECK_ID}`)))
    await assertFails(update(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}/head`), {
      status: 'active', visibility: 'public', deletedAt: null, updatedAt: Date.now(),
    }))
    await assertFails(set(ref(ownerDatabase, `onlineDeckAccess/${ONLINE_DECK_ID}/${OUTSIDER_ID}`), {
      deckId: ONLINE_DECK_ID, uid: OUTSIDER_ID, grantedBy: OWNER_ID, grantedAt: Date.now(),
    }))
    await assertSucceeds(set(ref(ownerDatabase, `onlineDeckAccess/${ONLINE_DECK_ID}/${RECIPIENT_ID}`), null))
    await assertFails(set(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}/versions/1`), null))
  })

  it('rejects stale/skipped publishing and enforces offline policy bounds', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    await assertSucceeds(set(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}`), onlineDeck('private')))
    await assertFails(update(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}`), {
      'head/latestVersion': 3,
      'head/title': 'Skipped',
      'head/updatedAt': Date.now(),
      'versions/3': onlineVersion(3, 1),
    }))
    await assertFails(update(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}/head/offlinePolicy`), {
      allowed: true, maxQuestions: 29,
    }))
    await assertSucceeds(update(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}/head`), {
      offlinePolicy: { allowed: true, maxQuestions: 30 }, updatedAt: Date.now(),
    }))
    await assertSucceeds(update(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}/head`), {
      offlinePolicy: { allowed: false, maxQuestions: 0 }, updatedAt: Date.now(),
    }))
  })
})

describeRules('series and completion database rules', () => {
  it('requires owner-atomic linkage and exactly 30 cards for every series part', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const outsiderDatabase = testEnvironment.authenticatedContext(OUTSIDER_ID).database()
    const now = Date.now()
    const deck = seriesOnlineDeck(now)
    const series = {
      id: 'series-one', ownerId: OWNER_ID, topic: 'Biology', rootDeckId: 'series-deck-one',
      latestDeckId: 'series-deck-one', latestPartNumber: 1, createdAt: now, updatedAt: now,
      parts: { 1: { seriesId: 'series-one', partNumber: 1, deckId: 'series-deck-one', ownerId: OWNER_ID, createdAt: now } },
    }
    await assertFails(set(ref(ownerDatabase, 'deckSeries/series-one'), series))
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), 'onlineDecks/series-deck-one'), deck)
    })
    await assertSucceeds(set(ref(ownerDatabase, 'deckSeries/series-one'), series))
    await assertSucceeds(get(ref(ownerDatabase, 'deckSeries/series-one')))
    await assertFails(get(ref(outsiderDatabase, 'deckSeries/series-one')))
    await assertFails(update(ref(ownerDatabase, 'onlineDecks/series-deck-one/head'), { cardCount: 29, updatedAt: Date.now() }))
  })

  it('keeps middle parts recorded and enforces immutable part positions', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const now = Date.now()
    const firstDeck = seriesOnlineDeck(now)
    const secondDeck = structuredClone(firstDeck)
    secondDeck.head.id = 'series-deck-two'
    secondDeck.head.partNumber = 2
    secondDeck.head.title = 'Series Biology 2'
    secondDeck.versions[1].deckId = 'series-deck-two'
    secondDeck.versions[1].title = 'Series Biology 2'
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await update(ref(context.database()), {
        'onlineDecks/series-deck-one': firstDeck,
        'onlineDecks/series-deck-two': secondDeck,
        'deckSeries/series-one': {
          id: 'series-one', ownerId: OWNER_ID, topic: 'Biology', rootDeckId: 'series-deck-one',
          latestDeckId: 'series-deck-two', latestPartNumber: 2, createdAt: now, updatedAt: now,
          parts: {
            1: { seriesId: 'series-one', partNumber: 1, deckId: 'series-deck-one', ownerId: OWNER_ID, createdAt: now },
            2: { seriesId: 'series-one', partNumber: 2, deckId: 'series-deck-two', ownerId: OWNER_ID, createdAt: now },
          },
        },
      })
    })
    await assertFails(set(ref(ownerDatabase, 'deckSeries/series-one/parts/1'), null))
    await assertFails(update(ref(ownerDatabase, 'deckSeries/series-one/parts/2'), { partNumber: 3 }))
  })

  it('allows only distinct real card progress and completion at exactly 30', async () => {
    const viewerDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    const now = Date.now()
    const deck = seriesOnlineDeck(now)
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await update(ref(context.database()), {
        'onlineDecks/series-deck-one': deck,
        'deckSeries/series-one': {
          id: 'series-one', ownerId: OWNER_ID, topic: 'Biology', rootDeckId: 'series-deck-one', latestDeckId: 'series-deck-one',
          latestPartNumber: 1, createdAt: now, updatedAt: now,
          parts: { 1: { seriesId: 'series-one', partNumber: 1, deckId: 'series-deck-one', ownerId: OWNER_ID, createdAt: now } },
        },
      })
    })
    const path = `onlinePartProgress/${RECIPIENT_ID}/series-one/1`
    const first = {
      uid: RECIPIENT_ID, seriesId: 'series-one', partNumber: 1, deckId: 'series-deck-one',
      ratedCardIds: { 'series-card-1': true }, ratedCount: 1, lastRatedCardId: 'series-card-1',
      complete: false, updatedAt: Date.now(),
    }
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), path), first)
    })
    await assertFails(set(ref(viewerDatabase, path), { ...first, ratedCount: 2, updatedAt: Date.now() }))
    await assertFails(set(ref(viewerDatabase, path), {
      ...first, ratedCardIds: { ...first.ratedCardIds, forged: true }, ratedCount: 2, lastRatedCardId: 'forged', updatedAt: Date.now(),
    }))
    const ratedCardIds = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`series-card-${index + 1}`, true]))
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), path), {
        ...first, ratedCardIds: Object.fromEntries(Object.entries(ratedCardIds).slice(0, 29)),
        ratedCount: 29, lastRatedCardId: 'series-card-29', updatedAt: Date.now(),
      })
    })
    await assertFails(set(ref(viewerDatabase, path), {
      ...first, ratedCardIds, ratedCount: 30, lastRatedCardId: 'series-card-30', complete: false, updatedAt: Date.now(),
    }))
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), path), {
        ...first, ratedCardIds, ratedCount: 30, lastRatedCardId: 'series-card-30', complete: true,
        completedAt: Date.now(), updatedAt: Date.now(),
      })
    })
    await assertFails(set(ref(viewerDatabase, path), {
      ...first, ratedCardIds, ratedCount: 30, lastRatedCardId: 'series-card-30', complete: true,
      completedAt: Date.now(), updatedAt: Date.now(),
    }))
  })
})

describeRules('online schedule database rules', () => {
  it('rejects schedule writes after private access is revoked', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const viewerDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    const now = Date.now()
    await assertSucceeds(set(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}`), onlineDeck('private', now)))
    await assertSucceeds(set(ref(ownerDatabase, `onlineDeckAccess/${ONLINE_DECK_ID}/${RECIPIENT_ID}`), {
      deckId: ONLINE_DECK_ID, uid: RECIPIENT_ID, grantedBy: OWNER_ID, grantedAt: now,
    }))
    await assertSucceeds(set(ref(viewerDatabase, `onlineSchedules/${RECIPIENT_ID}/${ONLINE_DECK_ID}/${ONLINE_CARD_ID}`), onlineReview()))
    await assertSucceeds(set(ref(ownerDatabase, `onlineDeckAccess/${ONLINE_DECK_ID}/${RECIPIENT_ID}`), null))
    const second = onlineReview(now, 'review-after-revoke')
    second.state.scheduleRevision = 2
    second.state.reviewCount = 2
    second.state.lastEventId = 'review-after-revoke'
    second.events['review-one'] = onlineReview().events['review-one']
    second.events['review-after-revoke'].scheduleRevisionBefore = 1
    await assertFails(set(ref(viewerDatabase, `onlineSchedules/${RECIPIENT_ID}/${ONLINE_DECK_ID}/${ONLINE_CARD_ID}`), second))
  })

  it('isolates schedule paths to the authenticated uid/deck/card', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const viewerDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    const outsiderDatabase = testEnvironment.authenticatedContext(OUTSIDER_ID).database()
    await assertSucceeds(set(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}`), onlineDeck('public')))
    const review = onlineReview()
    await assertSucceeds(set(ref(viewerDatabase, `onlineSchedules/${RECIPIENT_ID}/${ONLINE_DECK_ID}/${ONLINE_CARD_ID}`), review))
    await assertSucceeds(get(ref(viewerDatabase, `onlineSchedules/${RECIPIENT_ID}/${ONLINE_DECK_ID}/${ONLINE_CARD_ID}`)))
    await assertFails(get(ref(outsiderDatabase, `onlineSchedules/${RECIPIENT_ID}/${ONLINE_DECK_ID}/${ONLINE_CARD_ID}`)))
    await assertFails(set(ref(outsiderDatabase, `onlineSchedules/${RECIPIENT_ID}/${ONLINE_DECK_ID}/other-card`), review))
  })

  it('permits first review at a published revision above one and rejects mismatched versions', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const viewerDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    await assertSucceeds(set(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}`), onlineDeck('public')))
    const versionTwo = onlineVersion(2, 1, Date.now(), 2)
    await assertSucceeds(update(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}`), {
      'head/latestVersion': 2,
      'head/title': versionTwo.title,
      'head/updatedAt': Date.now(),
      'versions/2': versionTwo,
    }))
    const first = onlineReview()
    first.state.deckVersion = 2
    first.state.contentRevision = 2
    first.events['review-one'].deckVersion = 2
    first.events['review-one'].contentRevision = 2
    await assertSucceeds(set(ref(viewerDatabase, `onlineSchedules/${RECIPIENT_ID}/${ONLINE_DECK_ID}/${ONLINE_CARD_ID}`), first))

    const staleVersion = onlineReview(Date.now(), 'stale-version')
    staleVersion.state.contentRevision = 2
    staleVersion.events['stale-version'].contentRevision = 2
    await assertFails(set(ref(viewerDatabase, `onlineSchedules/${RECIPIENT_ID}/${ONLINE_DECK_ID}/other-card`), staleVersion))
  })

  it('enforces immutable events, monotonic revisions, and current contentRevision', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const viewerDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    await assertSucceeds(set(ref(ownerDatabase, `onlineDecks/${ONLINE_DECK_ID}`), onlineDeck('public')))
    const first = onlineReview()
    await assertSucceeds(set(ref(viewerDatabase, `onlineSchedules/${RECIPIENT_ID}/${ONLINE_DECK_ID}/${ONLINE_CARD_ID}`), first))
    const second = onlineReview(first.state.lastReviewedAt, 'review-two')
    second.state.scheduleRevision = 2
    second.state.reviewCount = 2
    second.state.lastEventId = 'review-two'
    second.events['review-one'] = first.events['review-one']
    second.events['review-two'].scheduleRevisionBefore = 1
    second.events['review-two'].interval = second.state.interval
    second.events['review-two'].repetition = second.state.repetition
    second.events['review-two'].easinessFactor = second.state.easinessFactor
    second.events['review-two'].nextReviewDate = second.state.nextReviewDate
    await assertSucceeds(set(ref(viewerDatabase, `onlineSchedules/${RECIPIENT_ID}/${ONLINE_DECK_ID}/${ONLINE_CARD_ID}`), second))
    const mutated = structuredClone(second)
    mutated.events['review-one'].rating = 0
    await assertFails(set(ref(viewerDatabase, `onlineSchedules/${RECIPIENT_ID}/${ONLINE_DECK_ID}/${ONLINE_CARD_ID}`), mutated))
    const stale = onlineReview(Date.now(), 'review-three')
    stale.state.contentRevision = 2
    stale.events['review-three'].contentRevision = 2
    await assertFails(set(ref(viewerDatabase, `onlineSchedules/${RECIPIENT_ID}/${ONLINE_DECK_ID}/${ONLINE_CARD_ID}`), stale))
  })
})

describeRules('account role rules', () => {
  async function seedAccount(uid: string): Promise<void> {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const database = context.database()
      await set(ref(database, `accounts/${uid}`), accountRecord(uid, 'Nickname'))
      await set(ref(database, 'nicknameClaims/nickname'), uid)
    })
  }

  it('lets the owner set a valid role with fresh timestamps', async () => {
    await seedAccount(OWNER_ID)
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const now = Date.now()
    await assertSucceeds(update(ref(ownerDatabase, `accounts/${OWNER_ID}`), {
      role: 'student',
      roleUpdatedAt: now,
      updatedAt: now,
    }))
    const stored = (await get(ref(ownerDatabase, `accounts/${OWNER_ID}`))).val()
    expect(stored.role).toBe('student')
  })

  it('rejects unknown role values, stale timestamps, and other writers', async () => {
    await seedAccount(OWNER_ID)
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const outsiderDatabase = testEnvironment.authenticatedContext(OUTSIDER_ID).database()
    const now = Date.now()

    await assertFails(update(ref(ownerDatabase, `accounts/${OWNER_ID}`), { role: 'admin', roleUpdatedAt: now, updatedAt: now }))
    await assertFails(update(ref(ownerDatabase, `accounts/${OWNER_ID}`), { role: 'student', roleUpdatedAt: now - 120000, updatedAt: now }))
    await assertFails(update(ref(outsiderDatabase, `accounts/${OWNER_ID}`), { role: 'teacher', roleUpdatedAt: now, updatedAt: now }))
  })
})

describeRules('quiz code rules', () => {
  const CODE = 'ABCD-EFGH'

  function quizCode(ownerId: string, now = Date.now()) {
    return { quizId: 'quiz-one', ownerId, createdAt: now }
  }

  async function seedQuizAccounts(): Promise<void> {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await update(ref(context.database()), {
        [`accounts/${OWNER_ID}`]: accountRecord(OWNER_ID, 'Teacher_One', undefined, 'teacher'),
        [`accounts/${RECIPIENT_ID}`]: accountRecord(RECIPIENT_ID, 'Student_One', undefined, 'student'),
        [`accounts/${OUTSIDER_ID}`]: accountRecord(OUTSIDER_ID, 'Teacher_Two', undefined, 'teacher'),
      })
    })
  }

  it('denies every client code read, including exact keys and enumeration', async () => {
    await seedQuizAccounts()
    const teacherDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const learnerDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    const unauthenticatedDatabase = testEnvironment.unauthenticatedContext().database()
    await assertSucceeds(set(ref(teacherDatabase, `quizCodes/${CODE}`), quizCode(OWNER_ID)))

    await assertFails(get(ref(learnerDatabase, `quizCodes/${CODE}`)))
    await assertFails(get(ref(learnerDatabase, 'quizCodes/WXYZ-2345')))
    await assertFails(get(ref(learnerDatabase, 'quizCodes')))
    await assertFails(get(ref(unauthenticatedDatabase, `quizCodes/${CODE}`)))
    await assertFails(get(ref(unauthenticatedDatabase, 'quizCodes')))
  })

  it('also denies stale, unready, and unauthenticated callers', async () => {
    await seedQuizAccounts()
    const teacherDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    await assertSucceeds(set(ref(teacherDatabase, `quizCodes/${CODE}`), quizCode(OWNER_ID)))
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await update(ref(context.database()), {
        [`accounts/${RECIPIENT_ID}/privacy/currentVersion`]: 'privacy-stale',
        [`accounts/${OUTSIDER_ID}/status`]: 'pending',
      })
    })

    await assertFails(get(ref(testEnvironment.authenticatedContext(RECIPIENT_ID).database(), `quizCodes/${CODE}`)))
    await assertFails(get(ref(testEnvironment.authenticatedContext(OUTSIDER_ID).database(), `quizCodes/${CODE}`)))
    await assertFails(get(ref(testEnvironment.unauthenticatedContext().database(), `quizCodes/${CODE}`)))
  })

  it('allows only a ready/current teacher to publish a well-formed code', async () => {
    await seedQuizAccounts()
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const outsiderDatabase = testEnvironment.authenticatedContext(OUTSIDER_ID).database()
    const studentDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    const now = Date.now()

    await assertSucceeds(set(ref(ownerDatabase, `quizCodes/${CODE}`), quizCode(OWNER_ID, now)))
    await assertFails(set(ref(studentDatabase, 'quizCodes/IJKL-MNOP'), quizCode(RECIPIENT_ID, now)))
    await assertFails(set(ref(outsiderDatabase, `quizCodes/${CODE}`), quizCode(OUTSIDER_ID, now)))
    await assertFails(set(ref(ownerDatabase, `quizCodes/${CODE}`), quizCode(OWNER_ID, now)))
    await assertFails(set(ref(ownerDatabase, 'quizCodes/NOTACODE'), quizCode(OWNER_ID, now)))
    await assertFails(set(ref(ownerDatabase, 'quizCodes/ABCD-EFGH'), { ...quizCode(OWNER_ID, now), ownerId: OUTSIDER_ID }))
  })
})

describeRules('quiz creation rules', () => {
  const QUIZ_ID = 'quiz_test-quiz'
  const CODE = 'ABCD-EFGH'

  // Timestamps are computed per test: the ±60s freshness windows in the rules
  // reject values captured at module-load time, long before slow suites finish.
  function quizRecord(ownerId: string, now: number = Date.now(), integrity?: unknown) {
    return {
      id: QUIZ_ID,
      ownerId,
      title: 'Cell quiz',
      description: '',
      questionCount: 2,
      questions: {
        q_0: { prompt: 'What is ATP?', choices: { 0: 'Energy currency', 1: 'A protein' } },
        q_1: { prompt: 'Pick B', choices: { 0: 'A', 1: 'B', 2: 'C' } },
      } as Record<string, { prompt: string; choices: Record<string, string> }>,
      createdAt: now,
      updatedAt: now,
      ...(integrity === undefined ? {} : { integrity }),
    }
  }

  function answerKey(ownerId: string) {
    return { ownerId, correct: { q_0: 0, q_1: 1 } }
  }

  async function seedQuizAccounts(options: { ownerRole?: 'student' | 'teacher'; staleOwner?: boolean } = {}): Promise<void> {
    const owner = accountRecord(OWNER_ID, 'Teacher_One', undefined, options.ownerRole ?? 'teacher')
    if (options.staleOwner) owner.privacy.currentVersion = 'privacy-stale'
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await update(ref(context.database()), {
        [`accounts/${OWNER_ID}`]: owner,
        [`accounts/${RECIPIENT_ID}`]: accountRecord(RECIPIENT_ID, 'Student_One', undefined, 'student'),
        [`accounts/${OUTSIDER_ID}`]: accountRecord(OUTSIDER_ID, 'Teacher_Two', undefined, 'student'),
      })
    })
  }

  function creationUpdates(now: number, integrity?: unknown): Record<string, unknown> {
    const integrityFields = integrity === undefined ? {} : { integrity }
    return {
      [`quizzes/${QUIZ_ID}`]: quizRecord(OWNER_ID, now, integrity),
      [`quizAnswers/${QUIZ_ID}`]: answerKey(OWNER_ID),
      [`quizCodes/${CODE}`]: { quizId: QUIZ_ID, ownerId: OWNER_ID, createdAt: now },
      [`quizzesByOwner/${OWNER_ID}/${QUIZ_ID}`]: { code: CODE, title: 'Cell quiz', createdAt: now, ...integrityFields },
    }
  }

  it('lets a ready/current teacher publish a legacy-compatible quiz atomically', async () => {
    await seedQuizAccounts()
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    await assertSucceeds(update(ref(ownerDatabase), creationUpdates(Date.now())))
  })

  it('accepts the exact enabled Integrity Mode object on quiz and owner index', async () => {
    await seedQuizAccounts()
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const now = Date.now()
    const integrity = { enabled: true, noticeVersion: 'quiz-integrity-v1', authorityAcknowledgedAt: now }
    await assertSucceeds(update(ref(ownerDatabase), creationUpdates(now, integrity)))
  })

  it('rejects malformed, disabled, stale, extra-field, and mismatched Integrity Mode objects', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const malformedPolicies: unknown[] = [
      { enabled: false, noticeVersion: 'quiz-integrity-v1', authorityAcknowledgedAt: Date.now() },
      { enabled: true, noticeVersion: 'quiz-integrity-v2', authorityAcknowledgedAt: Date.now() },
      { enabled: true, noticeVersion: 'quiz-integrity-v1' },
      { enabled: true, noticeVersion: 'quiz-integrity-v1', authorityAcknowledgedAt: Date.now() - 120000 },
      { enabled: true, noticeVersion: 'quiz-integrity-v1', authorityAcknowledgedAt: Date.now(), extra: true },
    ]
    for (const integrity of malformedPolicies) {
      await seedQuizAccounts()
      await assertFails(update(ref(ownerDatabase), creationUpdates(Date.now(), integrity)))
      await testEnvironment.clearDatabase()
    }

    const validPolicy = { enabled: true, noticeVersion: 'quiz-integrity-v1', authorityAcknowledgedAt: Date.now() }
    const malformedIndexes: Array<unknown | null> = [
      null,
      { enabled: false, noticeVersion: 'quiz-integrity-v1', authorityAcknowledgedAt: Date.now() },
      { enabled: true, noticeVersion: 'quiz-integrity-v2', authorityAcknowledgedAt: Date.now() },
      { enabled: true, noticeVersion: 'quiz-integrity-v1' },
      { enabled: true, noticeVersion: 'quiz-integrity-v1', authorityAcknowledgedAt: Date.now(), extra: true },
      { enabled: true, noticeVersion: 'quiz-integrity-v1', authorityAcknowledgedAt: Date.now() + 1 },
    ]
    for (const integrity of malformedIndexes) {
      await seedQuizAccounts()
      const now = Date.now()
      const updates = creationUpdates(now, validPolicy)
      updates[`quizzesByOwner/${OWNER_ID}/${QUIZ_ID}`] = integrity === null
        ? { code: CODE, title: 'Cell quiz', createdAt: now }
        : { code: CODE, title: 'Cell quiz', createdAt: now, integrity }
      await assertFails(update(ref(ownerDatabase), updates))
      await testEnvironment.clearDatabase()
    }
  })

  it('requires a ready/current self-asserted teacher on every quiz creation path', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    await seedQuizAccounts({ ownerRole: 'student' })
    await assertFails(update(ref(ownerDatabase), creationUpdates(Date.now())))

    await testEnvironment.clearDatabase()
    await seedQuizAccounts({ staleOwner: true })
    await assertFails(update(ref(ownerDatabase), creationUpdates(Date.now())))

    await testEnvironment.clearDatabase()
    await assertFails(update(ref(ownerDatabase), creationUpdates(Date.now())))
  })

  it('keeps quiz content and answer keys owner-only for current-ready accounts', async () => {
    await seedQuizAccounts()
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const learnerDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    await assertSucceeds(set(ref(ownerDatabase, `quizzes/${QUIZ_ID}`), quizRecord(OWNER_ID)))
    await assertSucceeds(set(ref(ownerDatabase, `quizAnswers/${QUIZ_ID}`), answerKey(OWNER_ID)))

    await assertSucceeds(get(ref(ownerDatabase, `quizzes/${QUIZ_ID}`)))
    await assertSucceeds(get(ref(ownerDatabase, `quizAnswers/${QUIZ_ID}`)))
    await assertFails(get(ref(learnerDatabase, `quizzes/${QUIZ_ID}`)))
    await assertFails(get(ref(learnerDatabase, `quizAnswers/${QUIZ_ID}`)))
    await assertFails(get(ref(learnerDatabase, `quizzesByOwner/${OWNER_ID}`)))

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), `accounts/${OWNER_ID}/privacy/currentVersion`), 'privacy-stale')
    })
    await assertFails(get(ref(ownerDatabase, `quizzes/${QUIZ_ID}`)))
    await assertFails(get(ref(ownerDatabase, `quizAnswers/${QUIZ_ID}`)))
  })

  it('rejects incomplete, extra, non-integer, and out-of-range answer keys', async () => {
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const malformedKeys: Record<string, unknown>[] = [
      { ownerId: OWNER_ID, correct: { q_0: 0 } },
      { ownerId: OWNER_ID, correct: { q_0: 0, q_1: 1, q_2: 0 } },
      { ownerId: OWNER_ID, correct: { q_0: 0.5, q_1: 1 } },
      { ownerId: OWNER_ID, correct: { q_0: 2, q_1: 1 } },
      { ownerId: OWNER_ID, correct: { q_0: 0, bad: 1 } },
    ]
    for (const key of malformedKeys) {
      await seedQuizAccounts()
      await assertSucceeds(set(ref(ownerDatabase, `quizzes/${QUIZ_ID}`), quizRecord(OWNER_ID)))
      await assertFails(set(ref(ownerDatabase, `quizAnswers/${QUIZ_ID}`), key))
      await testEnvironment.clearDatabase()
    }
  })

  it('rejects overwrites, forged owners, oversized quizzes, fractional counts, and malformed shapes', async () => {
    await seedQuizAccounts()
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const outsiderDatabase = testEnvironment.authenticatedContext(OUTSIDER_ID).database()
    await assertSucceeds(set(ref(ownerDatabase, `quizzes/${QUIZ_ID}`), quizRecord(OWNER_ID)))

    // Quizzes are immutable in v1 — even the owner cannot rewrite one.
    await assertFails(set(ref(ownerDatabase, `quizzes/${QUIZ_ID}`), quizRecord(OWNER_ID)))
    const forged = quizRecord(OUTSIDER_ID)
    forged.id = 'quiz_forged'
    await assertFails(set(ref(outsiderDatabase, 'quizzes/quiz_forged'), forged))
    // Space is a valid RTDB path character but violates the quiz-ID pattern.
    const badId = quizRecord(OWNER_ID)
    badId.id = 'quiz_bad id'
    await assertFails(set(ref(ownerDatabase, 'quizzes/quiz_bad id'), badId))

    const oversized = quizRecord(OWNER_ID)
    oversized.id = 'quiz_oversized'
    oversized.questionCount = 51
    oversized.questions = {}
    for (let index = 0; index < 51; index += 1) oversized.questions[`q_${index}`] = { prompt: 'x', choices: { 0: 'a', 1: 'b' } }
    await assertFails(set(ref(ownerDatabase, 'quizzes/quiz_oversized'), oversized))

    const fractional = quizRecord(OWNER_ID)
    fractional.id = 'quiz_fractional'
    fractional.questionCount = 2.5
    await assertFails(set(ref(ownerDatabase, 'quizzes/quiz_fractional'), fractional))

    const mismatchedCount = quizRecord(OWNER_ID)
    mismatchedCount.id = 'quiz_mismatched'
    mismatchedCount.questionCount = 1
    await assertFails(set(ref(ownerDatabase, 'quizzes/quiz_mismatched'), mismatchedCount))

    const gappedQuestions = quizRecord(OWNER_ID)
    gappedQuestions.id = 'quiz_gapped'
    gappedQuestions.questionCount = 3
    gappedQuestions.questions.q_2 = gappedQuestions.questions.q_1
    delete gappedQuestions.questions.q_1
    await assertFails(set(ref(ownerDatabase, 'quizzes/quiz_gapped'), gappedQuestions))

    const tooFewChoices = quizRecord(OWNER_ID)
    tooFewChoices.id = 'quiz_few_choices'
    tooFewChoices.questions.q_0.choices = { 0: 'Only' }
    await assertFails(set(ref(ownerDatabase, 'quizzes/quiz_few_choices'), tooFewChoices))

    const tooManyChoices = quizRecord(OWNER_ID)
    tooManyChoices.id = 'quiz_many_choices'
    tooManyChoices.questions.q_0.choices = { 0: 'A', 1: 'B', 2: 'C', 3: 'D', 4: 'E' }
    await assertFails(set(ref(ownerDatabase, 'quizzes/quiz_many_choices'), tooManyChoices))

    const badQuestionKey = quizRecord(OWNER_ID)
    badQuestionKey.id = 'quiz_bad_question'
    badQuestionKey.questions.bad = badQuestionKey.questions.q_1
    delete badQuestionKey.questions.q_1
    await assertFails(set(ref(ownerDatabase, 'quizzes/quiz_bad_question'), badQuestionKey))

    const highQuestionKey = quizRecord(OWNER_ID)
    highQuestionKey.id = 'quiz_high_question'
    highQuestionKey.questions.q_50 = { prompt: 'Out of range', choices: { 0: 'A', 1: 'B' } }
    await assertFails(set(ref(ownerDatabase, 'quizzes/quiz_high_question'), highQuestionKey))

    const badChoiceKey = quizRecord(OWNER_ID)
    badChoiceKey.id = 'quiz_bad_choice'
    badChoiceKey.questions.q_0.choices = { 0: 'A', 4: 'B' }
    await assertFails(set(ref(ownerDatabase, 'quizzes/quiz_bad_choice'), badChoiceKey))
  })
})

describeRules('quiz attempt, integrity-event, and stats rules', () => {
  const QUIZ_ID = 'quiz_test-quiz'
  const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

  function quizRecord(ownerId: string, now = Date.now(), integrity = false) {
    return {
      id: QUIZ_ID,
      ownerId,
      title: 'Cell quiz',
      questionCount: 2,
      questions: {
        q_0: { prompt: 'What is ATP?', choices: { 0: 'Energy currency', 1: 'A protein' } },
        q_1: { prompt: 'Pick B', choices: { 0: 'A', 1: 'B', 2: 'C' } },
      },
      createdAt: now,
      updatedAt: now,
      ...(integrity ? { integrity: { enabled: true, noticeVersion: 'quiz-integrity-v1', authorityAcknowledgedAt: now } } : {}),
    }
  }

  function attemptRecord(nickname = 'StudentA', now = Date.now()) {
    return {
      uid: RECIPIENT_ID,
      nickname,
      quizId: QUIZ_ID,
      quizTitle: 'Cell quiz',
      answers: { q_0: 0, q_1: 1 },
      correctCount: 2,
      questionCount: 2,
      score: 100,
      passed: true,
      gradedAt: now,
      breakdown: [
        { id: 'q_0', prompt: 'What is ATP?', choices: ['Energy currency', 'A protein'], chosenIndex: 0, correctIndex: 0, correct: true },
        { id: 'q_1', prompt: 'Pick B', choices: ['A', 'B', 'C'], chosenIndex: 1, correctIndex: 1, correct: true },
      ],
    }
  }

  function activeV2Attempt(now = Date.now()) {
    return {
      schemaVersion: 2,
      status: 'active',
      attemptId: 'attempt-one',
      sessionId: 'session-one',
      uid: RECIPIENT_ID,
      nickname: 'StudentA',
      quizId: QUIZ_ID,
      quizTitle: 'Cell quiz',
      startedAt: now,
      questionOrder: ['q_0', 'q_1'],
      currentIndex: 0,
      questionStartedAt: now,
      deadlineAt: now + 30000,
      answers: {},
      timings: {},
      answerOperations: {},
    }
  }

  function completedIntegrityAttempt(now = Date.now(), deleteAfter = now + RETENTION_MS) {
    return {
      ...activeV2Attempt(now - 1000),
      status: 'completed',
      currentIndex: 2,
      questionStartedAt: now - 500,
      deadlineAt: now + 29500,
      answers: { q_0: 0, q_1: 1 },
      integrity: {
        enabled: true,
        noticeVersion: 'quiz-integrity-v1',
        fullscreenStart: 'entered',
        authorityAcknowledgedAt: now - 1000,
        deleteAfter,
      },
      completedAt: now,
      correctCount: 2,
      questionCount: 2,
      score: 100,
      passed: true,
      gradedAt: now,
      breakdown: attemptRecord('StudentA', now).breakdown,
      integritySummary: { eventCount: 1, monitoringLimited: false, deleteAfter },
    }
  }

  function integrityEvent(now = Date.now()) {
    return {
      eventId: 'event-one',
      attemptId: 'attempt-one',
      type: 'page-hidden',
      startedAt: now - 5000,
      endedAt: now - 2000,
      questionId: 'q_0',
      sequence: 0,
      receivedAt: now,
      durationMs: 3000,
    }
  }

  async function seedQuizData(options: { activeV2?: boolean; integrity?: boolean; expired?: boolean } = {}) {
    const now = Date.now()
    const integrity = options.integrity === true
    const deleteAfter = options.expired ? now - 1 : now + RETENTION_MS
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const database = context.database()
      await update(ref(database), {
        [`accounts/${OWNER_ID}`]: accountRecord(OWNER_ID, 'Teacher_One', undefined, 'teacher'),
        [`accounts/${RECIPIENT_ID}`]: accountRecord(RECIPIENT_ID, 'Student_One', undefined, 'student'),
        [`accounts/${OUTSIDER_ID}`]: accountRecord(OUTSIDER_ID, 'Other_User', undefined, 'student'),
        [`quizzes/${QUIZ_ID}`]: quizRecord(OWNER_ID, now, integrity),
        [`quizAttempts/${QUIZ_ID}/${RECIPIENT_ID}`]: options.activeV2
          ? activeV2Attempt(now)
          : integrity ? completedIntegrityAttempt(now, deleteAfter) : attemptRecord('StudentA', now),
        [`roleStats/${RECIPIENT_ID}`]: {
          quizzesTaken: 1,
          quizzesPassed: 1,
          currentStreak: 1,
          bestStreak: 1,
          totalCorrect: 2,
          totalQuestions: 2,
          appliedAttempts: { [QUIZ_ID]: 'attempt-one' },
        },
        [`badges/${RECIPIENT_ID}/perfect-round`]: { awardedAt: now, type: 'auto' },
        ...(integrity ? { [`quizAttemptEvents/${QUIZ_ID}/${RECIPIENT_ID}/event-one`]: integrityEvent(now) } : {}),
      })
    })
  }

  it('lets a current subject and quiz owner read legacy attempts, and denies outsiders', async () => {
    await seedQuizData()
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const subjectDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    const outsiderDatabase = testEnvironment.authenticatedContext(OUTSIDER_ID).database()

    await assertSucceeds(get(ref(ownerDatabase, `quizAttempts/${QUIZ_ID}`)))
    await assertSucceeds(get(ref(subjectDatabase, `quizAttempts/${QUIZ_ID}/${RECIPIENT_ID}`)))
    await assertFails(get(ref(outsiderDatabase, `quizAttempts/${QUIZ_ID}/${RECIPIENT_ID}`)))
  })

  it('keeps active schema-version 2 attempts readable to their subject and quiz owner', async () => {
    await seedQuizData({ activeV2: true })
    await assertSucceeds(get(ref(testEnvironment.authenticatedContext(RECIPIENT_ID).database(), `quizAttempts/${QUIZ_ID}/${RECIPIENT_ID}`)))
    await assertSucceeds(get(ref(testEnvironment.authenticatedContext(OWNER_ID).database(), `quizAttempts/${QUIZ_ID}/${RECIPIENT_ID}`)))
  })

  it('requires current privacy acknowledgement for attempt and stats reads', async () => {
    await seedQuizData()
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), `accounts/${RECIPIENT_ID}/privacy/currentVersion`), 'privacy-stale')
    })
    const subjectDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    await assertFails(get(ref(subjectDatabase, `quizAttempts/${QUIZ_ID}/${RECIPIENT_ID}`)))
    await assertFails(get(ref(subjectDatabase, `roleStats/${RECIPIENT_ID}`)))
  })

  it('allows exact unexpired integrity logs to the subject and quiz owner only', async () => {
    await seedQuizData({ integrity: true })
    const path = `quizAttemptEvents/${QUIZ_ID}/${RECIPIENT_ID}`
    await assertSucceeds(get(ref(testEnvironment.authenticatedContext(RECIPIENT_ID).database(), path)))
    await assertSucceeds(get(ref(testEnvironment.authenticatedContext(OWNER_ID).database(), path)))
    await assertFails(get(ref(testEnvironment.authenticatedContext(OUTSIDER_ID).database(), path)))
    await assertFails(get(ref(testEnvironment.unauthenticatedContext().database(), path)))
  })

  it('denies integrity root and quiz-parent enumeration and expired logs', async () => {
    await seedQuizData({ integrity: true })
    const subjectDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    await assertFails(get(ref(subjectDatabase, 'quizAttemptEvents')))
    await assertFails(get(ref(ownerDatabase, `quizAttemptEvents/${QUIZ_ID}`)))

    await testEnvironment.clearDatabase()
    await seedQuizData({ integrity: true, expired: true })
    await assertFails(get(ref(subjectDatabase, `quizAttemptEvents/${QUIZ_ID}/${RECIPIENT_ID}`)))
    await assertFails(get(ref(ownerDatabase, `quizAttemptEvents/${QUIZ_ID}/${RECIPIENT_ID}`)))
  })

  it('denies every client write to attempts, integrity logs, role stats, and badges', async () => {
    await seedQuizData({ integrity: true })
    const subjectDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    const ownerDatabase = testEnvironment.authenticatedContext(OWNER_ID).database()
    const eventsPath = `quizAttemptEvents/${QUIZ_ID}/${RECIPIENT_ID}`

    await assertFails(set(ref(subjectDatabase, `quizAttempts/${QUIZ_ID}/${RECIPIENT_ID}`), attemptRecord('Forged', Date.now())))
    await assertFails(set(ref(subjectDatabase, `${eventsPath}/forged-event`), integrityEvent()))
    await assertFails(update(ref(subjectDatabase, eventsPath), { 'forged-event': integrityEvent() }))
    await assertFails(set(ref(subjectDatabase, eventsPath), null))
    await assertFails(set(ref(ownerDatabase, `${eventsPath}/owner-forged`), integrityEvent()))
    await assertFails(update(ref(subjectDatabase, `roleStats/${RECIPIENT_ID}`), { quizzesTaken: 9999 }))
    await assertFails(set(ref(subjectDatabase, `badges/${RECIPIENT_ID}/perfect-round`), { awardedAt: Date.now(), type: 'auto' }))
    await assertFails(set(ref(ownerDatabase, `badges/${OWNER_ID}/founders-pick`), { awardedAt: Date.now(), type: 'granted' }))
  })

  it('lets only the subject read role stats including internal applied-attempt markers and their badges', async () => {
    await seedQuizData()
    const subjectDatabase = testEnvironment.authenticatedContext(RECIPIENT_ID).database()
    const outsiderDatabase = testEnvironment.authenticatedContext(OUTSIDER_ID).database()

    const stats = (await get(ref(subjectDatabase, `roleStats/${RECIPIENT_ID}`))).val()
    expect(stats.appliedAttempts).toEqual({ [QUIZ_ID]: 'attempt-one' })
    await assertSucceeds(get(ref(subjectDatabase, `badges/${RECIPIENT_ID}`)))
    await assertFails(get(ref(outsiderDatabase, `roleStats/${RECIPIENT_ID}`)))
    await assertFails(get(ref(outsiderDatabase, `badges/${RECIPIENT_ID}`)))
  })
})
