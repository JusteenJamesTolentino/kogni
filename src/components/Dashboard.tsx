import { ArrowRight, Flame, Layers3, Sparkles, Target, Trophy, UsersRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { subscribeToMyLeaderboardRecord } from '../lib/leaderboard'
import type { StudyCard, StudyDeck } from '../types/domain'
import type { ActivePlayerProjection, PublicOnlineDeckProjection } from '../types/projections'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: number
  help: string
  tone: string
}

interface DashboardProps {
  decks: StudyDeck[]
  dueCards: StudyCard[]
  error: string
  onRetry: () => void | Promise<void>
  onStudy: (deck: StudyDeck | null) => void | Promise<void>
  suggestedUsers: ActivePlayerProjection[]
  suggestedDecks: PublicOnlineDeckProjection[]
  onOpenUser: (uid: string) => void
  onOpenSuggestedDeck: (deckId: string) => void
}

function StatCard({ icon: Icon, label, value, help, tone }: StatCardProps) {
  // Plain flex layout: daisyUI's .stat absolutely positions .stat-figure on small
  // screens, which made the icon overlap the value on narrow viewports.
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:gap-4 sm:p-5">
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl sm:h-12 sm:w-12 ${tone}`}>
        <Icon size={20} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold uppercase tracking-wider text-base-content/55">{label}</div>
        <div className="text-2xl font-black leading-tight tabular-nums sm:text-3xl">{value}</div>
        <div className="mt-0.5 truncate text-xs text-base-content/55">{help}</div>
      </div>
    </div>
  )
}

export default function Dashboard({ decks, dueCards, error, onRetry, onStudy, suggestedUsers, suggestedDecks, onOpenUser, onOpenSuggestedDeck }: DashboardProps) {
  const { user } = useAuth()
  const displayName = user?.displayName?.split(' ')[0] || 'learner'
  const totalCards = decks.reduce((total, deck) => total + deck.cardCount, 0)
  const dueCount = dueCards.length
  // XP and streak live in the single cloud ledger that reviews already write to.
  const [record, setRecord] = useState<{ xp: number; streakDays: number } | null>(null)
  useEffect(() => {
    if (!user?.uid) return
    return subscribeToMyLeaderboardRecord(user.uid, (value) => setRecord(value ? { xp: value.xp, streakDays: value.streakDays ?? 0 } : { xp: 0, streakDays: 0 }))
  }, [user?.uid])
  const streak = record?.streakDays ?? 0
  const xp = record?.xp ?? 0

  return (
    <main className="mx-auto w-full max-w-[100rem] px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
      <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles size={16} aria-hidden="true" />
            Your learning command center
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Welcome back, {displayName}</h1>
          <p className="mt-2 text-base-content/60">Small reviews today build durable knowledge tomorrow.</p>
        </div>
        <button type="button" onClick={() => void onStudy(null)} disabled={!dueCount} className="btn btn-primary gap-2 md:min-w-48">
          Review {dueCount} due {dueCount === 1 ? 'card' : 'cards'}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </section>

      {error && (
        <div role="alert" className="alert alert-error mt-6">
          <span>{error}</span>
          <button type="button" onClick={() => void onRetry()} className="btn btn-sm">Try again</button>
        </div>
      )}

      <section className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Learning statistics">
        <StatCard icon={Target} label="Due today" value={dueCount} help="Ready to review" tone="bg-primary/10 text-primary" />
        <StatCard icon={Layers3} label="Total cards" value={totalCards} help={`Across ${decks.length} ${decks.length === 1 ? 'deck' : 'decks'}`} tone="bg-secondary/10 text-secondary" />
        <StatCard icon={Flame} label="Day streak" value={streak} help="Keep the rhythm" tone="bg-warning/15 text-warning" />
        <StatCard icon={Trophy} label="Learning XP" value={xp} help="Earned from reviews" tone="bg-success/10 text-success" />
      </section>

      {(suggestedUsers.length > 0 || suggestedDecks.length > 0) && (
        <section className="mt-9" aria-labelledby="suggestions-title">
          <div className="mb-4 flex items-center gap-2">
            <UsersRound size={20} className="text-primary" aria-hidden="true" />
            <div>
              <h2 id="suggestions-title" className="text-2xl font-bold">Suggestions</h2>
              <p className="text-sm text-base-content/55">Discover learners and decks you may enjoy.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {suggestedUsers.length > 0 && (
              <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
                <h3 className="font-bold">Users</h3>
                <div className="mt-3 space-y-2">
                  {suggestedUsers.slice(0, 3).map((player) => (
                    <button key={player.uid} type="button" onClick={() => onOpenUser(player.uid)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-base-200">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 font-bold text-primary">{player.nickname.slice(0, 1)}</span>
                      <span className="font-semibold">{player.nickname}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {suggestedDecks.length > 0 && (
              <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
                <h3 className="font-bold">Decks</h3>
                <div className="mt-3 space-y-2">
                  {suggestedDecks.slice(0, 3).map((deck) => (
                    <button key={deck.id} type="button" onClick={() => onOpenSuggestedDeck(deck.id)} className="block w-full rounded-xl p-2 text-left hover:bg-base-200">
                      <span className="font-semibold">{deck.title}</span>
                      <span className="block text-xs text-base-content/55">{deck.ownerNickname} · {deck.cardCount} cards</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  )
}
