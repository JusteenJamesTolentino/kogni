import { useEffect, useId, useRef, useState } from 'react'
import type { SyntheticEvent } from 'react'
import { AlertTriangle, CheckCircle2, CloudOff, CopyX, DatabaseZap, Trash2, XCircle } from 'lucide-react'

export type PortalRevokeStatus = 'idle' | 'revoking' | 'revoked' | 'error'

export interface DeleteDeckResult {
  portalRevokeStatus?: Exclude<PortalRevokeStatus, 'idle' | 'revoking'>
  portalRevokeError?: string
}

export interface DeleteDeckDialogProps {
  open: boolean
  deckTitle: string
  cardCount: number
  deleting?: boolean
  deleteError?: string
  isOfflineSnapshot?: boolean
  isSourceCopy?: boolean
  hasActivePortal?: boolean
  portalRevokeStatus?: PortalRevokeStatus
  portalRevokeError?: string
  onDelete: () => DeleteDeckResult | void | Promise<DeleteDeckResult | void>
  onClose: () => void
}

export default function DeleteDeckDialog({
  open,
  deckTitle,
  cardCount,
  deleting: controlledDeleting,
  deleteError = '',
  isOfflineSnapshot = false,
  isSourceCopy = false,
  hasActivePortal = false,
  portalRevokeStatus: controlledPortalStatus,
  portalRevokeError = '',
  onDelete,
  onClose,
}: DeleteDeckDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const [localDeleting, setLocalDeleting] = useState(false)
  const [localError, setLocalError] = useState('')
  const [localPortalStatus, setLocalPortalStatus] = useState<PortalRevokeStatus>('idle')
  const [localPortalError, setLocalPortalError] = useState('')
  const deleting = controlledDeleting ?? localDeleting
  const portalStatus = controlledPortalStatus ?? localPortalStatus
  const error = deleteError || localError
  const revokeError = portalRevokeError || localPortalError

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      window.setTimeout(() => cancelRef.current?.focus(), 0)
    } else if (!open && dialog.open) {
      dialog.close()
      setLocalError('')
      setLocalPortalError('')
      setLocalPortalStatus('idle')
    }
  }, [open])

  const close = (): void => {
    if (!deleting) onClose()
  }

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>): void => {
    if (deleting) event.preventDefault()
    else onClose()
  }

  const remove = async (): Promise<void> => {
    if (deleting) return
    const revokingPortal = hasActivePortal
    setLocalDeleting(true)
    setLocalError('')
    setLocalPortalError('')
    if (hasActivePortal) setLocalPortalStatus('revoking')
    try {
      const result = await onDelete()
      if (result?.portalRevokeStatus) setLocalPortalStatus(result.portalRevokeStatus)
      if (result?.portalRevokeError) setLocalPortalError(result.portalRevokeError)
    } catch (deleteFailure: unknown) {
      setLocalError(deleteFailure instanceof Error ? deleteFailure.message : 'This deck could not be deleted.')
      if (revokingPortal) setLocalPortalStatus('error')
    } finally {
      setLocalDeleting(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="modal modal-bottom sm:modal-middle" onCancel={handleCancel} aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={deleting}>
      <div className="modal-box overflow-y-auto border border-error/35 p-0 sm:max-w-xl">
        <div className="border-b border-error/25 bg-error/10 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-error text-error-content"><Trash2 size={23} aria-hidden="true" /></div>
            <div className="min-w-0">
              <span className="badge badge-error badge-outline">Danger zone</span>
              <h2 id={titleId} className="mt-2 text-2xl font-black">Delete local deck?</h2>
              <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-base-content/65">This permanently deletes <strong className="font-semibold text-base-content">{deckTitle || 'Untitled deck'}</strong> from this browser.</p>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <section className="rounded-2xl border border-base-300 bg-base-200/50 p-4" aria-labelledby="delete-removes-title">
            <h3 id="delete-removes-title" className="font-bold">This browser will lose</h3>
            <ul className="mt-3 space-y-2 text-sm text-base-content/70">
              <li className="flex gap-2"><DatabaseZap size={17} className="mt-0.5 shrink-0 text-error" aria-hidden="true" /><span>{cardCount} local {cardCount === 1 ? 'card' : 'cards'}, learning schedules, and review progress</span></li>
              <li className="flex gap-2"><CopyX size={17} className="mt-0.5 shrink-0 text-error" aria-hidden="true" /><span>Local provenance and lineage links stored with this deck</span></li>
            </ul>
          </section>

          {(isOfflineSnapshot || isSourceCopy) && (
            <div className="alert border-warning/35 bg-warning/10 text-sm" role="note">
              <CloudOff size={20} className="text-warning" aria-hidden="true" />
              <div>
                <h3 className="font-bold">{isOfflineSnapshot ? 'Offline snapshot' : 'Independent source copy'}</h3>
                <p className="mt-0.5 text-xs leading-relaxed">Deleting this local copy does not delete the source deck, published online versions, the sender's deck, or copies already saved by other learners.</p>
              </div>
            </div>
          )}

          {!isOfflineSnapshot && !isSourceCopy && (
            <p className="text-xs leading-relaxed text-base-content/55">Published versions, direct-share snapshots, and copies already imported on other devices or by other learners cannot be removed from here.</p>
          )}

          {hasActivePortal && (
            <div className="rounded-2xl border border-base-300 p-4" aria-live="polite">
              <div className="flex items-start gap-3">
                {portalStatus === 'revoking' ? <span className="loading loading-spinner loading-sm mt-0.5 text-primary" aria-hidden="true" /> : portalStatus === 'revoked' ? <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-success" aria-hidden="true" /> : portalStatus === 'error' ? <XCircle size={19} className="mt-0.5 shrink-0 text-error" aria-hidden="true" /> : <AlertTriangle size={19} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />}
                <div><h3 className="font-bold">Active portal code</h3><p className="mt-0.5 text-xs leading-relaxed text-base-content/60">{portalStatus === 'revoking' ? 'Revoking the portal before local deletion…' : portalStatus === 'revoked' ? 'The portal was revoked.' : portalStatus === 'error' ? 'The portal could not be revoked.' : 'The active portal will be revoked before this local deck is deleted.'}</p></div>
              </div>
              {revokeError && <p role="alert" className="mt-2 text-xs font-semibold text-error">{revokeError}</p>}
            </div>
          )}

          {error && <div role="alert" className="alert alert-error text-sm"><span>{error}</span></div>}

          <div className="modal-action mt-0 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button ref={cancelRef} type="button" onClick={close} className="btn btn-outline" disabled={deleting}>Cancel, keep deck</button>
            <button type="button" onClick={() => void remove()} className="btn btn-error gap-2" disabled={deleting}>{deleting ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : <Trash2 size={17} aria-hidden="true" />}{deleting ? (hasActivePortal && portalStatus === 'revoking' ? 'Revoking portal…' : 'Deleting…') : 'Delete local deck'}</button>
          </div>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop"><button type="button" onClick={close} disabled={deleting}>Cancel deletion</button></form>
    </dialog>
  )
}
