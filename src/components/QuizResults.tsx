import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { get, ref } from 'firebase/database'
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  Info,
  Radio,
  ShieldCheck,
  UsersRound,
  WifiOff,
} from 'lucide-react'
import { database } from '../lib/firebase'
import { getQuizIntegrityEvents } from '../lib/quizzes'
import type {
  QuizAttemptResult,
  QuizIntegrityEventRecord,
  QuizIntegrityEventsResult,
} from '../lib/quizzes'

interface QuizResultsProps {
  quizId: string
  ownerId: string
}

interface QuestionAggregate {
  id: string
  prompt: string
  choices: string[]
  correctIndex: number
  attempts: number
  correctCount: number
}

type ReviewState =
  | { status: 'loading'; uid: string }
  | { status: 'loaded'; uid: string; value: QuizIntegrityEventsResult }
  | { status: 'error'; uid: string; message: string }
  | null

function isAttempt(value: unknown): value is QuizAttemptResult {
  return typeof value === 'object' && value !== null &&
    typeof (value as { uid?: unknown }).uid === 'string' &&
    typeof (value as { nickname?: unknown }).nickname === 'string' &&
    typeof (value as { score?: number }).score === 'number' &&
    Array.isArray((value as { breakdown?: unknown }).breakdown)
}

function formatDateTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > 8_640_000_000_000_000) return 'Invalid timestamp'
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
  } catch {
    return 'Invalid timestamp'
  }
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${milliseconds} ms`
  const seconds = milliseconds / 1_000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 && !Number.isInteger(seconds) ? 1 : 0)} s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return remainingSeconds === 0 ? `${minutes} min` : `${minutes} min ${remainingSeconds} s`
}

function eventLabel(type: QuizIntegrityEventRecord['type']): string {
  switch (type) {
    case 'page-hidden': return 'Page attention interrupted'
    case 'fullscreen-ended': return 'Fullscreen ended'
    case 'connection-interrupted': return 'Connection interrupted'
    case 'session-replaced': return 'Quiz session replaced'
    case 'monitoring-limited': return 'Monitoring was limited'
  }
}

function eventIcon(type: QuizIntegrityEventRecord['type']) {
  if (type === 'connection-interrupted') return WifiOff
  if (type === 'fullscreen-ended') return ShieldCheck
  if (type === 'page-hidden') return Clock3
  if (type === 'session-replaced') return Radio
  return Info
}

/** Teacher-only roster with score aggregates and opt-in, on-demand Integrity Mode signal review. */
export default function QuizResults({ quizId, ownerId }: QuizResultsProps) {
  const [title, setTitle] = useState('')
  const [integrityMode, setIntegrityMode] = useState(false)
  const [attempts, setAttempts] = useState<QuizAttemptResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [review, setReview] = useState<ReviewState>(null)
  const reviewRequestRef = useRef(0)

  useEffect(() => {
    let active = true
    void (async () => {
      const quiz = (await get(ref(database, `quizzes/${quizId}`))).val() as
        | {
            ownerId?: unknown
            title?: unknown
            questions?: Record<string, { prompt?: unknown; choices?: unknown }>
            integrity?: { enabled?: unknown; noticeVersion?: unknown; authorityAcknowledgedAt?: unknown }
          }
        | null
      if (!active) return
      if (quiz === null || typeof quiz !== 'object' || quiz.ownerId !== ownerId) {
        setError('This quiz does not exist or is not yours.')
        setLoading(false)
        return
      }
      setTitle(typeof quiz.title === 'string' ? quiz.title : 'Quiz')
      setIntegrityMode(
        quiz.integrity?.enabled === true &&
        quiz.integrity.noticeVersion === 'quiz-integrity-v1' &&
        typeof quiz.integrity.authorityAcknowledgedAt === 'number',
      )
      const attemptValue: unknown = (await get(ref(database, `quizAttempts/${quizId}`))).val() as unknown
      if (!active) return
      const list = typeof attemptValue === 'object' && attemptValue !== null
        ? Object.values(attemptValue).filter(isAttempt).sort((left, right) => right.gradedAt - left.gradedAt)
        : []
      setAttempts(list)
      setLoading(false)
    })().catch(() => { if (active) { setError('Results could not be loaded.'); setLoading(false) } })
    return () => { active = false }
  }, [quizId, ownerId])

  const aggregates = useMemo<QuestionAggregate[]>(() => {
    const first = attempts[0]
    if (!first) return []
    return first.breakdown.map((question, questionIndex) => {
      const correctCount = attempts.filter((attempt) => attempt.breakdown[questionIndex]?.correct).length
      const choices = attempts[0]?.breakdown[questionIndex]?.choices ?? question.choices
      return { id: question.id, prompt: question.prompt, choices, correctIndex: question.correctIndex, attempts: attempts.length, correctCount }
    })
  }, [attempts])

  const averageScore = attempts.length ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length) : 0
  const showIntegrityReview = integrityMode || attempts.some((attempt) => attempt.integritySummary !== undefined)
  const selectedAttempt = review ? attempts.find((attempt) => attempt.uid === review.uid) : undefined

  const loadReview = async (uid: string): Promise<void> => {
    if (review?.status === 'loading') return
    if (review?.uid === uid && review.status === 'loaded') {
      reviewRequestRef.current += 1
      setReview(null)
      return
    }
    const requestId = reviewRequestRef.current + 1
    reviewRequestRef.current = requestId
    setReview({ status: 'loading', uid })
    try {
      const value = await getQuizIntegrityEvents(quizId, uid)
      if (reviewRequestRef.current === requestId) setReview({ status: 'loaded', uid, value })
    } catch (cause: unknown) {
      if (reviewRequestRef.current !== requestId) return
      setReview({
        status: 'error',
        uid,
        message: cause instanceof Error ? cause.message : 'This signal log is unavailable.',
      })
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      {error && <div role="alert" className="alert alert-error mb-6"><span>{error}</span></div>}
      {loading ? (
        <div className="grid min-h-[40vh] place-items-center"><span className="loading loading-spinner loading-lg" /></div>
      ) : error ? (
        <section className="rounded-3xl border border-base-300 bg-base-100 p-8 text-center shadow-xl"><p>{error}</p><Link to="/quiz" className="btn btn-primary mt-4">Back to quiz hub</Link></section>
      ) : (
        <section aria-labelledby="quiz-results-title" className="rounded-3xl border border-primary/20 bg-base-100 p-6 shadow-xl sm:p-9">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge badge-primary gap-1"><UsersRound size={13} /> Quiz results</span>
            {integrityMode && <span className="badge badge-info gap-1"><ShieldCheck size={13} aria-hidden="true" /> Integrity Mode</span>}
          </div>
          <h1 id="quiz-results-title" className="mt-4 text-3xl font-black">{title}</h1>
          <p className="mt-2 text-base-content/60">
            {attempts.length === 1 ? '1 attempt so far' : `${attempts.length} attempts so far`}{attempts.length > 0 && <> · average score {averageScore}%</>}.
            {showIntegrityReview ? ' Scores and limited technical-signal summaries are shown separately.' : ' Attempts show nicknames and scores only.'}
          </p>

          {attempts.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-base-300 bg-base-200/40 p-6 text-center text-base-content/60">
              No one has taken this quiz yet. Share the code with your class.
            </div>
          ) : (
            <>
              <div className="mt-6 overflow-x-auto">
                <table className="table table-zebra">
                  <thead>
                    <tr>
                      <th>Student</th><th>Score</th><th>Correct</th><th>Graded</th>
                      {showIntegrityReview && <th>Review signals</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((attempt) => {
                      const summary = attempt.integritySummary
                      const reviewOpen = review?.uid === attempt.uid
                      return (
                        <tr key={attempt.uid}>
                          <td className="font-semibold">{attempt.nickname}</td>
                          <td><span className={`badge ${attempt.passed ? 'badge-success' : 'badge-warning'}`}>{attempt.score}%</span></td>
                          <td>{attempt.correctCount}/{attempt.questionCount}</td>
                          <td className="text-base-content/60">{formatDateTime(attempt.gradedAt)}</td>
                          {showIntegrityReview && (
                            <td>
                              {summary ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm text-base-content/65">
                                    {summary.eventCount === 0 ? 'No recorded signals' : `${summary.eventCount} recorded ${summary.eventCount === 1 ? 'signal' : 'signals'}`}
                                    {summary.monitoringLimited ? ' · monitoring limited' : ''}
                                  </span>
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-xs"
                                    aria-expanded={reviewOpen}
                                    aria-controls="integrity-review-panel"
                                    onClick={() => void loadReview(attempt.uid)}
                                    disabled={review?.status === 'loading'}
                                  >
                                    {reviewOpen && review?.status === 'loading' && <span className="loading loading-spinner loading-xs" />}
                                    {reviewOpen && review?.status === 'loaded' ? 'Close' : 'Review'}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-sm text-base-content/45">Not available for this attempt</span>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {showIntegrityReview && review && selectedAttempt && (
                <aside id="integrity-review-panel" aria-labelledby="integrity-review-title" className="mt-5 rounded-2xl border border-info/30 bg-info/5 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={18} className="text-info" aria-hidden="true" />
                        <h2 id="integrity-review-title" className="text-lg font-black">Signal review · {selectedAttempt.nickname}</h2>
                      </div>
                      <p className="mt-2 max-w-3xl text-sm text-base-content/70">
                        These are limited technical signals with possible innocent causes. They are not evidence by themselves and never change the score.
                      </p>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { reviewRequestRef.current += 1; setReview(null) }}>Close</button>
                  </div>

                  {review.status === 'loading' ? (
                    <div role="status" className="mt-5 flex items-center gap-2 text-sm"><span className="loading loading-spinner loading-sm" /> Loading signal log…</div>
                  ) : review.status === 'error' ? (
                    <div role="alert" className="alert alert-warning mt-5">
                      <AlertTriangle size={18} aria-hidden="true" />
                      <div><div className="font-semibold">Signal log unavailable</div><div className="text-sm">{review.message}</div></div>
                      <button type="button" className="btn btn-sm" onClick={() => void loadReview(review.uid)}>Try again</button>
                    </div>
                  ) : review.value.events.length === 0 ? (
                    <div className="mt-5 rounded-xl border border-base-300 bg-base-100 p-4">
                      <p className="font-semibold">No technical signals were recorded.</p>
                      <p className="mt-1 text-sm text-base-content/60">
                        The log remains available until {formatDateTime(review.value.summary.deleteAfter)}.
                        {review.value.summary.monitoringLimited ? ' Monitoring was limited for this attempt.' : ''}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5">
                      <p className="text-sm text-base-content/60">
                        {review.value.summary.eventCount} recorded {review.value.summary.eventCount === 1 ? 'signal' : 'signals'} · deletion scheduled {formatDateTime(review.value.summary.deleteAfter)}
                        {review.value.summary.monitoringLimited ? ' · monitoring limited' : ''}
                      </p>
                      <ol className="mt-4 space-y-3">
                        {review.value.events.map((event) => {
                          const EventIcon = eventIcon(event.type)
                          return (
                            <li key={event.eventId} className="rounded-xl border border-base-300 bg-base-100 p-4">
                              <div className="flex items-start gap-3">
                                <EventIcon size={18} className="mt-0.5 shrink-0 text-info" aria-hidden="true" />
                                <div>
                                  <p className="font-semibold">{eventLabel(event.type)}</p>
                                  <p className="mt-1 text-sm text-base-content/60">
                                    Observed {formatDateTime(event.startedAt)}
                                    {event.durationMs > 0 ? ` · ${formatDuration(event.durationMs)}` : ''}
                                    {event.questionId ? ` · ${event.questionId.replace('q_', 'question ')}` : ''}
                                  </p>
                                  <p className="mt-1 text-xs text-base-content/45">Received {formatDateTime(event.receivedAt)}</p>
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ol>
                    </div>
                  )}
                </aside>
              )}

              <h2 className="mt-8 text-xl font-black">Question difficulty</h2>
              <ul className="mt-3 space-y-3">
                {aggregates.map((aggregate, index) => {
                  const percent = aggregate.attempts > 0 ? Math.round((aggregate.correctCount / aggregate.attempts) * 100) : 0
                  return (
                    <li key={aggregate.id} className="rounded-2xl border border-base-300 bg-base-200/40 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{index + 1}. {aggregate.prompt}</p>
                        <span className={`badge ${percent >= 70 ? 'badge-success' : percent >= 40 ? 'badge-warning' : 'badge-error'}`}>{percent}% correct</span>
                      </div>
                      <progress className={`progress mt-2 ${percent >= 70 ? 'progress-success' : percent >= 40 ? 'progress-warning' : 'progress-error'}`} value={percent} max={100} aria-label={`Question ${index + 1} correctness`} />
                      <p className="mt-1 text-xs text-base-content/50">Answer: <strong>{aggregate.choices[aggregate.correctIndex]}</strong> · {aggregate.correctCount}/{aggregate.attempts} correct — low numbers may signal a confusing question.</p>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          <div className="mt-8">
            <Link to="/quiz" className="btn btn-ghost gap-2"><ArrowLeft size={16} /> Back to quiz hub</Link>
          </div>
        </section>
      )}
    </main>
  )
}
