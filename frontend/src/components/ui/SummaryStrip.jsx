// Compact summary strip: one card split into small totals. Lighter than a row
// of StatCards. Replaces the local SummaryStrip / KpiStrip copies in the Money
// list pages and Maintenance.
//
// Props:
//   items - [{ key?, label, value, sub?, tone?, onClick?, active? }]
//           tone:    'danger' | 'warning' | 'success' | 'pending' (value color)
//           onClick: makes the cell a button (e.g. jump to a filter)
//           active:  highlights the label of a clickable cell
//
// Layout: 2–3 items stack on mobile and sit in one row from `sm`; 4 items are a
// 2x2 grid that becomes one row from `lg`.

const VALUE_TONE = {
  danger: 'text-status-danger',
  warning: 'text-status-warning',
  success: 'text-green-600',
  pending: 'text-yellow-600',
}

function cellBorders(i, n) {
  if (n >= 4) return `${i % 2 === 1 ? 'border-l' : ''} ${i > 1 ? 'border-t lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`
  return i > 0 ? 'border-t sm:border-t-0 sm:border-l' : ''
}

export default function SummaryStrip({ items, className = '' }) {
  const n = items.length
  const grid = n >= 4 ? 'grid-cols-2 lg:grid-cols-4' : n === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'
  return (
    <div className={`card grid ${grid}${className ? ` ${className}` : ''}`}>
      {items.map((it, i) => {
        const clickable = typeof it.onClick === 'function'
        const Cell = clickable ? 'button' : 'div'
        const cellProps = clickable
          ? { type: 'button', onClick: it.onClick, 'aria-pressed': it.active != null ? !!it.active : undefined }
          : {}
        return (
          <Cell
            key={it.key ?? it.label}
            {...cellProps}
            className={`min-w-0 text-left px-4 py-3 border-brand-gray-100 ${cellBorders(i, n)} ${
              clickable ? 'transition-colors hover:bg-brand-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-gray-300' : ''}`}
          >
            <p className={`text-xs font-medium truncate ${it.active ? 'text-brand-black' : 'text-brand-gray-500'}`}>{it.label}</p>
            <p className={`mt-0.5 text-lg font-semibold tabular-nums ${VALUE_TONE[it.tone] || 'text-brand-black'}`}>{it.value}</p>
            {it.sub && <p className="text-xs text-brand-gray-400">{it.sub}</p>}
          </Cell>
        )
      })}
    </div>
  )
}
