import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import {
  AlertTriangle,
  Clock,
  Expand,
  Hourglass,
  Info,
  LogOut,
  ShieldCheck,
  TimerReset,
  WifiOff,
} from 'lucide-react'
import useQuizIntegrityMonitor from '../hooks/useQuizIntegrityMonitor'
import {
  QUIZ_QUESTION_DURATION_MS,
  answerQuizQuestion,
  startQuizAttempt,
} from '../lib/quizzes'
import type {
  QuizAttemptActiveState,
  QuizAttemptResult,
  QuizFullscreenStart,
  QuizRankStats,
  QuizResolutionMetadata,
  StartQuizAttemptResponse,
} from '../lib/quizzes'

interface QuizTakingProps {
  user: User
  quiz: QuizResolutionMetadata
  code: string
  onFinished: (result: QuizAttemptResult, stats: QuizRankStats | undefined, alreadyTaken: boolean) => void
  onExit: () => void
}

const LETTERS = 'ABCDEFG'.split('')
const TIMER_TICK_MS = 250
const MONITOR_STOP_WAIT_MS = 1_500

type FullscreenChoice = QuizFullscreenStart

interface PendingAnswer {
  questionId: string
  operationId: string
  chosenIndex: number
}

function createOpaqueId(prefix: 'session' | 'operation'): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function fullscreenOutcomeFromError(_error: unknown): QuizFullscreenStart {
  return 'denied'
}

async function requestQuizFullscreen(target: HTMLElement): Promise<QuizFullscreenStart> {
  if (document.fullscreenElement != null) return 'entered'
  if (typeof target.requestFullscreen !== 'function') return 'unsupported'
  try {
    await target.requestFullscreen()
    return document.fullscreenElement != null ? 'entered' : 'denied'
  } catch (error: unknown) {
    return fullscreenOutcomeFromError(error)
  }
}

async function exitFullscreenBestEffort(): Promise<void> {
  if (document.fullscreenElement == null || typeof document.exitFullscreen !== 'function') return
  try {
    await document.exitFullscreen()
  } catch {
    // Fullscreen exit is best effort and must not block navigation or grading.
  }
}

function remainingMilliseconds(attempt: QuizAttemptActiveState | null, serverOffset: number): number {
  if (!attempt) return 0
  return Math.max(0, attempt.deadlineAt - (Date.now() + serverOffset))
}

function serverOffsetAtResponse(serverNow: number, sentAt: number, receivedAt: number): number {
  const midpoint = sentAt + Math.max(0, receivedAt - sentAt) / 2
  return serverNow - midpoint
}

function formatCountdown(milliseconds: number): string {
  return `${Math.ceil(milliseconds / 1000)}s`
}

function raceWithDelay(operation: Promise<void>, milliseconds: number): Promise<void> {
  return Promise.race([
    operation.catch(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds)),
  ])
}

/** Server-authoritative one-question quiz flow with optional transparent Integrity Mode monitoring. */
export default function QuizTaking({ user: _user, quiz, code, onFinished, onExit }: QuizTakingProps) {
  const quizRootRef = useRef<HTMLElement | null>(null)
  const aliveRef = useRef(true)
  const [sessionId] = useState(() => createOpaqueId('session'))
  const attemptRef = useRef<QuizAttemptActiveState | null>(null)
  const pendingAnswerRef = useRef<PendingAnswer | null>(null)
  const sendingRef = useRef(false)
  const timeoutQuestionRef = useRef<string | null>(null)
  const finishingRef = useRef(false)
  const mountedRef = useRef(true)
  const conflictResumeUsedRef = useRef(false)
  const startFullscreenRef = useRef<FullscreenChoice>('unsupported')
  const startPromiseRef = useRef<Promise<StartQuizAttemptResponse> | null>(null)
  const answerAfterResumeRef = useRef<PendingAnswer | null>(null)
  const [understood, setUnderstood] = useState(false)
  const [ordinaryConfirmed, setOrdinaryConfirmed] = useState(false)
  const [attempt, setAttempt] = useState<QuizAttemptActiveState | null>(null)
  const [pendingAnswer, setPendingAnswer] = useState<PendingAnswer | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [serverOffset, setServerOffset] = useState(0)
  const [millisecondsLeft, setMillisecondsLeft] = useState(0)
  const [starting, setStarting] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [monitorNotice, setMonitorNotice] = useState('')
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  const [fullscreenActive, setFullscreenActive] = useState(() => typeof document !== 'undefined' && document.fullscreenElement != null)
  const [timerAnnouncement, setTimerAnnouncement] = useState('')

  const active = attempt !== null && !finishing
  const integrityEnabled = quiz.integrity.enabled
  const monitor = useQuizIntegrityMonitor({
    enabled: integrityEnabled,
    active,
    quizId: quiz.quizId,
    attemptId: attempt?.attemptId ?? '',
    sessionId: attempt?.sessionId ?? sessionId,
    currentQuestionId: attempt?.question.id ?? null,
    fullscreenWasEntered: attempt?.integrity.fullscreenStart === 'entered',
    onError: () => {
      if (aliveRef.current) setMonitorNotice('Some technical signals could not be delivered yet. Your timer and answers are unaffected.')
    },
  })
  const monitorRef = useRef(monitor)
  useEffect(() => {
    monitorRef.current = monitor
  }, [monitor])

  useEffect(() => {
    attemptRef.current = attempt
  }, [attempt])

  useEffect(() => () => {
    aliveRef.current = false
    mountedRef.current = false
    void exitFullscreenBestEffort()
  }, [])

  useEffect(() => {
    const updateOnline = (): void => setOnline(navigator.onLine !== false)
    const updateFullscreen = (): void => setFullscreenActive(document.fullscreenElement != null)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
      document.removeEventListener('fullscreenchange', updateFullscreen)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const warnBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [active])

  const applyActiveState = useCallback((next: QuizAttemptActiveState, sentAt = Date.now(), receivedAt = Date.now()): void => {
    const nextOffset = serverOffsetAtResponse(next.serverNow, sentAt, receivedAt)
    attemptRef.current = next
    pendingAnswerRef.current = null
    setPendingAnswer(null)
    timeoutQuestionRef.current = null
    setServerOffset(nextOffset)
    setMillisecondsLeft(remainingMilliseconds(next, nextOffset))
    setTimerAnnouncement('')
    setAttempt(next)
    setError('')
  }, [])

  const finish = useCallback(async (
    result: QuizAttemptResult,
    stats: QuizRankStats | undefined,
    alreadyTaken: boolean,
  ): Promise<void> => {
    if (finishingRef.current) return
    finishingRef.current = true
    setAttempt(null)
    setFinishing(true)
    await raceWithDelay(monitorRef.current.stop(), MONITOR_STOP_WAIT_MS)
    await exitFullscreenBestEffort()
    if (mountedRef.current) onFinished(result, stats, alreadyTaken)
  }, [onFinished])

  const start = useCallback(async (fullscreenStart: FullscreenChoice): Promise<void> => {
    if (startPromiseRef.current || attemptRef.current) return
    setStarting(true)
    setError('')
    startFullscreenRef.current = fullscreenStart
    const sentAt = Date.now()
    const request = startQuizAttempt(quiz.quizId, sessionId, fullscreenStart)
    startPromiseRef.current = request
    try {
      const response = await request
      if (response.status === 'already') {
        await finish(response.result, response.stats, true)
        return
      }
      conflictResumeUsedRef.current = false
      applyActiveState(response, sentAt, Date.now())
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The quiz could not be started.')
    } finally {
      if (startPromiseRef.current === request) startPromiseRef.current = null
      if (mountedRef.current) setStarting(false)
    }
  }, [applyActiveState, finish, quiz.quizId, sessionId])

  const startWithFullscreen = useCallback(async (): Promise<void> => {
    if (!understood || starting) return
    const target = quizRootRef.current ?? document.documentElement
    const outcome = await requestQuizFullscreen(target)
    if (mountedRef.current && outcome !== 'entered') {
      setMonitorNotice(
        outcome === 'unsupported'
          ? 'Fullscreen is unavailable here. You can continue with limited monitoring.'
          : 'Fullscreen was not entered. You can continue with limited monitoring.',
      )
    }
    await start(outcome)
  }, [start, starting, understood])

  const startWithoutFullscreen = useCallback(async (): Promise<void> => {
    if (!understood || starting) return
    setMonitorNotice('Fullscreen was not entered. You can continue with limited monitoring.')
    await start('denied')
  }, [start, starting, understood])

  const resumeAfterSessionConflict = useCallback(async (): Promise<boolean> => {
    if (conflictResumeUsedRef.current) return false
    conflictResumeUsedRef.current = true
    const sentAt = Date.now()
    const response = await startQuizAttempt(quiz.quizId, sessionId, startFullscreenRef.current)
    if (response.status === 'already') {
      await finish(response.result, response.stats, true)
      return false
    }
    applyActiveState(response, sentAt, Date.now())
    return true
  }, [applyActiveState, finish, quiz.quizId, sessionId])

  const sendAnswer = useCallback(async (chosenIndex: number, retrying = false): Promise<void> => {
    const current = attemptRef.current
    if (!current || sendingRef.current || finishingRef.current) return

    let pending = pendingAnswerRef.current
    if (retrying) {
      if (!pending || pending.questionId !== current.question.id || pending.chosenIndex !== chosenIndex) return
    } else {
      pending = {
        questionId: current.question.id,
        operationId: createOpaqueId('operation'),
        chosenIndex,
      }
      pendingAnswerRef.current = pending
      setPendingAnswer(pending)
    }

    sendingRef.current = true
    setSending(true)
    setError('')
    const sentAt = Date.now()
    try {
      const response = await answerQuizQuestion({
        quizId: quiz.quizId,
        attemptId: current.attemptId,
        sessionId: current.sessionId,
        questionId: pending.questionId,
        operationId: pending.operationId,
        chosenIndex: pending.chosenIndex,
      })
      if (response.status === 'completed') {
        pendingAnswerRef.current = null
        setPendingAnswer(null)
        await finish(response.result, response.stats, false)
        return
      }
      if (response.status === 'active') {
        conflictResumeUsedRef.current = false
        applyActiveState(response, sentAt, Date.now())
        return
      }
      if (response.reason === 'session-replaced') {
        const resumed = await resumeAfterSessionConflict()
        if (!resumed || finishingRef.current) return
        const resumedAttempt = attemptRef.current
        if (resumedAttempt?.question.id === pending.questionId) {
          pendingAnswerRef.current = pending
          setPendingAnswer(pending)
          answerAfterResumeRef.current = pending
          return
        }
        pendingAnswerRef.current = null
        setPendingAnswer(null)
        return
      }
      setError('That answer operation could not be reused. Please choose your answer again.')
      pendingAnswerRef.current = null
      setPendingAnswer(null)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? `${cause.message} Use “Retry answer” to send the same operation safely.` : 'The answer could not be sent. Use “Retry answer” to try again.')
    } finally {
      sendingRef.current = false
      if (mountedRef.current) setSending(false)
    }
  }, [applyActiveState, finish, quiz.quizId, resumeAfterSessionConflict])

  useEffect(() => {
    const pending = answerAfterResumeRef.current
    if (!pending || sending) return
    answerAfterResumeRef.current = null
    void sendAnswer(pending.chosenIndex, true)
  }, [attempt, sendAnswer, sending])

  useEffect(() => {
    if (!attempt) return
    const updateCountdown = (): void => {
      const remaining = remainingMilliseconds(attempt, serverOffset)
      setMillisecondsLeft(remaining)
      const wholeSeconds = Math.ceil(remaining / 1000)
      if (wholeSeconds === 5) setTimerAnnouncement('5 seconds remaining.')
      if (remaining === 0) {
        setTimerAnnouncement('Time expired. Submitting no answer.')
        if (timeoutQuestionRef.current !== attempt.question.id) {
          timeoutQuestionRef.current = attempt.question.id
          void sendAnswer(-1)
        }
      }
    }
    updateCountdown()
    const timer = window.setInterval(updateCountdown, TIMER_TICK_MS)
    document.addEventListener('visibilitychange', updateCountdown)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', updateCountdown)
    }
  }, [attempt, sendAnswer, serverOffset])

  const leave = useCallback(async (): Promise<void> => {
    if (attemptRef.current && !window.confirm('Leave this quiz? The server timer continues and the attempt does not pause.')) return
    aliveRef.current = false
    if (attemptRef.current) await raceWithDelay(monitorRef.current.stop(), MONITOR_STOP_WAIT_MS)
    await exitFullscreenBestEffort()
    onExit()
  }, [onExit])

  const retryPendingAnswer = (): void => {
    const pending = pendingAnswerRef.current
    if (pending) void sendAnswer(pending.chosenIndex, true)
  }

  if (!attempt) {
    return (
      <main ref={quizRootRef} className="mx-auto min-h-screen w-full max-w-3xl overflow-y-auto bg-base-200 px-4 py-8 sm:px-6 sm:py-12">
        {error && <div role="alert" className="alert alert-error mb-6"><span>{error}</span></div>}
        <section aria-labelledby="quiz-preflight-title" className="rounded-3xl border border-primary/20 bg-base-100 p-6 shadow-xl sm:p-9">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge badge-primary gap-1"><Hourglass size={13} aria-hidden="true" /> {quiz.title}</span>
            {integrityEnabled && <span className="badge badge-info gap-1"><ShieldCheck size={13} aria-hidden="true" /> Integrity Mode</span>}
          </div>
          <h1 id="quiz-preflight-title" className="mt-4 text-3xl font-black">{integrityEnabled ? 'Before you start' : 'Ready to start?'}</h1>
          {quiz.description && <p className="mt-2 text-base-content/60">{quiz.description}</p>}

          {integrityEnabled ? (
            <>
              <div className="mt-5 rounded-2xl border border-info/30 bg-info/5 p-5 text-sm text-base-content/75">
                <ul className="list-disc space-y-2 pl-5">
                  <li>You get one attempt, with one question shown at a time.</li>
                  <li>Each question has a server-enforced 30-second deadline. The timer continues while this page is hidden, offline, or outside fullscreen.</li>
                  <li>Limited page-attention, fullscreen, connection, and replacement-session signals are recorded and visible to you and your teacher for 30 days.</li>
                  <li>This cannot detect passive split view or another screen or device. Kogni records only that this page lost attention; it cannot see the other tab, app, or split-screen content.</li>
              <li>It does not use your camera, microphone, screen recording, keystrokes, or location.</li>
                  <li>Signals provide context, not proof, and never change your score or attempt automatically.</li>
                </ul>
                <p className="mt-3 font-semibold">Ask your teacher before starting if you need an accommodation.</p>
              </div>
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-base-300 p-4">
                <input
                  type="checkbox"
                  className="checkbox checkbox-info mt-0.5"
                  checked={understood}
                  onChange={(event) => setUnderstood(event.target.checked)}
                  disabled={starting}
                />
                <span className="font-semibold">I understand the one-attempt timing and the limited Integrity Mode signals.</span>
              </label>
              {monitorNotice && <div role="status" className="alert alert-info mt-4"><Info size={18} aria-hidden="true" /><span>{monitorNotice}</span></div>}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button type="button" className="btn btn-primary gap-2" onClick={() => void startWithFullscreen()} disabled={!understood || starting}>
                  {starting ? <span className="loading loading-spinner loading-sm" /> : <Expand size={17} aria-hidden="true" />}
                  Try fullscreen and start
                </button>
                <button type="button" className="btn btn-outline" onClick={() => void startWithoutFullscreen()} disabled={!understood || starting}>
                  Continue without fullscreen
                </button>
                <button type="button" className="btn btn-ghost gap-2" onClick={() => void leave()} disabled={starting}>
                  <LogOut size={16} aria-hidden="true" /> Leave
                </button>
              </div>
            </>
          ) : (
            <>
              <ul className="mt-5 list-disc space-y-2 pl-5 text-sm text-base-content/70">
                <li>{quiz.questionCount} {quiz.questionCount === 1 ? 'question' : 'questions'}, one at a time, with a server-enforced 30-second deadline each.</li>
                <li>You get exactly one graded attempt; the timer cannot be paused after start.</li>
                <li>This ordinary quiz does not request fullscreen or monitor page activity.</li>
              </ul>
              <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-base-300 p-4">
                <input type="checkbox" className="checkbox checkbox-primary" checked={ordinaryConfirmed} onChange={(event) => setOrdinaryConfirmed(event.target.checked)} disabled={starting} />
                <span className="font-semibold">I am ready to begin my one attempt.</span>
              </label>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" className="btn btn-primary" onClick={() => void start('not-requested')} disabled={!ordinaryConfirmed || starting}>
                  {starting && <span className="loading loading-spinner loading-sm" />} Start quiz
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => void leave()} disabled={starting}>Leave</button>
              </div>
            </>
          )}
          <p className="mt-5 text-xs text-base-content/45">Quiz code {code}</p>
        </section>
      </main>
    )
  }

  const urgent = millisecondsLeft <= 5_000
  const timeUsed = Math.min(QUIZ_QUESTION_DURATION_MS, Math.max(0, QUIZ_QUESTION_DURATION_MS - millisecondsLeft))
  const fullscreenNeedsReturn = integrityEnabled && attempt.integrity.fullscreenStart === 'entered' && !fullscreenActive

  return (
    <main ref={quizRootRef} className="mx-auto min-h-screen w-full max-w-3xl overflow-y-auto bg-base-200 px-4 pb-8 pt-8 sm:px-6 sm:py-12">
      <span className="sr-only" aria-live="assertive" aria-atomic="true">{timerAnnouncement}</span>
      <div className="sticky top-0 z-20 -mx-4 border-b border-base-300 bg-base-100/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:mb-4 sm:rounded-2xl sm:border">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black">{quiz.title}</p>
            <p className="text-xs text-base-content/55">Question {attempt.questionIndex + 1} of {attempt.questionCount}</p>
          </div>
          <span className={`flex shrink-0 items-center gap-2 font-black tabular-nums ${urgent ? 'text-error' : 'text-base-content/70'}`} aria-live="off" aria-label={`${Math.ceil(millisecondsLeft / 1000)} seconds remaining`}>
            <Clock size={18} className={urgent ? 'animate-pulse' : ''} aria-hidden="true" />
            {formatCountdown(millisecondsLeft)}
          </span>
        </div>
        <progress className={`progress mt-2 block w-full ${urgent ? 'progress-error' : 'progress-primary'}`} value={timeUsed} max={QUIZ_QUESTION_DURATION_MS} aria-label="Time used on this question" />
      </div>

      {error && (
        <div role="alert" className="alert alert-error mb-4">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{error}</span>
          {pendingAnswer && <button type="button" className="btn btn-sm" onClick={retryPendingAnswer} disabled={sending}>Retry answer</button>}
        </div>
      )}
      {!online && <div role="status" className="alert alert-warning mb-4"><WifiOff size={18} aria-hidden="true" /><span>Connection interrupted. The server deadline continues; reconnect to send the answer.</span></div>}
      {monitor.returnWarning && (
        <div role="status" className="alert alert-info mb-4">
          <Info size={18} aria-hidden="true" />
          <span>{monitor.returnWarning}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={monitor.clearReturnWarning}>Dismiss</button>
        </div>
      )}
      {monitorNotice && <div role="status" className="alert alert-info mb-4"><Info size={18} aria-hidden="true" /><span>{monitorNotice}</span></div>}
      {fullscreenNeedsReturn && (
        <div role="status" className="alert alert-info mb-4">
          <Expand size={18} aria-hidden="true" />
          <span>Fullscreen ended. Your timer continues.</span>
          <button type="button" className="btn btn-sm" onClick={() => void monitor.reenterFullscreen()}>Return to fullscreen</button>
        </div>
      )}

      <section aria-labelledby="quiz-taking-title" className="rounded-3xl border border-primary/20 bg-base-100 p-6 shadow-xl sm:p-9">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="badge badge-primary gap-1"><Hourglass size={13} aria-hidden="true" /> Question {attempt.questionIndex + 1}</span>
          {integrityEnabled && <span className="badge badge-info badge-outline gap-1"><ShieldCheck size={13} aria-hidden="true" /> Integrity Mode</span>}
        </div>
        <h1 id="quiz-taking-title" className="mt-5 text-2xl font-black leading-snug">{attempt.question.prompt}</h1>
        <p className="mt-1 text-xs text-base-content/50">Answering sends this question immediately. At zero, no answer is sent once.</p>

        <div className="mt-6 grid gap-3">
          {attempt.question.choices.map((choice, choiceIndex) => (
            <button
              key={`${attempt.question.id}-${choiceIndex}`}
              type="button"
              onClick={() => void sendAnswer(choiceIndex)}
              disabled={sending || millisecondsLeft === 0}
              className="btn h-auto min-h-12 justify-start gap-3 whitespace-normal border-base-300 bg-base-200/50 px-4 py-3 text-left hover:btn-primary"
            >
              <span className="badge badge-ghost">{LETTERS[choiceIndex] ?? choiceIndex + 1}</span>
              <span className="leading-snug">{choice}</span>
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-base-300 pt-4 text-xs text-base-content/55 sm:flex-row sm:items-center sm:justify-between">
          <span><TimerReset size={13} className="inline" aria-hidden="true" /> The server deadline continues if this page is hidden or offline.</span>
          <button type="button" onClick={() => void leave()} className="btn btn-ghost btn-xs" disabled={sending}>Leave quiz</button>
        </div>
      </section>
    </main>
  )
}
