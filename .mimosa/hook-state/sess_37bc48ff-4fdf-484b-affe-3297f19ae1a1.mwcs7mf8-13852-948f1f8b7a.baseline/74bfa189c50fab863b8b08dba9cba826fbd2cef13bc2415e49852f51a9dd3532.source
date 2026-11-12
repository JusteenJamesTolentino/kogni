import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import type { AppShellContextValue } from './AppShell'
import { Cloud, Download, Edit3, Layers3, LockKeyhole, Play, RefreshCw } from 'lucide-react'
import ContinuationCreator from '../components/ContinuationCreator'
import type { ContinuationCreatorProps } from '../components/ContinuationCreator'
import OnlineDeckCatalog from '../components/OnlineDeckCatalog'
import type { OnlineDeckCatalogProps } from '../components/OnlineDeckCatalog'
import OnlinePlayers from '../components/OnlinePlayers'
import type { OnlinePlayersProps } from '../components/OnlinePlayers'
import SeriesCompletion from '../components/SeriesCompletion'
import type { SeriesCompletionProps } from '../components/SeriesCompletion'
import { getCardsByDeck, getDeck, saveOnlineDeckOfflineSnapshot } from '../lib/db'
import {
  createOnlineDeck,
  getOnlineDeckHead,
  getOnlineDeckVersion,
  publishOnlineDeckVersion,
  selectOnlineDeckOfflineSnapshot,
} from '../lib/onlineDecks'
import type { OnlineDeckHead, OnlineDeckVersion, StudyCard, StudyDeck } from '../types/domain'
import { deckPath, onlineDeckContinuePath, onlineDeckEditPath, onlineDeckPath, onlineDeckStudySeriesPath, paths, playerProfilePath } from '../router/paths'
import { useAuth } from '../context/AuthContext'

export interface OnlineDeckIndexShellProps {
  catalog: OnlineDeckCatalogProps
  players: OnlinePlayersProps
}

/** UI-only list shell. Data loading, search, pagination, and navigation stay with the route integrator. */
export function OnlineDeckIndexShell({ catalog, players }: OnlineDeckIndexShellProps) {
  return (
    <main className="mx-auto w-full max-w-[100rem] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header>
        <div className="badge badge-primary badge-outline gap-1"><Cloud size={13} aria-hidden="true" /> Online library</div>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Study published decks</h1>
        <p className="mt-2 max-w-2xl text-base-content/60">Browse answer-free deck metadata and see which creators and players currently share coarse online presence.</p>
      </header>
      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <OnlineDeckCatalog {...catalog} />
        <OnlinePlayers {...players} className={`lg:sticky lg:top-24 ${players.className || ''}`} />
      </div>
    </main>
  )
}

export function OnlineDeckIndexRoute() {
  const navigate = useNavigate()
  const {
    activePlayers,
    publicOnlineDecks,
    discoveryLoading,
    discoveryError,
  } = useOutletContext<AppShellContextValue>()
  const onlineIds = new Set(activePlayers.map((player) => player.uid))

  return <OnlineDeckIndexShell
    players={{
      players: activePlayers.map((player) => ({ id: player.uid, nickname: player.nickname, online: true })),
      loading: discoveryLoading,
      error: discoveryError,
      onOpenPlayer: (player) => navigate(playerProfilePath(player.id)),
    }}
    catalog={{
      decks: publicOnlineDecks.map((deck) => ({
        id: deck.id,
        title: deck.title,
        description: deck.description,
        creatorId: deck.ownerId,
        creatorNickname: deck.ownerNickname,
        creatorOnline: onlineIds.has(deck.ownerId),
        questionCount: deck.cardCount,
      })),
      loading: discoveryLoading,
      error: discoveryError,
      onOpenDeck: (deck) => navigate(onlineDeckPath(deck.id)),
      onOpenCreator: (creator) => navigate(playerProfilePath(creator.creatorId)),
    }}
  />
}

export interface OnlineDeckStudyShellProps {
  title: string
  description?: string
  creatorNickname: string
  partNumber?: number
  questionCount: number
  loading?: boolean
  error?: string
  onStart: () => void | Promise<void>
  onBack: () => void | Promise<void>
}

/** Answer-free pre-study shell; the online review engine is supplied by integration. */
export function OnlineDeckStudyShell({ title, description, creatorNickname, partNumber, questionCount, loading = false, error = '', onStart, onBack }: OnlineDeckStudyShellProps) {
  return (
    <main className="grid min-h-[70vh] place-items-center px-4 py-10">
      <section className="card w-full max-w-2xl border border-base-300 bg-base-100 shadow-xl" aria-labelledby="online-study-title">
        <div className="card-body p-6 sm:p-9">
          <div className="flex flex-wrap gap-2"><span className="badge badge-primary">Online deck</span>{partNumber !== undefined && <span className="badge badge-secondary badge-outline">Part {partNumber}</span>}</div>
          <h1 id="online-study-title" className="mt-2 text-3xl font-black">{title}</h1>
          {description && <p className="text-base-content/60">{description}</p>}
          <dl className="mt-3 grid gap-3 rounded-2xl bg-base-200/50 p-4 sm:grid-cols-2">
            <div><dt className="text-xs font-semibold text-base-content/50">Creator</dt><dd className="mt-1 font-bold">{creatorNickname}</dd></div>
            <div><dt className="text-xs font-semibold text-base-content/50">Questions</dt><dd className="mt-1 font-bold">{questionCount}</dd></div>
          </dl>
          {error && <div role="alert" className="alert alert-error mt-2"><span>{error}</span></div>}
          <div className="card-actions mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => void onStart()} className="btn btn-primary gap-2" disabled={loading || Boolean(error)}>{loading ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}Start studying</button>
            <button type="button" onClick={() => void onBack()} className="btn btn-outline">Back to online decks</button>
          </div>
          <p className="mt-2 text-xs text-base-content/50">Questions and answers are not previewed here.</p>
        </div>
      </section>
    </main>
  )
}

export type OnlineDeckContinuationShellProps = SeriesCompletionProps

export function OnlineDeckContinuationShell(props: OnlineDeckContinuationShellProps) {
  return <SeriesCompletion {...props} />
}

export type OnlineDeckCreatorContinuationShellProps = ContinuationCreatorProps

export function OnlineDeckCreatorContinuationShell(props: OnlineDeckCreatorContinuationShellProps) {
  return <ContinuationCreator {...props} />
}

export function OnlineDeckRoute() {
  const { deckId = '' } = useParams()
  const navigate = useNavigate()
  const { user, account } = useAuth()
  const [head, setHead] = useState<OnlineDeckHead | null>(null)
  const [version, setVersion] = useState<OnlineDeckVersion | null>(null)
  const [limit, setLimit] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void getOnlineDeckHead(deckId)
      .then(async (nextHead) => {
        if (!nextHead) throw new Error('Online deck unavailable')
        const nextVersion = await getOnlineDeckVersion(deckId, nextHead.latestVersion)
        if (!nextVersion) throw new Error('Published version unavailable')
        if (active) {
          setHead(nextHead)
          setVersion(nextVersion)
          setLimit(Math.min(nextHead.offlinePolicy.maxQuestions, nextVersion.cardCount))
        }
      })
      .catch(() => { if (active) setError('This online deck is unavailable or you do not have access.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [deckId])

  if (loading) return <main className="grid min-h-[65vh] place-items-center"><span className="loading loading-spinner loading-lg text-primary" /></main>
  if (!head || !version) return <main className="grid min-h-[65vh] place-items-center px-4"><section className="text-center"><h1 className="text-3xl font-black">Online deck unavailable</h1><p className="mt-2 text-base-content/60">{error}</p><Link to={paths.dashboard} className="btn btn-primary mt-5">Dashboard</Link></section></main>

  const owner = user?.uid === head.ownerId
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="rounded-3xl border border-primary/20 bg-base-100 p-6 shadow-xl sm:p-9">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div><div className="badge badge-primary gap-1"><Cloud size={13} /> Live online deck</div><h1 className="mt-4 text-3xl font-black">{version.title}</h1><p className="mt-2 max-w-2xl text-base-content/60">{version.description}</p><div className="mt-4 flex flex-wrap gap-2"><span className="badge badge-outline">Version {version.version}</span><span className="badge badge-outline">{version.cardCount} questions</span><span className="badge badge-outline">{head.status}</span></div></div>
          <div className="flex flex-wrap gap-2">
            <Link to={onlineDeckStudySeriesPath(head.id)} className="btn btn-primary gap-2"><Play size={17} />Study 30 questions</Link>
            {owner && <Link to={onlineDeckEditPath(head.id)} className="btn btn-outline gap-2"><Edit3 size={17} />Publish update</Link>}
            {owner && <Link to={onlineDeckContinuePath(head.id)} className="btn btn-outline gap-2"><RefreshCw size={17} />Create next part</Link>}
          </div>
        </div>
        {version.studyGuide && <div className="mt-7 whitespace-pre-wrap rounded-2xl bg-base-200/45 p-5 leading-relaxed text-base-content/75">{version.studyGuide}</div>}
      </section>

      <section className="mt-6 rounded-3xl border border-base-300 bg-base-100 p-6 shadow-sm" aria-labelledby="offline-save-title">
        <div className="flex items-start gap-3"><Download size={22} className="text-primary" /><div><h2 id="offline-save-title" className="text-xl font-bold">Save an offline snapshot</h2><p className="mt-1 text-sm text-base-content/55">Offline copies are frozen at this version and use independent local schedules.</p></div></div>
        {!head.offlinePolicy.allowed ? <div className="alert mt-5"><LockKeyhole size={18} /><span>The creator disabled offline saves.</span></div> : (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="form-control max-w-52"><span className="label-text mb-2 font-semibold">Questions to save</span><input type="number" min="1" max={Math.min(head.offlinePolicy.maxQuestions, version.cardCount)} value={limit} onChange={(event) => setLimit(Number(event.target.value))} className="input input-bordered" /></label>
            <button className="btn btn-primary gap-2" onClick={async () => {
              if (!user) return
              const snapshot = selectOnlineDeckOfflineSnapshot(head, version, user.uid, limit)
              const saved = await saveOnlineDeckOfflineSnapshot(snapshot)
              navigate(deckPath(saved.id))
            }}><Download size={17} />Save offline</button>
          </div>
        )}
      </section>
      <p className="mt-4 text-xs text-base-content/45">Signed in as {account?.nickname}. Online content may change when the creator publishes a new version; saved offline copies do not.</p>
    </main>
  )
}

export function OnlineDeckEditRoute() {
  const { deckId = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [localDeck, setLocalDeck] = useState<StudyDeck | null>(null)
  const [localCards, setLocalCards] = useState<StudyCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([getDeck(deckId), getCardsByDeck(deckId)])
      .then(([deck, cards]) => {
        if (active) { setLocalDeck(deck ?? null); setLocalCards(cards) }
      })
      .catch(() => { if (active) { setLocalDeck(null); setLocalCards([]) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [deckId])

  if (loading) {
    return <main className="grid min-h-[65vh] place-items-center"><span className="loading loading-spinner loading-lg" /></main>
  }

  if (!localDeck || !localCards.length) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="alert alert-error"><span>The local source deck is unavailable in this browser. Open the deck from your library and try again.</span></div>
        <Link to={paths.dashboard} className="btn btn-outline mt-5">Back to dashboard</Link>
      </main>
    )
  }

  const publish = async (): Promise<void> => {
    if (!user) return
    setSaving(true); setError('')
    try {
      const duplicateCardIds = localCards.map((card) => card.id).filter((id, index, all) => all.indexOf(id) !== index)
      if (duplicateCardIds.length) throw new Error(`This deck has duplicate card IDs (${duplicateCardIds.slice(0, 3).join(', ')}). Edit the deck and save it once to regenerate IDs, then publish again.`)
      // A never-published deck is unreadable under some older rule states; treat as new.
      const existing = await getOnlineDeckHead(deckId).catch(() => null)
      const inputCards = localCards.map((card) => ({ id: card.id, question: card.question, answer: card.answer, distractors: card.distractors }))
      if (!existing) {
        await createOnlineDeck(user, { deckId, expectedBaseVersion: 0, visibility: 'public', offlinePolicy: { allowed: true, maxQuestions: Math.max(30, Math.min(500, localCards.length)) }, title: localDeck.title, description: localDeck.description, studyGuide: localDeck.studyGuide, cards: inputCards })
      } else {
        await publishOnlineDeckVersion(user, deckId, { expectedBaseVersion: existing.latestVersion, title: localDeck.title, description: localDeck.description, studyGuide: localDeck.studyGuide, cards: inputCards })
      }
      navigate(onlineDeckPath(deckId))
    } catch (publishError: unknown) {
      setError(publishError instanceof Error ? publishError.message : 'Online deck could not be published.')
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="rounded-3xl border border-base-300 bg-base-100 p-6 shadow-xl sm:p-9">
        <div className="flex items-center gap-3"><RefreshCw className="text-primary" /><div><h1 className="text-3xl font-black">Publish online deck version</h1><p className="mt-1 text-base-content/55">Publishes the current local deck content as an immutable successor version. Public decks appear for every learner in the deck recommendations on the home page.</p></div></div>
        {error && <div className="alert alert-error mt-5"><span>{error}</span></div>}

        <section className="mt-7 rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-base-100 to-secondary/10 p-5 sm:p-7" aria-label="Publish preview">
          <div className="flex items-center gap-2">
            <span className="badge badge-primary badge-outline gap-1.5"><Layers3 size={13} aria-hidden="true" /> What will be published</span>
            <span className="ml-auto text-xs font-semibold text-base-content/55">{localCards.length} cards</span>
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-tight">{localDeck.title || 'Untitled deck'}</h2>
          {localDeck.description && <p className="mt-2 text-sm leading-relaxed text-base-content/65">{localDeck.description}</p>}
          {localDeck.studyGuide && (
            <div className="mt-4 rounded-2xl border border-base-300 bg-base-200/50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-base-content/50">Study guide</p>
              <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-base-content/75">{localDeck.studyGuide}</p>
            </div>
          )}
          <ol className="mt-5 grid gap-3">
            {localCards.map((card, index) => (
              <li key={card.id || index} className="rounded-2xl border border-base-300 bg-base-100 p-4">
                <p className="text-sm font-semibold">{index + 1}. {card.question}</p>
                <p className="mt-1 text-sm text-success"><span className="font-bold">Answer:</span> {card.answer}</p>
                {card.distractors.length > 0 && (
                  <p className="mt-1 text-xs text-base-content/50"><span className="font-semibold">Distractors:</span> {card.distractors.join(' · ')}</p>
                )}
              </li>
            ))}
          </ol>
        </section>

        <button className="btn btn-primary mt-7 w-full" disabled={saving} onClick={() => void publish()}>{saving ? <span className="loading loading-spinner loading-sm" /> : 'Publish current local content'}</button>
        <Link to={deckPath(deckId)} className="btn btn-ghost mt-3 w-full">Cancel</Link>
      </section>
    </main>
  )
}
