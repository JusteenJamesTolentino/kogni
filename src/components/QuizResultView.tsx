import { Link } from 'react-router-dom'
import { Check, RotateCcw, Trophy, X } from 'lucide-react'
import type { QuizAttemptResult, QuizRankStats } from '../lib/quizzes'
import { rankFromStats } from '../lib/badges'

interface QuizResultViewProps {
  result: QuizAttemptResult
  stats?: QuizRankStats
  alreadyTaken?: boolean
}

/** Post-attempt screen: score, per-question review with correct answers, and rank progress. */
export default function QuizResultView({ result, stats, alreadyTaken = false }: QuizResultViewProps) {
  const rank = rankFromStats(stats ? { quizzesPassed: stats.quizzesPassed, currentStreak: stats.currentStreak, lifetimeAccuracy: stats.lifetimeAccuracy } : null)

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
