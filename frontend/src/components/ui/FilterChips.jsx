// Stripe-style filter pills with optional counts. Replaces the local chip rows
// that lived in Jobs, Maintenance, Tasks, Equipment and the Money list pages.
//
// Props:
//   options    - [{ key | value, label, count?, tone?, hidden? }]
//                key/value: option id (either name works)
//                count:     rendered after the label when != null (pass null
//                           while loading to hide it, or '–' as a placeholder)
//                tone:      'danger' | 'warning' — tints a non-zero count on an
//                           inactive chip
//                hidden:    skip this chip (e.g. hide-when-zero rules)
//   value      - the active option id
//   onChange   - called with the option id
//   scroll     - single line that scrolls horizontally instead of wrapping
//                (padded inside so focus rings aren't clipped; no scrollbar)
//   disabled   - disable every chip (e.g. while the list is loading)
//   className  - extra classes on the row
//   aria-label - group label (defaults to "Filter by status")

const COUNT_TONE = {
  danger: 'text-status-danger',
  warning: 'text-status-warning',
}

export default function FilterChips({ options, value, onChange, scroll = false, disabled = false, className = '', 'aria-label': ariaLabel = 'Filter by status' }) {
  return (
    <div
      className={`flex items-center gap-1.5 ${scroll
        ? 'overflow-x-auto p-1 -m-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        : 'flex-wrap'}${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={ariaLabel}
    >
      {options.filter(o => !o.hidden).map(o => {
        const id = o.value ?? o.key
        const active = value === id
        const countTone = !active && o.tone && typeof o.count === 'number' && o.count > 0 ? COUNT_TONE[o.tone] : null
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(id)}
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-xs font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 disabled:opacity-60 disabled:cursor-default ${
              active
                ? 'bg-accent-50 border-accent-200 text-accent-700'
                : 'bg-white border-brand-gray-200 text-brand-gray-600 hover:border-brand-gray-300 hover:text-brand-black'}`}
          >
            {o.label}
            {o.count != null && (
              <span className={`tabular-nums ${active ? 'text-accent-500' : countTone || 'text-brand-gray-400'}`}>{o.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
