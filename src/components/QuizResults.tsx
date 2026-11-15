import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { get, ref } from 'firebase/database'
import { ArrowLeft, UsersRound } from 'lucide-react'
import { database } from '../lib/firebase'
import type { QuizAttemptResult } from '../lib/quizzes'

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

function isAttempt(value: unknown): value is QuizAttemptResult {
  return typeof value === 'object' && value !== null &&
    typeof (value as { uid?: unknown }).uid === 'string' &&
    typeof (value as { nickname?: unknown }).nickname === 'string' &&
    typeof (value as { score?: number }).score === 'number' &&
    Array.isArray((value as { breakdown?: unknown }).breakdown)
}

/** Teacher-only roster for one quiz: attempts plus per-question difficulty aggregates. */
export default function QuizResults({ quizId, ownerId }: QuizResultsProps) {
  const [title, setTitle] = useState('')
  const [attempts, setAttempts] = useState<QuizAttemptResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      const quiz = (await get(ref(database, `quizzes/${quizId}`))).val() as
        | { ownerId?: unknown; title?: unknown; questions?: Record<string, { prompt?: unknown; choices?: unknown }> } | null
      if (!active) return
      if (quiz === null || typeof quiz !== 'object' || quiz.ownerId !== ownerId) {
        setError('This quiz does not exist or is not yours.')
        setLoading(false)
        return
      }
      setTitle(typeof quiz.title === 'string' ? quiz.title : 'Quiz')
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

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      {error && <div role="alert" className="alert alert-error mb-6"><span>{error}</span></div>}
      {loading ? (
        <div className="grid min-h-[40vh] place-items-center"><span className="loading loading-spinner loading-lg" /></div>
      ) : error ? (
        <section className="rounded-3xl border border-base-300 bg-base-100 p-8 text-center shadow-xl"><p>{error}</p><Link to="/quiz" className="btn btn-primary mt-4">Back to quiz hub</Link></section>
      ) : (
        <section aria-labelledby="quiz-results-title" className="rounded-3xl border border-primary/20 bg-base-100 p-6 shadow-xl sm:p-9">
          <span className="badge badge-primary gap-1"><UsersRound size={13} /> Quiz results</span>
          <h1 id="quiz-results-title" className="mt-4 text-3xl font-black">{title}</h1>
          <p className="mt-2 text-base-content/60">
            {attempts.length === 1 ? '1 attempt so far' : `${attempts.length} attempts so far`}{attempts.length > 0 && <> · average score {averageScore}%</>}. Attempts show nicknames and scores only.
          </p>

          {attempts.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-base-300 bg-base-200/40 p-6 text-center text-base-content/60">
              No one has taken this quiz yet. Share the code with your class.
            </div>
          ) : (
            <>
              <div className="mt-6 overflow-x-auto">
                <table className="table table-zebra">
                  <thead><tr><th>Student</th><th>Score</th><th>Correct</th><th>Graded</th></tr></thead>
                  <tbody>
                    {attempts.map((attempt) => (
                      <tr key={attempt.uid}>
                        <td className="font-semibold">{attempt.nickname}</td>
                        <td><span className={`badge ${attempt.passed ? 'badge-success' : 'badge-warning'}`}>{attempt.score}%</span></td>
                        <td>{attempt.correctCount}/{attempt.questionCount}</td>
                        <td className="text-base-content/60">{new Date(attempt.gradedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

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
