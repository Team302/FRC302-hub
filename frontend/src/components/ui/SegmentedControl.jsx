// Segmented control: a radio group with a sliding white thumb (iOS / Stripe
// style). Replaces the local `Segmented` copies in Reports and Money.
//
// Props:
//   options    - [{ value, label, disabled?, title? }]   value: string | number
//                title: tooltip, e.g. why an option is disabled
//   value      - the selected value (no thumb when it matches no option)
//   onChange   - (value) => void. Not called for the already-active option.
//   aria-label - group label (required). `label` is accepted as an alias.
//   size       - 'sm' (h-7, text-xs; default) | 'md' (h-8, text-[13px])
//   disabled   - disables the whole control
//   className  - extra classes on the track (e.g. 'w-full overflow-x-auto')
//
// Keyboard (native radio pattern): Tab lands on the selected option; ←/→ and
// ↑/↓ move AND select, wrapping and skipping disabled options; Home/End jump
// to the ends. The thumb slides via transform + width (200ms ease-out). It is
// placed without animation on first measure, and never animates under reduced
// motion.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from './Motion'

const SIZES = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3 text-[13px]',
}

const NAV_KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']

export default function SegmentedControl({
  options = [], value, onChange, 'aria-label': ariaLabel, label, size = 'sm', disabled = false, className = '',
}) {
  const trackRef = useRef(null)
  const btnRefs = useRef([])
  const [thumb, setThumb] = useState(null)
  const [ready, setReady] = useState(false)
  const reduced = usePrefersReducedMotion()

  const activeIndex = options.findIndex(o => o.value === value)
  const optionsKey = options.map(o => `${String(o.value)}:${typeof o.label === 'string' ? o.label : ''}`).join('|')

  useLayoutEffect(() => {
    const measure = () => {
      const btn = btnRefs.current[activeIndex]
      if (!btn) { setThumb(null); return }
      const next = { left: btn.offsetLeft, width: btn.offsetWidth }
      setThumb(prev => (prev && prev.left === next.left && prev.width === next.width ? prev : next))
    }
    measure()
    if (typeof ResizeObserver === 'undefined' || !trackRef.current) return
    const ro = new ResizeObserver(measure)
    ro.observe(trackRef.current)
    btnRefs.current.forEach(b => b && ro.observe(b))
    return () => ro.disconnect()
  }, [activeIndex, optionsKey, size])

  // Enable the slide transition only after the thumb has been placed once.
  useEffect(() => {
    if (!thumb || ready || typeof requestAnimationFrame !== 'function') return
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [thumb, ready])

  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter(i => i >= 0)
  const tabStop = activeIndex >= 0 && !options[activeIndex].disabled ? activeIndex : enabled[0]

  function select(i) {
    const o = options[i]
    if (!o || o.disabled || disabled || o.value === value) return
    onChange?.(o.value)
  }

  function onKeyDown(e, i) {
    if (!NAV_KEYS.includes(e.key) || disabled || enabled.length === 0) return
    e.preventDefault()
    let next
    if (e.key === 'Home') next = enabled[0]
    else if (e.key === 'End') next = enabled[enabled.length - 1]
    else {
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
      const n = options.length
      for (let step = 1; step <= n; step++) {
        const j = (((i + dir * step) % n) + n) % n
        if (!options[j].disabled) { next = j; break }
      }
    }
    if (next == null) return
    btnRefs.current[next]?.focus()
    select(next)
  }

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={ariaLabel ?? label}
      aria-disabled={disabled || undefined}
      className={`relative inline-flex items-center rounded-control bg-brand-gray-100 p-0.5 ring-1 ring-inset ring-brand-gray-200/60 ${disabled ? 'opacity-60' : ''} ${className}`}
    >
      {thumb && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0.5 left-0 rounded-[6px] bg-white shadow-sm ring-1 ring-brand-gray-200/70 ${ready && !reduced ? 'transition-[transform,width] duration-200 ease-out' : ''}`}
          style={{ width: thumb.width, transform: `translateX(${thumb.left}px)` }}
        />
      )}
      {options.map((o, i) => {
        const active = i === activeIndex
        const off = disabled || !!o.disabled
        return (
          <button
            key={String(o.value)}
            ref={el => { btnRefs.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-disabled={off || undefined}
            tabIndex={!disabled && i === tabStop ? 0 : -1}
            title={o.title}
            onClick={() => select(i)}
            onKeyDown={e => onKeyDown(e, i)}
            className={`relative z-10 inline-flex items-center justify-center rounded-[6px] font-medium whitespace-nowrap select-none transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus ${SIZES[size] || SIZES.sm} ${
              active ? 'text-brand-black' : off ? 'text-brand-gray-500' : 'text-brand-gray-500 hover:text-brand-gray-800'} ${
              off ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
