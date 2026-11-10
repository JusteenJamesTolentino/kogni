import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, SyntheticEvent } from 'react'
import { Eye, EyeOff, ShieldCheck, UserRound, X } from 'lucide-react'

export interface PublicProfileDraft {
  displayName: string
  isDiscoverable: boolean
}

export interface PublicProfileModalProps {
  open: boolean
  displayName?: string
  isDiscoverable?: boolean
  saving?: boolean
  error?: string
  onSave: (profile: PublicProfileDraft) => void | Promise<void>
  onClose: () => void
}

interface PublicProfileFormProps extends Omit<PublicProfileModalProps, 'open'> {
  titleId: string
  descriptionId: string
}

const MAX_DISPLAY_NAME_LENGTH = 80

function PublicProfileForm({
  displayName = '',
  isDiscoverable = false,
  saving = false,
  error = '',
  onSave,
  onClose,
  titleId,
  descriptionId,
}: PublicProfileFormProps) {
  const [draftName, setDraftName] = useState(displayName)
  const [draftDiscoverable, setDraftDiscoverable] = useState(isDiscoverable)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
  const normalizedName = draftName.trim().replace(/\s+/g, ' ')
  const nameInvalid = draftDiscoverable && !normalizedName

  useEffect(() => {
    window.setTimeout(() => nameInputRef.current?.focus(), 50)
  }, [])

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (saving || nameInvalid) return
    void onSave({ displayName: normalizedName, isDiscoverable: draftDiscoverable })
  }

  return (
    <div className="modal-box overflow-visible border border-base-300 p-0">
      <div className="border-b border-base-300 p-5 pr-14 sm:p-6 sm:pr-14">
        <button
          type="button"
          onClick={onClose}
          className="btn btn-circle btn-ghost btn-sm absolute right-3 top-3"
          aria-label="Close public profile settings"
          disabled={saving}
        >
          <X size={18} aria-hidden="true" />
        </button>
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <UserRound size={24} aria-hidden="true" />
          </div>
          <div>
            <h2 id={titleId} className="text-xl font-bold">Public profile</h2>
            <p id={descriptionId} className="mt-1 text-sm text-base-content/60">Control the name other learners can find and whether you appear in search.</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-5 sm:p-6">
        {error && <div id={errorId} role="alert" className="alert alert-error mb-5 text-sm"><span>{error}</span></div>}

        <label className="form-control w-full">
          <span className="label-text mb-2 font-semibold">Public display name</span>
          <input
            ref={nameInputRef}
            type="text"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            className={`input input-bordered w-full focus:input-primary ${nameInvalid ? 'input-error' : ''}`}
            placeholder="How learners will know you"
            autoComplete="nickname"
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            required={draftDiscoverable}
            aria-invalid={nameInvalid}
            aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ''}`}
            disabled={saving}
          />
          <span className="mt-2 flex justify-between gap-4 text-xs text-base-content/55">
            <span>Your email address is never displayed.</span>
            <span className="tabular-nums">{draftName.length}/{MAX_DISPLAY_NAME_LENGTH}</span>
          </span>
        </label>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-base-300 bg-base-200/50 p-4">
          <input
            type="checkbox"
            className="toggle toggle-primary mt-0.5"
            checked={draftDiscoverable}
            onChange={(event) => setDraftDiscoverable(event.target.checked)}
            disabled={saving}
          />
          <span>
            <span className="flex items-center gap-2 text-sm font-semibold">
              {draftDiscoverable ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
              Appear in learner search
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-base-content/55">Turn this off at any time to hide your profile from new searches.</span>
          </span>
        </label>

        <div className="mt-4 flex gap-2 rounded-xl bg-success/10 p-3 text-xs leading-relaxed text-base-content/70">
          <ShieldCheck size={17} className="shrink-0 text-success" aria-hidden="true" />
          Only your display name and profile image are public. Your decks remain private unless you explicitly share one.
        </div>

        <div className="modal-action mt-6">
          <button type="button" onClick={onClose} className="btn btn-ghost" disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary min-w-32" disabled={saving || nameInvalid}>
            {saving && <span className="loading loading-spinner loading-sm" aria-hidden="true" />}
            Save profile
          </button>
        </div>
      </form>
    </div>
  )
}

export default function PublicProfileModal({ open, ...formProps }: PublicProfileModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>): void => {
    if (formProps.saving) {
      event.preventDefault()
      return
    }
    formProps.onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-bottom sm:modal-middle"
      onCancel={handleCancel}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={formProps.saving}
    >
      {open && <PublicProfileForm {...formProps} titleId={titleId} descriptionId={descriptionId} />}
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={formProps.onClose} disabled={formProps.saving}>Close public profile settings</button>
      </form>
    </dialog>
  )
}
