import { get, ref, serverTimestamp, update } from 'firebase/database'
import type { User } from 'firebase/auth'
import { database } from './firebase'
import { isRecord } from './errors'
import type {
  AccountPreferences,
  AccountRecord,
  NicknameIdentity,
  PublicAccountProfile,
} from '../types/domain'

export const PRIVACY_VERSION = 'privacy-2026-11-10-ai-series-1'
export const NICKNAME_MIN_LENGTH = 3
export const NICKNAME_MAX_LENGTH = 24
export const NICKNAME_PATTERN = /^[A-Za-z0-9_]{3,24}$/

export interface CompleteAccountOnboardingInput {
  nickname: unknown
  acknowledgedPrivacyVersion: unknown
  preferences?: Partial<AccountPreferences>
}

export interface UpdateAccountPreferencesInput {
  discoverable?: boolean
  presence?: boolean
}

export class AccountNotReadyError extends Error {
  constructor(message = 'Account onboarding is not complete') {
    super(message)
    this.name = 'AccountNotReadyError'
  }
}

function requireUser(user: User | null | undefined): User {
  if (!user || typeof user.uid !== 'string' || !user.uid) {
    throw new TypeError('An authenticated user is required')
  }
  return user
}

function timestampIsValid(value: unknown): boolean {
  return typeof value === 'number' || isRecord(value)
}

function isPreferences(value: unknown): value is AccountPreferences {
  return (
    isRecord(value) &&
    typeof value.discoverable === 'boolean' &&
    typeof value.presence === 'boolean'
  )
}

export function isAccountRecord(value: unknown): value is AccountRecord {
  if (!isRecord(value) || !isRecord(value.privacy)) return false
  const acknowledgements = value.privacy.acknowledgements
  return (
    typeof value.uid === 'string' &&
    value.status === 'ready' &&
    typeof value.nickname === 'string' &&
    NICKNAME_PATTERN.test(value.nickname) &&
    typeof value.nicknameCanonical === 'string' &&
    value.nicknameCanonical === value.nickname.toLowerCase() &&
    timestampIsValid(value.createdAt) &&
    timestampIsValid(value.updatedAt) &&
    value.privacy.currentVersion === PRIVACY_VERSION &&
    timestampIsValid(value.privacy.acknowledgedAt) &&
    isRecord(acknowledgements) &&
    timestampIsValid(acknowledgements[PRIVACY_VERSION]) &&
    isPreferences(value.preferences)
  )
}

/** Returns the case-insensitive nickname claim key used by every backend service. */
export function canonicalizeNickname(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('nickname must be a string')
  const nickname = value.trim()
  if (!NICKNAME_PATTERN.test(nickname)) {
    throw new TypeError(
      `nickname must contain ${NICKNAME_MIN_LENGTH} to ${NICKNAME_MAX_LENGTH} ASCII letters, digits, or underscores`,
    )
  }
  return nickname.toLowerCase()
}

export function nicknameIdentity(account: AccountRecord): NicknameIdentity {
  if (!isAccountRecord(account)) throw new TypeError('A ready account record is required')
  return {
    uid: account.uid,
    nickname: account.nickname,
    nicknameCanonical: account.nicknameCanonical,
  }
}

function legacyPublicProjection(
  uid: string,
  nickname: string,
  nicknameCanonical: string,
): Record<string, unknown> {
  return {
    uid,
    displayName: nickname,
    displayNameNormalized: nicknameCanonical,
    photoURL: '',
    updatedAt: serverTimestamp(),
  }
}

function publicProjection(
  uid: string,
  nickname: string,
  nicknameCanonical: string,
): PublicAccountProfile {
  return {
    uid,
    nickname,
    nicknameCanonical,
    updatedAt: serverTimestamp(),
  }
}

function parsePreferences(input?: Partial<AccountPreferences>): AccountPreferences {
  if (input?.discoverable !== undefined && typeof input.discoverable !== 'boolean') {
    throw new TypeError('discoverable must be a boolean')
  }
  if (input?.presence !== undefined && typeof input.presence !== 'boolean') {
    throw new TypeError('presence must be a boolean')
  }
  return {
    discoverable: input?.discoverable ?? false,
    presence: input?.presence ?? false,
  }
}

/**
 * Atomically claims the canonical nickname and creates the private account and
 * optional public projection. A rules rejection means the claim was unavailable
 * or the submitted account contract was invalid; callers should not overwrite it.
 */
export async function completeAccountOnboarding(
  user: User | null | undefined,
  input: CompleteAccountOnboardingInput,
): Promise<AccountRecord> {
  const authenticatedUser = requireUser(user)
  if (!input || !isRecord(input)) throw new TypeError('input must be an object')
  if (input.acknowledgedPrivacyVersion !== PRIVACY_VERSION) {
    throw new TypeError(`acknowledgedPrivacyVersion must be ${PRIVACY_VERSION}`)
  }

  const nicknameCanonical = canonicalizeNickname(input.nickname)
  const nickname = (input.nickname as string).trim()
  const preferences = parsePreferences(input.preferences)
  const timestamp = serverTimestamp()
  const account: AccountRecord = {
    uid: authenticatedUser.uid,
    status: 'ready',
    nickname,
    nicknameCanonical,
    createdAt: timestamp,
    updatedAt: timestamp,
    privacy: {
      currentVersion: PRIVACY_VERSION,
      acknowledgedAt: timestamp,
      acknowledgements: { [PRIVACY_VERSION]: timestamp },
    },
    preferences,
  }

  const updates: Record<string, unknown> = {
    [`nicknameClaims/${nicknameCanonical}`]: authenticatedUser.uid,
    [`accounts/${authenticatedUser.uid}`]: account,
    [`publicAccounts/${authenticatedUser.uid}`]: preferences.discoverable
      ? publicProjection(authenticatedUser.uid, nickname, nicknameCanonical)
      : null,
    [`publicProfiles/${authenticatedUser.uid}`]: preferences.discoverable
      ? legacyPublicProjection(authenticatedUser.uid, nickname, nicknameCanonical)
      : null,
  }
  await update(ref(database), updates)
  return account
}

export async function getAccount(user: User | null | undefined): Promise<AccountRecord | null> {
  const authenticatedUser = requireUser(user)
  const value: unknown = (await get(ref(database, `accounts/${authenticatedUser.uid}`))).val()
  return isAccountRecord(value) && value.uid === authenticatedUser.uid ? value : null
}

export async function requireReadyAccount(
  user: User | null | undefined,
): Promise<AccountRecord> {
  const account = await getAccount(user)
  if (!account) throw new AccountNotReadyError()
  return account
}

/** Atomically reserves the new claim before releasing the old one. */
export async function renameAccount(
  user: User | null | undefined,
  nextNicknameInput: unknown,
): Promise<AccountRecord> {
  const authenticatedUser = requireUser(user)
  const current = await requireReadyAccount(authenticatedUser)
  const nextCanonical = canonicalizeNickname(nextNicknameInput)
  const nextNickname = (nextNicknameInput as string).trim()
  if (nextCanonical === current.nicknameCanonical && nextNickname === current.nickname) return current

  const updatedAt = serverTimestamp()
  const next: AccountRecord = {
    ...current,
    nickname: nextNickname,
    nicknameCanonical: nextCanonical,
    updatedAt,
  }
  const updates: Record<string, unknown> = {
    [`nicknameClaims/${nextCanonical}`]: authenticatedUser.uid,
    [`accounts/${authenticatedUser.uid}/nickname`]: nextNickname,
    [`accounts/${authenticatedUser.uid}/nicknameCanonical`]: nextCanonical,
    [`accounts/${authenticatedUser.uid}/updatedAt`]: updatedAt,
    [`publicAccounts/${authenticatedUser.uid}`]: current.preferences.discoverable
      ? publicProjection(authenticatedUser.uid, nextNickname, nextCanonical)
      : null,
    [`publicProfiles/${authenticatedUser.uid}`]: current.preferences.discoverable
      ? legacyPublicProjection(authenticatedUser.uid, nextNickname, nextCanonical)
      : null,
  }
  if (nextCanonical !== current.nicknameCanonical) {
    updates[`nicknameClaims/${current.nicknameCanonical}`] = null
  }

  await update(ref(database), updates)
  return next
}

/** Updates opt-in preferences and keeps public data/presence consistent atomically. */
export async function updateAccountPreferences(
  user: User | null | undefined,
  patch: UpdateAccountPreferencesInput,
): Promise<AccountRecord> {
  const authenticatedUser = requireUser(user)
  if (!patch || !isRecord(patch)) throw new TypeError('patch must be an object')
  const current = await requireReadyAccount(authenticatedUser)
  const preferences = parsePreferences({ ...current.preferences, ...patch })
  const updatedAt = serverTimestamp()
  const next: AccountRecord = { ...current, preferences, updatedAt }
  const updates: Record<string, unknown> = {
    [`accounts/${authenticatedUser.uid}/preferences`]: preferences,
    [`accounts/${authenticatedUser.uid}/updatedAt`]: updatedAt,
    [`publicAccounts/${authenticatedUser.uid}`]: preferences.discoverable
      ? publicProjection(authenticatedUser.uid, current.nickname, current.nicknameCanonical)
      : null,
    [`publicProfiles/${authenticatedUser.uid}`]: preferences.discoverable
      ? legacyPublicProjection(authenticatedUser.uid, current.nickname, current.nicknameCanonical)
      : null,
  }
  if (!preferences.presence) updates[`presenceSessions/${authenticatedUser.uid}`] = null
  await update(ref(database), updates)
  return next
}
