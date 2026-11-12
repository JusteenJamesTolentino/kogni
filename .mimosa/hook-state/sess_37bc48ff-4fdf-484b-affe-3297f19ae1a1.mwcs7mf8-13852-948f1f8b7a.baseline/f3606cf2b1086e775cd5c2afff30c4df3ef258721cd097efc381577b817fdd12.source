import { useMemo, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, RefreshCw, Search, UserRound, Wifi } from 'lucide-react'

export interface PublishedOnlineDeckSummary {
  id: string
  title: string
  description?: string
  creatorId: string
  creatorNickname: string
  creatorOnline?: boolean
  questionCount: number
  partNumber?: number
  seriesTitle?: string
}

export interface OnlineDeckCatalogPagination {
  page: number
  pageCount?: number
  hasPreviousPage: boolean
  hasNextPage: boolean
}

export interface OnlineDeckCatalogProps {
  decks: PublishedOnlineDeckSummary[]
  loading?: boolean
  error?: string
  searchQuery?: string
  recentLimit?: number
  pagination?: OnlineDeckCatalogPagination
  onSearchQueryChange?: (query: string) => void
  onSearchSubmit?: (query: string) => void | Promise<void>
  onOpenDeck: (deck: PublishedOnlineDeckSummary) => void | Promise<void>
  onOpenCreator?: (creator: Pick<PublishedOnlineDeckSummary, 'creatorId' | 'creatorNickname' | 'creatorOnline'>) => void | Promise<void>
  onRetry?: () => void | Promise<void>
  onPreviousPage?: () => void | Promise<void>
  onNextPage?: () => void | Promise<void>
  className?: string
}

const MAX_RECENT_DECKS = 20

export default function OnlineDeckCatalog({
  decks,
  loading = false,
  error = '',
  searchQuery,
  recentLimit = MAX_RECENT_DECKS,
  pagination,
  onSearchQueryChange,
  onSearchSubmit,
  onOpenDeck,
  onOpenCreator,
  onRetry,
  onPreviousPage,
  onNextPage,
  className = '',
}: OnlineDeckCatalogProps) {
  const [localQuery, setLocalQuery] = useState('')
  const query = searchQuery ?? localQuery
  const setQuery = onSearchQueryChange ?? setLocalQuery
  const trimmedQuery = query.trim()
  const visibleLimit = Math.min(Math.max(Math.trunc(recentLimit), 1), MAX_RECENT_DECKS)
  const visibleDecks = useMemo(() => {
    const normalizedQuery = trimmedQuery.toLocaleLowerCase()
    const matches = normalizedQuery
      ? decks.filter((deck) => [deck.title, deck.description, deck.creatorNickname, deck.seriesTitle]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)))
      : decks
    return matches.slice(0, visibleLimit)
  }, [decks, trimmedQuery, visibleLimit])

  return (
    <section className={`overflow-hidden rounded-3xl border border-base-300 bg-base-100 shadow-sm ${className}`} aria-labelledby="online-catalog-title">
      <div className="border-b border-base-300 bg-base-200/50 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="online-catalog-title" className="text-xl font-bold">Published decks</h2>
            <p className="mt-1 text-sm text-base-content/55">Search public metadata. Questions and answers stay hidden in these previews.</p>
          </div>
          <form
            role="search"
            className="flex w-full gap-2 sm:max-w-md"
            onSubmit={(event) => {
              event.preventDefault()
              void onSearchSubmit?.(trimmedQuery)
            }}
          >
            <label className="input input-bordered flex min-w-0 flex-1 items-center gap-2 focus-within:input-primary">
              <Search size={17} className="shrink-0 text-base-content/45" aria-hidden="true" />
              <span className="sr-only">Search published decks</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 grow"
                placeholder="Search decks"
                autoComplete="off"
              />
            </label>
            {onSearchSubmit && <button type="submit" className="btn btn-primary" disabled={loading}>Search</button>}
          </form>
        </div>
      </div>

      <div aria-live="polite" aria-busy={loading}>
        {error && (
          <div className="p-5 sm:p-6">
            <div role="alert" className="alert alert-error"><span>{error}</span></div>
            {onRetry && <button type="button" onClick={() => void onRetry()} className="btn btn-outline btn-sm mt-3 gap-2"><RefreshCw size={15} aria-hidden="true" />Try again</button>}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-3" aria-label="Loading published decks">
            {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="skeleton h-52 rounded-2xl" />)}
          </div>
        ) : !error && !visibleDecks.length ? (
          <div className="grid min-h-64 place-items-center px-6 py-12 text-center">
            <div>
              <BookOpen size={34} className="mx-auto text-base-content/25" aria-hidden="true" />
              <h3 className="mt-3 font-bold">{trimmedQuery ? 'No matching published decks' : 'No published decks yet'}</h3>
              <p className="mt-1 text-sm text-base-content/55">{trimmedQuery ? 'Try another title, topic, or creator nickname.' : 'Recently published decks will appear here.'}</p>
            </div>
          </div>
        ) : !error ? (
          <ul className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-3" aria-label="Published online decks">
            {visibleDecks.map((deck) => (
              <li key={deck.id}>
                <article className="card h-full border border-base-300 bg-base-100 shadow-sm transition hover:border-primary/40 hover:shadow-md">
                  <div className="card-body gap-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><BookOpen size={20} aria-hidden="true" /></div>
                      <div className="flex flex-wrap justify-end gap-1">
                        {deck.partNumber !== undefined && <span className="badge badge-secondary badge-outline badge-sm">Part {deck.partNumber}</span>}
                        <span className="badge badge-ghost badge-sm">{deck.questionCount} questions</span>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      {deck.seriesTitle && <p className="truncate text-xs font-semibold text-secondary">{deck.seriesTitle}</p>}
                      <h3 className="mt-1 line-clamp-2 text-lg font-bold">{deck.title || 'Untitled deck'}</h3>
                      <p className="mt-1 line-clamp-2 min-h-10 text-sm text-base-content/55">{deck.description || 'A published study deck.'}</p>
                    </div>
                    {onOpenCreator ? (
                      <button
                        type="button"
                        onClick={() => void onOpenCreator({
                          creatorId: deck.creatorId,
                          creatorNickname: deck.creatorNickname,
                          creatorOnline: deck.creatorOnline,
                        })}
                        className="flex min-h-9 w-full items-center gap-2 rounded-lg px-1 text-left text-xs text-base-content/60 transition hover:bg-base-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        aria-label={`Open ${deck.creatorNickname || 'Kogni creator'} profile`}
                      >
                        <UserRound size={15} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate font-semibold">{deck.creatorNickname || 'Kogni creator'}</span>
                        {deck.creatorOnline && (
                          <span className="badge badge-success badge-outline badge-xs ml-auto gap-1" aria-label={`${deck.creatorNickname} is online`}>
                            <Wifi size={10} aria-hidden="true" /> Online
                          </span>
                        )}
                      </button>
                    ) : (
                      <div className="flex min-h-9 items-center gap-2 text-xs text-base-content/60">
                        <UserRound size={15} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate font-semibold">{deck.creatorNickname || 'Kogni creator'}</span>
                        {deck.creatorOnline && (
                          <span className="badge badge-success badge-outline badge-xs ml-auto gap-1" aria-label={`${deck.creatorNickname} is online`}>
                            <Wifi size={10} aria-hidden="true" /> Online
                          </span>
                        )}
                      </div>
                    )}
                    <button type="button" onClick={() => void onOpenDeck(deck)} className="btn btn-primary btn-sm mt-1 w-full">View deck</button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {pagination && !loading && !error && (
        <nav className="flex items-center justify-between gap-3 border-t border-base-300 px-5 py-4" aria-label="Published deck pages">
          <button type="button" onClick={() => void onPreviousPage?.()} className="btn btn-ghost btn-sm gap-1" disabled={!pagination.hasPreviousPage || !onPreviousPage}>
            <ChevronLeft size={16} aria-hidden="true" /> Previous
          </button>
          <span className="text-sm text-base-content/60">Page {pagination.page}{pagination.pageCount ? ` of ${pagination.pageCount}` : ''}</span>
          <button type="button" onClick={() => void onNextPage?.()} className="btn btn-ghost btn-sm gap-1" disabled={!pagination.hasNextPage || !onNextPage}>
            Next <ChevronRight size={16} aria-hidden="true" />
          </button>
        </nav>
      )}
    </section>
  )
}
