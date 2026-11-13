import { useEffect, useId, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  FileLock2,
  FileText,
  ListChecks,
  Save,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react'
import type { GeneratedDeck } from '../types/domain'

export const REGENERATION_ACCEPTED_FILE_TYPES = '.pdf,image/jpeg,image/png,image/webp'
export const REGENERATION_ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])

export interface RegenerationProgress {
  stage: string
  message: string
  detail?: string
}

export interface RegenerateDeckProps {
  sourceDeckTitle: string
  maximumFileBytes?: number
  maximumFileSizeLabel?: string
  generatedDraft?: GeneratedDeck | null
  generating?: boolean
  saving?: boolean
  generationError?: string
  saveError?: string
  onGenerate: (file: File, onProgress: (progress: RegenerationProgress) => void) => GeneratedDeck | void | Promise<GeneratedDeck | void>
  onDraftChange?: (draft: GeneratedDeck | null) => void
  onReviewDraft?: (draft: GeneratedDeck) => void | Promise<void>
  onSaveAsNewDeck: (draft: GeneratedDeck) => void | Promise<void>
  onCancel: () => void
}

interface ActivityEntry extends RegenerationProgress {
  id: number
}

const DEFAULT_MAXIMUM_FILE_BYTES = 20 * 1024 * 1024

export default function RegenerateDeck({
  sourceDeckTitle,
  maximumFileBytes = DEFAULT_MAXIMUM_FILE_BYTES,
  maximumFileSizeLabel = '20 MB',
  generatedDraft: controlledDraft,
  generating: controlledGenerating,
  saving: controlledSaving,
  generationError = '',
  saveError = '',
  onGenerate,
  onDraftChange,
  onReviewDraft,
  onSaveAsNewDeck,
  onCancel,
}: RegenerateDeckProps) {
  const titleId = useId()
  const sourceNoteId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const activityIdRef = useRef(0)
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [localGenerating, setLocalGenerating] = useState(false)
  const [localSaving, setLocalSaving] = useState(false)
  const [localDraft, setLocalDraft] = useState<GeneratedDeck | null>(controlledDraft ?? null)
  const [localError, setLocalError] = useState('')
  const [activities, setActivities] = useState<ActivityEntry[]>([])
  const draft = controlledDraft === undefined ? localDraft : controlledDraft
  const generating = controlledGenerating ?? localGenerating
  const saving = controlledSaving ?? localSaving
  const busy = generating || saving

  useEffect(() => {
    if (!busy) return
    const warnBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [busy])

  const clearFile = (): void => {
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const selectFile = (selected?: File): void => {
    setLocalError('')
    if (!selected) return
    if (!REGENERATION_ALLOWED_MIME_TYPES.has(selected.type)) {
      setLocalError('Choose a PDF, JPEG, PNG, or WebP file.')
      clearFile()
      return
    }
    if (selected.size <= 0) {
      setLocalError('The selected file is empty.')
      clearFile()
      return
    }
    if (selected.size > maximumFileBytes) {
      setLocalError(`That file is larger than ${maximumFileSizeLabel}. Choose a smaller file.`)
      clearFile()
      return
    }
    setFile(selected)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragActive(false)
    selectFile(event.dataTransfer.files[0])
  }

  const reportProgress = (progress: RegenerationProgress): void => {
    activityIdRef.current += 1
    setActivities((current) => [...current, { ...progress, id: activityIdRef.current }])
  }

  const generate = async (): Promise<void> => {
    if (!file || generating) return
    activityIdRef.current = 0
    setActivities([])
    setLocalError('')
    setLocalGenerating(true)
    try {
      reportProgress({ stage: 'preparing', message: 'Preparing your re-uploaded source' })
      const generated = await onGenerate(file, reportProgress)
      if (generated) {
        setLocalDraft(generated)
        onDraftChange?.(generated)
      }
      reportProgress({ stage: 'ready', message: 'Private draft ready to review' })
      clearFile()
    } catch (error: unknown) {
      setLocalError(error instanceof Error ? error.message : 'This source could not be regenerated. Please try again.')
    } finally {
      setLocalGenerating(false)
    }
  }

  const save = async (): Promise<void> => {
    if (!draft || saving) return
    setLocalError('')
    setLocalSaving(true)
    try {
      await onSaveAsNewDeck(draft)
    } catch (error: unknown) {
      setLocalError(error instanceof Error ? error.message : 'The new deck could not be saved.')
    } finally {
      setLocalSaving(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-28 sm:px-6 sm:py-10 lg:px-8">
      <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm -ml-2 gap-2" disabled={busy}><ArrowLeft size={17} aria-hidden="true" /> Back to deck</button>

      <section className="mt-4 overflow-hidden rounded-3xl border border-base-300 bg-base-100 shadow-xl" aria-labelledby={titleId}>
        <div className="border-b border-base-300 bg-gradient-to-br from-primary/15 via-base-100 to-secondary/10 p-6 sm:p-9">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Sparkles size={24} aria-hidden="true" /></div>
            <div className="min-w-0">
              <span className="badge badge-primary badge-outline">New independent deck</span>
              <h1 id={titleId} className="mt-3 text-3xl font-black tracking-tight">Regenerate from source</h1>
              <p className="mt-2 text-base-content/60">Create a fresh deck based on <strong className="font-semibold text-base-content">{sourceDeckTitle}</strong>. Your current deck and learning progress will not be changed.</p>
            </div>
          </div>
        </div>

        <div className="space-y-6 p-5 sm:p-8">
          <div id={sourceNoteId} className="alert border-info/30 bg-info/10 text-sm" role="note">
            <FileLock2 size={21} className="text-info" aria-hidden="true" />
            <div><h2 className="font-bold">The original source was not retained</h2><p className="mt-0.5 text-xs leading-relaxed">Kogni does not store uploaded source files. Select the PDF or image again; it is used for this generation request only.</p></div>
          </div>

          {!draft ? (
            <>
              <div
                className={`grid min-h-64 place-items-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors motion-reduce:transition-none ${dragActive ? 'border-primary bg-primary/10' : 'border-base-300 bg-base-200/40 hover:border-primary/50'}`}
                onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
              >
                <input ref={fileInputRef} type="file" accept={REGENERATION_ACCEPTED_FILE_TYPES} className="sr-only" aria-label="Choose the source file again" aria-describedby={sourceNoteId} onChange={(event) => selectFile(event.target.files?.[0])} />
                {file ? (
                  <div className="w-full max-w-md">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-success/10 text-success"><FileText size={27} aria-hidden="true" /></div>
                    <h2 className="mt-4 break-all text-lg font-bold">{file.name}</h2>
                    <p className="mt-1 text-sm text-base-content/55">{(file.size / 1024 / 1024).toFixed(2)} MB · Ready to regenerate</p>
                    <button type="button" onClick={clearFile} className="btn btn-ghost btn-sm mt-3 gap-1 text-error" disabled={generating}><X size={15} aria-hidden="true" /> Remove</button>
                  </div>
                ) : (
                  <div>
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><UploadCloud size={28} aria-hidden="true" /></div>
                    <h2 className="mt-4 text-lg font-bold">Re-upload the source</h2>
                    <p className="mt-1 text-sm text-base-content/55">PDF, JPEG, PNG, or WebP up to {maximumFileSizeLabel}</p>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-outline btn-sm mt-5">Browse files</button>
                  </div>
                )}
              </div>

              <button type="button" onClick={() => void generate()} disabled={!file || generating} className="btn btn-primary w-full gap-2">
                {generating ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
                {generating ? 'Generating a private draft…' : 'Generate new draft'}
              </button>
            </>
          ) : (
            <section className="rounded-2xl border border-success/35 bg-success/5 p-5" aria-labelledby="regenerated-draft-title">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={23} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <h2 id="regenerated-draft-title" className="text-xl font-bold">New deck draft ready</h2>
                  <h3 className="mt-3 text-lg font-semibold">{draft.title || 'Untitled deck'}</h3>
                  {draft.description && <p className="mt-1 text-sm leading-relaxed text-base-content/60">{draft.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-2"><span className="badge badge-ghost">{draft.cards.length} {draft.cards.length === 1 ? 'card' : 'cards'}</span><span className="badge badge-ghost">Independent schedules</span></div>
                </div>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {onReviewDraft && <button type="button" onClick={() => void onReviewDraft(draft)} className="btn btn-outline gap-2" disabled={saving}><ListChecks size={17} aria-hidden="true" /> Review draft</button>}
                <button type="button" onClick={() => void save()} className="btn btn-primary gap-2" disabled={saving || draft.cards.length === 0}>{saving ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}{saving ? 'Saving new deck…' : 'Save as new deck'}</button>
              </div>
              <button type="button" onClick={() => { setLocalDraft(null); onDraftChange?.(null); setActivities([]) }} className="btn btn-ghost btn-sm mt-3" disabled={saving}>Discard draft and choose another source</button>
            </section>
          )}

          {(localError || generationError || saveError) && <div role="alert" className="alert alert-error text-sm"><span>{saveError || generationError || localError}</span></div>}

          {activities.length > 0 && (
            <section className="rounded-2xl bg-base-200/60 p-4" aria-labelledby="regeneration-progress-title" aria-busy={generating}>
              <h2 id="regeneration-progress-title" className="font-bold">Generation progress</h2>
              <ol className="mt-3 space-y-3" role="log" aria-live="polite" aria-relevant="additions">
                {activities.map((activity, index) => {
                  const current = generating && index === activities.length - 1
                  return <li key={activity.id} className="flex gap-3 text-sm">{current ? <CircleDashed size={18} className="mt-0.5 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />}<div><p className={current ? 'font-semibold' : 'text-base-content/70'}>{activity.message}</p>{activity.detail && <p className="mt-0.5 text-xs text-base-content/50">{activity.detail}</p>}</div></li>
                })}
              </ol>
            </section>
          )}
        </div>
      </section>
    </main>
  )
}
