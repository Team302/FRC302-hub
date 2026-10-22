// Custom board columns: settings and value validation per type. Values are stored as JSON in
// item_values; null means "empty" and deletes the row.
import { badRequest } from './http.js'

export const COLUMN_TYPES = ['status', 'people', 'date', 'timeline', 'text', 'number', 'checkbox', 'dropdown', 'link']
const LABEL_COLORS = ['gray', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'violet', 'pink']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const shortId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 8)

function cleanLabels(list, field) {
  if (!Array.isArray(list) || list.length > 40) throw badRequest(`${field} must be a list of up to 40 options.`)
  const seen = new Set()
  return list.map((l) => {
    const label = typeof l?.label === 'string' ? l.label.trim().slice(0, 40) : ''
    const id = typeof l?.id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(l.id) ? l.id : shortId()
    if (seen.has(id)) throw badRequest(`${field} has a duplicate option.`)
    seen.add(id)
    return { id, label, color: LABEL_COLORS.includes(l?.color) ? l.color : 'gray' }
  })
}

export const DEFAULT_SETTINGS = {
  status: () => ({ labels: [
    { id: shortId(), label: 'To do', color: 'gray' },
    { id: shortId(), label: 'In progress', color: 'amber' },
    { id: shortId(), label: 'Done', color: 'green' },
  ] }),
  dropdown: () => ({ options: [] }),
  number: () => ({ unit: '' }),
}

export function cleanSettings(type, settings) {
  const s = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {}
  if (type === 'status') return { labels: cleanLabels(s.labels ?? DEFAULT_SETTINGS.status().labels, 'Labels') }
  if (type === 'dropdown') return { options: cleanLabels(s.options ?? [], 'Options') }
  if (type === 'number') return { unit: typeof s.unit === 'string' ? s.unit.trim().slice(0, 8) : '' }
  return {}
}

const validDate = (v) => typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))

// → the cleaned value, or null for "clear". activeUserIds: Set of ids that may be assigned.
export function cleanValue(column, value, activeUserIds) {
  if (value === null || value === undefined || value === '') return null
  const settings = typeof column.settings === 'string' ? JSON.parse(column.settings) : column.settings
  const bad = (what) => badRequest(`${column.title}: ${what}`)
  switch (column.type) {
    case 'status':
      if (!settings.labels.some((l) => l.id === value)) throw bad('pick one of the labels.')
      return value
    case 'people': {
      if (!Array.isArray(value) || value.length > 20) throw bad('pick up to 20 people.')
      const ids = [...new Set(value)]
      if (!ids.every((id) => activeUserIds.has(id))) throw bad('everyone must be on the team.')
      return ids.length ? ids : null
    }
    case 'date':
      if (!validDate(value)) throw bad('must be a date.')
      return value
    case 'timeline':
      if (!value || !validDate(value.start) || !validDate(value.end)) throw bad('needs a start and end date.')
      if (value.end < value.start) throw bad('ends before it starts.')
      return { start: value.start, end: value.end }
    case 'text':
      if (typeof value !== 'string') throw bad('must be text.')
      if (value.length > 2000) throw bad('is too long (2000 characters max).')
      return value.trim() || null
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12) throw bad('must be a number.')
      return value
    case 'checkbox':
      if (typeof value !== 'boolean') throw bad('must be checked or unchecked.')
      return value || null
    case 'dropdown': {
      if (!Array.isArray(value) || value.length > 20) throw bad('pick up to 20 options.')
      const ids = [...new Set(value)]
      if (!ids.every((id) => settings.options.some((o) => o.id === id))) throw bad('pick from the options.')
      return ids.length ? ids : null
    }
    case 'link': {
      const raw = typeof value === 'string' ? { url: value } : value
      let url
      try { url = new URL(String(raw?.url || '').trim()) } catch { throw bad('must be a full https:// link.') }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw bad('must start with https://.')
      return { url: url.toString(), text: typeof raw.text === 'string' ? raw.text.trim().slice(0, 100) : '' }
    }
    default:
      throw bad('unknown column type.')
  }
}

// Human-readable value for history and notifications.
export function describeValue(column, value, userNames = {}) {
  if (value === null || value === undefined) return '—'
  const settings = typeof column.settings === 'string' ? JSON.parse(column.settings) : column.settings
  switch (column.type) {
    case 'status': return settings.labels.find((l) => l.id === value)?.label || '—'
    case 'dropdown': return value.map((id) => settings.options.find((o) => o.id === id)?.label).filter(Boolean).join(', ')
    case 'people': return value.map((id) => userNames[id] || 'someone').join(', ')
    case 'timeline': return `${value.start} → ${value.end}`
    case 'checkbox': return value ? 'checked' : 'unchecked'
    case 'link': return value.text || value.url
    default: return String(value).slice(0, 120)
  }
}

// A value as a spreadsheet cell: numbers stay numbers, dates stay ISO, nothing is truncated.
export function exportValue(column, value, userNames = {}) {
  if (value === null || value === undefined) return ''
  const settings = typeof column.settings === 'string' ? JSON.parse(column.settings) : column.settings
  switch (column.type) {
    case 'status': return settings.labels.find((l) => l.id === value)?.label || ''
    case 'dropdown': return value.map((id) => settings.options.find((o) => o.id === id)?.label).filter(Boolean).join(', ')
    case 'people': return value.map((id) => userNames[id] || 'former member').join(', ')
    case 'timeline': return `${value.start} – ${value.end}`
    case 'checkbox': return value ? 'Yes' : ''
    case 'link': return value.url
    case 'number': return Number(value)
    default: return String(value)
  }
}
