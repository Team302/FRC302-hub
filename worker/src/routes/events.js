// Season events (kickoff, competitions, deadlines, outreach days). Everyone sees them; leads and
// mentors manage them.
import { requireRole } from '../lib/auth.js'
import { logActivity } from '../lib/activity.js'
import { badRequest, conflict, json, newId, notFound, readBody } from '../lib/http.js'
import { eventFromTba, EVENT_KEY, liveStatus, tba, tbaConfigured, teamNumber } from '../lib/tba.js'
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
    return json({ events: results, tba: { configured: tbaConfigured(env), team: teamNumber(env) } })
  }))

  // Adds (or refreshes) every event the team is registered for in a season. Events already
  // imported are updated in place (name, dates, place); their type, notes and link are left alone.
  // A competition someone typed in by hand on the same start date is linked, not duplicated.
  router.post('/api/events/import-tba', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const body = await readBody(request)
    const year = v.int(body.year, 'Season', { min: 1992, max: new Date().getUTCFullYear() + 1 }) ?? new Date().getUTCFullYear()
    const list = await tba(env, `/team/frc${teamNumber(env)}/events/${year}/simple`)
    let created = 0
    let updated = 0
    for (const raw of list || []) {
      if (!EVENT_KEY.test(raw.key || '') || !/^\d{4}-\d{2}-\d{2}$/.test(raw.start_date || '')) continue
      const e = eventFromTba(raw)
      const existing = await env.DB.prepare('SELECT id FROM events WHERE tba_key = ?').bind(e.tba_key).first()
        || await env.DB.prepare("SELECT id FROM events WHERE tba_key IS NULL AND kind = 'competition' AND starts_on = ?").bind(e.starts_on).first()
      if (existing) {
        await env.DB.prepare('UPDATE events SET tba_key = ?, name = ?, starts_on = ?, ends_on = ?, location = ? WHERE id = ?')
          .bind(e.tba_key, e.name, e.starts_on, e.ends_on, e.location, existing.id).run()
        updated++
      } else {
        await env.DB.prepare('INSERT INTO events (id, name, kind, starts_on, ends_on, location, url, notes, created_by, tba_key) VALUES (?, ?, ?, ?, ?, ?, ?, \'\', ?, ?)')
          .bind(newId('evt'), e.name, e.kind, e.starts_on, e.ends_on, e.location, e.url, user.id, e.tba_key).run()
        created++
      }
    }
    await logActivity(env, request, user, { action: 'event.import', entity: 'event', entityId: null, summary: `Imported ${year} events from The Blue Alliance (${created} new, ${updated} updated)` })
    return json({ year, created, updated, found: (list || []).length })
  }))

  // Rank, record and next match while the team is at an imported competition.
  router.get('/api/events/:id/live', authed(async (request, env) => {
    const event = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(request.params.id).first()
    if (!event) throw notFound('That event')
    if (!event.tba_key) throw conflict('This event isn’t linked to The Blue Alliance.', 'not_linked')
    return json({ live: await liveStatus(env, event.tba_key) })
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
