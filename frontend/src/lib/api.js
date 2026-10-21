// One fetch wrapper for the whole app. The session token comes from whichever sign-in is active
// (Clerk's getToken, or the dev token) via setTokenSource, and rides as a bearer header.

let tokenSource = async () => null
export function setTokenSource(fn) { tokenSource = fn }

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

let onUnauthorized = () => {}
export function setUnauthorizedHandler(fn) { onUnauthorized = fn }

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {}
  const token = await tokenSource()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let res
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError(0, 'Can’t reach the server. Check your connection.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) onUnauthorized(data)
    throw new ApiError(res.status, data.error || `Request failed (${res.status}).`, data.code)
  }
  return data
}

export const get = (path) => api(path)
export const post = (path, body = {}) => api(path, { method: 'POST', body })
export const patch = (path, body) => api(path, { method: 'PATCH', body })
export const put = (path, body) => api(path, { method: 'PUT', body })
export const del = (path) => api(path, { method: 'DELETE' })
