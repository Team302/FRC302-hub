// Small helpers shared by every route: JSON answers, typed errors and body parsing.

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message)
    this.status = status
    this.code = code || undefined
  }
}

export const json = (data, init = {}) => Response.json(data, init)

export const badRequest = (message, code) => new HttpError(400, message, code)
export const forbidden = (message = 'You do not have access to that.') => new HttpError(403, message, 'forbidden')
export const notFound = (what = 'That') => new HttpError(404, `${what} was not found.`, 'not_found')
export const conflict = (message, code) => new HttpError(409, message, code)

const MAX_BODY_BYTES = 64 * 1024

// Reads a JSON object body. Anything else (not JSON, an array, too large) is a 400, never a 500.
export async function readBody(request) {
  const type = request.headers.get('Content-Type') || ''
  if (!type.toLowerCase().startsWith('application/json')) throw badRequest('Send JSON (Content-Type: application/json).')
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'That request is too large.')
  let body
  try {
    body = JSON.parse(text || '{}')
  } catch {
    throw badRequest('The request body is not valid JSON.')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Send a JSON object.')
  return body
}

export const newId = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`

export const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 19)

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || null
}
