import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam } from './harness.mjs'

async function setup(env) {
  const app = await makeTeam(env)
  await app.call('mentor', 'POST', '/api/vault', { name: 'Onshape', url: 'https://cad.onshape.com', username: 'team302', secret: '=Hunter2,"x"', totp: 'JBSWY3DPEHPK3PXP', notes: 'Shared CAD', min_role: 'member', subteam_ids: ['st_mech', 'st_cad'] })
  await app.call('mentor', 'POST', '/api/vault', { name: 'FIRST dashboard', username: 'coach@team302.org', secret: 'f1rst', min_role: 'admin' })
  await app.call('mentor', 'POST', '/api/vault', { name: 'Instagram', username: 'frc302', secret: 'insta', min_role: 'lead' })
  await app.call('mentor', 'POST', '/api/vault', { name: 'CI token', secret: 'ci', min_role: 'lead', subteam_ids: ['st_prog'] })
  return app
}

test('Bitwarden export: mentors only, complete and exact, collections by subteam and role, logged', async () => {
  const app = await setup()
  assert.equal((await app.call('lead', 'GET', '/api/vault/export/bitwarden')).status, 403)
  const res = await app.call('mentor', 'GET', '/api/vault/export/bitwarden')
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-disposition'), /vault-for-bitwarden/)
  const file = res.data
  assert.equal(file.encrypted, false)
  const byName = Object.fromEntries(file.items.map((i) => [i.name, i]))
  const col = Object.fromEntries(file.collections.map((c) => [c.id, c.name]))
  assert.equal(byName.Onshape.login.password, '=Hunter2,"x"', 'passwords are exported exactly, not spreadsheet-escaped')
  assert.equal(byName.Onshape.login.totp, 'JBSWY3DPEHPK3PXP')
  assert.equal(byName.Onshape.login.uris[0].uri, 'https://cad.onshape.com/')
  assert.match(byName.Onshape.notes, /Shared CAD/)
  assert.deepEqual(byName.Onshape.collectionIds.map((id) => col[id]).sort(), ['CAD', 'Mechanical'])
  assert.deepEqual(byName['FIRST dashboard'].collectionIds.map((id) => col[id]), ['Mentors'])
  assert.deepEqual(byName.Instagram.collectionIds.map((id) => col[id]), ['Leads'])
  assert.deepEqual(byName['CI token'].collectionIds.map((id) => col[id]), ['Programming (leads)'])
  assert.ok(JSON.stringify((await app.call('mentor', 'GET', '/api/activity')).data).includes('vault.export'))
  await app.call('mentor', 'GET', '/api/vault/export/bitwarden')
  await app.call('mentor', 'GET', '/api/vault/export/bitwarden')
  assert.equal((await app.call('mentor', 'GET', '/api/vault/export/bitwarden')).status, 429, 'at most 3 an hour')
})

test('after PASSWORDS_URL is set: everyone else is pointed there; read-only for mentors; delete all', async () => {
  const app = await setup()
  app.env.PASSWORDS_URL = 'https://vault.bitwarden.com/#/organizations/abc'
  const asMember = (await app.call('alex', 'GET', '/api/vault')).data
  assert.equal(asMember.moved_to, 'https://vault.bitwarden.com/#/organizations/abc')
  assert.deepEqual(asMember.entries, [])
  const id = (await app.call('mentor', 'GET', '/api/vault')).data.entries.find((e) => e.name === 'Instagram').id
  assert.equal((await app.call('lead', 'POST', `/api/vault/${id}/reveal`)).status, 410)
  assert.equal((await app.call('mentor', 'POST', `/api/vault/${id}/reveal`)).data.secret, 'insta', 'mentors can still check')
  assert.equal((await app.call('mentor', 'POST', '/api/vault', { name: 'New', secret: 'x' })).status, 410, 'no new entries')
  assert.equal((await app.call('mentor', 'PATCH', `/api/vault/${id}`, { name: 'y' })).status, 410)

  assert.equal((await app.call('lead', 'DELETE', '/api/vault', { confirm: 'DELETE ALL' })).status, 403)
  assert.equal((await app.call('mentor', 'DELETE', '/api/vault', {})).status, 400)
  const del = await app.call('mentor', 'DELETE', '/api/vault', { confirm: 'DELETE ALL' })
  assert.equal(del.data.deleted, 4)
  assert.equal(app.sql('SELECT COUNT(*) AS n FROM vault_entries')[0].n, 0)
  assert.equal(app.sql('SELECT COUNT(*) AS n FROM vault_entry_subteams')[0].n, 0)
  assert.ok(JSON.stringify((await app.call('mentor', 'GET', '/api/activity')).data).includes('vault.delete_all'))
})

test('a non-https PASSWORDS_URL is ignored', async () => {
  const app = await setup()
  app.env.PASSWORDS_URL = 'javascript:alert(1)'
  assert.equal((await app.call('alex', 'GET', '/api/vault')).data.moved_to, null)
})
