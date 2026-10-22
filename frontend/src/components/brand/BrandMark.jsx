// Team 302 brand, from the team logo (public/brand/, built by scripts/brand-assets.py).
//
// BrandMark: the dragon's head on a rounded tile, for small spots (sidebar, loader, phone header).
//   size      - 'sm' (28px) | 'md' (40px, default) | 'lg' (56px)
//   tone      - 'auto' (follows the theme, default) | 'light' | 'dark' (for always-dark panels)
//   label     - accessible name (role="img"). Omit when a visible wordmark sits next to the mark.
//
// TeamLogo: the full logo (dragon, 302, Lake Orion Robotics). The dark version has the black
// outlines and lettering turned white so it reads on dark backgrounds.
//   height    - pixel height (width follows the image)
//   tone      - as above
const SIZES = {
  sm: 'w-7 h-7 rounded-lg',
  md: 'w-10 h-10 rounded-[10px]',
  lg: 'w-14 h-14 rounded-[14px]',
}

// Two images, one per theme, so the right one shows without waiting on JavaScript.
function Themed({ light, dark, tone, className, style, alt = '' }) {
  if (tone === 'light') return <img src={light} alt={alt} className={className} style={style} draggable="false" />
  if (tone === 'dark') return <img src={dark} alt={alt} className={className} style={style} draggable="false" />
  return (
    <>
      <img src={light} alt={alt} className={`dark:hidden ${className}`} style={style} draggable="false" />
      <img src={dark} alt={alt} className={`hidden dark:block ${className}`} style={style} draggable="false" />
    </>
  )
}

export default function BrandMark({ size = 'md', tone = 'auto', label, className = '' }) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }
  const tile = tone === 'dark' ? 'bg-white/[0.06] ring-white/10' : tone === 'light' ? 'bg-white ring-black/[0.08]' : 'bg-white ring-black/[0.08] dark:bg-white/[0.06] dark:ring-white/10'
  return (
    <span {...a11y} className={`relative inline-block shrink-0 overflow-hidden ring-1 ring-inset select-none ${tile} ${SIZES[size] || SIZES.md} ${className}`}>
      <Themed light="/brand/mark.png" dark="/brand/mark-dark.png" tone={tone} className="absolute inset-x-0 bottom-0 w-full h-auto" />
    </span>
  )
}

export function TeamLogo({ height = 48, tone = 'auto', className = '' }) {
  return <Themed light="/brand/logo.png" dark="/brand/logo-dark.png" tone={tone} alt="Team 302, Lake Orion Robotics" style={{ height }} className={`w-auto object-contain ${className}`} />
}
