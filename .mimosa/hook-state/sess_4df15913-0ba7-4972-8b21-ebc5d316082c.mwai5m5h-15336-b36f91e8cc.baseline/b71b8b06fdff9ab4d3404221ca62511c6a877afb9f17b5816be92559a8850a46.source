export const PLAYER_XP_TRUST = 'client-reported' as const

/** Functions-owned, exact-field public projection. Presence is intentionally separate. */
export interface PublicPlayerProfile {
  uid: string
  nickname: string
  nicknameCanonical: string
  /** Existing leaderboard XP; currently reported by the client under constrained RTDB rules. */
  communityXp: number
  xpTrust: typeof PLAYER_XP_TRUST
  followerCount: number
  followingCount: number
  publishedDeckCount: number
}

export interface PlayerSocialState {
  following: boolean
  followedBy: boolean
}

export interface GetPlayerProfileInput {
  uid: string
}

export interface GetPlayerProfileResult {
  profile: PublicPlayerProfile
  social: PlayerSocialState
}

export interface FollowPlayerResult {
  targetUid: string
  following: boolean
}

export interface BlockPlayerResult {
  targetUid: string
  blocked: boolean
}
