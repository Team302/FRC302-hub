// Team 302 brand.
//
// BrandMark: the compact mark for small spots (sidebar tile, favicon-sized places): a dragon-green
// tile with "302" set the way the logo sets it, heavy and italic.
//   size      - 'sm' (28px) | 'md' (40px, default) | 'lg' (56px)
//   label     - accessible name (role="img"). Omit when a visible wordmark sits next to the mark.
//
// TeamLogo: the full Lake Orion Robotics logo (dragon + 302) where there is room for it. It reads
// public/brand/logo.svg, then logo.png. If neither is in the build it renders `fallback`.
//   height    - pixel height (width follows the image)
//   fallback  - node to show without a logo file (default: nothing)
import { useState } from 'react'

const SIZES = {
  sm: { tile: 'w-7 h-7 rounded-lg', text: 'text-[11px]' },
  md: { tile: 'w-10 h-10 rounded-[10px]', text: 'text-[15px]' },
  lg: { tile: 'w-14 h-14 rounded-[14px]', text: 'text-xl' },
}
const TILE_SHADOW = '0 1px 2px rgb(16 24 40 / 0.12), inset 0 1px 0 rgb(255 255 255 / 0.18)'

export default function BrandMark({ size = 'md', label, className = '' }) {
  const s = SIZES[size] || SIZES.md
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }
  return (
    <span {...a11y} style={{ boxShadow: TILE_SHADOW }}
      className={`inline-grid shrink-0 place-items-center bg-gradient-to-br from-accent-500 to-accent-700 text-white font-black italic tracking-[-0.06em] select-none ${s.tile} ${s.text} ${className}`}>
      302
    </span>
  )
}

const LOGO_SOURCES = ['/brand/logo.svg', '/brand/logo.png']
// Shared across mounts, so a missing file is only requested once per page load.
let logoIndex = 0

export function TeamLogo({ height = 48, fallback = null, className = '' }) {
  const [index, setIndex] = useState(logoIndex)
  if (index >= LOGO_SOURCES.length) return fallback
  return (
    <img src={LOGO_SOURCES[index]} alt="Team 302, Lake Orion Robotics" style={{ height }} className={`w-auto object-contain ${className}`}
      onError={() => { logoIndex = index + 1; setIndex(index + 1) }} />
  )
}
