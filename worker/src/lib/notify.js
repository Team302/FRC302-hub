// In-app notifications (the bell). Nobody is notified about their own action.
export async function notify(env, { userIds, actorId = null, kind, itemId = null, body }) {
  const targets = [...new Set(userIds.filter(Boolean))].filter((id) => id !== actorId)
  if (!targets.length) return
  await env.DB.batch(targets.map((uid) => env.DB.prepare(
    'INSERT INTO notifications (user_id, actor_id, kind, item_id, body) VALUES (?, ?, ?, ?, ?)'
  ).bind(uid, actorId, kind, itemId, body.slice(0, 300))))
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
