// In-app notifications (the bell), mirrored to the person's devices as Web Push when they have
// turned it on (lib/webpush.js). Nobody is notified about their own action, and people who have
// been removed from the team are never notified.
import { pushConfigured, pushToUser } from './webpush.js'

const PUSH_TITLE = { assigned: 'Assigned to you', mentioned: 'You were mentioned', update: 'New update', status: 'Status changed', due: 'Due soon', automation: 'Automation', review: 'Review', expense: 'Expense', equipment: 'Equipment', trip: 'Trip' }

// `url` is where a push opens when the notification isn't about a task (e.g. '/equipment').
export async function notify(env, { userIds, actorId = null, kind, itemId = null, body, url = null }) {
  const wanted = [...new Set(userIds.filter(Boolean))].filter((id) => id !== actorId)
  if (!wanted.length) return
  const { results: active } = await env.DB.prepare(`SELECT id FROM users WHERE is_active = 1 AND id IN (${wanted.map(() => '?').join(', ')})`).bind(...wanted).all()
  const targets = active.map((r) => r.id)
  if (!targets.length) return
  const text = body.slice(0, 300)
  await env.DB.batch(targets.map((uid) => env.DB.prepare(
    'INSERT INTO notifications (user_id, actor_id, kind, item_id, body) VALUES (?, ?, ?, ?, ?)'
  ).bind(uid, actorId, kind, itemId, text)))

  if (!pushConfigured(env)) return
  // Push is sent after the response when the runtime allows it (env.waitUntil, set per request
  // in index.js), so a slow push service never slows down the person's click.
  const item = itemId ? await env.DB.prepare('SELECT board_id FROM live_items WHERE id = ?').bind(itemId).first() : null
  const message = { title: PUSH_TITLE[kind] || 'Team 302', body: text, url: item ? `/boards/${item.board_id}?item=${itemId}` : url || '/inbox', tag: `${kind}:${itemId || ''}` }
  const delivery = Promise.all(targets.map((uid) => pushToUser(env, uid, message)))
  if (env.waitUntil) env.waitUntil(delivery)
  else await delivery
}

// @mentions: the client sends the ids it inserted; only people actually named in the text
// (as "@Their Name") and still active are notified, so a crafted request can't spam the team.
export async function resolveMentions(env, body, ids) {
  if (!Array.isArray(ids) || !ids.length) return []
  const unique = [...new Set(ids)].slice(0, 20).filter((id) => typeof id === 'string')
  if (!unique.length) return []
  const { results } = await env.DB.prepare(
    `SELECT id, name FROM users WHERE is_active = 1 AND id IN (${unique.map(() => '?').join(', ')})`
  ).bind(...unique).all()
  return results.filter((u) => body.includes(`@${u.name}`)).map((u) => u.id)
}
