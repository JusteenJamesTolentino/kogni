import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PublicPlayerProfile from '../components/PublicPlayerProfile'
import type { PublicPlayerDeckMetadata, PublicPlayerProfileData } from '../components/PublicPlayerProfile'
import { useAuth } from '../context/AuthContext'
import { listPublicOnlineDecksByOwner } from '../lib/discovery'
import { getPublicAccountByUid } from '../lib/community'
import { blockPlayer, followPlayer, getPlayerProfile, unfollowPlayer } from '../lib/social'
import { getPresence } from '../lib/presence'
import { getLevelFromXp } from '../lib/leaderboard'
import { onlineDeckPath, paths } from '../router/paths'

export default function PublicPlayerRoute() {
  const { playerId = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [profile, setProfile] = useState<PublicPlayerProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [followPending, setFollowPending] = useState(false)
  const [followError, setFollowError] = useState('')
  const [blockPending, setBlockPending] = useState(false)
  const [blockError, setBlockError] = useState('')

  const load = useCallback(async (): Promise<void> => {
    if (!playerId || !user) return
    if (playerId === user.uid) {
      navigate(paths.profile, { replace: true })
      return
    }
    setLoading(true)
    setError('')
    try {
      const [result, decksPage, presence] = await Promise.all([
        getPlayerProfile(playerId).catch(async () => {
          const publicProfile = await getPublicAccountByUid(playerId)
          if (!publicProfile) throw new Error('Public profile unavailable')
          return {
            profile: {
              uid: publicProfile.uid,
              nickname: publicProfile.displayName,
              communityXp: 0,
              followerCount: 0,
              followingCount: 0,
            },
            social: { following: false },
          }
        }),
        listPublicOnlineDecksByOwner(playerId),
        getPresence(playerId),
      ])
      const decks: PublicPlayerDeckMetadata[] = decksPage.items.map((deck) => ({
        id: deck.id,
        title: deck.title,
        description: deck.description,
        questionCount: deck.cardCount,
      }))
      setProfile({
        id: result.profile.uid,
        nickname: result.profile.nickname,
        online: presence.online,
        communityXp: result.profile.communityXp,
        level: getLevelFromXp(result.profile.communityXp),
        followerCount: result.profile.followerCount,
        followingCount: result.profile.followingCount,
        isFollowing: result.social.following,
        publishedDecks: decks,
      })
    } catch {
      setProfile(null)
      setError('This player profile is unavailable.')
    } finally {
      setLoading(false)
    }
  }, [navigate, playerId, user])

  useEffect(() => { void load() }, [load])

  return <PublicPlayerProfile
    profile={profile}
    loading={loading}
    error={error}
    followPending={followPending}
    followError={followError}
    blockPending={blockPending}
    blockError={blockError}
    onRetry={load}
    onFollow={async () => {
      setFollowPending(true); setFollowError('')
      try {
        await followPlayer(playerId)
        setProfile((current) => current ? { ...current, isFollowing: true, followerCount: current.followerCount + 1 } : current)
      } catch (followFailure: unknown) {
        const code = typeof followFailure === 'object' && followFailure !== null && 'code' in followFailure
          ? String(followFailure.code)
          : ''
        setFollowError(code.includes('functions/not-found')
          ? 'Following is temporarily unavailable because the social service is not deployed.'
          : 'This player could not be followed.')
      } finally { setFollowPending(false) }
    }}
    onUnfollow={async () => {
      setFollowPending(true); setFollowError('')
      try {
        await unfollowPlayer(playerId)
        setProfile((current) => current ? { ...current, isFollowing: false, followerCount: Math.max(0, current.followerCount - 1) } : current)
      } catch (unfollowFailure: unknown) {
        const code = typeof unfollowFailure === 'object' && unfollowFailure !== null && 'code' in unfollowFailure
          ? String(unfollowFailure.code)
          : ''
        setFollowError(code.includes('functions/not-found')
          ? 'Following is temporarily unavailable because the social service is not deployed.'
          : 'This player could not be unfollowed.')
      } finally { setFollowPending(false) }
    }}
    onBlock={async () => {
      setBlockPending(true); setBlockError('')
      try { await blockPlayer(playerId); setProfile(null); setError('This player profile is unavailable.') }
      catch { setBlockError('This player could not be blocked.') }
      finally { setBlockPending(false) }
    }}
    onOpenDeck={(deck) => navigate(onlineDeckPath(deck.id))}
  />
}
