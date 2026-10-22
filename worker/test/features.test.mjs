import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam } from './harness.mjs'
import { buildCalendar } from '../src/lib/ics.js'

const feedPath = (url) => new URL(url).pathname

test('calendar feed: private URL, visibility-filtered meetings, my due tasks, replaceable', async () => {
  const app = await makeTeam()
  const soon = new Date(Date.now() + 86400000).toISOString()
  await app.call('lead', 'POST', '/api/meetings', { title: 'All hands', starts_at: soon })
  await app.call('lead', 'POST', '/api/meetings', { title: 'Captains only', kind: 'leadership', starts_at: soon })
  const b = (await app.call('lead', 'POST', '/api/boards', { name: 'Robot' })).data.board
  const g = (await app.call('lead', 'GET', `/api/boards/${b.id}`)).data.groups[0]
  await app.call('lead', 'POST', '/api/items', { board_id: b.id, group_id: g.id, title: 'Gearbox, v2; final', assignee_id: 'usr_alex', due_date: '2027-01-10' })

  assert.equal((await app.call('alex', 'GET', '/api/me/calendar')).data.enabled, false)
  const { url } = (await app.call('alex', 'POST', '/api/me/calendar')).data
  assert.match(url, /\/api\/calendar\/[0-9a-f]{64}\.ics$/)
  // The token itself is never stored, only its hash.
  const token = url.match(/([0-9a-f]{64})\.ics/)[1]
  assert.ok(!JSON.stringify(app.sql('SELECT * FROM users')).includes(token))

  const feed = await app.call(null, 'GET', feedPath(url))
  assert.equal(feed.status, 200)
  assert.equal(feed.headers.get('Content-Type'), 'text/calendar; charset=utf-8')
  assert.match(feed.data, /SUMMARY:All hands/)
  assert.doesNotMatch(feed.data, /Captains only/)
  assert.match(feed.data, /SUMMARY:Due: Gearbox\\, v2\\; final/)
  assert.match(feed.data, /DTSTART;VALUE=DATE:20270110/)

  // A new URL kills the old one; turning it off kills both.
  const second = (await app.call('alex', 'POST', '/api/me/calendar')).data.url
  assert.equal((await app.call(null, 'GET', feedPath(url))).status, 404)
  assert.equal((await app.call(null, 'GET', feedPath(second))).status, 200)
  await app.call('alex', 'DELETE', '/api/me/calendar')
  assert.equal((await app.call(null, 'GET', feedPath(second))).status, 404)
  // Removed people's feeds stop working.
  const third = (await app.call('sam', 'POST', '/api/me/calendar')).data.url
  app.sql("UPDATE users SET is_active = 0 WHERE id = 'usr_sam'")
  assert.equal((await app.call(null, 'GET', feedPath(third))).status, 404)
  assert.equal((await app.call(null, 'GET', '/api/calendar/nope.ics')).status, 404)
})

test('ics: lines are folded at 75 octets without splitting characters', () => {
  const ics = buildCalendar({ name: 'x', events: [{ uid: 'a', title: 'é'.repeat(100), date: '2027-01-01' }] })
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line)
  assert.ok(ics.endsWith('\r\n'))
})

test('recurring meetings: weekly series with copied agenda; delete the rest of a series', async () => {
  const app = await makeTeam()
  const first = (await app.call('lead', 'POST', '/api/meetings', { title: 'Week 0', starts_at: '2027-01-05T23:00:00Z' })).data.meeting
  await app.call('lead', 'POST', `/api/meetings/${first.id}/agenda`, { title: 'Wins', minutes: 5 })
  const res = await app.call('lead', 'POST', '/api/meetings', { title: 'Weekly all-hands', starts_at: '2027-01-12T23:00:00Z', repeat_until: '2027-02-09', copy_agenda_from: first.id })
  assert.equal(res.status, 201)
  assert.equal(res.data.created, 5) // Jan 12, 19, 26, Feb 2, 9
  const series = app.sql("SELECT id, starts_at FROM meetings WHERE title = 'Weekly all-hands' ORDER BY starts_at")
  assert.deepEqual(series.map((m) => m.starts_at.slice(0, 10)), ['2027-01-12', '2027-01-19', '2027-01-26', '2027-02-02', '2027-02-09'])
  assert.equal(app.sql('SELECT COUNT(*) AS n FROM agenda_items WHERE meeting_id IN (SELECT id FROM meetings WHERE series_id IS NOT NULL)')[0].n, 5)
  assert.equal((await app.call('lead', 'POST', '/api/meetings', { title: 'x', starts_at: '2027-01-12T23:00:00Z', repeat_until: '2029-01-01' })).status, 400)
  assert.equal((await app.call('lead', 'POST', '/api/meetings', { title: 'x', starts_at: '2027-01-12T23:00:00Z', repeat_until: '2026-01-01' })).status, 400)

  const del = await app.call('lead', 'DELETE', `/api/meetings/${series[2].id}/following`)
  assert.equal(del.data.deleted, 3)
  assert.equal(app.sql("SELECT COUNT(*) AS n FROM meetings WHERE title = 'Weekly all-hands'")[0].n, 2)
  assert.equal((await app.call('alex', 'DELETE', `/api/meetings/${series[0].id}/following`)).status, 403)
})

async function runMeeting(app, title, { minutes = 60, kind = 'general', subteam_id = null, marks = {} } = {}) {
  const m = (await app.call('lead', 'POST', '/api/meetings', { title, kind, subteam_id, starts_at: '2026-10-01T23:00:00Z', duration_min: minutes })).data.meeting
  await app.call('lead', 'POST', `/api/meetings/${m.id}/agenda`, { title: 'Topic' })
  await app.call('lead', 'POST', `/api/meetings/${m.id}/start`)
  for (const [uid, status] of Object.entries(marks)) await app.call('lead', 'PUT', `/api/meetings/${m.id}/attendance/${uid}`, { status })
  await app.call('lead', 'POST', `/api/meetings/${m.id}/end`)
  // Pretend it ran for exactly its scheduled length.
  app.sql("UPDATE meetings SET started_at = '2026-10-01 23:00:00', ended_at = datetime('2026-10-01 23:00:00', ? || ' minutes') WHERE id = ?", String(minutes), m.id)
  return m
}

test('attendance report: expected, attended, excused, hours and rate', async () => {
  const app = await makeTeam()
  await runMeeting(app, 'Build 1', { minutes: 180, kind: 'build', marks: { usr_alex: 'present', usr_sam: 'late' } })
  await runMeeting(app, 'Build 2', { minutes: 120, kind: 'build', marks: { usr_alex: 'present', usr_sam: 'excused' } })
  await runMeeting(app, 'Mech subteam', { minutes: 60, kind: 'subteam', subteam_id: 'st_mech', marks: { usr_alex: 'absent' } })
  await runMeeting(app, 'Captains', { minutes: 30, kind: 'leadership', marks: { usr_lead: 'present' } })

  const res = await app.call('lead', 'GET', '/api/reports/attendance?from=2026-09-01&to=2026-12-31')
  assert.equal(res.status, 200)
  const row = (id) => res.data.people.find((p) => p.user_id === id)
  // Alex (mech): expected at both builds + the mech meeting; attended 2; 5 hours.
  assert.deepEqual([row('usr_alex').expected, row('usr_alex').attended, row('usr_alex').hours, row('usr_alex').rate], [3, 2, 5, 66.7])
  // Sam (elec): not expected at the mech meeting; one late, one excused → 1 of 1 = 100%.
  assert.deepEqual([row('usr_sam').expected, row('usr_sam').attended, row('usr_sam').late, row('usr_sam').excused, row('usr_sam').rate, row('usr_sam').hours], [2, 1, 1, 1, 100, 3])
  // Lead is expected at the leadership meeting too.
  assert.equal(row('usr_lead').expected, 3)
  assert.equal(res.data.meeting_count, 4)

  assert.equal((await app.call('alex', 'GET', '/api/reports/attendance')).status, 403)
  const mine = await app.call('alex', 'GET', '/api/me/attendance?from=2026-09-01&to=2026-12-31')
  assert.equal(mine.data.me.hours, 5)
  assert.equal(mine.data.people.length, 1)
})

test('attendance: a meeting clicked through in seconds counts its scheduled length', async () => {
  const app = await makeTeam()
  const m = await runMeeting(app, 'Quick', { minutes: 90, kind: 'build', marks: { usr_alex: 'present' } })
  app.sql("UPDATE meetings SET started_at = '2026-10-01 23:00:00', ended_at = '2026-10-01 23:00:20' WHERE id = ?", m.id)
  const res = await app.call('lead', 'GET', '/api/reports/attendance?from=2026-09-01&to=2026-12-31')
  assert.equal(res.data.people.find((p) => p.user_id === 'usr_alex').hours, 1.5)
})

test('attendance CSV escapes spreadsheet formulas', async () => {
  const app = await makeTeam()
  app.sql("UPDATE users SET name = '=HYPERLINK(\"x\")' WHERE id = 'usr_alex'")
  const res = await app.call('lead', 'GET', '/api/reports/attendance.csv?from=2026-09-01&to=2026-12-31')
  assert.equal(res.status, 200)
  assert.match(res.headers.get('Content-Disposition'), /attendance-2026-09-01-to-2026-12-31\.csv/)
  assert.match(res.data, /"'=HYPERLINK\(""x""\)"/)
})

test('purchasing template', async () => {
  const app = await makeTeam()
  const b = (await app.call('lead', 'POST', '/api/boards', { name: 'Parts', template: 'purchasing' })).data.board
  const full = (await app.call('lead', 'GET', `/api/boards/${b.id}`)).data
  assert.deepEqual(full.groups.map((g) => g.name), ['Requested', 'Approved', 'Ordered', 'Received'])
  assert.equal(full.columns.find((c) => c.title === 'Total cost').settings.unit, '$')
  assert.deepEqual(full.board.hidden_builtins, ['priority'])
})

test('season events: leads manage, everyone sees upcoming, they appear in calendar feeds', async () => {
  const app = await makeTeam()
  assert.equal((await app.call('alex', 'POST', '/api/events', { name: 'x', starts_on: '2099-01-01' })).status, 403)
  const ev = await app.call('lead', 'POST', '/api/events', { name: 'Lake City District', kind: 'competition', starts_on: '2099-03-05', ends_on: '2099-03-07', location: 'Lake City, MI', url: 'https://frc-events.firstinspires.org' })
  assert.equal(ev.status, 201)
  await app.call('lead', 'POST', '/api/events', { name: 'Old event', starts_on: '2000-01-01' })
  assert.equal((await app.call('lead', 'POST', '/api/events', { name: 'Bad', starts_on: '2099-03-05', ends_on: '2099-03-01' })).status, 400)
  assert.equal((await app.call('lead', 'POST', '/api/events', { name: 'Bad', starts_on: '2099-03-05', url: 'javascript:alert(1)' })).status, 400)
  const upcoming = await app.call('alex', 'GET', '/api/events')
  assert.deepEqual(upcoming.data.events.map((e) => e.name), ['Lake City District'])
  assert.equal((await app.call('alex', 'GET', '/api/events?scope=all')).data.events.length, 2)
  const { url } = (await app.call('alex', 'POST', '/api/me/calendar')).data
  const feed = await app.call(null, 'GET', new URL(url).pathname)
  assert.match(feed.data, /SUMMARY:Lake City District/)
  assert.match(feed.data, /DTSTART;VALUE=DATE:20990305\r\nDTEND;VALUE=DATE:20990308/)
  assert.equal((await app.call('lead', 'PATCH', `/api/events/${ev.data.event.id}`, { name: 'Lake City District Event' })).data.event.name, 'Lake City District Event')
  assert.equal((await app.call('lead', 'DELETE', `/api/events/${ev.data.event.id}`)).status, 200)
})

test('workload: open, overdue, due this week, stuck and per-board counts per person', async () => {
  const app = await makeTeam()
  const b = (await app.call('lead', 'POST', '/api/boards', { name: 'Robot' })).data.board
  const g = (await app.call('lead', 'GET', `/api/boards/${b.id}`)).data.groups[0]
  const add = (fields) => app.call('lead', 'POST', '/api/items', { board_id: b.id, group_id: g.id, title: 't', ...fields })
  const soon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
  await add({ assignee_id: 'usr_alex', due_date: '2000-01-01', priority: 'critical' })
  await add({ assignee_id: 'usr_alex', due_date: soon, status: 'stuck' })
  await add({ assignee_id: 'usr_alex', status: 'done' })
  await add({})
  const res = await app.call('lead', 'GET', '/api/reports/workload')
  const alex = res.data.people.find((p) => p.user_id === 'usr_alex')
  assert.deepEqual([alex.open, alex.overdue, alex.due_week, alex.stuck, alex.high], [2, 1, 1, 1, 1])
  assert.deepEqual(alex.boards, [{ board_id: b.id, name: 'Robot', color: 'green', open: 2 }])
  assert.equal(res.data.unassigned.open, 1)
  assert.equal((await app.call('alex', 'GET', '/api/reports/workload')).status, 403)
})
