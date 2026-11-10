import { useMemo } from 'react'
import { AlertTriangle, ArrowDownUp, FilePenLine, ListMinus, ListPlus, RotateCcw } from 'lucide-react'
import type { DeckEditorDraft } from './DeckEditor'

export interface DeckDraftDiffProps {
  original: DeckEditorDraft
  draft: DeckEditorDraft
  className?: string
  compact?: boolean
}

export interface DeckDraftChangeSummary {
  metadataFields: Array<'title' | 'description' | 'studyGuide'>
  addedCardIds: string[]
  deletedCardIds: string[]
  movedCardIds: string[]
  scheduleResetCardIds: string[]
  changed: boolean
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function summarizeDeckDraftChanges(original: DeckEditorDraft, draft: DeckEditorDraft): DeckDraftChangeSummary {
  const metadataFields: DeckDraftChangeSummary['metadataFields'] = []
  if (original.title !== draft.title) metadataFields.push('title')
  if (original.description !== draft.description) metadataFields.push('description')
  if (original.studyGuide !== draft.studyGuide) metadataFields.push('studyGuide')

  const originalById = new Map(original.cards.map((card) => [card.id, card]))
  const draftById = new Map(draft.cards.map((card) => [card.id, card]))
  const originalOrder = new Map(original.cards.map((card, index) => [card.id, index]))
  const draftOrder = new Map(draft.cards.map((card, index) => [card.id, index]))
  const addedCardIds = draft.cards.filter((card) => !originalById.has(card.id)).map((card) => card.id)
  const deletedCardIds = original.cards.filter((card) => !draftById.has(card.id)).map((card) => card.id)
  const movedCardIds = draft.cards
    .filter((card) => originalById.has(card.id) && originalOrder.get(card.id) !== draftOrder.get(card.id))
    .map((card) => card.id)
  const scheduleResetCardIds = draft.cards
    .filter((card) => {
      const previous = originalById.get(card.id)
      return Boolean(previous && (
        previous.question !== card.question
        || previous.answer !== card.answer
        || !sameStrings(previous.distractors, card.distractors)
      ))
    })
    .map((card) => card.id)

  return {
    metadataFields,
    addedCardIds,
    deletedCardIds,
    movedCardIds,
    scheduleResetCardIds,
    changed: Boolean(metadataFields.length || addedCardIds.length || deletedCardIds.length || movedCardIds.length || scheduleResetCardIds.length),
  }
}

// eslint-disable-next-line react/only-export-components -- shared pure summary keeps diff semantics identical in the editor.
export { summarizeDeckDraftChanges }

export default function DeckDraftDiff({ original, draft, className = '', compact = false }: DeckDraftDiffProps) {
  const summary = useMemo(() => summarizeDeckDraftChanges(original, draft), [draft, original])
  const resetQuestions = summary.scheduleResetCardIds.map((id) => draft.cards.find((card) => card.id === id)?.question || 'Untitled card')

  return (
    <section className={`rounded-2xl border border-base-300 bg-base-100 p-4 ${className}`} aria-labelledby="draft-change-summary-title">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <FilePenLine size={18} aria-hidden="true" />
        </div>
        <div>
          <h2 id="draft-change-summary-title" className="font-bold">Preview changes</h2>
          <p className="mt-0.5 text-xs text-base-content/55">Nothing is saved until you confirm.</p>
        </div>
      </div>

      {!summary.changed ? (
        <p className="mt-4 rounded-xl bg-base-200/60 px-3 py-2 text-sm text-base-content/60">No changes yet.</p>
      ) : (
        <ul className="mt-4 space-y-2 text-sm">
          {summary.metadataFields.length > 0 && (
            <li className="flex gap-2"><FilePenLine size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" /><span><strong>{summary.metadataFields.length}</strong> metadata {summary.metadataFields.length === 1 ? 'field' : 'fields'} changed; learning progress is preserved.</span></li>
          )}
          {summary.addedCardIds.length > 0 && (
            <li className="flex gap-2"><ListPlus size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" /><span><strong>{summary.addedCardIds.length}</strong> {summary.addedCardIds.length === 1 ? 'card' : 'cards'} added with a fresh schedule.</span></li>
          )}
          {summary.deletedCardIds.length > 0 && (
            <li className="flex gap-2"><ListMinus size={16} className="mt-0.5 shrink-0 text-error" aria-hidden="true" /><span><strong>{summary.deletedCardIds.length}</strong> {summary.deletedCardIds.length === 1 ? 'card' : 'cards'} and their local progress removed.</span></li>
          )}
          {summary.movedCardIds.length > 0 && (
            <li className="flex gap-2"><ArrowDownUp size={16} className="mt-0.5 shrink-0 text-secondary" aria-hidden="true" /><span>Card order changed; schedules are preserved.</span></li>
          )}
        </ul>
      )}

      {summary.scheduleResetCardIds.length > 0 && (
        <div className="mt-4 rounded-xl border border-warning/35 bg-warning/10 p-3" role="status">
          <div className="flex gap-2">
            <RotateCcw size={17} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-bold">{summary.scheduleResetCardIds.length} {summary.scheduleResetCardIds.length === 1 ? 'schedule' : 'schedules'} will reset</p>
              <p className="mt-1 text-xs leading-relaxed text-base-content/65">Changing a question, answer, or distractor starts that card over. Other card progress is kept.</p>
              {!compact && (
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-base-content/60">
                  {resetQuestions.slice(0, 4).map((question, index) => <li key={summary.scheduleResetCardIds[index]} className="truncate">{question}</li>)}
                  {resetQuestions.length > 4 && <li>{resetQuestions.length - 4} more</li>}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {summary.deletedCardIds.length === original.cards.length && original.cards.length > 0 && (
        <div role="alert" className="mt-3 flex gap-2 text-xs font-semibold text-error">
          <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
          This draft removes every original card.
        </div>
      )}
    </section>
  )
}
