// Shared helpers for the detail-page primitives (components/detail).
//
// Public (re-exported by ./index.js):
//   statusLabel(s)              'in_progress' → 'In progress', 'on_hold' → 'On hold',
//                               'requires_followup' → 'Needs follow-up', 'past_due' → 'Past due';
//                               otherwise underscores → spaces and the first letter upper. null/'' → ''.
//   usePermissions()            { role, userId, isManager, canSeeMoney, canWrite }. While the role is
//                               unknown: isManager/canSeeMoney are false and canWrite is true.
//   parseUtc(d)                 naive SQLite datetime('now') ('YYYY-MM-DD HH:MM:SS', or a bare date) →
//                               Date in UTC. ISO strings with a 'T', Dates and epoch ms pass through.
//                               Anything unparseable → null.
//   relTime(d, now?)            'just now' | '5m ago' | '3h ago' | '2d ago' | 'Sep 2, 2026'. Bad input → ''.
//   formatTimestamp(d)          absolute 'Sep 2, 2026, 3:04 PM' for a UTC stamp (tooltips). Bad input → ''.
//   formatDateRange(start, end) local wall-clock values ('YYYY-MM-DDTHH:MM', the space form, or date-only):
//                               'Sep 14, 2026, 9:00 AM – 11:00 AM' within one day, otherwise
//                               'Sep 14, 2026, 9:00 AM – Sep 15, 2026, 5:00 PM'. No start → ''.
//   useIsDesktop()              live matchMedia('(min-width: 1024px)'); false on the server.
//   Portal                      renders children into document.body after mount (nothing on the
//                               server or on the first client pass). Props: { children, container? }.
//
// Internal (shared by the primitives, not part of the barrel):
//   renderIcon(icon, className)          lucide component or element → decorative element
//   flattenChildren(children)            Children.toArray that also unwraps fragments (for Stagger)
//   useFreshKeys(keys, ready, resetKey)  → (key) => true for rows that appeared after the first ready render
//   rovingIndex(current, key, count, orientation)  next index for arrow/Home/End keys (wraps) or null
//   useIsomorphicLayoutEffect            useLayoutEffect in the browser, useEffect on the server

import {
  Children, Fragment, cloneElement, createElement, isValidElement,
  useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useSession } from '../../context/Session'

const MANAGER_ROLES = ['admin', 'lead']

export const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

// ── Labels ───────────────────────────────────────────────────────────────────

// Same wording as components/list/status.js (list pages), so a status reads the same on the list
// and on the record. Only the entries that differ from the sentence-case fallback are listed.
const STATUS_LABELS = {
  partial: 'Partially paid',
  cancelled: 'Canceled',
  todo: 'To do',
  requires_followup: 'Needs follow-up',
}

export function statusLabel(s) {
  if (s == null) return ''
  const key = String(s).trim()
  if (!key) return ''
  const known = STATUS_LABELS[key] ?? STATUS_LABELS[key.toLowerCase()]
  if (known) return known
  const text = key.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// ── Permissions (display gating only; the worker enforces) ───────────────────

export function usePermissions() {
  const { user } = useSession() || {}
  const role = user?.role ?? null
  const userId = user?.id ?? null
  return useMemo(() => {
    const isManager = !!role && MANAGER_ROLES.includes(role)
    return { role, userId, isManager, canSeeMoney: isManager, canWrite: role !== 'readonly' }
  }, [role, userId])
}

// ── Dates ────────────────────────────────────────────────────────────────────

const DATE_OPTS = { month: 'short', day: 'numeric', year: 'numeric' }
const TIME_OPTS = { hour: 'numeric', minute: '2-digit' }

// 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM[:SS[.fff]]' with a space (SQLite datetime('now')).
const NAIVE_UTC = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?$/

export function parseUtc(d) {
  if (d == null || d === '') return null
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d
  if (typeof d === 'number') return Number.isFinite(d) ? new Date(d) : null
  const s = String(d).trim()
  const m = NAIVE_UTC.exec(s)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2])
    const day = Number(m[3])
    const h = m[4] == null ? 0 : Number(m[4])
    const mi = m[5] == null ? 0 : Number(m[5])
    const sec = m[6] == null ? 0 : Number(m[6])
    const ms = m[7] == null ? 0 : Number(`${m[7]}00`.slice(0, 3))
    if (mo < 1 || mo > 12 || day < 1 || day > 31 || h > 23 || mi > 59 || sec > 59) return null
    const date = new Date(Date.UTC(y, mo - 1, day, h, mi, sec, ms))
    return date.getUTCDate() === day ? date : null
  }
  const date = new Date(s)
  return Number.isNaN(date.getTime()) ? null : date
}

export function relTime(d, now = Date.now()) {
  const date = parseUtc(d)
  if (!date) return ''
  const secs = Math.floor((now - date.getTime()) / 1000)
  if (secs < -60) return date.toLocaleDateString('en-US', DATE_OPTS)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-US', DATE_OPTS)
}

export function formatTimestamp(d) {
  const date = parseUtc(d)
  return date ? date.toLocaleString('en-US', { ...DATE_OPTS, ...TIME_OPTS }) : ''
}

// Local wall-clock value: 'YYYY-MM-DD', 'YYYY-MM-DDTHH:MM[:SS]' or the same with a space.
const LOCAL_WALL = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/

function parseWall(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : { date: v, hasTime: true }
  const s = String(v).trim()
  const m = LOCAL_WALL.exec(s)
  if (m) {
    const hasTime = m[4] != null
    const date = new Date(
      Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      hasTime ? Number(m[4]) : 0, hasTime ? Number(m[5]) : 0, m[6] ? Number(m[6]) : 0,
    )
    return Number.isNaN(date.getTime()) ? null : { date, hasTime }
  }
  const date = new Date(s)
  return Number.isNaN(date.getTime()) ? null : { date, hasTime: true }
}

const dayText = (date) => date.toLocaleDateString('en-US', DATE_OPTS)
const timeText = (date) => date.toLocaleTimeString('en-US', TIME_OPTS)
const wallText = ({ date, hasTime }) => (hasTime ? `${dayText(date)}, ${timeText(date)}` : dayText(date))
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export function formatDateRange(start, end) {
  const s = parseWall(start)
  if (!s) return ''
  const e = parseWall(end)
  if (!e || e.date.getTime() === s.date.getTime()) return wallText(s)
  if (sameDay(s.date, e.date)) {
    return s.hasTime && e.hasTime ? `${wallText(s)} – ${timeText(e.date)}` : wallText(s)
  }
  return `${wallText(s)} – ${wallText(e)}`
}

// ── Layout ───────────────────────────────────────────────────────────────────

const DESKTOP_QUERY = '(min-width: 1024px)'
const canMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

export function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => canMatchMedia() && window.matchMedia(DESKTOP_QUERY).matches)
  useEffect(() => {
    if (!canMatchMedia()) return undefined
    const mq = window.matchMedia(DESKTOP_QUERY)
    const onChange = () => setDesktop(mq.matches)
    onChange()
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else if (mq.addListener) mq.addListener(onChange)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange)
      else if (mq.removeListener) mq.removeListener(onChange)
    }
  }, [])
  return desktop
}

// Floating UI escapes transformed ancestors (route fade, Stagger), overflow-hidden cards and
// table scrollers by rendering at the end of <body>. Context (router, toasts) still flows through.
export function Portal({ children, container }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted || typeof document === 'undefined') return null
  return createPortal(children, container || document.body)
}

// ── Internal helpers ─────────────────────────────────────────────────────────

export function renderIcon(icon, className) {
  if (!icon) return null
  if (isValidElement(icon)) return icon
  if (typeof icon === 'string' || typeof icon === 'number') return icon
  return createElement(icon, { className, 'aria-hidden': true })
}

// Children.toArray (drops null/false, assigns stable keys) that also unwraps fragments, so a
// page can write `{cond && <>…</>}` inside a Stagger wrapper without a Fragment receiving className.
export function flattenChildren(children, prefix = '') {
  const out = []
  Children.toArray(children).forEach(child => {
    if (isValidElement(child) && child.type === Fragment) {
      out.push(...flattenChildren(child.props.children, `${prefix}${child.key}/`))
    } else if (prefix && isValidElement(child)) {
      out.push(cloneElement(child, { key: `${prefix}${child.key}` }))
    } else {
      out.push(child)
    }
  })
  return out
}

// Tracks which row keys were present on the first "ready" render. Rows that show up later
// (a new note, a new task) report true, so only they get a one-time fade-up. The answer for a
// key never changes, so its animation class is never removed mid-animation.
export function useFreshKeys(keys, ready = true, resetKey) {
  const state = useRef({ resetKey, seen: null })
  if (state.current.resetKey !== resetKey) state.current = { resetKey, seen: null }
  if (ready) {
    const s = state.current
    if (s.seen === null) s.seen = new Map(keys.map(k => [k, false]))
    else keys.forEach(k => { if (!s.seen.has(k)) s.seen.set(k, true) })
  }
  const seen = state.current.seen
  return (key) => !!seen && seen.get(key) === true
}

export function rovingIndex(current, key, count, orientation = 'vertical') {
  if (!(count > 0)) return null
  const next = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
  const prev = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
  if (key === next) return current < 0 ? 0 : (current + 1) % count
  if (key === prev) return current < 0 ? count - 1 : (current - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}
