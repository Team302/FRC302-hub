// Animated number. Counts from the previously shown value (0 on first mount)
// to `value` with an ease-out curve. Reduced motion or no window → renders the
// final value immediately. Screen readers get the final formatted value only.
//
// Props:
//   value     - target number. Non-finite values (null, '—', strings) render as-is
//               (through `format` when it's a function and value is a number).
//   format    - (n) => string. Defaults to en-US locale with no decimals.
//   duration  - ms (default 600)
//   className - extra classes (tabular-nums is always applied)

import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from './Motion'

const defaultFormat = (n) => Math.round(n).toLocaleString('en-US')
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)

export default function CountUp({ value, format = defaultFormat, duration = 600, className = '' }) {
  const numeric = typeof value === 'number' && Number.isFinite(value)
  const animate = numeric && typeof window !== 'undefined' && !prefersReducedMotion()
  const [display, setDisplay] = useState(animate ? 0 : value)
  const fromRef = useRef(animate ? 0 : value)
  const rafRef = useRef(0)

  useEffect(() => {
    if (!numeric) { setDisplay(value); return }
    if (!animate || typeof requestAnimationFrame !== 'function') { setDisplay(value); fromRef.current = value; return }
    const from = typeof fromRef.current === 'number' && Number.isFinite(fromRef.current) ? fromRef.current : 0
    if (from === value) { setDisplay(value); return }
    let start = 0
    const tick = (now) => {
      if (!start) start = now
      const t = Math.min(1, (now - start) / duration)
      const current = from + (value - from) * easeOutCubic(t)
      fromRef.current = current
      setDisplay(current)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else { fromRef.current = value; setDisplay(value) }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!numeric) return <span className={`tabular-nums ${className}`}>{value ?? ''}</span>

  return (
    <span className={`tabular-nums ${className}`}>
      <span aria-hidden="true">{format(display)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}
