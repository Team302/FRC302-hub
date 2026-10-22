// Meetings: plan an agenda with timeboxes, run it live (one active agenda item at a time, with
// the clock on screen), take attendance, capture decisions, and turn action items into board
// tasks with an owner and a due date before anyone leaves the room.
//
// Visibility: leadership meetings are leads and mentors only; mentor meetings are mentors only.
// Planning and running take a lead or the meeting's facilitator.
import { atLeast, requireRole } from '../lib/auth.js'
import { logActivity } from '../lib/activity.js'
import { badRequest, conflict, forbidden, json, newId, notFound, readBody } from '../lib/http.js'
import * as v from '../lib/validate.js'
import { createItem } from '../lib/items.js'

const KINDS = ['general', 'subteam', 'leadership', 'build', 'mentor']
const ATTENDANCE = ['present', 'late', 'excused', 'absent']
const LATE_AFTER_MIN = 10

const KIND_MIN_ROLE = { leadership: 'lead', mentor: 'admin' }
const canSee = (user, meeting) => atLeast(user, KIND_MIN_ROLE[meeting.kind] || 'member')
const canRun = (user, meeting) => atLeast(user, 'lead') || meeting.facilitator_id === user.id

function visibleKinds(user) {
  return KINDS.filter((k) => atLeast(user, KIND_MIN_ROLE[k] || 'member'))
}

async function getMeeting(env, user, id) {
  const meeting = await env.DB.prepare(
    `SELECT m.*, f.name AS facilitator_name FROM meetings m LEFT JOIN users f ON f.id = m.facilitator_id WHERE m.id = ?`
  ).bind(id).first()
  // Not visible is reported as not found, so a member can't probe for leadership meeting ids.
  if (!meeting || !canSee(user, meeting)) throw notFound('That meeting')
  return meeting
}

function requireRun(user, meeting) {
  if (!canRun(user, meeting)) throw forbidden('Only a lead or this meeting’s facilitator can do that.')
}

async function agendaOf(env, meetingId) {
  const { results } = await env.DB.prepare(
    `SELECT a.*, u.name AS owner_name FROM agenda_items a LEFT JOIN users u ON u.id = a.owner_id
      WHERE a.meeting_id = ? ORDER BY a.position`
  ).bind(meetingId).all()
  return results
}

export function meetingRoutes(router, authed) {
  router.get('/api/meetings', authed(async (request, env, user) => {
    const scope = new URL(request.url).searchParams.get('scope') === 'past' ? 'past' : 'upcoming'
    const kinds = visibleKinds(user)
    const { results } = await env.DB.prepare(
      `SELECT m.id, m.title, m.kind, m.subteam_id, m.starts_at, m.duration_min, m.location, m.status, m.facilitator_id,
              f.name AS facilitator_name,
              (SELECT COUNT(*) FROM agenda_items a WHERE a.meeting_id = m.id) AS agenda_count,
              (SELECT COALESCE(SUM(minutes), 0) FROM agenda_items a WHERE a.meeting_id = m.id) AS agenda_minutes,
              (SELECT COUNT(*) FROM attendance t WHERE t.meeting_id = m.id AND t.status IN ('present', 'late')) AS present_count,
              (SELECT COUNT(*) FROM live_items i WHERE i.source_meeting_id = m.id) AS action_count
         FROM meetings m LEFT JOIN users f ON f.id = m.facilitator_id
        WHERE m.kind IN (${kinds.map(() => '?').join(', ')})
          AND ${scope === 'past' ? "m.status = 'ended'" : "m.status <> 'ended'"}
        ORDER BY m.starts_at ${scope === 'past' ? 'DESC' : 'ASC'} LIMIT 100`
    ).bind(...kinds).all()
    return json({ meetings: results })
  }))

  // Creates one meeting, or a weekly series: `repeat_until` (YYYY-MM-DD) makes a copy every 7
  // days through that date (up to 52). Every meeting in the series gets the same agenda.
  router.post('/api/meetings', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const body = await readBody(request)
    const kind = v.oneOf(body.kind ?? 'general', 'Type', KINDS)
    if (kind === 'mentor') requireRole(user, 'admin', 'Only mentors can create mentor meetings.')
    const fields = {
      title: v.text(body.title, 'Title', { max: 120, required: true }),
      starts_at: v.dateTime(body.starts_at, 'Start', { required: true }),
      duration_min: v.int(body.duration_min ?? 60, 'Length', { min: 5, max: 600 }),
      location: v.text(body.location, 'Location', { max: 120 }) ?? '',
      facilitator_id: v.id(body.facilitator_id, 'Facilitator') ?? user.id,
      subteam_id: v.id(body.subteam_id, 'Subteam') ?? null,
    }
    const until = v.date(body.repeat_until, 'Repeat until')
    const starts = [fields.starts_at]
    if (until) {
      if (until < fields.starts_at.slice(0, 10)) throw badRequest('“Repeat until” is before the first meeting.')
      for (let t = Date.parse(fields.starts_at) + 7 * 86400000; new Date(t).toISOString().slice(0, 10) <= until; t += 7 * 86400000) {
        starts.push(new Date(t).toISOString())
        if (starts.length > 52) throw badRequest('A series can have up to 52 meetings. Pick an earlier end date.')
      }
    }
    const seriesId = starts.length > 1 ? newId('ser') : null

    const templateId = v.id(body.copy_agenda_from, 'Template')
    const agenda = templateId ? await agendaOf(env, (await getMeeting(env, user, templateId)).id) : []

    const ids = starts.map(() => newId('mtg'))
    const stmts = []
    starts.forEach((start, i) => {
      stmts.push(env.DB.prepare(
        `INSERT INTO meetings (id, title, kind, subteam_id, starts_at, duration_min, location, facilitator_id, created_by, series_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(ids[i], fields.title, kind, fields.subteam_id, start, fields.duration_min, fields.location, fields.facilitator_id, user.id, seriesId))
      for (const a of agenda) {
        stmts.push(env.DB.prepare('INSERT INTO agenda_items (id, meeting_id, title, owner_id, minutes, position) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(newId('agi'), ids[i], a.title, a.owner_id, a.minutes, a.position))
      }
    })
    await env.DB.batch(stmts)
    if (seriesId) await logActivity(env, request, user, { action: 'meeting.series', entity: 'meeting', entityId: ids[0], summary: `Scheduled ${starts.length} weekly “${fields.title}” meetings` })
    return json({ meeting: await getMeeting(env, user, ids[0]), created: ids.length }, { status: 201 })
  }))

  // Remove the rest of a series: this meeting and every later one that hasn't started.
  router.delete('/api/meetings/:id/following', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const meeting = await getMeeting(env, user, request.params.id)
    if (!meeting.series_id) throw badRequest('This meeting isn’t part of a series.')
    const res = await env.DB.prepare("DELETE FROM meetings WHERE series_id = ? AND starts_at >= ? AND status = 'scheduled'")
      .bind(meeting.series_id, meeting.starts_at).run()
    await logActivity(env, request, user, { action: 'meeting.delete', entity: 'meeting', entityId: meeting.id, summary: `Deleted ${res.meta.changes} meetings from the “${meeting.title}” series` })
    return json({ deleted: res.meta.changes })
  }))

  router.get('/api/meetings/:id', authed(async (request, env, user) => {
    const meeting = await getMeeting(env, user, request.params.id)
    const [agenda, { results: roster }, { results: actions }] = await Promise.all([
      agendaOf(env, meeting.id),
      env.DB.prepare(
        `SELECT u.id, u.name, u.subteam_id, t.status, t.recorded_at FROM users u
           LEFT JOIN attendance t ON t.user_id = u.id AND t.meeting_id = ?
          WHERE u.is_active = 1 OR t.status IS NOT NULL ORDER BY u.name COLLATE NOCASE`
      ).bind(meeting.id).all(),
      env.DB.prepare(
        `SELECT i.id, i.title, i.status, i.due_date, i.assignee_id, u.name AS assignee_name, i.board_id, b.name AS board_name
           FROM live_items i JOIN boards b ON b.id = i.board_id LEFT JOIN users u ON u.id = i.assignee_id
          WHERE i.source_meeting_id = ? ORDER BY i.created_at`
      ).bind(meeting.id).all(),
    ])
    return json({ meeting, agenda, attendance: roster, actions, can_run: canRun(user, meeting) })
  }))

  router.patch('/api/meetings/:id', authed(async (request, env, user) => {
    const meeting = await getMeeting(env, user, request.params.id)
    const body = await readBody(request)
    // Notes and decisions are what a note-taker types during the meeting; anyone running it may.
    requireRun(user, meeting)
    const next = {
      title: v.text(body.title, 'Title', { max: 120, required: body.title !== undefined }),
      kind: v.oneOf(body.kind, 'Type', KINDS),
      starts_at: v.dateTime(body.starts_at, 'Start'),
      duration_min: v.int(body.duration_min, 'Length', { min: 5, max: 600 }),
      location: v.text(body.location, 'Location', { max: 120 }),
      facilitator_id: v.id(body.facilitator_id, 'Facilitator'),
      notes: v.text(body.notes, 'Notes', { max: 20000 }),
      decisions: v.text(body.decisions, 'Decisions', { max: 10000 }),
    }
    if (next.kind === 'mentor' || (next.kind && meeting.kind === 'mentor')) requireRole(user, 'admin')
    const sets = []
    const binds = []
    for (const [col, val] of Object.entries(next)) if (val !== undefined) { sets.push(`${col} = ?`); binds.push(val) }
    if (!sets.length) throw badRequest('Nothing to change.')
    await env.DB.prepare(`UPDATE meetings SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, meeting.id).run()
    return json({ meeting: await getMeeting(env, user, meeting.id) })
  }))

  router.delete('/api/meetings/:id', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const meeting = await getMeeting(env, user, request.params.id)
    await env.DB.prepare('DELETE FROM meetings WHERE id = ?').bind(meeting.id).run()
    await logActivity(env, request, user, { action: 'meeting.delete', entity: 'meeting', entityId: meeting.id, summary: `Deleted meeting ${meeting.title}` })
    return json({ ok: true })
  }))

  // ── Agenda ──
  router.post('/api/meetings/:id/agenda', authed(async (request, env, user) => {
    const meeting = await getMeeting(env, user, request.params.id)
    requireRun(user, meeting)
    const body = await readBody(request)
    const title = v.text(body.title, 'Topic', { max: 160, required: true })
    const minutes = v.int(body.minutes ?? 5, 'Minutes', { min: 1, max: 240 })
    const ownerId = v.id(body.owner_id, 'Owner') ?? null
    const id = newId('agi')
    const pos = await env.DB.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM agenda_items WHERE meeting_id = ?').bind(meeting.id).first()
    await env.DB.prepare('INSERT INTO agenda_items (id, meeting_id, title, owner_id, minutes, position) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, meeting.id, title, ownerId, minutes, pos.p).run()
    return json({ agenda: await agendaOf(env, meeting.id) }, { status: 201 })
  }))

  router.patch('/api/agenda/:id', authed(async (request, env, user) => {
    const item = await env.DB.prepare('SELECT * FROM agenda_items WHERE id = ?').bind(request.params.id).first()
    if (!item) throw notFound('That agenda item')
    const meeting = await getMeeting(env, user, item.meeting_id)
    requireRun(user, meeting)
    const body = await readBody(request)
    const next = {
      title: v.text(body.title, 'Topic', { max: 160, required: body.title !== undefined }),
      minutes: v.int(body.minutes, 'Minutes', { min: 1, max: 240 }),
      owner_id: v.id(body.owner_id, 'Owner'),
      notes: v.text(body.notes, 'Notes', { max: 10000 }),
    }
    const sets = []
    const binds = []
    for (const [col, val] of Object.entries(next)) if (val !== undefined) { sets.push(`${col} = ?`); binds.push(val) }
    if (!sets.length) throw badRequest('Nothing to change.')
    await env.DB.prepare(`UPDATE agenda_items SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, item.id).run()
    return json({ agenda: await agendaOf(env, meeting.id) })
  }))

  router.delete('/api/agenda/:id', authed(async (request, env, user) => {
    const item = await env.DB.prepare('SELECT * FROM agenda_items WHERE id = ?').bind(request.params.id).first()
    if (!item) throw notFound('That agenda item')
    const meeting = await getMeeting(env, user, item.meeting_id)
    requireRun(user, meeting)
    await env.DB.prepare('DELETE FROM agenda_items WHERE id = ?').bind(item.id).run()
    return json({ agenda: await agendaOf(env, meeting.id) })
  }))

  router.post('/api/meetings/:id/agenda/order', authed(async (request, env, user) => {
    const meeting = await getMeeting(env, user, request.params.id)
    requireRun(user, meeting)
    const body = await readBody(request)
    if (!Array.isArray(body.ids) || body.ids.length > 200) throw badRequest('Send ids: the agenda item ids in order.')
    const current = await agendaOf(env, meeting.id)
    const known = new Set(current.map((a) => a.id))
    if (body.ids.length !== known.size || !body.ids.every((id) => known.has(id))) throw badRequest('Send every agenda item id exactly once.')
    await env.DB.batch(body.ids.map((id, i) => env.DB.prepare('UPDATE agenda_items SET position = ? WHERE id = ?').bind(i, id)))
    return json({ agenda: await agendaOf(env, meeting.id) })
  }))

  // ── Running it ──
  // start: meeting goes live and the first pending topic becomes active.
  // advance: the active topic is done (or skipped) and the next pending one becomes active.
  // end: whatever is active is closed and the meeting is over.
  async function activateNext(env, meetingId) {
    const next = await env.DB.prepare("SELECT id FROM agenda_items WHERE meeting_id = ? AND status = 'pending' ORDER BY position LIMIT 1").bind(meetingId).first()
    if (next) await env.DB.prepare("UPDATE agenda_items SET status = 'active', started_at = datetime('now') WHERE id = ?").bind(next.id).run()
  }

  router.post('/api/meetings/:id/start', authed(async (request, env, user) => {
    const meeting = await getMeeting(env, user, request.params.id)
    requireRun(user, meeting)
    if (meeting.status !== 'scheduled') throw conflict(meeting.status === 'live' ? 'This meeting is already running.' : 'This meeting has ended.')
    await env.DB.prepare("UPDATE meetings SET status = 'live', started_at = datetime('now') WHERE id = ?").bind(meeting.id).run()
    await activateNext(env, meeting.id)
    return json({ meeting: await getMeeting(env, user, meeting.id), agenda: await agendaOf(env, meeting.id) })
  }))

  router.post('/api/meetings/:id/advance', authed(async (request, env, user) => {
    const meeting = await getMeeting(env, user, request.params.id)
    requireRun(user, meeting)
    if (meeting.status !== 'live') throw conflict('Start the meeting first.')
    const body = await readBody(request).catch(() => ({}))
    const outcome = body.skip ? 'skipped' : 'done'
    await env.DB.prepare(`UPDATE agenda_items SET status = ?, ended_at = datetime('now') WHERE meeting_id = ? AND status = 'active'`).bind(outcome, meeting.id).run()
    await activateNext(env, meeting.id)
    return json({ agenda: await agendaOf(env, meeting.id) })
  }))

  router.post('/api/meetings/:id/end', authed(async (request, env, user) => {
    const meeting = await getMeeting(env, user, request.params.id)
    requireRun(user, meeting)
    if (meeting.status !== 'live') throw conflict('This meeting is not running.')
    await env.DB.batch([
      env.DB.prepare("UPDATE agenda_items SET status = 'done', ended_at = datetime('now') WHERE meeting_id = ? AND status = 'active'").bind(meeting.id),
      env.DB.prepare("UPDATE meetings SET status = 'ended', ended_at = datetime('now') WHERE id = ?").bind(meeting.id),
    ])
    await logActivity(env, request, user, { action: 'meeting.end', entity: 'meeting', entityId: meeting.id, summary: `Ended ${meeting.title}` })
    return json({ meeting: await getMeeting(env, user, meeting.id), agenda: await agendaOf(env, meeting.id) })
  }))

  // ── Attendance ──
  router.put('/api/meetings/:id/attendance/:userId', authed(async (request, env, user) => {
    const meeting = await getMeeting(env, user, request.params.id)
    requireRun(user, meeting)
    const body = await readBody(request)
    const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(request.params.userId).first()
    if (!target) throw notFound('That person')
    if (body.status === null) {
      await env.DB.prepare('DELETE FROM attendance WHERE meeting_id = ? AND user_id = ?').bind(meeting.id, target.id).run()
      return json({ ok: true })
    }
    const status = v.oneOf(body.status, 'Attendance', ATTENDANCE, { required: true })
    await env.DB.prepare(
      `INSERT INTO attendance (meeting_id, user_id, status, recorded_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(meeting_id, user_id) DO UPDATE SET status = excluded.status, recorded_by = excluded.recorded_by, recorded_at = datetime('now')`
    ).bind(meeting.id, target.id, status, user.id).run()
    return json({ ok: true })
  }))

  // Self check-in, only while the meeting is live. "late" after LATE_AFTER_MIN past the start.
  // This trusts the member's own device — it proves they had the app open, not that they are in
  // the room. Whoever runs the meeting can correct it.
  router.post('/api/meetings/:id/checkin', authed(async (request, env, user) => {
    const meeting = await getMeeting(env, user, request.params.id)
    if (meeting.status !== 'live') throw conflict('Check-in opens when the meeting starts.')
    const late = Date.now() > Date.parse(meeting.starts_at) + LATE_AFTER_MIN * 60 * 1000
    await env.DB.prepare(
      `INSERT INTO attendance (meeting_id, user_id, status, recorded_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(meeting_id, user_id) DO NOTHING`
    ).bind(meeting.id, user.id, late ? 'late' : 'present', user.id).run()
    const row = await env.DB.prepare('SELECT status FROM attendance WHERE meeting_id = ? AND user_id = ?').bind(meeting.id, user.id).first()
    return json({ status: row.status })
  }))

  // ── Action items → board tasks ──
  router.post('/api/meetings/:id/actions', authed(async (request, env, user) => {
    const meeting = await getMeeting(env, user, request.params.id)
    requireRun(user, meeting)
    const body = await readBody(request)
    const item = await createItem(env, user, {
      board_id: v.id(body.board_id, 'Board', { nullable: false }),
      group_id: v.id(body.group_id, 'Group', { nullable: false }),
      title: v.text(body.title, 'Action', { max: 200, required: true }),
      assignee_id: v.id(body.assignee_id, 'Owner'),
      due_date: v.date(body.due_date, 'Due date'),
      priority: 'medium',
      description: `From meeting: ${meeting.title}`,
      source_meeting_id: meeting.id,
    })
    return json({ item }, { status: 201 })
  }))

  // Plain-text recap to paste into Slack/Discord/email.
  router.get('/api/meetings/:id/recap', authed(async (request, env, user) => {
    const meeting = await getMeeting(env, user, request.params.id)
    const agenda = await agendaOf(env, meeting.id)
    const { results: present } = await env.DB.prepare(
      "SELECT u.name, t.status FROM attendance t JOIN users u ON u.id = t.user_id WHERE t.meeting_id = ? AND t.status IN ('present', 'late') ORDER BY u.name COLLATE NOCASE"
    ).bind(meeting.id).all()
    const { results: actions } = await env.DB.prepare(
      'SELECT i.title, i.due_date, u.name AS assignee_name FROM live_items i LEFT JOIN users u ON u.id = i.assignee_id WHERE i.source_meeting_id = ? ORDER BY i.created_at'
    ).bind(meeting.id).all()
    const lines = [`# ${meeting.title} — ${meeting.starts_at.slice(0, 10)}`, '']
    lines.push(`Attendance: ${present.length} (${present.map((p) => p.name + (p.status === 'late' ? ' (late)' : '')).join(', ') || 'none recorded'})`, '')
    if (agenda.length) {
      lines.push('## Agenda')
      for (const a of agenda) {
        lines.push(`- ${a.status === 'skipped' ? '~~' : ''}${a.title}${a.status === 'skipped' ? '~~ (skipped)' : ''}${a.owner_name ? ` — ${a.owner_name}` : ''}`)
        if (a.notes) for (const n of a.notes.split('\n').filter(Boolean)) lines.push(`  - ${n}`)
      }
      lines.push('')
    }
    if (meeting.decisions) lines.push('## Decisions', ...meeting.decisions.split('\n').filter(Boolean).map((d) => `- ${d.replace(/^[-*]\s*/, '')}`), '')
    if (actions.length) lines.push('## Action items', ...actions.map((a) => `- [ ] ${a.title} — ${a.assignee_name || 'unassigned'}${a.due_date ? `, due ${a.due_date}` : ''}`), '')
    if (meeting.notes) lines.push('## Notes', meeting.notes, '')
    return json({ markdown: lines.join('\n') })
  }))
}
