import type { ReactNode } from 'react'
import ProfileCard3D from './ProfileCard3D'
import useOnlineStatus from '../hooks/useOnlineStatus'

export type PublicPresenceStatus = 'online' | 'away' | 'offline' | 'hidden'

export interface ProfileStat {
  id: string
  label: string
  value: ReactNode
  helpText?: string
}

export interface ProfileProps {
  /** Canonical public nickname supplied by the profile data owner. */
  nickname: string
  avatarUrl?: string | null
  avatarAlt?: string
  /** Publicly shared presence. This is separate from device connectivity. */
  publicPresence: PublicPresenceStatus
  stats: ProfileStat[]
  socialError?: string
  onRetrySocial?: () => void
  onEditAvatar?: () => void
  editing?: boolean
  error?: string
}

const presenceDetails: Record<PublicPresenceStatus, { label: string; dot: string; text: string }> = {
  online: { label: 'Online', dot: 'bg-success', text: 'text-success' },
  away: { label: 'Away', dot: 'bg-warning', text: 'text-warning' },
  offline: { label: 'Offline', dot: 'bg-base-content/30', text: 'text-base-content/55' },
  hidden: { label: 'Presence hidden', dot: 'bg-base-content/20', text: 'text-base-content/55' },
}

export default function Profile({
  nickname,
  avatarUrl,
  avatarAlt = '',
  publicPresence,
  stats,
  socialError = '',
  onRetrySocial,
  onEditAvatar,
  editing = false,
  error = '',
}: ProfileProps) {
  const { isDeviceOnline, deviceStatusLabel } = useOnlineStatus()
  const presence = presenceDetails[publicPresence]
  const initial = (nickname.trim().charAt(0) || '?').toUpperCase()

  return (
    <main className="mx-auto w-full max-w-[100rem] px-4 py-7 pb-28 sm:px-6 sm:py-10 sm:pb-10 lg:px-8">
      {error && <div role="alert" className="alert alert-error mb-6"><span>{error}</span></div>}

      <ProfileCard3D className="card overflow-hidden border border-base-300 bg-base-100 shadow-xl">
          <div className="h-28 bg-gradient-to-br from-primary/25 via-secondary/15 to-accent/15 sm:h-36" aria-hidden="true" />
          <div className="card-body px-5 pb-6 pt-0 sm:px-8 sm:pb-8">
            <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end">
              <div className="avatar shrink-0">
                <div className="h-24 w-24 overflow-hidden rounded-3xl bg-primary text-3xl font-black text-primary-content ring-4 ring-base-100 sm:h-28 sm:w-28">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={avatarAlt} referrerPolicy="no-referrer" />
                  ) : (
                    <div className="grid h-full w-full place-items-center" aria-hidden="true">{initial}</div>
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <h2 className="truncate text-2xl font-black sm:text-3xl">{nickname || 'Kogni learner'}</h2>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
                  <span className={`inline-flex items-center gap-1.5 ${presence.text}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${presence.dot}`} aria-hidden="true" />
                    Public presence: {presence.label}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 ${isDeviceOnline ? 'text-success' : 'text-error'}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${isDeviceOnline ? 'bg-success' : 'bg-error'}`} aria-hidden="true" />
                    {deviceStatusLabel}
                  </span>
                </div>
              </div>
              {onEditAvatar && (
                <button type="button" onClick={onEditAvatar} className="btn btn-outline btn-sm self-start sm:mb-1 sm:self-auto" disabled={editing}>
                  Edit photo
                </button>
              )}
            </div>

            <p className="mt-2 text-xs leading-relaxed text-base-content/50">
              Device connectivity describes this browser only. Public presence is a separate status shared with other learners.
            </p>

            {socialError && (
              <div role="alert" className="alert alert-warning mt-5 text-sm">
                <span>{socialError}</span>
                {onRetrySocial && <button type="button" className="btn btn-sm" onClick={onRetrySocial}>Retry</button>}
              </div>
            )}

            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Profile statistics">
              {stats.map((stat) => (
                <div key={stat.id} className="stat min-w-0 rounded-2xl border border-base-300 bg-base-200/45 p-4">
                  <dt className="stat-title truncate text-xs font-semibold uppercase tracking-wide">{stat.label}</dt>
                  <dd className="stat-value mt-1 truncate text-2xl">{stat.value}</dd>
                  {stat.helpText && <dd className="stat-desc mt-1 truncate">{stat.helpText}</dd>}
                </div>
              ))}
            </dl>
          </div>
      </ProfileCard3D>
    </main>
  )
}
