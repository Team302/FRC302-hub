import { clientIp } from './http.js'

// Appends one audit row. Awaited, not fire-and-forget: for vault reveals the audit IS the
// control, so a reveal whose audit row could not be written must fail rather than succeed quietly.
export async function logActivity(env, request, user, { action, entity, entityId = null, summary = '' }) {
  await env.DB.prepare('INSERT INTO activity (actor_id, action, entity, entity_id, summary, ip) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(user?.id ?? null, action, entity, entityId, summary.slice(0, 300), request ? clientIp(request) : null).run()
}

// Fixed-window limiter in D1. Returns true when the call is allowed. Not atomic across
// simultaneous requests (D1 has no row lock), so a burst can overshoot by a few; it bounds bulk
// scraping, it is not a precise quota.
export async function rateLimit(env, key, limit, windowSeconds) {
  const now = new Date()
  const row = await env.DB.prepare('SELECT count, window_end FROM rate_limits WHERE key = ?').bind(key).first()
  if (!row || Date.parse(row.window_end) <= now.getTime()) {
    const end = new Date(now.getTime() + windowSeconds * 1000).toISOString()
    await env.DB.prepare('INSERT INTO rate_limits (key, count, window_end) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, window_end = excluded.window_end')
      .bind(key, end).run()
    return true
  }
  if (row.count >= limit) return false
  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run()
  return true
}
