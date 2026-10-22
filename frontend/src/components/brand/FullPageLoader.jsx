// Full-screen loading state on the app canvas: the brand mark in a softly
// pulsing halo, a label and an indeterminate shimmer bar. An optional hint
// (e.g. a "Back to sign in" link) fades in if loading takes too long.
// Under prefers-reduced-motion the pulse and shimmer stop (globals.css).
//
// Props:
//   label     - status text (default 'Loading…')
//   hint      - node shown after `hintDelay` ms (omit for none)
//   hintDelay - ms before the hint appears (default 8000)
//   className - extra classes on the full-screen wrapper

import { useEffect, useState } from 'react'
import BrandMark from './BrandMark'

export default function FullPageLoader({ label = 'Loading…', hint, hintDelay = 8000, className = '' }) {
  const hasHint = hint != null && hint !== false
  const [showHint, setShowHint] = useState(false)

  useEffect(() => {
    if (!hasHint) { setShowHint(false); return }
    const id = setTimeout(() => setShowHint(true), Math.max(0, Number(hintDelay) || 0))
    return () => clearTimeout(id)
  }, [hasHint, hintDelay])

  return (
    <div role="status" aria-live="polite" className={`min-h-screen grid place-items-center px-6 ${className}`}>
      <div className="flex flex-col items-center text-center">
        <span className="rounded-2xl ring-8 ring-accent-500/10 animate-pulse">
          <BrandMark size="md" />
        </span>
        <p className="text-sm text-brand-gray-500 mt-4">{label}</p>
        <div aria-hidden="true" className="mt-3 h-1 w-40 rounded-full bg-brand-gray-200 overflow-hidden">
          <div className="h-full w-full bg-[linear-gradient(90deg,transparent,rgb(43_125_76/.7),transparent)] bg-[length:200%_100%] animate-shimmer" />
        </div>
        {hasHint && showHint && <div className="mt-6 text-sm animate-fade-in">{hint}</div>}
      </div>
    </div>
  )
}
