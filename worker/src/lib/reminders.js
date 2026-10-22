// Due-date reminders: owners of open tasks due today or tomorrow, and of overdue tasks, get one
// notification per task per day. Runs from the scheduled handler (worker/src/index.js).
import { notify } from './notify.js'

const isoDay = (d) => d.toISOString().slice(0, 10)

export async function sendDueReminders(env, now = new Date()) {
  const today = isoDay(now)
  const tomorrow = isoDay(new Date(now.getTime() + 86400000))
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.title, i.due_date, i.assignee_id, b.name AS board_name
       FROM items i JOIN boards b ON b.id = i.board_id JOIN users u ON u.id = i.assignee_id
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
