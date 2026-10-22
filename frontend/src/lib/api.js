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

// fetch()-shaped call for components ported from ProjectPro (lib/trends.js).
export async function apiFetch(path, init = {}) {
  const token = await tokenSource()
  const headers = { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  return fetch(path, { ...init, headers })
}

// Downloads an authenticated file (a plain link can't carry the bearer token). The name comes
// from the server's Content-Disposition when it sends one.
export async function downloadFile(path, fallbackName) {
  const res = await apiFetch(path)
  if (!res.ok) {
    let message = `The server answered ${res.status}.`
    try { message = (await res.json()).error || message } catch { /* not JSON */ }
    throw new ApiError(res.status, message)
  }
  const cd = res.headers.get('Content-Disposition') || ''
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  const plain = /filename="([^"]+)"/i.exec(cd)
  let name = fallbackName
  try { name = star ? decodeURIComponent(star[1]) : plain ? plain[1] : fallbackName } catch { /* keep fallback */ }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(await res.blob())
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
