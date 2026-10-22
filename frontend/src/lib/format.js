// Shared formatting + status helpers (ported from ProjectPro, plus 302 Hub helpers at the end).
//
// These consolidate the per-page inline `fmt`/`money`/`fmtDate` helpers and the
// scattered status→color maps into one canonical source. House rules:
//   - Money SHOWS CENTS by default (Stripe-style), USD via Intl.NumberFormat.
//   - Dates render like "Aug 25, 2026"; null/invalid → "—".
//   - Status variants map to the existing `.badge-*` set in globals.css:
//     gray / black / success / warning / danger / info.
//
// NOTE: introduced as shared foundation. Pages still use their own inline
// helpers today; adoption happens in a later increment.

// ── Money ──────────────────────────────────────────────────────────────────

/**
 * Format a number as USD currency.
 * @param {number|null|undefined} n
 * @param {{ cents?: boolean }} [opts] - cents defaults to true (show $0.00).
 *   Pass { cents: false } for whole-dollar display ($0).
 * @returns {string} e.g. "$1,234.56" or "$1,235"
 */
export function formatMoney(n, { cents = true } = {}) {
  const num = Number(n)
  const value = Number.isFinite(num) ? num : 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value)
}

/**
 * Format money with an explicit +/− sign for money-in / money-out display.
 * Uses a true minus sign (−, U+2212) to match currency typography.
 * @param {number|null|undefined} n
 * @param {'in'|'out'|'+'|'-'} [dir] - direction; defaults to sign of n.
 * @param {{ cents?: boolean }} [opts]
 * @returns {string} e.g. "+$50.00" or "−$50.00"
 */
export function formatMoneySigned(n, dir, opts) {
  const num = Number(n)
  const value = Number.isFinite(num) ? num : 0
  const abs = formatMoney(Math.abs(value), opts)
  let sign
  if (dir === 'in' || dir === '+') sign = '+'
  else if (dir === 'out' || dir === '-') sign = '−'
  else sign = value < 0 ? '−' : '+'
  return `${sign}${abs}`
}

// ── Numbers ──────────────────────────────────────────────────────────────────

/**
 * Grouped integer/decimal formatting (no currency).
 * @param {number|null|undefined} n
 * @returns {string} e.g. "1,234" or "1,234.5"
 */
export function formatNumber(n) {
  const num = Number(n)
  const value = Number.isFinite(num) ? num : 0
  return new Intl.NumberFormat('en-US').format(value)
}

// ── Dates ──────────────────────────────────────────────────────────────────

function toDate(d) {
  if (d === null || d === undefined || d === '') return null
  let input = d
  // A bare date-only string ("YYYY-MM-DD") is parsed by `new Date()` as UTC
  // midnight, which renders a day early in negative-UTC timezones. Anchor it to
  // LOCAL midnight instead so date-only fields (due dates, expense dates, etc.)
  // show the intended calendar day. Datetime strings are left untouched
  // (JS parses "YYYY-MM-DDTHH:MM:SS" without a zone as local already).
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) {
    input = `${d.trim()}T00:00:00`
  }
  const date = input instanceof Date ? input : new Date(input)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Format a date like "Aug 25, 2026". null/invalid → "—".
 * @param {string|number|Date|null|undefined} d
 * @returns {string}
 */
export function formatDate(d) {
  const date = toDate(d)
  if (!date) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Format a date+time like "Aug 25, 2026, 2:19 PM". null/invalid → "—".
 * @param {string|number|Date|null|undefined} d
 * @returns {string}
 */
export function formatDateTime(d) {
  const date = toDate(d)
  if (!date) return '—'
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

// ── Server timestamps ──────────────────────────────────────────────────────
// Columns the database stamps itself (created_at, updated_at, paid_at, ... via SQLite
// datetime('now')) are UTC written as 'YYYY-MM-DD HH:MM:SS' with no zone marker, and
// browsers read that shape as LOCAL time, so formatDate/formatDateTime would show the
// UTC clock (hours off, or the next day in US evenings). Use these for such stamps.
// Not for typed wall-clock values (a job's scheduled_start), which share the shape
// but mean local time: those stay on formatDate/formatDateTime.

const NAIVE_STAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/

function toServerDate(d) {
  if (typeof d === 'string' && NAIVE_STAMP.test(d.trim())) return toDate(`${d.trim().replace(' ', 'T')}Z`)
  return toDate(d)
}

/** formatDate for a UTC server stamp: "Aug 25, 2026" in the viewer's zone. */
export function formatServerDate(d) {
  const date = toServerDate(d)
  return date ? formatDate(date) : '—'
}

/** formatDateTime for a UTC server stamp: "Aug 25, 2026, 2:19 PM" in the viewer's zone. */
export function formatServerDateTime(d) {
  const date = toServerDate(d)
  return date ? formatDateTime(date) : '—'
}

// ── Status → badge variant ────────────────────────────────────────────────────

/**
 * Canonical map from a status string to a badge variant key.
 * Variant keys correspond to the `.badge-*` set in globals.css:
 * gray | black | success | warning | danger | info.
 *
 * Covers invoice, estimate, job, subscription and payout/transaction statuses.
 * Where the same status string appears across domains (e.g. "draft", "paid",
 * "pending") the intent is consistent, so a single flat map is sufficient.
 */
export const STATUS_STYLES = {
  // Invoice
  draft: 'gray',
  sent: 'info',
  viewed: 'info',
  signed: 'info',
  partial: 'warning',
  paid: 'success',
  overdue: 'danger',
  void: 'gray',

  // Estimate
  approved: 'success',
  declined: 'danger',
  expired: 'warning',
  converted: 'black',

  // Job
  scheduled: 'info',
  in_progress: 'warning',
  on_hold: 'warning',
  completed: 'success',
  cancelled: 'gray',

  // Subscription
  active: 'success',
  paused: 'warning',
  canceled: 'gray',
  past_due: 'danger',

  // Payout / transaction
  pending: 'warning',
  failed: 'danger',
  confirmed: 'success',
}

/**
 * Resolve a status string to a badge variant key, falling back to 'gray'.
 * @param {string} status
 * @returns {'gray'|'black'|'success'|'warning'|'danger'|'info'}
 */
export function statusStyle(status) {
  return STATUS_STYLES[status] || 'gray'
}

// ── 302 Hub helpers ──

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
