import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { GraduationCap, Medal, Sparkles, Sprout } from 'lucide-react'
import ProfileCard3D from './ProfileCard3D'

export interface ProfileStat {
  id: string
  label: string
  value: ReactNode
  helpText?: string
}

export interface ProfileBadge {
  id: string
  kind: 'role' | 'rank' | 'status'
  label: string
}

export interface ProfileProps {
  /** Canonical public nickname supplied by the profile data owner. */
  nickname: string
  avatarUrl?: string | null
  avatarAlt?: string
  /** Role/Rank/Status badges replacing the old presence and device indicators. */
  badges?: ProfileBadge[]
  stats: ProfileStat[]
  socialError?: string
  onRetrySocial?: () => void
  onEditAvatar?: () => void
  editing?: boolean
  error?: string
}

const badgeIcons: Record<string, LucideIcon> = {
  student: GraduationCap,
  teacher: GraduationCap,
  learner: Sprout,
  apprentice: Sprout,
  scholar: Medal,
  strategist: Medal,
  luminary: Medal,
  pioneer: Sparkles,
  'early-educator': Sparkles,
  'quiz-architect': Sparkles,
  'perfect-round': Sparkles,
  'founders-pick': Sparkles,
}

export default function Profile({
  nickname,
  avatarUrl,
  avatarAlt = '',
  badges = [],
  stats,
  socialError = '',
  onRetrySocial,
  onEditAvatar,
  editing = false,
  error = '',
}: ProfileProps) {
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
                {badges.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2" aria-label="Profile badges">
                    {badges.map((badge) => {
                      const Icon = badgeIcons[badge.id] ?? Sparkles
                      const tone = badge.kind === 'role' ? 'badge-primary' : badge.kind === 'rank' ? 'badge-accent' : 'badge-outline'
                      return (
                        <span key={badge.kind === 'role' ? 'role' : badge.id} className={`badge gap-1.5 font-semibold ${tone}`}>
                          <Icon size={14} aria-hidden="true" />
                          {badge.label}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
              {onEditAvatar && (
                <button type="button" onClick={onEditAvatar} className="btn btn-outline btn-sm self-start sm:mb-1 sm:self-auto" disabled={editing}>
                  Edit photo
                </button>
              )}
            </div>

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
