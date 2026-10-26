// Reminders, from the hourly scheduled handler (worker/src/index.js), each at most once per task
// per day:
// - due dates: owners of open tasks due today or tomorrow, or overdue;
// - reviews: reviewers of tasks that have waited REVIEW_NUDGE_DAYS or more for them; from
//   REVIEW_ESCALATE_DAYS on, the subteam's leads hear about it too (the mentors, if it has none).
import { notify } from './notify.js'

const isoDay = (d) => d.toISOString().slice(0, 10)

export async function sendDueReminders(env, now = new Date()) {
  const today = isoDay(now)
  const tomorrow = isoDay(new Date(now.getTime() + 86400000))
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.title, i.due_date, i.assignee_id, b.name AS board_name
       FROM live_items i JOIN boards b ON b.id = i.board_id JOIN users u ON u.id = i.assignee_id
      WHERE i.status <> 'done' AND b.is_archived = 0 AND u.is_active = 1 AND i.due_date IS NOT NULL AND i.due_date <= ?
        AND NOT EXISTS (SELECT 1 FROM reminder_log r WHERE r.item_id = i.id AND r.day = ?)
      LIMIT 500`
  ).bind(tomorrow, today).all()
  for (const item of results) {
    const when = item.due_date < today ? `was due ${item.due_date}` : item.due_date === today ? 'is due today' : 'is due tomorrow'
    await notify(env, { userIds: [item.assignee_id], kind: 'due', itemId: item.id, body: `“${item.title}” on ${item.board_name} ${when}` })
    await env.DB.prepare('INSERT OR IGNORE INTO reminder_log (item_id, day) VALUES (?, ?)').bind(item.id, today).run()
  }
  return results.length
}

export const REVIEW_NUDGE_DAYS = 2
export const REVIEW_ESCALATE_DAYS = 4

export async function sendReviewReminders(env, now = new Date()) {
  const today = isoDay(now)
  const cutoff = new Date(now.getTime() - REVIEW_NUDGE_DAYS * 86400000).toISOString().slice(0, 19).replace('T', ' ')
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.title, i.reviewer_id, i.assignee_id, i.review_requested_at, b.name AS board_name, o.name AS owner_name,
            u.name AS reviewer_name, COALESCE(b.subteam_id, o.subteam_id) AS scope
       FROM live_items i JOIN boards b ON b.id = i.board_id JOIN users u ON u.id = i.reviewer_id LEFT JOIN users o ON o.id = i.assignee_id
      WHERE i.status = 'review' AND b.is_archived = 0 AND u.is_active = 1 AND i.review_requested_at IS NOT NULL AND i.review_requested_at <= ?
        AND NOT EXISTS (SELECT 1 FROM review_reminder_log r WHERE r.item_id = i.id AND r.day = ?)
      LIMIT 500`
  ).bind(cutoff, today).all()
  for (const item of results) {
    const days = Math.floor((now - Date.parse(`${item.review_requested_at.replace(' ', 'T')}Z`)) / 86400000)
    await notify(env, { userIds: [item.reviewer_id], kind: 'review', itemId: item.id, body: `“${item.title}” on ${item.board_name} has waited ${days} days for your review${item.owner_name ? ` (${item.owner_name})` : ''}` })
    if (days >= REVIEW_ESCALATE_DAYS) await escalate(env, item, days)
    await env.DB.prepare('INSERT OR IGNORE INTO review_reminder_log (item_id, day) VALUES (?, ?)').bind(item.id, today).run()
  }
  return results.length
}

async function escalate(env, item, days) {
  const leads = item.scope
    ? (await env.DB.prepare("SELECT id FROM users WHERE is_active = 1 AND role = 'lead' AND subteam_id = ?").bind(item.scope).all()).results
    : []
  const to = leads.length ? leads : (await env.DB.prepare("SELECT id FROM users WHERE is_active = 1 AND role = 'admin'").all()).results
  const ids = to.map((r) => r.id).filter((id) => id !== item.reviewer_id && id !== item.assignee_id)
  if (!ids.length) return
  await notify(env, { userIds: ids, kind: 'review', itemId: item.id, body: `“${item.title}” on ${item.board_name} has waited ${days} days for ${item.reviewer_name}’s review. You can approve it, or pick another reviewer.` })
}
