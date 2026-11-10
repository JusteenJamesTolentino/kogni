import { get, ref, update } from 'firebase/database'
import { auth, database } from './firebase'
import { isRecord } from './errors'
import type {
  BlockPlayerResult,
  FollowPlayerResult,
  GetPlayerProfileResult,
  PublicPlayerProfile,
} from '../types/social'
import { PLAYER_XP_TRUST } from '../types/social'

const UID_PATTERN = /^[^.#$[\]/]{1,128}$/
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

export function isPublicPlayerProfile(value: unknown): value is PublicPlayerProfile {
  if (!isRecord(value) || Object.keys(value).length !== PROFILE_FIELDS.length) return false
  if (!PROFILE_FIELDS.every((field) => Object.hasOwn(value, field))) return false
  return typeof value.uid === 'string' && UID_PATTERN.test(value.uid) &&
    typeof value.nickname === 'string' && /^[A-Za-z0-9_]{3,24}$/.test(value.nickname) &&
    value.nicknameCanonical === value.nickname.toLowerCase() &&
    isCount(value.communityXp) &&
    value.xpTrust === PLAYER_XP_TRUST &&
    isCount(value.followerCount) &&
    isCount(value.followingCount) &&
    isCount(value.publishedDeckCount)
}

function requireCurrentUser(): string {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('You must be signed in to manage follows.')
  return uid
}

/** Exact lookup only; this API never lists or searches player identities. */
export async function getPlayerProfile(uid: unknown): Promise<GetPlayerProfileResult> {
  const targetUid = requireUid(uid)
  const accountSnapshot = await get(ref(database, `publicAccounts/${targetUid}`))
  const account = accountSnapshot.val()
  if (!isRecord(account) || account.uid !== targetUid || typeof account.nickname !== 'string' || typeof account.nicknameCanonical !== 'string') {
    throw new Error('Player profile unavailable')
  }
  const followerSnapshot = await get(ref(database, `playerFollowing/${requireCurrentUser()}/${targetUid}`))
  return {
    profile: {
      uid: targetUid,
      nickname: account.nickname,
      nicknameCanonical: account.nicknameCanonical,
      communityXp: 0,
      xpTrust: PLAYER_XP_TRUST,
      followerCount: 0,
      followingCount: 0,
      publishedDeckCount: 0,
    },
    social: { following: followerSnapshot.exists(), followedBy: false },
  }
}

export async function followPlayer(uid: unknown): Promise<FollowPlayerResult> {
  const targetUid = requireUid(uid)
  const followerUid = requireCurrentUser()
  if (followerUid === targetUid) throw new Error('You cannot follow yourself.')
  const targetSnapshot = await get(ref(database, `publicAccounts/${targetUid}`))
  if (!targetSnapshot.exists()) throw new Error('This player is not available for following.')
  const marker = { createdAt: Date.now() }
  await update(ref(database), {
    [`playerFollowing/${followerUid}/${targetUid}`]: marker,
    [`playerFollowers/${targetUid}/${followerUid}`]: marker,
  })
  return { targetUid, following: true }
}

export async function unfollowPlayer(uid: unknown): Promise<FollowPlayerResult> {
  const targetUid = requireUid(uid)
  const followerUid = requireCurrentUser()
  await update(ref(database), {
    [`playerFollowing/${followerUid}/${targetUid}`]: null,
    [`playerFollowers/${targetUid}/${followerUid}`]: null,
  })
  return { targetUid, following: false }
}

export async function blockPlayer(uid: unknown): Promise<BlockPlayerResult> {
  const targetUid = requireUid(uid)
  throw new Error(`Blocking ${targetUid} requires the optional social service.`)
}

export async function unblockPlayer(uid: unknown): Promise<BlockPlayerResult> {
  const targetUid = requireUid(uid)
  throw new Error(`Unblocking ${targetUid} requires the optional social service.`)
}
