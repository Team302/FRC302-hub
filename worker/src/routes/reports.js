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
import { badRequest, json } from '../lib/http.js'
import * as v from '../lib/validate.js'

const KIND_MIN_ROLE = { leadership: 'lead', mentor: 'admin' }

// The FRC season runs from late summer: default range is Aug 1 of the current season to today.
function seasonStart(now = new Date()) {
  const year = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
  return `${year}-08-01`
}

function meetingHours(m) {
  if (m.started_at && m.ended_at) {
    const ms = Date.parse(`${m.ended_at.replace(' ', 'T')}Z`) - Date.parse(`${m.started_at.replace(' ', 'T')}Z`)
    if (ms >= 15 * 60000 && ms < 24 * 3600 * 1000) return ms / 3600000
  }
  return m.duration_min / 60
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
      `SELECT t.meeting_id, t.user_id, t.status FROM attendance t JOIN meetings m ON m.id = t.meeting_id
        WHERE m.status = 'ended' AND substr(m.starts_at, 1, 10) >= ? AND substr(m.starts_at, 1, 10) <= ?`
    ).bind(from, to).all(),
  ])
  const mark = new Map(marks.map((r) => [`${r.meeting_id}|${r.user_id}`, r.status]))
  const rows = people.map((p) => {
    let expected = 0; let attended = 0; let late = 0; let excused = 0; let hours = 0
    for (const m of meetings) {
      const status = mark.get(`${m.id}|${p.id}`)
      // Someone who came to a meeting they weren't expected at still gets the hours.
      if (!expectedAt(p, m) && status !== 'present' && status !== 'late') continue
      if (expectedAt(p, m)) expected++
      if (status === 'present' || status === 'late') { attended++; hours += meetingHours(m) }
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

export function reportRoutes(router, authed) {
  router.get('/api/reports/attendance', authed(async (request, env, user) => {
    requireRole(user, 'lead', 'Only leads and mentors can see everyone’s attendance.')
    return json(await attendanceReport(env, range(request)))
  }))

  router.get('/api/me/attendance', authed(async (request, env, user) => {
    const report = await attendanceReport(env, { ...range(request), userIds: [user.id] })
    return json({ ...report, me: report.people[0] || null })
  }))

  // CSV for spreadsheets. Names are escaped against formula injection (a cell starting with
  // = + - @ is prefixed with a quote), since this file is opened in Excel/Sheets.
  router.get('/api/reports/attendance.csv', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const report = await attendanceReport(env, range(request))
    const { results: subteams } = await env.DB.prepare('SELECT id, name FROM subteams').all()
    const st = Object.fromEntries(subteams.map((s) => [s.id, s.name]))
    const cell = (val) => {
      let s = val === null || val === undefined ? '' : String(val)
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [['Name', 'Role', 'Subteam', 'Meetings expected', 'Attended', 'Late', 'Excused', 'Attendance %', 'Hours'].join(',')]
    for (const r of report.people) lines.push([r.name, r.role, st[r.subteam_id] || '', r.expected, r.attended, r.late, r.excused, r.rate ?? '', r.hours].map(cell).join(','))
    return new Response(`${lines.join('\r\n')}\r\n`, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="attendance-${report.from}-to-${report.to}.csv"` },
    })
  }))
}
