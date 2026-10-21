import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { CalendarClock, Home, KeyRound, LayoutGrid, LogOut, Menu, Moon, ScrollText, Sun, Users, X } from 'lucide-react'
import { useSession } from '../context/Session'
import { atLeast, ROLE } from '../lib/constants'
import { useTheme } from '../lib/theme'
import { Wordmark } from './BrandMark'
import { Avatar } from './ui'

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/boards', label: 'Boards', icon: LayoutGrid },
  { to: '/meetings', label: 'Meetings', icon: CalendarClock },
  { to: '/vault', label: 'Vault', icon: KeyRound },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/activity', label: 'Activity', icon: ScrollText, role: 'admin' },
]

export default function Shell() {
  const { user, signOut } = useSession()
  const [theme, setTheme] = useTheme()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])
  const dark = theme === 'dark' || (theme === 'system' && document.documentElement.classList.contains('dark'))

  const nav = (
    <nav className="flex flex-col h-full p-3">
      <div className="px-2 py-2 mb-3"><Wordmark /></div>
      <div className="space-y-0.5">
        {NAV.filter((n) => !n.role || atLeast(user, n.role)).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-2.5 h-8 text-sm transition-colors ${isActive ? 'bg-accent-50 text-accent-700 font-medium' : 'text-brand-gray-600 hover:bg-brand-gray-100/70 hover:text-brand-black'}`}>
            {({ isActive }) => <><Icon className={`w-4 h-4 ${isActive ? 'text-accent-600' : 'text-brand-gray-400'}`} />{label}</>}
          </NavLink>
        ))}
      </div>
      <div className="mt-auto pt-3 border-t border-brand-gray-200 space-y-1">
        <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 h-8 text-sm text-brand-gray-600 hover:bg-brand-gray-100/70">
          {dark ? <Sun className="w-4 h-4 text-brand-gray-400" /> : <Moon className="w-4 h-4 text-brand-gray-400" />}{dark ? 'Light mode' : 'Dark mode'}
        </button>
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <Avatar user={user} size={28} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-brand-gray-500">{ROLE[user.role]?.label}</p>
          </div>
          <button type="button" className="btn-icon" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut className="w-4 h-4" /></button>
        </div>
      </div>
    </nav>
  )

  return (
    <div className="flex min-h-screen">
      <aside data-app-chrome className="hidden lg:block w-60 shrink-0 glass border-r sticky top-0 h-screen">{nav}</aside>
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)}>
          <aside className="glass-strong border-r w-64 h-full animate-fade-in" onClick={(e) => e.stopPropagation()}>{nav}</aside>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header data-app-chrome className="lg:hidden sticky top-0 z-30 glass border-b flex items-center justify-between px-4 h-14">
          <Wordmark />
          <button className="btn-icon" onClick={() => setOpen((o) => !o)} aria-label="Menu">{open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
        </header>
        <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
