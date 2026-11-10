export interface ActivePlayerProjection {
  uid: string
  nickname: string
  nicknameCanonical: string
}

export interface PublicOnlineDeckProjection {
  id: string
  ownerId: string
  ownerNickname: string
  ownerNicknameCanonical: string
  title: string
  titleCanonical: string
  description: string
  cardCount: number
  latestVersion: number
  updatedAt: number
}

export interface OnlineDeckHeadSource {
  id: string
  ownerId: string
  visibility: string
  status: string
  latestVersion: number
  title: string
  description: string
  cardCount: number
  updatedAt: number
}

export interface OnlineDeckProjectionRemoval {
  catalogDeckId: string
  ownerDeckIds: string[]
}

/** Tombstones never retain discovery entries, including stale owner-index rows. */
export function buildOnlineDeckProjectionRemoval(
  deckId: string,
  currentOwnerId: string | null,
  previousOwnerId: string | null,
): OnlineDeckProjectionRemoval {
  return {
    catalogDeckId: deckId,
    ownerDeckIds: [...new Set([currentOwnerId, previousOwnerId].filter((value): value is string => Boolean(value)))],
  }
}

export interface AccountSource {
  uid: string
  status: string
  nickname: string
  nicknameCanonical: string
  privacy: {
    currentVersion: string
    acknowledgements?: Record<string, unknown>
  }
  preferences: {
    discoverable: boolean
    presence: boolean
  }
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readEligibleAccount(
  value: unknown,
  uid: string,
  expectedPrivacyVersion: string,
): AccountSource | null {
  if (!isPlainRecord(value) || !isPlainRecord(value.privacy) || !isPlainRecord(value.preferences)) return null
  if (
    value.uid !== uid ||
    value.status !== 'ready' ||
    typeof value.nickname !== 'string' ||
    !/^[A-Za-z0-9_]{3,24}$/.test(value.nickname) ||
    typeof value.nicknameCanonical !== 'string' ||
    value.nicknameCanonical !== value.nickname.toLowerCase() ||
    value.privacy.currentVersion !== expectedPrivacyVersion ||
    !isPlainRecord(value.privacy.acknowledgements) ||
    value.privacy.acknowledgements[expectedPrivacyVersion] === undefined ||
    typeof value.preferences.discoverable !== 'boolean' ||
    typeof value.preferences.presence !== 'boolean'
  ) return null

  return value as unknown as AccountSource
}

export function buildActivePlayerProjection(
  accountValue: unknown,
  uid: string,
  presenceValue: unknown,
  expectedPrivacyVersion: string,
): ActivePlayerProjection | null {
  const account = readEligibleAccount(accountValue, uid, expectedPrivacyVersion)
  if (!account || !account.preferences.discoverable || !account.preferences.presence) return null
  if (!isPlainRecord(presenceValue) || !Object.values(presenceValue).some((marker) => marker === true)) return null
  return {
    uid,
    nickname: account.nickname,
    nicknameCanonical: account.nicknameCanonical,
  }
}

function readDeckHead(value: unknown, deckId: string): OnlineDeckHeadSource | null {
  if (!isPlainRecord(value)) return null
  if (
    value.id !== deckId ||
    typeof value.ownerId !== 'string' ||
    value.visibility !== 'public' ||
    value.status !== 'active' ||
    !Number.isSafeInteger(value.latestVersion) ||
    (value.latestVersion as number) < 1 ||
    typeof value.title !== 'string' ||
    value.title.length < 1 ||
    value.title.length > 160 ||
    typeof value.description !== 'string' ||
    value.description.length > 2000 ||
    !Number.isSafeInteger(value.cardCount) ||
    (value.cardCount as number) < 1 ||
    (value.cardCount as number) > 500 ||
    typeof value.updatedAt !== 'number' ||
    !Number.isSafeInteger(value.updatedAt) ||
    value.updatedAt < 0
  ) return null
  return value as unknown as OnlineDeckHeadSource
}

export function buildPublicOnlineDeckProjection(
  headValue: unknown,
  deckId: string,
  ownerAccountValue: unknown,
  expectedPrivacyVersion: string,
): PublicOnlineDeckProjection | null {
  const head = readDeckHead(headValue, deckId)
  if (!head) return null
  const account = readEligibleAccount(ownerAccountValue, head.ownerId, expectedPrivacyVersion)
  if (!account?.preferences.discoverable) return null
  return {
    id: deckId,
    ownerId: head.ownerId,
    ownerNickname: account.nickname,
    ownerNicknameCanonical: account.nicknameCanonical,
    title: head.title,
    titleCanonical: head.title.toLowerCase(),
    description: head.description,
    cardCount: head.cardCount,
    latestVersion: head.latestVersion,
    updatedAt: head.updatedAt,
  }
}
