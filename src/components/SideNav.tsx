import { Home, Layers3, PanelLeftClose, PanelLeftOpen, Trophy, UserRound, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { paths } from '../router/paths'

interface SideNavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const decksNavItem: SideNavItem = { to: paths.import, label: 'Decks', icon: Layers3 }

const sideNavItems: SideNavItem[] = [
  { to: paths.dashboard, label: 'Dashboard', icon: Home, end: true },
  decksNavItem,
  { to: paths.community, label: 'Community', icon: Users },
  { to: paths.leaderboards, label: 'Leaderboard', icon: Trophy },
  { to: paths.profile, label: 'Profile', icon: UserRound },
]

export interface SideNavProps {
  collapsed: boolean
  onToggle: () => void
  /** Called after a nav item is chosen; lets the shell close the mobile overlay. */
  onNavigate?: () => void
}

export default function SideNav({ collapsed, onToggle, onNavigate }: SideNavProps) {
  const { pathname } = useLocation()

  const isItemActive = (item: SideNavItem): boolean => {
    if (item.end) return pathname === item.to
    return pathname === item.to || pathname.startsWith(`${item.to}/`)
  }

  return (
    <nav
      className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-base-300 bg-base-100/95 backdrop-blur-xl transition-[width] duration-200 ${collapsed ? 'w-16' : 'w-60 shadow-2xl lg:shadow-none'}`}
      aria-label="Primary navigation"
    >
      <div className="flex h-16 shrink-0 items-center justify-center border-b border-base-300/70">
        <button
          type="button"
          onClick={onToggle}
          className="btn btn-ghost btn-square btn-sm"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
        </button>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {sideNavItems.map((item) => {
          const Icon = item.icon
          const active = isItemActive(item)
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className={`btn btn-sm h-11 w-full gap-3 border-0 font-semibold ${collapsed ? 'justify-center px-0' : 'justify-start px-3'} ${active ? 'btn-primary' : 'btn-ghost text-base-content/70'}`}
            >
              <Icon size={20} strokeWidth={2.2} aria-hidden="true" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
