// Regressions for the findings of the security review (October 2026).
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam } from './harness.mjs'
import { b64urlEncode } from '../src/lib/webpush.js'
import { csvCell } from '../src/lib/csv.js'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

async function vapid() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', keys.privateKey)
  return { VAPID_PUBLIC_KEY: b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))), VAPID_PRIVATE_KEY: jwk.d, VAPID_SUBJECT: 'mailto:t@example.org' }
}
async function browserSub() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  return { endpoint: `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`, keys: { p256dh: b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))), auth: b64urlEncode(crypto.getRandomValues(new Uint8Array(16))) } }
}
async function board(app) {
  const b = (await app.call('lead', 'POST', '/api/boards', { name: 'B' })).data.board
  const g = (await app.call('lead', 'GET', `/api/boards/${b.id}`)).data.groups[0]
  return { b, g }
}

test('M1: removed people get no notifications or pushes; their subscriptions and calendar link go', async () => {
  const app = await makeTeam(await vapid())
  let pushes = 0
  globalThis.fetch = async () => { pushes++; return new Response(null, { status: 201 }) }
  assert.equal((await app.call('sam', 'POST', '/api/push/subscriptions', await browserSub())).status, 201)
  await app.call('sam', 'POST', '/api/me/calendar')
  const { b, g } = await board(app)
  const t = (await app.call('lead', 'POST', '/api/items', { board_id: b.id, group_id: g.id, title: 'T', assignee_id: app.users.sam.id })).data.item
  assert.equal(pushes, 1, 'pushes while active')
  await app.call('mentor', 'PATCH', `/api/users/${app.users.sam.id}`, { is_active: false })
  assert.equal(app.sql('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?', app.users.sam.id)[0].n, 0)
  assert.equal(app.sql('SELECT calendar_token_hash FROM users WHERE id = ?', app.users.sam.id)[0].calendar_token_hash, null)
  const before = app.sql('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', app.users.sam.id)[0].n
  await app.call('lead', 'PATCH', `/api/items/${t.id}`, { status: 'stuck' })
  await app.call('lead', 'POST', `/api/items/${t.id}/updates`, { body: 'confidential note' })
  assert.equal(app.sql('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', app.users.sam.id)[0].n, before)
  assert.equal(pushes, 1)
})

test('M2: a task from a leadership meeting doesn’t reveal the meeting to members', async () => {
  const app = await makeTeam()
  const { b, g } = await board(app)
  const m = (await app.call('lead', 'POST', '/api/meetings', { title: 'SECRET leadership', kind: 'leadership', starts_at: new Date().toISOString() })).data.meeting
  const a = (await app.call('lead', 'POST', `/api/meetings/${m.id}/actions`, { board_id: b.id, group_id: g.id, title: 'Order bearings' })).data
  const id = a.item?.id || a.action?.id || (await app.call('lead', 'GET', `/api/boards/${b.id}`)).data.items[0].id
  const asMember = (await app.call('alex', 'GET', `/api/items/${id}`)).data
  assert.equal(asMember.meeting, null)
  assert.ok(!JSON.stringify(asMember).includes('SECRET'))
  assert.equal((await app.call('lead', 'GET', `/api/items/${id}`)).data.meeting.title, 'SECRET leadership', 'leads still see it')
})

test('L1: a member facilitating a meeting can’t change its type or hand it off', async () => {
  const app = await makeTeam()
  const m = (await app.call('lead', 'POST', '/api/meetings', { title: 'All hands', kind: 'general', starts_at: new Date().toISOString(), facilitator_id: app.users.alex.id })).data.meeting
  assert.equal((await app.call('alex', 'PATCH', `/api/meetings/${m.id}`, { kind: 'leadership' })).status, 403)
  assert.equal((await app.call('alex', 'PATCH', `/api/meetings/${m.id}`, { facilitator_id: app.users.sam.id })).status, 403)
  assert.equal((await app.call('alex', 'PATCH', `/api/meetings/${m.id}`, { notes: 'ok' })).status, 200, 'notes still fine')
  assert.equal(app.sql('SELECT kind FROM meetings WHERE id = ?', m.id)[0].kind, 'general')
})

test('L2: knowing an endpoint URL isn’t enough to take it over', async () => {
  const app = await makeTeam(await vapid())
  const sub = await browserSub()
  await app.call('sam', 'POST', '/api/push/subscriptions', sub)
  const other = await browserSub()
  const res = await app.call('alex', 'POST', '/api/push/subscriptions', { endpoint: sub.endpoint, keys: other.keys })
  assert.equal(res.status, 409)
  assert.equal(app.sql('SELECT user_id FROM push_subscriptions WHERE endpoint = ?', sub.endpoint)[0].user_id, app.users.sam.id)
  // The same browser (same keys) signing in as someone else does move it.
  assert.equal((await app.call('alex', 'POST', '/api/push/subscriptions', sub)).status, 201)
  assert.equal(app.sql('SELECT user_id FROM push_subscriptions WHERE endpoint = ?', sub.endpoint)[0].user_id, app.users.alex.id)
})

test('L5: nobody can take another active person’s name', async () => {
  const app = await makeTeam()
  assert.equal((await app.call('alex', 'PATCH', '/api/me', { name: ' mentor mo ' })).status, 409)
  assert.equal((await app.call('alex', 'PATCH', '/api/me', { name: 'Alex R.' })).status, 200)
})

test('L6, L7: CSV defuses formulas behind whitespace; odd content types are a 400', async () => {
  assert.equal(csvCell(' =1+1'), "' =1+1")
  assert.equal(csvCell(' @x'), "' @x")
  assert.equal(csvCell('a = b'), 'a = b')
  const app = await makeTeam()
  const { b, g } = await board(app)
  const t = (await app.call('alex', 'POST', '/api/items', { board_id: b.id, group_id: g.id, title: 'T' })).data.item
  for (const type of ['__proto__', 'constructor']) {
    assert.equal((await app.upload('alex', `/api/items/${t.id}/attachments`, new Uint8Array([1]), { type, filename: 'x.png' })).status, 400)
  }
})

test('L9: a reviewer can’t approve an ownerless task, nor after leaving the subteam', async () => {
  const app = await makeTeam()
  app.sql("UPDATE users SET subteam_id = 'st_mech' WHERE id = ?", app.users.sam.id)
  const b = (await app.call('lead', 'POST', '/api/boards', { name: 'Mech', subteam_id: 'st_mech' })).data.board
  await app.call('lead', 'PATCH', `/api/boards/${b.id}`, { require_approval: true })
  const g = (await app.call('lead', 'GET', `/api/boards/${b.id}`)).data.groups[0]
  const ownerless = (await app.call('alex', 'POST', '/api/items', { board_id: b.id, group_id: g.id, title: 'No owner', reviewer_id: app.users.sam.id, status: 'review' })).data.item
  assert.equal((await app.call('sam', 'POST', `/api/items/${ownerless.id}/approve`)).status, 403)
  const owned = (await app.call('alex', 'POST', '/api/items', { board_id: b.id, group_id: g.id, title: 'Owned', assignee_id: app.users.alex.id, reviewer_id: app.users.sam.id, status: 'review' })).data.item
  app.sql("UPDATE users SET subteam_id = 'st_elec' WHERE id = ?", app.users.sam.id)
  assert.equal((await app.call('sam', 'POST', `/api/items/${owned.id}/approve`)).status, 403)
  assert.equal((await app.call('sam', 'PATCH', `/api/items/${owned.id}`, { status: 'done' })).status, 403)
})
