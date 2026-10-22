// Grouped column chart sharing AreaChart's look: dashed gridlines with
// right-aligned axis labels, 11px gray axis text, the white tooltip card, and
// keyboard ←/→ (focus the chart first). Inline SVG, measured at real pixel width.
//
// Props:
//   data           - [{ label, [seriesKey]: number, ... }]  (extra fields are fine)
//   series         - [{ key, label, color }]
//                    (default [{ key: 'value', label: 'Value', color: CHART.primary }])
//   valueFormat    - (n) => string for tooltip and table values (default en-US number)
//   axisFormat     - (n) => string for y-axis labels (default compact: 950, 1.2k, 3.4M)
//   tooltipExtra   - optional (row) => [{ label, value, tone?: 'positive'|'negative' }]
//                    extra tooltip rows under the series (e.g. Net)
//   height         - px (default 240)
//   minColumnWidth - px per column. When the groups can't fit the container at
//                    this width, the chart keeps it and scrolls horizontally (default 10)
//   legend         - series legend under the chart (default: more than one series)
//   emptyMessage   - shown over the baseline when data is empty or all zero
//   ariaLabel      - accessible description (also the sr-only table caption)
//   table          - render an sr-only data table (default true; pass false
//                    when the page renders a ChartDataToggle for the same data)
//   className      - wrapper classes
//
// Motion: columns grow from the baseline (scaleY, 450ms ease-out, 20ms stagger
// per group capped at 24) once on mount; instant under reduced motion. Remount
// with `key` to replay on a period change.

import { useEffect, useMemo, useRef, useState } from 'react'
import { niceCeil, axisTicks } from './AreaChart'
import { useDrawIn, useElementWidth } from './Motion'
import { CHART } from './chartColors'
import { ChartDataTable } from './ChartDataToggle'

const PAD_TOP = 16
const PAD_BOTTOM = 26
const GAP = 2
const GROUP_PAD = 0.3
const MAX_COLUMN = 32
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const DEFAULT_SERIES = [{ key: 'value', label: 'Value', color: CHART.primary }]

const defaultFormat = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

function compactNumber(n) {
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (a >= 1e6) return `${sign}${+(a / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `${sign}${+(a / 1e3).toFixed(1)}k`
  return `${sign}${+a.toFixed(a > 0 && a < 10 && a % 1 ? 1 : 0)}`
}

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Column with rounded outer corners (top for positive values, bottom for negative).
function columnPath(x, w, yv, base) {
  const h = Math.abs(yv - base)
  if (h < 0.5) return ''
  const r = Math.min(3, w / 2, h)
  const inner = yv <= base ? yv + r : yv - r
  return `M${x},${base}V${inner}Q${x},${yv} ${x + r},${yv}H${x + w - r}Q${x + w},${yv} ${x + w},${inner}V${base}Z`
}

export default function ColumnChart({
  data = [], series, valueFormat = defaultFormat, axisFormat = compactNumber, tooltipExtra, height = 240,
  minColumnWidth = 10, legend, emptyMessage = 'No data yet', ariaLabel, table = true, className = '',
}) {
  const [wrapRef, width] = useElementWidth()
  const [hover, setHover] = useState(null)
  const viaKey = useRef(false)
  const drawn = useDrawIn()
  const list = series && series.length ? series : DEFAULT_SERIES
  const n = data.length
  const s = list.length

  const geo = useMemo(() => {
    if (!width || n === 0) return null
    const vals = []
    data.forEach(row => list.forEach(se => vals.push(num(row?.[se.key]))))
    const rawMax = Math.max(0, ...vals)
    const yMax = niceCeil(rawMax)
    const rawMin = Math.min(0, ...vals)
    const yMin = rawMin < 0 ? -niceCeil(-rawMin) : 0
    const minGroup = (minColumnWidth * s + GAP * (s - 1)) / (1 - GROUP_PAD)
    const plotW = Math.max(width, Math.ceil(n * minGroup))
    const groupW = plotW / n
    const colW = Math.max(1, Math.min(MAX_COLUMN, (groupW * (1 - GROUP_PAD) - GAP * (s - 1)) / s))
    const innerW = colW * s + GAP * (s - 1)
    const plotH = height - PAD_TOP - PAD_BOTTOM
    const y = (v) => PAD_TOP + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH
    const baseY = y(0)
    let labelStep = n <= 12 ? 1 : 3
    while (groupW * labelStep < 36 && labelStep < n) labelStep++
    const groups = data.map((row, i) => {
      const x0 = i * groupW + (groupW - innerW) / 2
      return list.map((se, j) => ({
        key: se.key,
        color: se.color || CHART.primary,
        d: columnPath(x0 + j * (colW + GAP), colW, y(num(row?.[se.key])), baseY),
      }))
    })
    return {
      plotW, groupW, baseY, groups, labelStep, yMin,
      grid: axisTicks(rawMax, rawMin, yMax, yMin).map(v => ({ v, y: y(v) })),
      allZero: vals.every(v => v === 0),
    }
  }, [width, n, data, list, s, height, minColumnWidth])

  // Keyboard navigation scrolls the active group into view when the chart scrolls.
  useEffect(() => {
    if (!viaKey.current) return
    viaKey.current = false
    const el = wrapRef.current
    if (hover == null || !el || !geo || geo.plotW <= el.clientWidth) return
    const cx = (hover + 0.5) * geo.groupW
    if (cx < el.scrollLeft + 40 || cx > el.scrollLeft + el.clientWidth - 40) {
      el.scrollLeft = Math.max(0, cx - el.clientWidth / 2)
    }
  }, [hover]) // eslint-disable-line react-hooks/exhaustive-deps

  function onKeyDown(e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    viaKey.current = true
    setHover(h => {
      const cur = h == null ? (e.key === 'ArrowRight' ? -1 : n) : h
      return Math.min(n - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1)))
    })
  }

  const h = hover != null && geo && hover < n ? hover : null
  const row = h != null ? data[h] : null
  const tipLeft = h != null ? Math.min(Math.max((h + 0.5) * geo.groupW, 90), Math.max(90, geo.plotW - 90)) : 0
  const extras = row && typeof tooltipExtra === 'function' ? (tooltipExtra(row) || []) : []
  const label = ariaLabel || `Column chart of ${n} ${n === 1 ? 'group' : 'groups'}`
  const scrolls = !!geo && geo.plotW > width

  return (
    <div className={className}>
      {/* The measured wrapper always renders, so data arriving later draws. */}
      <div ref={wrapRef} className="relative w-full overflow-x-auto overflow-y-hidden">
        {n === 0 ? (
          <div className="relative flex items-center justify-center" style={{ height }}>
            <div className="absolute inset-x-0 border-t border-dashed border-brand-gray-200" style={{ bottom: PAD_BOTTOM }} aria-hidden="true" />
            <p className="text-sm text-brand-gray-400">{emptyMessage}</p>
          </div>
        ) : !geo ? (
          <div style={{ height }} />
        ) : (
          <div className="relative select-none" style={{ width: geo.plotW, height }}>
            <svg
              width={geo.plotW} height={height} role="img" aria-label={label} tabIndex={0}
              className="block rounded outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40"
              style={{ touchAction: scrolls ? 'pan-x pan-y' : 'pan-y' }}
              onKeyDown={onKeyDown}
              onBlur={() => setHover(null)}
              onPointerMove={e => {
                const rect = e.currentTarget.getBoundingClientRect()
                const i = Math.floor(((e.clientX - rect.left) / (rect.width || 1)) * n)
                setHover(Math.min(n - 1, Math.max(0, i)))
              }}
              onPointerLeave={() => setHover(null)}
            >
              {h != null && (
                <rect x={h * geo.groupW + 2} y={PAD_TOP - 8} width={Math.max(0, geo.groupW - 4)}
                  height={height - PAD_TOP - PAD_BOTTOM + 8} rx="4" fill="rgb(var(--brand-gray-100))" />
              )}

              {geo.grid.map((g, i) => (
                <line key={i} x1="0" x2={geo.plotW} y1={g.y} y2={g.y} stroke="rgb(var(--brand-gray-200) / 0.7)" strokeWidth="1"
                  strokeDasharray={i === geo.grid.length - 1 ? undefined : '3 3'} />
              ))}
              {geo.yMin < 0 && <line x1="0" x2={geo.plotW} y1={geo.baseY} y2={geo.baseY} stroke="rgb(var(--brand-gray-300))" strokeWidth="1" />}

              {geo.groups.map((cols, i) => (
                <g key={i} style={{
                  transformOrigin: `0px ${geo.baseY}px`,
                  transform: drawn ? 'scaleY(1)' : 'scaleY(0)',
                  transition: `transform 450ms ${EASE} ${Math.min(i, 24) * 20}ms`,
                }}>
                  {cols.map(col => col.d && <path key={col.key} d={col.d} fill={col.color} />)}
                </g>
              ))}

              {/* Y labels above their gridlines, with a surface-colored halo over columns */}
              {geo.grid.map((g, i) => (
                <text key={i} x={geo.plotW} y={g.y - 5} textAnchor="end" fontSize="11" className="fill-brand-gray-400"
                  stroke={CHART.surface} strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">{axisFormat(g.v)}</text>
              ))}

              {data.map((d, i) => (i % geo.labelStep === 0) && (
                <text key={i} x={(i + 0.5) * geo.groupW} y={height - 6} textAnchor="middle" fontSize="11"
                  className={h === i ? 'fill-brand-gray-600' : 'fill-brand-gray-400'}>{d?.label}</text>
              ))}
            </svg>

            {geo.allZero && (
              <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-brand-gray-400">{emptyMessage}</p>
            )}

            {h != null && (
              <div className="pointer-events-none absolute top-1 z-10 min-w-[150px] -translate-x-1/2 rounded-lg border border-brand-gray-200 bg-white px-3 py-2 shadow-pop animate-fade-in"
                style={{ left: tipLeft }} role="status" aria-live="polite">
                <p className="mb-1 text-[11px] font-medium text-brand-gray-500">{row?.label}</p>
                {list.map(se => (
                  <div key={se.key} className="mt-0.5 flex items-center justify-between gap-4 text-xs first:mt-0">
                    <span className="flex items-center gap-1.5 text-brand-gray-600">
                      <span className="h-2 w-2 rounded-[3px]" style={{ background: se.color || CHART.primary }} />{se.label}
                    </span>
                    <span className="font-semibold tabular-nums text-brand-black">{valueFormat(num(row?.[se.key]))}</span>
                  </div>
                ))}
                {extras.length > 0 && (
                  <div className="mt-1.5 border-t border-brand-gray-100 pt-1.5">
                    {extras.map((x, i) => (
                      <div key={i} className="flex items-center justify-between gap-4 text-xs">
                        <span className="text-brand-gray-500">{x.label}</span>
                        <span className={`font-medium tabular-nums ${x.tone === 'negative' ? 'text-red-600' : x.tone === 'positive' ? 'text-green-600' : 'text-brand-gray-700'}`}>{x.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {(legend ?? s > 1) && (
        <ul role="list" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-gray-500">
          {list.map(se => (
            <li key={se.key} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: se.color || CHART.primary }} aria-hidden="true" />
              {se.label}
            </li>
          ))}
        </ul>
      )}

      {table && n > 0 && (
        <ChartDataTable
          caption={ariaLabel}
          columns={[
            { key: 'label', label: 'Period' },
            ...list.map(se => ({ key: se.key, label: se.label, align: 'right', format: v => valueFormat(num(v)) })),
          ]}
          rows={data}
        />
      )}
    </div>
  )
}
