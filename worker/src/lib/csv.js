// CSV that opens cleanly in Excel and Google Sheets. Text cells that start with = + - @ (or a tab
// or CR) get a leading quote so a spreadsheet won't run them as a formula; numbers pass through,
// so negative values stay numbers. The BOM makes Excel read the file as UTF-8.
export function csvCell(val) {
  if (val === null || val === undefined) return ''
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : ''
  let s = String(val)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvResponse(rows, filename) {
  const body = `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`
  const ascii = filename.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-') || 'export.csv'
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
