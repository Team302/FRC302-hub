import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam } from './harness.mjs'
import { selfServiceOpen } from '../src/routes/trips.js'

const isoDay = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
const notes = (app, who) => app.sql('SELECT kind, body FROM notifications WHERE user_id = ? ORDER BY id', app.users[who].id)

async function trip(app, extra = {}) {
  const event = (await app.call('lead', 'POST', '/api/events', { name: 'Lake City District', kind: 'competition', starts_on: isoDay(20), ends_on: isoDay(22) })).data.event
  const opened = await app.call('lead', 'PATCH', `/api/events/${event.id}/roster`, { roster_open: true, ...extra })
  assert.equal(opened.status, 200)
  return { event, view: opened.data }
}

test('sign-up window: open, before the closing date, before the event', () => {
  const e = { roster_open: 1, starts_on: '2027-03-10', signup_closes_on: '2027-03-01' }
  assert.equal(selfServiceOpen(e, '2027-02-28'), true)
  assert.equal(selfServiceOpen(e, '2027-03-01'), true)
  assert.equal(selfServiceOpen(e, '2027-03-02'), false)
  assert.equal(selfServiceOpen({ ...e, signup_closes_on: null }, '2027-03-09'), true)
  assert.equal(selfServiceOpen({ ...e, signup_closes_on: null }, '2027-03-10'), false)
  assert.equal(selfServiceOpen({ ...e, roster_open: 0 }, '2027-02-01'), false)
})

test('opening a roster adds the usual checklist; only leads open it', async () => {
  const app = await makeTeam()
  const event = (await app.call('lead', 'POST', '/api/events', { name: 'Kickoff', starts_on: isoDay(5) })).data.event
  assert.equal((await app.call('alex', 'PATCH', `/api/events/${event.id}/roster`, { roster_open: true })).status, 403)
  assert.equal((await app.call('alex', 'POST', `/api/events/${event.id}/roster`, {})).status, 403, 'not open yet')
  const { view } = await trip(app)
  assert.deepEqual(view.requirements.map((r) => [r.label, r.mentor_only]), [['Permission slip', 1], ['Trip fee paid', 1], ['Medical & emergency form', 1]])
  assert.equal(view.can_self_serve, true)
  assert.equal((await app.call('lead', 'PATCH', `/api/events/${view.event.id}/roster`, { capacity: 0 })).status, 400)
  assert.equal((await app.call('lead', 'PATCH', `/api/events/${view.event.id}/roster`, { signup_closes_on: isoDay(40) })).status, 400, 'closes after the event')
})

test('cap and waitlist: self sign-up fills places, then waits; dropping out promotes the first in line', async () => {
  const app = await makeTeam()
  const { event } = await trip(app, { capacity: 1 })
  const a = await app.call('alex', 'POST', `/api/events/${event.id}/roster`, {})
  assert.equal(a.status, 201)
  assert.equal(a.data.me.status, 'going')
  const s = await app.call('sam', 'POST', `/api/events/${event.id}/roster`, {})
  assert.equal(s.data.me.status, 'waitlist')
  assert.equal((await app.call('sam', 'POST', `/api/events/${event.id}/roster`, {})).status, 409)
  const listed = (await app.call('mentor', 'GET', '/api/events')).data.events.find((e) => e.id === event.id)
  assert.equal(listed.going_count, 1)
  assert.equal(listed.waitlist_count, 1)
  assert.equal((await app.call('sam', 'GET', '/api/events')).data.events.find((e) => e.id === event.id).my_status, 'waitlist')

  // Alex drops out; Sam is told and moves up.
  assert.equal((await app.call('alex', 'DELETE', `/api/events/${event.id}/roster/${app.users.alex.id}`)).status, 200)
  const view = (await app.call('sam', 'GET', `/api/events/${event.id}/roster`)).data
  assert.equal(view.me.status, 'going')
  assert.match(notes(app, 'sam').at(-1).body, /A place opened up: you’re going to Lake City District/)

  // A lead can add someone past the cap; raising the cap lets the waitlist in.
  await app.call('alex', 'POST', `/api/events/${event.id}/roster`, {})
  assert.equal((await app.call('lead', 'GET', `/api/events/${event.id}/roster`)).data.summary.waitlist, 1)
  await app.call('lead', 'PATCH', `/api/events/${event.id}/roster`, { capacity: 5 })
  assert.equal((await app.call('lead', 'GET', `/api/events/${event.id}/roster`)).data.summary.going, 2)
  const added = await app.call('lead', 'POST', `/api/events/${event.id}/roster`, { user_id: app.users.mentor.id })
  assert.equal(added.status, 201)
  assert.match(notes(app, 'mentor').at(-1).body, /added you to the list for Lake City District/)
})

test('members only change their own place, and only while sign-up is open', async () => {
  const app = await makeTeam()
  const { event } = await trip(app)
  assert.equal((await app.call('alex', 'POST', `/api/events/${event.id}/roster`, { user_id: app.users.sam.id })).status, 403)
  await app.call('sam', 'POST', `/api/events/${event.id}/roster`, {})
  assert.equal((await app.call('alex', 'DELETE', `/api/events/${event.id}/roster/${app.users.sam.id}`)).status, 403)
  assert.equal((await app.call('alex', 'PATCH', `/api/events/${event.id}/roster/${app.users.sam.id}`, { note: 'x' })).status, 403)
  assert.equal((await app.call('sam', 'PATCH', `/api/events/${event.id}/roster/${app.users.sam.id}`, { status: 'going' })).status, 403, 'members can’t set status')
  assert.equal((await app.call('sam', 'PATCH', `/api/events/${event.id}/roster/${app.users.sam.id}`, { note: 'Leaving Saturday at noon' })).status, 200)

  // Close sign-up: no more self-service either way.
  await app.call('lead', 'PATCH', `/api/events/${event.id}/roster`, { roster_open: false })
  assert.equal((await app.call('alex', 'POST', `/api/events/${event.id}/roster`, {})).status, 403)
  const leave = await app.call('sam', 'DELETE', `/api/events/${event.id}/roster/${app.users.sam.id}`)
  assert.equal(leave.status, 403)
  assert.match(leave.data.error, /ask a lead or mentor/)
  assert.equal((await app.call('lead', 'DELETE', `/api/events/${event.id}/roster/${app.users.sam.id}`)).status, 200)
  assert.match(notes(app, 'sam').at(-1).body, /took you off the list/)
})

test('checklists: private to the person and leads; mentor-only items need a mentor', async () => {
  const app = await makeTeam()
  const { event, view } = await trip(app)
  const slip = view.requirements[0].id
  await app.call('alex', 'POST', `/api/events/${event.id}/roster`, { note: 'Needs a ride' })
  await app.call('sam', 'POST', `/api/events/${event.id}/roster`, {})

  assert.equal((await app.call('alex', 'PUT', `/api/events/${event.id}/checks`, { requirement_id: slip, user_id: app.users.alex.id, done: true })).status, 403)
  const leadTry = await app.call('lead', 'PUT', `/api/events/${event.id}/checks`, { requirement_id: slip, user_id: app.users.alex.id, done: true })
  assert.equal(leadTry.status, 403)
  assert.match(leadTry.data.error, /Only mentors can tick “Permission slip”/)
  assert.equal((await app.call('mentor', 'PUT', `/api/events/${event.id}/checks`, { requirement_id: slip, user_id: app.users.alex.id, done: true })).status, 200)

  // A lead adds an ordinary item and ticks it.
  const added = await app.call('lead', 'POST', `/api/events/${event.id}/requirements`, { label: 'Safety glasses packed' })
  assert.equal(added.status, 201)
  const glasses = added.data.requirements.at(-1).id
  assert.equal((await app.call('lead', 'PUT', `/api/events/${event.id}/checks`, { requirement_id: glasses, user_id: app.users.sam.id, done: true })).status, 200)
  assert.equal((await app.call('lead', 'PUT', `/api/events/${event.id}/checks`, { requirement_id: glasses, user_id: app.users.mentor.id, done: true })).status, 404, 'not on the trip')

  // Leads can't take the mentor-only flag off, or add mentor-only items.
  assert.equal((await app.call('lead', 'PATCH', `/api/events/${event.id}/requirements/${slip}`, { mentor_only: false })).status, 403)
  assert.equal((await app.call('lead', 'DELETE', `/api/events/${event.id}/requirements/${slip}`)).status, 403)
  assert.equal((await app.call('lead', 'POST', `/api/events/${event.id}/requirements`, { label: 'Money', mentor_only: true })).status, 403)
  assert.equal((await app.call('lead', 'PATCH', `/api/events/${event.id}/requirements/${glasses}`, { mentor_only: true })).status, 403)

  // Alex sees his own checklist and note, and only names and status for others.
  const mine = (await app.call('alex', 'GET', `/api/events/${event.id}/roster`)).data
  assert.equal(mine.me.done, 1)
  assert.equal(mine.me.note, 'Needs a ride')
  const samRow = mine.people.find((p) => p.user_id === app.users.sam.id)
  assert.equal(samRow.checks, undefined)
  assert.equal(samRow.note, undefined)
  assert.equal(mine.summary.cleared, null)
  const leadView = (await app.call('lead', 'GET', `/api/events/${event.id}/roster`)).data
  assert.equal(leadView.people.find((p) => p.user_id === app.users.sam.id).done, 1)
  assert.equal(leadView.summary.cleared, 0)

  // CSV is for leads, and defuses formulas in notes.
  await app.call('sam', 'PATCH', `/api/events/${event.id}/roster/${app.users.sam.id}`, { note: '=HYPERLINK("x")' })
  assert.equal((await app.call('alex', 'GET', `/api/events/${event.id}/roster.csv`)).status, 403)
  const csv = await app.call('lead', 'GET', `/api/events/${event.id}/roster.csv`)
  assert.equal(csv.status, 200)
  assert.match(csv.data, /Name,Subteam,Status,Note,Permission slip,Trip fee paid,Medical & emergency form,Safety glasses packed,All done/)
  assert.match(csv.data, /'=HYPERLINK/)

  // Dropping out clears your checklist; deleting the event clears everything.
  await app.call('lead', 'DELETE', `/api/events/${event.id}/roster/${app.users.alex.id}`)
  assert.equal(app.sql('SELECT COUNT(*) AS n FROM event_checks WHERE user_id = ?', app.users.alex.id)[0].n, 0)
  await app.call('lead', 'DELETE', `/api/events/${event.id}`)
  assert.equal(app.sql('SELECT COUNT(*) AS n FROM event_roster')[0].n, 0)
  assert.equal(app.sql('SELECT COUNT(*) AS n FROM event_requirements')[0].n, 0)
})

test('people who leave the team drop off rosters and free their place', async () => {
  const app = await makeTeam()
  const { event } = await trip(app, { capacity: 1 })
  await app.call('alex', 'POST', `/api/events/${event.id}/roster`, {})
  app.sql('UPDATE users SET is_active = 0 WHERE id = ?', app.users.alex.id)
  const s = await app.call('sam', 'POST', `/api/events/${event.id}/roster`, {})
  assert.equal(s.data.me.status, 'going')
  assert.equal(s.data.people.length, 1)
  assert.equal((await app.call('lead', 'POST', `/api/events/${event.id}/roster`, { user_id: app.users.alex.id })).status, 404)
})

test('mentors chaperone: always going, not counted against the cap; a lead signing up waits like anyone', async () => {
  const app = await makeTeam()
  const { event } = await trip(app, { capacity: 1 })
  await app.call('alex', 'POST', `/api/events/${event.id}/roster`, {})
  const m = await app.call('mentor', 'POST', `/api/events/${event.id}/roster`, {})
  assert.equal(m.data.me.status, 'going')
  assert.equal(m.data.me.mentor, true)
  assert.deepEqual([m.data.summary.going, m.data.summary.mentors], [1, 1])
  assert.equal((await app.call('lead', 'PATCH', `/api/events/${event.id}/roster/${app.users.mentor.id}`, { status: 'waitlist' })).status, 400)
  const l = await app.call('lead', 'POST', `/api/events/${event.id}/roster`, {})
  assert.equal(l.data.me.status, 'waitlist', 'no jumping the queue')
  // Alex drops out: the lead gets the place, the mentor doesn't block it.
  await app.call('alex', 'DELETE', `/api/events/${event.id}/roster/${app.users.alex.id}`)
  assert.equal((await app.call('lead', 'GET', `/api/events/${event.id}/roster`)).data.me.status, 'going')
  assert.equal((await app.call('lead', 'GET', '/api/events')).data.events.find((e) => e.id === event.id).going_count, 1)
})
