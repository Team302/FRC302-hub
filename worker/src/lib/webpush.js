// Web Push, done with WebCrypto only (no libraries):
//   - VAPID (RFC 8292): an ES256 JWT signed with the server's key, so push services know the
//     messages come from this app.
//   - Message encryption (RFC 8291, "aes128gcm" from RFC 8188): only the browser that subscribed
//     can read the notification text; the push service (Google, Mozilla, Apple) can't.
//
// Keys (wrangler secrets / .dev.vars), made by `npm run vapid`:
//   VAPID_PUBLIC_KEY   base64url of the 65-byte uncompressed P-256 public key (given to browsers)
//   VAPID_PRIVATE_KEY  base64url of the 32-byte private scalar
//   VAPID_SUBJECT      mailto: or https: contact for push services (optional)

const enc = new TextEncoder()

export function b64urlEncode(bytes) {
  let s = ''
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(text) {
  const padded = String(text).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (String(text).length % 4)) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) { out.set(p, i); i += p.length }
  return out
}

export function pushConfigured(env) {
  return typeof env?.VAPID_PUBLIC_KEY === 'string' && env.VAPID_PUBLIC_KEY.length > 80 && typeof env?.VAPID_PRIVATE_KEY === 'string' && env.VAPID_PRIVATE_KEY.length > 40
}

// Only the push services browsers actually use. The endpoint is a URL this server will POST to,
// so accepting any URL would let a signed-in user make the server call arbitrary hosts.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^(.+\.)?push\.apple\.com$/, /^(.+\.)?notify\.windows\.com$/, /^push\.services\.mozilla\.com$/]
export function allowedEndpoint(endpoint) {
  try {
    const u = new URL(endpoint)
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname))
  } catch {
    return false
  }
}

const keyCache = new Map()
async function vapidSigningKey(env) {
  const cacheKey = env.VAPID_PRIVATE_KEY
  if (!keyCache.has(cacheKey)) {
    const pub = b64urlDecode(env.VAPID_PUBLIC_KEY)
    const jwk = { kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE_KEY, x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)), ext: true }
    keyCache.set(cacheKey, crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']))
  }
  return keyCache.get(cacheKey)
}

export async function vapidAuthorization(env, endpoint, now = Date.now()) {
  const aud = new URL(endpoint).origin
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:admin@example.org' })))
  // WebCrypto ECDSA signatures are already the raw r||s form JWS wants.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidSigningKey(env), enc.encode(`${header}.${claims}`))
  return `vapid t=${header}.${claims}.${b64urlEncode(sig)}, k=${env.VAPID_PUBLIC_KEY}`
}

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8))
}

// RFC 8291 §3: encrypt `payload` for the subscription's p256dh/auth. Returns the request body.
export async function encryptPayload(payload, p256dh, auth, { salt = crypto.getRandomValues(new Uint8Array(16)), serverKeys } = {}) {
  const uaPublic = b64urlDecode(p256dh)
  const authSecret = b64urlDecode(auth)
  const ephemeral = serverKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, ephemeral.privateKey, 256))

  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  // One record: the payload, then the 0x02 "last record" delimiter (no padding).
  const plaintext = concat(enc.encode(payload), new Uint8Array([2]))
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext))

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = asPublic.length
  header.set(asPublic, 21)
  return concat(header, ciphertext)
}

// Sends one notification to every device a person turned push on for. Gone subscriptions
// (404/410) are deleted. Never throws: a push failure must not break the request that caused it.
export async function pushToUser(env, userId, message) {
  if (!pushConfigured(env)) return { sent: 0 }
  const { results } = await env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').bind(userId).all()
  let sent = 0
  await Promise.all(results.map(async (sub) => {
    try {
      if (!allowedEndpoint(sub.endpoint)) return
      const body = await encryptPayload(JSON.stringify(message).slice(0, 3000), sub.p256dh, sub.auth)
      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          Authorization: await vapidAuthorization(env, sub.endpoint),
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: '86400',
          Urgency: 'normal',
        },
        body,
      })
      if (res.status === 404 || res.status === 410) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run()
      } else if (res.ok) {
        sent++
        await env.DB.prepare("UPDATE push_subscriptions SET last_ok_at = datetime('now') WHERE id = ?").bind(sub.id).run()
      } else {
        console.warn('[push]', res.status, new URL(sub.endpoint).hostname)
      }
    } catch (e) {
      console.warn('[push] failed', e?.message)
    }
  }))
  return { sent }
}
