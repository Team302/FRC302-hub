// Season events (kickoff, competitions, deadlines, outreach days). Everyone sees them; leads and
// mentors manage them.
import { requireRole } from '../lib/auth.js'
import { logActivity } from '../lib/activity.js'
import { badRequest, json, newId, notFound, readBody } from '../lib/http.js'
import * as v from '../lib/validate.js'

export const EVENT_KINDS = ['kickoff', 'competition', 'deadline', 'outreach', 'other']

function fields(body, current = {}) {
  const out = {
    name: v.text(body.name, 'Name', { max: 120, required: body.name !== undefined || !current.name }) ?? current.name,
    kind: v.oneOf(body.kind, 'Type', EVENT_KINDS) ?? current.kind ?? 'competition',
    starts_on: v.date(body.starts_on, 'Start date') ?? current.starts_on,
    ends_on: v.date(body.ends_on, 'End date') ?? current.ends_on,
    location: v.text(body.location, 'Location', { max: 160 }) ?? current.location ?? '',
    url: v.url(body.url, 'Link') ?? current.url ?? '',
    notes: v.text(body.notes, 'Notes', { max: 2000 }) ?? current.notes ?? '',
  }
  if (!out.starts_on) throw badRequest('Start date is required.')
  if (!out.ends_on) out.ends_on = out.starts_on
  if (out.ends_on < out.starts_on) throw badRequest('The event ends before it starts.')
  return out
}

export function eventRoutes(router, authed) {
  // ?scope=upcoming (default: ends today or later) | all
  router.get('/api/events', authed(async (request, env) => {
    const all = new URL(request.url).searchParams.get('scope') === 'all'
    const { results } = await env.DB.prepare(
      `SELECT * FROM events ${all ? '' : "WHERE ends_on >= date('now')"} ORDER BY starts_on LIMIT 200`
    ).all()
    return json({ events: results })
  }))

  router.post('/api/events', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const f = fields(await readBody(request))
    const id = newId('evt')
    await env.DB.prepare('INSERT INTO events (id, name, kind, starts_on, ends_on, location, url, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, f.name, f.kind, f.starts_on, f.ends_on, f.location, f.url, f.notes, user.id).run()
    await logActivity(env, request, user, { action: 'event.create', entity: 'event', entityId: id, summary: `Added ${f.name} (${f.starts_on})` })
    return json({ event: await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first() }, { status: 201 })
  }))

  router.patch('/api/events/:id', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const current = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(request.params.id).first()
    if (!current) throw notFound('That event')
    const f = fields(await readBody(request), current)
    await env.DB.prepare('UPDATE events SET name = ?, kind = ?, starts_on = ?, ends_on = ?, location = ?, url = ?, notes = ? WHERE id = ?')
      .bind(f.name, f.kind, f.starts_on, f.ends_on, f.location, f.url, f.notes, current.id).run()
    return json({ event: { ...current, ...f } })
  }))

  router.delete('/api/events/:id', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const current = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(request.params.id).first()
    if (!current) throw notFound('That event')
    await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(current.id).run()
    await logActivity(env, request, user, { action: 'event.delete', entity: 'event', entityId: current.id, summary: `Deleted ${current.name}` })
    return json({ ok: true })
  }))
}
