import {
  get,
  limitToLast,
  orderByChild,
  query,
  ref,
} from 'firebase/database'
import { database } from './firebase'
import { authenticatedRequest } from './vercel-api'
import type { ApiRequestOptions } from './vercel-api'
import type {
  ActivePlayerProjection,
  DiscoveryPage,
  PublicOnlineDeckProjection,
} from '../types/projections'
import { DISCOVERY_PAGE_SIZE, DISCOVERY_QUERY_LIMIT } from '../types/projections'

const FIREBASE_KEY_PATTERN = /^[^.#$[\]/]{1,200}$/
const NICKNAME_PATTERN = /^[A-Za-z0-9_]{3,24}$/
const ACTIVE_PLAYER_KEYS = ['nickname', 'nicknameCanonical', 'uid'] as const
const CATALOG_KEYS = [
  'cardCount', 'description', 'id', 'latestVersion', 'ownerId', 'ownerNickname',
  'ownerNicknameCanonical', 'title', 'titleCanonical', 'updatedAt',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === expected.length && expected.every((key, index) => actual[index] === key)
}

function isSafeIntegerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum
}

function requireFirebaseKey(value: unknown, label: string): string {
  if (typeof value !== 'string' || !FIREBASE_KEY_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a valid Firebase key`)
  }
  return value
}

function hasForbiddenSearchCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 0xf8ff
  })
}

function requirePrefix(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`)
  const normalized = value.trim().toLowerCase()
  if (!normalized || normalized.length > maximum || hasForbiddenSearchCharacters(normalized)) {
    throw new TypeError(`${label} must contain 1 to ${maximum} searchable characters`)
  }
  return normalized
}

export function parseActivePlayer(value: unknown, key?: string): ActivePlayerProjection | null {
  if (!isRecord(value) || !hasExactKeys(value, ACTIVE_PLAYER_KEYS)) return null
  if (
    typeof value.uid !== 'string' ||
    (key !== undefined && value.uid !== key) ||
    !FIREBASE_KEY_PATTERN.test(value.uid) ||
    typeof value.nickname !== 'string' ||
    !NICKNAME_PATTERN.test(value.nickname) ||
    value.nicknameCanonical !== value.nickname.toLowerCase()
  ) return null
  return value as unknown as ActivePlayerProjection
}

export function parsePublicOnlineDeck(value: unknown, key?: string): PublicOnlineDeckProjection | null {
  if (!isRecord(value) || !hasExactKeys(value, CATALOG_KEYS)) return null
  if (
    typeof value.id !== 'string' ||
    (key !== undefined && value.id !== key) ||
    !FIREBASE_KEY_PATTERN.test(value.id) ||
    typeof value.ownerId !== 'string' ||
    !FIREBASE_KEY_PATTERN.test(value.ownerId) ||
    typeof value.ownerNickname !== 'string' ||
    !NICKNAME_PATTERN.test(value.ownerNickname) ||
    value.ownerNicknameCanonical !== value.ownerNickname.toLowerCase() ||
    typeof value.title !== 'string' || value.title.length < 1 || value.title.length > 160 ||
    value.titleCanonical !== value.title.toLowerCase() ||
    typeof value.description !== 'string' || value.description.length > 2000 ||
    !isSafeIntegerBetween(value.cardCount, 1, 500) ||
    !isSafeIntegerBetween(value.latestVersion, 1, Number.MAX_SAFE_INTEGER) ||
    typeof value.updatedAt !== 'number' || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0
  ) return null
  return value as unknown as PublicOnlineDeckProjection
}

function parsePage<T>(
  value: unknown,
  parser: (candidate: unknown, key?: string) => T | null,
  compare: (left: T, right: T) => number,
): DiscoveryPage<T> {
  if (value === null) return { items: [], hasMore: false }
  if (!isRecord(value)) throw new Error('Discovery projection response must be an object')
  const items = Object.entries(value).map(([key, candidate]) => {
    const parsed = parser(candidate, key)
    if (!parsed) throw new Error(`Rejected malformed discovery projection at ${key}`)
    return parsed
  }).sort(compare)
  return {
    items: items.slice(0, DISCOVERY_PAGE_SIZE),
    hasMore: items.length > DISCOVERY_PAGE_SIZE,
  }
}

export function isActivePlayersPage(value: unknown): value is DiscoveryPage<ActivePlayerProjection> {
  if (!isRecord(value) || !hasExactKeys(value, ['hasMore', 'items'])) return false
  if (typeof value.hasMore !== 'boolean' || !Array.isArray(value.items) || value.items.length > DISCOVERY_PAGE_SIZE) return false
  const seen = new Set<string>()
  return value.items.every((candidate: unknown) => {
    const player = parseActivePlayer(candidate)
    if (!player || seen.has(player.uid)) return false
    seen.add(player.uid)
    return true
  })
}

/** Lists bounded online-player metadata through the authenticated server projection. */
export async function listActivePlayers(
  options?: ApiRequestOptions,
): Promise<DiscoveryPage<ActivePlayerProjection>> {
  return authenticatedRequest('/api/players/online', isActivePlayersPage, options)
}

/** Lists newest catalog metadata without loading deck versions, cards, guides, or schedules. */
export async function listRecentPublicOnlineDecks(): Promise<DiscoveryPage<PublicOnlineDeckProjection>> {
  const snapshot = await get(query(
    ref(database, 'publicOnlineDeckCatalog'),
    orderByChild('updatedAt'),
    limitToLast(DISCOVERY_QUERY_LIMIT),
  ))
  return parsePage(
    snapshot.val(),
    parsePublicOnlineDeck,
    (left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id),
  )
}

/** Lists newest safe catalog metadata for one discoverable owner. */
export async function listPublicOnlineDecksByOwner(
  ownerIdValue: unknown,
): Promise<DiscoveryPage<PublicOnlineDeckProjection>> {
  const ownerId = requireFirebaseKey(ownerIdValue, 'ownerId')
  const snapshot = await get(query(
    ref(database, `onlineDecksByOwner/${ownerId}`),
    orderByChild('updatedAt'),
    limitToLast(DISCOVERY_QUERY_LIMIT),
  ))
  return parsePage(
    snapshot.val(),
    parsePublicOnlineDeck,
    (left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id),
  )
}

/** Performs a bounded, indexed lowercase title-prefix search. */
export async function listPublicOnlineDecksByTitlePrefix(
  titlePrefix: unknown,
): Promise<DiscoveryPage<PublicOnlineDeckProjection>> {
  const prefix = requirePrefix(titlePrefix, 'titlePrefix', 160)
  const page = await listRecentPublicOnlineDecks()
  const items = page.items.filter((deck) => deck.titleCanonical.startsWith(prefix))
  return { items, hasMore: page.hasMore }
}
