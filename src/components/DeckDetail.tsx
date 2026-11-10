import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  BookOpen,
  Brain,
  CheckCircle2,
  Clock3,
  Database,
  GraduationCap,
  Layers3,
  PencilLine,
  Play,
  RefreshCw,
  Share2,
  Trash2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { StudyCard, StudyDeck } from '../types/domain'

export type DeckDetailDeck = StudyDeck & { lineageId?: string }

export type DeckStorageKind = 'local' | 'offline-snapshot' | 'shared-copy' | 'regenerated'

export interface DeckStorageBadge {
  kind: DeckStorageKind
  label?: string
  detail?: string
}

export interface DeckDetailProps {
  deck: DeckDetailDeck
  cards: StudyCard[]
  dueCards: StudyCard[]
  onBack: () => void
  onReviewDue: (deck: DeckDetailDeck, cards: StudyCard[]) => void | Promise<void>
  onPracticeAll: (deck: DeckDetailDeck, cards: StudyCard[]) => void | Promise<void>
  onShare: (deck: DeckDetailDeck) => void | Promise<void>
  onEdit?: (deck: DeckDetailDeck, cards: StudyCard[]) => void | Promise<void>
  onRegenerate?: (deck: DeckDetailDeck) => void | Promise<void>
  onDelete?: (deck: DeckDetailDeck) => void | Promise<void>
  storageBadge?: DeckStorageBadge
  actionsDisabled?: boolean
  leaderboardSlot?: ReactNode
}

export default function DeckDetail({
  deck,
  cards,
  dueCards,
  onBack,
  onReviewDue,
  onPracticeAll,
  onShare,
  onEdit,
  onRegenerate,
  onDelete,
  storageBadge,
  actionsDisabled = false,
  leaderboardSlot,
}: DeckDetailProps) {
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState('')
  const deckCards = cards.filter((card) => card.deckId === deck.id)
  const deckDueCards = dueCards.filter((card) => card.deckId === deck.id)
  const cardCount = deckCards.length
  const dueCount = deckDueCards.length
  const resolvedStorageBadge: DeckStorageBadge = storageBadge ?? (deck.lineageId
    ? { kind: 'shared-copy', label: 'Shared copy', detail: 'Independent browser-local copy' }
    : { kind: 'local', label: 'Saved locally', detail: 'Stored in this browser' })
  const storageBadgeClass = resolvedStorageBadge.kind === 'offline-snapshot'
    ? 'badge-info badge-outline'
    : resolvedStorageBadge.kind === 'shared-copy'
      ? 'badge-secondary badge-outline'
      : resolvedStorageBadge.kind === 'regenerated'
        ? 'badge-accent badge-outline'
        : 'badge-ghost'

  const handleShare = async (): Promise<void> => {
    if (sharing) return
    setSharing(true)
    setShareError('')

    try {
      await onShare(deck)
    } catch {
      setShareError('This deck could not be shared. Please try again.')
    } finally {
      setSharing(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-[100rem] px-4 py-6 sm:px-6 sm:py-9 lg:px-8">
      <button type="button" onClick={onBack} className="btn btn-ghost btn-sm -ml-2 gap-2">
        <ArrowLeft size={17} aria-hidden="true" />
        Back to decks
      </button>

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 overflow-hidden rounded-3xl border border-base-300 bg-base-100 shadow-xl motion-reduce:transform-none"
        aria-labelledby="deck-detail-title"
      >
        <div className="bg-gradient-to-br from-primary/15 via-base-100 to-secondary/10 p-6 sm:p-8 lg:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge badge-primary badge-outline gap-1.5">
                  <BookOpen size={13} aria-hidden="true" /> Deck
                </span>
                <span className={`badge gap-1.5 ${storageBadgeClass}`} title={resolvedStorageBadge.detail}>
                  <Database size={13} aria-hidden="true" /> {resolvedStorageBadge.label}
                </span>
              </div>
              <h1 id="deck-detail-title" className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
                {deck.title || 'Untitled deck'}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-base-content/65">
                {deck.description || 'A focused collection ready for review and practice.'}
              </p>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-base-content/60">
                <span className="inline-flex items-center gap-1.5"><Layers3 size={16} aria-hidden="true" /> {cardCount} {cardCount === 1 ? 'card' : 'cards'}</span>
                <span className="inline-flex items-center gap-1.5"><Clock3 size={16} aria-hidden="true" /> {dueCount} due now</span>
                {deck.createdAt > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    Created {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(deck.createdAt)}
                  </span>
                )}
              </div>
            </div>

            <div className="grid w-full gap-2 sm:grid-cols-3 lg:w-auto lg:min-w-72 lg:grid-cols-1">
              <button
                type="button"
                onClick={() => void onReviewDue(deck, deckDueCards)}
                disabled={dueCount === 0 || actionsDisabled}
                className="btn btn-primary justify-start gap-2"
              >
                <Brain size={18} aria-hidden="true" />
                Review due
                <span className="badge badge-primary-content/20 ml-auto">{dueCount}</span>
              </button>
              <button
                type="button"
                onClick={() => void onPracticeAll(deck, deckCards)}
                disabled={cardCount === 0 || actionsDisabled}
                className="btn btn-outline justify-start gap-2"
              >
                <Play size={17} fill="currentColor" aria-hidden="true" />
                {deck.studyGuide ? 'Learn & practice' : 'Practice all'}
              </button>
              <button
                type="button"
                onClick={() => void handleShare()}
                disabled={sharing || actionsDisabled}
                className="btn btn-ghost justify-start gap-2"
              >
                {sharing ? <span className="loading loading-spinner loading-sm" /> : <Share2 size={18} aria-hidden="true" />}
                {sharing ? 'Sharing…' : 'Share deck'}
              </button>
            </div>
          </div>
          {dueCount === 0 && cardCount > 0 && (
            <div className="alert mt-6 border-success/25 bg-success/10 text-sm" role="status">
              <CheckCircle2 size={19} className="text-success" aria-hidden="true" />
              <span>You are caught up. Practice remains available without changing the review schedule.</span>
            </div>
          )}
          {shareError && <div role="alert" className="alert alert-error mt-4 text-sm"><span>{shareError}</span></div>}

          {(onEdit || onRegenerate || onDelete) && (
            <div className="mt-6 border-t border-base-300/80 pt-5" aria-label="Manage deck">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-bold">Manage local deck</h2>
                  <p className="mt-0.5 text-xs text-base-content/50">Edit this copy, regenerate from a re-uploaded source, or remove it from this browser.</p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                  {onEdit && <button type="button" onClick={() => void onEdit(deck, deckCards)} disabled={actionsDisabled} className="btn btn-outline btn-sm justify-start gap-2"><PencilLine size={16} aria-hidden="true" /> Edit deck</button>}
                  {onRegenerate && <button type="button" onClick={() => void onRegenerate(deck)} disabled={actionsDisabled} className="btn btn-ghost btn-sm justify-start gap-2"><RefreshCw size={16} aria-hidden="true" /> Regenerate</button>}
                  {onDelete && <button type="button" onClick={() => void onDelete(deck)} disabled={actionsDisabled} className="btn btn-ghost btn-sm justify-start gap-2 text-error"><Trash2 size={16} aria-hidden="true" /> Delete</button>}
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.section>

      <div className={`mt-7 grid gap-7 ${leaderboardSlot ? 'lg:grid-cols-[minmax(0,1fr)_20rem]' : ''}`}>
        {deck.studyGuide ? (
          <section className="rounded-3xl border border-primary/20 bg-primary/5 p-5 shadow-sm sm:p-7" aria-labelledby="study-guide-title">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                <GraduationCap size={22} aria-hidden="true" />
              </div>
              <div>
                <div className="text-sm font-semibold text-primary">Topic overview</div>
                <h2 id="study-guide-title" className="mt-0.5 text-2xl font-bold">Study guide</h2>
                <p className="mt-1 text-sm text-base-content/55">Read the summary to understand the topic before starting a question session.</p>
              </div>
            </div>
            <div className="prose prose-sm mt-5 max-w-none whitespace-pre-wrap leading-relaxed text-base-content/80 dark:prose-invert">{deck.studyGuide}</div>
          </section>
        ) : (
          <section className="rounded-3xl border border-dashed border-base-300 bg-base-100 p-8 text-center" aria-labelledby="no-guide-title">
            <GraduationCap size={32} className="mx-auto text-base-content/30" aria-hidden="true" />
            <h2 id="no-guide-title" className="mt-3 text-xl font-bold">No study guide available</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-base-content/55">This deck was created before topic summaries were added. You can still practice all cards or review cards when they are due.</p>
          </section>
        )}

        {leaderboardSlot && (
          <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="Deck leaderboard">
            {leaderboardSlot}
          </aside>
        )}
      </div>
    </main>
  )
}
