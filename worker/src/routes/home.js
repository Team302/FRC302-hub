// The home screen in one request: my open work, the next meetings I can see, and where each
// board stands.
import { atLeast } from '../lib/auth.js'
import { json } from '../lib/http.js'

export function homeRoutes(router, authed) {
  router.get('/api/home', authed(async (_req, env, user) => {
    const kinds = ['general', 'subteam', 'build', ...(atLeast(user, 'lead') ? ['leadership'] : []), ...(atLeast(user, 'admin') ? ['mentor'] : [])]
    const [mine, meetings, boards, stuck] = await Promise.all([
      env.DB.prepare(
        `SELECT i.id, i.title, i.status, i.priority, i.due_date, i.board_id, b.name AS board_name, b.color AS board_color
           FROM live_items i JOIN boards b ON b.id = i.board_id
          WHERE i.assignee_id = ? AND i.status <> 'done' AND b.is_archived = 0
          ORDER BY i.due_date IS NULL, i.due_date LIMIT 50`
      ).bind(user.id).all(),
      env.DB.prepare(
        `SELECT id, title, kind, starts_at, duration_min, location, status FROM meetings
          WHERE status <> 'ended' AND kind IN (${kinds.map(() => '?').join(', ')})
          ORDER BY status = 'live' DESC, starts_at LIMIT 4`
      ).bind(...kinds).all(),
      env.DB.prepare(
        `SELECT b.id, b.name, b.color, COUNT(i.id) AS total,
                SUM(CASE WHEN i.status = 'done' THEN 1 ELSE 0 END) AS done,
                SUM(CASE WHEN i.status = 'stuck' THEN 1 ELSE 0 END) AS stuck,
                SUM(CASE WHEN i.status = 'working' THEN 1 ELSE 0 END) AS working
           FROM boards b LEFT JOIN live_items i ON i.board_id = b.id AND i.parent_id IS NULL
          WHERE b.is_archived = 0 GROUP BY b.id ORDER BY b.created_at`
      ).all(),
      env.DB.prepare(
        `SELECT i.id, i.title, i.board_id, b.name AS board_name, u.name AS assignee_name, i.updated_at
           FROM live_items i JOIN boards b ON b.id = i.board_id LEFT JOIN users u ON u.id = i.assignee_id
          WHERE i.status = 'stuck' AND b.is_archived = 0 ORDER BY i.updated_at LIMIT 10`
      ).all(),
    ])
    const today = new Date().toISOString().slice(0, 10)
    return json({
      my_items: mine.results,
      overdue_count: mine.results.filter((i) => i.due_date && i.due_date < today).length,
      meetings: meetings.results,
      boards: boards.results.map((b) => ({ ...b, done: b.done || 0, stuck: b.stuck || 0, working: b.working || 0 })),
      stuck: stuck.results,
    })
  }))
}
