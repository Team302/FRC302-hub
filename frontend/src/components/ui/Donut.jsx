// Donut chart: an SVG ring of segments with a center value.
//
// Props:
//   segments       - [{ key, label, value, color }]
//   size           - px (default 176)
//   thickness      - ring width px (default 18)
//   centerValue    - node in the middle (e.g. <CountUp value={mrr} format={formatMoney} />)
//   centerLabel    - small text under the center value (e.g. "MRR")
//   valueFormat    - (n) => string for segment labels and the hover center swap
//   onActiveChange - optional (key | null) => void, to sync external legend/cards
//   ariaLabel      - chart name; total and values are appended automatically
//   table          - render an sr-only data table (default true; pass false
//                    when the page renders a ChartDataToggle for the same data)
//   className      - wrapper classes
//
// Hover or focus a segment (Tab, then ←/→ between segments) → the other arcs dim
// to 40% and the center shows that segment's label, value and share.
// All-zero → a gray ring with the center value (never a NaN arc).
// Motion: arcs draw in sequence (stroke-dashoffset), 700ms total, once on mount.

import { useRef, useState } from 'react'
import { useDrawIn } from './Motion'
import { CHART } from './chartColors'
import { ChartDataTable } from './ChartDataToggle'

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const defaultFormat = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

export default function Donut({
  segments = [], size = 176, thickness = 18, centerValue, centerLabel, valueFormat = defaultFormat,
  onActiveChange, ariaLabel, table = true, className = '',
}) {
  const drawn = useDrawIn()
  const [active, setActive] = useState(null)
  const refs = useRef([])

  const c = size / 2
  const r = Math.max(1, (size - thickness) / 2)
  const C = 2 * Math.PI * r
  const rows = segments.map(s => ({ ...s, value: Math.max(0, Number(s.value) || 0) }))
  const total = rows.reduce((a, s) => a + s.value, 0)
  const share = (v) => (total > 0 ? Math.round((v / total) * 100) : 0)
  const nonZero = rows.filter(s => s.value > 0)
  const gapPx = nonZero.length > 1 ? 2 : 0

  const description = `total ${valueFormat(total)}. ${rows.map(s => `${s.label} ${valueFormat(s.value)} (${share(s.value)}%)`).join(', ')}`
  const fullLabel = ariaLabel ? `${ariaLabel}: ${description}` : description

  function activate(key) {
    setActive(key)
    onActiveChange?.(key)
  }

  function onKeyDown(e, i) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const n = nonZero.length
    refs.current[(i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n]?.focus()
  }

  let cumulative = 0
  const arcs = nonZero.map((s, i) => {
    const frac = s.value / total
    const start = cumulative
    cumulative += frac
    const len = Math.max(0.5, frac * C - gapPx)
    const rotate = -90 + start * 360 + (gapPx / 2 / C) * 360
    return { ...s, i, frac, start, len, rotate }
  })

  const activeSeg = active != null ? rows.find(s => s.key === active) : null

  return (
    <div role="group" aria-label={fullLabel} className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block overflow-visible">
        {total <= 0 && (
          <circle cx={c} cy={c} r={r} fill="none" stroke={CHART.grid} strokeWidth={thickness} />
        )}
        {arcs.map(a => (
          <circle
            key={a.key}
            ref={el => { refs.current[a.i] = el }}
            cx={c} cy={c} r={r}
            fill="none"
            stroke={a.color}
            strokeWidth={thickness}
            strokeDasharray={`${a.len} ${C}`}
            strokeDashoffset={drawn ? 0 : a.len}
            transform={`rotate(${a.rotate} ${c} ${c})`}
            tabIndex={0}
            role="img"
            aria-label={`${a.label} ${valueFormat(a.value)}, ${share(a.value)}%`}
            onMouseEnter={() => activate(a.key)}
            onMouseLeave={() => activate(null)}
            onFocus={() => activate(a.key)}
            onBlur={() => activate(null)}
            onKeyDown={e => onKeyDown(e, a.i)}
            className="cursor-default outline-none"
            style={{
              opacity: active != null && active !== a.key ? 0.4 : 1,
              transition: `stroke-dashoffset ${Math.max(120, a.frac * 700)}ms ${EASE} ${a.start * 700}ms, opacity 150ms ease-out`,
            }}
          />
        ))}
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center" aria-hidden="true">
        {activeSeg ? (
          <>
            <p className="max-w-full truncate text-xs text-brand-gray-500">{activeSeg.label}</p>
            <p className="text-lg font-semibold leading-6 tabular-nums tracking-[-0.01em] text-brand-black">{valueFormat(activeSeg.value)}</p>
            <p className="text-[11px] tabular-nums text-brand-gray-400">{share(activeSeg.value)}%</p>
          </>
        ) : (
          <>
            {centerValue != null && (
              <div className="text-xl font-semibold leading-7 tabular-nums tracking-[-0.02em] text-brand-black">{centerValue}</div>
            )}
            {centerLabel && <p className="mt-0.5 text-xs text-brand-gray-500">{centerLabel}</p>}
          </>
        )}
      </div>

      {table && (
        <ChartDataTable
          caption={ariaLabel}
          columns={[
            { key: 'label', label: 'Segment' },
            { key: 'value', label: 'Value', align: 'right', format: v => valueFormat(v) },
            { key: 'share', label: 'Share', align: 'right', format: v => `${v}%` },
          ]}
          rows={rows.map(s => ({ key: s.key, label: s.label, value: s.value, share: share(s.value) }))}
        />
      )}
    </div>
  )
}
