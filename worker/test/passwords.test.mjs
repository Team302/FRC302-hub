import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam } from './harness.mjs'

test('the Passwords page gets PASSWORDS_URL, https only; the old vault API is gone', async () => {
  const app = await makeTeam()
  assert.deepEqual((await app.call('alex', 'GET', '/api/passwords')).data, { url: null })
  app.env.PASSWORDS_URL = 'https://vault.team302.org'
  assert.equal((await app.call('alex', 'GET', '/api/passwords')).data.url, 'https://vault.team302.org/')
  app.env.PASSWORDS_URL = 'http://vault.team302.org'
  assert.equal((await app.call('alex', 'GET', '/api/passwords')).data.url, null)
  app.env.PASSWORDS_URL = 'javascript:alert(1)'
  assert.equal((await app.call('alex', 'GET', '/api/passwords')).data.url, null)
  assert.equal((await app.call(null, 'GET', '/api/passwords')).status, 401)
  assert.equal((await app.call('mentor', 'GET', '/api/vault')).status, 404)
  assert.equal(app.sql("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'vault%'")[0].n, 0, 'tables dropped')
})
