// Stripe-style smooth area chart. Inline SVG, no dependencies.
// Responsive: measures its container (ResizeObserver) and draws at real pixel
// width so labels never stretch.
//
// Props:
//   data          - [{ label, value }]  primary series (accent line + gradient fill)
//   compare       - optional [{ label, value }] previous-period series (dashed,
//                   muted), aligned by index with `data`
//   valueFormat   - (n) => string for tooltip values (default locale number)
//   axisFormat    - (n) => string for y-axis gridline labels (default valueFormat)
//   seriesLabel   - tooltip name for `data` (default 'Current')
//   compareLabel  - tooltip name for `compare` (default 'Previous period')
//   height        - px (default 220)
//   color         - primary stroke color (default accent-600 #5b5bd6)
//   emptyMessage  - shown when `data` is empty (default 'No data yet')
//   ariaLabel     - accessible description of the chart (also the table caption)
//   table         - render an sr-only data table of the points, like ColumnChart
//                   and Donut. Default false here, so pages that already render
//                   a ChartDataTable/ChartDataToggle for the same data don't
//                   announce the numbers twice.
//   className     - wrapper classes
//
// Interaction: pointer hover (or focus + ←/→ keys) shows a crosshair, dots and a
// tooltip. All-zero data renders a flat baseline over the gridlines.

import { useId, useMemo, useState } from 'react'
import { monotonePath, toValues } from './Sparkline'
import { useElementWidth } from './Motion'
import { ChartDataTable } from './ChartDataToggle'

const defaultFormat = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

// Round a max value up to a "nice" axis ceiling (1, 2, 2.5, 5, 10 × 10^n).
// Exported for ColumnChart so both charts share one axis scale.
export function niceCeil(v) {
  if (!(v > 0)) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const f = v / exp
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return nf * exp
}

// Gridline values, top to bottom. An all-zero series has no scale to show: only
// the zero baseline, not the 1 / 0.5 / 0 that niceCeil(0) would invent (which a
// money formatter prints as $1 / $1 / $0).
export function axisTicks(rawMax, rawMin, yMax, yMin) {
  if (rawMax === 0 && rawMin === 0) return [0]
  return [yMax, yMin + (yMax - yMin) / 2, yMin]
}

const PAD_TOP = 16
const PAD_BOTTOM = 26
const MUTED = 'rgb(var(--brand-gray-400))'
const SURFACE = 'rgb(var(--white))' // hover-dot fill; tracks the card surface in dark mode

export default function AreaChart({
  data = [], compare, valueFormat = defaultFormat, axisFormat, seriesLabel = 'Current',
  compareLabel = 'Previous period', height = 220, color = 'rgb(var(--accent-600))', emptyMessage = 'No data yet',
  ariaLabel, table = false, className = '',
}) {
  const [wrapRef, width] = useElementWidth()
  const [hover, setHover] = useState(null)
  const gradId = `area-${useId().replace(/:/g, '')}`
  const fmtAxis = axisFormat || valueFormat

  const values = useMemo(() => toValues(data), [data])
  const prev = useMemo(() => (compare && compare.length ? toValues(compare) : null), [compare])
  const n = values.length

  const geo = useMemo(() => {
    if (!width || n === 0) return null
    const all = prev ? values.concat(prev) : values
    const rawMax = Math.max(0, ...all)
    const rawMin = Math.min(0, ...all)
    const yMax = niceCeil(rawMax)
    const yMin = rawMin < 0 ? -niceCeil(-rawMin) : 0
    const plotH = height - PAD_TOP - PAD_BOTTOM
    const x = (i, len = n) => (len <= 1 ? width / 2 : (i / (len - 1)) * width)
    const y = (v) => PAD_TOP + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH
    const pts = values.map((v, i) => [x(i), y(v)])
    const line = monotonePath(pts)
    const baseY = y(Math.max(yMin, 0))
    const area = n > 1 ? `${line}L${pts[n - 1][0]},${baseY}L${pts[0][0]},${baseY}Z` : ''
    const prevPts = prev ? prev.map((v, i) => [x(i, prev.length), y(v)]) : null
    const grid = axisTicks(rawMax, rawMin, yMax, yMin).map(v => ({ v, y: y(v) }))
    return { x, y, pts, line, area, prevPts, prevLine: prevPts ? monotonePath(prevPts) : '', grid, baseY }
  }, [width, n, values, prev, height])

  function indexFromClientX(clientX, rect) {
    if (n <= 1) return 0
    const rel = Math.min(Math.max(clientX - rect.left, 0), rect.width)
    return Math.round((rel / rect.width) * (n - 1))
  }

  function onKeyDown(e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    setHover(h => {
      const cur = h == null ? (e.key === 'ArrowRight' ? -1 : n) : h
      return Math.min(n - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1)))
    })
  }

  const label = ariaLabel || `Chart of ${n} points`

  // Wrapper always renders (and stays measured) so data arriving later draws.
  if (n === 0) {
    return (
      <div ref={wrapRef} className={`relative flex items-center justify-center ${className}`} style={{ height }}>
        <div className="absolute inset-x-0 bottom-[26px] border-t border-dashed border-brand-gray-200" aria-hidden="true" />
        <p className="text-sm text-brand-gray-400">{emptyMessage}</p>
      </div>
    )
  }

  const h = hover != null && geo && hover < n ? hover : null
  const hx = h != null ? geo.pts[h][0] : 0
  const tooltipLeft = Math.min(Math.max(hx, 80), Math.max(80, width - 80))
  const lastLabel = data[n - 1]?.label

  return (
    <div ref={wrapRef} className={`relative select-none ${className}`} style={{ height }}>
      {geo && (
        <svg width={width} height={height} className="block overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 rounded"
          role="img" aria-label={label} tabIndex={0} onKeyDown={onKeyDown} onBlur={() => setHover(null)}
          style={{ touchAction: 'pan-y' }}
          onPointerMove={e => setHover(indexFromClientX(e.clientX, e.currentTarget.getBoundingClientRect()))}
          onPointerLeave={() => setHover(null)}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.20" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Gridlines + y labels (right-aligned, above each line) */}
          {geo.grid.map((g, i) => (
            <g key={i}>
              <line x1="0" x2={width} y1={g.y} y2={g.y} stroke="rgb(var(--brand-gray-200) / 0.7)" strokeWidth="1"
                strokeDasharray={i === geo.grid.length - 1 ? undefined : '3 3'} />
              <text x={width} y={g.y - 5} textAnchor="end" className="fill-brand-gray-400" fontSize="11">{fmtAxis(g.v)}</text>
            </g>
          ))}

          {/* Previous period */}
          {geo.prevLine && (
            <path d={geo.prevLine} fill="none" stroke={MUTED} strokeWidth="1.5" strokeDasharray="4 4" className="animate-fade-in" />
          )}

          {/* Primary series */}
          {geo.area && <path d={geo.area} fill={`url(#${gradId})`} className="animate-fade-in" />}
          <path d={geo.line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            pathLength="1" strokeDasharray="1" className="animate-draw" />
          {n === 1 && <circle cx={geo.pts[0][0]} cy={geo.pts[0][1]} r="3" fill={color} />}

          {/* X labels: first / last */}
          <text x="0" y={height - 6} fontSize="11" className="fill-brand-gray-400">{data[0]?.label}</text>
          {n > 1 && <text x={width} y={height - 6} textAnchor="end" fontSize="11" className="fill-brand-gray-400">{lastLabel}</text>}

          {/* Hover crosshair */}
          {h != null && (
            <g pointerEvents="none">
              <line x1={hx} x2={hx} y1={PAD_TOP - 8} y2={height - PAD_BOTTOM} stroke="rgb(var(--brand-gray-300))" strokeWidth="1" />
              {geo.prevPts?.[h] && <circle cx={geo.prevPts[h][0]} cy={geo.prevPts[h][1]} r="3.5" fill={SURFACE} stroke={MUTED} strokeWidth="1.5" />}
              <circle cx={hx} cy={geo.pts[h][1]} r="4" fill={SURFACE} stroke={color} strokeWidth="2" />
            </g>
          )}
        </svg>
      )}

      {h != null && (
        <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-2 min-w-[140px] rounded-lg border border-brand-gray-200 bg-white px-3 py-2 shadow-pop animate-fade-in"
          style={{ left: tooltipLeft }} role="status" aria-live="polite">
          <p className="text-[11px] font-medium text-brand-gray-500 mb-1">{data[h]?.label}</p>
          <div className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-brand-gray-600"><span className="w-2 h-2 rounded-full" style={{ background: color }} />{seriesLabel}</span>
            <span className="font-semibold tabular-nums text-brand-black">{valueFormat(values[h])}</span>
          </div>
          {prev && prev[h] != null && (
            <div className="flex items-center justify-between gap-4 text-xs mt-0.5">
              <span className="flex items-center gap-1.5 text-brand-gray-500"><span className="w-2 h-2 rounded-full bg-brand-gray-400" />{compareLabel}</span>
              <span className="tabular-nums text-brand-gray-600">{valueFormat(prev[h])}</span>
            </div>
          )}
        </div>
      )}

      {table && (
        <ChartDataTable
          caption={ariaLabel}
          columns={[
            { key: 'label', label: 'Period' },
            { key: 'value', label: seriesLabel, align: 'right', format: v => valueFormat(v) },
            ...(prev ? [{ key: 'previous', label: compareLabel, align: 'right', format: v => (v == null ? '—' : valueFormat(v)) }] : []),
          ]}
          rows={data.map((d, i) => ({ key: i, label: d?.label, value: values[i], previous: prev ? prev[i] : undefined }))}
        />
      )}
    </div>
  )
}
