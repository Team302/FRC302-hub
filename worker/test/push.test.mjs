// Web Push end to end: a fake browser subscribes, the server sends a notification, and the test
// plays the browser: checks the VAPID signature and decrypts the message per RFC 8291.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam } from './harness.mjs'
import { b64urlDecode, b64urlEncode, encryptPayload, allowedEndpoint } from '../src/lib/webpush.js'

async function vapidEnv() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', keys.privateKey)
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))
  return { VAPID_PUBLIC_KEY: b64urlEncode(raw), VAPID_PRIVATE_KEY: jwk.d, VAPID_SUBJECT: 'mailto:test@example.org', verifyKey: keys.publicKey }
}

// A browser's push keys.
async function fakeBrowser() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const auth = crypto.getRandomValues(new Uint8Array(16))
  const p256dh = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))
  return { keys, auth, p256dh, sub: { endpoint: `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`, keys: { p256dh: b64urlEncode(p256dh), auth: b64urlEncode(auth) } } }
}

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8))
}

// RFC 8291 decryption, as the browser does it. Written independently of the encrypt side.
async function decrypt(body, browser) {
  const salt = body.slice(0, 16)
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16)
  const idlen = body[20]
  const asPublic = body.slice(21, 21 + idlen)
  const ciphertext = body.slice(21 + idlen)
  assert.equal(rs, 4096)
  const serverKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: serverKey }, browser.keys.privateKey, 256))
  const te = new TextEncoder()
  const info = new Uint8Array([...te.encode('WebPush: info\0'), ...browser.p256dh, ...asPublic])
  const ikm = await hkdf(browser.auth, ecdh, info, 32)
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext))
  assert.equal(plain.at(-1), 2) // last-record delimiter
  return new TextDecoder().decode(plain.slice(0, -1))
}

function captureFetch() {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response(null, { status: 201 }) }
  return { calls, restore: () => { globalThis.fetch = original } }
}

test('encryption round-trips (RFC 8291)', async () => {
  const browser = await fakeBrowser()
  const body = await encryptPayload('{"hello":"dragons"}', browser.sub.keys.p256dh, browser.sub.keys.auth)
  assert.equal(await decrypt(body, browser), '{"hello":"dragons"}')
})

test('only real push services are accepted as endpoints', () => {
  assert.ok(allowedEndpoint('https://fcm.googleapis.com/fcm/send/abc'))
  assert.ok(allowedEndpoint('https://web.push.apple.com/abc'))
  assert.ok(allowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc'))
  for (const bad of ['http://fcm.googleapis.com/x', 'https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x', 'https://169.254.169.254/latest', 'not a url']) assert.ok(!allowedEndpoint(bad), bad)
})

test('assignment pushes an encrypted, signed notification to the assignee’s device', async () => {
  const vapid = await vapidEnv()
  const app = await makeTeam({ VAPID_PUBLIC_KEY: vapid.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: vapid.VAPID_PRIVATE_KEY, VAPID_SUBJECT: vapid.VAPID_SUBJECT })
  const cfg = await app.call('alex', 'GET', '/api/push/config')
  assert.equal(cfg.data.public_key, vapid.VAPID_PUBLIC_KEY)
  const browser = await fakeBrowser()
  assert.equal((await app.call('alex', 'POST', '/api/push/subscriptions', browser.sub)).status, 201)
  assert.equal((await app.call('alex', 'POST', '/api/push/subscriptions', { ...browser.sub, endpoint: 'https://evil.example/x' })).status, 400)
  assert.equal((await app.call('alex', 'POST', '/api/push/subscriptions', { ...browser.sub, keys: { p256dh: 'AAAA', auth: 'AAAA' } })).status, 400)

  const b = (await app.call('lead', 'POST', '/api/boards', { name: 'Robot' })).data.board
  const g = (await app.call('lead', 'GET', `/api/boards/${b.id}`)).data.groups[0]
  const cap = captureFetch()
  try {
    await app.call('lead', 'POST', '/api/items', { board_id: b.id, group_id: g.id, title: 'Wire the PDH', assignee_id: 'usr_alex' })
  } finally { cap.restore() }

  assert.equal(cap.calls.length, 1)
  const { url, init } = cap.calls[0]
  assert.equal(url, browser.sub.endpoint)
  assert.equal(init.headers['Content-Encoding'], 'aes128gcm')
  // VAPID: the JWT's audience is the push service and it verifies against our public key.
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(init.headers.Authorization)
  assert.ok(m)
  assert.equal(m[4], vapid.VAPID_PUBLIC_KEY)
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(m[2])))
  assert.equal(claims.aud, 'https://fcm.googleapis.com')
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vapid.verifyKey, b64urlDecode(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`)))
  const message = JSON.parse(await decrypt(new Uint8Array(init.body), browser))
  assert.equal(message.title, 'Assigned to you')
  assert.match(message.body, /Lead Lee assigned you “Wire the PDH” on Robot/)
  assert.match(message.url, new RegExp(`^/boards/${b.id}\\?item=itm_`))
})

test('gone subscriptions are removed; no push without VAPID keys', async () => {
  const vapid = await vapidEnv()
  const app = await makeTeam({ VAPID_PUBLIC_KEY: vapid.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: vapid.VAPID_PRIVATE_KEY })
  const browser = await fakeBrowser()
  await app.call('alex', 'POST', '/api/push/subscriptions', browser.sub)
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response(null, { status: 410 })
  try { await app.call('alex', 'POST', '/api/push/test') } finally { globalThis.fetch = original }
  assert.equal(app.sql('SELECT COUNT(*) AS n FROM push_subscriptions')[0].n, 0)

  const plain = await makeTeam()
  assert.equal((await plain.call('alex', 'GET', '/api/push/config')).data.enabled, false)
  assert.equal((await plain.call('alex', 'POST', '/api/push/subscriptions', browser.sub)).status, 503)
})
