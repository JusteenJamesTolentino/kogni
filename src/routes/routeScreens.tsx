import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, WandSparkles } from 'lucide-react'
import { Link, Navigate, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import Community from '../components/Community'
import Dashboard from '../components/Dashboard'
import DeckEditor from '../components/DeckEditor'
import Leaderboard from '../components/Leaderboard'
import MagicImport from '../components/MagicImport'
import Profile from '../components/Profile'
import StudySession from '../components/StudySession'
import { getSocialSummary } from '../lib/social'
import type { SocialSummary } from '../lib/social'
import { createCloudReviewSaver, createPrivateDeck, loadCloudDeck, loadCloudLibrary, newCloudDeckId } from '../lib/cloudDecks'
import { getErrorMessage } from '../lib/errors'
import type { StudyCard, StudyDeck } from '../types/domain'
import type { AppShellContextValue } from './AppShell'
import {
  deckStudyPath,
  onlineDeckPath,
  playerProfilePath,
  paths,
  portalPath,
} from '../router/paths'

function useAppShell(): AppShellContextValue {
  return useOutletContext<AppShellContextValue>()
}

function RouteLoading({ label }: { label: string }) {
  return (
    <main className="grid min-h-[60vh] place-items-center px-4" aria-label={label}>
      <span className="loading loading-spinner loading-lg text-primary" aria-hidden="true" />
    </main>
  )
}

function RouteError({ title, message }: { title: string; message: string }) {
  return (
    <main className="grid min-h-[60vh] place-items-center px-4 py-12">
      <section className="max-w-lg text-center" role="alert">
        <h1 className="text-2xl font-black">{title}</h1>
        <p className="mt-2 text-base-content/60">{message}</p>
        <Link to={paths.dashboard} className="btn btn-primary mt-5">Return to dashboard</Link>
      </section>
    </main>
  )
}

export function DashboardRoute() {
  const navigate = useNavigate()
  const { decks, dueCards, libraryLoading, libraryError, loadLibrary, activePlayers, publicOnlineDecks } = useAppShell()

  return (
    <Dashboard
      decks={decks}
      dueCards={dueCards}
      loading={libraryLoading}
      error={libraryError}
      onRetry={loadLibrary}
      onStudy={(deck) => navigate(deck ? deckStudyPath(deck.id, 'due') : paths.studyDue)}
      onOpenDeck={(deck) => navigate(onlineDeckPath(deck.id))}
      onImport={() => navigate(paths.import)}
      onBrowseShared={() => navigate(paths.community)}
      suggestedUsers={activePlayers}
      suggestedDecks={publicOnlineDecks}
      onOpenUser={(uid) => navigate(`/players/${encodeURIComponent(uid)}`)}
      onOpenSuggestedDeck={(deckId) => navigate(onlineDeckPath(deckId))}
    />
  )
}

export function ImportRoute() {
  const navigate = useNavigate()
  const { apiKey, geminiModel, loadLibrary, openApiKeyModal, setImportBusy, user } = useAppShell()
  const [saveId] = useState(newCloudDeckId)
  const [mode, setMode] = useState<'manual' | 'ai'>('manual')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (mode === 'manual') {
    return (
      <main className="mx-auto w-full max-w-[100rem] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section className="mx-auto max-w-3xl text-center">
          <div className="badge badge-primary badge-outline mb-3">Add a deck</div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Create your own questions</h1>
          <p className="mx-auto mt-3 max-w-2xl text-base-content/60">Add cards manually without AI, or let Magic Import generate a deck from a document.</p>
        </section>

        <button
          type="button"
          onClick={() => setMode('ai')}
          className="group mx-auto mt-8 flex w-full max-w-3xl items-center gap-4 rounded-3xl bg-gradient-to-br from-primary/30 via-secondary/20 to-primary/15 p-5 text-left shadow-xl shadow-primary/25 ring-1 ring-primary/50 transition hover:shadow-2xl hover:ring-primary sm:p-6"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-content shadow-md shadow-primary/40">
            <WandSparkles size={24} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-black">Try Magic Import</span>
            <span className="mt-0.5 block text-sm text-base-content/70">Upload a PDF or image and Gemini builds a verified 30-question deck for you.</span>
          </span>
          <ArrowRight size={20} className="shrink-0 text-primary transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </button>

        <DeckEditor
          initialDraft={{ title: '', description: '', studyGuide: '', cards: [{ id: 'new-card', question: '', answer: '', distractors: [] }] }}
          minimumCards={1}
          saving={saving}
          saveError={error}
          onCancel={() => navigate(paths.dashboard)}
          onSave={async (draft) => {
            setSaving(true)
            setError('')
            try {
              const saved = await createPrivateDeck(user, draft, saveId)
              await loadLibrary()
              navigate(onlineDeckPath(saved.id))
            } catch (cause: unknown) {
              setError(getErrorMessage(cause, 'The deck could not be saved.'))
              setSaving(false)
            }
          }}
        />
      </main>
    )
  }

  return (
    <>
      <div className="mx-auto flex max-w-5xl justify-end px-4 pt-6 sm:px-6 lg:px-8">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('manual')}>Add manually instead</button>
      </div>
      <MagicImport
        apiKey={apiKey}
        model={geminiModel}
        onOpenApiKey={openApiKeyModal}
        onBusyChange={setImportBusy}
        onComplete={async (draft) => {
          const saved = await createPrivateDeck(user, draft, saveId)
          await loadLibrary()
          setImportBusy(false)
          navigate(onlineDeckPath(saved.id))
        }}
      />
    </>
  )
}

export function CommunityRoute() {
  const navigate = useNavigate()
  const {
    communityProfile,
    user,
    profileLoading,
    profileError,
    profileSaving,
    inbox,
    inboxLoading,
    inboxError,
    activePlayers,
    publicOnlineDecks,
    discoveryLoading,
    discoveryError,
    openProfileModal,
    setDiscoverability,
    loadCommunity,
    importSharedDeck,
    dismissSharedDeck,
  } = useAppShell()
  const [portalCode, setPortalCode] = useState('')

  return (
    <Community
      profile={communityProfile}
      profileLoading={profileLoading}
      profileError={profileError}
      profileSaving={profileSaving}
      onEditProfile={openProfileModal}
      onDiscoverabilityChange={setDiscoverability}
      sharedDecks={inbox}
      inboxLoading={inboxLoading}
      inboxError={inboxError}
      onRefreshInbox={loadCommunity}
      onImportSharedDeck={importSharedDeck}
      onDismissSharedDeck={dismissSharedDeck}
      onlinePlayers={activePlayers.map((player) => ({ id: player.uid, nickname: player.nickname, online: true }))}
      onlinePlayersLoading={discoveryLoading}
      onlinePlayersError={discoveryError}
      onRetryOnlinePlayers={loadCommunity}
      onOpenPlayer={(player) => navigate(player.id === user.uid ? paths.profile : playerProfilePath(player.id))}
      publishedDecks={publicOnlineDecks.map((deck) => ({
        id: deck.id,
        title: deck.title,
        description: deck.description,
        creatorId: deck.ownerId,
        creatorNickname: deck.ownerNickname,
        creatorOnline: activePlayers.some((player) => player.uid === deck.ownerId),
        questionCount: deck.cardCount,
      }))}
      publishedDecksLoading={discoveryLoading}
      publishedDecksError={discoveryError}
      onOpenPublishedDeck={(deck) => navigate(onlineDeckPath(deck.id))}
      portalCode={portalCode}
      onPortalCodeChange={setPortalCode}
      onOpenPortal={(code) => navigate(portalPath(code))}
    />
  )
}

export function ProfileRoute() {
  const { user, account, decks, dueCards } = useAppShell()
  const [socialSummary, setSocialSummary] = useState<SocialSummary | null>(null)
  const [socialLoading, setSocialLoading] = useState(true)
  const [socialError, setSocialError] = useState('')
  const [socialRequest, setSocialRequest] = useState(0)
  const totalCards = decks.reduce((sum, deck) => sum + deck.cardCount, 0)
  const xp = Number(localStorage.getItem(`kognit_xp_${user.uid}`) || 0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setSocialLoading(true)
    setSocialError('')
    setSocialSummary(null)
    void getSocialSummary({ signal: controller.signal })
      .then((summary) => { if (active) setSocialSummary(summary) })
      .catch((error: unknown) => {
        if (active && !(error instanceof DOMException && error.name === 'AbortError')) {
          setSocialError('Social counts could not be loaded.')
        }
      })
      .finally(() => { if (active) setSocialLoading(false) })
    return () => { active = false; controller.abort() }
  }, [socialRequest, user.uid])

  const socialValue = (value: number | undefined) => socialLoading ? 'Loading…' : socialError ? '—' : value ?? '—'

  return <Profile
    nickname={account.nickname}
    avatarUrl={user.photoURL}
    publicPresence={account.preferences.presence ? 'online' : 'hidden'}
    stats={[
      { id: 'followers', label: 'Followers', value: socialValue(socialSummary?.followerCount), helpText: socialLoading ? 'Loading social count' : undefined },
      { id: 'following', label: 'Following', value: socialValue(socialSummary?.followingCount), helpText: socialLoading ? 'Loading social count' : undefined },
      { id: 'decks', label: 'Cloud decks', value: decks.length, helpText: 'Saved to your account' },
      { id: 'cards', label: 'Cards', value: totalCards },
      { id: 'due', label: 'Due reviews', value: dueCards.length },
      { id: 'xp', label: 'Learning XP', value: xp },
    ]}
    socialError={socialError}
    onRetrySocial={() => setSocialRequest((request) => request + 1)}
    onEditAvatar={undefined}
  />
}

export function GlobalLeaderboardRoute() {
  const navigate = useNavigate()
  const { user } = useAppShell()
  return <Leaderboard onOpenPlayer={(player) => navigate(player.id === user.uid ? paths.profile : playerProfilePath(player.id))} />
}

export function DeckRoute() {
  return <Navigate to={paths.legacyDecks} replace />
}

export function DeckLeaderboardRoute() {
  const { deckId = '' } = useParams()
  return <Leaderboard lineageId={deckId} />
}

interface StudyRouteProps { mode: 'scheduled' | 'practice'; deckScoped: boolean }

export function StudyRoute({ mode, deckScoped }: StudyRouteProps) {
  const navigate = useNavigate()
  const { deckId } = useParams()
  const { user, loadLibrary } = useAppShell()
  const [session, setSession] = useState<{ deck: StudyDeck | null; cards: StudyCard[]; saveReview: ReturnType<typeof createCloudReviewSaver> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setSession(null)
    void (async () => {
      const library = deckScoped ? null : await loadCloudLibrary(user)
      const ids = deckScoped ? [deckId || ''] : [...new Set(library!.dueCards.map((card) => card.deckId))]
      const loaded: Array<Awaited<ReturnType<typeof loadCloudDeck>>> = []
      for (const id of ids) loaded.push(await loadCloudDeck(user, id))
      const cards = loaded.flatMap((item) => item.cards).filter((card) => mode === 'practice' || card.nextReviewDate <= Date.now())
      if (active) setSession({ deck: deckScoped ? loaded[0]?.deck ?? null : null, cards, saveReview: createCloudReviewSaver(user, loaded) })
    })().catch((cause: unknown) => { if (active) setError(getErrorMessage(cause, 'The cloud session could not be loaded.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [deckId, deckScoped, mode, user])
  const exitTarget = session?.deck ? onlineDeckPath(session.deck.id) : paths.dashboard
  const finish = useCallback(async () => {
    if (mode === 'scheduled') await loadLibrary()
    navigate(exitTarget)
  }, [exitTarget, loadLibrary, mode, navigate])
  if (loading) return <RouteLoading label="Loading cloud study session" />
  if (error || !session) return <RouteError title="Study session unavailable" message={error} />
  return <StudySession cards={session.cards} deck={session.deck} mode={mode} onSaveReview={session.saveReview}
    onExit={() => void finish()} onFinished={finish} onGenerateAnother={() => navigate(paths.import)} />
}
