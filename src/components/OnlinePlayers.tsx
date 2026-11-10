import { RefreshCw, UsersRound, Wifi } from 'lucide-react'

export interface OnlinePlayerSummary {
  id: string
  nickname: string
  /** Coarse public presence only. Do not add last-seen, timestamp, session, or device data. */
  online: boolean
}

export interface OnlinePlayersProps {
  players: OnlinePlayerSummary[]
  loading?: boolean
  error?: string
  onRetry?: () => void | Promise<void>
  onOpenPlayer?: (player: OnlinePlayerSummary) => void | Promise<void>
  title?: string
  description?: string
  className?: string
}

export default function OnlinePlayers({
  players,
  loading = false,
  error = '',
  onRetry,
  onOpenPlayer,
  title = 'Online players',
  description = 'Coarse online status only',
  className = '',
}: OnlinePlayersProps) {
  const onlinePlayers = players.filter((player) => player.online)

  return (
    <section
      className={`overflow-hidden rounded-3xl border border-base-300 bg-base-100 shadow-sm ${className}`}
      aria-labelledby="online-players-title"
      aria-busy={loading}
    >
      <div className="flex items-center justify-between gap-3 border-b border-base-300 bg-base-200/50 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Wifi size={18} className="text-success" aria-hidden="true" />
            <h2 id="online-players-title" className="font-bold">{title}</h2>
          </div>
          <p className="mt-1 text-xs text-base-content/50">{description}</p>
        </div>
        {!loading && !error && (
          <span className="badge badge-success badge-outline" aria-label={`${onlinePlayers.length} players online`}>
            {onlinePlayers.length} online
          </span>
        )}
      </div>

      <div aria-live="polite">
        {error ? (
          <div className="p-5">
            <div role="alert" className="alert alert-error text-sm">
              <span>{error}</span>
            </div>
            {onRetry && (
              <button type="button" onClick={() => void onRetry()} className="btn btn-outline btn-sm mt-3 w-full gap-2">
                <RefreshCw size={15} aria-hidden="true" />
                Try again
              </button>
            )}
          </div>
        ) : loading ? (
          <div className="space-y-3 p-5" aria-label="Loading online players">
            {[0, 1, 2].map((item) => <div key={item} className="skeleton h-11 w-full rounded-xl" />)}
          </div>
        ) : !onlinePlayers.length ? (
          <div className="px-5 py-8 text-center">
            <UsersRound size={28} className="mx-auto text-base-content/25" aria-hidden="true" />
            <h3 className="mt-3 text-sm font-bold">No one is showing as online</h3>
            <p className="mt-1 text-xs text-base-content/50">Players who share public presence will appear here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-base-300" aria-label="Players currently online">
            {onlinePlayers.map((player) => (
              <li key={player.id}>
                {onOpenPlayer ? (
                  <button
                    type="button"
                    onClick={() => void onOpenPlayer(player)}
                    className="flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-base-200/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                    aria-label={`Open ${player.nickname || 'Kognit player'} profile`}
                  >
                    <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary" aria-hidden="true">
                      {(player.nickname.trim().charAt(0) || '?').toUpperCase()}
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-base-100 bg-success" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{player.nickname || 'Kognit player'}</span>
                    <span className="sr-only">Online</span>
                  </button>
                ) : (
                  <div className="flex min-h-14 items-center gap-3 px-5 py-3">
                    <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary" aria-hidden="true">
                      {(player.nickname.trim().charAt(0) || '?').toUpperCase()}
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-base-100 bg-success" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{player.nickname || 'Kognit player'}</span>
                    <span className="sr-only">Online</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
