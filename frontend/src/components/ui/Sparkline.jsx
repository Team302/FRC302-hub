// Tiny trend line with a soft gradient fill. Inline SVG, no dependencies.
// Scales to its container (viewBox + preserveAspectRatio="none", non-scaling
// stroke), so size it with className (default w-24 h-8).
//
// Props:
//   data      - number[] or [{ label, value }]
//   color     - stroke color (default accent-600 #5b5bd6)
//   fill      - draw the soft area fill (default true)
//   className - sizing classes
//   ariaLabel - optional accessible label (otherwise decorative / aria-hidden)
//
// Also exports `monotonePath(points)` (Fritsch–Carlson monotone cubic) used by
// AreaChart.

import { useId } from 'react'

export function monotonePath(pts) {
  const n = pts.length
  if (n === 0) return ''
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`
  const dx = [], m = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0]
    m[i] = dx[i] === 0 ? 0 : (pts[i + 1][1] - pts[i][1]) / dx[i]
  }
  const t = new Array(n)
  t[0] = m[0]
  t[n - 1] = m[n - 2]
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t[i] = 0
    else t[i] = (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i])
  }
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += `C${pts[i][0] + h},${pts[i][1] + t[i] * h},${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h},${pts[i + 1][0]},${pts[i + 1][1]}`
  }
  return d
}

export function toValues(data) {
  return (data || []).map(d => {
    const v = typeof d === 'number' ? d : Number(d?.value)
    return Number.isFinite(v) ? v : 0
  })
}

const W = 100
const H = 32

export default function Sparkline({ data, color = 'rgb(var(--accent-600))', fill = true, className = 'w-24 h-8', ariaLabel }) {
  const gradId = `spark-${useId().replace(/:/g, '')}`
  const values = toValues(data)
  if (values.length < 2) return <div className={className} aria-hidden="true" />

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pad = 2
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * W,
    max === min ? H / 2 : pad + (1 - (v - min) / range) * (H - pad * 2),
  ])
  const line = monotonePath(pts)
  const area = `${line}L${W},${H}L0,${H}Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`block overflow-visible ${className}`}
      role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel} aria-hidden={ariaLabel ? undefined : 'true'}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gradId})`} className="animate-fade-in" />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
