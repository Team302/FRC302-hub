import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam } from './harness.mjs'

const raw = (app, method, path, body) => app.call(null, method, path, body)

async function setup() {
  const app = await makeTeam()
  const soon = new Date(Date.now() - 2 * 60000).toISOString()
  const build = (await app.call('lead', 'POST', '/api/meetings', { title: 'Build session', kind: 'build', starts_at: soon, duration_min: 180 })).data.meeting
  const leaders = (await app.call('lead', 'POST', '/api/meetings', { title: 'Leads sync', kind: 'leadership', starts_at: soon })).data.meeting
  await app.call('lead', 'POST', `/api/meetings/${build.id}/start`)
  await app.call('lead', 'POST', `/api/meetings/${leaders.id}/start`)
  const k = await app.call('lead', 'POST', '/api/kiosks', { name: 'Shop door' })
  return { app, build, leaders, k }
}

test('leads create kiosks; members can’t; the token is shown once and stored hashed', async () => {
  const { app, k } = await setup()
  assert.equal(k.status, 201)
  assert.match(k.data.token, /^[0-9a-f]{64}$/)
  assert.equal((await app.call('alex', 'POST', '/api/kiosks', { name: 'x' })).status, 403)
  assert.equal((await app.call('alex', 'GET', '/api/kiosks')).status, 403)
  const list = (await app.call('lead', 'GET', '/api/kiosks')).data.kiosks
  assert.deepEqual(list.map((x) => x.name), ['Shop door'])
  assert.ok(!JSON.stringify(list).includes(k.data.token))
  assert.ok(!JSON.stringify(app.sql('SELECT * FROM kiosks')).includes(k.data.token), 'only the hash is stored')
})

test('the kiosk shows short names and only member-visible live meetings', async () => {
  const { app, build, k } = await setup()
  const res = await raw(app, 'GET', `/api/kiosk/${k.data.token}`)
  assert.equal(res.status, 200)
  assert.deepEqual(res.data.meetings.map((m) => m.title), ['Build session'], 'leadership meetings never show')
  assert.equal(res.data.meetings[0].id, build.id)
  const names = res.data.people.map((p) => p.name)
  assert.ok(names.includes('Lead L.') && names.includes('Alex'))
  assert.ok(!names.some((n) => /Mentor/.test(n)), 'mentors aren’t listed')
  assert.ok(!JSON.stringify(res.data).includes('@example.org'), 'no emails')
})

test('check in from the kiosk: tagged, idempotent, never overwrites, leadership refused', async () => {
  const { app, build, leaders, k } = await setup()
  const t = k.data.token
  const r1 = await raw(app, 'POST', `/api/kiosk/${t}/checkin`, { meeting_id: build.id, user_id: app.users.alex.id })
  assert.equal(r1.status, 200)
  assert.equal(r1.data.status, 'present')
  assert.equal((await raw(app, 'POST', `/api/kiosk/${t}/checkin`, { meeting_id: build.id, user_id: app.users.alex.id })).status, 200)
  const [row] = app.sql('SELECT status, via, recorded_by FROM attendance WHERE meeting_id = ? AND user_id = ?', build.id, app.users.alex.id)
  assert.equal(row.via, `kiosk:${k.data.kiosk.id}`)
  assert.equal(row.recorded_by, null)
  // The meeting page says where the mark came from.
  const roster = (await app.call('lead', 'GET', `/api/meetings/${build.id}`)).data.attendance
  assert.equal(roster.find((r) => r.id === app.users.alex.id).via_kiosk, 'Shop door')

  // A mark the runner set stays as it was.
  await app.call('lead', 'PUT', `/api/meetings/${build.id}/attendance/${app.users.sam.id}`, { status: 'excused' })
  assert.equal((await raw(app, 'POST', `/api/kiosk/${t}/checkin`, { meeting_id: build.id, user_id: app.users.sam.id })).data.status, 'excused')

  assert.equal((await raw(app, 'POST', `/api/kiosk/${t}/checkin`, { meeting_id: leaders.id, user_id: app.users.alex.id })).status, 409)
  assert.equal((await raw(app, 'POST', `/api/kiosk/${t}/checkin`, { meeting_id: build.id, user_id: app.users.mentor.id })).status, 404)
  await app.call('lead', 'POST', `/api/meetings/${build.id}/end`)
  assert.equal((await raw(app, 'POST', `/api/kiosk/${t}/checkin`, { meeting_id: build.id, user_id: app.users.lead.id })).status, 409)
})

test('wrong, revoked and expired links all look the same', async () => {
  const { app, k } = await setup()
  assert.equal((await raw(app, 'GET', `/api/kiosk/${'0'.repeat(64)}`)).status, 404)
  assert.equal((await raw(app, 'GET', '/api/kiosk/not-a-token')).status, 404)
  const expired = await app.call('lead', 'POST', '/api/kiosks', { name: 'Old' })
  app.sql("UPDATE kiosks SET expires_at = datetime('now', '-1 minute') WHERE id = ?", expired.data.kiosk.id)
  assert.equal((await raw(app, 'GET', `/api/kiosk/${expired.data.token}`)).data.code, 'kiosk_inactive')
  assert.equal((await app.call('lead', 'DELETE', `/api/kiosks/${k.data.kiosk.id}`)).status, 200)
  const gone = await raw(app, 'GET', `/api/kiosk/${k.data.token}`)
  assert.equal(gone.status, 404)
  assert.equal(gone.data.code, 'kiosk_inactive')
  assert.ok(JSON.stringify((await app.call('mentor', 'GET', '/api/activity')).data).includes('kiosk.revoke'))
})
