import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam, vaultKey } from './harness.mjs'
import { totpCode } from '../src/lib/totp.js'

async function seed(app) {
  const lead = await app.call('lead', 'POST', '/api/vault', { name: 'Onshape', username: 'cad@team302.org', secret: 'hunter2', min_role: 'lead', url: 'https://cad.onshape.com' })
  const member = await app.call('lead', 'POST', '/api/vault', { name: 'Shop wifi', secret: 'dragons302', min_role: 'member' })
  const mentor = await app.call('mentor', 'POST', '/api/vault', { name: 'Bank', secret: 'very-secret', min_role: 'admin', totp: 'JBSWY3DPEHPK3PXP' })
  return { lead: lead.data.entry, member: member.data.entry, mentor: mentor.data.entry }
}

test('secrets are encrypted at rest and never listed', async () => {
  const app = await makeTeam()
  await seed(app)
  for (const row of app.sql('SELECT secret_enc FROM vault_entries')) {
    assert.match(row.secret_enc, /^v2\.[0-9a-f]{8}\./)
    assert.ok(!row.secret_enc.includes('hunter2'))
  }
  const list = await app.call('mentor', 'GET', '/api/vault')
  assert.equal(list.status, 200)
  assert.ok(!JSON.stringify(list.data).includes('hunter2'))
  assert.ok(!JSON.stringify(list.data).includes('secret_enc'))
})

test('visibility follows min_role, and hidden entries are 404', async () => {
  const app = await makeTeam()
  const e = await seed(app)
  const names = async (who) => (await app.call(who, 'GET', '/api/vault')).data.entries.map((x) => x.name).sort()
  assert.deepEqual(await names('alex'), ['Shop wifi'])
  assert.deepEqual(await names('lead'), ['Onshape', 'Shop wifi'])
  assert.deepEqual(await names('mentor'), ['Bank', 'Onshape', 'Shop wifi'])
  assert.equal((await app.call('alex', 'POST', `/api/vault/${e.lead.id}/reveal`)).status, 404)
  assert.equal((await app.call('lead', 'POST', `/api/vault/${e.mentor.id}/reveal`)).status, 404)
  assert.equal((await app.call('alex', 'POST', `/api/vault/${e.member.id}/reveal`)).data.secret, 'dragons302')
})

test('every reveal is audited with the actor; audit is mentor-only', async () => {
  const app = await makeTeam()
  const e = await seed(app)
  await app.call('lead', 'POST', `/api/vault/${e.lead.id}/reveal`)
  const audit = await app.call('mentor', 'GET', `/api/vault/${e.lead.id}/audit`)
  assert.equal(audit.status, 200)
  assert.ok(audit.data.audit.some((a) => a.action === 'vault.reveal' && a.actor_name === 'Lead Lee'))
  assert.equal((await app.call('lead', 'GET', `/api/vault/${e.lead.id}/audit`)).status, 403)
})

test('reveals are rate limited per person', async () => {
  const app = await makeTeam()
  const e = await seed(app)
  let last
  for (let i = 0; i < 31; i++) last = await app.call('alex', 'POST', `/api/vault/${e.member.id}/reveal`)
  assert.equal(last.status, 429)
  // someone else is unaffected
  assert.equal((await app.call('sam', 'POST', `/api/vault/${e.member.id}/reveal`)).status, 200)
})

test('who may create and edit', async () => {
  const app = await makeTeam()
  const e = await seed(app)
  assert.equal((await app.call('alex', 'POST', '/api/vault', { name: 'x', secret: 'y' })).status, 403)
  assert.equal((await app.call('lead', 'POST', '/api/vault', { name: 'x', secret: 'y', min_role: 'admin' })).status, 403)
  // a lead can't escalate their own entry to mentor-only (then lose it), nor edit someone else's
  assert.equal((await app.call('lead', 'PATCH', `/api/vault/${e.lead.id}`, { min_role: 'admin' })).status, 403)
  await app.addUser('lead2', 'lead')
  assert.equal((await app.call('lead2', 'PATCH', `/api/vault/${e.lead.id}`, { name: 'mine now' })).status, 403)
  // only mentors delete
  assert.equal((await app.call('lead', 'DELETE', `/api/vault/${e.lead.id}`)).status, 403)
  assert.equal((await app.call('mentor', 'DELETE', `/api/vault/${e.lead.id}`)).status, 200)
})

test('editing without a new secret keeps the old one; rotation stamps rotated_at', async () => {
  const app = await makeTeam()
  const e = await seed(app)
  await app.call('lead', 'PATCH', `/api/vault/${e.lead.id}`, { notes: 'shared team login' })
  assert.equal((await app.call('lead', 'POST', `/api/vault/${e.lead.id}/reveal`)).data.secret, 'hunter2')
  app.sql("UPDATE vault_entries SET rotated_at = '2000-01-01 00:00:00'")
  await app.call('lead', 'PATCH', `/api/vault/${e.lead.id}`, { secret: 'correct-horse' })
  assert.equal((await app.call('lead', 'POST', `/api/vault/${e.lead.id}/reveal`)).data.secret, 'correct-horse')
  assert.notEqual(app.sql('SELECT rotated_at FROM vault_entries WHERE id = ?', e.lead.id)[0].rotated_at, '2000-01-01 00:00:00')
})

test('a ciphertext moved to another entry does not decrypt (AAD binding)', async () => {
  const app = await makeTeam()
  const e = await seed(app)
  const blob = app.sql('SELECT secret_enc FROM vault_entries WHERE id = ?', e.mentor.id)[0].secret_enc
  app.sql('UPDATE vault_entries SET secret_enc = ? WHERE id = ?', blob, e.member.id)
  const res = await app.call('alex', 'POST', `/api/vault/${e.member.id}/reveal`)
  assert.equal(res.status, 500)
  assert.ok(!JSON.stringify(res.data).includes('very-secret'))
})

test('TOTP returns a current code, never the seed', async () => {
  const app = await makeTeam()
  const e = await seed(app)
  const res = await app.call('mentor', 'POST', `/api/vault/${e.mentor.id}/totp`)
  assert.equal(res.status, 200)
  assert.match(res.data.code, /^\d{6}$/)
  assert.ok(!JSON.stringify(res.data).includes('JBSWY3DPEHPK3PXP'))
  // RFC 6238 test vector (SHA-1, seed "12345678901234567890", T=59 → 94287082, 8 digits)
  assert.equal((await totpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000, 30, 8)).code, '94287082')
  assert.equal((await app.call('mentor', 'POST', '/api/vault', { name: 'bad', totp: 'not a seed!' })).status, 400)
})

test('javascript: links are refused', async () => {
  const app = await makeTeam()
  assert.equal((await app.call('lead', 'POST', '/api/vault', { name: 'x', url: 'javascript:alert(1)' })).status, 400)
})

test('key rotation: old ciphertext still opens and rekey re-seals it', async () => {
  const oldKey = vaultKey()
  const app = await makeTeam({ VAULT_KEY: oldKey })
  const e = await seed(app)
  const oldKid = app.sql('SELECT secret_enc FROM vault_entries WHERE id = ?', e.lead.id)[0].secret_enc.split('.')[1]
  app.env.VAULT_KEY_PREVIOUS = oldKey
  app.env.VAULT_KEY = vaultKey()
  assert.equal((await app.call('lead', 'POST', `/api/vault/${e.lead.id}/reveal`)).data.secret, 'hunter2')
  const rekey = await app.call('mentor', 'POST', '/api/vault/rekey')
  assert.equal(rekey.status, 200)
  assert.deepEqual(rekey.data.failed, [])
  const kids = new Set(app.sql('SELECT secret_enc FROM vault_entries').map((r) => r.secret_enc.split('.')[1]))
  assert.ok(!kids.has(oldKid))
  delete app.env.VAULT_KEY_PREVIOUS
  assert.equal((await app.call('mentor', 'POST', `/api/vault/${e.mentor.id}/reveal`)).data.secret, 'very-secret')
})

test('vault refuses cleanly when VAULT_KEY is unset', async () => {
  const app = await makeTeam({ VAULT_KEY: undefined })
  const res = await app.call('lead', 'POST', '/api/vault', { name: 'x', secret: 'y' })
  assert.equal(res.status, 503)
  assert.equal((await app.call('lead', 'GET', '/api/vault')).data.configured, false)
})
