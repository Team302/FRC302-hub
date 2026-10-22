// Primary navigation, in ProjectPro's rail style, plus the board list Monday keeps in its left
// pane: favorites first, then every other active board.
import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, ChevronDown, Clock, Home, Trophy, Inbox, KeyRound, LayoutGrid, ListChecks, Plus, ScrollText, Star, Users, X } from 'lucide-react'
import { useSession } from '../../context/Session'
import { atLeast, ROLE, SWATCH } from '../../lib/constants'
import { useIsDesktop } from '../detail/detailUtils'
import BrandMark from '../brand/BrandMark'
import Avatar from '../ui/Avatar'

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40'
const rowClasses = (active) => (active ? 'bg-accent-50 text-accent-700 font-medium' : 'text-brand-gray-600 hover:bg-brand-gray-100/70 hover:text-brand-black')

function NavRow({ to, icon: Icon, label, end, collapsed, badge, onNavigate }) {
  return (
    <NavLink to={to} end={end} title={collapsed ? label : undefined} onClick={onNavigate}
      className={({ isActive }) => `group relative flex items-center gap-2.5 rounded-lg text-sm h-8 transition-colors duration-150 ${focusRing} ${collapsed ? 'px-2.5 lg:justify-center lg:px-0' : 'px-2.5'} ${rowClasses(isActive)}`}>
      {({ isActive }) => (
        <>
          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent-600' : 'text-brand-gray-400 group-hover:text-brand-gray-600'}`} />
          <span className={`truncate flex-1 ${collapsed ? 'lg:hidden' : ''}`}>{label}</span>
          {badge > 0 && (
            <span className={`min-w-[18px] h-[18px] px-1 rounded-full bg-flame-500 text-white text-[10px] font-semibold flex items-center justify-center ${collapsed ? 'lg:absolute lg:top-0 lg:right-0.5 lg:min-w-[14px] lg:h-[14px]' : ''}`}>
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function GroupLabel({ children, collapsed, action }) {
  return (
    <>
      <div className={`flex items-center justify-between px-2.5 pt-4 pb-1.5 ${collapsed ? 'lg:hidden' : ''}`}>
        <p className="text-[11px] font-medium text-brand-gray-400 tracking-wide">{children}</p>
        {action}
      </div>
      {collapsed && <div className="hidden lg:block mx-3 my-2 border-t border-brand-gray-200" aria-hidden="true" />}
    </>
  )
}

export default function Sidebar({ collapsed, onToggle, mobileOpen = false, onClose }) {
  const { user, boards, unread, openNew } = useSession()
  const { pathname } = useLocation()
  const isDesktop = useIsDesktop()
  const hidden = !isDesktop && !mobileOpen
  const [boardsOpen, setBoardsOpen] = useState(true)
  useEffect(() => { onClose?.() }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  const active = boards.filter((b) => !b.is_archived)
  const ordered = [...active.filter((b) => b.is_favorite), ...active.filter((b) => !b.is_favorite)]

  return (
    <aside data-app-chrome aria-label="Primary" inert={hidden ? '' : undefined}
      className={`flex flex-col glass border-r fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-200 ease-out lg:static lg:z-auto lg:shrink-0 lg:translate-x-0 lg:transition-[width]
      ${mobileOpen ? 'translate-x-0 shadow-pop lg:shadow-none' : '-translate-x-full'} ${collapsed ? 'lg:w-[60px]' : 'lg:w-64'}`}>
      <div className={`flex items-center border-b border-brand-gray-200 h-14 shrink-0 px-2 gap-1 ${collapsed ? 'lg:px-0 lg:justify-center' : ''}`}>
        <Link to="/" onClick={onClose} className={`flex items-center gap-2.5 min-w-0 flex-1 rounded-lg px-1.5 py-1.5 hover:bg-brand-gray-100/70 transition-colors ${focusRing} ${collapsed ? 'lg:flex-none' : ''}`}>
          <BrandMark size="sm" />
          <div className={`min-w-0 flex-1 leading-tight ${collapsed ? 'lg:hidden' : ''}`}>
            <p className="font-semibold text-sm text-brand-black tracking-tight truncate">Team 302</p>
            <p className="text-[11px] text-brand-gray-400 truncate">Lake Orion Robotics</p>
          </div>
        </Link>
        <button onClick={onClose} aria-label="Close menu" className="lg:hidden btn-icon"><X className="w-4 h-4" /></button>
      </div>

      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-0.5">
        <NavRow to="/" end icon={Home} label="Home" collapsed={collapsed} onNavigate={onClose} />
        <NavRow to="/my-work" icon={ListChecks} label="My work" collapsed={collapsed} onNavigate={onClose} />
        <NavRow to="/inbox" icon={Inbox} label="Inbox" collapsed={collapsed} badge={unread} onNavigate={onClose} />
        <GroupLabel collapsed={collapsed}>Team</GroupLabel>
        <NavRow to="/season" icon={Trophy} label="Season" collapsed={collapsed} onNavigate={onClose} />
        <NavRow to="/meetings" icon={CalendarDays} label="Meetings" collapsed={collapsed} onNavigate={onClose} />
        <NavRow to="/vault" icon={KeyRound} label="Vault" collapsed={collapsed} onNavigate={onClose} />
        <NavRow to="/team" icon={Users} label="People" collapsed={collapsed} onNavigate={onClose} />
        {atLeast(user, 'lead') && <NavRow to="/workload" icon={BarChart3} label="Workload" collapsed={collapsed} onNavigate={onClose} />}
        {atLeast(user, 'lead') && <NavRow to="/attendance" icon={Clock} label="Attendance" collapsed={collapsed} onNavigate={onClose} />}
        {atLeast(user, 'admin') && <NavRow to="/activity" icon={ScrollText} label="Audit log" collapsed={collapsed} onNavigate={onClose} />}

        <GroupLabel collapsed={collapsed} action={(
          <span className="flex items-center gap-0.5">
            {atLeast(user, 'lead') && <button type="button" onClick={() => openNew('board')} className="btn-icon w-6 h-6" aria-label="New board" title="New board"><Plus className="w-3.5 h-3.5" /></button>}
            <button type="button" onClick={() => setBoardsOpen((o) => !o)} className="btn-icon w-6 h-6" aria-expanded={boardsOpen} aria-label={boardsOpen ? 'Collapse boards' : 'Expand boards'}>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${boardsOpen ? '' : '-rotate-90'}`} />
            </button>
          </span>
        )}>Boards</GroupLabel>
        <NavRow to="/boards" end icon={LayoutGrid} label="All boards" collapsed={collapsed} onNavigate={onClose} />
        {boardsOpen && !collapsed && ordered.map((b) => (
          <NavLink key={b.id} to={`/boards/${b.id}`} onClick={onClose}
            className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-2.5 h-8 text-sm transition-colors ${focusRing} ${rowClasses(isActive)}`}>
            <span className={`w-2 h-2 rounded-sm shrink-0 ${SWATCH[b.color] || 'bg-gray-400'}`} aria-hidden="true" />
            <span className="truncate flex-1">{b.name}</span>
            {b.is_favorite && <Star className="w-3 h-3 text-brand-gray-400 fill-current shrink-0" aria-label="Favorite" />}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-brand-gray-200 p-2 space-y-0.5 shrink-0">
        <div className={`flex items-center gap-2.5 px-2.5 py-2 ${collapsed ? 'lg:hidden' : ''}`}>
          <Avatar name={user.name} seed={user.id} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-brand-black truncate">{user.name}</p>
            <p className="text-[11px] text-brand-gray-400 truncate">{ROLE[user.role]?.label}</p>
          </div>
        </div>
        <button onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`hidden lg:flex w-full items-center gap-2 px-2.5 h-8 text-xs text-brand-gray-500 hover:text-brand-black hover:bg-brand-gray-100/70 rounded-lg transition-colors ${focusRing} ${collapsed ? 'justify-center' : ''}`}>
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /><span>Collapse</span></>}
        </button>
      </div>
    </aside>
  )
}
