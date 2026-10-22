// 100% stacked single bar with small gaps between segments, plus an optional
// legend. Aging buckets, recurring-revenue composition, pipeline stage mix,
// automation outcomes, and mini bars inside StatCard's trendSlot.
//
// Props:
//   segments    - [{ key, label, value, color, display?, secondary?, href? }]
//                 display:   text instead of valueFormat(value)
//                 secondary: muted text after the label in the 'list' legend
//                 href:      internal route; the segment becomes a <Link>
//   valueFormat - (n) => string (default en-US number)
//   height      - track height class (default 'h-2.5')
//   gap         - px between segments (default 2)
//   minSegment  - minimum px width of a non-zero segment (default 4); the rest
//                 renormalize automatically
//   legend      - 'none' (default) | 'inline' (swatch, label, share; wraps) |
//                 'list' (rows: swatch, label · secondary, display, share)
//   interactive - segments focusable + hover emphasis (default true). Pass false
//                 for mini bars: the whole bar is then one role="img".
//   ariaLabel   - chart name; values are appended automatically, e.g.
//                 "Receivables by age: Current $8,200 (61%), 1–30 days $3,100 (23%)"
//   className   - wrapper classes (e.g. 'w-20' for a mini bar)
//
// Hover or focus a segment → the others dim to 40% and its legend row tints.
// All-zero → empty gray track (legend rows still list every segment at 0).
// Motion: the fill grows in (scaleX from the left, 550ms) once on mount.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDrawIn } from './Motion'

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const defaultFormat = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

export default function SegmentedBar({
  segments = [], valueFormat = defaultFormat, height = 'h-2.5', gap = 2, minSegment = 4, legend = 'none',
  interactive = true, ariaLabel, className = '',
}) {
  const drawn = useDrawIn()
  const [active, setActive] = useState(null)

  const rows = segments.map(s => {
    const value = Math.max(0, Number(s.value) || 0)
    return { ...s, value, text: s.display ?? valueFormat(value) }
  })
  const total = rows.reduce((a, s) => a + s.value, 0)
  const share = (v) => (total > 0 ? Math.round((v / total) * 100) : 0)
  const description = rows.map(s => `${s.label} ${s.text} (${share(s.value)}%)`).join(', ')
  const fullLabel = ariaLabel ? `${ariaLabel}: ${description}` : description

  const hoverProps = (key) => (interactive
    ? { onMouseEnter: () => setActive(key), onMouseLeave: () => setActive(null) }
    : {})

  return (
    <div className={className}>
      <div
        role={interactive ? 'group' : 'img'}
        aria-label={fullLabel}
        className={`relative w-full overflow-hidden rounded-full bg-brand-gray-100 ${height}`}
      >
        {total > 0 && (
          <div
            className="flex h-full w-full"
            style={{
              gap,
              transform: drawn ? 'scaleX(1)' : 'scaleX(0)',
              transformOrigin: 'left',
              transition: `transform 550ms ${EASE}`,
            }}
          >
            {rows.filter(s => s.value > 0).map(s => {
              const Tag = s.href && interactive ? Link : 'span'
              const label = `${s.label}: ${s.text} (${share(s.value)}%)`
              return (
                <Tag
                  key={s.key}
                  {...(s.href && interactive ? { to: s.href } : {})}
                  {...(interactive
                    ? { tabIndex: 0, 'aria-label': label, role: s.href ? undefined : 'img', onFocus: () => setActive(s.key), onBlur: () => setActive(null), ...hoverProps(s.key) }
                    : { 'aria-hidden': true })}
                  title={label}
                  className="block h-full rounded-[2px] focus-visible:outline-none"
                  style={{
                    flex: `${s.value} 1 0%`,
                    minWidth: minSegment,
                    background: s.color,
                    opacity: active != null && active !== s.key ? 0.4 : 1,
                    transition: 'opacity 150ms ease-out',
                  }}
                />
              )
            })}
          </div>
        )}
      </div>

      {legend === 'inline' && (
        <ul role="list" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-gray-600">
          {rows.map(s => (
            <li key={s.key} className={`inline-flex items-center gap-1.5 rounded px-1 -mx-1 transition-colors ${active === s.key ? 'bg-brand-gray-50' : ''}`} {...hoverProps(s.key)}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
              <span className="tabular-nums text-brand-gray-400">{share(s.value)}%</span>
            </li>
          ))}
        </ul>
      )}

      {legend === 'list' && (
        <ul role="list" className="mt-3 space-y-0.5">
          {rows.map(s => (
            <li
              key={s.key}
              className={`-mx-1.5 grid grid-cols-[auto_minmax(0,1fr)_auto_2.5rem] items-center gap-x-2.5 rounded-md px-1.5 py-1 text-xs transition-colors ${active === s.key ? 'bg-brand-gray-50' : ''}`}
              {...hoverProps(s.key)}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
              <span className="min-w-0 truncate text-brand-gray-600">
                {s.href ? <Link to={s.href} className="hover:text-brand-black">{s.label}</Link> : s.label}
                {s.secondary != null && s.secondary !== '' && <span className="text-brand-gray-400"> · {s.secondary}</span>}
              </span>
              <span className={`text-right tabular-nums ${s.value > 0 ? 'text-brand-gray-900' : 'text-brand-gray-400'}`}>{s.text}</span>
              <span className="text-right tabular-nums text-brand-gray-400">{share(s.value)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
