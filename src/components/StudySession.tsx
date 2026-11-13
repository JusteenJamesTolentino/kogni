import { useEffect, useId, useMemo, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, BookOpenText, Brain, Check, Eye, Sparkles, X } from 'lucide-react'
import { awardReviewXp } from '../lib/leaderboard'
import { getErrorMessage } from '../lib/errors'
import { shuffle } from '../lib/shuffle'
import { useAuth } from '../context/AuthContext'
import type { StudyCard, StudyDeck } from '../types/domain'

type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5

interface Rating {
  quality: ReviewQuality
  label: string
  hint: string
  className: string
}

export type StudySessionMode = 'scheduled' | 'practice'

export interface OnlinePartCompletion {
  partNumber: number
  /** Must be exactly 30 distinct rated questions before continuation is offered. */
  ratedDistinctCount: number
  nextPartNumber: number
  nextPartAvailable: boolean
  unavailableMessage?: string
  onContinueToNextPart?: (nextPartNumber: number) => void | Promise<void>
}

export interface StudySessionProps {
  cards: StudyCard[]
  deck: StudyDeck | null
  mode: StudySessionMode
  onExit: () => void
  onFinished: () => void | Promise<void>
  onGenerateAnother: () => void | Promise<void>
  onSaveReview?: (card: StudyCard, quality: ReviewQuality) => Promise<void>
  onCardRated?: (cardId: string, quality: ReviewQuality) => void | Promise<void>
  onlinePartCompletion?: OnlinePartCompletion
}

const ratings: Rating[] = [
  { quality: 0, label: 'Blank', hint: 'No recall', className: 'btn-error' },
  { quality: 1, label: 'Wrong', hint: 'Incorrect', className: 'btn-error' },
  { quality: 2, label: 'Hard', hint: 'Barely', className: 'btn-warning' },
  { quality: 3, label: 'Okay', hint: 'With effort', className: 'btn-warning' },
  { quality: 4, label: 'Good', hint: 'Correct', className: 'btn-success' },
  { quality: 5, label: 'Easy', hint: 'Instant', className: 'btn-success' },
]

const getQuestion = (card: StudyCard): string => card.question || 'Untitled question'
const getAnswer = (card: StudyCard): string => card.answer || 'No answer was provided.'

function isReviewQuality(value: number): value is ReviewQuality {
  return Number.isInteger(value) && value >= 0 && value <= 5
}

function isShortcutBlocked(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return true
  const target = event.target
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'].includes(target.tagName)
}

export default function StudySession({ cards, deck, mode, onExit, onFinished, onGenerateAnother, onSaveReview, onCardRated, onlinePartCompletion }: StudySessionProps) {
  const { user } = useAuth()
  const isPractice = mode === 'practice'
  const onlinePartComplete = onlinePartCompletion?.ratedDistinctCount === 30
  const canContinueOnlinePart = Boolean(
    onlinePartCompletion
    && onlinePartComplete
    && onlinePartCompletion.nextPartAvailable
    && onlinePartCompletion.onContinueToNextPart,
  )
  const [phase, setPhase] = useState<'guide' | 'cards'>(() =>
    mode === 'practice' && Boolean(deck?.studyGuide) ? 'guide' : 'cards',
  )
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)
  const [sessionXp, setSessionXp] = useState(0)
  const questionHeadingRef = useRef<HTMLHeadingElement>(null)
  const currentStepRef = useRef<HTMLLIElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const sessionId = useId()
  const card = cards[index]
  const choices = useMemo<string[]>(() => {
    if (!card || card.distractors.length === 0) return []
    // The correct answer is always included; order is shuffled per card and stable while shown.
    return shuffle([getAnswer(card), ...card.distractors.filter(Boolean)])
  }, [card])
  const progress = cards.length ? ((index + (revealed ? 0.5 : 0)) / cards.length) * 100 : 0

  const handleRate = async (quality: ReviewQuality): Promise<void> => {
    if (!card || saving) return
    setSaving(true)
    setError('')

    try {
      if (!isPractice) {
        if (!onSaveReview) throw new Error('Cloud review persistence is unavailable. Start this session again.')
        await onSaveReview(card, quality)
        const eventId = `${sessionId}-${card.id}`

        try {
          if (user) {
            // The cloud leaderboard is the only XP ledger; Dashboard/Profile read it live.
            const award = await awardReviewXp(user, eventId, quality, deck?.lineageId || deck?.id)
            const earnedXp = award?.awarded ? Number(award.xpAwarded || 0) : 0
            if (earnedXp > 0) setSessionXp((previous) => previous + earnedXp)
          }
        } catch {
          // Saving study progress is more important than optional leaderboard XP
        }
      }

      await onCardRated?.(card.id, quality)

      if (index >= cards.length - 1) {
        setComplete(true)
        if (!shouldReduceMotion) {
          void confetti({ particleCount: 120, spread: 80, origin: { y: 0.7 }, colors: ['#7c3aed', '#22c55e', '#f59e0b'] })
        }
      } else {
        setIndex((previous) => previous + 1)
        setRevealed(false)
        setSelectedChoice(null)
      }
    } catch (reviewError: unknown) {
      setError(getErrorMessage(reviewError, 'Your rating could not be saved. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isShortcutBlocked(event)) return
      if (phase === 'guide') {
        if (event.key === 'Escape') onExit()
        return
      }
      if (event.key === ' ' && card && !revealed && !choices.length) {
        event.preventDefault()
        setRevealed(true)
      }
      if (revealed && /^[0-5]$/.test(event.key)) {
        const quality = Number(event.key)
        if (isReviewQuality(quality)) void handleRate(quality)
      }
      if (event.key === 'Escape') onExit()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  useEffect(() => {
    if (phase !== 'cards' || complete || !card) return
    const frame = window.requestAnimationFrame(() => {
      questionHeadingRef.current?.focus({ preventScroll: true })
      currentStepRef.current?.scrollIntoView({
        behavior: shouldReduceMotion ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [card, complete, index, phase, shouldReduceMotion])

  const revealChoice = (choice: string): void => {
    if (revealed) return
    setSelectedChoice(choice)
    setRevealed(true)
  }

  if (phase === 'guide' && deck?.studyGuide) {
    return (
      <main className="mx-auto grid min-h-[80vh] w-full max-w-4xl place-items-center px-4 py-8 sm:px-6">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full overflow-hidden rounded-3xl border border-primary/20 bg-base-100 shadow-2xl">
          <div className="border-b border-base-300 bg-gradient-to-br from-primary/15 via-base-100 to-secondary/10 p-6 sm:p-9">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><BookOpenText size={24} aria-hidden="true" /></div>
              <div className="min-w-0">
                <div className="badge badge-primary badge-outline">Learn before you answer</div>
                <h1 className="mt-3 text-3xl font-black tracking-tight">{deck.title}</h1>
                {deck.description && <p className="mt-2 text-base-content/60">{deck.description}</p>}
              </div>
            </div>
          </div>
          <div className="p-6 sm:p-9">
            <div className="max-h-[52vh] overflow-y-auto whitespace-pre-wrap pr-2 leading-relaxed text-base-content/80" aria-label="Study guide">{deck.studyGuide}</div>
            <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={onExit} className="btn btn-ghost">Back to deck</button>
              <button type="button" onClick={() => setPhase('cards')} className="btn btn-primary gap-2">
                Begin questions
                <Sparkles size={17} aria-hidden="true" />
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-base-content/45">Practice will not change your schedule or XP.</p>
          </div>
        </motion.section>
      </main>
    )
  }

  if (!cards.length) {
    return (
      <main className="grid min-h-[70vh] place-items-center px-4">
        <div className="max-w-md text-center">
          <Brain size={42} className="mx-auto text-base-content/30" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-bold">Nothing to review yet</h1>
          <p className="mt-2 text-base-content/60">
            {isPractice
              ? 'This deck has no cards available to practice.'
              : 'This deck has no cards, or all reviews are complete for today.'}
          </p>
          <button type="button" onClick={onExit} className="btn btn-primary mt-5">{deck ? 'Back to deck' : 'Back to dashboard'}</button>
        </div>
      </main>
    )
  }

  if (complete) {
    return (
      <main className="grid min-h-[75vh] place-items-center px-4 py-12">
        <motion.section initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="card w-full max-w-lg border border-base-300 bg-base-100 text-center shadow-2xl">
          <div className="card-body items-center p-8 sm:p-12">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-success/15 text-success"><Check size={40} strokeWidth={3} aria-hidden="true" /></div>
            <div className={`badge mt-2 gap-1 ${isPractice ? 'badge-secondary badge-outline' : 'badge-success badge-outline'}`}><Sparkles size={13} aria-hidden="true" /> {isPractice ? 'Practice complete' : 'Review complete'}</div>
            <h1 className="mt-1 text-3xl font-black">Excellent work</h1>
            <p className="text-base-content/60">
              {onlinePartCompletion
                ? onlinePartComplete
                  ? `You rated all 30 distinct questions in Part ${onlinePartCompletion.partNumber}.`
                  : `Part ${onlinePartCompletion.partNumber} is complete, but ${onlinePartCompletion.ratedDistinctCount} of 30 distinct questions were rated.`
                : isPractice
                  ? `You practiced all ${cards.length} cards. Your schedule and XP were not changed.`
                  : `You reviewed all ${cards.length} cards and earned ${sessionXp} XP. Come back when the next cards are due.`}
            </p>
            {onlinePartCompletion && onlinePartComplete && !onlinePartCompletion.nextPartAvailable && (
              <div role="status" className="alert mt-2 text-left">
                <span>{onlinePartCompletion.unavailableMessage || `Part ${onlinePartCompletion.nextPartNumber} is not available yet. The creator must publish it before you can continue.`}</span>
              </div>
            )}
            {onlinePartCompletion && !onlinePartComplete && (
              <div role="alert" className="alert alert-warning mt-2 text-left">
                <span>Continue is unavailable until exactly 30 distinct questions have been rated.</span>
              </div>
            )}
            <div className={`card-actions mt-4 grid w-full gap-2 ${onlinePartCompletion ? 'sm:grid-cols-2' : 'sm:grid-cols-2'}`}>
              {onlinePartCompletion ? (
                <button
                  type="button"
                  onClick={() => void onlinePartCompletion.onContinueToNextPart?.(onlinePartCompletion.nextPartNumber)}
                  className="btn btn-primary w-full"
                  disabled={!canContinueOnlinePart}
                >
                  Continue to Part {onlinePartCompletion.nextPartNumber}
                </button>
              ) : (
                <button type="button" onClick={() => void onGenerateAnother()} className="btn btn-primary w-full">Generate another deck</button>
              )}
              <button type="button" onClick={() => void onFinished()} className="btn btn-outline w-full">{deck ? 'Return to deck' : 'Return to dashboard'}</button>
            </div>
            <p className="mt-2 text-xs text-base-content/50">
              {onlinePartCompletion
                ? 'Parts never generate automatically. Only the creator can generate and publish a continuation.'
                : 'You’ll need to choose a new PDF or image source file.'}
            </p>
          </div>
        </motion.section>
      </main>
    )
  }

  if (!card) return null

  const correctAnswer = getAnswer(card)
  const choiceCorrect = selectedChoice !== null && selectedChoice === correctAnswer

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-5 flex items-start gap-2 sm:items-center sm:gap-3">
        <button type="button" onClick={onExit} className="btn btn-ghost btn-circle btn-sm" aria-label="Exit study session"><ArrowLeft size={19} aria-hidden="true" /></button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-base-content/55">
            <span className="truncate">{deck?.title || (isPractice ? 'Practice session' : 'Due cards')}</span>
            <span className="flex shrink-0 items-center gap-2">
              {isPractice && <span className="badge badge-secondary badge-outline badge-xs hidden sm:inline-flex">Practice · no progress saved</span>}
              <span>{index + 1} / {cards.length}</span>
            </span>
          </div>
          {isPractice && (
            <div className="mt-1.5 sm:hidden">
              <span className="badge badge-secondary badge-outline badge-xs">Practice · no progress saved</span>
            </div>
          )}
          <progress className="progress progress-primary mt-2 h-2 w-full" value={progress} max="100" aria-label={`${Math.round(progress)} percent complete`} />
        </div>
        <button type="button" onClick={onExit} className="btn btn-ghost btn-circle btn-sm hidden sm:inline-flex" aria-label="Close study session"><X size={19} aria-hidden="true" /></button>
      </header>

      <nav className="study-steps-scroll mb-5 overflow-x-auto pb-2" aria-label="Question progress">
        <ol className="steps steps-horizontal min-w-max" role="list">
          {cards.map((stepCard, stepIndex) => {
            const state = stepIndex < index ? 'completed' : stepIndex === index ? 'current' : 'future'
            return (
              <li
                key={`${stepCard.id}-${stepIndex}`}
                ref={state === 'current' ? currentStepRef : undefined}
                className={`step min-w-10 ${state !== 'future' ? 'step-primary' : ''}`}
                aria-current={state === 'current' ? 'step' : undefined}
                aria-label={`Question ${stepIndex + 1}, ${state}`}
              >
                <span aria-hidden="true" className="text-[0.65rem] font-semibold text-base-content/60">{stepIndex + 1}</span>
              </li>
            )
          })}
        </ol>
      </nav>

      <section aria-live="polite" aria-atomic="true">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${card.id}-${index}`}
            initial={shouldReduceMotion ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, x: -24 }}
          >
            <div className="card min-h-[22rem] overflow-hidden border border-base-300 bg-base-100 shadow-xl sm:min-h-[25rem]">
              <motion.div
                className="card-body justify-center p-6 text-center sm:p-10"
                animate={shouldReduceMotion ? undefined : { rotateY: revealed ? 180 : 0 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.45 }}
                style={{ transformStyle: shouldReduceMotion ? undefined : 'preserve-3d' }}
              >
                <div style={{ transform: revealed && !shouldReduceMotion ? 'rotateY(180deg)' : 'none' }}>
                  <div className={`badge mb-5 ${revealed ? 'badge-secondary badge-outline' : 'badge-primary badge-outline'}`}>{revealed ? 'Answer' : 'Question'}</div>
                  {!revealed ? (
                    <>
                      <h1 ref={questionHeadingRef} tabIndex={-1} className="mx-auto max-w-2xl rounded-lg text-2xl font-bold leading-snug outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-3xl">{getQuestion(card)}</h1>
                      {choices.length > 0 ? (
                        <div className="mx-auto mt-8 grid w-full max-w-xl gap-3 sm:grid-cols-2">
                          {choices.map((choice, choiceIndex) => (
                            <button
                              key={`${choice}-${choiceIndex}`}
                              type="button"
                              onClick={() => revealChoice(choice)}
                              className="btn h-auto min-h-12 grid grid-cols-[auto_minmax(0,1fr)] items-center justify-start gap-x-3 whitespace-normal border-base-300 bg-base-200/50 px-4 py-3 text-left hover:btn-primary"
                            >
                              <span className="badge badge-ghost badge-sm justify-self-center">{String.fromCharCode(65 + choiceIndex)}</span>
                              <span className="leading-snug">{choice}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button type="button" onClick={() => setRevealed(true)} className="btn btn-primary mt-9 gap-2"><Eye size={18} aria-hidden="true" /> Reveal answer</button>
                      )}
                    </>
                  ) : (
                    <>
                      {selectedChoice !== null && <div className={`badge mb-4 gap-1 ${choiceCorrect ? 'badge-success' : 'badge-error'}`}>{choiceCorrect ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}{choiceCorrect ? 'Correct choice' : 'Not quite'}</div>}
                      <p className="mx-auto max-w-2xl text-2xl font-bold leading-relaxed sm:text-3xl">{getAnswer(card)}</p>
                    </>
                  )}
                </div>
              </motion.div>
            </div>

            {error && <div role="alert" className="alert alert-error mt-4"><span>{error}</span></div>}

            <AnimatePresence>
              {revealed && (
                <motion.div initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={shouldReduceMotion ? { duration: 0 } : undefined} className="mt-5 rounded-2xl border border-base-300 bg-base-100 p-4 sm:p-5">
                  {choices.length > 0 ? (
                    // A picked choice already shows correct/wrong, so skip the self-rating step:
                    // record it (correct → good, wrong → needs review) and move straight on.
                    <div className="flex flex-col items-center gap-2">
                      <button type="button" onClick={() => void handleRate(choiceCorrect ? 4 : 1)} disabled={saving} className="btn btn-primary min-w-44 gap-2">
                        {saving && <span className="loading loading-spinner loading-sm" aria-hidden="true" />}
                        Next question
                      </button>
                      {saving && !isPractice && <p className="text-xs text-base-content/55">Saving progress…</p>}
                    </div>
                  ) : (
                    <>
                      <p className="mb-3 text-center text-sm font-semibold">{isPractice ? 'How did that feel?' : 'How well did you know it?'}</p>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {ratings.map((rating) => (
                          <button key={rating.quality} type="button" onClick={() => void handleRate(rating.quality)} disabled={saving} className={`btn h-auto min-h-14 flex-col gap-0 px-1 py-2 ${rating.className} btn-outline`} aria-label={`Rate ${rating.quality}: ${rating.label}, ${rating.hint}`}>
                            <span className="text-sm font-bold">{rating.label}</span><span className="text-[0.6rem] font-normal opacity-70">{rating.quality} · {rating.hint}</span>
                          </button>
                        ))}
                      </div>
                      {saving && !isPractice && <div className="mt-3 flex items-center justify-center gap-2 text-xs text-base-content/55"><span className="loading loading-spinner loading-xs" /> Saving progress…</div>}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>
      </section>

      <div className="mt-4 hidden justify-center gap-4 text-xs text-base-content/40 sm:flex">
        {!revealed ? <span>Press <kbd className="kbd kbd-xs">space</kbd> to reveal</span> : <span>Press <kbd className="kbd kbd-xs">0</kbd>–<kbd className="kbd kbd-xs">5</kbd> to rate</span>}
        <span><kbd className="kbd kbd-xs">esc</kbd> to exit</span>
      </div>
    </main>
  )
}
