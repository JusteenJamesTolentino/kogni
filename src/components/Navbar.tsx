import { KeyRound, LogOut, Menu, Moon, Settings, Sun, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import type { CommunitySearchResult } from './Community'
import KogniLogo from './KogniLogo'
import { useAuth } from '../context/AuthContext'
import { paths } from '../router/paths'

type Theme = 'light' | 'dark'

export interface NavbarProps {
  onOpenApiKey: () => void
  theme: Theme
  onToggleTheme: () => void
  searchQuery: string
  searchResults: CommunitySearchResult[]
  searchLoading: boolean
  onSearch: (query: string) => void | Promise<void>
  /** Opens the mobile navigation drawer; rendered as a hamburger below lg. */
  onOpenSidebar?: () => void
  /** Opens the account settings dialog (public identity + privacy controls). */
  onOpenAccountSettings?: () => void
}

interface SearchFieldProps {
  searchQuery: string
  searchResults: CommunitySearchResult[]
  searchLoading: boolean
  onSearch: (query: string) => void | Promise<void>
  navigate: (to: string) => void
}

function SearchField({ searchQuery, searchResults, searchLoading, onSearch, navigate }: SearchFieldProps) {
  return (
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
  )
}

export default function Navbar({ onOpenApiKey, theme, onToggleTheme, searchQuery, searchResults, searchLoading, onSearch, onOpenSidebar, onOpenAccountSettings }: NavbarProps) {
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
        <div className="mx-auto max-w-[100rem] px-3 sm:px-6 lg:px-8">
          <div className="flex min-h-16 items-center gap-2">
            {onOpenSidebar && (
              <button
                type="button"
                onClick={onOpenSidebar}
                className="btn btn-ghost btn-square btn-sm shrink-0 lg:hidden"
                aria-label="Open navigation menu"
              >
                <Menu size={20} aria-hidden="true" />
              </button>
            )}
            <div className="shrink-0">
              <Link
                to={paths.dashboard}
                className="btn btn-ghost gap-2 px-1 text-xl font-black tracking-tight sm:px-2"
                aria-label="Go to dashboard"
              >
                <KogniLogo size={36} className="shadow-lg shadow-primary/20" />
                <span>Kogni</span>
              </Link>
            </div>
            <div className="hidden min-w-0 flex-1 sm:block">
              <SearchField searchQuery={searchQuery} searchResults={searchResults} searchLoading={searchLoading} onSearch={onSearch} navigate={navigate} />
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-0.5">
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
                {onOpenAccountSettings && (
                  <button type="button" onClick={onOpenAccountSettings} className="btn btn-ghost btn-sm w-full justify-start gap-2">
                    <Settings size={16} aria-hidden="true" />
                    Account settings
                  </button>
                )}
                <Link to={paths.profile} className="btn btn-ghost btn-sm w-full justify-start gap-2">
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

          <div className="flex pb-3 sm:hidden">
            <SearchField searchQuery={searchQuery} searchResults={searchResults} searchLoading={searchLoading} onSearch={onSearch} navigate={navigate} />
          </div>
        </div>
      </header>
    </>
  )
}
