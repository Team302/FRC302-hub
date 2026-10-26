import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam } from './harness.mjs'

// alex: Mechanical (st_mech), sam: Electrical (st_elec), lead: Programming (st_prog).
async function setup() {
  const app = await makeTeam()
  await app.addUser('pat', 'member', { name: 'Pat', subteam_id: 'st_mech' })
  await app.addUser('mechlead', 'lead', { name: 'Mech Lead', subteam_id: 'st_mech' })
  const onshape = (await app.call('mentor', 'POST', '/api/vault', { name: 'Onshape', username: 'team302', secret: 'cad-pass', totp: 'JBSWY3DPEHPK3PXP', min_role: 'member', subteam_ids: ['st_mech', 'st_cad'] })).data.entry
  return { app, onshape }
}
const names = async (app, who) => (await app.call(who, 'GET', '/api/vault')).data.entries.map((e) => e.name)

test('a subteam entry is visible and revealable only on those subteams (and to mentors)', async () => {
  const { app, onshape } = await setup()
  assert.deepEqual(onshape.subteam_ids.sort(), ['st_cad', 'st_mech'])
  assert.deepEqual(await names(app, 'alex'), ['Onshape'])
  assert.deepEqual(await names(app, 'sam'), [], 'other subteam: not listed')
  assert.deepEqual(await names(app, 'lead'), [], 'a lead on another subteam doesn’t see it either')
  assert.deepEqual(await names(app, 'mentor'), ['Onshape'])
  for (const path of [`/api/vault/${onshape.id}/reveal`, `/api/vault/${onshape.id}/totp`]) {
    assert.equal((await app.call('sam', 'POST', path)).status, 404)
    assert.equal((await app.call('lead', 'POST', path)).status, 404)
  }
  assert.equal((await app.call('sam', 'PATCH', `/api/vault/${onshape.id}`, { name: 'x' })).status, 404)
  assert.equal((await app.call('alex', 'POST', `/api/vault/${onshape.id}/reveal`)).data.secret, 'cad-pass')
  assert.equal((await app.call('pat', 'POST', `/api/vault/${onshape.id}/totp`)).status, 200)
})

test('role still applies on top of subteams; moving subteam removes access', async () => {
  const { app } = await setup()
  const ci = (await app.call('mentor', 'POST', '/api/vault', { name: 'Mech leads only', secret: 's', min_role: 'lead', subteam_ids: ['st_mech'] })).data.entry
  assert.ok((await names(app, 'mechlead')).includes('Mech leads only'))
  assert.ok(!(await names(app, 'alex')).includes('Mech leads only'), 'right subteam, wrong role')
  assert.equal((await app.call('alex', 'POST', `/api/vault/${ci.id}/reveal`)).status, 404)
  await app.call('mentor', 'PATCH', `/api/users/${app.users.pat.id}`, { subteam_id: 'st_elec' })
  assert.deepEqual(await names(app, 'pat'), [])
})

test('setting subteams: must exist; non-mentors must include their own; changes are logged', async () => {
  const { app, onshape } = await setup()
  assert.equal((await app.call('mentor', 'POST', '/api/vault', { name: 'X', subteam_ids: ['st_nope'] })).status, 400)
  const r = await app.call('mechlead', 'POST', '/api/vault', { name: 'Elec only', secret: 'z', min_role: 'member', subteam_ids: ['st_elec'] })
  assert.equal(r.status, 400)
  assert.match(r.data.error, /your own subteam/)
  const ok = await app.call('mechlead', 'POST', '/api/vault', { name: 'Shop wifi', secret: 'z', min_role: 'member', subteam_ids: ['st_mech', 'st_elec'] })
  assert.equal(ok.status, 201)
  assert.ok((await names(app, 'sam')).includes('Shop wifi'))
  // Widening to everyone, then narrowing again.
  assert.equal((await app.call('mentor', 'PATCH', `/api/vault/${onshape.id}`, { subteam_ids: [] })).status, 200)
  assert.ok((await names(app, 'sam')).includes('Onshape'))
  await app.call('mentor', 'PATCH', `/api/vault/${onshape.id}`, { subteam_ids: ['st_cad'] })
  assert.ok(!(await names(app, 'alex')).includes('Onshape'))
  const log = JSON.stringify((await app.call('mentor', 'GET', '/api/activity')).data)
  assert.ok(log.includes('subteams any → CAD'), log.slice(0, 400))
})

test('a subteam guarding vault entries can’t be deleted (that would open them to everyone)', async () => {
  const { app } = await setup()
  const res = await app.call('mentor', 'DELETE', '/api/subteams/st_cad')
  assert.equal(res.status, 409)
  assert.equal(res.data.code, 'subteam_in_vault')
  assert.ok((await app.call('mentor', 'GET', '/api/subteams')).data.subteams.some((s) => s.id === 'st_cad'))
})
