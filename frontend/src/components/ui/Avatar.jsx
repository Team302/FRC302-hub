// Avatar: initials on a deterministic soft tint (or a photo), plus AvatarGroup.
//
// Avatar props:
//   name      - person or company name → initials ("Jane Cooper" → "JC";
//               emails use the part before "@")
//   seed      - stable id for the tint (default: name), so a person keeps one color
//   src       - optional image URL (users.avatar_url); falls back to initials on error
//   size      - 'xs' (20px) | 'sm' (24px, default) | 'md' (32px)
//   label     - accessible name. Omit it (default) when the name is printed next
//               to the avatar: the avatar is then decorative (aria-hidden).
//   title     - hover tooltip (default: name)
//   className - extra classes
//   children  - content for the placeholder circle (e.g. a lucide icon)
// With no name and no src it renders a dashed placeholder circle ("Unassigned").
//
// AvatarGroup props:
//   people    - [{ id?, name, src? | avatar_url? }]   (id is the tint seed)
//   max       - avatars shown before a "+n" chip (default 3)
//   size      - as Avatar (default 'sm')
//   label     - accessible name for the whole group; omitted → decorative
//   className - extra classes

import { useEffect, useState } from 'react'

const TINTS = [
  'bg-accent-100 text-accent-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
]

const SIZES = {
  xs: { box: 'w-5 h-5 text-[9px]', chip: 'h-5 min-w-[20px] text-[9px]', overlap: '-space-x-1' },
  sm: { box: 'w-6 h-6 text-[10px]', chip: 'h-6 min-w-[24px] text-[10px]', overlap: '-space-x-1.5' },
  md: { box: 'w-8 h-8 text-xs', chip: 'h-8 min-w-[32px] text-xs', overlap: '-space-x-2' },
}

const firstChar = (w) => (w.match(/[\p{L}\p{N}]/u) || [''])[0]

function initialsOf(name) {
  let s = String(name ?? '').trim()
  if (s.includes('@')) s = s.split('@')[0].replace(/[._+-]+/g, ' ')
  const words = s.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w))
  if (words.length === 0) return ''
  const first = firstChar(words[0])
  const last = words.length > 1 ? firstChar(words[words.length - 1]) : ''
  return (first + last).toUpperCase()
}

function hash(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

const BASE = 'relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none select-none ring-1 ring-white'

export default function Avatar({ name, seed, src, size = 'sm', label, title, className = '', children }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => { setBroken(false) }, [src])

  const sz = (SIZES[size] || SIZES.sm).box
  const tip = title ?? (name || undefined)
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }

  if (src && !broken) {
    return (
      <img src={src} alt={label || ''} title={tip} onError={() => setBroken(true)}
        aria-hidden={label ? undefined : true}
        className={`${BASE} ${sz} object-cover bg-brand-gray-100 ${className}`} />
    )
  }

  const text = initialsOf(name)
  if (!text) {
    return (
      <span title={tip} {...a11y}
        className={`${BASE} ${sz} border border-dashed border-brand-gray-300 bg-white text-brand-gray-400 ${className}`}>
        {children}
      </span>
    )
  }

  const tint = TINTS[hash(String(seed ?? name)) % TINTS.length]
  return (
    <span title={tip} {...a11y} className={`${BASE} ${sz} ${tint} ${className}`}>
      {text}
    </span>
  )
}

export function AvatarGroup({ people = [], max = 3, size = 'sm', label, className = '' }) {
  const s = SIZES[size] || SIZES.sm
  const shown = people.slice(0, Math.max(0, max))
  const hidden = people.slice(shown.length)
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }
  return (
    <span className={`inline-flex items-center ${s.overlap} ${className}`} {...a11y}>
      {shown.map((p, i) => (
        <Avatar key={p.id ?? p.name ?? i} name={p.name} seed={p.id ?? p.name} src={p.src ?? p.avatar_url} size={size} />
      ))}
      {hidden.length > 0 && (
        <span title={hidden.map(p => p.name).filter(Boolean).join(', ') || undefined}
          className={`${BASE} ${s.chip} px-1 bg-brand-gray-100 text-brand-gray-600 tabular-nums`}>
          +{hidden.length}
        </span>
      )}
    </span>
  )
}
