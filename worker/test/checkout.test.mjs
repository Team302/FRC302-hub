import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam } from './harness.mjs'
import { personHours } from '../src/routes/reports.js'

const raw = (app, method, path, body) => app.call(null, method, path, body)

test('hours: from check-in to check-out, clamped to the meeting; marks without times count it all', () => {
  const m = { started_at: '2026-10-20 18:00:00', ended_at: '2026-10-20 21:00:00', duration_min: 180 }
  assert.equal(personHours(m, {}), 3)
  assert.equal(personHours(m, { checked_in_at: '2026-10-20 18:30:00' }), 2.5)
  assert.equal(personHours(m, { checked_in_at: '2026-10-20 17:40:00', checked_out_at: '2026-10-20 19:00:00' }), 1, 'early arrival counts from the start')
  assert.equal(personHours(m, { checked_in_at: '2026-10-20 18:00:00', checked_out_at: '2026-10-20 23:00:00' }), 3, 'capped at the end')
  // A meeting clicked through afterwards (under 15 real minutes) counts its scheduled length.
  assert.equal(personHours({ started_at: '2026-10-20 21:00:00', ended_at: '2026-10-20 21:01:00', duration_min: 120 }, { checked_in_at: '2026-10-20 21:00:30' }), 2)
})

async function live(app) {
  const m = (await app.call('lead', 'POST', '/api/meetings', { title: 'Build', kind: 'build', starts_at: new Date(Date.now() - 60000).toISOString(), duration_min: 180 })).data.meeting
  await app.call('lead', 'POST', `/api/meetings/${m.id}/start`)
  return m
}

test('self check-out; can’t check out twice or before checking in; back in clears it', async () => {
  const app = await makeTeam()
  const m = await live(app)
  assert.equal((await app.call('alex', 'POST', `/api/meetings/${m.id}/checkout`)).status, 409, 'not in yet')
  await app.call('alex', 'POST', `/api/meetings/${m.id}/checkin`)
  assert.ok(app.sql('SELECT checked_in_at FROM attendance WHERE user_id = ?', app.users.alex.id)[0].checked_in_at)
  assert.equal((await app.call('alex', 'POST', `/api/meetings/${m.id}/checkout`)).status, 200)
  assert.equal((await app.call('alex', 'POST', `/api/meetings/${m.id}/checkout`)).status, 409)
  const roster = (await app.call('lead', 'GET', `/api/meetings/${m.id}`)).data.attendance
  assert.ok(roster.find((r) => r.id === app.users.alex.id).checked_out_at)
  await app.call('alex', 'POST', `/api/meetings/${m.id}/checkin`)
  assert.equal(app.sql('SELECT checked_out_at FROM attendance WHERE user_id = ?', app.users.alex.id)[0].checked_out_at, null)
  await app.call('lead', 'POST', `/api/meetings/${m.id}/end`)
  assert.equal((await app.call('alex', 'POST', `/api/meetings/${m.id}/checkout`)).status, 409, 'not after it ends')
})

test('kiosk check-out; runner marking absent clears the times; report uses them', async () => {
  const app = await makeTeam()
  const m = await live(app)
  const k = (await app.call('lead', 'POST', '/api/kiosks', { name: 'Door' })).data
  await raw(app, 'POST', `/api/kiosk/${k.token}/checkin`, { meeting_id: m.id, user_id: app.users.alex.id })
  await raw(app, 'POST', `/api/kiosk/${k.token}/checkin`, { meeting_id: m.id, user_id: app.users.sam.id })
  assert.equal((await raw(app, 'POST', `/api/kiosk/${k.token}/checkout`, { meeting_id: m.id, user_id: app.users.alex.id })).status, 200)
  const view = (await raw(app, 'GET', `/api/kiosk/${k.token}`)).data.people
  assert.equal(view.find((p) => p.id === app.users.alex.id).checked_out[m.id], true)

  await app.call('lead', 'PUT', `/api/meetings/${m.id}/attendance/${app.users.sam.id}`, { status: 'absent' })
  assert.deepEqual({ ...app.sql('SELECT checked_in_at, checked_out_at FROM attendance WHERE user_id = ?', app.users.sam.id)[0] }, { checked_in_at: null, checked_out_at: null })

  // Make it a 3-hour meeting that alex left after 1 hour, then end it.
  await app.call('lead', 'POST', `/api/meetings/${m.id}/end`)
  app.sql("UPDATE meetings SET started_at = '2026-10-20 18:00:00', ended_at = '2026-10-20 21:00:00', starts_at = '2026-10-20T18:00:00Z' WHERE id = ?", m.id)
  app.sql("UPDATE attendance SET checked_in_at = '2026-10-20 18:00:00', checked_out_at = '2026-10-20 19:00:00' WHERE user_id = ?", app.users.alex.id)
  await app.call('lead', 'PUT', `/api/meetings/${m.id}/attendance/${app.users.lead.id}`, { status: 'present' })
  const people = (await app.call('lead', 'GET', '/api/reports/attendance?from=2026-10-01&to=2026-10-31')).data.people
  assert.equal(people.find((p) => p.user_id === app.users.alex.id).hours, 1)
  assert.equal(people.find((p) => p.user_id === app.users.lead.id).hours, 3, 'runner-set mark: whole meeting')
})
