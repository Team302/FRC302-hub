import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPair, exportSPKI, SignJWT } from 'jose'
import { makeApp, makeTeam } from './harness.mjs'

test('no token, garbage token and inactive accounts are 401', async () => {
  const app = await makeTeam()
  assert.equal((await app.call(null, 'GET', '/api/me')).status, 401)
  assert.equal((await app.call({ token: 'nope' }, 'GET', '/api/me')).status, 401)
  app.sql("UPDATE users SET is_active = 0 WHERE id = 'usr_alex'")
  assert.equal((await app.call('alex', 'GET', '/api/me')).status, 401)
})

test('role changes apply on the next request, not at token expiry', async () => {
  const app = await makeTeam()
  assert.equal((await app.call('alex', 'POST', '/api/boards', { name: 'X' })).status, 403)
  app.sql("UPDATE users SET role = 'lead' WHERE id = 'usr_alex'")
  assert.equal((await app.call('alex', 'POST', '/api/boards', { name: 'X' })).status, 201)
})

test('dev login is refused in production, off-localhost, or without DEV_LOGIN', async () => {
  for (const env of [{ ENVIRONMENT: 'production' }, { DEV_LOGIN: undefined }, { JWT_SECRET: 'change-me-to-at-least-32-random-characters' }]) {
    const app = await makeTeam(env)
    assert.equal((await app.call(null, 'POST', '/api/auth/dev-login', { email: 'mentor@example.org' })).status, 404)
    // and existing dev tokens stop working too
    assert.equal((await app.call('mentor', 'GET', '/api/me')).status, 401)
  }
  const app = await makeTeam()
  const { handle } = await import('../src/index.js')
  const res = await handle(
    new Request('http://hub.example.org/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'mentor@example.org' }) }), app.env, {})
  assert.equal(res.status, 404)
})

test('bootstrap admin only works on a team with no admin', async () => {
  const app = await makeApp({ BOOTSTRAP_ADMIN_EMAIL: 'coach@example.org' })
  const first = await app.call(null, 'POST', '/api/auth/dev-login', { email: 'coach@example.org' })
  assert.equal(first.status, 200)
  assert.equal(app.sql("SELECT role FROM users WHERE email = 'coach@example.org'")[0].role, 'admin')
  // A stranger gets nothing
  assert.equal((await app.call(null, 'POST', '/api/auth/dev-login', { email: 'stranger@example.org' })).status, 403)
  // Once there is an admin, the bootstrap email can't make a second one after being removed
  app.sql("DELETE FROM users WHERE email = 'coach@example.org'")
  app.sql("INSERT INTO users (id, email, name, role) VALUES ('u2', 'other@example.org', 'Other', 'admin')")
  assert.equal((await app.call(null, 'POST', '/api/auth/dev-login', { email: 'coach@example.org' })).status, 403)
})

test('Clerk tokens: verified, azp-pinned, email must be verified and on the roster', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const host = 'clerk.team302.example'
  const pk = `pk_live_${btoa(`${host}$`)}`
  const app = await makeTeam({ CLERK_JWT_KEY: await exportSPKI(publicKey), CLERK_PUBLISHABLE_KEY: pk, APP_URL: 'https://hub.team302.example', ENVIRONMENT: 'production' })
  const mint = (claims, opts = {}) => new SignJWT({ azp: 'https://hub.team302.example', email: 'alex@example.org', email_verified: true, sts: 'active', ...claims })
    .setProtectedHeader({ alg: 'RS256' }).setIssuer(opts.iss || `https://${host}`).setSubject(opts.sub || 'user_alex').setIssuedAt().setExpirationTime('1m').sign(opts.key || privateKey)

  const ok = await app.call({ token: await mint({}) }, 'GET', '/api/me')
  assert.equal(ok.status, 200)
  assert.equal(ok.data.user.id, 'usr_alex')
  // The row is now linked to that Clerk login; another login with the same email is refused.
  assert.equal((await app.call({ token: await mint({}, { sub: 'user_imposter' }) }, 'GET', '/api/me')).status, 401)

  const other = await generateKeyPair('RS256')
  for (const token of [
    await mint({ azp: 'https://evil.example' }),
    await mint({ email_verified: false }, { sub: 'user_x' }),
    await mint({ email: 'stranger@example.org' }, { sub: 'user_s' }),
    await mint({}, { iss: 'https://other.clerk.example' }),
    await mint({}, { key: other.privateKey }),
    await mint({ sts: 'pending' }),
  ]) assert.equal((await app.call({ token }, 'GET', '/api/me')).status, 401)
  // Dev tokens are refused once Clerk is configured.
  assert.equal((await app.call('alex', 'GET', '/api/me')).status, 401)
})

test('API answers carry no-store and security headers; unknown routes 404 as JSON', async () => {
  const app = await makeTeam()
  const res = await app.call('alex', 'GET', '/api/nope')
  assert.equal(res.status, 404)
  assert.equal(res.headers.get('Cache-Control'), 'no-store')
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY')
})

test('malformed bodies are 400, not 500', async () => {
  const app = await makeTeam()
  const { handle } = await import('../src/index.js')
  const res = await handle(new Request('http://localhost/api/items', { method: 'POST', headers: { Authorization: `Bearer ${app.users.alex.token}`, 'Content-Type': 'application/json' }, body: '{not json' }), app.env, {})
  assert.equal(res.status, 400)
})
