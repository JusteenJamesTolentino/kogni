import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Copy,
  FileText,
  GripVertical,
  ListPlus,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import DeckDraftDiff, { summarizeDeckDraftChanges } from './DeckDraftDiff'
import { findUncoveredAnswers } from '../lib/studyGuideCoverage'

const DECK_EDITOR_LIMITS = {
  title: 120,
  description: 500,
  studyGuide: 8000,
  question: 1000,
  answer: 2000,
  distractor: 500,
  distractors: 4,
} as const

export interface DeckEditorCardDraft {
  id: string
  question: string
  answer: string
  distractors: string[]
}

export interface DeckEditorDraft {
  title: string
  description: string
  studyGuide: string
  cards: DeckEditorCardDraft[]
}

export interface DeckEditorSaveContext {
  scheduleResetCardIds: string[]
  addedCardIds: string[]
  deletedCardIds: string[]
  movedCardIds: string[]
  metadataFields: Array<'title' | 'description' | 'studyGuide'>
}

export interface DeckEditorLeaveContext {
  draft: DeckEditorDraft
  dirty: boolean
}

export interface DeckEditorProps {
  initialDraft: DeckEditorDraft
  deckLabel?: string
  /** Page heading; defaults to "Edit deck" for the edit flow. */
  heading?: string
  saving?: boolean
  saveError?: string
  onSave: (draft: DeckEditorDraft, context: DeckEditorSaveContext) => void | Promise<void>
  onCancel: () => void
  onBeforeLeave?: (context: DeckEditorLeaveContext) => boolean | Promise<boolean>
  onDirtyChange?: (dirty: boolean, draft: DeckEditorDraft) => void
  minimumCards?: number
}

type CardErrors = {
  question?: string
  answer?: string
  distractors: Array<string | undefined>
}

interface DraftErrors {
  title?: string
  cards: Record<string, CardErrors>
  count: number
}

function cloneDraft(draft: DeckEditorDraft): DeckEditorDraft {
  return {
    title: draft.title,
    description: draft.description,
    studyGuide: draft.studyGuide,
    cards: draft.cards.map((card) => ({ ...card, distractors: [...card.distractors] })),
  }
}

function draftSignature(draft: DeckEditorDraft): string {
  return JSON.stringify(draft)
}

function canonicalQuestion(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

function canonicalChoice(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase()
}

function makeCardId(): string {
  return `draft-card-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

function blankCard(): DeckEditorCardDraft {
  return { id: makeCardId(), question: '', answer: '', distractors: [] }
}

function validateDraft(draft: DeckEditorDraft, minimumCards: number): DraftErrors {
  const cards: Record<string, CardErrors> = {}
  let count = 0
  const questionOwners = new Map<string, number[]>()

  draft.cards.forEach((card, index) => {
    const canonical = canonicalQuestion(card.question)
    if (canonical) questionOwners.set(canonical, [...(questionOwners.get(canonical) ?? []), index])
  })

  draft.cards.forEach((card, cardIndex) => {
    const cardErrors: CardErrors = { distractors: [] }
    const question = card.question.trim()
    const answer = card.answer.trim()
    if (!question) cardErrors.question = 'Question is required.'
    else if (question.length > DECK_EDITOR_LIMITS.question) cardErrors.question = `Question must be ${DECK_EDITOR_LIMITS.question.toLocaleString()} characters or fewer.`
    else {
      const matches = questionOwners.get(canonicalQuestion(question)) ?? []
      if (matches.length > 1) cardErrors.question = `Duplicate question. It exactly matches card ${matches.find((index) => index !== cardIndex)! + 1} after case and spacing are normalized.`
    }

    if (!answer) cardErrors.answer = 'Answer is required.'
    else if (answer.length > DECK_EDITOR_LIMITS.answer) cardErrors.answer = `Answer must be ${DECK_EDITOR_LIMITS.answer.toLocaleString()} characters or fewer.`

    const seenChoices = new Map<string, number>()
    card.distractors.forEach((distractor, distractorIndex) => {
      const choice = distractor.trim()
      const canonical = canonicalChoice(choice)
      if (!choice) cardErrors.distractors[distractorIndex] = 'Remove this empty distractor or add text.'
      else if (choice.length > DECK_EDITOR_LIMITS.distractor) cardErrors.distractors[distractorIndex] = `Use ${DECK_EDITOR_LIMITS.distractor} characters or fewer.`
      else if (answer && canonical === canonicalChoice(answer)) cardErrors.distractors[distractorIndex] = 'A distractor cannot exactly match the answer.'
      else if (seenChoices.has(canonical)) cardErrors.distractors[distractorIndex] = `Duplicate distractor. It matches distractor ${seenChoices.get(canonical)! + 1}.`
      else seenChoices.set(canonical, distractorIndex)
    })

    const cardErrorCount = Number(Boolean(cardErrors.question)) + Number(Boolean(cardErrors.answer)) + cardErrors.distractors.filter(Boolean).length
    if (cardErrorCount) {
      cards[card.id] = cardErrors
      count += cardErrorCount
    }
  })

  let title: string | undefined
  if (!draft.title.trim()) title = 'Deck title is required.'
  else if (draft.title.trim().length > DECK_EDITOR_LIMITS.title) title = `Title must be ${DECK_EDITOR_LIMITS.title} characters or fewer.`
  if (title) count += 1
  if (draft.description.length > DECK_EDITOR_LIMITS.description) count += 1
  if (draft.studyGuide.length > DECK_EDITOR_LIMITS.studyGuide) count += 1
  const uncoveredAnswers = draft.studyGuide.trim() ? findUncoveredAnswers(draft.studyGuide, draft.cards) : []
  if (uncoveredAnswers.length > 0) count += 1
  if (draft.cards.length < minimumCards) count += 1

  return { title, cards, count }
}

function CharacterCount({ value, limit, id }: { value: string; limit: number; id: string }) {
  const over = value.length > limit
  return <span id={id} className={`text-xs tabular-nums ${over ? 'font-semibold text-error' : 'text-base-content/45'}`} aria-live={over ? 'polite' : 'off'}>{value.length.toLocaleString()} / {limit.toLocaleString()}</span>
}

export default function DeckEditor({
  initialDraft,
  deckLabel = 'deck',
  heading = 'Edit deck',
  saving = false,
  saveError = '',
  onSave,
  onCancel,
  onBeforeLeave,
  onDirtyChange,
  minimumCards = 1,
}: DeckEditorProps) {
  const titleId = useId()
  const titleErrorId = useId()
  const titleCountId = useId()
  const descriptionCountId = useId()
  const guideCountId = useId()
  const initialSignature = useMemo(() => draftSignature(initialDraft), [initialDraft])
  const [loadedInitialSignature, setLoadedInitialSignature] = useState(initialSignature)
  const [baseline, setBaseline] = useState(() => cloneDraft(initialDraft))
  const [draft, setDraft] = useState(() => cloneDraft(initialDraft))
  const [attemptedSave, setAttemptedSave] = useState(false)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(() => new Set(initialDraft.cards.map((card) => card.id)))
  // Cards whose validation errors are shown before any save attempt — currently only verbatim
  // copies, whose duplicate question/distractors are guaranteed by construction.
  const [proactiveHintCards, setProactiveHintCards] = useState<Set<string>>(() => new Set())
  const firstErrorRef = useRef<HTMLDivElement>(null)
  const editorRootRef = useRef<HTMLElement>(null)
  const baselineSignature = useMemo(() => draftSignature(baseline), [baseline])
  const currentSignature = useMemo(() => draftSignature(draft), [draft])
  const dirty = currentSignature !== baselineSignature
  const errors = useMemo(() => validateDraft(draft, minimumCards), [draft, minimumCards])
  const uncoveredAnswers = useMemo(
    () => draft.studyGuide.trim() ? findUncoveredAnswers(draft.studyGuide, draft.cards) : [],
    [draft.cards, draft.studyGuide],
  )
  const changes = useMemo(() => summarizeDeckDraftChanges(baseline, draft), [baseline, draft])
  const metadataLengthErrors = {
    description: draft.description.length > DECK_EDITOR_LIMITS.description ? `Description must be ${DECK_EDITOR_LIMITS.description} characters or fewer.` : '',
    studyGuide: draft.studyGuide.length > DECK_EDITOR_LIMITS.studyGuide ? `Study guide must be ${DECK_EDITOR_LIMITS.studyGuide.toLocaleString()} characters or fewer.` : '',
  }

  if (initialSignature !== loadedInitialSignature && !dirty && !saving) {
    const next = cloneDraft(initialDraft)
    setLoadedInitialSignature(initialSignature)
    setBaseline(next)
    setDraft(cloneDraft(next))
    setAttemptedSave(false)
    setExpandedCards(new Set(next.cards.map((card) => card.id)))
    setProactiveHintCards(new Set())
  }

  useEffect(() => {
    onDirtyChange?.(dirty, draft)
  }, [dirty, draft, onDirtyChange])

  useEffect(() => {
    if (!dirty || saving) return
    const warnBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [dirty, saving])

  const updateMetadata = (field: 'title' | 'description' | 'studyGuide', value: string): void => {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const updateCard = (cardId: string, updater: (card: DeckEditorCardDraft) => DeckEditorCardDraft): void => {
    setDraft((current) => ({ ...current, cards: current.cards.map((card) => card.id === cardId ? updater(card) : card) }))
  }

  const moveCard = (index: number, direction: -1 | 1): void => {
    const target = index + direction
    if (target < 0 || target >= draft.cards.length) return
    setDraft((current) => {
      const cards = [...current.cards]
      const [moved] = cards.splice(index, 1)
      cards.splice(target, 0, moved)
      return { ...current, cards }
    })
  }

  const addCard = (afterIndex = draft.cards.length - 1): void => {
    const card = blankCard()
    setDraft((current) => {
      const cards = [...current.cards]
      cards.splice(afterIndex + 1, 0, card)
      return { ...current, cards }
    })
    setExpandedCards((current) => new Set(current).add(card.id))
    window.setTimeout(() => document.getElementById(`question-${card.id}`)?.focus(), 0)
  }

  const duplicateCard = (index: number): void => {
    const source = draft.cards[index]
    if (!source) return
    const copy = { ...source, id: makeCardId(), distractors: [...source.distractors] }
    setDraft((current) => {
      const cards = [...current.cards]
      cards.splice(index + 1, 0, copy)
      return { ...current, cards }
    })
    setExpandedCards((current) => new Set(current).add(copy.id))
    // The copy repeats the source verbatim, so its duplicate-question/distractor errors exist
    // immediately — surface them now instead of waiting for a failed save.
    setProactiveHintCards((current) => new Set(current).add(copy.id))
    window.setTimeout(() => document.getElementById(`question-${copy.id}`)?.focus(), 0)
  }

  const deleteCard = (cardId: string): void => {
    setDraft((current) => ({ ...current, cards: current.cards.filter((card) => card.id !== cardId) }))
  }

  const requestCancel = async (): Promise<void> => {
    if (saving) return
    if (onBeforeLeave) {
      const canLeave = await onBeforeLeave({ draft, dirty })
      if (!canLeave) return
    }
    onCancel()
  }

  const handleSave = async (): Promise<void> => {
    if (saving) return
    setAttemptedSave(true)
    if (errors.count > 0) {
      setExpandedCards((current) => {
        const next = new Set(current)
        Object.keys(errors.cards).forEach((cardId) => next.add(cardId))
        return next
      })
      window.setTimeout(() => {
        const firstInvalid = editorRootRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
        firstInvalid?.focus()
        if (!firstInvalid) firstErrorRef.current?.focus()
      }, 0)
      return
    }
    const normalized: DeckEditorDraft = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      studyGuide: draft.studyGuide.trim(),
      cards: draft.cards.map((card) => ({
        ...card,
        question: card.question.trim(),
        answer: card.answer.trim(),
        distractors: card.distractors.map((distractor) => distractor.trim()),
      })),
    }
    await onSave(normalized, changes)
  }

  const showError = (value?: string, cardId?: string): string | undefined =>
    attemptedSave || (cardId !== undefined && proactiveHintCards.has(cardId)) ? value : undefined

  return (
    <main ref={editorRootRef} className="mx-auto w-full max-w-6xl px-4 py-5 pb-28 sm:px-6 sm:py-7 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => void requestCancel()} className="btn btn-ghost btn-sm -ml-2 gap-2" disabled={saving}>
          <ArrowLeft size={17} aria-hidden="true" /> Back
        </button>
        <span className={`badge gap-1.5 ${dirty ? 'badge-warning badge-outline' : 'badge-ghost'}`} role="status">
          {dirty ? 'Unsaved draft' : 'All changes saved'}
        </span>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-lg sm:p-5" aria-labelledby={titleId}>
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileText size={18} aria-hidden="true" /></div>
              <div><p className="text-sm font-semibold text-primary">{deckLabel} draft · Cloud save</p><h1 id={titleId} className="text-xl font-black tracking-tight sm:text-2xl">{heading}</h1></div>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="form-control">
                <span className="label pb-1"><span className="label-text font-semibold">Title</span><CharacterCount id={titleCountId} value={draft.title} limit={DECK_EDITOR_LIMITS.title} /></span>
                <input value={draft.title} onChange={(event) => updateMetadata('title', event.target.value)} className={`input input-bordered w-full ${showError(errors.title) ? 'input-error' : ''}`} maxLength={DECK_EDITOR_LIMITS.title + 1} aria-invalid={Boolean(showError(errors.title))} aria-describedby={`${titleCountId}${showError(errors.title) ? ` ${titleErrorId}` : ''}`} />
                {showError(errors.title) && <span id={titleErrorId} className="mt-1 text-xs font-semibold text-error" role="alert">{errors.title}</span>}
              </label>

              <label className="form-control">
                <span className="label pb-1"><span className="label-text font-semibold">Description</span><CharacterCount id={descriptionCountId} value={draft.description} limit={DECK_EDITOR_LIMITS.description} /></span>
                <textarea value={draft.description} onChange={(event) => updateMetadata('description', event.target.value)} className={`textarea textarea-bordered min-h-20 ${attemptedSave && metadataLengthErrors.description ? 'textarea-error' : ''}`} aria-invalid={Boolean(attemptedSave && metadataLengthErrors.description)} aria-describedby={descriptionCountId} />
                {attemptedSave && metadataLengthErrors.description && <span className="mt-1 text-xs font-semibold text-error" role="alert">{metadataLengthErrors.description}</span>}
              </label>

              <label className="form-control">
                <span className="label pb-1"><span className="label-text font-semibold">Study guide</span><CharacterCount id={guideCountId} value={draft.studyGuide} limit={DECK_EDITOR_LIMITS.studyGuide} /></span>
                <textarea value={draft.studyGuide} onChange={(event) => updateMetadata('studyGuide', event.target.value)} className={`textarea textarea-bordered min-h-32 leading-relaxed ${attemptedSave && metadataLengthErrors.studyGuide ? 'textarea-error' : ''}`} aria-invalid={Boolean(attemptedSave && metadataLengthErrors.studyGuide)} aria-describedby={guideCountId} />
                {attemptedSave && metadataLengthErrors.studyGuide && <span className="mt-1 text-xs font-semibold text-error" role="alert">{metadataLengthErrors.studyGuide}</span>}
                {attemptedSave && uncoveredAnswers.length > 0 && <span className="mt-1 text-xs font-semibold text-error" role="alert">The guide is missing {uncoveredAnswers.length} complete {uncoveredAnswers.length === 1 ? 'answer phrase' : 'answer phrases'}.</span>}
              </label>
            </div>
          </section>

          <section aria-labelledby="card-editor-title">
            <div className="flex flex-wrap items-end justify-between gap-3 px-1">
              <div><h2 id="card-editor-title" className="text-2xl font-black">Cards</h2><p className="mt-1 text-sm text-base-content/55">Edit learning content and control the study order.</p></div>
              <button type="button" onClick={() => addCard()} className="btn btn-outline btn-sm gap-2"><ListPlus size={16} aria-hidden="true" /> Add card</button>
            </div>

            {attemptedSave && draft.cards.length < minimumCards && <div ref={firstErrorRef} tabIndex={-1} role="alert" className="alert alert-error mt-4 text-sm"><span>Add at least {minimumCards} {minimumCards === 1 ? 'card' : 'cards'} before saving.</span></div>}

            <ol className="mt-3 space-y-3" aria-label="Ordered deck cards">
              {draft.cards.map((card, index) => {
                const cardErrors = errors.cards[card.id]
                const expanded = expandedCards.has(card.id)
                return (
                  <li key={card.id} className="rounded-3xl border border-base-300 bg-base-100 shadow-sm" aria-label={`Card ${index + 1} of ${draft.cards.length}`}>
                    <div className="flex items-center gap-2 border-b border-base-300 px-3 py-2 sm:px-4">
                      <GripVertical size={18} className="hidden shrink-0 text-base-content/30 sm:block" aria-hidden="true" />
                      <button type="button" onClick={() => setExpandedCards((current) => { const next = new Set(current); if (next.has(card.id)) next.delete(card.id); else next.add(card.id); return next })} className="btn btn-ghost min-w-0 flex-1 justify-start px-2 text-left" aria-expanded={expanded} aria-controls={`card-fields-${card.id}`}>
                        <span className="badge badge-primary badge-outline shrink-0">{index + 1}</span>
                        <span className="truncate">{card.question.trim() || 'Untitled card'}</span>
                      </button>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => moveCard(index, -1)} disabled={index === 0 || saving} className="btn btn-square btn-ghost btn-sm" aria-label={`Move card ${index + 1} up`}><ArrowUp size={16} aria-hidden="true" /></button>
                        <button type="button" onClick={() => moveCard(index, 1)} disabled={index === draft.cards.length - 1 || saving} className="btn btn-square btn-ghost btn-sm" aria-label={`Move card ${index + 1} down`}><ArrowDown size={16} aria-hidden="true" /></button>
                        <button type="button" onClick={() => duplicateCard(index)} disabled={saving} className="btn btn-square btn-ghost btn-sm" aria-label={`Duplicate card ${index + 1}`}><Copy size={16} aria-hidden="true" /></button>
                        <button type="button" onClick={() => deleteCard(card.id)} disabled={saving} className="btn btn-square btn-ghost btn-sm text-error" aria-label={`Delete card ${index + 1}`}><Trash2 size={16} aria-hidden="true" /></button>
                      </div>
                    </div>

                    {expanded && (
                      <div id={`card-fields-${card.id}`} className="space-y-3 p-3 sm:p-4">
                        <EditorField label="Question" value={card.question} limit={DECK_EDITOR_LIMITS.question} inputId={`question-${card.id}`} error={showError(cardErrors?.question, card.id)} onChange={(value) => updateCard(card.id, (current) => ({ ...current, question: value }))} multiline />
                        <EditorField label="Answer" value={card.answer} limit={DECK_EDITOR_LIMITS.answer} inputId={`answer-${card.id}`} error={showError(cardErrors?.answer, card.id)} onChange={(value) => updateCard(card.id, (current) => ({ ...current, answer: value }))} multiline />

                        <fieldset>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <legend className="font-semibold">Distractors <span className="font-normal text-base-content/45">(optional)</span></legend>
                            <span className="text-xs text-base-content/45">{card.distractors.length} / {DECK_EDITOR_LIMITS.distractors}</span>
                          </div>
                          <div className="mt-2 space-y-2">
                            {card.distractors.map((distractor, distractorIndex) => {
                              const error = showError(cardErrors?.distractors[distractorIndex], card.id)
                              const errorId = `distractor-error-${card.id}-${distractorIndex}`
                              const countId = `distractor-count-${card.id}-${distractorIndex}`
                              return (
                                <div key={`${card.id}-distractor-${distractorIndex}`}>
                                  <div className="flex gap-2">
                                    <label className="input input-bordered flex min-w-0 flex-1 items-center gap-2 has-[:invalid]:input-error">
                                      <span className="badge badge-ghost badge-sm shrink-0" aria-hidden="true">{distractorIndex + 1}</span>
                                      <span className="sr-only">Distractor {distractorIndex + 1}</span>
                                      <input value={distractor} onChange={(event) => updateCard(card.id, (current) => ({ ...current, distractors: current.distractors.map((item, itemIndex) => itemIndex === distractorIndex ? event.target.value : item) }))} className="min-w-0 grow" aria-invalid={Boolean(error)} aria-describedby={`${countId}${error ? ` ${errorId}` : ''}`} />
                                    </label>
                                    <button type="button" onClick={() => updateCard(card.id, (current) => ({ ...current, distractors: current.distractors.filter((_, itemIndex) => itemIndex !== distractorIndex) }))} className="btn btn-square btn-ghost text-error" aria-label={`Remove distractor ${distractorIndex + 1}`}><X size={17} aria-hidden="true" /></button>
                                  </div>
                                  <div className="mt-1 flex justify-between gap-3 px-1">
                                    {error ? <span id={errorId} role="alert" className="text-xs font-semibold text-error">{error}</span> : <span />}
                                    <CharacterCount id={countId} value={distractor} limit={DECK_EDITOR_LIMITS.distractor} />
                                  </div>
                                </div>
                              )
                            })}
                            {card.distractors.length < DECK_EDITOR_LIMITS.distractors && <button type="button" onClick={() => updateCard(card.id, (current) => ({ ...current, distractors: [...current.distractors, ''] }))} className="btn btn-ghost btn-sm gap-2"><Plus size={15} aria-hidden="true" /> Add distractor</button>}
                          </div>
                        </fieldset>
                        <div className="flex justify-end"><button type="button" onClick={() => addCard(index)} className="btn btn-ghost btn-sm gap-2"><Plus size={15} aria-hidden="true" /> Add card after</button></div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>
        </div>

        <aside className="hidden lg:block" aria-label="Draft save summary">
          <div className="sticky top-24 space-y-3">
            <DeckDraftDiff original={baseline} draft={draft} />
            {saveError && <div role="alert" className="alert alert-error text-sm"><span>{saveError}</span></div>}
            <button type="button" onClick={() => void handleSave()} disabled={!dirty || saving} className="btn btn-primary w-full gap-2">{saving ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}{saving ? 'Saving…' : 'Save changes'}</button>
            <button type="button" onClick={() => void requestCancel()} disabled={saving} className="btn btn-ghost w-full">Cancel</button>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-base-300 bg-base-100/95 p-3 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] backdrop-blur motion-reduce:backdrop-filter-none lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{dirty ? 'Unsaved changes' : 'No changes'}</p><p className="text-xs text-base-content/50">{changes.scheduleResetCardIds.length ? `${changes.scheduleResetCardIds.length} schedule reset` : `${draft.cards.length} cards`}</p></div>
          <button type="button" onClick={() => void requestCancel()} disabled={saving} className="btn btn-ghost btn-sm">Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={!dirty || saving} className="btn btn-primary btn-sm gap-2">{saving ? <span className="loading loading-spinner loading-xs" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />} Save</button>
        </div>
        {saveError && <p role="alert" className="mx-auto mt-2 max-w-6xl text-xs font-semibold text-error">{saveError}</p>}
      </div>
    </main>
  )
}

interface EditorFieldProps {
  label: string
  value: string
  limit: number
  inputId: string
  error?: string
  multiline?: boolean
  onChange: (value: string) => void
}

function EditorField({ label, value, limit, inputId, error, multiline = false, onChange }: EditorFieldProps) {
  const countId = `${inputId}-count`
  const errorId = `${inputId}-error`
  const shared = {
    id: inputId,
    value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    'aria-invalid': Boolean(error),
    'aria-describedby': `${countId}${error ? ` ${errorId}` : ''}`,
  }
  return (
    <label className="form-control">
      <span className="label pb-1"><span className="label-text font-semibold">{label}</span><CharacterCount id={countId} value={value} limit={limit} /></span>
      {multiline ? <textarea {...shared} className={`textarea textarea-bordered min-h-16 ${error ? 'textarea-error' : ''}`} /> : <input {...shared} className={`input input-bordered ${error ? 'input-error' : ''}`} />}
      {error && <span id={errorId} role="alert" className="mt-1 text-xs font-semibold text-error">{error}</span>}
    </label>
  )
}
