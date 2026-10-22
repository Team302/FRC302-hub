// Top bar, from ProjectPro's: global search (⌘K) across boards, tasks and meetings, the inbox
// bell, theme, account menu and the round "+" New menu.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, CalendarDays, CheckSquare, LayoutGrid, LogOut, Menu, Monitor, Moon, Plus, Search, Sun, X } from 'lucide-react'
import { get } from '../../lib/api'
import { useSession } from '../../context/Session'
import { atLeast } from '../../lib/constants'
import { useTheme } from '../../lib/theme'
import { StatusPill } from '../board/cells'

function Section({ label, children }) {
  return (
    <div>
      <p className="px-4 py-1.5 text-xs font-medium text-brand-gray-400 uppercase tracking-wider bg-brand-gray-50/70">{label}</p>
      {children}
    </div>
  )
}

function SearchResults({ results, loading, onClose }) {
  if (!results && !loading) return null
  const total = results ? results.boards.length + results.items.length + results.meetings.length : 0
  const row = 'flex items-center gap-3 px-4 py-2.5 hover:bg-brand-gray-50 transition-colors'
  return (
    <div className="absolute left-0 top-full mt-2 w-full glass-strong border rounded-xl z-50 overflow-hidden animate-slide-down origin-top">
      {loading && !results ? <div className="px-4 py-3 text-sm text-brand-gray-400">Searching…</div>
        : total === 0 ? <div className="px-4 py-3 text-sm text-brand-gray-400">No results</div> : (
          <div className="max-h-96 overflow-y-auto">
            {results.items.length > 0 && <Section label="Tasks">{results.items.map((i) => (
              <Link key={i.id} to={`/boards/${i.board_id}?item=${i.id}`} onClick={onClose} className={row}>
                <CheckSquare className="w-3.5 h-3.5 text-brand-gray-400 shrink-0" />
                <div className="min-w-0 flex-1"><p className="text-sm font-medium text-brand-black truncate">{i.title}</p><p className="text-xs text-brand-gray-400 truncate">{i.board_name}</p></div>
                <StatusPill status={i.status} small />
              </Link>
            ))}</Section>}
            {results.boards.length > 0 && <Section label="Boards">{results.boards.map((b) => (
              <Link key={b.id} to={`/boards/${b.id}`} onClick={onClose} className={row}>
                <LayoutGrid className="w-3.5 h-3.5 text-brand-gray-400 shrink-0" /><p className="text-sm font-medium text-brand-black truncate">{b.name}</p>
              </Link>
            ))}</Section>}
            {results.meetings.length > 0 && <Section label="Meetings">{results.meetings.map((m) => (
              <Link key={m.id} to={`/meetings/${m.id}`} onClick={onClose} className={row}>
                <CalendarDays className="w-3.5 h-3.5 text-brand-gray-400 shrink-0" />
                <div className="min-w-0"><p className="text-sm font-medium text-brand-black truncate">{m.title}</p><p className="text-xs text-brand-gray-400">{new Date(m.starts_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p></div>
              </Link>
            ))}</Section>}
          </div>
        )}
    </div>
  )
}

const THEME_STEPS = {
  dark: { next: 'light', Icon: Moon, label: 'Theme: dark. Switch to light' },
  light: { next: 'system', Icon: Sun, label: 'Theme: light. Switch to match your device' },
  system: { next: 'dark', Icon: Monitor, label: 'Theme: matches your device. Switch to dark' },
}
function ThemeButton() {
  const [theme, setTheme] = useTheme()
  const { next, Icon, label } = THEME_STEPS[theme] || THEME_STEPS.dark
  return <button type="button" onClick={() => setTheme(next)} aria-label={label} title={label} className="btn-icon"><Icon className="w-4 h-4" /></button>
}

function useOutside(ref, onOutside) {
  useEffect(() => {
    const handler = (e) => ref.current && !ref.current.contains(e.target) && onOutside()
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, onOutside])
}

export default function Topbar({ onMenuClick }) {
  const { user, unread, signOut, openNew } = useSession()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showUser, setShowUser] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const searchRef = useRef(null)
  const inputRef = useRef(null)
  const userRef = useRef(null)
  const newRef = useRef(null)
  const timer = useRef(null)
  const seq = useRef(0)
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || '')

  const clear = () => { clearTimeout(timer.current); seq.current++; setSearch(''); setResults(null); setLoading(false) }
  useOutside(searchRef, clear)
  useOutside(userRef, () => setShowUser(false))
  useOutside(newRef, () => setShowNew(false))

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      } else if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        clear()
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function onSearch(val) {
    setSearch(val)
    clearTimeout(timer.current)
    const mine = ++seq.current
    if (val.trim().length < 2) { setResults(null); setLoading(false); return }
    setLoading(true)
    timer.current = setTimeout(async () => {
      let data = null
      try { data = await get(`/search?q=${encodeURIComponent(val.trim())}`) } catch { /* shown as no results */ }
      if (mine !== seq.current) return
      setResults(data || { boards: [], items: [], meetings: [] })
      setLoading(false)
    }, 250)
  }

  const newItems = [
    { type: 'task', label: 'Task', icon: CheckSquare },
    atLeast(user, 'lead') && { type: 'board', label: 'Board', icon: LayoutGrid },
    atLeast(user, 'lead') && { type: 'meeting', label: 'Meeting', icon: CalendarDays },
  ].filter(Boolean)

  return (
    <header data-app-chrome className="h-14 glass border-b border-x-0 border-t-0 flex items-center gap-3 px-4 lg:px-6 shrink-0 relative z-30">
      <button onClick={onMenuClick} aria-label="Open menu" className="lg:hidden btn-icon"><Menu className="w-4 h-4" /></button>

      <div className="flex-1 max-w-2xl relative" ref={searchRef}>
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gray-400 pointer-events-none" />
        <input ref={inputRef} type="text" placeholder="Search tasks, boards and meetings…" aria-label="Search tasks, boards and meetings"
          value={search} onChange={(e) => onSearch(e.target.value)}
          className="input pl-10 pr-16 h-9 text-sm rounded-full bg-brand-gray-100/70 border-transparent hover:bg-brand-gray-100 hover:border-transparent focus:bg-brand-gray-50" />
        {search ? (
          <button onClick={clear} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-gray-400 hover:text-brand-gray-600"><X className="w-4 h-4" /></button>
        ) : (
          <kbd className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-0.5 px-1.5 h-5 rounded-md border border-brand-gray-200 bg-white text-[11px] font-medium text-brand-gray-400 pointer-events-none select-none">{isMac ? '⌘' : 'Ctrl'} K</kbd>
        )}
        <SearchResults results={results} loading={loading} onClose={clear} />
      </div>

      <div className="flex items-center gap-1 ml-auto">
        <button onClick={() => navigate('/inbox')} aria-label={unread > 0 ? `Inbox (${unread} unread)` : 'Inbox'} className="btn-icon relative">
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span className="absolute top-0 right-0 min-w-[16px] h-4 px-1 bg-flame-500 text-white text-[10px] font-semibold rounded-full ring-2 ring-white flex items-center justify-center leading-none animate-scale-in">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
        <ThemeButton />
        <div className="relative" ref={userRef}>
          <button onClick={() => setShowUser((p) => !p)} aria-label="Account menu" aria-haspopup="menu" aria-expanded={showUser} className="flex items-center rounded-full p-1 hover:bg-brand-gray-100 transition-colors">
            <div className="w-7 h-7 rounded-full bg-brand-gray-900 flex items-center justify-center text-xs font-medium text-white">{user.name?.[0]?.toUpperCase()}</div>
          </button>
          {showUser && (
            <div className="menu-pop absolute right-0 top-full mt-2 w-56 origin-top-right" role="menu">
              <div className="px-4 py-2.5 border-b border-brand-gray-100">
                <p className="text-sm font-medium text-brand-black truncate">{user.name}</p>
                <p className="text-xs text-brand-gray-500 truncate">{user.email}</p>
              </div>
              <div className="p-1">
                <button role="menuitem" onClick={signOut} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-status-danger rounded-lg hover:bg-red-50 transition-colors">
                  <LogOut className="w-3.5 h-3.5" /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="relative ml-1" ref={newRef}>
          <button onClick={() => setShowNew((p) => !p)} aria-label="New" aria-haspopup="menu" aria-expanded={showNew} title="New"
            className="w-8 h-8 rounded-full bg-accent-600 text-white flex items-center justify-center hover:bg-accent-700 transition-colors shadow-card">
            <Plus className="w-4 h-4" />
          </button>
          {showNew && (
            <div className="menu-pop absolute right-0 top-full mt-2 w-48 origin-top-right p-1" role="menu">
              {newItems.map(({ type, label, icon: Icon }) => (
                <button key={type} role="menuitem" onClick={() => { setShowNew(false); openNew(type) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-brand-gray-700 rounded-lg hover:bg-brand-gray-50 hover:text-brand-black transition-colors">
                  <Icon className="w-3.5 h-3.5 text-brand-gray-400" /> {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
