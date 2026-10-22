// Period-over-period change pill: arrow + "12.4%" in green (up) or red (down),
// gray when flat or unknown, accent "New" when growing from zero.
//
// Props:
//   value     - percent change (12.4 means +12.4%). null/undefined/NaN renders a
//               neutral "—" (unknown). Use lib/trends `pctChange(cur, prev)`.
//   current, previous
//             - alternative to `value`: the percent is computed for you, and the
//               pill reads "New" when previous is 0 and current > 0 ("—" when
//               both are 0). Ignored when `value` is given.
//   invert    - true for costs (expenses, overdue, AR): up renders red, down green.
//   tone      - 'auto' (default) | 'neutral' (gray both directions, arrow kept)
//   kind      - 'pct' (default) | 'abs': `value` is an absolute change shown
//               with a sign through `format` ("+$1,200", "+12")
//   format    - (n) => string for kind 'abs' (default en-US number)
//   label     - optional muted trailing text, e.g. "vs previous 30 days"
//   size      - 'sm' (text-xs, default) | 'md' (text-sm)
//   className - wrapper classes
//
// Percent display: one decimal under 10% ("4.5%"), whole numbers from 10%
// ("12%"), capped at ">999%". A change that rounds to 0 is flat: gray "0%".
// Screen readers get words ("Up 12.4 percent vs previous 30 days"); arrow and
// color are decorative, so direction never depends on color alone.

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { pctChange } from '../../lib/trends'

const TONES = {
  good: 'bg-green-50 text-green-700 ring-green-600/15',
  bad: 'bg-red-50 text-red-700 ring-red-600/15',
  neutral: 'bg-brand-gray-100 text-brand-gray-600 ring-brand-gray-200/70',
  new: 'bg-accent-50 text-accent-700 ring-accent-600/15',
}

const SIZES = {
  sm: { pill: 'h-5 px-1.5 gap-0.5 text-xs', icon: 'w-3 h-3', label: 'text-xs' },
  md: { pill: 'h-6 px-2 gap-1 text-sm', icon: 'w-3.5 h-3.5', label: 'text-sm' },
}

const defaultAbsFormat = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })

function formatPct(abs) {
  if (abs >= 999.5) return '>999%'
  if (abs >= 10) return `${Math.round(abs)}%`
  return `${Math.round(abs * 10) / 10}%`
}

function spokenPct(abs) {
  if (abs >= 999.5) return 'more than 999 percent'
  return `${abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10} percent`
}

export default function DeltaBadge({
  value, current, previous, invert = false, tone = 'auto', kind = 'pct', format = defaultAbsFormat,
  label, size = 'sm', className = '',
}) {
  const s = SIZES[size] || SIZES.sm
  let v = value
  let state // 'unknown' | 'new' | 'flat' | 'up' | 'down'

  if (v === undefined && (current !== undefined || previous !== undefined)) {
    const c = Number(current)
    const p = Number(previous)
    if (kind !== 'abs' && current != null && previous != null && Number.isFinite(c) && p === 0 && c > 0) state = 'new'
    else v = kind === 'abs' ? (Number.isFinite(c) && Number.isFinite(p) && current != null && previous != null ? c - p : null) : pctChange(current, previous)
  }

  const num = Number(v)
  if (!state) {
    if (v == null || !Number.isFinite(num)) state = 'unknown'
    else if (kind === 'abs' ? Math.round(Math.abs(num) * 100) === 0 : Math.round(Math.abs(num) * 10) === 0) state = 'flat'
    else state = num > 0 ? 'up' : 'down'
  }

  const abs = Math.abs(num)
  let text
  let spoken
  if (state === 'unknown') { text = '—'; spoken = 'Change not available' }
  else if (state === 'new') { text = 'New'; spoken = 'Up from zero' }
  else if (state === 'flat') { text = kind === 'abs' ? format(0) : '0%'; spoken = 'No change' }
  else if (kind === 'abs') {
    text = `${state === 'up' ? '+' : '−'}${format(abs)}`
    spoken = `${state === 'up' ? 'Up' : 'Down'} ${format(abs)}`
  } else {
    text = formatPct(abs)
    spoken = `${state === 'up' ? 'Up' : 'Down'} ${spokenPct(abs)}`
  }

  let toneKey = 'neutral'
  if (state === 'new') toneKey = 'new'
  else if ((state === 'up' || state === 'down') && tone !== 'neutral') {
    toneKey = (state === 'up') !== invert ? 'good' : 'bad'
  }

  const Icon = state === 'up' ? ArrowUpRight : state === 'down' ? ArrowDownRight : state === 'flat' ? Minus : null

  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>
      <span aria-hidden="true"
        className={`inline-flex shrink-0 items-center rounded-full font-medium leading-none tabular-nums whitespace-nowrap ring-1 ring-inset ${s.pill} ${TONES[toneKey]}`}>
        {Icon && <Icon className={`${s.icon} shrink-0`} strokeWidth={2.25} />}
        {text}
      </span>
      {label && <span aria-hidden="true" className={`truncate text-brand-gray-500 ${s.label}`}>{label}</span>}
      <span className="sr-only">{label ? `${spoken} ${label}` : spoken}</span>
    </span>
  )
}
