// Money display component. Renders a formatted USD amount in a tabular-nums
// span so digits align in tables. When `signed`, prefixes +/− and tints the
// value green (in) / red (out), unless `tone="neutral"`.
//
// Props:
//   amount    - the numeric amount
//   signed    - when true, show an explicit +/− sign and money-in/out color
//   dir       - 'in' | 'out' (or '+' | '-'); direction for signed display.
//               Defaults to the sign of `amount`.
//   tone      - 'auto' (default): signed amounts are green (in) / red (out).
//               'neutral': keeps the +/− sign but adds no color, so the text
//               inherits its color or takes one from `className` (expense and
//               payout amounts, which are always money out).
//   cents     - passed through to formatMoney (default true → show cents)
//   className - extra classes appended to the span

import { formatMoney, formatMoneySigned } from '../../lib/format'

export default function Money({ amount, signed = false, dir, cents = true, tone = 'auto', className = '' }) {
  const opts = { cents }
  let text
  let color = ''

  if (signed) {
    text = formatMoneySigned(amount, dir, opts)
    if (tone !== 'neutral') {
      const isOut = dir === 'out' || dir === '-' || (dir == null && Number(amount) < 0)
      color = isOut ? 'text-red-600' : 'text-green-600'
    }
  } else {
    text = formatMoney(amount, opts)
  }

  return (
    <span className={`tabular-nums${color ? ` ${color}` : ''}${className ? ` ${className}` : ''}`}>
      {text}
    </span>
  )
}
