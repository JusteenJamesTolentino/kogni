import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import type { AppShellContextValue } from './AppShell'
import { Cloud, Play } from 'lucide-react'
import ContinuationCreator from '../components/ContinuationCreator'
import type { ContinuationCreatorProps } from '../components/ContinuationCreator'
import OnlineDeckCatalog from '../components/OnlineDeckCatalog'
import type { OnlineDeckCatalogProps } from '../components/OnlineDeckCatalog'
import OnlinePlayers from '../components/OnlinePlayers'
import type { OnlinePlayersProps } from '../components/OnlinePlayers'
import SeriesCompletion from '../components/SeriesCompletion'
import type { SeriesCompletionProps } from '../components/SeriesCompletion'
import DeckEditor from '../components/DeckEditor'
import DeleteDeckDialog from '../components/DeleteDeckDialog'
import { loadCloudDeck, describeCloudError, withCloudDeadline } from '../lib/cloudDecks'
import { publishOnlineDeckVersion, updateOnlineDeckPolicy, setOnlineDeckStatus } from '../lib/onlineDecks'
import { deckStudyPath, onlineDeckEditPath, onlineDeckPath, paths, playerProfilePath } from '../router/paths'
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
  const { user } = useAuth()
  const { openShareModal, loadLibrary } = useOutletContext<AppShellContextValue>()
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof loadCloudDeck>> | null>(null)
  const [request, setRequest] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [publishOpen, setPublishOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const navigate = useNavigate()
  useEffect(() => {
    let active = true
    setLoaded(null); setLoading(true); setError('')
    if (!user) return () => { active = false }
    void loadCloudDeck(user, deckId).then((value) => { if (active) setLoaded(value) })
      .catch((cause) => { if (active) setError(describeCloudError(cause, 'The cloud deck could not be loaded.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [deckId, user, request])
  if (loading) return <main className="grid min-h-[65vh] place-items-center"><span className="loading loading-spinner loading-lg" /></main>
  if (!loaded) return <main className="grid min-h-[65vh] place-items-center px-4"><section className="text-center" role="alert"><h1 className="text-3xl font-black">Deck unavailable</h1><p className="mt-2">{error}</p><button className="btn btn-primary mt-5" onClick={() => setRequest((value) => value + 1)}>Retry</button><Link to={paths.dashboard} className="btn btn-ghost mt-5">Dashboard</Link></section></main>
  const { head, version, deck, cards } = loaded
  const owner = head.ownerId === user?.uid
  return <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
    <section className="rounded-3xl border border-primary/20 bg-base-100 p-6 shadow-xl sm:p-9">
      <span className="badge badge-primary gap-1"><Cloud size={13} /> Saved to your account</span>
      <h1 className="mt-4 text-3xl font-black">{version.title}</h1><p className="mt-2 text-base-content/60">{version.description}</p>
      <div className="mt-4 flex flex-wrap gap-2"><span className="badge badge-outline">{version.cardCount} questions</span><span className="badge badge-outline">{head.visibility}</span><span className="badge badge-outline">Version {version.version}</span></div>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <Link to={deckStudyPath(head.id, 'due')} className="btn btn-primary">Review due</Link>
        <Link to={deckStudyPath(head.id, 'practice')} className="btn btn-outline">Practice all cards</Link>
        {owner && <Link to={onlineDeckEditPath(head.id)} className="btn btn-outline">Edit deck</Link>}
        {owner && <button className="btn btn-outline" onClick={() => openShareModal(deck)}>Share deck</button>}
        {owner && head.visibility !== 'public' && <button className="btn btn-outline" onClick={() => setPublishOpen(true)}>Publish publicly</button>}
        {owner && <button className="btn btn-ghost text-error" onClick={() => setDeleteOpen(true)}>Delete deck</button>}
      </div>
      {error && <p role="alert" className="mt-4 text-error">{error}</p>}
      {publishOpen && <section className="mt-5 rounded-xl border border-warning p-4" aria-label="Confirm public publication"><h2 className="font-bold">Publish for other learners?</h2><p className="mt-2 text-sm">Your deck content will become accessible to other signed-in learners. Private is the default until you confirm.</p><button disabled={busy} className="btn btn-primary mt-3" onClick={async () => {
        if (!user) return
        setBusy(true); setError('')
        try { await withCloudDeadline(updateOnlineDeckPolicy(user, head.id, { visibility: 'public', offlinePolicy: { allowed: false, maxQuestions: 0 } })); setPublishOpen(false); setRequest((value) => value + 1); await loadLibrary() }
        catch (cause) { setError(describeCloudError(cause, 'Publication failed.')) }
        finally { setBusy(false) }
      }}>Confirm public publication</button><button disabled={busy} className="btn btn-ghost mt-3" onClick={() => setPublishOpen(false)}>Cancel</button></section>}
      {version.studyGuide && <div className="mt-7 whitespace-pre-wrap rounded-2xl bg-base-200/45 p-5 leading-relaxed">{version.studyGuide}</div>}
      <p className="mt-6 text-xs text-base-content/50">Decks and review progress use cloud storage. An internet connection is required; offline copies are no longer created.</p>
    </section>
    <DeleteDeckDialog open={deleteOpen} deckTitle={deck.title} cardCount={cards.length} deleting={busy} deleteError={error}
      onClose={() => { if (!busy) setDeleteOpen(false) }} onDelete={async () => {
        if (!user) return
        setBusy(true); setError('')
        try { await withCloudDeadline(setOnlineDeckStatus(user, head.id, 'deleted')); await loadLibrary(); navigate(paths.dashboard) }
        catch (cause) { setError(describeCloudError(cause, 'Deletion failed.')); setBusy(false) }
      }} />
  </main>
}

export function OnlineDeckEditRoute() {
  const { deckId = '' } = useParams()
  const { user } = useAuth()
  const { loadLibrary } = useOutletContext<AppShellContextValue>()
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof loadCloudDeck>> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let active = true
    setLoaded(null); setLoading(true); setError('')
    if (!user) return () => { active = false }
    void loadCloudDeck(user, deckId).then((value) => {
      if (value.head.ownerId !== user.uid) throw new Error('Only the owner can edit this deck.')
      if (active) setLoaded(value)
    }).catch((cause) => { if (active) setError(describeCloudError(cause, 'This deck could not be loaded.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [deckId, user])
  if (loading) return <main className="grid min-h-[65vh] place-items-center"><span className="loading loading-spinner loading-lg" /></main>
  if (!loaded) return <main className="p-8"><p role="alert">{error}</p><Link to={onlineDeckPath(deckId)} className="btn mt-4">Back</Link></main>
  return <main className="mx-auto max-w-5xl px-4 py-8"><h1 className="text-3xl font-black">Edit cloud deck</h1>
    <DeckEditor initialDraft={{ title: loaded.version.title, description: loaded.version.description, studyGuide: loaded.version.studyGuide ?? '', cards: loaded.cards }}
      saving={saving} saveError={error} onCancel={() => navigate(onlineDeckPath(deckId))} onSave={async (draft) => {
        if (!user || saving) return
        setSaving(true); setError('')
        try {
          await withCloudDeadline(publishOnlineDeckVersion(user, deckId, { ...draft, expectedBaseVersion: loaded.version.version }))
          await loadLibrary(); navigate(onlineDeckPath(deckId))
        } catch (cause) { setError(describeCloudError(cause, 'The update could not be saved.')); setSaving(false) }
      }} />
  </main>
}
