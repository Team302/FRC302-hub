// Date-range preset of SegmentedControl ("7D  30D  90D").
//
// Props:
//   value, onChange, size, disabled, className - as SegmentedControl
//   options    - default [7, 30, 90]. Each entry is one of:
//                  a number of days     7      → "7D"   (value 7)
//                  a key string         '12m'  → "12M"  ('all' → "All")
//                  a full option        { value, label, disabled?, title? }
//   aria-label - default "Date range"
//
// Example: <RangePills value={period} onChange={setPeriod}
//            options={['7d', '30d', '90d', '12m', { value: 'all', label: 'All', disabled: !cashflow }]} />

import SegmentedControl from './SegmentedControl'

function toOption(o) {
  if (o && typeof o === 'object') return o
  if (typeof o === 'number') return { value: o, label: `${o}D` }
  const s = String(o)
  if (s.toLowerCase() === 'all') return { value: o, label: 'All' }
  const m = s.match(/^(\d+)\s*([dwmy])$/i)
  return { value: o, label: m ? `${m[1]}${m[2].toUpperCase()}` : s }
}

export default function RangePills({ options = [7, 30, 90], 'aria-label': ariaLabel, label, ...rest }) {
  return <SegmentedControl options={options.map(toOption)} aria-label={ariaLabel ?? label ?? 'Date range'} {...rest} />
}
