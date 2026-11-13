import { useEffect, useId, useRef, useState } from 'react'
import type { SyntheticEvent } from 'react'
import { Camera, X } from 'lucide-react'
import { MAX_AVATAR_BYTES, AVATAR_CONTENT_TYPES, uploadAvatar } from '../lib/uploads'
import type { UploadedAvatar } from '../lib/uploads'
import type { User } from 'firebase/auth'

interface AvatarUploadDialogProps {
  open: boolean
  user: User
  currentAvatarUrl?: string | null
  nickname: string
  onSaved: (avatar: UploadedAvatar) => void
  onClose: () => void
}

const ACCEPT = AVATAR_CONTENT_TYPES.join(',')

function validateFile(file: File): string {
  if (!AVATAR_CONTENT_TYPES.includes(file.type)) return 'Avatars must be JPEG, PNG, or WebP images.'
  if (file.size < 1 || file.size > MAX_AVATAR_BYTES) return `Avatars must be smaller than ${Math.floor(MAX_AVATAR_BYTES / 1024 / 1024)} MB.`
  return ''
}

export default function AvatarUploadDialog({ open, user, currentAvatarUrl, nickname, onSaved, onClose }: AvatarUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const initial = (nickname.trim().charAt(0) || '?').toUpperCase()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setFile(null); setPreviewUrl(''); setUploading(false); setError('')
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const close = (): void => {
    if (!uploading) {
      setFile(null); setPreviewUrl(''); setError('')
      onClose()
    }
  }

  const cancelEvent = (event: SyntheticEvent<HTMLDialogElement>): void => {
    if (uploading) event.preventDefault()
    else close()
  }

  const pickFile = (next: File | null): void => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(next)
    setPreviewUrl(next ? URL.createObjectURL(next) : '')
    setError('')
  }

  const save = async (): Promise<void> => {
    if (!file || uploading) return
    setUploading(true); setError('')
    try {
      const avatar = await uploadAvatar(user, file)
      setFile(null); setPreviewUrl('')
      onSaved(avatar)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The avatar could not be saved.')
    } finally {
      setUploading(false)
    }
  }

  const shownUrl = previewUrl || currentAvatarUrl || ''

  return (
    <dialog ref={dialogRef} className="modal modal-bottom sm:modal-middle" onCancel={cancelEvent} aria-labelledby={titleId}>
      <div className="modal-box max-w-lg border border-base-300 p-0">
        <div className="border-b border-base-300 p-5 pr-14 sm:p-6">
          <button className="btn btn-circle btn-ghost btn-sm absolute right-3 top-3" onClick={close} aria-label="Close avatar editor" disabled={uploading}><X size={18} /></button>
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Camera size={24} /></div>
            <div>
              <h2 id={titleId} className="text-xl font-bold">Profile photo</h2>
              <p className="mt-1 text-sm text-base-content/60">JPEG, PNG, or WebP up to 2 MB. Replacing a photo deletes the stored previous one.</p>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {error && <div role="alert" className="alert alert-error mb-5"><span>{error}</span></div>}
          <div className="flex items-center gap-5">
            <div className="avatar">
              <div className="h-20 w-20 overflow-hidden rounded-2xl bg-primary text-2xl font-black text-primary-content ring-4 ring-base-100">
                {shownUrl ? <img src={shownUrl} alt="Avatar preview" referrerPolicy="no-referrer" /> : <div className="grid h-full w-full place-items-center" aria-hidden="true">{initial}</div>}
              </div>
            </div>
            <label className="form-control">
              <span className="label-text mb-2 font-semibold">Choose an image</span>
              <input
                type="file"
                accept={ACCEPT}
                onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
                className="file-input file-input-bordered file-input-sm w-full max-w-xs"
                disabled={uploading}
              />
            </label>
          </div>
          <div className="modal-action">
            <button className="btn btn-ghost" onClick={close} disabled={uploading}>Cancel</button>
            <button className="btn btn-primary gap-2" onClick={() => void save()} disabled={!file || uploading}>
              {uploading && <span className="loading loading-spinner loading-sm" />}
              Save photo
            </button>
          </div>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop"><button type="button" onClick={close} disabled={uploading}>Close</button></form>
    </dialog>
  )
}
