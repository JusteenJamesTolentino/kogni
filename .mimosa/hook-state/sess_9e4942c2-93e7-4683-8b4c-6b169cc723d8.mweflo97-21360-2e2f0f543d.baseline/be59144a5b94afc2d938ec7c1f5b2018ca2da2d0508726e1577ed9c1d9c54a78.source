import { useEffect, useRef, useState } from 'react'
import type { DragEvent, SyntheticEvent } from 'react'
import { CheckCircle2, CircleDashed, FileText, KeyRound, Sparkles, UploadCloud, WandSparkles, X } from 'lucide-react'
import { generateDeckFromFile } from '../lib/gemini'
import type { GenerationProgress } from '../lib/gemini'
import { getErrorMessage } from '../lib/errors'
import {
  ACCEPTED_FILE_TYPES,
  ALLOWED_FILE_MIME_TYPES,
  MAX_INLINE_FILE_SIZE,
  MAX_INLINE_FILE_SIZE_LABEL,
  SUPPORTED_FILE_TYPES_LABEL,
} from '../lib/geminiFiles'
import type { GeneratedDeck } from '../types/domain'

type ImportStatus = 'idle' | 'generating' | 'success' | 'error'

interface ActivityEntry {
  id: number
  message: string
  detail?: string
}

interface MagicImportProps {
  apiKey: string
  model: string
  onOpenApiKey: () => void
  onComplete: (deck: GeneratedDeck) => void | Promise<void>
  onBusyChange?: (busy: boolean) => void
}

export default function MagicImport({ apiKey, model, onOpenApiKey, onComplete, onBusyChange }: MagicImportProps) {
  const pendingDraft = useRef<GeneratedDeck | null>(null)
  const generating = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const activityIdRef = useRef(0)
  const [hasPendingDraft, setHasPendingDraft] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [error, setError] = useState('')
  const [activities, setActivities] = useState<ActivityEntry[]>([])
  const busy = status === 'generating'

  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (busy && !dialog.open) dialog.showModal()
    if (!busy && dialog.open) dialog.close()
  }, [busy])

  useEffect(() => {
    if (!busy) return

    const preventUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', preventUnload)
    return () => window.removeEventListener('beforeunload', preventUnload)
  }, [busy])

  const addActivity = (message: string, detail?: string): void => {
    activityIdRef.current += 1
    setActivities((current) => [...current, { id: activityIdRef.current, message, detail }])
  }

  const handleProgress = (progress: GenerationProgress): void => {
    addActivity(progress.message, progress.model)
  }

  const selectFile = (selectedFile?: File): void => {
    setError('')
    if (!selectedFile) return

    if (!ALLOWED_FILE_MIME_TYPES.has(selectedFile.type)) {
      setError(`Choose a ${SUPPORTED_FILE_TYPES_LABEL} file.`)
      return
    }

    if (selectedFile.size > MAX_INLINE_FILE_SIZE) {
      setError(`That file is larger than ${MAX_INLINE_FILE_SIZE_LABEL}. Choose a smaller file.`)
      return
    }

    pendingDraft.current = null
    setHasPendingDraft(false)
    setFile(selectedFile)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragActive(false)
    selectFile(event.dataTransfer.files[0])
  }

  const handleGenerate = async (): Promise<void> => {
    if (!apiKey || !model) {
      onOpenApiKey()
      return
    }
    if (!file || generating.current) return
    generating.current = true

    activityIdRef.current = 0
    setActivities([])
    setStatus('generating')
    setError('')

    try {
      const generated = pendingDraft.current ?? await generateDeckFromFile(file, apiKey, model, handleProgress, {
        autoRepairStudyGuide: true,
      })
      if (!generated.cards.length) throw new Error('Gemini did not find enough study material in this file.')
      pendingDraft.current = generated
      setHasPendingDraft(true)
      addActivity('Saving a private deck to your cloud account')
      await onComplete(generated)
      pendingDraft.current = null
      setHasPendingDraft(false)
      setStatus('success')
    } catch (generationError: unknown) {
      setStatus('error')
      setError(getErrorMessage(generationError, 'We could not generate or save this deck. A generated draft stays available here for retry.'))
    } finally {
      generating.current = false
    }
  }

  const preventDialogCancel = (event: SyntheticEvent<HTMLDialogElement>): void => {
    if (busy) event.preventDefault()
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <section className="mx-auto max-w-3xl rounded-3xl bg-gradient-to-br from-primary/25 via-secondary/15 to-primary/10 p-5 text-center shadow-lg shadow-primary/10 ring-1 ring-primary/30 sm:p-8">
        <div className="badge badge-primary badge-lg mb-3 gap-1.5 shadow-md shadow-primary/30"><WandSparkles size={15} aria-hidden="true" /> Magic import</div>
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Turn a document into a study deck</h1>
        <p className="mx-auto mt-3 max-w-2xl text-base-content/70">Choose a PDF or image source file. Your own Google AI Studio key and project quota create one exact 30-question verified deck.</p>
      </section>

      <section className="mx-auto mt-8 max-w-3xl rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/10 via-base-100 to-secondary/10 p-4 shadow-2xl shadow-primary/20 sm:p-7" aria-labelledby="upload-title">
        {(!apiKey || !model) && (
          <div role="alert" className="alert alert-warning mb-5">
            <KeyRound size={20} aria-hidden="true" />
            <div><h3 className="font-bold">Use your own Google AI Studio key to generate</h3><p className="text-xs">Kogni provides no shared key. Existing/shared decks stay key-free; generation uses your project quota and may incur charges.</p></div>
            <button type="button" onClick={onOpenApiKey} className="btn btn-sm">Set up AI generation</button>
          </div>
        )}

        <div
          className={`relative grid min-h-64 place-items-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${dragActive ? 'border-primary bg-primary/20' : 'border-primary/50 bg-primary/10 hover:border-primary hover:bg-primary/15'}`}
          onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <input ref={inputRef} type="file" accept={ACCEPTED_FILE_TYPES} onChange={(event) => selectFile(event.target.files?.[0])} className="sr-only" aria-label="Choose a document to import" />

          {file ? (
            <div className="w-full max-w-md">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-success/10 text-success"><FileText size={28} aria-hidden="true" /></div>
              <h2 id="upload-title" className="mt-4 break-all text-lg font-bold">{file.name}</h2>
              <p className="mt-1 text-sm text-base-content/55">{(file.size / 1024 / 1024).toFixed(2)} MB · Ready to transform</p>
              <button type="button" onClick={() => setFile(null)} className="btn btn-ghost btn-sm mt-3 gap-1 text-error"><X size={15} aria-hidden="true" /> Remove</button>
            </div>
          ) : (
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-content shadow-lg shadow-primary/40"><UploadCloud size={28} aria-hidden="true" /></div>
              <h2 id="upload-title" className="mt-4 text-lg font-bold">Drop your document here</h2>
              <p className="mt-1 text-sm text-base-content/60">PDF, JPEG, PNG, or WebP up to {MAX_INLINE_FILE_SIZE_LABEL}</p>
              <button type="button" onClick={() => inputRef.current?.click()} className="btn btn-primary btn-sm mt-5 gap-2 shadow-md shadow-primary/30">Browse files</button>
            </div>
          )}
        </div>

        {error && <div role="alert" className="alert alert-error mt-5 text-sm"><span>{error}</span></div>}
        {status === 'success' && <div role="status" className="alert alert-success mt-5"><span>Deck saved. Taking you back to the dashboard…</span></div>}

        {apiKey && model && <div className="mt-5 flex items-center justify-between rounded-xl bg-success/10 px-4 py-3 text-sm"><span className="font-semibold text-success">Gemini configured · {model}</span><button type="button" onClick={onOpenApiKey} className="btn btn-ghost btn-xs">Change settings</button></div>}
        <button type="button" onClick={() => void handleGenerate()} disabled={!file || busy || status === 'success'} className="btn btn-primary mt-5 w-full gap-2 shadow-lg shadow-primary/40">
          {busy ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
          {busy ? 'Building your deck…' : hasPendingDraft ? 'Retry saving generated deck' : !apiKey || !model ? 'Set up AI generation' : 'Generate 30-question deck'}
        </button>
      </section>

      <dialog ref={dialogRef} className="modal modal-bottom sm:modal-middle" onCancel={preventDialogCancel} aria-labelledby="generation-title" aria-describedby="generation-warning">
        <div className="modal-box border border-base-300 sm:max-w-xl">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <span className="loading loading-spinner loading-md" aria-hidden="true" />
            </div>
            <div>
              <h2 id="generation-title" className="text-xl font-bold">Building your study deck</h2>
              <p id="generation-warning" className="mt-1 text-sm text-base-content/65">Keep this tab open. Closing or reloading will interrupt the import.</p>
            </div>
          </div>

          <div className="mt-5 max-h-72 overflow-y-auto rounded-2xl bg-base-200/60 p-3" role="log" aria-live="polite" aria-relevant="additions">
            <ol className="space-y-3">
              {activities.map((activity, index) => {
                const current = index === activities.length - 1
                return (
                  <li key={activity.id} className="flex gap-3 text-sm">
                    {current ? <CircleDashed size={18} className="mt-0.5 shrink-0 animate-spin text-primary" aria-hidden="true" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />}
                    <div>
                      <p className={current ? 'font-semibold' : 'text-base-content/70'}>{activity.message}</p>
                      {activity.detail && <p className="mt-0.5 text-xs text-base-content/50">{activity.detail}</p>}
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>

          <p className="mt-4 text-center text-xs text-base-content/50">Controls are locked until generation and saving finish.</p>
        </div>
      </dialog>
    </main>
  )
}
