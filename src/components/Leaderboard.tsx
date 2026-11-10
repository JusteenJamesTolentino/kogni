import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Crown, Medal, Trophy, Users } from 'lucide-react'
import { subscribeToLeaderboard } from '../lib/leaderboard'
import { getErrorMessage } from '../lib/errors'
import { useAuth } from '../context/AuthContext'
import type { RankedLeaderboardEntry } from '../types/domain'

interface LeaderboardDisplayEntry extends RankedLeaderboardEntry {
  userId?: string
  name?: string
  score?: number
  streak?: number
}

const rankStyles = [
  'bg-warning/20 text-warning',
  'bg-base-300 text-base-content/70',
  'bg-secondary/15 text-secondary',
]

export interface LeaderboardPlayerLink {
  id: string
  nickname: string
}

export interface LeaderboardProps {
  lineageId?: string
  deckTitle?: string
  compact?: boolean
  onViewAll?: () => void
  onOpenPlayer?: (player: LeaderboardPlayerLink) => void | Promise<void>
}

export default function Leaderboard({ lineageId, deckTitle, compact = false, onViewAll, onOpenPlayer }: LeaderboardProps) {
  const { user } = useAuth()
  const [players, setPlayers] = useState<LeaderboardDisplayEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let unsubscribe: () => void = () => undefined

    try {
      unsubscribe = subscribeToLeaderboard((entries: RankedLeaderboardEntry[]) => {
        setPlayers(Array.isArray(entries) ? entries : [])
        setLoading(false)
      }, (subscriptionError: Error) => {
        setError(getErrorMessage(subscriptionError, 'The leaderboard is unavailable right now.'))
        setLoading(false)
      }, lineageId) || (() => undefined)
    } catch (subscriptionError: unknown) {
      setError(getErrorMessage(subscriptionError, 'The leaderboard is unavailable right now.'))
      setLoading(false)
    }

    return () => unsubscribe()
  }, [lineageId])

  const rankedPlayers = useMemo(
    () => [...players].sort((a, b) => (b.xp || b.score || 0) - (a.xp || a.score || 0)),
    [players],
  )

  return (
    <main className={`mx-auto w-full px-4 py-8 sm:px-6 ${compact ? 'max-w-3xl' : 'max-w-5xl sm:py-12 lg:px-8'}`}>
      {!compact && (
        <section className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-warning/15 text-warning"><Trophy size={28} aria-hidden="true" /></div>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">{lineageId ? `${deckTitle || 'Deck'} leaderboard` : 'Learning leaderboard'}</h1>
          <p className="mx-auto mt-2 max-w-xl text-base-content/60">{lineageId ? 'XP earned from scheduled reviews of this deck.' : 'Review consistently, answer honestly, and climb alongside the Kogni community.'}</p>
        </section>
      )}

      <section className={`mx-auto max-w-3xl overflow-hidden rounded-3xl border border-base-300 bg-base-100 shadow-xl ${compact ? '' : 'mt-8'}`} aria-label="Leaderboard rankings">
        <div className="flex items-center justify-between border-b border-base-300 bg-base-200/50 px-5 py-4 sm:px-7">
          <div className="flex items-center gap-2 font-bold"><Users size={18} aria-hidden="true" /> {lineageId ? 'Top deck learners' : 'Top learners'}</div>
          <div className="flex items-center gap-2">
            <span className="badge badge-ghost">{lineageId ? 'Deck XP' : 'Lifetime XP'}</span>
            {compact && onViewAll && <button type="button" onClick={onViewAll} className="btn btn-ghost btn-xs">View all</button>}
          </div>
        </div>

        {error && <div role="alert" className="alert alert-error m-5"><span>{error}</span></div>}

        {loading ? (
          <div className="space-y-3 p-5 sm:p-7" aria-label="Loading leaderboard">
            {[0, 1, 2, 3, 4].map((item) => <div key={item} className="skeleton h-16 w-full rounded-xl" />)}
          </div>
        ) : !rankedPlayers.length ? (
          <div className="p-12 text-center">
            <Medal size={32} className="mx-auto text-base-content/30" aria-hidden="true" />
            <h2 className="mt-3 font-bold">The race starts with you</h2>
            <p className="mt-1 text-sm text-base-content/55">Complete a review to earn the first XP.</p>
          </div>
        ) : (
          <ol className="divide-y divide-base-300">
            {rankedPlayers.slice(0, compact ? 5 : undefined).map((player, index) => {
              const isCurrentUser = player.uid === user?.uid || player.userId === user?.uid
              const score = player.xp || player.score || 0
              const name = player.displayName || player.name || 'Kogni learner'

              return (
                <motion.li key={player.uid || player.userId || `${name}-${index}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(index * 0.035, 0.3) }} className={`flex items-center gap-3 px-5 py-4 sm:gap-4 sm:px-7 ${isCurrentUser ? 'bg-primary/8' : ''}`}>
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black ${rankStyles[index] || 'bg-base-200 text-base-content/60'}`}>
                    {index === 0 ? <Crown size={18} aria-hidden="true" /> : index + 1}
                  </div>
                  <div className="avatar">
                    <div className="h-10 w-10 rounded-full bg-base-200">
                      {player.photoURL ? <img src={player.photoURL} alt="" referrerPolicy="no-referrer" /> : <div className="grid h-full place-items-center font-bold">{name.slice(0, 1).toUpperCase()}</div>}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    {onOpenPlayer ? (
                      <button
                        type="button"
                        className="block max-w-full truncate rounded-sm text-left font-semibold hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        onClick={() => void onOpenPlayer({ id: player.uid || player.userId || '', nickname: name })}
                      >
                        {name} {isCurrentUser && <span className="badge badge-primary badge-xs ml-1">You</span>}
                      </button>
                    ) : (
                      <p className="truncate font-semibold">{name} {isCurrentUser && <span className="badge badge-primary badge-xs ml-1">You</span>}</p>
                    )}
                    <p className="text-xs text-base-content/50">{player.streak || 0} day streak</p>
                  </div>
                  <div className="text-right"><p className="font-black tabular-nums">{score.toLocaleString()}</p><p className="text-[0.65rem] uppercase tracking-wider text-base-content/45">XP</p></div>
                </motion.li>
              )
            })}
          </ol>
        )}
      </section>
    </main>
  )
}
