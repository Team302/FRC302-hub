// Labelled horizontal bars: categories, forecast buckets, $/hr rankings, funnels.
//
// Props:
//   items        - [{ key, label, value, sub?, display?, secondary?, href?, color? }]
//                  value null → no bar and a muted display ("No hours")
//                  sub:       muted line under the label
//                  display:   node shown instead of valueFormat(value)
//                  secondary: muted line under the value
//                  href:      internal route; the whole row becomes a <Link>
//                  color:     fill color (default CHART.primary)
//   valueFormat  - (n) => string when item.display is absent (default en-US number)
//   max          - scale max (default: largest value; funnel: first item's value)
//   showShare    - append "· 34%" (share of the sum of values) to each secondary
//   referenceValue, referenceLabel
//                - dashed marker at that value on every track, captioned below
//   variant      - 'default' (bars grow from the left) | 'funnel' (centered bars
//                  plus a "↓ 42%" step-conversion chip between rows)
//   layout       - 'auto' (label | bar | value from sm up, stacked below sm) |
//                  'stacked' (label + value above a full-width bar; for narrow panels)
//   barClassName - track height (default 'h-2'; funnel 'h-6')
//   limit, moreLabel
//                - show the first `limit` rows and a "Show all {n}" toggle
//   emptyMessage - shown when `items` is empty (default 'Nothing to show')
//   ariaLabel    - list label
//   className    - wrapper classes
//
// Rows are real list text (label, value, secondary), so screen readers get the
// numbers directly; bars are decorative. Fills grow in (scaleX, 500ms ease-out,
// 35ms stagger capped at 10 rows) once on mount; instant under reduced motion.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown } from 'lucide-react'
import { useDrawIn } from './Motion'
import { CHART } from './chartColors'

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const defaultFormat = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

export default function HBarList({
  items = [], valueFormat = defaultFormat, max, showShare = false, referenceValue = null, referenceLabel = '',
  variant = 'default', layout = 'auto', barClassName, limit = null, moreLabel = 'Show all',
  emptyMessage = 'Nothing to show', ariaLabel, className = '',
}) {
  const drawn = useDrawIn()
  const [expanded, setExpanded] = useState(false)
  const funnel = variant === 'funnel'

  if (!items.length) {
    return <p className={`text-sm text-brand-gray-400 text-center py-6 ${className}`}>{emptyMessage}</p>
  }

  const nums = items.map(it => (it.value == null ? null : Number(it.value) || 0))
  const positive = nums.filter(v => v != null && v > 0)
  const scaleMax = max != null ? Number(max) || 0 : funnel ? Math.max(0, nums[0] || 0) : Math.max(0, ...positive)
  const sum = positive.reduce((a, v) => a + v, 0)
  const truncated = limit != null && items.length > limit
  const visible = truncated && !expanded ? items.slice(0, limit) : items
  const stacked = funnel || layout === 'stacked'
  const track = barClassName || (funnel ? 'h-6' : 'h-2')
  const refPct = referenceValue != null && scaleMax > 0
    ? Math.min(100, Math.max(0, (Number(referenceValue) / scaleMax) * 100))
    : null

  const grid = stacked
    ? 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-1.5'
    : 'grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-1.5'
  const barPlace = stacked ? 'col-span-2' : 'col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1'
  const valuePlace = stacked ? 'col-start-2 row-start-1' : 'col-start-2 row-start-1 sm:col-start-3'

  return (
    <div className={className}>
      <ul role="list" aria-label={ariaLabel}>
        {visible.map((it, i) => {
          const v = nums[i]
          const pct = v == null || v <= 0 || scaleMax <= 0 ? 0 : Math.min(100, Math.max(2, (v / scaleMax) * 100))
          const share = showShare && v != null && sum > 0 ? `${Math.round((Math.max(0, v) / sum) * 100)}%` : null
          const display = it.display ?? (v == null ? '—' : valueFormat(v))
          const sub = it.sub ?? it.sublabel
          const hasSecondary = it.secondary != null && it.secondary !== ''
          const prev = i > 0 ? nums[i - 1] : null
          const step = funnel && i > 0 && prev > 0 && v != null ? Math.round((v / prev) * 100) : null

          const row = (
            <div className={grid}>
              <div className="col-start-1 row-start-1 min-w-0">
                <p className="text-sm text-brand-gray-700 truncate">{it.label}</p>
                {sub != null && sub !== '' && <p className="text-xs text-brand-gray-400 truncate">{sub}</p>}
              </div>
              <div className={`${valuePlace} text-right`}>
                <p className={`text-sm font-medium tabular-nums whitespace-nowrap ${v == null ? 'text-brand-gray-400' : 'text-brand-black'}`}>{display}</p>
                {(hasSecondary || share) && (
                  <p className="text-xs text-brand-gray-400 tabular-nums whitespace-nowrap">
                    {it.secondary}{hasSecondary && share ? ' · ' : ''}{share}
                  </p>
                )}
              </div>
              <div className={`${barPlace} relative`} aria-hidden="true">
                <div className={`relative overflow-hidden ${funnel ? 'rounded-md bg-brand-gray-50' : 'rounded-full bg-brand-gray-100'} ${track}`}>
                  {pct > 0 && (
                    <div
                      className={`absolute inset-y-0 ${funnel ? 'rounded-md' : 'rounded-full'}`}
                      style={{
                        left: funnel ? `${(100 - pct) / 2}%` : 0,
                        width: `${pct}%`,
                        background: it.color || CHART.primary,
                        transform: drawn ? 'scaleX(1)' : 'scaleX(0)',
                        transformOrigin: funnel ? 'center' : 'left',
                        transition: `transform 500ms ${EASE} ${Math.min(i, 10) * 35}ms`,
                      }}
                    />
                  )}
                </div>
                {refPct != null && (
                  <div className="absolute -top-1 -bottom-1 border-l border-dashed border-brand-gray-400" style={{ left: `${refPct}%` }} />
                )}
              </div>
            </div>
          )

          return (
            <li key={it.key ?? i}>
              {funnel && i > 0 && (
                <div className="flex h-5 items-center justify-center gap-1 text-[11px] font-medium tabular-nums text-brand-gray-500">
                  <ArrowDown className="w-3 h-3" aria-hidden="true" />
                  {step == null ? '—' : `${step}%`}
                  {step != null && <span className="sr-only"> of the previous step</span>}
                </div>
              )}
              {it.href ? (
                <Link to={it.href} className="group -mx-2 block rounded-md px-2 transition-colors hover:bg-brand-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40">
                  {row}
                </Link>
              ) : row}
            </li>
          )
        })}
      </ul>

      {refPct != null && referenceLabel && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-brand-gray-500">
          <span className="inline-block h-3 border-l border-dashed border-brand-gray-400" aria-hidden="true" />
          {referenceLabel}
        </p>
      )}

      {truncated && (
        <button type="button" onClick={() => setExpanded(e => !e)} aria-expanded={expanded}
          className="mt-2 text-xs font-medium text-brand-gray-500 hover:text-brand-black transition-colors">
          {expanded ? 'Show less' : `${moreLabel} ${items.length}`}
        </button>
      )}
    </div>
  )
}
