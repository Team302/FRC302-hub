// Accessible data table for a chart, with an optional "View as table" toggle.
//
// ChartDataToggle (default export): the <table> is ALWAYS in the DOM. It is
// visually hidden (sr-only) while closed and shown when opened, so
// screen-reader users get exact values without a click. When you use it, give
// the chart `table={false}` so the numbers aren't announced twice.
//   caption     - table caption, e.g. "Revenue by month"
//   columns     - [{ key, label, align?: 'left'|'right', format?: (value, row) => node }]
//   rows        - array of row objects (row.key used as React key when present)
//   defaultOpen - start expanded (default false)
//   toggleLabel - [closedText, openText] (default ['View as table', 'Hide table'])
//   className   - wrapper classes
//
// ChartDataTable (named export): the bare table, used inside every chart.
//   caption, columns, rows, className, id
//   visible - false (default) renders it sr-only; true shows it styled as `.table`

import { useId, useState } from 'react'
import { Table2 } from 'lucide-react'

export function ChartDataTable({ caption, columns = [], rows = [], visible = false, className = '', id }) {
  return (
    <div id={id} className={visible ? `overflow-x-auto ${className}` : 'sr-only'}>
      <table className="table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} scope="col" className={c.align === 'right' ? 'text-right' : undefined}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r?.key ?? i}>
              {columns.map(c => {
                const v = r?.[c.key]
                return (
                  <td key={c.key} className={c.align === 'right' ? 'text-right tabular-nums' : undefined}>
                    {c.format ? c.format(v, r) : (v ?? '—')}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ChartDataToggle({
  caption, columns, rows, defaultOpen = false, toggleLabel = ['View as table', 'Hide table'], className = '',
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = `chart-table-${useId().replace(/:/g, '')}`
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-gray-500 hover:text-brand-black transition-colors print:hidden"
      >
        <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
        {open ? toggleLabel[1] : toggleLabel[0]}
      </button>
      <ChartDataTable id={id} caption={caption} columns={columns} rows={rows} visible={open}
        className={open ? 'mt-3 animate-fade-in' : ''} />
    </div>
  )
}
