import { useEffect, useId, useRef, useState } from 'react'
import { Check, Clipboard, Clock3, KeyRound, RefreshCw, RotateCw, ShieldAlert, Trash2 } from 'lucide-react'

export interface PortalCodeDetails {
  code: string
  expiresAt: number | string | Date
  createdAt?: number | string | Date
}

export type PortalCodeAction = 'create' | 'copy' | 'renew' | 'revoke' | 'rotate'

export interface PortalCodePanelProps {
  deckTitle: string
  currentCode?: PortalCodeDetails | null
  busyAction?: PortalCodeAction | null
  error?: string
  disabled?: boolean
  defaultExpiryDays?: number
  expiryOptions?: readonly number[]
  onCreate: (expiresInDays: number) => void | Promise<void>
  onRenew: (expiresInDays: number) => void | Promise<void>
  onRevoke: () => void | Promise<void>
  onRotate: (expiresInDays: number) => void | Promise<void>
  onCopy?: (code: string) => void | Promise<void>
}

const DEFAULT_EXPIRY_OPTIONS = [1, 7, 14, 30] as const

function formatExpiry(value: number | string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'Expiry unavailable'

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default function PortalCodePanel({
  deckTitle,
  currentCode = null,
  busyAction = null,
  error = '',
  disabled = false,
  defaultExpiryDays = 7,
  expiryOptions = DEFAULT_EXPIRY_OPTIONS,
  onCreate,
  onRenew,
  onRevoke,
  onRotate,
  onCopy,
}: PortalCodePanelProps) {
  const normalizedOptions = expiryOptions.filter((days) => Number.isFinite(days) && days > 0)
  const initialExpiry = normalizedOptions.includes(defaultExpiryDays)
    ? defaultExpiryDays
    : (normalizedOptions[0] ?? defaultExpiryDays)
  const [expiryDays, setExpiryDays] = useState(initialExpiry)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const codeInputRef = useRef<HTMLInputElement>(null)
  const expiryId = useId()
  const headingId = useId()
  const isBusy = busyAction !== null
  const isUnavailable = disabled || isBusy

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timeout)
  }, [copied])

  const copyCode = async (): Promise<void> => {
    if (!currentCode || isUnavailable) return
    setCopyError('')

    try {
      if (onCopy) {
        await onCopy(currentCode.code)
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(currentCode.code)
      } else {
        codeInputRef.current?.select()
        const copiedWithFallback = document.execCommand('copy')
        if (!copiedWithFallback) throw new Error('Copy was not available')
      }
      setCopied(true)
    } catch {
      codeInputRef.current?.select()
      setCopyError('Could not copy automatically. Select the code and copy it manually.')
    }
  }

  return (
    <section aria-labelledby={headingId} aria-busy={isBusy}>
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary/10 text-secondary">
          <KeyRound size={20} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 id={headingId} className="font-bold">Reusable portal code</h3>
          <p className="mt-1 text-sm leading-relaxed text-base-content/60">
            Let anyone with the code preview this deck and add a private copy to their library.
          </p>
        </div>
      </div>

      {(error || copyError) && (
        <div role="alert" className="alert alert-error mt-4 text-sm">
          <span>{error || copyError}</span>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-base-300 bg-base-200/40 p-4">
        {currentCode ? (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="form-control min-w-0 flex-1">
                <span className="label-text mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/55">Current code</span>
                <input
                  ref={codeInputRef}
                  className="input input-bordered w-full font-mono text-lg font-bold uppercase tracking-[0.16em]"
                  value={currentCode.code}
                  readOnly
                  aria-label={`Portal code for ${deckTitle}`}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <button
                type="button"
                className="btn btn-outline gap-2 sm:mt-7"
                onClick={() => void copyCode()}
                disabled={isUnavailable}
              >
                {busyAction === 'copy' ? (
                  <span className="loading loading-spinner loading-sm" aria-hidden="true" />
                ) : copied ? (
                  <Check size={17} aria-hidden="true" />
                ) : (
                  <Clipboard size={17} aria-hidden="true" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-base-content/60">
              <Clock3 size={14} className="shrink-0" aria-hidden="true" />
              Expires {formatExpiry(currentCode.expiresAt)}
            </p>
          </>
        ) : (
          <div className="py-2 text-center sm:px-6">
            <KeyRound size={28} className="mx-auto text-base-content/25" aria-hidden="true" />
            <p className="mt-2 font-semibold">No active portal code</p>
            <p className="mt-1 text-sm text-base-content/55">Create one when you are ready to share a snapshot.</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="form-control w-full sm:max-w-48" htmlFor={expiryId}>
          <span className="label-text mb-2 text-sm font-semibold">Code expiry</span>
          <select
            id={expiryId}
            className="select select-bordered w-full"
            value={expiryDays}
            onChange={(event) => setExpiryDays(Number(event.target.value))}
            disabled={isUnavailable}
          >
            {normalizedOptions.map((days) => (
              <option key={days} value={days}>{days} {days === 1 ? 'day' : 'days'}</option>
            ))}
          </select>
        </label>

        {!currentCode ? (
          <button
            type="button"
            className="btn btn-primary flex-1 gap-2"
            onClick={() => void onCreate(expiryDays)}
            disabled={isUnavailable || normalizedOptions.length === 0}
          >
            {busyAction === 'create' ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : <KeyRound size={17} aria-hidden="true" />}
            Create portal code
          </button>
        ) : (
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" className="btn btn-outline btn-sm gap-2 sm:btn-md" onClick={() => void onRenew(expiryDays)} disabled={isUnavailable}>
              {busyAction === 'renew' ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
              Renew
            </button>
            <button type="button" className="btn btn-outline btn-sm gap-2 sm:btn-md" onClick={() => void onRotate(expiryDays)} disabled={isUnavailable}>
              {busyAction === 'rotate' ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : <RotateCw size={16} aria-hidden="true" />}
              Rotate
            </button>
            <button type="button" className="btn btn-error btn-outline btn-sm gap-2 sm:btn-md" onClick={() => void onRevoke()} disabled={isUnavailable}>
              {busyAction === 'revoke' ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
              Revoke
            </button>
          </div>
        )}
      </div>

      <div className="alert alert-warning mt-4 items-start text-sm" role="note">
        <ShieldAlert size={19} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">Portal sharing creates independent snapshots.</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed">
            <li>Changes to this deck do not sync to copies already added.</li>
            <li>Revoking or rotating the code blocks future access but does not retract existing copies.</li>
          </ul>
        </div>
      </div>
    </section>
  )
}
