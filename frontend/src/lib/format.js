// Display helpers. Server timestamps are UTC 'YYYY-MM-DD HH:MM:SS' (SQLite) or ISO strings.

export function parseServerTime(value) {
  if (!value) return null
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const fullFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export const fmtDay = (d) => (d ? dayFmt.format(d) : '')
export const fmtTime = (d) => (d ? timeFmt.format(d) : '')
export const fmtFull = (d) => (d ? fullFmt.format(d) : '')

export function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Due-date label + tone for a YYYY-MM-DD.
export function dueInfo(due, done) {
  if (!due) return null
  const today = todayIso()
  const d = new Date(`${due}T12:00:00`)
  const days = Math.round((d - new Date(`${today}T12:00:00`)) / 86400000)
  const label = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days === -1 ? 'Yesterday' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d)
  const tone = done ? 'muted' : days < 0 ? 'overdue' : days <= 2 ? 'soon' : 'normal'
  return { label, tone, days }
}

export function relative(date) {
  if (!date) return ''
  const s = Math.round((Date.now() - date.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`
  return fmtDay(date)
}

export function mmss(totalSeconds) {
  const neg = totalSeconds < 0
  const t = Math.abs(Math.round(totalSeconds))
  return `${neg ? '+' : ''}${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

// <input type="datetime-local"> value ↔ ISO
export function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fromLocalInput = (value) => new Date(value).toISOString()

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?'
