import { useId } from 'react'
import { BookOpen, CalendarClock, Check, Download, NotebookTabs, UserRound } from 'lucide-react'

export interface PortalDeckPreview {
  title: string
  senderDisplayName: string
  description?: string
  guideAvailable?: boolean
  cardCount: number
  expiresAt: number | string | Date
}

export interface PortalPreviewProps {
  preview: PortalDeckPreview
  adding?: boolean
  added?: boolean
  error?: string
  onAddToLibrary: () => void | Promise<void>
}

function formatExpiry(value: number | string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'Expiry unavailable'

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default function PortalPreview({
  preview,
  adding = false,
  added = false,
  error = '',
  onAddToLibrary,
}: PortalPreviewProps) {
  const titleId = useId()

  return (
    <article className="overflow-hidden rounded-3xl border border-base-300 bg-base-100 shadow-sm" aria-labelledby={titleId} aria-busy={adding}>
      <div className="border-b border-base-300 bg-base-200/50 p-5 sm:p-6">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
          <BookOpen size={16} aria-hidden="true" />
          Deck preview
        </div>
        <h2 id={titleId} className="mt-3 break-words text-2xl font-black tracking-tight sm:text-3xl">
          {preview.title || 'Untitled deck'}
        </h2>
        <p className="mt-2 flex items-center gap-2 text-sm text-base-content/60">
          <UserRound size={16} className="shrink-0" aria-hidden="true" />
          Shared by <span className="font-semibold text-base-content">{preview.senderDisplayName || 'A Kogni learner'}</span>
        </p>
      </div>

      <div className="p-5 sm:p-6">
        {error && <div role="alert" className="alert alert-error mb-5 text-sm"><span>{error}</span></div>}

        <p className="whitespace-pre-wrap text-sm leading-relaxed text-base-content/70">
          {preview.description || 'A reusable study deck shared through Kogni.'}
        </p>

        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-base-300 bg-base-200/35 p-4">
            <dt className="flex items-center gap-2 text-xs font-semibold text-base-content/55">
              <BookOpen size={15} aria-hidden="true" />
              Cards
            </dt>
            <dd className="mt-2 text-lg font-bold tabular-nums">{preview.cardCount}</dd>
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-200/35 p-4">
            <dt className="flex items-center gap-2 text-xs font-semibold text-base-content/55">
              <NotebookTabs size={15} aria-hidden="true" />
              Study guide
            </dt>
            <dd className="mt-2 text-sm font-bold">{preview.guideAvailable ? 'Available' : 'Not included'}</dd>
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-200/35 p-4">
            <dt className="flex items-center gap-2 text-xs font-semibold text-base-content/55">
              <CalendarClock size={15} aria-hidden="true" />
              Portal expires
            </dt>
            <dd className="mt-2 text-sm font-bold">{formatExpiry(preview.expiresAt)}</dd>
          </div>
        </dl>

        <div className="mt-5 rounded-2xl border border-dashed border-base-300 p-4 text-sm text-base-content/60">
          This preview intentionally hides all card questions and answers. Add the deck to your library to study your own independent copy.
        </div>

        <button
          type="button"
          className="btn btn-primary mt-5 w-full gap-2 sm:w-auto sm:min-w-52"
          onClick={() => void onAddToLibrary()}
          disabled={adding || added}
        >
          {adding ? (
            <span className="loading loading-spinner loading-sm" aria-hidden="true" />
          ) : added ? (
            <Check size={18} aria-hidden="true" />
          ) : (
            <Download size={18} aria-hidden="true" />
          )}
          {adding ? 'Adding…' : added ? 'Added to library' : 'Add to library'}
        </button>
      </div>
    </article>
  )
}
