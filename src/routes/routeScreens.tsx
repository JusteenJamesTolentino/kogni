import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, GraduationCap, Layers3, ListChecks, Plus, Presentation, WandSparkles } from 'lucide-react'
import { Link, Navigate, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import Community from '../components/Community'
import Dashboard from '../components/Dashboard'
import DeckEditor from '../components/DeckEditor'
import DeckList from '../components/DeckList'
import Leaderboard from '../components/Leaderboard'
import MagicImport from '../components/MagicImport'
import Profile from '../components/Profile'
import StudySession from '../components/StudySession'
import AvatarUploadDialog from '../components/AvatarUploadDialog'
import { useAuth } from '../context/AuthContext'
import { getSocialSummary } from '../lib/social'
import type { SocialSummary } from '../lib/social'
import { createCloudReviewSaver, createPrivateDeck, loadCloudDeck, loadCloudLibrary, newCloudDeckId } from '../lib/cloudDecks'
import { subscribeToMyLeaderboardRecord } from '../lib/leaderboard'
import { profileBadges } from '../lib/badges'
import { accountRole, updateAccountRole } from '../lib/account'
import { formatQuizCodeInput, listOwnedQuizzes, lookupQuizCode, normalizeQuizCode } from '../lib/quizzes'
import QuizCreator from '../components/QuizCreator'
import { getErrorMessage } from '../lib/errors'
import { shuffle } from '../lib/shuffle'
import type { AccountRole, StudyCard, StudyDeck } from '../types/domain'
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
  const { refreshAccount } = useAuth()
  const [socialSummary, setSocialSummary] = useState<SocialSummary | null>(null)
  const [socialLoading, setSocialLoading] = useState(true)
  const [socialError, setSocialError] = useState('')
  const [socialRequest, setSocialRequest] = useState(0)
  const [xp, setXp] = useState(0)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [avatarError, setAvatarError] = useState('')
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
  const avatarUrl = account.avatar?.url || user.photoURL || ''

  return (
    <>
      <Profile
        nickname={account.nickname}
        avatarUrl={avatarUrl}
        avatarAlt={`${account.nickname}'s avatar`}
        badges={profileBadges(account)}
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
        onEditAvatar={() => setAvatarOpen(true)}
        error={avatarError}
      />
      <AvatarUploadDialog
        open={avatarOpen}
        user={user}
        currentAvatarUrl={avatarUrl}
        nickname={account.nickname}
        onSaved={() => { setAvatarOpen(false); setAvatarError(''); void refreshAccount() }}
        onClose={() => setAvatarOpen(false)}
      />
    </>
  )
}

/** First-visit role gate, then the quiz hub: students join by code, teachers create and share. */
export function QuizRoute() {
  const { user, account } = useAppShell()
  const { refreshAccount } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [savingRole, setSavingRole] = useState<AccountRole | null>(null)
  const [error, setError] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [codeResult, setCodeResult] = useState<{ status: 'found' | 'not-found'; code: string } | null>(null)
  const [ownedQuizzes, setOwnedQuizzes] = useState<Array<{ quizId: string; code: string; title: string; createdAt: number }>>([])
  const [quizzesLoading, setQuizzesLoading] = useState(false)
  const role = accountRole(account)
  const codeParam = searchParams.get('code') ?? ''

  const chooseRole = async (nextRole: AccountRole): Promise<void> => {
    if (savingRole) return
    setSavingRole(nextRole); setError('')
    try {
      // updateAccountRole no-ops when the role is already set — always resync the
      // account afterwards so the UI can never wedge on a stale local copy.
      await updateAccountRole(user, nextRole)
      await refreshAccount()
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, 'The role could not be saved.'))
    } finally {
      setSavingRole(null)
    }
  }

  const joinByCode = useCallback(async (value: string): Promise<void> => {
    setLookingUp(true); setError(''); setCodeResult(null)
    try {
      const result = await lookupQuizCode(value)
      setCodeResult({ status: result.status, code: result.code })
      setCodeInput(formatQuizCodeInput(value))
      if (result.status === 'found') {
        // Keep the shareable URL; taking the quiz itself lands in Slice 3.
        setSearchParams({ code: result.code }, { replace: true })
      }
    } catch (cause: unknown) {
      setCodeResult(null)
      setError(cause instanceof TypeError ? cause.message : getErrorMessage(cause, 'The quiz code could not be checked.'))
    } finally {
      setLookingUp(false)
    }
  }, [setSearchParams])

  // Teacher-shared links (/quiz?code=ABCD-EFGH) resolve automatically once the
  // student has a role; a missing role shows the gate first, then this fires.
  const autoCode = useMemo(() => normalizeQuizCode(codeParam), [codeParam])
  const autoLookupKey = role === 'student' ? autoCode : null
  const [lastAutoLookup, setLastAutoLookup] = useState<string | null>(null)
  useEffect(() => {
    if (!autoLookupKey || lastAutoLookup === autoLookupKey) return
    setLastAutoLookup(autoLookupKey)
    void joinByCode(autoLookupKey)
  }, [autoLookupKey, joinByCode, lastAutoLookup])

  // Teachers see their published quizzes with codes so codes can always be re-shared.
  const loadOwnedQuizzes = useCallback(async (): Promise<void> => {
    setQuizzesLoading(true)
    try {
      setOwnedQuizzes(await listOwnedQuizzes(user.uid))
    } catch {
      setOwnedQuizzes([])
    } finally {
      setQuizzesLoading(false)
    }
  }, [user.uid])
  useEffect(() => {
    if (role === 'teacher' && account.role) void loadOwnedQuizzes()
  }, [role, account.role, loadOwnedQuizzes])

  const roleCards: Array<{ role: AccountRole; label: string; description: string; icon: typeof GraduationCap }> = [
    { role: 'student', label: 'Student', description: 'Take quizzes with codes shared by your teacher and track your rank.', icon: GraduationCap },
    { role: 'teacher', label: 'Teacher', description: 'Create quizzes, share codes with your class, and review results.', icon: Presentation },
  ]

  const codeStatusLine = codeResult ? (
    codeResult.status === 'found'
      ? <div role="status" className="alert alert-success mt-4"><span>Quiz <strong>{codeResult.code}</strong> is ready. Taking quizzes opens in the next update — keep this link handy.</span></div>
      : <div role="status" className="alert alert-warning mt-4"><span>No live quiz is using code <strong>{codeResult.code}</strong> yet. Ask your teacher to share one.</span></div>
  ) : null

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      {error && <div role="alert" className="alert alert-error mb-6"><span>{error}</span></div>}
      {!account.role ? (
        <section aria-labelledby="quiz-role-title" className="rounded-3xl border border-primary/20 bg-base-100 p-6 shadow-xl sm:p-9">
          <span className="badge badge-primary gap-1"><ListChecks size={13} /> Quiz system</span>
          <h1 id="quiz-role-title" className="mt-4 text-3xl font-black">How will you use quizzes?</h1>
          <p className="mt-2 text-base-content/60">
            Pick your role for school quizzes. You can switch anytime — quizzes never award XP and never touch your review schedules.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {roleCards.map((card) => (
              <button
                key={card.role}
                type="button"
                onClick={() => void chooseRole(card.role)}
                disabled={Boolean(savingRole)}
                className="rounded-2xl border border-base-300 bg-base-100 p-5 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md disabled:opacity-60"
              >
                <card.icon size={26} className="text-primary" aria-hidden="true" />
                <h2 className="mt-3 text-xl font-black">{card.label}{savingRole === card.role && <span className="loading loading-spinner loading-sm ml-2 align-middle" />}</h2>
                <p className="mt-1 text-sm text-base-content/60">{card.description}</p>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section aria-labelledby="quiz-hub-title" className="rounded-3xl border border-primary/20 bg-base-100 p-6 shadow-xl sm:p-9">
          <span className="badge badge-primary gap-1"><ListChecks size={13} /> Quiz hub</span>
          <h1 id="quiz-hub-title" className="mt-4 text-3xl font-black">Quizzes</h1>
          {role === 'student' ? (
            <>
              <p className="mt-2 text-base-content/60">
                Enter the quiz code your teacher shared, or open their link (<code>/quiz?code=ABCD-EFGH</code>) and it fills in automatically.
              </p>
              <form
                className="mt-5 flex flex-wrap items-center gap-3"
                onSubmit={(event) => { event.preventDefault(); void joinByCode(codeInput) }}
              >
                <input
                  value={codeInput}
                  onChange={(event) => setCodeInput(formatQuizCodeInput(event.target.value))}
                  placeholder="ABCD-EFGH"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Quiz code"
                  className="input input-bordered w-44 font-mono text-lg uppercase tracking-widest"
                  disabled={lookingUp}
                />
                <button type="submit" className="btn btn-primary gap-2" disabled={lookingUp || normalizeQuizCode(codeInput) === null}>
                  {lookingUp && <span className="loading loading-spinner loading-sm" />}
                  <GraduationCap size={17} /> Join quiz
                </button>
              </form>
              {codeStatusLine}
            </>
          ) : (
            <>
              <p className="mt-2 text-base-content/60">
                Create a timed, auto-graded quiz and share its code or link with your class — students enter it here. Quizzes never award XP and never touch review schedules.
              </p>
              <div className="mt-5">
                <Link to={paths.quizCreate} className="btn btn-primary gap-2"><Presentation size={17} /> Create quiz</Link>
              </div>
              {ownedQuizzes.length > 0 && (
                <div className="mt-6">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/55">Your quizzes {quizzesLoading && <span className="loading loading-spinner loading-xs" />}</h2>
                  <ul className="mt-2 space-y-2">
                    {ownedQuizzes.map((quiz) => (
                      <li key={quiz.quizId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-base-300 bg-base-200/40 px-4 py-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{quiz.title}</div>
                          <div className="font-mono text-sm tracking-widest text-base-content/60">{quiz.code}</div>
                        </div>
                        <Link to={`${paths.quiz}?code=${quiz.code}`} className="btn btn-ghost btn-sm">Open student view</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            {roleCards.filter((card) => card.role !== role).map((card) => (
              <button key={card.role} type="button" className="btn btn-ghost btn-sm gap-2" onClick={() => void chooseRole(card.role)} disabled={Boolean(savingRole)}>
                <card.icon size={15} /> Switch to {card.label}
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

/** Teacher-only quiz creator; students are redirected back to the hub. */
export function QuizCreatorRoute() {
  const { user, account } = useAppShell()
  const role = accountRole(account)
  if (!account.role) return <Navigate to={paths.quiz} replace />
  if (role !== 'teacher') return <Navigate to={paths.quiz} replace />
  return <QuizCreator user={user} onExit={() => window.history.back()} />
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
