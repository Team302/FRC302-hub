// Trip rosters on season events (migration 0014): who's going, a waitlist when there's a cap, and
// a checklist per person. Everyone can see who's going; only leads and mentors see everyone's
// checklist. Items marked mentor-only (anything a parent signs, or money) are ticked by mentors.
// Members sign themselves up or drop out while the roster is open, until sign-up closes (or the
// day before the event). Leads add and remove anyone at any time, and can go over the cap.
// The cap counts students (members and leads). Mentors on the list are chaperones: always going,
// never counted, never waitlisted.
import { atLeast, requireRole } from '../lib/auth.js'
import { logActivity } from '../lib/activity.js'
import { csvResponse } from '../lib/csv.js'
import { badRequest, conflict, forbidden, json, newId, notFound, readBody } from '../lib/http.js'
import { notify } from '../lib/notify.js'
import * as v from '../lib/validate.js'

export const DEFAULT_REQUIREMENTS = [
  { label: 'Permission slip', mentor_only: 1 },
  { label: 'Trip fee paid', mentor_only: 1 },
  { label: 'Medical & emergency form', mentor_only: 1 },
]

const today = () => new Date().toISOString().slice(0, 10)

// Can members change their own spot today?
export function selfServiceOpen(event, day = today()) {
  if (!event.roster_open) return false
  if (day >= event.starts_on) return false
  return !event.signup_closes_on || day <= event.signup_closes_on
}

async function loadEvent(env, id) {
  const event = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first()
  if (!event) throw notFound('That event')
  return event
}

const ACTIVE_GOING = "SELECT COUNT(*) FROM event_roster r JOIN users u ON u.id = r.user_id AND u.is_active = 1 AND u.role <> 'admin' WHERE r.event_id = e.id AND r.status = 'going'"

// Fills free places from the waitlist, oldest first, and tells each person promoted.
async function promoteWaitlist(env, event) {
  const promoted = []
  for (let i = 0; i < 200; i++) {
    const row = await env.DB.prepare(
      `UPDATE event_roster SET status = 'going'
       WHERE event_id = ?1 AND user_id = (
         SELECT r.user_id FROM event_roster r JOIN users u ON u.id = r.user_id AND u.is_active = 1
         WHERE r.event_id = ?1 AND r.status = 'waitlist' ORDER BY r.created_at, r.rowid LIMIT 1)
       AND EXISTS (SELECT 1 FROM events e WHERE e.id = ?1 AND (e.capacity IS NULL OR (${ACTIVE_GOING}) < e.capacity))
       RETURNING user_id`
    ).bind(event.id).first()
    if (!row) break
    promoted.push(row.user_id)
  }
  if (promoted.length) {
    await notify(env, { userIds: promoted, actorId: null, kind: 'trip', body: `A place opened up: you’re going to ${event.name}.`, url: `/season/${event.id}` })
  }
  return promoted
}

async function rosterView(env, event, user) {
  const lead = atLeast(user, 'lead')
  const [{ results: requirements }, { results: people }, { results: checks }] = await Promise.all([
    env.DB.prepare('SELECT id, label, position, mentor_only FROM event_requirements WHERE event_id = ? ORDER BY position, rowid').bind(event.id).all(),
    env.DB.prepare(
      `SELECT r.user_id, r.status, r.note, r.created_at, u.name, u.role, u.subteam_id, s.name AS subteam_name
       FROM event_roster r JOIN users u ON u.id = r.user_id AND u.is_active = 1
       LEFT JOIN subteams s ON s.id = u.subteam_id
       WHERE r.event_id = ? ORDER BY r.status = 'waitlist', CASE WHEN r.status = 'waitlist' THEN r.created_at END, r.rowid, u.name`
    ).bind(event.id).all(),
    env.DB.prepare(
      `SELECT c.requirement_id, c.user_id, c.checked_at, cb.name AS checked_by_name
       FROM event_checks c JOIN event_requirements q ON q.id = c.requirement_id
       LEFT JOIN users cb ON cb.id = c.checked_by WHERE q.event_id = ?`
    ).bind(event.id).all(),
  ])
  const byUser = {}
  for (const c of checks) {
    if (!lead && c.user_id !== user.id) continue
    ;(byUser[c.user_id] ||= {})[c.requirement_id] = { at: c.checked_at, by: c.checked_by_name }
  }
  const total = requirements.length
  const rows = people.map((p) => {
    const mine = p.user_id === user.id
    const row = { user_id: p.user_id, name: p.name, subteam_id: p.subteam_id, subteam_name: p.subteam_name, status: p.status, mentor: p.role === 'admin' }
    // Notes and checklists are private to the person and to leads/mentors.
    if (lead || mine) Object.assign(row, { note: p.note, checks: byUser[p.user_id] || {}, done: Object.keys(byUser[p.user_id] || {}).length, cleared: Object.keys(byUser[p.user_id] || {}).length === total })
    return row
  })
  const going = rows.filter((r) => r.status === 'going' && !r.mentor).length
  const mentors = rows.filter((r) => r.mentor).length
  return {
    event: { id: event.id, name: event.name, kind: event.kind, starts_on: event.starts_on, ends_on: event.ends_on, location: event.location, url: event.url, roster_open: event.roster_open, signup_closes_on: event.signup_closes_on, capacity: event.capacity },
    requirements,
    people: rows,
    summary: { going, mentors, waitlist: rows.filter((r) => r.status === 'waitlist').length, cleared: lead ? rows.filter((r) => r.status === 'going' && !r.mentor && r.cleared).length : null },
    me: rows.find((r) => r.user_id === user.id) || null,
    can_self_serve: selfServiceOpen(event),
  }
}

export function tripRoutes(router, authed) {
  router.get('/api/events/:id/roster', authed(async (request, env, user) => {
    return json(await rosterView(env, await loadEvent(env, request.params.id), user))
  }))

  // Open/close sign-up, set the closing date and the cap. Opening a roster that has no checklist
  // yet adds the usual three items, which leads can rename or remove.
  router.patch('/api/events/:id/roster', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const event = await loadEvent(env, request.params.id)
    const body = await readBody(request)
    const open = body.roster_open === undefined ? event.roster_open : (body.roster_open ? 1 : 0)
    const closes = v.date(body.signup_closes_on, 'Sign-up closes')
    const cap = body.capacity === null || body.capacity === '' ? null : v.int(body.capacity, 'Places', { min: 1, max: 500 })
    const next = {
      roster_open: open,
      signup_closes_on: closes === undefined ? event.signup_closes_on : closes,
      capacity: body.capacity === undefined ? event.capacity : cap,
    }
    if (next.signup_closes_on && next.signup_closes_on > event.ends_on) throw badRequest('Sign-up has to close by the end of the event.')
    await env.DB.prepare('UPDATE events SET roster_open = ?, signup_closes_on = ?, capacity = ? WHERE id = ?')
      .bind(next.roster_open, next.signup_closes_on, next.capacity, event.id).run()
    if (open && !event.roster_open) {
      const has = await env.DB.prepare('SELECT 1 FROM event_requirements WHERE event_id = ? LIMIT 1').bind(event.id).first()
      if (!has) {
        await env.DB.batch(DEFAULT_REQUIREMENTS.map((r, i) => env.DB.prepare('INSERT INTO event_requirements (id, event_id, label, position, mentor_only) VALUES (?, ?, ?, ?, ?)')
          .bind(newId('req'), event.id, r.label, i, r.mentor_only)))
      }
      await logActivity(env, request, user, { action: 'trip.open', entity: 'event', entityId: event.id, summary: `Opened sign-up for ${event.name}` })
    }
    const updated = { ...event, ...next }
    // A higher cap (or none) lets people in from the waitlist.
    await promoteWaitlist(env, updated)
    return json(await rosterView(env, updated, user))
  }))

  // Sign up yourself, or (leads) add someone. Signing yourself up takes a free place or joins the
  // waitlist, leads included; a lead adding someone else puts them in, even past the cap. Mentors
  // are always in and don't count.
  router.post('/api/events/:id/roster', authed(async (request, env, user) => {
    const event = await loadEvent(env, request.params.id)
    const body = await readBody(request)
    const targetId = v.id(body.user_id, 'Person') || user.id
    const forSomeoneElse = targetId !== user.id
    const lead = atLeast(user, 'lead')
    if (forSomeoneElse || !selfServiceOpen(event)) {
      if (!lead) throw forbidden(event.roster_open ? 'Sign-up for this trip has closed. Ask a lead or mentor.' : 'Sign-up for this trip isn’t open.')
    }
    const target = await env.DB.prepare('SELECT id, name, role FROM users WHERE id = ? AND is_active = 1').bind(targetId).first()
    if (!target) throw notFound('That person')
    const note = v.text(body.note, 'Note', { max: 200 }) ?? ''
    const existing = await env.DB.prepare('SELECT status FROM event_roster WHERE event_id = ? AND user_id = ?').bind(event.id, target.id).first()
    if (existing) throw conflict(forSomeoneElse ? `${target.name} is already on the list.` : 'You’re already on the list.', 'already_listed')
    if ((lead && forSomeoneElse) || target.role === 'admin') {
      await env.DB.prepare("INSERT INTO event_roster (event_id, user_id, status, note, added_by) VALUES (?, ?, 'going', ?, ?)").bind(event.id, target.id, note, user.id).run()
    } else {
      await env.DB.prepare(
        `INSERT INTO event_roster (event_id, user_id, status, note, added_by)
         SELECT e.id, ?, CASE WHEN e.capacity IS NULL OR (${ACTIVE_GOING}) < e.capacity THEN 'going' ELSE 'waitlist' END, ?, ?
         FROM events e WHERE e.id = ?`
      ).bind(target.id, note, user.id, event.id).run()
    }
    const row = await env.DB.prepare('SELECT status FROM event_roster WHERE event_id = ? AND user_id = ?').bind(event.id, target.id).first()
    if (forSomeoneElse) {
      await notify(env, { userIds: [target.id], actorId: user.id, kind: 'trip', body: `${user.name} added you to the list for ${event.name}.`, url: `/season/${event.id}` })
    }
    await logActivity(env, request, user, {
      action: 'trip.join', entity: 'event', entityId: event.id,
      summary: forSomeoneElse ? `Added ${target.name} to ${event.name}` : `${row.status === 'going' ? 'Signed up for' : 'Joined the waitlist for'} ${event.name}`,
    })
    return json(await rosterView(env, event, user), { status: 201 })
  }))

  // Your own note ("leaving Saturday at noon"), or anyone's for leads.
  router.patch('/api/events/:id/roster/:userId', authed(async (request, env, user) => {
    const event = await loadEvent(env, request.params.id)
    const self = request.params.userId === user.id
    if (!self) requireRole(user, 'lead')
    const body = await readBody(request)
    const row = await env.DB.prepare('SELECT r.status, u.role FROM event_roster r JOIN users u ON u.id = r.user_id WHERE r.event_id = ? AND r.user_id = ?').bind(event.id, request.params.userId).first()
    if (!row) throw notFound('That person on this trip')
    const note = v.text(body.note, 'Note', { max: 200 })
    const status = v.oneOf(body.status, 'Status', ['going', 'waitlist'])
    if (status !== undefined) requireRole(user, 'lead')
    if (status === 'waitlist' && row.role === 'admin') throw badRequest('Mentors don’t go on the waitlist.')
    await env.DB.prepare('UPDATE event_roster SET note = COALESCE(?, note), status = COALESCE(?, status) WHERE event_id = ? AND user_id = ?')
      .bind(note ?? null, status ?? null, event.id, request.params.userId).run()
    if (status === 'going' && row.status === 'waitlist') {
      await notify(env, { userIds: [request.params.userId], actorId: user.id, kind: 'trip', body: `You’re off the waitlist: you’re going to ${event.name}.`, url: `/season/${event.id}` })
    }
    if (status === 'waitlist' && row.status === 'going') await promoteWaitlist(env, event)
    return json(await rosterView(env, event, user))
  }))

  // Drop out yourself (while sign-up is open), or remove someone (leads). Their checklist goes
  // with them, and the first person on the waitlist gets the place.
  router.delete('/api/events/:id/roster/:userId', authed(async (request, env, user) => {
    const event = await loadEvent(env, request.params.id)
    const targetId = request.params.userId
    const self = targetId === user.id
    if (!self || !selfServiceOpen(event)) {
      if (!atLeast(user, 'lead')) throw forbidden(self ? 'Sign-up has closed, so ask a lead or mentor to take you off the list.' : 'Only leads and mentors can do that.')
    }
    const row = await env.DB.prepare('SELECT r.status, u.name FROM event_roster r JOIN users u ON u.id = r.user_id WHERE r.event_id = ? AND r.user_id = ?').bind(event.id, targetId).first()
    if (!row) throw notFound('That person on this trip')
    await env.DB.batch([
      env.DB.prepare('DELETE FROM event_checks WHERE user_id = ? AND requirement_id IN (SELECT id FROM event_requirements WHERE event_id = ?)').bind(targetId, event.id),
      env.DB.prepare('DELETE FROM event_roster WHERE event_id = ? AND user_id = ?').bind(event.id, targetId),
    ])
    if (!self) await notify(env, { userIds: [targetId], actorId: user.id, kind: 'trip', body: `${user.name} took you off the list for ${event.name}.`, url: `/season/${event.id}` })
    await logActivity(env, request, user, { action: 'trip.leave', entity: 'event', entityId: event.id, summary: self ? `Dropped out of ${event.name}` : `Took ${row.name} off ${event.name}` })
    if (row.status === 'going') await promoteWaitlist(env, event)
    return json(await rosterView(env, event, user))
  }))

  // Tick or untick one checklist item for one person.
  router.put('/api/events/:id/checks', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const event = await loadEvent(env, request.params.id)
    const body = await readBody(request)
    const reqId = v.id(body.requirement_id, 'Checklist item', { nullable: false })
    const targetId = v.id(body.user_id, 'Person', { nullable: false })
    const requirement = await env.DB.prepare('SELECT * FROM event_requirements WHERE id = ? AND event_id = ?').bind(reqId, event.id).first()
    if (!requirement) throw notFound('That checklist item')
    if (requirement.mentor_only) requireRole(user, 'admin', `Only mentors can tick “${requirement.label}”.`)
    const listed = await env.DB.prepare('SELECT 1 FROM event_roster WHERE event_id = ? AND user_id = ?').bind(event.id, targetId).first()
    if (!listed) throw notFound('That person on this trip')
    if (body.done) {
      await env.DB.prepare('INSERT INTO event_checks (requirement_id, user_id, checked_by) VALUES (?, ?, ?) ON CONFLICT (requirement_id, user_id) DO NOTHING').bind(reqId, targetId, user.id).run()
    } else {
      await env.DB.prepare('DELETE FROM event_checks WHERE requirement_id = ? AND user_id = ?').bind(reqId, targetId).run()
    }
    return json(await rosterView(env, event, user))
  }))

  // Checklist items. Mentor-only items can only be made, changed or removed by mentors, so a
  // lead can't untick the flag and then tick the item themselves.
  router.post('/api/events/:id/requirements', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const event = await loadEvent(env, request.params.id)
    const body = await readBody(request)
    const label = v.text(body.label, 'Item', { max: 80, required: true })
    const mentorOnly = body.mentor_only ? 1 : 0
    if (mentorOnly) requireRole(user, 'admin', 'Only mentors can add mentor-only items.')
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM event_requirements WHERE event_id = ?').bind(event.id).first()
    if (n >= 12) throw badRequest('A trip can have at most 12 checklist items.')
    await env.DB.prepare('INSERT INTO event_requirements (id, event_id, label, position, mentor_only) VALUES (?, ?, ?, ?, ?)').bind(newId('req'), event.id, label, n, mentorOnly).run()
    return json(await rosterView(env, event, user), { status: 201 })
  }))

  router.patch('/api/events/:id/requirements/:reqId', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const event = await loadEvent(env, request.params.id)
    const requirement = await env.DB.prepare('SELECT * FROM event_requirements WHERE id = ? AND event_id = ?').bind(request.params.reqId, event.id).first()
    if (!requirement) throw notFound('That checklist item')
    const body = await readBody(request)
    const mentorOnly = body.mentor_only === undefined ? requirement.mentor_only : (body.mentor_only ? 1 : 0)
    if (requirement.mentor_only || mentorOnly) requireRole(user, 'admin', 'Only mentors can change mentor-only items.')
    const label = v.text(body.label, 'Item', { max: 80, allowEmpty: false }) ?? requirement.label
    await env.DB.prepare('UPDATE event_requirements SET label = ?, mentor_only = ? WHERE id = ?').bind(label, mentorOnly, requirement.id).run()
    return json(await rosterView(env, event, user))
  }))

  router.delete('/api/events/:id/requirements/:reqId', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const event = await loadEvent(env, request.params.id)
    const requirement = await env.DB.prepare('SELECT * FROM event_requirements WHERE id = ? AND event_id = ?').bind(request.params.reqId, event.id).first()
    if (!requirement) throw notFound('That checklist item')
    if (requirement.mentor_only) requireRole(user, 'admin', 'Only mentors can remove mentor-only items.')
    await env.DB.batch([
      env.DB.prepare('DELETE FROM event_checks WHERE requirement_id = ?').bind(requirement.id),
      env.DB.prepare('DELETE FROM event_requirements WHERE id = ?').bind(requirement.id),
    ])
    return json(await rosterView(env, event, user))
  }))

  // The roster as a spreadsheet: for the school's trip paperwork, the bus company or the hotel.
  router.get('/api/events/:id/roster.csv', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const event = await loadEvent(env, request.params.id)
    const view = await rosterView(env, event, user)
    const rows = [['Name', 'Subteam', 'Status', 'Note', ...view.requirements.map((r) => r.label), 'All done']]
    for (const p of view.people) {
      rows.push([p.name, p.subteam_name || '', p.status === 'going' ? 'Going' : 'Waitlist', p.note, ...view.requirements.map((r) => (p.checks[r.id] ? 'Yes' : 'No')), p.cleared ? 'Yes' : 'No'])
    }
    await logActivity(env, request, user, { action: 'trip.export', entity: 'event', entityId: event.id, summary: `Exported the roster for ${event.name}` })
    return csvResponse(rows, `${event.name} roster.csv`)
  }))
}

// Someone left the team or became a mentor: their student place on upcoming trips is free, so
// fill it from the waitlist.
export async function refreshRostersFor(env, userId) {
  const { results } = await env.DB.prepare(
    "SELECT e.* FROM events e JOIN event_roster r ON r.event_id = e.id WHERE r.user_id = ? AND e.ends_on >= date('now')"
  ).bind(userId).all()
  for (const event of results) await promoteWaitlist(env, event)
}

export const TRIP_REMINDER_DAYS = 7

// From the hourly job: once per trip, when it's a week (or less) away, everyone going who still
// has checklist items open is told which, and the mentors get one summary.
export async function sendTripReminders(env, now = new Date()) {
  const day = (offset) => new Date(now.getTime() + offset * 86400000).toISOString().slice(0, 10)
  const { results: events } = await env.DB.prepare(
    `SELECT * FROM events WHERE trip_reminded_at IS NULL AND starts_on > ? AND starts_on <= ?
       AND EXISTS (SELECT 1 FROM event_roster r WHERE r.event_id = events.id) LIMIT 50`
  ).bind(day(0), day(TRIP_REMINDER_DAYS)).all()
  let sent = 0
  for (const event of events) {
    // Claim it first, so an overlapping run can't send it twice.
    const claimed = await env.DB.prepare("UPDATE events SET trip_reminded_at = datetime('now') WHERE id = ? AND trip_reminded_at IS NULL").bind(event.id).run()
    if (!claimed.meta?.changes) continue
    const { results: requirements } = await env.DB.prepare('SELECT id, label FROM event_requirements WHERE event_id = ? ORDER BY position, rowid').bind(event.id).all()
    if (!requirements.length) continue
    const { results: people } = await env.DB.prepare(
      `SELECT r.user_id, u.name FROM event_roster r JOIN users u ON u.id = r.user_id AND u.is_active = 1 AND u.role <> 'admin'
        WHERE r.event_id = ? AND r.status = 'going'`
    ).bind(event.id).all()
    const { results: checks } = await env.DB.prepare(
      'SELECT c.user_id, c.requirement_id FROM event_checks c JOIN event_requirements q ON q.id = c.requirement_id WHERE q.event_id = ?'
    ).bind(event.id).all()
    const done = new Set(checks.map((c) => `${c.user_id}:${c.requirement_id}`))
    const days = Math.round((Date.parse(`${event.starts_on}T00:00:00Z`) - Date.parse(`${day(0)}T00:00:00Z`)) / 86400000)
    const when = days === 1 ? 'tomorrow' : `in ${days} days`
    const missingCount = {}
    let behind = 0
    for (const p of people) {
      const missing = requirements.filter((q) => !done.has(`${p.user_id}:${q.id}`))
      if (!missing.length) continue
      behind++
      for (const q of missing) missingCount[q.label] = (missingCount[q.label] || 0) + 1
      await notify(env, { userIds: [p.user_id], kind: 'trip', body: `${event.name} is ${when}. Still to do: ${missing.map((q) => q.label).join(', ')}.`, url: `/season/${event.id}` })
      sent++
    }
    if (behind) {
      const { results: mentors } = await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1").all()
      const detail = Object.entries(missingCount).map(([label, n]) => `${n} × ${label}`).join(', ')
      await notify(env, { userIds: mentors.map((m) => m.id), kind: 'trip', body: `${event.name} is ${when}: ${behind} of ${people.length} going still have items open (${detail}).`, url: `/season/${event.id}` })
    }
  }
  return sent
}
