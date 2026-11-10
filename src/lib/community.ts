import {
  endAt,
  equalTo,
  get,
  limitToFirst,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  remove,
  serverTimestamp,
  startAt,
  update,
} from 'firebase/database'
import type { DataSnapshot, Unsubscribe } from 'firebase/database'
import type { User } from 'firebase/auth'
import { database } from './firebase'
import { isRecord } from './errors'
import { hasCompleteStudyGuideCoverage, STUDY_GUIDE_COVERAGE } from './studyGuideCoverage'
import type {
  PublicProfile,
  SharedDeckCard,
  SharedDeckInboxItem,
  SharedDeckSnapshot,
  StudyCard,
  StudyDeck,
} from '../types/domain'

const MAX_PROFILE_RESULTS = 20
const MAX_DISPLAY_NAME_LENGTH = 80
const MAX_TITLE_LENGTH = 160
const MAX_DESCRIPTION_LENGTH = 2000
const MAX_STUDY_GUIDE_LENGTH = 8000
const MAX_CARDS_PER_SHARE = 500
const MAX_CARD_TEXT_LENGTH = 10000
const MAX_DISTRACTORS = 10
const MAX_ID_LENGTH = 200

function cleanString(value: unknown, maxLength: number): string {
  return Array.from(String(value ?? ''))
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .trim()
    .slice(0, maxLength)
}

function requireId(value: unknown, label: string): string {
  const normalized = cleanString(value, MAX_ID_LENGTH)
  if (!normalized || /[.#$[\]/]/.test(normalized)) {
    throw new TypeError(`${label} must be a valid non-empty Firebase key`)
  }
  return normalized
}

function requireUser(user: User | null | undefined): User {
  if (!user || typeof user.uid !== 'string' || !user.uid) {
    throw new TypeError('An authenticated user is required')
  }
  return user
}

export function normalizeDisplayName(value: unknown): string {
  return cleanString(value, MAX_DISPLAY_NAME_LENGTH).normalize('NFKC').toLocaleLowerCase('en-US')
}

function publicPhotoURL(value: unknown): string {
  const url = cleanString(value, 1000)
  return /^https:\/\//i.test(url) ? url : ''
}

function isPublicAccountProfile(value: unknown): value is { uid: string; nickname: string; nicknameCanonical: string; updatedAt: number | object } {
  return isRecord(value) &&
    typeof value.uid === 'string' &&
    typeof value.nickname === 'string' &&
    typeof value.nicknameCanonical === 'string' &&
    (typeof value.updatedAt === 'number' || isRecord(value.updatedAt))
}

function isPublicProfile(value: unknown): value is PublicProfile {
  return (
    isRecord(value) &&
    typeof value.uid === 'string' &&
    typeof value.displayName === 'string' &&
    typeof value.displayNameNormalized === 'string' &&
    typeof value.photoURL === 'string' &&
    (typeof value.updatedAt === 'number' || isRecord(value.updatedAt))
  )
}

function isSharedDeckCard(value: unknown): value is SharedDeckCard {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.question === 'string' &&
    typeof value.answer === 'string' &&
    Array.isArray(value.distractors) &&
    value.distractors.every((item) => typeof item === 'string')
  )
}

function isInboxItem(value: unknown): value is SharedDeckInboxItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.sharedDeckId === 'string' &&
    typeof value.ownerId === 'string' &&
    typeof value.senderDisplayName === 'string' &&
    typeof value.lineageId === 'string' &&
    typeof value.title === 'string' &&
    typeof value.cardCount === 'number' &&
    (typeof value.createdAt === 'number' || isRecord(value.createdAt))
  )
}

function readInboxSnapshot(snapshot: DataSnapshot): SharedDeckInboxItem[] {
  const items: SharedDeckInboxItem[] = []
  snapshot.forEach((child) => {
    const value: unknown = child.val()
    if (isInboxItem(value)) items.push({ ...value, id: child.key || value.id })
  })
  return items.sort((left, right) => Number(right.createdAt) - Number(left.createdAt))
}

function readSharedDeck(snapshot: DataSnapshot): SharedDeckSnapshot | null {
  const value: unknown = snapshot.val()
  if (!isRecord(value) || !isRecord(value.cards)) return null
  const cards: Record<string, SharedDeckCard> = {}
  for (const [key, card] of Object.entries(value.cards)) {
    if (isSharedDeckCard(card)) cards[key] = card
  }
  if (
    typeof value.id !== 'string' ||
    typeof value.ownerId !== 'string' ||
    typeof value.recipientId !== 'string' ||
    typeof value.senderDisplayName !== 'string' ||
    typeof value.lineageId !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.description !== 'string' ||
    (value.studyGuide !== undefined && (typeof value.studyGuide !== 'string' || value.studyGuide.length > MAX_STUDY_GUIDE_LENGTH)) ||
    (value.studyGuideCoverage !== undefined && value.studyGuideCoverage !== STUDY_GUIDE_COVERAGE) ||
    typeof value.cardCount !== 'number' ||
    (typeof value.createdAt !== 'number' && !isRecord(value.createdAt)) ||
    Object.keys(cards).length !== value.cardCount
  ) {
    return null
  }
  return { ...value, cards } as SharedDeckSnapshot
}

export interface PublicProfileSettings {
  displayName?: unknown
  isDiscoverable: boolean
}

export async function savePublicProfile(
  user: User | null | undefined,
  settings: PublicProfileSettings,
): Promise<PublicProfile | null> {
  const authenticatedUser = requireUser(user)
  if (!settings || typeof settings.isDiscoverable !== 'boolean') {
    throw new TypeError('isDiscoverable must be a boolean')
  }
  const profileRef = ref(database, `publicProfiles/${authenticatedUser.uid}`)
  if (!settings.isDiscoverable) {
    await remove(profileRef)
    return null
  }

  const displayName = cleanString(
    settings.displayName ?? authenticatedUser.displayName ?? 'Anonymous learner',
    MAX_DISPLAY_NAME_LENGTH,
  ).normalize('NFKC')
  const displayNameNormalized = normalizeDisplayName(displayName)
  if (!displayNameNormalized) throw new TypeError('displayName must contain searchable characters')

  const profile: PublicProfile = {
    uid: authenticatedUser.uid,
    displayName,
    displayNameNormalized,
    photoURL: publicPhotoURL(authenticatedUser.photoURL),
    updatedAt: serverTimestamp(),
  }
  await update(ref(database), { [`publicProfiles/${authenticatedUser.uid}`]: profile })
  return profile
}

export async function publishPublicProfile(user: User | null | undefined): Promise<PublicProfile> {
  const profile = await savePublicProfile(user, { isDiscoverable: true })
  if (!profile) throw new Error('The public profile was not saved')
  return profile
}

export async function removePublicProfile(user: User | null | undefined): Promise<void> {
  await savePublicProfile(user, { isDiscoverable: false })
}

export async function getPublicProfile(
  user: User | null | undefined,
): Promise<PublicProfile | null> {
  const authenticatedUser = requireUser(user)
  const [legacySnapshot, accountSnapshot] = await Promise.all([
    get(ref(database, `publicProfiles/${authenticatedUser.uid}`)),
    get(ref(database, `publicAccounts/${authenticatedUser.uid}`)),
  ])
  const legacyValue: unknown = legacySnapshot.val()
  if (isPublicProfile(legacyValue)) return legacyValue
  const accountValue: unknown = accountSnapshot.val()
  return isPublicAccountProfile(accountValue)
    ? {
        uid: accountValue.uid,
        displayName: accountValue.nickname,
        displayNameNormalized: accountValue.nicknameCanonical,
        photoURL: '',
        updatedAt: accountValue.updatedAt,
      }
    : null
}

export async function getPublicAccountByUid(uid: unknown): Promise<PublicProfile | null> {
  const targetUid = requireId(uid, 'uid')
  const snapshot = await get(ref(database, `publicAccounts/${targetUid}`))
  const value: unknown = snapshot.val()
  return isPublicAccountProfile(value)
    ? {
        uid: value.uid,
        displayName: value.nickname,
        displayNameNormalized: value.nicknameCanonical,
        photoURL: '',
        updatedAt: value.updatedAt,
      }
    : null
}

export async function discoverPublicProfiles(prefix: unknown): Promise<PublicProfile[]> {
  const normalizedPrefix = normalizeDisplayName(prefix)
  if (!normalizedPrefix) return []

  const legacySnapshot = await get(query(
    ref(database, 'publicProfiles'),
    orderByChild('displayNameNormalized'),
    startAt(normalizedPrefix),
    endAt(`${normalizedPrefix}\uf8ff`),
    limitToFirst(MAX_PROFILE_RESULTS),
  ))
  const profiles: PublicProfile[] = []
  legacySnapshot.forEach((child) => {
    const value: unknown = child.val()
    if (isPublicProfile(value) && value.displayNameNormalized.startsWith(normalizedPrefix)) {
      profiles.push({ ...value, uid: child.key || value.uid })
    }
  })
  return profiles.slice(0, MAX_PROFILE_RESULTS)
}

export interface ShareDeckInput {
  deck: StudyDeck
  cards: StudyCard[]
  recipientId: unknown
  senderDisplayName?: unknown
}

export async function shareDeckCopy(
  user: User | null | undefined,
  input: ShareDeckInput,
): Promise<SharedDeckInboxItem> {
  const authenticatedUser = requireUser(user)
  if (!input || !isRecord(input.deck) || !Array.isArray(input.cards)) {
    throw new TypeError('A deck and cards are required')
  }
  if (input.deck.ownerId !== authenticatedUser.uid) {
    throw new Error('Only the deck owner can share it')
  }
  if (input.cards.length < 1 || input.cards.length > MAX_CARDS_PER_SHARE) {
    throw new RangeError(`cards must contain 1 to ${MAX_CARDS_PER_SHARE} items`)
  }

  const recipientId = requireId(input.recipientId, 'recipientId')
  if (recipientId === authenticatedUser.uid) throw new TypeError('A deck cannot be shared with its owner')

  const shareId = requireId(push(ref(database, 'sharedDecks')).key, 'shareId')
  const lineageId = requireId(input.deck.lineageId || input.deck.id, 'lineageId')
  const senderDisplayName = cleanString(
    input.senderDisplayName || authenticatedUser.displayName || 'Kogni learner',
    MAX_DISPLAY_NAME_LENGTH,
  )
  const title = cleanString(input.deck.title || 'Untitled deck', MAX_TITLE_LENGTH)
  const description = cleanString(input.deck.description, MAX_DESCRIPTION_LENGTH)
  const studyGuide = typeof input.deck.studyGuide === 'string'
    ? input.deck.studyGuide.trim().slice(0, MAX_STUDY_GUIDE_LENGTH)
    : ''
  const cards: Record<string, SharedDeckCard> = {}
  input.cards.forEach((card, index) => {
    if (card.deckId !== input.deck.id || card.ownerId !== authenticatedUser.uid) {
      throw new Error('Every shared card must belong to the deck owner and selected deck')
    }
    const cardId = `card_${index}`
    cards[cardId] = {
      id: cardId,
      question: cleanString(card.question, MAX_CARD_TEXT_LENGTH),
      answer: cleanString(card.answer, MAX_CARD_TEXT_LENGTH),
      distractors: Array.isArray(card.distractors)
        ? card.distractors
            .slice(0, MAX_DISTRACTORS)
            .map((item) => cleanString(item, MAX_CARD_TEXT_LENGTH))
        : [],
    }
  })

  const createdAt = serverTimestamp()
  const sharedDeck: SharedDeckSnapshot = {
    id: shareId,
    ownerId: authenticatedUser.uid,
    recipientId,
    senderDisplayName,
    lineageId,
    title,
    description,
    ...(studyGuide ? { studyGuide } : {}),
    ...(studyGuide && hasCompleteStudyGuideCoverage(studyGuide, Object.values(cards))
      ? { studyGuideCoverage: STUDY_GUIDE_COVERAGE }
      : {}),
    cardCount: input.cards.length,
    createdAt,
    cards,
  }
  const inboxItem: SharedDeckInboxItem = {
    id: shareId,
    sharedDeckId: shareId,
    ownerId: authenticatedUser.uid,
    senderDisplayName,
    lineageId,
    title,
    description,
    cardCount: input.cards.length,
    createdAt,
  }

  await update(ref(database), {
    [`sharedDecks/${shareId}`]: sharedDeck,
    [`sharedWithMe/${recipientId}/${shareId}`]: inboxItem,
  })
  return inboxItem
}

export async function getSharedDeckCopy(
  user: User | null | undefined,
  sharedDeckId: unknown,
): Promise<SharedDeckSnapshot | null> {
  const authenticatedUser = requireUser(user)
  const shareId = requireId(sharedDeckId, 'sharedDeckId')
  const sharedSnapshot = await get(ref(database, `sharedDecks/${shareId}`))
  const sharedDeck = readSharedDeck(sharedSnapshot)
  if (!sharedDeck || (sharedDeck.ownerId !== authenticatedUser.uid && sharedDeck.recipientId !== authenticatedUser.uid)) {
    throw new Error('Shared deck access denied')
  }
  return sharedDeck
}

export async function getSharedDeckInbox(
  user: User | null | undefined,
): Promise<SharedDeckInboxItem[]> {
  const authenticatedUser = requireUser(user)
  return readInboxSnapshot(await get(ref(database, `sharedWithMe/${authenticatedUser.uid}`)))
}

export async function dismissSharedDeckInbox(
  user: User | null | undefined,
  sharedDeckId: unknown,
): Promise<void> {
  const authenticatedUser = requireUser(user)
  const shareId = requireId(sharedDeckId, 'sharedDeckId')
  await remove(ref(database, `sharedWithMe/${authenticatedUser.uid}/${shareId}`))
}

export function subscribeToSharedDeckInbox(
  user: User | null | undefined,
  callback: (items: SharedDeckInboxItem[]) => void,
  error?: (error: Error) => void,
): Unsubscribe {
  const authenticatedUser = requireUser(user)
  if (typeof callback !== 'function') throw new TypeError('callback must be a function')
  const inboxQuery = query(
    ref(database, `sharedWithMe/${authenticatedUser.uid}`),
    orderByChild('createdAt'),
  )
  return onValue(
    inboxQuery,
    (snapshot) => callback(readInboxSnapshot(snapshot)),
    typeof error === 'function' ? error : undefined,
  )
}

export async function findExistingShare(
  user: User | null | undefined,
  sharedDeckId: unknown,
): Promise<SharedDeckInboxItem | null> {
  const authenticatedUser = requireUser(user)
  const shareId = requireId(sharedDeckId, 'sharedDeckId')
  const snapshot = await get(
    query(
      ref(database, `sharedWithMe/${authenticatedUser.uid}`),
      orderByChild('sharedDeckId'),
      equalTo(shareId),
      limitToFirst(1),
    ),
  )
  return readInboxSnapshot(snapshot)[0] ?? null
}
