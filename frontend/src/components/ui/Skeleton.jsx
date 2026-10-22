// Loading skeletons, extracted from the placeholder row pattern used while
// list pages load (Jobs.jsx, Tasks.jsx). Bars use the `.skeleton` shimmer from
// globals.css (static gray under prefers-reduced-motion).
//
// Exports:
//   Skeleton      - one shimmer bar. Props: { className, width } (width sets w-*
//                   via inline style when a number/string is given).
//   SkeletonRow   - a horizontal row of shimmer bars matching the table-row
//                   placeholder. Props: { cols = 3, className }.
//   SkeletonTable - a stack of SkeletonRows. Props: { rows = 5, cols = 3 }.

export function Skeleton({ className = '', width }) {
  const style = width != null ? { width: typeof width === 'number' ? `${width}px` : width } : undefined
  // Default height only when the caller didn't pass one: Tailwind orders h-4
  // after h-3/h-2.5 in the CSS, so a caller's smaller height would otherwise lose.
  const height = /(^|\s)(h-|size-)/.test(className) ? '' : 'h-4 '
  return <div style={style} className={`${height}rounded-md skeleton ${className}`} aria-hidden="true" />
}

export function SkeletonRow({ cols = 3, className = '' }) {
  return (
    <div className={`flex items-center gap-4 px-4 py-3.5 ${className}`}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton
          key={i}
          className={i === cols - 1 ? 'w-16 ml-auto' : i === 0 ? 'w-24' : 'w-40'}
        />
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 3 }) {
  return (
    <div className="divide-y divide-brand-gray-100" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </div>
  )
}

export default Skeleton
