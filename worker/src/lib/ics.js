// Minimal iCalendar (RFC 5545) writer: escaping, 75-octet line folding, CRLF line ends.

const escapeText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

// Fold at 75 octets (not characters), never splitting a UTF-8 sequence.
function fold(line) {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out = []
  let chunk = ''
  let size = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (size + n > (out.length ? 74 : 75)) { out.push(chunk); chunk = ''; size = 0 }
    chunk += ch
    size += n
  }
  out.push(chunk)
  return out.join('\r\n ')
}

const utcStamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const dateOnly = (iso) => iso.replace(/-/g, '')

function nextDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// events: [{ uid, title, description?, location?, url?, start (ISO) + minutes } | { uid, title, date (YYYY-MM-DD), endDate? }]
export function buildCalendar({ name, events, now = new Date() }) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Team 302//302 Hub//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`, 'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ]
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${utcStamp(now)}`)
    if (e.date) {
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(e.date)}`, `DTEND;VALUE=DATE:${dateOnly(nextDay(e.endDate || e.date))}`, 'TRANSP:TRANSPARENT')
    } else {
      lines.push(`DTSTART:${utcStamp(e.start)}`, `DTEND:${utcStamp(new Date(new Date(e.start).getTime() + e.minutes * 60000))}`)
    }
    lines.push(`SUMMARY:${escapeText(e.title)}`)
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`)
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`)
    if (e.url) lines.push(`URL:${e.url}`)
    if (e.status) lines.push(`STATUS:${e.status}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(fold).join('\r\n')}\r\n`
}
