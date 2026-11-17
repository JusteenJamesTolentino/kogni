import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Check, Info, RotateCcw, ShieldCheck, Trophy, X } from 'lucide-react'
import type { QuizAttemptResult, QuizIntegrityEventsResult, QuizRankStats } from '../lib/quizzes'
import { getQuizIntegrityEvents } from '../lib/quizzes'
import { rankFromStats } from '../lib/badges'

interface QuizResultViewProps {
  result: QuizAttemptResult
  stats?: QuizRankStats
  alreadyTaken?: boolean
}

/** Post-attempt screen: score, per-question review with correct answers, and rank progress. */
export default function QuizResultView({ result, stats, alreadyTaken = false }: QuizResultViewProps) {
  const rank = rankFromStats(stats ? { quizzesPassed: stats.quizzesPassed, currentStreak: stats.currentStreak, lifetimeAccuracy: stats.lifetimeAccuracy } : null)
  const [integrityLog, setIntegrityLog] = useState<QuizIntegrityEventsResult | null>(null)
  const [integrityLoading, setIntegrityLoading] = useState(false)
  const [integrityError, setIntegrityError] = useState('')

  const loadIntegrityLog = async (): Promise<void> => {
    if (integrityLoading || integrityLog) return
    setIntegrityLoading(true)
    setIntegrityError('')
    try {
      setIntegrityLog(await getQuizIntegrityEvents(result.quizId, result.uid))
    } catch (cause: unknown) {
      setIntegrityError(cause instanceof Error ? cause.message : 'Your signal log is unavailable.')
    } finally {
      setIntegrityLoading(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <section aria-labelledby="quiz-result-title" className="rounded-3xl border border-primary/20 bg-base-100 p-6 shadow-xl sm:p-9">
        <span className={`badge gap-1 ${result.passed ? 'badge-success' : 'badge-warning'}`}>
          {alreadyTaken ? <RotateCcw size={13} /> : <Trophy size={13} />}
          {alreadyTaken ? 'Attempt already used' : 'Attempt graded'}
        </span>
        <h1 id="quiz-result-title" className="mt-4 text-3xl font-black">{result.quizTitle || 'Quiz'}</h1>
        <div className="mt-5 flex flex-wrap gap-4">
          <div className="rounded-2xl border border-base-300 bg-base-200/40 px-6 py-4 text-center">
            <div className="text-4xl font-black tabular-nums">{result.score}%</div>
            <div className="text-xs font-semibold uppercase tracking-wider text-base-content/55">Score</div>
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-200/40 px-6 py-4 text-center">
            <div className="text-4xl font-black tabular-nums">{result.correctCount}/{result.questionCount}</div>
            <div className="text-xs font-semibold uppercase tracking-wider text-base-content/55">Correct</div>
          </div>
          {stats && (
            <div className="rounded-2xl border border-base-300 bg-base-200/40 px-6 py-4 text-center">
              <div className="text-4xl font-black">{rank === 'learner' ? '🌱' : rank === 'luminary' ? '🌟' : '🏅'}</div>
              <div className="text-xs font-semibold uppercase tracking-wider text-base-content/55">Rank: {rank}</div>
            </div>
          )}
        </div>
        <p className="mt-4 text-sm text-base-content/60">
          {result.passed ? 'Passed — nice work.' : 'Not passed this time (70% to pass).'} Each quiz allows exactly one attempt; quizzes never award XP and never touch review schedules.
        </p>

        {result.integritySummary && (
          <section aria-labelledby="student-integrity-summary" className="mt-6 rounded-2xl border border-info/30 bg-info/5 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck size={18} className="text-info" aria-hidden="true" />
              <h2 id="student-integrity-summary" className="font-black">Your Integrity Mode summary</h2>
            </div>
            <p className="mt-2 text-sm text-base-content/70">
              {result.integritySummary.eventCount === 0
                ? 'No limited technical signals were recorded.'
                : `${result.integritySummary.eventCount} limited technical ${result.integritySummary.eventCount === 1 ? 'signal was' : 'signals were'} recorded.`}
              {result.integritySummary.monitoringLimited ? ' Monitoring was limited for part or all of this attempt.' : ''}
            </p>
            <div className="mt-3 flex items-start gap-2 text-sm text-base-content/60">
              <CalendarClock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>These records are available until {new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' }).format(result.integritySummary.deleteAfter)} and are then scheduled for deletion.</span>
            </div>
            <div className="mt-3 flex items-start gap-2 text-xs text-base-content/55">
              <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>These signals provide technical context only, are not evidence by themselves, and never changed your score.</span>
            </div>
            <div className="mt-4">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => void loadIntegrityLog()} disabled={integrityLoading}>
                {integrityLoading && <span className="loading loading-spinner loading-xs" />}
                {integrityLog ? 'Activity log loaded' : 'View my activity log'}
              </button>
              {integrityError && <p className="mt-2 text-sm text-warning" role="alert">Activity log unavailable: {integrityError}</p>}
              {integrityLog && (
                integrityLog.events.length === 0 ? (
                  <p className="mt-3 text-sm text-base-content/60">No technical signals were recorded. This does not verify activity outside Kogni.</p>
                ) : (
                  <ol className="mt-3 space-y-2 text-sm">
                    {integrityLog.events.map((event) => (
                      <li key={event.eventId} className="rounded-xl border border-base-300 bg-base-100 p-3">
                        <strong>{event.type.replaceAll('-', ' ')}</strong>
                        <span className="ml-2 text-base-content/55">{new Date(event.receivedAt).toLocaleString()}</span>
                      </li>
                    ))}
                  </ol>
                )
              )}
            </div>
          </section>
        )}

        <h2 className="mt-8 text-xl font-black">Review</h2>
        <ol className="mt-3 space-y-3">
          {result.breakdown.map((question, index) => (
            <li key={question.id} className={`rounded-2xl border p-4 ${question.correct ? 'border-success/40 bg-success/5' : 'border-error/40 bg-error/5'}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{index + 1}. {question.prompt}</p>
                {question.correct ? <Check size={18} className="shrink-0 text-success" aria-label="Correct" /> : <X size={18} className="shrink-0 text-error" aria-label="Incorrect" />}
              </div>
              <p className="mt-2 text-sm">
                {question.chosenIndex >= 0
                  ? <>Your answer: <strong className={question.correct ? 'text-success' : 'text-error'}>{question.choices[question.chosenIndex]}</strong></>
                  : <span className="text-error">No answer recorded (time ran out).</span>}
              </p>
              {!question.correct && <p className="mt-1 text-sm">Correct answer: <strong className="text-success">{question.choices[question.correctIndex]}</strong></p>}
            </li>
          ))}
        </ol>

        <div className="mt-8">
          <Link to="/quiz" className="btn btn-primary">Back to quiz hub</Link>
        </div>
      </section>
    </main>
  )
}
