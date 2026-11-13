import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PublicPlayerProfile from '../components/PublicPlayerProfile'
import type { PublicPlayerDeckMetadata, PublicPlayerProfileData } from '../components/PublicPlayerProfile'
import { useAuth } from '../context/AuthContext'
import { followPlayer, getPlayerProfile, listPlayerDecks, unfollowPlayer } from '../lib/social'
import { ApiRequestError } from '../lib/vercel-api'
import { getPresence } from '../lib/presence'
import { getLevelFromXp } from '../lib/leaderboard'
import { onlineDeckPath, paths } from '../router/paths'

function deckMetadata(deck: Awaited<ReturnType<typeof listPlayerDecks>>['items'][number]): PublicPlayerDeckMetadata {
  return { id: deck.id, title: deck.title, description: deck.description, questionCount: deck.cardCount }
}

function appendUniqueDecks(current: PublicPlayerDeckMetadata[], incoming: PublicPlayerDeckMetadata[]): PublicPlayerDeckMetadata[] {
  const seen = new Set(current.map((deck) => deck.id))
  return [...current, ...incoming.filter((deck) => !seen.has(deck.id) && seen.add(deck.id))]
}

export default function PublicPlayerRoute() {
  const { playerId = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const userUid = user?.uid
  const [profile, setProfile] = useState<PublicPlayerProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [followPending, setFollowPending] = useState(false)
  const [followError, setFollowError] = useState('')
  const [deckCursor, setDeckCursor] = useState<string | undefined>()
  const [hasMoreDecks, setHasMoreDecks] = useState(false)
  const [decksLoading, setDecksLoading] = useState(false)
  const [decksError, setDecksError] = useState('')
  const generation = useRef(0)
  const loadController = useRef<AbortController | null>(null)
  const moreController = useRef<AbortController | null>(null)
  const morePending = useRef(false)

  const load = useCallback(async (): Promise<void> => {
    if (!playerId || !userUid) return
    if (playerId === userUid) {
      navigate(paths.profile, { replace: true })
      return
    }
    loadController.current?.abort()
    moreController.current?.abort()
    morePending.current = false
    const requestGeneration = ++generation.current
    const controller = new AbortController()
    loadController.current = controller
    setLoading(true)
    setError('')
    setProfile(null)
    setDeckCursor(undefined)
    setHasMoreDecks(false)
    setDecksError('')
    try {
      // Profile authorization must succeed before requesting any adjacent player data.
      const result = await getPlayerProfile(playerId, { signal: controller.signal })
      const [decksResult, presenceResult] = await Promise.allSettled([
        listPlayerDecks(playerId, undefined, { signal: controller.signal }),
        getPresence(playerId, { signal: controller.signal }),
      ])
      if (generation.current !== requestGeneration) return
      if (decksResult.status === 'rejected' && decksResult.reason instanceof ApiRequestError && decksResult.reason.status === 404) {
        throw decksResult.reason
      }
      const decksPage = decksResult.status === 'fulfilled' ? decksResult.value : { items: [], hasMore: false as const }
      setDecksError(decksResult.status === 'rejected' ? 'Published decks could not be loaded.' : '')
      setProfile({
        id: result.profile.uid,
        nickname: result.profile.nickname,
        online: presenceResult.status === 'fulfilled' && presenceResult.value.online,
        communityXp: result.profile.communityXp,
        level: getLevelFromXp(result.profile.communityXp),
        followerCount: result.profile.followerCount,
        followingCount: result.profile.followingCount,
        isFollowing: result.social.following,
        publishedDecks: decksPage.items.map(deckMetadata),
      })
      setDeckCursor(decksPage.nextCursor)
      setHasMoreDecks(decksPage.hasMore)
    } catch (loadError: unknown) {
      if (generation.current === requestGeneration && !(loadError instanceof DOMException && loadError.name === 'AbortError')) {
        setError('This player profile is unavailable.')
      }
    } finally {
      if (loadController.current === controller) loadController.current = null
      if (generation.current === requestGeneration) setLoading(false)
    }
  }, [navigate, playerId, userUid])

  useEffect(() => {
    void load()
    return () => {
      generation.current += 1
      loadController.current?.abort()
      moreController.current?.abort()
      morePending.current = false
    }
  }, [load])

  const loadMoreDecks = useCallback(async () => {
    if (!playerId || !deckCursor || morePending.current) return
    morePending.current = true
    const requestGeneration = generation.current
    const expectedCursor = deckCursor
    const controller = new AbortController()
    moreController.current?.abort()
    moreController.current = controller
    setDecksLoading(true)
    setDecksError('')
    try {
      const page = await listPlayerDecks(playerId, expectedCursor, { signal: controller.signal })
      if (generation.current !== requestGeneration || deckCursor !== expectedCursor) return
      setProfile((current) => current ? {
        ...current,
        publishedDecks: appendUniqueDecks(current.publishedDecks, page.items.map(deckMetadata)),
      } : current)
      setDeckCursor(page.nextCursor)
      setHasMoreDecks(page.hasMore)
    } catch (loadError: unknown) {
      if (generation.current === requestGeneration && !(loadError instanceof DOMException && loadError.name === 'AbortError')) {
        setDecksError('More published decks could not be loaded.')
      }
    } finally {
      if (moreController.current === controller) moreController.current = null
      morePending.current = false
      if (generation.current === requestGeneration) setDecksLoading(false)
    }
  }, [deckCursor, playerId])

  return <PublicPlayerProfile
    profile={profile}
    loading={loading}
    error={error}
    followPending={followPending}
    followError={followError}
    hasMoreDecks={hasMoreDecks}
    decksLoading={decksLoading}
    decksError={decksError}
    onRetry={load}
    onLoadMoreDecks={loadMoreDecks}
    onRetryDecks={load}
    onFollow={async () => {
      setFollowPending(true); setFollowError('')
      try {
        await followPlayer(playerId)
        setProfile((current) => current ? { ...current, isFollowing: true, followerCount: current.followerCount + 1 } : current)
      } catch { setFollowError('This player could not be followed.') }
      finally { setFollowPending(false) }
    }}
    onUnfollow={async () => {
      setFollowPending(true); setFollowError('')
      try {
        await unfollowPlayer(playerId)
        setProfile((current) => current ? { ...current, isFollowing: false, followerCount: Math.max(0, current.followerCount - 1) } : current)
      } catch { setFollowError('This player could not be unfollowed.') }
      finally { setFollowPending(false) }
    }}
    onOpenDeck={(deck) => navigate(onlineDeckPath(deck.id))}
  />
}
