import { isRecord } from './errors'
import { parsePublicOnlineDeck } from './discovery'
import { authenticatedRequest } from './vercel-api'
import type { ApiRequestOptions } from './vercel-api'
import type { PublicOnlineDeckProjection } from '../types/projections'
import type {
  BlockPlayerResult,
  FollowPlayerResult,
  GetPlayerProfileResult,
  PublicPlayerProfile,
} from '../types/social'
import { PLAYER_XP_TRUST } from '../types/social'

const UID_PATTERN = /^[^.#$[\]/]{1,128}$/
const DECK_PAGE_SIZE = 20
const CURSOR_PATTERN = /^[0-9]+:[A-Za-z0-9_-]+$/
const SUMMARY_FIELDS = ['followerCount', 'followingCount'] as const
const DECK_PAGE_FIELDS = ['hasMore', 'items'] as const
const DECK_PAGE_WITH_CURSOR_FIELDS = ['hasMore', 'items', 'nextCursor'] as const

export interface SocialSummary {
  followerCount: number
  followingCount: number
}

export interface PlayerDeckPage {
  items: PublicOnlineDeckProjection[]
  hasMore: boolean
  nextCursor?: string
}

const PROFILE_FIELDS = [
  'uid',
  'nickname',
  'nicknameCanonical',
  'communityXp',
  'xpTrust',
  'followerCount',
  'followingCount',
  'publishedDeckCount',
] as const

function requireUid(value: unknown): string {
  if (typeof value !== 'string' || !UID_PATTERN.test(value)) {
    throw new TypeError('uid must be a valid Firebase key')
  }
  return value
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function hasExactFields(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
}

export function isPublicPlayerProfile(value: unknown): value is PublicPlayerProfile {
  if (!hasExactFields(value, PROFILE_FIELDS)) return false
  return typeof value.uid === 'string' && UID_PATTERN.test(value.uid) &&
    typeof value.nickname === 'string' && /^[A-Za-z0-9_]{3,24}$/.test(value.nickname) &&
    value.nicknameCanonical === value.nickname.toLowerCase() &&
    isCount(value.communityXp) &&
    value.xpTrust === PLAYER_XP_TRUST &&
    isCount(value.followerCount) &&
    isCount(value.followingCount) &&
    isCount(value.publishedDeckCount)
}

export function isGetPlayerProfileResult(value: unknown): value is GetPlayerProfileResult {
  return hasExactFields(value, ['profile', 'social']) &&
    isPublicPlayerProfile(value.profile) &&
    hasExactFields(value.social, ['following', 'followedBy']) &&
    typeof value.social.following === 'boolean' && typeof value.social.followedBy === 'boolean'
}

export function isFollowPlayerResult(value: unknown): value is FollowPlayerResult {
  return hasExactFields(value, ['targetUid', 'following']) &&
    typeof value.targetUid === 'string' && UID_PATTERN.test(value.targetUid) &&
    typeof value.following === 'boolean'
}

export function isSocialSummary(value: unknown): value is SocialSummary {
  return hasExactFields(value, SUMMARY_FIELDS) && isCount(value.followerCount) && isCount(value.followingCount)
}

export function isPlayerDeckPage(value: unknown): value is PlayerDeckPage {
  if (!isRecord(value) || typeof value.hasMore !== 'boolean' || !Array.isArray(value.items) || value.items.length > DECK_PAGE_SIZE) return false
  const expectedFields = value.hasMore ? DECK_PAGE_WITH_CURSOR_FIELDS : DECK_PAGE_FIELDS
  if (!hasExactFields(value, expectedFields)) return false
  if (value.hasMore && (typeof value.nextCursor !== 'string' || !CURSOR_PATTERN.test(value.nextCursor))) return false
  const seen = new Set<string>()
  let previous: PublicOnlineDeckProjection | undefined
  for (const candidate of value.items) {
    const deck = parsePublicOnlineDeck(candidate)
    if (!deck || seen.has(deck.id)) return false
    if (previous && (deck.updatedAt > previous.updatedAt || (deck.updatedAt === previous.updatedAt && deck.id.localeCompare(previous.id) <= 0))) return false
    seen.add(deck.id)
    previous = deck
  }
  return !value.hasMore || value.items.length === DECK_PAGE_SIZE
}

export async function getSocialSummary(options?: ApiRequestOptions): Promise<SocialSummary> {
  return authenticatedRequest('/api/players/me/social-summary', isSocialSummary, options)
}

export async function listPlayerDecks(
  uid: unknown,
  cursor?: unknown,
  options?: ApiRequestOptions,
): Promise<PlayerDeckPage> {
  const targetUid = requireUid(uid)
  if (cursor !== undefined && (typeof cursor !== 'string' || !CURSOR_PATTERN.test(cursor))) {
    throw new TypeError('cursor must be a valid player deck cursor')
  }
  const path = `/api/players/${encodeURIComponent(targetUid)}/decks${cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`}`
  return authenticatedRequest(path, isPlayerDeckPage, options)
}

/** Exact lookup only; this API never lists or searches player identities. */
export async function getPlayerProfile(
  uid: unknown,
  options?: ApiRequestOptions,
): Promise<GetPlayerProfileResult> {
  const targetUid = requireUid(uid)
  return authenticatedRequest(
    `/api/players/${encodeURIComponent(targetUid)}`,
    (value): value is GetPlayerProfileResult => isGetPlayerProfileResult(value) && value.profile.uid === targetUid,
    options,
  )
}

async function changeFollow(
  uid: unknown,
  following: boolean,
  options?: ApiRequestOptions,
): Promise<FollowPlayerResult> {
  const targetUid = requireUid(uid)
  return authenticatedRequest(
    `/api/social/${following ? 'follow' : 'unfollow'}`,
    (value): value is FollowPlayerResult => isFollowPlayerResult(value) &&
      value.targetUid === targetUid && value.following === following,
    { ...options, method: 'POST', body: { uid: targetUid } },
  )
}

export async function followPlayer(uid: unknown, options?: ApiRequestOptions): Promise<FollowPlayerResult> {
  return changeFollow(uid, true, options)
}

export async function unfollowPlayer(uid: unknown, options?: ApiRequestOptions): Promise<FollowPlayerResult> {
  return changeFollow(uid, false, options)
}

export async function blockPlayer(uid: unknown): Promise<BlockPlayerResult> {
  const targetUid = requireUid(uid)
  throw new Error(`Blocking ${targetUid} requires the optional social service.`)
}

export async function unblockPlayer(uid: unknown): Promise<BlockPlayerResult> {
  const targetUid = requireUid(uid)
  throw new Error(`Unblocking ${targetUid} requires the optional social service.`)
}
