// Status/label badge. Wraps the `.badge-*` utilities from globals.css so all
// badges share one rounded shape and the canonical status→variant mapping.
//
// Props:
//   variant       - explicit variant key: gray|black|success|warning|danger|info
//                   (defaults to 'gray')
//   statusVariant - a status string (e.g. 'overdue', 'active'); resolved to a
//                   variant via statusStyle() from lib/format.js. Takes
//                   precedence over `variant` when provided.
//   className     - extra classes appended to the badge
//   children      - badge contents
//
// Any other props (title, onClick, etc.) pass through to the span.

import { statusStyle } from '../../lib/format'

export default function Badge({ variant = 'gray', statusVariant, className = '', children, ...rest }) {
  const key = statusVariant != null ? statusStyle(statusVariant) : variant
  return (
    <span className={`badge-${key}${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </span>
  )
}
