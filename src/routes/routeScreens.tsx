import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Layers3, Plus, WandSparkles } from 'lucide-react'
import { Link, Navigate, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import Community from '../components/Community'
import Dashboard from '../components/Dashboard'
import DeckEditor from '../components/DeckEditor'
import DeckList from '../components/DeckList'
import Leaderboard from '../components/Leaderboard'
import MagicImport from '../components/MagicImport'
import Profile from '../components/Profile'
import StudySession from '../components/StudySession'
import { getSocialSummary } from '../lib/social'
import type { SocialSummary } from '../lib/social'
import { createCloudReviewSaver, createPrivateDeck, loadCloudDeck, loadCloudLibrary, newCloudDeckId } from '../lib/cloudDecks'
import { subscribeToMyLeaderboardRecord } from '../lib/leaderboard'
import { getErrorMessage } from '../lib/errors'
import { shuffle } from '../lib/shuffle'
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
  const { decks, dueCards, libraryError, loadLibrary, activePlayers, publicOnlineDecks } = useAppShell()

  return (
    <Dashboard
      decks={decks}
      dueCards={dueCards}
      error={libraryError}
      onRetry={loadLibrary}
      onStudy={(deck) => navigate(deck ? deckStudyPath(deck.id, 'due') : paths.studyDue)}
      suggestedUsers={activePlayers}
      suggestedDecks={publicOnlineDecks}
      onOpenUser={(uid) => navigate(`/players/${encodeURIComponent(uid)}`)}
      onOpenSuggestedDeck={(deckId) => navigate(onlineDeckPath(deckId))}
    />
  )
}

type CreateDeckMode = 'manual' | 'ai'

function parseCreateDeckMode(value: string | null): CreateDeckMode | null {
  return value === 'manual' || value === 'ai' ? value : null
}

/** Logical decks hub: lists the account's decks and hosts both creation flows via ?create=manual|ai. */
export function MyDecksRoute() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { decks, dueCards, libraryLoading, libraryError, loadLibrary, apiKey, geminiModel, openApiKeyModal, setImportBusy, user } = useAppShell()
  const createMode = parseCreateDeckMode(searchParams.get('create'))
  const [saveId, setSaveId] = useState(newCloudDeckId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Fresh drafts need a fresh deck ID: saveId stays stable while the SAME draft is retried
  // (createPrivateDeck resumes an interrupted save by content hash), but leaving creation and
  // re-entering — or switching manual↔ai — starts a new draft that must not inherit an ID
  // whose earlier save may have landed server-side after a client timeout.
  useEffect(() => {
    setSaveId(newCloudDeckId())
  }, [createMode])

  const setCreateMode = (mode: CreateDeckMode | null): void => {
    setSearchParams(mode ? { create: mode } : {}, { replace: true })
  }

  if (createMode === 'manual') {
    // DeckEditor renders its own back button (onCancel returns to the list), so no wrapper chrome.
    return (
      <DeckEditor
        heading="New deck"
        deckLabel="New deck"
        initialDraft={{ title: '', description: '', studyGuide: '', cards: [{ id: 'new-card', question: '', answer: '', distractors: [] }] }}
        minimumCards={1}
        saving={saving}
        saveError={error}
        onCancel={() => setCreateMode(null)}
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
    )
  }

  if (createMode === 'ai') {
    return (
      <>
        <div className="mx-auto flex max-w-5xl justify-end px-4 pt-4">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreateMode(null)}>
            <ArrowRight size={16} className="rotate-180" aria-hidden="true" />
            Back to my decks
          </button>
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

  return (
    <main className="mx-auto w-full max-w-[100rem] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            <Layers3 size={16} aria-hidden="true" />
            Your library
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">My decks</h1>
          <p className="mt-2 text-base-content/60">{decks.length} {decks.length === 1 ? 'deck' : 'decks'} saved to your account. Internet required.</p>
          <Link to={paths.legacyDecks} className="link mt-1 inline-block text-xs text-base-content/50">Recover legacy decks on this device</Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setCreateMode('manual')} className="btn btn-primary gap-2">
            <Plus size={17} aria-hidden="true" />
            New deck
          </button>
          <button type="button" onClick={() => setCreateMode('ai')} className="btn btn-outline gap-2">
            <WandSparkles size={17} aria-hidden="true" />
            Magic Import
          </button>
        </div>
      </section>

      {libraryError && (
        <div role="alert" className="alert alert-error mt-6">
          <span>{libraryError}</span>
          <button type="button" onClick={() => void loadLibrary()} className="btn btn-sm">Try again</button>
        </div>
      )}

      <section className="mt-7" aria-label="Your decks">
        <DeckList
          decks={decks}
          dueCards={dueCards}
          loading={libraryLoading}
          onReviewDue={(deck) => navigate(deckStudyPath(deck.id, 'due'))}
          onOpenDeck={(deck) => navigate(onlineDeckPath(deck.id))}
          onImport={() => setCreateMode('manual')}
          onBrowseShared={() => navigate(paths.community)}
        />
      </section>
    </main>
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
  const [xp, setXp] = useState(0)
  const totalCards = decks.reduce((sum, deck) => sum + deck.cardCount, 0)

  // The cloud leaderboard is the single XP ledger; the old localStorage mirror is gone.
  useEffect(() => subscribeToMyLeaderboardRecord(user.uid, (record) => setXp(record?.xp ?? 0)), [user.uid])

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
  const { deckId = '' } = useParams()
  // Cloud decks live under /online-decks; stale /decks/:id bookmarks and shared links
  // resolve to the real deck page instead of the legacy recovery list.
  return deckId ? <Navigate to={onlineDeckPath(deckId)} replace /> : <Navigate to={paths.legacyDecks} replace />
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
      // Load due decks concurrently; a slow deck no longer delays the whole session start.
      const loaded = await Promise.all(ids.map((id) => loadCloudDeck(user, id)))
      const cards = loaded
        .flatMap((item) => item.cards)
        .filter((card) => mode === 'practice' || card.nextReviewDate <= Date.now())
      // Due reviews run in random order instead of the fixed deck sequence.
      if (active) setSession({ deck: deckScoped ? loaded[0]?.deck ?? null : null, cards: mode === 'scheduled' ? shuffle(cards) : cards, saveReview: createCloudReviewSaver(user, loaded) })
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
    onExit={() => void finish()} onFinished={finish} onGenerateAnother={() => navigate(paths.myDecks)} />
}
