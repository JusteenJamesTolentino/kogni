import { Check, Edit3, Eye, EyeOff, ShieldCheck, Trophy, UserRound } from 'lucide-react'
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
  /** Explicit acknowledgement state for the product's privacy notice. */
  privacyAcknowledged: boolean
  isDiscoverable: boolean
  /** Publicly shared presence. This is separate from device connectivity. */
  publicPresence: PublicPresenceStatus
  stats: ProfileStat[]
  socialError?: string
  onRetrySocial?: () => void
  privacyHref: string
  onEditProfile: () => void
  onEditAvatar?: () => void
  onDiscoverabilityChange: (isDiscoverable: boolean) => void | Promise<void>
  onPresenceChange: (visible: boolean) => void | Promise<void>
  onPrivacyAcknowledgementChange: (acknowledged: boolean) => void | Promise<void>
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
  privacyAcknowledged,
  isDiscoverable,
  publicPresence,
  stats,
  socialError = '',
  onRetrySocial,
  privacyHref,
  onEditProfile,
  onEditAvatar,
  onDiscoverabilityChange,
  onPresenceChange,
  onPrivacyAcknowledgementChange,
  editing = false,
  error = '',
}: ProfileProps) {
  const { isDeviceOnline, deviceStatusLabel } = useOnlineStatus()
  const presence = presenceDetails[publicPresence]
  const initial = (nickname.trim().charAt(0) || '?').toUpperCase()

  return (
    <main className="mx-auto w-full max-w-[100rem] px-4 py-7 pb-28 sm:px-6 sm:py-10 sm:pb-10 lg:px-8">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            <UserRound size={17} aria-hidden="true" />
            Your learner identity
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Profile</h1>
          <p className="mt-2 max-w-2xl text-base-content/60">Manage what other learners can see and review your learning progress.</p>
        </div>
        <button type="button" onClick={onEditProfile} className="btn btn-primary gap-2 self-start sm:self-auto" disabled={editing}>
          {editing ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : <Edit3 size={17} aria-hidden="true" />}
          Edit profile
        </button>
      </div>

      {error && <div role="alert" className="alert alert-error mb-6"><span>{error}</span></div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(19rem,0.9fr)] lg:items-start">
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

        <section className="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm sm:p-6" aria-labelledby="profile-privacy-title">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck size={22} aria-hidden="true" />
            </div>
            <div>
              <h2 id="profile-privacy-title" className="text-xl font-bold">Privacy controls</h2>
              <p className="mt-1 text-sm text-base-content/60">Choose whether your public profile can be found.</p>
            </div>
          </div>

          <label className="mt-5 flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border border-base-300 bg-base-200/45 p-4">
            <input
              type="checkbox"
              className="toggle toggle-primary mt-0.5"
              checked={isDiscoverable}
              onChange={(event) => void onDiscoverabilityChange(event.target.checked)}
              disabled={editing}
            />
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold">
                {isDiscoverable ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
                Appear in learner search
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-base-content/55">Your nickname and profile image may appear to signed-in learners. Your email stays private.</span>
            </span>
          </label>

          <label className="mt-3 flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border border-base-300 bg-base-200/45 p-4">
            <input
              type="checkbox"
              className="toggle toggle-primary mt-0.5"
              checked={publicPresence !== 'hidden'}
              onChange={(event) => void onPresenceChange(event.target.checked)}
              disabled={editing}
            />
            <span>
              <span className="text-sm font-semibold">Show Online or Offline status</span>
              <span className="mt-1 block text-xs leading-relaxed text-base-content/55">Shares only a coarse status with eligible signed-in learners. Exact last-seen time and device details remain private.</span>
            </span>
          </label>

          <label className="mt-3 flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border border-base-300 bg-base-200/45 p-4">
            <input
              type="checkbox"
              className="checkbox checkbox-primary mt-0.5"
              checked={privacyAcknowledged}
              onChange={(event) => void onPrivacyAcknowledgementChange(event.target.checked)}
              disabled={editing}
            />
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold">
                {privacyAcknowledged && <Check size={16} className="text-success" aria-hidden="true" />}
                Privacy notice acknowledged
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-base-content/55">I understand which profile details can be shared publicly.</span>
            </span>
          </label>

          <a href={privacyHref} className="link link-primary mt-5 inline-flex min-h-11 items-center text-sm font-semibold">
            Read the privacy notice
          </a>

          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-base-200/60 p-4">
            <Trophy size={20} className="shrink-0 text-warning" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-base-content/60">Leaderboard participation and profile discoverability are separate controls. Integrators should not infer one from the other.</p>
          </div>
        </section>
      </div>
    </main>
  )
}
