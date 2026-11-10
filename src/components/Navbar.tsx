import { BrainCircuit, Home, KeyRound, LogOut, Moon, Plus, Sun, Trophy, UserRound, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import type { CommunitySearchResult } from './Community'
import { useAuth } from '../context/AuthContext'
import { paths } from '../router/paths'

type Theme = 'light' | 'dark'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export interface NavbarProps {
  onOpenApiKey: () => void
  theme: Theme
  onToggleTheme: () => void
  searchQuery: string
  searchResults: CommunitySearchResult[]
  searchLoading: boolean
  onSearch: (query: string) => void | Promise<void>
}

const desktopNavItems: NavItem[] = [
  { to: paths.dashboard, label: 'Dashboard', icon: BrainCircuit, end: true },
  { to: paths.import, label: 'Add', icon: Plus },
  { to: paths.community, label: 'Community', icon: Users },
  { to: paths.leaderboards, label: 'Leaderboard', icon: Trophy },
  { to: paths.profile, label: 'Profile', icon: UserRound },
]

const mobileNavItems: NavItem[] = [
  { to: paths.dashboard, label: 'Dashboard', icon: Home, end: true },
  { to: paths.import, label: 'Add', icon: Plus },
  { to: paths.community, label: 'Community', icon: Users },
  { to: paths.leaderboards, label: 'Leaderboard', icon: Trophy },
  { to: paths.profile, label: 'Profile', icon: UserRound },
]

export default function Navbar({ onOpenApiKey, theme, onToggleTheme, searchQuery, searchResults, searchLoading, onSearch }: NavbarProps) {
  const { user, signOutUser } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async (): Promise<void> => {
    try {
      await signOutUser()
    } catch {
      // AuthContext displays a friendly error
    }
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-base-300/80 bg-base-100/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-2 px-3 sm:px-6 lg:px-8">
          <div className="shrink-0">
            <Link
              to={paths.dashboard}
              className="btn btn-ghost gap-2 px-1 text-xl font-black tracking-tight sm:px-2"
              aria-label="Go to dashboard"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-content shadow-lg shadow-primary/20">
                <BrainCircuit size={21} aria-hidden="true" />
              </span>
              <span>Kogni</span>
            </Link>
          </div>
          <div className="dropdown dropdown-end min-w-0 flex-1">
            <label className="input input-bordered input-sm flex w-full items-center gap-2 focus-within:input-primary sm:mx-auto sm:max-w-md">
              <span className="text-base-content/45" aria-hidden="true">⌕</span>
              <input
                value={searchQuery}
                onChange={(event) => void onSearch(event.target.value)}
                placeholder="Search learners"
                aria-label="Search learners"
                className="min-w-0 grow"
              />
              {searchLoading && <span className="loading loading-spinner loading-xs" aria-label="Searching" />}
            </label>
            {searchResults.length > 0 && (
              <ul className="menu dropdown-content z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-box border border-base-300 bg-base-100 p-2 shadow-xl">
                {searchResults.map((result) => (
                  <li key={result.id}>
                    <button type="button" onClick={() => navigate(`/players/${encodeURIComponent(result.id)}`)}>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">{result.displayName.slice(0, 1).toUpperCase()}</span>
                      <span className="truncate">{result.displayName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <button type="button" onClick={onOpenApiKey} className="btn btn-ghost btn-circle" aria-label="AI generation settings" title="AI generation settings">
              <KeyRound size={19} aria-hidden="true" />
            </button>
            <button type="button" onClick={onToggleTheme} className="btn btn-ghost btn-circle" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
              {theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
            </button>
            <div className="dropdown dropdown-end">
              <button type="button" tabIndex={0} className="btn btn-ghost btn-circle avatar" aria-label="Open account menu">
                <div className="w-9 rounded-full ring-2 ring-primary/20 ring-offset-2 ring-offset-base-100">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="grid h-full place-items-center bg-primary text-sm font-bold text-primary-content">
                      {(user?.displayName || user?.email || 'K').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
              </button>
              <div tabIndex={0} className="dropdown-content z-50 mt-3 w-64 rounded-box border border-base-300 bg-base-100 p-2 shadow-xl">
                <div className="px-3 py-2">
                  <p className="truncate font-semibold">{user?.displayName || 'Kogni learner'}</p>
                  <p className="truncate text-xs opacity-60">{user?.email}</p>
                </div>
                <div className="divider my-1" />
                <Link to="/profile" className="btn btn-ghost btn-sm w-full justify-start gap-2 lg:hidden">
                  <UserRound size={16} aria-hidden="true" />
                  Profile
                </Link>
                <button type="button" onClick={() => void handleSignOut()} className="btn btn-ghost btn-sm w-full justify-start gap-2 text-error">
                  <LogOut size={16} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden border-t border-base-300/70 bg-base-200/35 lg:block">
          <nav className="mx-auto flex max-w-7xl justify-center px-4 py-2 sm:px-6 lg:px-8" aria-label="Primary navigation">
            <div className="join bg-base-200/70 p-1">
              {desktopNavItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `btn btn-sm join-item gap-2 border-0 ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {item.label}
                  </NavLink>
                )
              })}
            </div>
          </nav>
        </div>
      </header>

      <nav
        className="btm-nav mobile-dock z-50 border-t border-base-300 bg-base-100/95 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl lg:hidden"
        aria-label="Mobile navigation"
      >
        {mobileNavItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `mobile-dock-link min-h-11 min-w-0 gap-0.5 ${isActive ? 'active text-primary' : 'text-base-content/65'}`}
            >
              <Icon size={20} strokeWidth={2.2} aria-hidden="true" />
              <span className="block max-w-full truncate px-0.5 text-[0.625rem] font-semibold leading-tight">{item.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </>
  )
}
