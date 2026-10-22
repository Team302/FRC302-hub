// Trends adapter for the daily series endpoints.
//
//   GET /api/reports/trends    admin/manager: revenue, money_out, invoices_sent,
//                              expenses, jobs_completed, jobs_scheduled, new_clients
//   GET /api/dashboard/trends  every role:    jobs_completed, jobs_scheduled, new_clients
//
// Response (both, `?days=N&compare=1`, days clamped 1..365):
//   { days, from, to, tz, series: { key: [{ date, value }] }, totals: { key },
//     previous?: { from, to, series, totals } }        // previous only with compare=1
// Days are calendar days 'YYYY-MM-DD' in the company timezone (`tz`, an IANA
// name, or 'UTC' when none is set), oldest to newest, contiguous, and the last
// point is the company's today (partial). A key missing from `series` means
// "not available to this role": helpers return null for it, never 0.
//
// Label dates from the `date` strings as given. Everything here does date math
// on those strings in UTC, so no browser-timezone shift can move a point to the
// previous day.
//
// Typical use (one fetch serves 7D/30D/90D plus their previous windows):
//   const t = await fetchTrends({ days: 180 })            // null when unavailable
//   const w = deriveWindow(t, 'revenue', 30)               // { current, previous, total, previousTotal, change }
//   <AreaChart data={toChartData(w.current)} compare={w.previous && toChartData(w.previous)} />
//
// Everything except fetchTrends is pure.

import { apiFetch } from './api'

export const MONEY_TREND_KEYS = ['revenue', 'money_out', 'invoices_sent', 'expenses']
export const OPERATIONAL_TREND_KEYS = ['jobs_completed', 'jobs_scheduled', 'new_clients']
export const MAX_TREND_DAYS = 365

const DAY_MS = 86400000
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

const toNum = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const round2 = (n) => Math.round(n * 100) / 100
const parseDay = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10)

// ── Fetch ──────────────────────────────────────────────────────────────────

/**
 * Fetch and normalize a trends payload. Never throws: resolves to null on
 * 403 (role), 404 (not deployed), network error or abort, so a page can treat
 * trends as optional and render without sparklines/deltas.
 * @param {{ days?: number, compare?: boolean, scope?: 'reports'|'dashboard', signal?: AbortSignal }} [opts]
 */
export async function fetchTrends({ days = 30, compare = false, scope = 'reports', signal } = {}) {
  const base = scope === 'dashboard' ? '/api/dashboard/trends' : '/api/reports/trends'
  const n = Math.min(MAX_TREND_DAYS, Math.max(1, Math.round(Number(days) || 30)))
  try {
    const res = await apiFetch(`${base}?days=${n}${compare ? '&compare=1' : ''}`, signal ? { signal } : undefined)
    if (!res.ok) return null
    return normalizeTrends(await res.json())
  } catch {
    return null
  }
}

// ── Normalize ──────────────────────────────────────────────────────────────

function cleanRows(rows) {
  if (!Array.isArray(rows)) return null
  return rows
    .filter(r => r && typeof r.date === 'string' && DAY_RE.test(r.date.slice(0, 10)))
    .map(r => ({ date: r.date.slice(0, 10), value: toNum(r.value) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

// Zero-fill missing days between `from` and `to` (inclusive).
function densify(rows, from, to) {
  const start = DAY_RE.test(from || '') ? from : rows[0]?.date
  const end = DAY_RE.test(to || '') ? to : rows[rows.length - 1]?.date
  if (!start || !end) return rows
  const startMs = parseDay(start)
  const count = Math.round((parseDay(end) - startMs) / DAY_MS) + 1
  if (count <= 0 || count > 3660) return rows
  if (rows.length === count && rows[0].date === start && rows[count - 1].date === end) return rows
  const byDay = new Map()
  for (const r of rows) byDay.set(r.date, (byDay.get(r.date) || 0) + r.value)
  return Array.from({ length: count }, (_, i) => {
    const date = dayKey(startMs + i * DAY_MS)
    return { date, value: byDay.get(date) ?? 0 }
  })
}

function normalizeBlock(block) {
  const series = {}
  const totals = {}
  for (const [key, rows] of Object.entries(block?.series || {})) {
    const clean = cleanRows(rows)
    if (!clean) continue
    const dense = densify(clean, block.from, block.to)
    series[key] = dense
    const t = block.totals?.[key]
    totals[key] = t != null && Number.isFinite(Number(t)) ? Number(t) : sumSeries(dense)
  }
  const first = Object.values(series)[0] || []
  return {
    from: DAY_RE.test(block?.from || '') ? block.from : first[0]?.date ?? null,
    to: DAY_RE.test(block?.to || '') ? block.to : first[first.length - 1]?.date ?? null,
    series,
    totals,
  }
}

/**
 * Validate and tidy a raw payload: sorted, zero-filled, numeric values, totals
 * present for every key. Returns null when the payload has no `series` object.
 */
export function normalizeTrends(json) {
  if (!json || typeof json !== 'object' || !json.series || typeof json.series !== 'object') return null
  const cur = normalizeBlock(json)
  const firstLen = (Object.values(cur.series)[0] || []).length
  const out = { days: Number(json.days) || firstLen, tz: typeof json.tz === 'string' ? json.tz : null, ...cur }
  if (json.previous && typeof json.previous === 'object' && json.previous.series) {
    out.previous = normalizeBlock(json.previous)
  }
  return out
}

// ── Series access ──────────────────────────────────────────────────────────

/** Current-window series for `key` (as returned), or null when the key is absent. */
export function getSeries(trends, key) {
  const s = trends?.series?.[key]
  return Array.isArray(s) ? s : null
}

/**
 * Previous block + current block as one contiguous series (2N days for a
 * days=N&compare=1 payload; just the current series otherwise). null when absent.
 */
export function fullSeries(trends, key) {
  const cur = getSeries(trends, key)
  if (!cur) return null
  const prev = trends?.previous?.series?.[key]
  if (!Array.isArray(prev) || prev.length === 0) return cur
  if (cur.length && prev[prev.length - 1].date >= cur[0].date) return cur
  return prev.concat(cur)
}

/** Keys present in the payload (what this role may see). */
export function trendKeys(trends) {
  return Object.keys(trends?.series || {})
}

// ── Windows ────────────────────────────────────────────────────────────────

/**
 * The last `n` points, ending `offset` points before the newest (offset 1 =
 * window ending yesterday, 7 = same window a week earlier). Shorter than `n`
 * when the series is. null for a null series.
 */
export function sliceWindow(series, n, offset = 0) {
  if (!Array.isArray(series)) return null
  const size = Math.max(0, Math.floor(n))
  const end = series.length - Math.max(0, Math.floor(offset))
  if (end <= 0 || size === 0) return []
  return series.slice(Math.max(0, end - size), end)
}

/**
 * The `n` points immediately before sliceWindow(series, n, offset). null when
 * the series doesn't reach back that far, so callers hide the compare line and
 * delta instead of comparing against a partial window.
 */
export function previousWindow(series, n, offset = 0) {
  if (!Array.isArray(series)) return null
  const size = Math.max(0, Math.floor(n))
  const end = series.length - Math.max(0, Math.floor(offset)) - size
  if (size === 0 || end - size < 0) return null
  return series.slice(end - size, end)
}

/** True when the payload holds a full `n`-day window plus its previous window. */
export function canCompare(trends, n, key) {
  const s = fullSeries(trends, key || trendKeys(trends)[0])
  return !!s && s.length >= 2 * n
}

/**
 * Everything a KPI card needs for an n-day window, derived from one payload.
 * Returns null when `key` is absent (hidden for this role), otherwise
 *   { current, previous, total, previousTotal, change }
 *   current       last n days ([{ date, value }])
 *   previous      the n days before (null when history is too short)
 *   total         sum of current
 *   previousTotal sum of previous (null when previous is null)
 *   change        pctChange(total, previousTotal): null when unknown or prev is 0
 */
export function deriveWindow(trends, key, n, { offset = 0 } = {}) {
  const full = fullSeries(trends, key)
  if (!full) return null
  const current = sliceWindow(full, n, offset)
  const previous = previousWindow(full, n, offset)
  const total = sumSeries(current)
  const previousTotal = previous ? sumSeries(previous) : null
  return { current, previous, total, previousTotal, change: pctChange(total, previousTotal) }
}

// ── Math ───────────────────────────────────────────────────────────────────

/** Sum of values (rounded to cents). null for a null series, 0 for []. */
export function sumSeries(series) {
  if (!Array.isArray(series)) return null
  let s = 0
  for (const p of series) s += toNum(typeof p === 'number' ? p : p?.value)
  return round2(s)
}

/**
 * Percent change (12.5 means +12.5%). null when either side is missing or
 * non-finite, or when prev is 0 (use `cur > 0` to decide on a "New" label).
 */
export function pctChange(cur, prev) {
  if (cur == null || prev == null) return null
  const c = Number(cur)
  const p = Number(prev)
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null
  return ((c - p) / Math.abs(p)) * 100
}

// ── Buckets and chart data ─────────────────────────────────────────────────

/**
 * Calendar-week buckets (weekStartsOn: 1 = Monday, 0 = Sunday).
 * → [{ date: weekStart, end: lastDayInBucket, value, days, partial }]
 * `partial` is true when the bucket holds fewer than 7 days (window edges).
 */
export function bucketWeekly(series, { weekStartsOn = 1 } = {}) {
  if (!Array.isArray(series)) return null
  const out = []
  let bucket = null
  for (const p of series) {
    const ms = parseDay(p.date)
    const back = (new Date(ms).getUTCDay() - weekStartsOn + 7) % 7
    const start = dayKey(ms - back * DAY_MS)
    if (!bucket || bucket.date !== start) {
      bucket = { date: start, end: p.date, value: 0, days: 0 }
      out.push(bucket)
    }
    bucket.value += toNum(p.value)
    bucket.days += 1
    bucket.end = p.date
  }
  return out.map(b => ({ ...b, value: round2(b.value), partial: b.days < 7 }))
}

/**
 * Calendar-month buckets → [{ date: 'YYYY-MM-01', end, value, days, partial }]
 * `partial` is true when the bucket doesn't cover the whole month.
 */
export function bucketMonthly(series) {
  if (!Array.isArray(series)) return null
  const out = []
  let bucket = null
  for (const p of series) {
    const start = `${p.date.slice(0, 7)}-01`
    if (!bucket || bucket.date !== start) {
      bucket = { date: start, end: p.date, value: 0, days: 0 }
      out.push(bucket)
    }
    bucket.value += toNum(p.value)
    bucket.days += 1
    bucket.end = p.date
  }
  return out.map(b => {
    const [y, m] = b.date.split('-').map(Number)
    const inMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return { ...b, value: round2(b.value), partial: b.days < inMonth }
  })
}

const DAY_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const MONTH_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })

/** 'YYYY-MM-DD' → "Sep 13" (UTC, no timezone shift). */
export function formatDay(date) {
  return DAY_RE.test(date || '') ? DAY_FMT.format(parseDay(date)) : ''
}

/** 'YYYY-MM-DD' → "Sep", or "Sep '25" with { year: true }. */
export function formatMonth(date, { year = false } = {}) {
  if (!DAY_RE.test(date || '')) return ''
  const label = MONTH_FMT.format(parseDay(date))
  return year ? `${label} '${date.slice(2, 4)}` : label
}

/**
 * Series → AreaChart/Sparkline/ColumnChart rows: [{ label, value, date, end, partial }].
 *   bucket       'day' (default) | 'week' | 'month'
 *   labelFormat  optional (date, { bucket, index, count, end, partial }) => string
 * Default labels: day "Sep 13", week "Week of Sep 8", month "Sep" ("Sep '25"
 * when the rows span more than one year). A null series gives [].
 */
export function toChartData(series, { bucket = 'day', labelFormat } = {}) {
  if (!Array.isArray(series)) return []
  const rows = bucket === 'week' ? bucketWeekly(series)
    : bucket === 'month' ? bucketMonthly(series)
      : series.map(p => ({ date: p.date, end: p.date, value: toNum(p.value), days: 1, partial: false }))
  const count = rows.length
  const spansYears = count > 1 && rows[0].date.slice(0, 4) !== rows[count - 1].date.slice(0, 4)
  return rows.map((r, index) => {
    let label
    if (typeof labelFormat === 'function') label = labelFormat(r.date, { bucket, index, count, end: r.end, partial: r.partial })
    else if (bucket === 'week') label = `Week of ${formatDay(r.date)}`
    else if (bucket === 'month') label = formatMonth(r.date, { year: spansYears })
    else label = formatDay(r.date)
    return { label, value: r.value, date: r.date, end: r.end, partial: r.partial }
  })
}
