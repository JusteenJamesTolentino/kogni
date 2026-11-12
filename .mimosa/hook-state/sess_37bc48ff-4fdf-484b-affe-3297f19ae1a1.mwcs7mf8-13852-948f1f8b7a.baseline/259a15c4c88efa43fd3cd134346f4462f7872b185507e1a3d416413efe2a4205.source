export const DISCOVERY_PAGE_SIZE = 20
export const DISCOVERY_QUERY_LIMIT = DISCOVERY_PAGE_SIZE + 1

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

export interface DiscoveryPage<T> {
  items: T[]
  hasMore: boolean
}
