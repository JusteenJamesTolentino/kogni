import { useEffect, useId, useRef, useState } from 'react'
import type { SyntheticEvent } from 'react'
import { Check, ExternalLink, KeyRound, ShieldAlert, Sparkles, Trash2, X } from 'lucide-react'
import { verifyGeminiSettings } from '../lib/geminiVerification'
import type { GeminiSettings } from '../lib/geminiSettings'

interface ApiKeyModalProps {
  open: boolean
  currentKey: string
  currentModel: string
  onSave: (settings: GeminiSettings) => void
  onRemove?: () => void
  onClose: () => void
  canClose?: boolean
}

const steps = ['Before you begin', 'Create a key', 'Key and model', 'Verify']

export default function ApiKeyModal({ open, currentKey, currentModel, onSave, onRemove, onClose, canClose = true }: ApiKeyModalProps) {
  const [step, setStep] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(currentModel || '')
  const [replacing, setReplacing] = useState(!currentKey)
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const savedKeyConfigured = Boolean(currentKey)
  const effectiveKey = replacing ? apiKey : currentKey

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setStep(0); setApiKey(''); setModel(currentModel || ''); setReplacing(!currentKey); setVerified(false); setError('')
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [currentKey, currentModel, open])

  const close = (): void => {
    if (!verifying && canClose) {
      setApiKey(''); setVerified(false); setError(''); onClose()
    }
  }

  const changed = (): void => {
    setVerified(false)
    setError('')
  }

  const verify = async (): Promise<void> => {
    setVerifying(true); setError('')
    try {
      await verifyGeminiSettings(effectiveKey, model)
      setVerified(true)
    } catch (cause: unknown) {
      setVerified(false)
      setError(cause instanceof Error ? cause.message : 'Verification could not be completed.')
    } finally { setVerifying(false) }
  }

  const save = (): void => {
    if (!verified) return
    onSave({ apiKey: effectiveKey.trim(), model: model.trim() })
    setApiKey(''); setVerified(false)
  }

  const cancelEvent = (event: SyntheticEvent<HTMLDialogElement>): void => {
    if (!canClose || verifying) event.preventDefault()
    else close()
  }

  return (
    <dialog ref={dialogRef} className="modal modal-bottom sm:modal-middle" onCancel={cancelEvent} aria-labelledby={titleId}>
      <div className="modal-box max-w-3xl border border-base-300 p-0">
        <div className="border-b border-base-300 p-5 pr-14 sm:p-6">
          {canClose && <button className="btn btn-circle btn-ghost btn-sm absolute right-3 top-3" onClick={close} aria-label="Close AI generation setup" disabled={verifying}><X size={18} /></button>}
          <div className="flex items-start gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><KeyRound size={24} /></div><div><h2 id={titleId} className="text-xl font-bold">AI generation setup</h2><p className="mt-1 text-sm text-base-content/60">Use your own Google AI Studio key and project quota.</p></div></div>
          <ul className="steps steps-horizontal mt-5 w-full overflow-x-auto text-xs">{steps.map((label, index) => <li key={label} className={`step ${index <= step ? 'step-primary' : ''}`}>{label}</li>)}</ul>
        </div>

        <div className="p-5 sm:p-6">
          {error && <div role="alert" className="alert alert-error mb-5"><span>{error}</span></div>}
          {step === 0 && <div>
            <div className="alert alert-info"><Sparkles size={20} /><div><h3 className="font-bold">AI deck generation requires your own Google AI Studio API key.</h3><p className="text-sm">Kogni does not provide a shared Gemini key. Generation, regeneration, and creator continuations use your project quota and may incur charges.</p></div></div>
            <p className="mt-4 text-sm text-base-content/65">Browsing, copying, practicing, reviewing, Community, profiles, leaderboards, and shared decks remain available without any Gemini key.</p>
            <div className="modal-action"><button className="btn btn-ghost" onClick={close}>Not now</button><button className="btn btn-primary" onClick={() => setStep(1)}>Set up AI generation</button></div>
          </div>}

          {step === 1 && <div>
            <ol className="space-y-3">{[
              'Sign in to Google AI Studio.',
              'Create, import, or select a Google Cloud project you control or are authorized to use.',
              'Review that project’s billing status, Gemini pricing, and current quotas.',
              'Choose Create API key in that project.',
              'Copy the key and return to Kogni.',
            ].map((text, index) => <li key={text} className="flex gap-3 rounded-2xl bg-base-200/50 p-4"><span className="badge badge-primary">{index + 1}</span><span>{text}</span></li>)}</ol>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-5 gap-2">Open Google AI Studio <ExternalLink size={16} /></a>
            <div className="mt-4 flex flex-wrap gap-3 text-sm"><a className="link" target="_blank" rel="noopener noreferrer" href="https://aistudio.google.com/docs/models">Models</a><a className="link" target="_blank" rel="noopener noreferrer" href="https://aistudio.google.com/docs/pricing">Pricing</a><a className="link" target="_blank" rel="noopener noreferrer" href="https://aistudio.google.com/docs/billing">Billing</a><a className="link" target="_blank" rel="noopener noreferrer" href="https://aistudio.google.com/docs/rate-limits">Rate limits</a></div>
            <div className="alert alert-warning mt-5 items-start"><ShieldAlert size={20} /><span className="text-sm">Use only projects you control or are authorized to use. Free-tier availability varies. Paid projects may incur charges. Prefer a dedicated key/project, monitor quotas, and apply compatible API/referrer restrictions. Restrictions reduce misuse but do not make a browser key secret.</span></div>
            <div className="modal-action"><button className="btn btn-ghost" onClick={() => setStep(0)}>Back</button><button className="btn btn-primary" onClick={() => setStep(2)}>I have a key</button></div>
          </div>}

          {step === 2 && <div className="space-y-5">
            {savedKeyConfigured && !replacing ? <div className="alert alert-success"><Check size={18} /><span>Key configured in this browser.</span><button className="btn btn-sm" onClick={() => { setReplacing(true); changed() }}>Replace key</button></div> : <label className="form-control"><span className="label-text mb-2 font-semibold">Google AI Studio API key</span><input type="password" value={apiKey} onChange={(event) => { setApiKey(event.target.value); changed() }} className="input input-bordered" autoComplete="new-password" spellCheck={false} autoCapitalize="none" placeholder="Paste your key" /></label>}
            <label className="form-control"><span className="label-text mb-2 font-semibold">Exact model ID</span><input value={model} onChange={(event) => { setModel(event.target.value); changed() }} className="input input-bordered" autoComplete="off" spellCheck={false} placeholder="Paste an exact model ID" /><span className="mt-2 text-xs text-base-content/55">The model must be available to the same project, support generateContent, and support your source type. Kogni will not silently switch models.</span></label>
            <div className="modal-action"><button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button><button className="btn btn-primary" disabled={!effectiveKey.trim() || !model.trim()} onClick={() => setStep(3)}>Continue</button></div>
          </div>}

          {step === 3 && <div>
            <div className="rounded-2xl bg-base-200/50 p-5"><h3 className="font-bold">Verify before saving</h3><p className="mt-2 text-sm text-base-content/60">Testing checks that Google accepts the key and the project can access this model for content generation. It creates no deck, uploads no source, and does not prove PDF/image compatibility, future availability, or sufficient generation quota.</p><p className="mt-2 text-sm"><strong>Model:</strong> {model}</p></div>
            <div className="alert alert-warning mt-5 items-start"><ShieldAlert size={20} /><span className="text-sm">The key is stored in browser localStorage and is readable by same-origin scripts, browser extensions, shared browser profiles, or people with device access. Kogni sends it directly to Google only when you explicitly test settings or generate. It is never stored in Firebase, decks, shares, portals, logs, analytics, or URLs.</span></div>
            {verified && <div className="alert alert-success mt-4"><Check size={18} /><span>Key and model access verified.</span></div>}
            <div className="modal-action"><button className="btn btn-ghost" onClick={() => setStep(2)} disabled={verifying}>Back</button><button className="btn btn-outline" onClick={() => void verify()} disabled={verifying}>{verifying ? <span className="loading loading-spinner loading-sm" /> : 'Test key and model'}</button><button className="btn btn-primary" onClick={save} disabled={!verified}>Save settings</button></div>
            {savedKeyConfigured && onRemove && <button className="btn btn-error btn-outline mt-6 w-full gap-2" onClick={() => { onRemove(); close() }} disabled={verifying}><Trash2 size={17} />Remove saved AI settings</button>}
          </div>}
        </div>
      </div>
      {canClose && <form method="dialog" className="modal-backdrop"><button type="button" onClick={close}>Close</button></form>}
    </dialog>
  )
}
