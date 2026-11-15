import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock, Hourglass, TimerReset } from 'lucide-react'
import { QUIZ_TIME_LIMIT_SECONDS } from '../../app/api/_lib/quiz-grading'
import { submitQuizAttempt } from '../lib/quizzes'
import type { QuizAttemptResult, QuizContentView, QuizRankStats } from '../lib/quizzes'
import type { User } from 'firebase/auth'

interface QuizTakingProps {
  user: User
  quiz: QuizContentView
  code: string
  onFinished: (result: QuizAttemptResult, stats?: QuizRankStats) => void
  onExit: () => void
}

const LETTERS = 'ABCDEFG'.split('')

/** One graded attempt; each question is hard-limited to 30 seconds — timeout records no answer. */
export default function QuizTaking({ user, quiz, code, onFinished, onExit }: QuizTakingProps) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [secondsLeft, setSecondsLeft] = useState(QUIZ_TIME_LIMIT_SECONDS)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const advancingRef = useRef(false)

  const question = quiz.questions[index]

  const advance = useCallback((chosenIndex: number) => {
    if (advancingRef.current) return
    advancingRef.current = true
    setAnswers((current) => ({ ...current, [quiz.questions[index]!.id]: chosenIndex }))
    if (index + 1 >= quiz.questions.length) {
      setSubmitting(true)
      // Final answer recorded — submit through the callback that has the final map.
      void (async () => {
        try {
          const finalAnswers = { ...answers, [quiz.questions[index]!.id]: chosenIndex }
          const response = await submitQuizAttempt(quiz.quizId, finalAnswers)
          if (response.status === 'rejected') {
            setSubmitting(false)
            advancingRef.current = false
            setError('You created this quiz — teachers cannot take their own quiz.')
            return
          }
          onFinished(response.result, response.stats)
        } catch (cause: unknown) {
          setSubmitting(false)
          advancingRef.current = false
          setError(cause instanceof Error ? cause.message : 'The quiz could not be submitted.')
        }
      })()
    } else {
      setIndex((current) => current + 1)
      setSecondsLeft(QUIZ_TIME_LIMIT_SECONDS)
      advancingRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, index, onFinished, quiz.questions, quiz.quizId])

  // Hard per-question timer: on expiry the question is recorded as unanswered.
  useEffect(() => {
    if (submitting) return
    const timer = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          clearInterval(timer)
          advance(-1)
          return 0
        }
        return current - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [advance, index, submitting])

  if (submitting) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="rounded-3xl border border-primary/20 bg-base-100 p-8 shadow-xl text-center" aria-live="polite">
          <span className="loading loading-spinner loading-lg text-primary" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-black">Grading your attempt…</h2>
          <p className="mt-1 text-sm text-base-content/60">One moment — your one attempt for {quiz.title} is being recorded.</p>
        </section>
      </main>
    )
  }

  const urgent = secondsLeft <= 5

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      {error && <div role="alert" className="alert alert-error mb-6"><span>{error}</span></div>}
      <section aria-labelledby="quiz-taking-title" className="rounded-3xl border border-primary/20 bg-base-100 p-6 shadow-xl sm:p-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="badge badge-primary gap-1"><Hourglass size={13} /> {quiz.title}</span>
          <span className={`flex items-center gap-2 font-black tabular-nums ${urgent ? 'text-error' : 'text-base-content/70'}`} aria-live="off">
            <Clock size={18} className={urgent ? 'animate-pulse' : ''} aria-hidden="true" />
            {secondsLeft}s
          </span>
        </div>
        <progress className={`progress mt-3 ${urgent ? 'progress-error' : 'progress-primary'}`} value={QUIZ_TIME_LIMIT_SECONDS - secondsLeft} max={QUIZ_TIME_LIMIT_SECONDS} aria-label="Time used on this question" />

        <h2 id="quiz-taking-title" className="mt-6 text-2xl font-black leading-snug">{question.prompt}</h2>
        <p className="mt-1 text-xs text-base-content/50">Question {index + 1} of {quiz.questions.length} · answering moves on instantly · timeout records no answer</p>

        <div className="mt-6 grid gap-3">
          {question.choices.map((choice, choiceIndex) => (
            <button
              key={`${question.id}-${choiceIndex}`}
              type="button"
              onClick={() => advance(choiceIndex)}
              disabled={submitting}
              className="btn h-auto min-h-12 justify-start gap-3 whitespace-normal border-base-300 bg-base-200/50 px-4 py-3 text-left hover:btn-primary"
            >
              <span className="badge badge-ghost">{LETTERS[choiceIndex] ?? choiceIndex + 1}</span>
              <span className="leading-snug">{choice}</span>
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between text-xs text-base-content/50">
          <span><TimerReset size={13} className="inline" aria-hidden="true" /> One attempt per quiz — it is recorded when the last question is answered or times out.</span>
          <button type="button" onClick={onExit} className="link" disabled={submitting}>Leave quiz</button>
        </div>
      </section>
    </main>
  )
}
