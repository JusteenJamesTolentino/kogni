import {
  Ban,
  BookOpen,
  MoreHorizontal,
  RefreshCw,
  Trophy,
  UserMinus,
  UserPlus,
  UsersRound,
  Wifi,
  WifiOff,
} from 'lucide-react'
import ProfileCard3D from './ProfileCard3D'

export interface PublicPlayerDeckMetadata {
  id: string
  title: string
  description?: string
  questionCount: number
  seriesTitle?: string
  partNumber?: number
}

export interface PublicPlayerProfileData {
  id: string
  nickname: string
  avatarUrl?: string | null
  /** Coarse public presence only. Do not supply timestamps or last-seen data. */
  online: boolean
  /** A value reported by a client and not independently verified. */
  communityXp: number
  level: number
  followerCount: number
  followingCount: number
  isFollowing: boolean
  /** Metadata only. Never include cards, answers, schedules, or local-library data. */
  publishedDecks: PublicPlayerDeckMetadata[]
}

export interface PublicPlayerProfileProps {
  profile: PublicPlayerProfileData | null
  loading?: boolean
  error?: string
  followPending?: boolean
  followError?: string
  blockPending?: boolean
  blockError?: string
  onRetry?: () => void | Promise<void>
  onFollow?: () => void | Promise<void>
  onUnfollow?: () => void | Promise<void>
  onBlock?: () => void | Promise<void>
  onOpenDeck?: (deck: PublicPlayerDeckMetadata) => void | Promise<void>
  className?: string
}

function safeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

function StatePanel({
  title,
  message,
  loading = false,
  onRetry,
}: {
  title: string
  message: string
  loading?: boolean
  onRetry?: () => void | Promise<void>
}) {
  return (
    <main className="grid min-h-[65vh] place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-base-300 bg-base-100 p-6 text-center shadow-sm" aria-live="polite" aria-busy={loading}>
        {loading ? (
          <>
            <span className="loading loading-spinner loading-lg text-primary" aria-hidden="true" />
            <h1 className="mt-4 text-xl font-bold">{title}</h1>
          </>
        ) : (
          <>
            <UsersRound size={32} className="mx-auto text-base-content/30" aria-hidden="true" />
            <h1 className="mt-4 text-xl font-bold">{title}</h1>
            <p className="mt-2 text-sm text-base-content/60">{message}</p>
            {onRetry && (
              <button type="button" className="btn btn-primary mt-5 w-full gap-2 sm:w-auto" onClick={() => void onRetry()}>
                <RefreshCw size={16} aria-hidden="true" />
                Try again
              </button>
            )}
          </>
        )}
      </section>
    </main>
  )
}

export default function PublicPlayerProfile({
  profile,
  loading = false,
  error = '',
  followPending = false,
  followError = '',
  blockPending = false,
  blockError = '',
  onRetry,
  onFollow,
  onUnfollow,
  onBlock,
  onOpenDeck,
  className = '',
}: PublicPlayerProfileProps) {
  if (loading) {
    return <StatePanel title="Loading player profile" message="Loading public profile details." loading />
  }

  if (error) {
    return <StatePanel title="Profile unavailable" message={error || 'This public profile could not be loaded.'} onRetry={onRetry} />
  }

  if (!profile) {
    return <StatePanel title="Profile unavailable" message="This public profile is unavailable or no longer shared." onRetry={onRetry} />
  }

  const nickname = profile.nickname.trim() || 'Kognit player'
  const initial = (nickname.charAt(0) || '?').toUpperCase()
  const followHandler = profile.isFollowing ? onUnfollow : onFollow
  const followerCount = safeCount(profile.followerCount)
  const followingCount = safeCount(profile.followingCount)
  const communityXp = safeCount(profile.communityXp)
  const level = Math.max(1, safeCount(profile.level))

  return (
    <main className={`mx-auto w-full max-w-6xl px-4 py-7 pb-24 sm:px-6 sm:py-10 lg:px-8 ${className}`.trim()}>
      <ProfileCard3D className="card overflow-visible border border-base-300 bg-base-100 shadow-xl">
        <div className="h-28 overflow-hidden rounded-t-[inherit] bg-gradient-to-br from-primary/30 via-secondary/20 to-accent/20 sm:h-40" aria-hidden="true" />
        <div className="card-body px-5 pb-6 pt-0 sm:px-8 sm:pb-8">
          <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end">
            <div className="avatar shrink-0">
              <div className="h-24 w-24 overflow-hidden rounded-3xl bg-primary text-3xl font-black text-primary-content ring-4 ring-base-100 sm:h-28 sm:w-28">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <div className="grid h-full w-full place-items-center" aria-hidden="true">{initial}</div>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1 pb-1">
              <h1 className="truncate text-2xl font-black sm:text-3xl">{nickname}</h1>
              <p className={`mt-2 inline-flex items-center gap-2 text-sm font-semibold ${profile.online ? 'text-success' : 'text-base-content/55'}`}>
                {profile.online ? <Wifi size={16} aria-hidden="true" /> : <WifiOff size={16} aria-hidden="true" />}
                {profile.online ? 'Online' : 'Offline'}
              </p>
            </div>

            <div className="flex w-full items-center gap-2 sm:mb-1 sm:w-auto">
              {followHandler && (
                <button
                  type="button"
                  className={`btn min-w-32 flex-1 gap-2 sm:flex-none ${profile.isFollowing ? 'btn-outline' : 'btn-primary'}`}
                  onClick={() => void followHandler()}
                  disabled={followPending || blockPending}
                  aria-describedby={(followError || blockError) ? 'public-player-action-error' : undefined}
                >
                  {followPending ? (
                    <span className="loading loading-spinner loading-sm" aria-hidden="true" />
                  ) : profile.isFollowing ? (
                    <UserMinus size={17} aria-hidden="true" />
                  ) : (
                    <UserPlus size={17} aria-hidden="true" />
                  )}
                  {followPending ? 'Updating' : profile.isFollowing ? 'Unfollow' : 'Follow'}
                </button>
              )}

              {onBlock && (
                <details className="dropdown dropdown-end">
                  <summary className="btn btn-square btn-ghost list-none" aria-label={`More actions for ${nickname}`}>
                    <MoreHorizontal size={20} aria-hidden="true" />
                  </summary>
                  <ul className="menu dropdown-content z-20 mt-2 w-52 rounded-box border border-base-300 bg-base-100 p-2 shadow-xl">
                    <li>
                      <button
                        type="button"
                        className="text-error"
                        onClick={() => void onBlock()}
                        disabled={blockPending || followPending}
                        aria-describedby={(followError || blockError) ? 'public-player-action-error' : undefined}
                      >
                        {blockPending ? <span className="loading loading-spinner loading-xs" aria-hidden="true" /> : <Ban size={16} aria-hidden="true" />}
                        {blockPending ? 'Blocking player' : 'Block player'}
                      </button>
                    </li>
                  </ul>
                </details>
              )}
            </div>
          </div>

          {(followError || blockError) && (
            <div id="public-player-action-error" role="alert" className="alert alert-error mt-4 text-sm">
              <span>{followError || blockError}</span>
            </div>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(12rem,0.7fr)]">
            <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4" aria-labelledby="community-xp-title">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p id="community-xp-title" className="text-xs font-bold uppercase tracking-wide text-primary">Community XP</p>
                  <p className="mt-1 text-3xl font-black tabular-nums">{communityXp.toLocaleString()}</p>
                </div>
                <Trophy size={24} className="text-warning" aria-hidden="true" />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-base-content/60">
                Client-reported and unverified. This value is informational and may not reflect validated activity.
              </p>
            </section>

            <section className="rounded-2xl border border-base-300 bg-base-200/45 p-4" aria-label="Player level">
              <p className="text-xs font-bold uppercase tracking-wide text-base-content/55">Level</p>
              <p className="mt-1 text-3xl font-black tabular-nums">{level.toLocaleString()}</p>
            </section>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-3" aria-label="Public connection counts">
            <div className="rounded-2xl border border-base-300 bg-base-100 p-4 text-center">
              <dt className="text-xs font-semibold text-base-content/55">Followers</dt>
              <dd className="mt-1 text-xl font-black tabular-nums">{followerCount.toLocaleString()}</dd>
            </div>
            <div className="rounded-2xl border border-base-300 bg-base-100 p-4 text-center">
              <dt className="text-xs font-semibold text-base-content/55">Following</dt>
              <dd className="mt-1 text-xl font-black tabular-nums">{followingCount.toLocaleString()}</dd>
            </div>
          </dl>
        </div>
      </ProfileCard3D>

      <section className="mt-6 overflow-hidden rounded-3xl border border-base-300 bg-base-100 shadow-sm" aria-labelledby="player-published-decks-title">
        <div className="border-b border-base-300 bg-base-200/50 p-5 sm:px-6">
          <h2 id="player-published-decks-title" className="text-xl font-bold">Published decks</h2>
          <p className="mt-1 text-sm text-base-content/55">Public metadata only. Questions, answers, schedules, and local-library data are not shown.</p>
        </div>

        {!profile.publishedDecks.length ? (
          <div className="px-6 py-12 text-center">
            <BookOpen size={32} className="mx-auto text-base-content/25" aria-hidden="true" />
            <h3 className="mt-3 font-bold">No published decks</h3>
            <p className="mt-1 text-sm text-base-content/55">This player has no public deck metadata to show.</p>
          </div>
        ) : (
          <ul className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3" aria-label={`${nickname}'s published decks`}>
            {profile.publishedDecks.map((deck) => (
              <li key={deck.id} className="card border border-base-300 bg-base-100 shadow-sm">
                <div className="card-body gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <BookOpen size={20} aria-hidden="true" />
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {deck.partNumber !== undefined && <span className="badge badge-secondary badge-outline badge-sm">Part {safeCount(deck.partNumber)}</span>}
                      <span className="badge badge-ghost badge-sm">{safeCount(deck.questionCount)} questions</span>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    {deck.seriesTitle && <p className="truncate text-xs font-semibold text-secondary">{deck.seriesTitle}</p>}
                    <h3 className="mt-1 line-clamp-2 text-lg font-bold">{deck.title.trim() || 'Untitled deck'}</h3>
                    <p className="mt-1 line-clamp-2 min-h-10 text-sm text-base-content/55">{deck.description?.trim() || 'A published study deck.'}</p>
                  </div>
                  {onOpenDeck && (
                    <button type="button" className="btn btn-primary btn-sm w-full" onClick={() => void onOpenDeck(deck)}>
                      View deck
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
