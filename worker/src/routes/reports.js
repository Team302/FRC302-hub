// Attendance and hours. FRC teams use these for lettering, travel eligibility and grant reports.
//
// For each person, over meetings that have ENDED in the range:
//   expected  meetings they were expected at: all-team and build sessions; subteam meetings for
//             their own subteam (or with no subteam); leadership meetings if lead+; mentor
//             meetings if mentor. Excused absences don't count against them.
//   attended  present or late
//   hours     for each attended meeting, its real length (started → ended) when it was run in
//             the app for at least 15 minutes, otherwise its scheduled length (a meeting someone
//             only clicked through at the end shouldn't count as zero hours)
//   rate      attended / (expected − excused)
// Leads and mentors see everyone; members see only themselves.
import { atLeast, requireRole } from '../lib/auth.js'
import { csvResponse } from '../lib/csv.js'
import { badRequest, json } from '../lib/http.js'
import * as v from '../lib/validate.js'

const KIND_MIN_ROLE = { leadership: 'lead', mentor: 'admin' }

// The FRC season runs from late summer: default range is Aug 1 of the current season to today.
function seasonStart(now = new Date()) {
  const year = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
  return `${year}-08-01`
}

const at = (sqlTime) => Date.parse(`${sqlTime.replace(' ', 'T')}Z`)

// The meeting's real length when it was run in the app (at least 15 minutes, so a meeting
// clicked through afterwards still counts its scheduled length), else its scheduled length.
function realSpan(m) {
  if (!m.started_at || !m.ended_at) return null
  const ms = at(m.ended_at) - at(m.started_at)
  return ms >= 15 * 60000 && ms < 24 * 3600 * 1000 ? [at(m.started_at), at(m.ended_at)] : null
}
function meetingHours(m) {
  const span = realSpan(m)
  return span ? (span[1] - span[0]) / 3600000 : m.duration_min / 60
}

// One person's hours at one meeting: from when they checked in (or the start) to when they
// checked out (or the end). Marks without times, set by the runner, count the whole meeting.
export function personHours(m, mark) {
  const span = realSpan(m)
  if (!span || (!mark.checked_in_at && !mark.checked_out_at)) return meetingHours(m)
  const start = Math.max(span[0], mark.checked_in_at ? at(mark.checked_in_at) : span[0])
  const end = Math.min(span[1], mark.checked_out_at ? at(mark.checked_out_at) : span[1])
  return Math.max(0, end - start) / 3600000
}

const expectedAt = (person, m) => {
  if (!atLeast(person, KIND_MIN_ROLE[m.kind] || 'member')) return false
  if (m.kind === 'subteam' && m.subteam_id && m.subteam_id !== person.subteam_id) return false
  return true
}

export async function attendanceReport(env, { from, to, userIds = null }) {
  const [{ results: people }, { results: meetings }, { results: marks }] = await Promise.all([
    env.DB.prepare(`SELECT id, name, role, subteam_id, is_active FROM users WHERE is_active = 1 ${userIds ? `AND id IN (${userIds.map(() => '?').join(', ')})` : ''} ORDER BY name COLLATE NOCASE`)
      .bind(...(userIds || [])).all(),
    env.DB.prepare(
      `SELECT id, title, kind, subteam_id, starts_at, duration_min, started_at, ended_at FROM meetings
        WHERE status = 'ended' AND substr(starts_at, 1, 10) >= ? AND substr(starts_at, 1, 10) <= ? ORDER BY starts_at`
    ).bind(from, to).all(),
    env.DB.prepare(
      `SELECT t.meeting_id, t.user_id, t.status, t.checked_in_at, t.checked_out_at FROM attendance t JOIN meetings m ON m.id = t.meeting_id
        WHERE m.status = 'ended' AND substr(m.starts_at, 1, 10) >= ? AND substr(m.starts_at, 1, 10) <= ?`
    ).bind(from, to).all(),
  ])
  const mark = new Map(marks.map((r) => [`${r.meeting_id}|${r.user_id}`, r]))
  const rows = people.map((p) => {
    let expected = 0; let attended = 0; let late = 0; let excused = 0; let hours = 0
    for (const m of meetings) {
      const row = mark.get(`${m.id}|${p.id}`)
      const status = row?.status
      // Someone who came to a meeting they weren't expected at still gets the hours.
      if (!expectedAt(p, m) && status !== 'present' && status !== 'late') continue
      if (expectedAt(p, m)) expected++
      if (status === 'present' || status === 'late') { attended++; hours += personHours(m, row) }
      if (status === 'late') late++
      if (status === 'excused') excused++
    }
    const base = expected - excused
    return {
      user_id: p.id, name: p.name, role: p.role, subteam_id: p.subteam_id,
      expected, attended, late, excused, hours: Math.round(hours * 10) / 10,
      rate: base > 0 ? Math.round((Math.min(attended, base) / base) * 1000) / 10 : null,
    }
  })
  return { from, to, meeting_count: meetings.length, people: rows }
}

function range(request) {
  const params = new URL(request.url).searchParams
  const from = v.date(params.get('from') || undefined, 'From') || seasonStart()
  const to = v.date(params.get('to') || undefined, 'To') || new Date().toISOString().slice(0, 10)
  if (to < from) throw badRequest('The end date is before the start date.')
  return { from, to }
}

// Who has what: open tasks (and subitems) per active person across all active boards.
export async function workloadReport(env) {
  const [{ results: people }, { results: rows }] = await Promise.all([
    env.DB.prepare('SELECT id, name, role, subteam_id FROM users WHERE is_active = 1 ORDER BY name COLLATE NOCASE').all(),
    env.DB.prepare(
      `SELECT i.assignee_id, i.reviewer_id, i.board_id, b.name AS board_name, b.color AS board_color, i.status, i.priority, i.due_date
         FROM live_items i JOIN boards b ON b.id = i.board_id
        WHERE i.status <> 'done' AND b.is_archived = 0`
    ).all(),
  ])
  const today = new Date().toISOString().slice(0, 10)
  const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const blank = () => ({ open: 0, overdue: 0, due_week: 0, stuck: 0, high: 0, reviewing: 0, boards: {} })
  const by = Object.fromEntries(people.map((p) => [p.id, blank()]))
  const unassigned = blank()
  for (const r of rows) {
    // Waiting on someone's review counts against the reviewer too.
    if (r.status === 'review' && r.reviewer_id && by[r.reviewer_id]) by[r.reviewer_id].reviewing++
    const w = (r.assignee_id && by[r.assignee_id]) || (r.assignee_id ? null : unassigned)
    if (!w) continue // owned by someone no longer on the team
    w.open++
    if (r.due_date && r.due_date < today) w.overdue++
    else if (r.due_date && r.due_date <= week) w.due_week++
    if (r.status === 'stuck') w.stuck++
    if (r.priority === 'high' || r.priority === 'critical') w.high++
    const b = (w.boards[r.board_id] ||= { board_id: r.board_id, name: r.board_name, color: r.board_color, open: 0 })
    b.open++
  }
  const shape = (w) => ({ ...w, boards: Object.values(w.boards).sort((a, b) => b.open - a.open) })
  return {
    people: people.map((p) => ({ user_id: p.id, name: p.name, role: p.role, subteam_id: p.subteam_id, ...shape(by[p.id]) })),
    unassigned: shape(unassigned),
  }
}

export function reportRoutes(router, authed) {
  router.get('/api/reports/workload', authed(async (_req, env, user) => {
    requireRole(user, 'lead', 'Only leads and mentors can see everyone’s workload.')
    return json(await workloadReport(env))
  }))

  router.get('/api/reports/attendance', authed(async (request, env, user) => {
    requireRole(user, 'lead', 'Only leads and mentors can see everyone’s attendance.')
    return json(await attendanceReport(env, range(request)))
  }))

  router.get('/api/me/attendance', authed(async (request, env, user) => {
    const report = await attendanceReport(env, { ...range(request), userIds: [user.id] })
    return json({ ...report, me: report.people[0] || null })
  }))

  // CSV for spreadsheets (lib/csv.js escapes against formula injection).
  router.get('/api/reports/attendance.csv', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const report = await attendanceReport(env, range(request))
    const { results: subteams } = await env.DB.prepare('SELECT id, name FROM subteams').all()
    const st = Object.fromEntries(subteams.map((s) => [s.id, s.name]))
    const rows = [['Name', 'Role', 'Subteam', 'Meetings expected', 'Attended', 'Late', 'Excused', 'Attendance %', 'Hours']]
    for (const r of report.people) rows.push([r.name, r.role, st[r.subteam_id] || '', r.expected, r.attended, r.late, r.excused, r.rate ?? '', r.hours])
    return csvResponse(rows, `attendance-${report.from}-to-${report.to}.csv`)
  }))
}
