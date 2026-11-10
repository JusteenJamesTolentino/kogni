import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, SyntheticEvent } from 'react'
import { Check, KeyRound, Search, Send, Share2, UserRoundSearch, X } from 'lucide-react'
import type { CommunitySearchResult } from './Community'
import PortalCodePanel from './PortalCodePanel'
import type { PortalCodeAction, PortalCodeDetails } from './PortalCodePanel'

export interface ShareableDeckSummary {
  id: string
  title: string
  description?: string
  cardCount?: number
}

export interface ShareDeckModalProps {
  open: boolean
  deck: ShareableDeckSummary | null
  searchQuery: string
  searchResults: CommunitySearchResult[]
  searchLoading?: boolean
  searchError?: string
  sharing?: boolean
  shareError?: string
  onSearchQueryChange: (query: string) => void
  onSearchSubmit?: (query: string) => void | Promise<void>
  onShare: (recipient: CommunitySearchResult) => void | Promise<void>
  portalCode?: PortalCodeDetails | null
  portalBusyAction?: PortalCodeAction | null
  portalError?: string
  portalDisabled?: boolean
  portalDefaultExpiryDays?: number
  portalExpiryOptions?: readonly number[]
  onCreatePortalCode?: (expiresInDays: number) => void | Promise<void>
  onRenewPortalCode?: (expiresInDays: number) => void | Promise<void>
  onRevokePortalCode?: () => void | Promise<void>
  onRotatePortalCode?: (expiresInDays: number) => void | Promise<void>
  onCopyPortalCode?: (code: string) => void | Promise<void>
  onClose: () => void
}

export default function ShareDeckModal({
  open,
  deck,
  searchQuery,
  searchResults,
  searchLoading = false,
  searchError = '',
  sharing = false,
  shareError = '',
  onSearchQueryChange,
  onSearchSubmit,
  onShare,
  portalCode = null,
  portalBusyAction = null,
  portalError = '',
  portalDisabled = false,
  portalDefaultExpiryDays,
  portalExpiryOptions,
  onCreatePortalCode,
  onRenewPortalCode,
  onRevokePortalCode,
  onRotatePortalCode,
  onCopyPortalCode,
  onClose,
}: ShareDeckModalProps) {
  const [selectedRecipient, setSelectedRecipient] = useState<CommunitySearchResult | null>(null)
  const [activeTab, setActiveTab] = useState<'direct' | 'portal'>('direct')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const searchResultsId = useId()
  const directTabId = useId()
  const directPanelId = useId()
  const portalTabId = useId()
  const portalPanelId = useId()
  const trimmedQuery = searchQuery.trim()
  const portalEnabled = Boolean(onCreatePortalCode && onRenewPortalCode && onRevokePortalCode && onRotatePortalCode)
  const modalBusy = sharing || portalBusyAction !== null

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
      window.setTimeout(() => {
        if (activeTab === 'direct') searchInputRef.current?.focus()
      }, 50)
    }
    if (!open && dialog.open) {
      dialog.close()
      window.setTimeout(() => {
        setSelectedRecipient(null)
        setActiveTab('direct')
      }, 0)
    }
  }, [activeTab, open])

  const handleSearch = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (trimmedQuery) void onSearchSubmit?.(trimmedQuery)
  }

  const handleShare = (): void => {
    if (!selectedRecipient || sharing || !deck) return
    void onShare(selectedRecipient)
  }

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>): void => {
    if (modalBusy) {
      event.preventDefault()
      return
    }
    setSelectedRecipient(null)
    onClose()
  }

  const handleClose = (): void => {
    if (modalBusy) return
    setSelectedRecipient(null)
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-bottom sm:modal-middle"
      onCancel={handleCancel}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={modalBusy}
    >
      <div className="modal-box max-w-2xl overflow-y-auto border border-base-300 p-0">
        <div className="border-b border-base-300 p-5 pr-14 sm:p-6 sm:pr-14">
          <button
            type="button"
            onClick={handleClose}
            className="btn btn-circle btn-ghost btn-sm absolute right-3 top-3"
            aria-label="Close share deck dialog"
            disabled={modalBusy}
          >
            <X size={18} aria-hidden="true" />
          </button>
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Share2 size={24} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl font-bold">Share deck</h2>
              <p id={descriptionId} className="mt-1 text-sm text-base-content/60">
                Share <strong className="font-semibold text-base-content">{deck?.title || 'this deck'}</strong> directly or create a reusable portal code.
              </p>
              {deck?.cardCount !== undefined && <span className="badge badge-ghost badge-sm mt-2">{deck.cardCount} {deck.cardCount === 1 ? 'card' : 'cards'}</span>}
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {portalEnabled && (
            <div role="tablist" aria-label="Share method" aria-orientation="horizontal" className="tabs tabs-boxed mb-5 grid grid-cols-2 bg-base-200" onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
              event.preventDefault()
              const nextTab = activeTab === 'direct' ? 'portal' : 'direct'
              setActiveTab(nextTab)
              window.setTimeout(() => document.getElementById(nextTab === 'direct' ? directTabId : portalTabId)?.focus(), 0)
            }}>
              <button
                id={directTabId}
                type="button"
                role="tab"
                className={`tab gap-2 ${activeTab === 'direct' ? 'tab-active' : ''}`}
                aria-selected={activeTab === 'direct'}
                aria-controls={directPanelId}
                tabIndex={activeTab === 'direct' ? 0 : -1}
                onClick={() => {
                  setActiveTab('direct')
                  window.setTimeout(() => searchInputRef.current?.focus(), 0)
                }}
                disabled={modalBusy}
              >
                <Send size={16} aria-hidden="true" />
                Direct share
              </button>
              <button
                id={portalTabId}
                type="button"
                role="tab"
                className={`tab gap-2 ${activeTab === 'portal' ? 'tab-active' : ''}`}
                aria-selected={activeTab === 'portal'}
                aria-controls={portalPanelId}
                tabIndex={activeTab === 'portal' ? 0 : -1}
                onClick={() => setActiveTab('portal')}
                disabled={modalBusy}
              >
                <KeyRound size={16} aria-hidden="true" />
                Portal code
              </button>
            </div>
          )}

          <div
            id={directPanelId}
            role={portalEnabled ? 'tabpanel' : undefined}
            aria-labelledby={portalEnabled ? directTabId : undefined}
            hidden={portalEnabled && activeTab !== 'direct'}
          >
            {(searchError || shareError) && (
              <div role="alert" className="alert alert-error mb-5 text-sm">
                <span>{shareError || searchError}</span>
              </div>
            )}

            <form role="search" onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row">
              <label className="input input-bordered flex min-w-0 flex-1 items-center gap-2 focus-within:input-primary">
                <Search size={18} className="shrink-0 text-base-content/45" aria-hidden="true" />
                <span className="sr-only">Search recipients by display name</span>
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(event) => {
                    onSearchQueryChange(event.target.value)
                    setSelectedRecipient(null)
                  }}
                  className="min-w-0 grow"
                  placeholder="Search public display names"
                  autoComplete="off"
                  enterKeyHint="search"
                  aria-controls={searchResultsId}
                  disabled={sharing}
                />
              </label>
              <button type="submit" className="btn btn-outline gap-2" disabled={!trimmedQuery || searchLoading || sharing}>
                {searchLoading ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
                Search
              </button>
            </form>

            <div id={searchResultsId} className="mt-4 min-h-48 overflow-hidden rounded-2xl border border-base-300" aria-live="polite" aria-busy={searchLoading}>
              {searchLoading ? (
                <div className="space-y-2 p-3" aria-label="Searching for recipients">
                  {[0, 1, 2].map((item) => <div key={item} className="skeleton h-14 w-full rounded-xl" />)}
                </div>
              ) : !trimmedQuery ? (
                <div className="grid min-h-48 place-items-center px-6 py-8 text-center">
                  <div>
                    <UserRoundSearch size={29} className="mx-auto text-base-content/25" aria-hidden="true" />
                    <h3 className="mt-3 font-bold">Choose a recipient</h3>
                    <p className="mt-1 text-sm text-base-content/55">Search by the public name they use on Kognit.</p>
                  </div>
                </div>
              ) : !searchError && !searchResults.length ? (
                <div className="grid min-h-48 place-items-center px-6 py-8 text-center">
                  <div>
                    <Search size={29} className="mx-auto text-base-content/25" aria-hidden="true" />
                    <h3 className="mt-3 font-bold">No matching learners</h3>
                    <p className="mt-1 text-sm text-base-content/55">Try another spelling or a shorter name.</p>
                  </div>
                </div>
              ) : (
                <ul className="max-h-64 divide-y divide-base-300 overflow-y-auto" aria-label="Recipient search results">
                  {searchResults.map((result) => {
                    const selected = selectedRecipient?.id === result.id
                    return (
                      <li key={result.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedRecipient(result)}
                          className={`flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-base-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary ${selected ? 'bg-primary/10' : ''}`}
                          aria-pressed={selected}
                          disabled={sharing}
                        >
                          <span className="avatar shrink-0">
                            <span className="h-10 w-10 overflow-hidden rounded-full bg-primary/10 text-primary">
                              {result.photoURL ? (
                                <img src={result.photoURL} alt="" referrerPolicy="no-referrer" />
                              ) : (
                                <span className="grid h-full w-full place-items-center font-bold" aria-hidden="true">{(result.displayName.trim().charAt(0) || '?').toUpperCase()}</span>
                              )}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{result.displayName}</span>
                            <span className="block truncate text-xs text-base-content/50">Kognit learner</span>
                          </span>
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border ${selected ? 'border-primary bg-primary text-primary-content' : 'border-base-300'}`}>
                            {selected && <Check size={16} aria-hidden="true" />}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="modal-action mt-6">
              <button type="button" onClick={handleClose} className="btn btn-ghost" disabled={modalBusy}>Cancel</button>
              <button type="button" onClick={handleShare} className="btn btn-primary min-w-36 gap-2" disabled={!selectedRecipient || !deck || sharing}>
                {sharing ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}
                {sharing ? 'Sharing…' : selectedRecipient ? `Share with ${selectedRecipient.displayName}` : 'Select a learner'}
              </button>
            </div>
          </div>

          {portalEnabled && (
            <div id={portalPanelId} role="tabpanel" aria-labelledby={portalTabId} hidden={activeTab !== 'portal'}>
              <PortalCodePanel
                deckTitle={deck?.title || 'Untitled deck'}
                currentCode={portalCode}
                busyAction={portalBusyAction}
                error={portalError}
                disabled={portalDisabled || !deck}
                defaultExpiryDays={portalDefaultExpiryDays}
                expiryOptions={portalExpiryOptions}
                onCreate={(expiresInDays) => onCreatePortalCode?.(expiresInDays)}
                onRenew={(expiresInDays) => onRenewPortalCode?.(expiresInDays)}
                onRevoke={() => onRevokePortalCode?.()}
                onRotate={(expiresInDays) => onRotatePortalCode?.(expiresInDays)}
                onCopy={onCopyPortalCode}
              />
              <div className="modal-action mt-6">
                <button type="button" onClick={handleClose} className="btn btn-ghost" disabled={modalBusy}>Close</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={handleClose} disabled={modalBusy}>Close share deck dialog</button>
      </form>
    </dialog>
  )
}
