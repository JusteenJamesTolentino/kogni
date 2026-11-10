import { BookOpenCheck, Check, KeyRound, ListChecks, Send, Sparkles, TriangleAlert } from 'lucide-react'

export interface ContinuationContextDisclosure {
  topic: string
  guideIncluded: boolean
  priorQuestionCount: number
}

export interface ContinuationDraftSummary {
  title: string
  description?: string
  questionCount: number
  guideIncluded?: boolean
}

export type ContinuationCreatorStatus = 'ready' | 'generating' | 'review' | 'publishing' | 'published'

export interface ContinuationCreatorProps {
  seriesTitle: string
  currentPartNumber: number
  context: ContinuationContextDisclosure
  quotaRemaining?: number | null
  hasCreatorKey: boolean
  status?: ContinuationCreatorStatus
  error?: string
  draft?: ContinuationDraftSummary | null
  onGenerateNext: () => void | Promise<void>
  onReviewDraft?: () => void | Promise<void>
  onPublishDraft: () => void | Promise<void>
  onCancel?: () => void
}

const NEXT_PART_QUESTION_COUNT = 30

export default function ContinuationCreator({
  seriesTitle,
  currentPartNumber,
  context,
  quotaRemaining,
  hasCreatorKey,
  status = 'ready',
  error = '',
  draft,
  onGenerateNext,
  onReviewDraft,
  onPublishDraft,
  onCancel,
}: ContinuationCreatorProps) {
  const nextPartNumber = currentPartNumber + 1
  const generating = status === 'generating'
  const publishing = status === 'publishing'
  const quotaUnavailable = quotaRemaining !== undefined && quotaRemaining !== null && quotaRemaining < NEXT_PART_QUESTION_COUNT
  const canGenerate = hasCreatorKey && !quotaUnavailable && !generating && !publishing

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="overflow-hidden rounded-3xl border border-base-300 bg-base-100 shadow-xl" aria-labelledby="continuation-title">
        <div className="border-b border-base-300 bg-gradient-to-br from-primary/15 via-base-100 to-secondary/10 p-6 sm:p-9">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Sparkles size={24} aria-hidden="true" /></div>
            <div>
              <span className="badge badge-primary badge-outline">Creator-only continuation</span>
              <h1 id="continuation-title" className="mt-3 text-3xl font-black tracking-tight">Create Part {nextPartNumber}</h1>
              <p className="mt-2 text-base-content/60">Continue {seriesTitle} with exactly {NEXT_PART_QUESTION_COUNT} new questions. Players cannot generate parts.</p>
            </div>
          </div>
        </div>

        <div className="space-y-6 p-6 sm:p-9">
          <section className="rounded-2xl border border-warning/35 bg-warning/10 p-5" aria-labelledby="ai-disclosure-title">
            <div className="flex items-start gap-3">
              <TriangleAlert size={22} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <h2 id="ai-disclosure-title" className="font-bold">What will be sent for generation</h2>
                <p className="mt-1 text-sm leading-relaxed text-base-content/65">When you continue, the topic, study guide, and prior questions listed below are sent using your creator API key and count against your creator quota. Answers are not shown on this screen.</p>
              </div>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-base-100/80 p-3"><dt className="text-xs font-semibold text-base-content/50">Topic</dt><dd className="mt-1 line-clamp-2 font-semibold">{context.topic}</dd></div>
              <div className="rounded-xl bg-base-100/80 p-3"><dt className="text-xs font-semibold text-base-content/50">Study guide</dt><dd className="mt-1 font-semibold">{context.guideIncluded ? 'Included' : 'Not included'}</dd></div>
              <div className="rounded-xl bg-base-100/80 p-3"><dt className="text-xs font-semibold text-base-content/50">Prior questions</dt><dd className="mt-1 font-semibold">{context.priorQuestionCount} included</dd></div>
            </dl>
          </section>

          {!hasCreatorKey && <div role="alert" className="alert alert-warning"><KeyRound size={20} aria-hidden="true" /><span>Add a creator API key before generating the next part.</span></div>}
          {quotaUnavailable && <div role="alert" className="alert alert-warning"><TriangleAlert size={20} aria-hidden="true" /><span>Your creator quota does not currently cover {NEXT_PART_QUESTION_COUNT} new questions.</span></div>}
          {error && <div role="alert" className="alert alert-error"><span>{error}</span></div>}

          {draft ? (
            <section className="rounded-2xl border border-success/35 bg-success/5 p-5" aria-labelledby="draft-summary-title">
              <div className="flex items-start gap-3">
                <BookOpenCheck size={22} className="shrink-0 text-success" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 id="draft-summary-title" className="text-lg font-bold">Draft ready for review</h2>
                    <span className="badge badge-success badge-outline">Part {nextPartNumber}</span>
                  </div>
                  <h3 className="mt-3 font-bold">{draft.title}</h3>
                  {draft.description && <p className="mt-1 text-sm text-base-content/60">{draft.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="badge badge-ghost">{draft.questionCount} questions</span>
                    <span className="badge badge-ghost">{draft.guideIncluded ? 'Guide included' : 'No new guide'}</span>
                  </div>
                  {draft.questionCount !== NEXT_PART_QUESTION_COUNT && <p role="alert" className="mt-3 text-sm font-semibold text-error">Publishing is disabled until the draft contains exactly {NEXT_PART_QUESTION_COUNT} questions.</p>}
                </div>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {onReviewDraft && <button type="button" onClick={() => void onReviewDraft()} className="btn btn-outline gap-2" disabled={publishing}><ListChecks size={17} aria-hidden="true" />Review draft</button>}
                <button type="button" onClick={() => void onPublishDraft()} className="btn btn-primary gap-2" disabled={publishing || draft.questionCount !== NEXT_PART_QUESTION_COUNT}>
                  {publishing ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}
                  {publishing ? 'Publishing…' : `Publish Part ${nextPartNumber}`}
                </button>
              </div>
              {status === 'published' && <div role="status" className="alert alert-success mt-4"><Check size={18} aria-hidden="true" /><span>Part {nextPartNumber} is published.</span></div>}
            </section>
          ) : (
            <div>
              <button type="button" onClick={() => void onGenerateNext()} className="btn btn-primary w-full gap-2" disabled={!canGenerate}>
                {generating ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
                {generating ? 'Generating next 30…' : 'Generate next 30'}
              </button>
              <p className="mt-3 text-center text-xs text-base-content/50">Generation creates a private draft first. Nothing is published automatically.</p>
            </div>
          )}

          {onCancel && <button type="button" onClick={onCancel} className="btn btn-ghost w-full" disabled={generating || publishing}>Cancel</button>}
        </div>
      </section>
    </main>
  )
}

export { NEXT_PART_QUESTION_COUNT }
