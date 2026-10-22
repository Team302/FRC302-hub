// Private calendar feed per person: meetings they can see (past 60 days onward) and their open
// tasks with a due date, as all-day events. Subscribed to from Google Calendar / Apple Calendar /
// Outlook, which can't send a session token, so the feed URL itself is the credential:
//   GET /api/calendar/<token>.ics
// Only SHA-256(token) is stored. Creating a new URL replaces the old one; a removed person's
// feed stops working because their row is inactive.
import { atLeast } from '../lib/auth.js'
import { buildCalendar } from '../lib/ics.js'
import { HttpError, json } from '../lib/http.js'
import { logActivity } from '../lib/activity.js'

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const KIND_MIN_ROLE = { leadership: 'lead', mentor: 'admin' }

export function calendarRoutes(router, authed) {
  router.get('/api/me/calendar', authed(async (_req, env, user) => {
    const row = await env.DB.prepare('SELECT calendar_token_hash FROM users WHERE id = ?').bind(user.id).first()
    return json({ enabled: !!row?.calendar_token_hash })
  }))

  // Creates (or replaces) the feed URL. The URL is only ever shown here, once.
  router.post('/api/me/calendar', authed(async (request, env, user) => {
    const token = randomToken()
    await env.DB.prepare('UPDATE users SET calendar_token_hash = ? WHERE id = ?').bind(await sha256Hex(token), user.id).run()
    await logActivity(env, request, user, { action: 'calendar.create', entity: 'user', entityId: user.id, summary: 'Created a new calendar feed URL' })
    const origin = env.APP_URL ? new URL(env.APP_URL).origin : new URL(request.url).origin
    return json({ url: `${origin}/api/calendar/${token}.ics` })
  }))

  router.delete('/api/me/calendar', authed(async (request, env, user) => {
    await env.DB.prepare('UPDATE users SET calendar_token_hash = NULL WHERE id = ?').bind(user.id).run()
    await logActivity(env, request, user, { action: 'calendar.delete', entity: 'user', entityId: user.id, summary: 'Turned off their calendar feed' })
    return json({ ok: true })
  }))

  router.get('/api/calendar/:file', async (request, env) => {
    const match = /^([0-9a-f]{64})\.ics$/.exec(request.params.file || '')
    if (!match) throw new HttpError(404, 'No such calendar.')
    const user = await env.DB.prepare('SELECT id, name, role, subteam_id FROM users WHERE calendar_token_hash = ? AND is_active = 1')
      .bind(await sha256Hex(match[1])).first()
    if (!user) throw new HttpError(404, 'No such calendar.')

    const kinds = ['general', 'subteam', 'build', 'leadership', 'mentor'].filter((k) => atLeast(user, KIND_MIN_ROLE[k] || 'member'))
    const since = new Date(Date.now() - 60 * 86400000).toISOString()
    const [{ results: meetings }, { results: tasks }, { results: seasonEvents }] = await Promise.all([
      env.DB.prepare(
        `SELECT id, title, kind, starts_at, duration_min, location, status, subteam_id FROM meetings
          WHERE starts_at >= ? AND kind IN (${kinds.map(() => '?').join(', ')}) ORDER BY starts_at LIMIT 500`
      ).bind(since, ...kinds).all(),
      env.DB.prepare(
        `SELECT i.id, i.title, i.due_date, i.board_id, b.name AS board_name FROM live_items i JOIN boards b ON b.id = i.board_id
          WHERE i.assignee_id = ? AND i.status <> 'done' AND i.due_date IS NOT NULL AND b.is_archived = 0 LIMIT 500`
      ).bind(user.id).all(),
      env.DB.prepare("SELECT id, name, starts_on, ends_on, location, url, notes FROM events WHERE ends_on >= date('now', '-60 days') ORDER BY starts_on LIMIT 200").all(),
    ])
    const origin = env.APP_URL ? new URL(env.APP_URL).origin : new URL(request.url).origin
    const body = buildCalendar({
      name: 'Team 302',
      events: [
        // Subteam meetings for other subteams are left out: they'd clutter everyone's calendar.
        ...meetings.filter((m) => m.kind !== 'subteam' || !m.subteam_id || m.subteam_id === user.subteam_id).map((m) => ({
          uid: `${m.id}@302hub`, title: m.title, start: m.starts_at, minutes: m.duration_min, location: m.location,
          url: `${origin}/meetings/${m.id}`, description: `${origin}/meetings/${m.id}`,
        })),
        ...seasonEvents.map((e) => ({ uid: `${e.id}@302hub`, title: e.name, date: e.starts_on, endDate: e.ends_on, location: e.location, url: e.url || undefined, description: e.notes || undefined })),
        ...tasks.map((t) => ({ uid: `${t.id}@302hub`, title: `Due: ${t.title}`, date: t.due_date, description: `${t.board_name}\n${origin}/boards/${t.board_id}?item=${t.id}`, url: `${origin}/boards/${t.board_id}?item=${t.id}` })),
      ],
    })
    return new Response(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="team302.ics"' } })
  })
}
