// Motion helpers. Everything here respects `prefers-reduced-motion: reduce`
// (the global CSS in globals.css also neutralizes animation durations).
//
// Exports:
//   usePrefersReducedMotion()   - boolean hook, live-updates with the OS setting.
//   useEnterAnimation(ref, dep) - replays a fade-up on `ref` whenever `dep`
//                                 changes, via the Web Animations API (no
//                                 remount, no residual transform left behind —
//                                 so fixed-position modals inside stay anchored).
//   staggerStyle(index, step)   - inline style `{ animationDelay }` to pair with
//                                 `className="animate-fade-up"` on grid items.
//   Stagger                     - adds `animate-fade-up` + incremental delay to
//                                 each direct child element (no wrapper nodes, so
//                                 CSS grids keep their structure).
//                                 Props: { children, step = 40, initialDelay = 0,
//                                 max = 12, animation = 'animate-fade-up' }
//   FadeUp                      - single wrapper div that fades up on mount.
//                                 Props: { as = 'div', delay = 0, className, ...rest }
//   useDrawIn()                 - entrance flag for CSS "grow in" transitions:
//                                 false on first paint, true two frames later
//                                 (true immediately under reduced motion).
//   useElementWidth()           - [ref, width], kept current via ResizeObserver.

import { Children, cloneElement, isValidElement, useEffect, useLayoutEffect, useRef, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)'

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(QUERY)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

export function useEnterAnimation(ref, dep, { duration = 220, distance = 8, skipInitial = false } = {}) {
  const mounted = useRef(false)
  useLayoutEffect(() => {
    const first = !mounted.current
    mounted.current = true
    if (first && skipInitial) return
    const el = ref.current
    if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) return
    const anim = el.animate(
      [{ opacity: 0, transform: `translateY(${distance}px)` }, { opacity: 1, transform: 'none' }],
      { duration, easing: EASE_OUT, fill: 'none' },
    )
    return () => anim.cancel()
  }, [dep]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function staggerStyle(index = 0, step = 40, initialDelay = 0, max = 12) {
  return { animationDelay: `${initialDelay + Math.min(index, max) * step}ms` }
}

export function Stagger({ children, step = 40, initialDelay = 0, max = 12, animation = 'animate-fade-up' }) {
  let i = 0
  return Children.map(children, child => {
    if (!isValidElement(child)) return child
    const idx = i++
    const className = [child.props.className, animation].filter(Boolean).join(' ')
    const style = { ...staggerStyle(idx, step, initialDelay, max), ...(child.props.style || {}) }
    return cloneElement(child, { className, style })
  })
}

export function FadeUp({ as: Tag = 'div', delay = 0, className = '', style, ...rest }) {
  return <Tag className={`animate-fade-up ${className}`} style={{ animationDelay: `${delay}ms`, ...style }} {...rest} />
}

// Entrance flag for CSS-transition "grow in" / "draw in" effects (bars, arcs):
// false on the first paint, true two frames later so the transition has a start
// state to animate from. Under reduced motion it is true from the very first
// render (no empty frame). Remount the component (`key`) to replay.
export function useDrawIn() {
  const [drawn, setDrawn] = useState(prefersReducedMotion)
  useEffect(() => {
    if (drawn) return
    if (typeof requestAnimationFrame !== 'function') { setDrawn(true); return }
    let inner = 0
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setDrawn(true)) })
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return drawn
}

// Small hook used by charts to measure a container's width responsively.
export function useElementWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width
      if (w != null) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

export default Stagger
