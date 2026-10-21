// The 302 mark: a green peak (the dragon's wing / a robot's A-frame) with a gold eye.
// TODO(302): swap for the team's official logo SVG when available.
export default function BrandMark({ size = 28, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#0b0b0b" stroke="rgb(255 255 255 / 0.12)" strokeWidth="2" />
      <path d="M14 50 L32 12 L50 50 Z" fill="none" stroke="rgb(var(--accent-500))" strokeWidth="5" strokeLinejoin="round" />
      <circle cx="32" cy="38" r="4" fill="rgb(var(--gold-400))" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark size={26} />
      <span className="leading-none">
        <span className="block text-[15px] font-semibold tracking-tight text-brand-black">302 Hub</span>
        <span className="block text-[11px] text-brand-gray-500 mt-0.5">The Dragons</span>
      </span>
    </span>
  )
}
