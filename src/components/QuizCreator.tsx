import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { Check, Copy, ListChecks, Plus, ShieldCheck, Trash2, X } from 'lucide-react'
import {
  QUIZ_INTEGRITY_NOTICE_VERSION,
  QUIZ_LIMITS,
  createQuiz,
} from '../lib/quizzes'
import type { CreatedQuiz, QuizDraftQuestion, QuizIntegrityPolicy } from '../lib/quizzes'

interface QuizCreatorProps {
  user: User
  onExit: () => void
}

function blankQuestion(): QuizDraftQuestion {
  return { prompt: '', choices: ['', ''], correctIndex: 0 }
}

function validateDraft(title: string, description: string, questions: QuizDraftQuestion[]): { title?: string; questions: Record<number, { prompt?: string; choices?: string; correct?: string }> } {
  const questionErrors: Record<number, { prompt?: string; choices?: string; correct?: string }> = {}
  questions.forEach((question, index) => {
    const errors: { prompt?: string; choices?: string; correct?: string } = {}
    if (!question.prompt.trim()) errors.prompt = 'Prompt is required.'
    else if (question.prompt.length > QUIZ_LIMITS.maxPromptLength) errors.prompt = `Use ${QUIZ_LIMITS.maxPromptLength.toLocaleString()} characters or fewer.`
    if (question.choices.some((choice) => !choice.trim())) errors.choices = 'Every choice needs text.'
    else if (new Set(question.choices.map((choice) => choice.trim().toLowerCase())).size !== question.choices.length) errors.choices = 'Choices must be different from each other.'
    if (question.correctIndex < 0 || question.correctIndex >= question.choices.length) errors.correct = 'Mark the correct answer.'
    if (Object.keys(errors).length > 0) questionErrors[index] = errors
  })
  return { title: title.trim() ? undefined : 'Quiz title is required.', questions: questionErrors }
}

export default function QuizCreator({ user, onExit }: QuizCreatorProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [questions, setQuestions] = useState<QuizDraftQuestion[]>([blankQuestion()])
  const [attemptedSave, setAttemptedSave] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<CreatedQuiz | null>(null)
  const [integrityEnabled, setIntegrityEnabled] = useState(false)
  const [authorityAcknowledged, setAuthorityAcknowledged] = useState(false)
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const copyResetTimerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current)
  }, [])

  const errors = validateDraft(title, description, questions)

  const showError = (value?: string): string | undefined => (attemptedSave ? value : undefined)

  const updateQuestion = (index: number, patch: Partial<QuizDraftQuestion>): void => {
    setQuestions((current) => current.map((question, questionIndex) => (questionIndex === index ? { ...question, ...patch } : question)))
  }

  const addQuestion = (): void => {
    if (questions.length >= QUIZ_LIMITS.maxQuestions) return
    setQuestions((current) => [...current, blankQuestion()])
  }

  const deleteQuestion = (index: number): void => {
    setQuestions((current) => (current.length <= QUIZ_LIMITS.minQuestions ? current : current.filter((_, questionIndex) => questionIndex !== index)))
  }

  const addChoice = (index: number): void => {
    const question = questions[index]
    if (!question || question.choices.length >= QUIZ_LIMITS.maxChoices) return
    updateQuestion(index, { choices: [...question.choices, ''] })
  }

  const removeChoice = (index: number, choiceIndex: number): void => {
    const question = questions[index]
    if (!question || question.choices.length <= QUIZ_LIMITS.minChoices) return
    const choices = question.choices.filter((_, itemIndex) => itemIndex !== choiceIndex)
    updateQuestion(index, { choices, correctIndex: Math.min(question.correctIndex, choices.length - 1) })
  }

  const save = async (): Promise<void> => {
    if (saving) return
    setAttemptedSave(true)
    if (!title.trim() || Object.keys(errors.questions).length > 0 || (integrityEnabled && !authorityAcknowledged)) return
    setSaving(true); setError('')
    try {
      const integrity: QuizIntegrityPolicy | undefined = integrityEnabled && authorityAcknowledged
        ? {
            enabled: true,
            noticeVersion: QUIZ_INTEGRITY_NOTICE_VERSION,
            authorityAcknowledgedAt: Date.now(),
          }
        : undefined
      const nextQuiz = integrity
        ? await createQuiz(user, title, description, questions, integrity)
        : await createQuiz(user, title, description, questions)
      setCreated(nextQuiz)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The quiz could not be created.')
    } finally {
      setSaving(false)
    }
  }

  const resetCreator = (): void => {
    setTitle('')
    setDescription('')
    setQuestions([blankQuestion()])
    setAttemptedSave(false)
    setSaving(false)
    setError('')
    setCreated(null)
    setIntegrityEnabled(false)
    setAuthorityAcknowledged(false)
    if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current)
    copyResetTimerRef.current = null
    setCopied(null)
  }

  const copy = async (kind: 'code' | 'link', value: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current)
      copyResetTimerRef.current = window.setTimeout(() => {
        copyResetTimerRef.current = null
        setCopied(null)
      }, 2000)
    } catch {
      setCopied(null)
    }
  }

  if (created) {
    const shareUrl = `${window.location.origin}/quiz?code=${created.code}`
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <section aria-labelledby="quiz-created-title" className="rounded-3xl border border-primary/20 bg-base-100 p-6 shadow-xl sm:p-9">
          <span className="badge badge-success gap-1"><Check size={13} /> Quiz published</span>
          <h1 id="quiz-created-title" className="mt-4 text-3xl font-black">{created.title}</h1>
          <p className="mt-2 text-base-content/60">
            Share the code or link with your class. Students enter it at <code>/quiz</code>. Each student gets one graded attempt; scores are visible only to you.
          </p>
          <div className={`mt-4 rounded-2xl border p-4 ${created.integrityMode ? 'border-info/30 bg-info/5' : 'border-base-300 bg-base-200/40'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck size={17} className={created.integrityMode ? 'text-info' : 'text-base-content/45'} aria-hidden="true" />
              <span className="font-semibold">Integrity Mode</span>
              <span className={`badge badge-sm ${created.integrityMode ? 'badge-info' : 'badge-ghost'}`}>
                {created.integrityMode ? 'On' : 'Off'}
              </span>
            </div>
            <p className="mt-1 text-xs text-base-content/60">
              {created.integrityMode
                ? 'Students receive the limitations notice before they choose how to start.'
                : 'This quiz uses the ordinary one-attempt flow without attention or fullscreen monitoring.'}
            </p>
          </div>
          <div className="mt-6 rounded-2xl border border-base-300 bg-base-200/50 p-5 text-center">
            <div className="text-xs font-semibold uppercase tracking-wider text-base-content/55">Quiz code</div>
            <div className="mt-1 font-mono text-4xl font-black tracking-[0.3em]">{created.code}</div>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-sm gap-2" onClick={() => void copy('code', created.code)}>
                {copied === 'code' ? <Check size={15} /> : <Copy size={15} />} {copied === 'code' ? 'Copied' : 'Copy code'}
              </button>
              <button type="button" className="btn btn-sm gap-2" onClick={() => void copy('link', shareUrl)}>
                {copied === 'link' ? <Check size={15} /> : <Copy size={15} />} {copied === 'link' ? 'Copied' : 'Copy link'}
              </button>
            </div>
            <div className="mt-3 break-all text-xs text-base-content/50">{shareUrl}</div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/quiz" className="btn btn-primary">Back to quiz hub</Link>
            <button type="button" className="btn btn-ghost" onClick={resetCreator}>Create another quiz</button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      {error && <div role="alert" className="alert alert-error mb-6"><span>{error}</span></div>}
      <section aria-labelledby="quiz-create-title" className="rounded-3xl border border-primary/20 bg-base-100 p-6 shadow-xl sm:p-9">
        <span className="badge badge-primary gap-1"><ListChecks size={13} /> New quiz</span>
        <h1 id="quiz-create-title" className="mt-4 text-3xl font-black">Create a quiz</h1>
        <p className="mt-2 text-base-content/60">
          Questions are timed (30 seconds each) and auto-graded. Quizzes never award XP and never touch review schedules.
        </p>

        <div className="mt-6 space-y-4">
          <label className="form-control">
            <span className="label-text mb-2 font-semibold">Quiz title <span className="text-error">*</span></span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={`input input-bordered ${showError(errors.title) ? 'input-error' : ''}`}
              maxLength={QUIZ_LIMITS.maxTitleLength + 1}
              placeholder="e.g. Biology — Cell Structure"
              disabled={saving}
            />
            {showError(errors.title) && <span className="mt-1 text-xs font-semibold text-error" role="alert">{errors.title}</span>}
          </label>
          <label className="form-control">
            <span className="label-text mb-2 font-semibold">Description <span className="text-base-content/45">(optional)</span></span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="textarea textarea-bordered min-h-20"
              maxLength={QUIZ_LIMITS.maxDescriptionLength + 1}
              placeholder="What this quiz covers"
              disabled={saving}
            />
          </label>
        </div>

        <section aria-labelledby="integrity-mode-title" className={`mt-7 rounded-2xl border p-5 ${integrityEnabled ? 'border-info/35 bg-info/5' : 'border-base-300 bg-base-200/40'}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <ShieldCheck size={19} className={integrityEnabled ? 'text-info' : 'text-base-content/45'} aria-hidden="true" />
                <h2 id="integrity-mode-title" className="font-black">Integrity Mode</h2>
                <span className="badge badge-ghost badge-sm">Optional</span>
              </div>
              <p className="mt-1 text-sm text-base-content/60">
                Adds a transparent, limited technical-signal review for this quiz. It is off by default.
              </p>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-info"
              checked={integrityEnabled}
              onChange={(event) => {
                setIntegrityEnabled(event.target.checked)
                if (!event.target.checked) setAuthorityAcknowledged(false)
              }}
              aria-label="Enable Integrity Mode"
              disabled={saving}
            />
          </div>

          {integrityEnabled && (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-info/25 bg-base-100 p-4 text-sm text-base-content/75">
                <p>
                  Integrity Mode requests fullscreen and records limited page-attention, fullscreen, connection, and replacement-session signals.
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-5">
                  <li>It cannot detect passive split view or activity on another screen or device.</li>
                  <li>It does not use a camera, microphone, screen recording, keystroke collection, or location.</li>
                  <li>Signals are context, not proof, and never affect a score or attempt automatically.</li>
                </ul>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-base-300 bg-base-100 p-4">
                <input
                  type="checkbox"
                  className="checkbox checkbox-info mt-0.5"
                  checked={authorityAcknowledged}
                  onChange={(event) => setAuthorityAcknowledged(event.target.checked)}
                  disabled={saving}
                  aria-describedby="integrity-authority-help"
                />
                <span>
                  <span className="font-semibold">I am authorized to use this feature with this class and will review events in context under school policy.</span>
                  <span id="integrity-authority-help" className="mt-1 block text-xs text-base-content/60">
                    Required before publishing with Integrity Mode.
                  </span>
                </span>
              </label>
              {attemptedSave && !authorityAcknowledged && (
                <p className="text-sm font-semibold text-error" role="alert">Acknowledge your authority and the limitations to enable Integrity Mode.</p>
              )}
            </div>
          )}
        </section>

        <div className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-black">Questions <span className="text-base-content/45">({questions.length}/{QUIZ_LIMITS.maxQuestions})</span></h2>
            <button type="button" onClick={addQuestion} disabled={saving || questions.length >= QUIZ_LIMITS.maxQuestions} className="btn btn-outline btn-sm gap-2">
              <Plus size={15} /> Add question
            </button>
          </div>

          <ol className="mt-3 space-y-4">
            {questions.map((question, index) => {
              const questionErrors = errors.questions[index]
              return (
                <li key={index} className="rounded-2xl border border-base-300 bg-base-100 shadow-sm" aria-label={`Question ${index + 1}`}>
                  <div className="flex items-center justify-between gap-2 border-b border-base-300 px-4 py-2">
                    <span className="badge badge-primary badge-outline">Question {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => deleteQuestion(index)}
                      disabled={saving || questions.length <= QUIZ_LIMITS.minQuestions}
                      className="btn btn-square btn-ghost btn-sm text-error"
                      aria-label={`Delete question ${index + 1}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="space-y-3 p-4">
                    <label className="form-control">
                      <span className="label-text mb-1 font-semibold">Prompt <span className="text-error">*</span></span>
                      <textarea
                        value={question.prompt}
                        onChange={(event) => updateQuestion(index, { prompt: event.target.value })}
                        className={`textarea textarea-bordered min-h-16 ${showError(questionErrors?.prompt) ? 'textarea-error' : ''}`}
                        maxLength={QUIZ_LIMITS.maxPromptLength + 1}
                        placeholder="What do you want to ask?"
                        disabled={saving}
                      />
                      {showError(questionErrors?.prompt) && <span className="mt-1 text-xs font-semibold text-error" role="alert">{questionErrors?.prompt}</span>}
                    </label>
                    <fieldset>
                      <legend className="text-sm font-semibold">Choices — mark the correct one <span className="text-error">*</span></legend>
                      <div className="mt-2 space-y-2">
                        {question.choices.map((choice, choiceIndex) => (
                          <div key={choiceIndex} className="flex items-center gap-2">
                            <label className="cursor-pointer" title="Mark as the correct answer">
                              <input
                                type="radio"
                                name={`correct-${index}`}
                                checked={question.correctIndex === choiceIndex}
                                onChange={() => updateQuestion(index, { correctIndex: choiceIndex })}
                                className="radio radio-primary"
                                disabled={saving}
                                aria-label={`Choice ${choiceIndex + 1} is correct`}
                              />
                            </label>
                            <input
                              value={choice}
                              onChange={(event) => updateQuestion(index, { choices: question.choices.map((item, itemIndex) => (itemIndex === choiceIndex ? event.target.value : item)) })}
                              className={`input input-bordered grow ${showError(questionErrors?.choices) ? 'input-error' : ''}`}
                              maxLength={QUIZ_LIMITS.maxChoiceLength + 1}
                              placeholder={`Choice ${choiceIndex + 1}`}
                              disabled={saving}
                            />
                            <button
                              type="button"
                              onClick={() => removeChoice(index, choiceIndex)}
                              disabled={saving || question.choices.length <= QUIZ_LIMITS.minChoices}
                              className="btn btn-square btn-ghost btn-sm text-error"
                              aria-label={`Remove choice ${choiceIndex + 1}`}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <button type="button" onClick={() => addChoice(index)} disabled={saving || question.choices.length >= QUIZ_LIMITS.maxChoices} className="btn btn-ghost btn-xs gap-1">
                          <Plus size={13} /> Add choice
                        </button>
                        {showError(questionErrors?.choices) && <span className="text-xs font-semibold text-error" role="alert">{questionErrors?.choices}</span>}
                        {showError(questionErrors?.correct) && <span className="text-xs font-semibold text-error" role="alert">{questionErrors?.correct}</span>}
                      </div>
                    </fieldset>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={() => void save()} className="btn btn-primary gap-2" disabled={saving}>
            {saving && <span className="loading loading-spinner loading-sm" />}
            <ListChecks size={17} /> Publish quiz
          </button>
          <button type="button" onClick={onExit} className="btn btn-ghost" disabled={saving}>Cancel</button>
        </div>
      </section>
    </main>
  )
}
