// Unified KPI tile. Converges Dashboard.StatCard, Money.SummaryCard and
// Reports.MetricCard into one component: a muted label row with a small
// right-aligned icon, a large tabular value, an optional delta + sub line and
// an optional sparkline (or custom trend content).
//
// Props:
//   title    - label text (top-left); a node is fine (e.g. with a "Now" tag)
//   value    - big value (node); pass <CountUp/> for animated numbers
//   sub      - optional small line beneath the value
//   icon     - lucide icon component (rendered w-4 h-4)
//   iconClassName - icon color override (default gray; red when tone='danger')
//   tone     - value color: 'in'|'positive'|'success' (green),
//              'out'|'negative'|'danger' (red), 'pending'|'warning' (amber),
//              default brand-black
//   active   - when true, draws an accent ring (selected-filter state)
//   onClick  - when given, the card becomes clickable (hover lift, keyboard)
//   ariaLabel - accessible name for a clickable card ("Today: 5 jobs. Open schedule")
//   alert    - when true, the sub line is styled as a danger note
//   delta    - optional change indicator under the value, with `sub` after it on
//              the same line:
//                number                      → <DeltaBadge value={n} /> (percent)
//                { value, label?, invert?, tone?, kind?, format?, current?, previous? }
//                                            → <DeltaBadge {...delta} />
//                React element               → rendered as-is
//              null/undefined → no delta (the sub line renders exactly as before)
//   trend    - optional number[] or [{ label, value }] → Sparkline beside the value
//   trendColor - optional sparkline stroke color (default accent)
//   trendLabel - accessible label + tooltip for the sparkline (default decorative)
//   trendSlot  - node rendered in the sparkline's place (e.g. a mini SegmentedBar
//                `className="w-20"`); wins over `trend`
//   className, style - merged onto the card, so <Stagger> can animate StatCards

import { isValidElement } from 'react'
import Sparkline from './Sparkline'
import DeltaBadge from './DeltaBadge'

const TONE_VALUE = {
  in: 'text-green-600',
  positive: 'text-green-600',
  success: 'text-green-600',
  out: 'text-red-600',
  negative: 'text-red-600',
  danger: 'text-status-danger',
  pending: 'text-amber-600',
  warning: 'text-amber-600',
}

function renderDelta(delta) {
  if (delta == null || delta === false) return null
  if (isValidElement(delta)) return delta
  if (typeof delta === 'number') return <DeltaBadge value={delta} />
  if (typeof delta === 'object') return <DeltaBadge {...delta} />
  return null
}

export default function StatCard({
  title, value, sub, icon: Icon, iconClassName, tone, active, onClick, ariaLabel, alert,
  delta, trend, trendColor, trendLabel, trendSlot, className = '', style,
}) {
  const valueColor = TONE_VALUE[tone] || 'text-brand-black'
  const clickable = typeof onClick === 'function'
  const iconColor = iconClassName || (tone === 'danger' ? 'text-status-danger' : 'text-brand-gray-400')
  const hasTrend = Array.isArray(trend) && trend.length > 1
  const hasSlot = trendSlot != null && trendSlot !== false
  const deltaNode = renderDelta(delta)
  const subClass = alert ? 'text-status-danger font-medium' : 'text-brand-gray-500'

  return (
    <div
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? ariaLabel : undefined}
      aria-pressed={clickable && active != null ? !!active : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e) } } : undefined}
      style={style}
      className={[
        'card p-5',
        clickable ? 'card-interactive' : '',
        active ? 'ring-2 ring-accent-500/50 border-accent-300' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[13px] font-medium leading-snug text-brand-gray-500 min-w-0">{title}</span>
        {Icon && <Icon className={`w-4 h-4 shrink-0 ${iconColor}`} />}
      </div>
      {/* flex-wrap: on narrow tiles the sparkline drops below the value instead of
          squeezing a money figure down to "$…". */}
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <div className={`text-[1.625rem] leading-8 font-semibold tracking-[-0.02em] tabular-nums min-w-0 truncate ${valueColor}`}>{value}</div>
        {hasSlot
          ? <div className="shrink-0 mb-1">{trendSlot}</div>
          : hasTrend && (
            <div className="shrink-0 mb-1" title={trendLabel}>
              <Sparkline data={trend} color={trendColor} ariaLabel={trendLabel} className="w-20 h-8" />
            </div>
          )}
      </div>
      {deltaNode ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          {deltaNode}
          {sub && <p className={`text-xs ${subClass}`}>{sub}</p>}
        </div>
      ) : sub && (
        <p className={`text-xs mt-1.5 ${subClass}`}>{sub}</p>
      )}
    </div>
  )
}
