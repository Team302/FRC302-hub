// Field validators. Each takes the raw value and returns the cleaned value or throws a 400
// naming the field. `undefined` means "not sent" and is passed through for PATCH handlers.
import { badRequest } from './http.js'

export function text(value, field, { max = 200, required = false, allowEmpty = !required } = {}) {
  if (value === undefined) {
    if (required) throw badRequest(`${field} is required.`)
    return undefined
  }
  if (value === null && !required) return ''
  if (typeof value !== 'string') throw badRequest(`${field} must be text.`)
  const cleaned = value.trim()
  if (!allowEmpty && cleaned === '') throw badRequest(`${field} is required.`)
  if (cleaned.length > max) throw badRequest(`${field} must be ${max} characters or fewer.`)
  return cleaned
}

export function oneOf(value, field, allowed, { required = false } = {}) {
  if (value === undefined) {
    if (required) throw badRequest(`${field} is required.`)
    return undefined
  }
  if (!allowed.includes(value)) throw badRequest(`${field} must be one of: ${allowed.join(', ')}.`)
  return value
}

export function date(value, field) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw badRequest(`${field} must be a date (YYYY-MM-DD).`)
  }
  return value
}

export function dateTime(value, field, { required = false } = {}) {
  if (value === undefined) {
    if (required) throw badRequest(`${field} is required.`)
    return undefined
  }
  if (typeof value !== 'string' || value.length > 40 || Number.isNaN(Date.parse(value))) {
    throw badRequest(`${field} must be a date and time.`)
  }
  return new Date(value).toISOString()
}

export function int(value, field, { min = 0, max = 10000 } = {}) {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || value < min || value > max) throw badRequest(`${field} must be a whole number from ${min} to ${max}.`)
  return value
}

export function id(value, field, { nullable = true } = {}) {
  if (value === undefined) return undefined
  if (value === null || value === '') {
    if (nullable) return null
    throw badRequest(`${field} is required.`)
  }
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw badRequest(`${field} is not a valid id.`)
  return value
}

export function email(value, field = 'Email') {
  const cleaned = text(value, field, { max: 254, required: true }).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) throw badRequest(`${field} is not a valid email address.`)
  return cleaned
}

// Only http(s) links: a javascript: URL saved in a task or event would run when someone clicks it.
export function url(value, field) {
  const cleaned = text(value, field, { max: 500 })
  if (!cleaned) return cleaned
  let parsed
  try { parsed = new URL(cleaned) } catch { throw badRequest(`${field} must be a full link starting with https://.`) }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw badRequest(`${field} must start with https://.`)
  return parsed.toString()
}
