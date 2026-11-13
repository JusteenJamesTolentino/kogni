import { Home, Layers3, PanelLeftClose, PanelLeftOpen, Trophy, Users, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import KogniLogo from './KogniLogo'
import { paths } from '../router/paths'

interface SideNavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const decksNavItem: SideNavItem = { to: paths.myDecks, label: 'My decks', icon: Layers3 }

const sideNavItems: SideNavItem[] = [
  { to: paths.dashboard, label: 'Dashboard', icon: Home, end: true },
  decksNavItem,
  { to: paths.community, label: 'Community', icon: Users },
  { to: paths.leaderboards, label: 'Leaderboard', icon: Trophy },
]

const isItemActive = (pathname: string, item: SideNavItem): boolean => {
  if (item.end) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

export interface SideNavProps {
  collapsed: boolean
  onToggle: () => void
}

/** Desktop-only collapsible sidebar; hidden on small screens where the drawer applies. */
export default function SideNav({ collapsed, onToggle }: SideNavProps) {
  const { pathname } = useLocation()

  return (
    <nav
      className={`fixed inset-y-0 left-0 z-50 hidden flex-col border-r border-base-300 bg-base-100/95 backdrop-blur-xl transition-[width] duration-200 lg:flex ${collapsed ? 'w-16' : 'w-60'}`}
      aria-label="Primary navigation"
    >
      <div className={`flex h-16 shrink-0 items-center border-b border-base-300/70 ${collapsed ? 'justify-center' : 'justify-end pr-2'}`}>
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
          const active = isItemActive(pathname, item)
          return (
            <Link
              key={item.to}
              to={item.to}
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

export interface MobileNavDrawerProps {
  open: boolean
  onClose: () => void
}

/** Mobile-only slide-in drawer opened from the header hamburger button. */
export function MobileNavDrawer({ open, onClose }: MobileNavDrawerProps) {
  const { pathname } = useLocation()

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200 lg:hidden ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <nav
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-base-300 bg-base-100 shadow-2xl transition-transform duration-200 lg:hidden ${open ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Primary navigation"
        aria-hidden={!open}
      >
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-base-300/70 px-3">
          <KogniLogo size={36} className="shadow-lg shadow-primary/20" />
          <span className="flex-1 text-lg font-black tracking-tight">Kogni</span>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-square btn-sm" aria-label="Close navigation">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {sideNavItems.map((item) => {
            const Icon = item.icon
            const active = isItemActive(pathname, item)
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                tabIndex={open ? 0 : -1}
                className={`btn btn-sm h-11 w-full justify-start gap-3 border-0 px-3 font-semibold ${active ? 'btn-primary' : 'btn-ghost text-base-content/70'}`}
              >
                <Icon size={20} strokeWidth={2.2} aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
