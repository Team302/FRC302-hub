// Web Push subscriptions: one per browser/device a person turns notifications on in.
import { badRequest, HttpError, json, newId, readBody } from '../lib/http.js'
import { allowedEndpoint, b64urlDecode, pushConfigured, pushToUser } from '../lib/webpush.js'

function cleanSubscription(body) {
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : ''
  if (!allowedEndpoint(endpoint) || endpoint.length > 1000) throw badRequest('That isn’t a push service this app sends to.')
  const { p256dh, auth } = body.keys || {}
  let ok = false
  try { ok = b64urlDecode(p256dh).length === 65 && b64urlDecode(auth).length === 16 } catch { ok = false }
  if (!ok) throw badRequest('The browser sent invalid push keys.')
  return { endpoint, p256dh, auth }
}

export function pushRoutes(router, authed) {
  router.get('/api/push/config', authed(async (_req, env, user) => {
    const { results } = await env.DB.prepare('SELECT endpoint FROM push_subscriptions WHERE user_id = ?').bind(user.id).all()
    return json({ enabled: pushConfigured(env), public_key: pushConfigured(env) ? env.VAPID_PUBLIC_KEY : null, endpoints: results.map((r) => r.endpoint) })
  }))

  // Saving the same endpoint again from the same browser (same keys) moves it to whoever is
  // signed in now. Someone who only knows the endpoint URL can't take it over: the keys must match.
  router.post('/api/push/subscriptions', authed(async (request, env, user) => {
    if (!pushConfigured(env)) throw new HttpError(503, 'Push notifications aren’t set up on this server yet.', 'push_not_configured')
    const sub = cleanSubscription(await readBody(request))
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').bind(user.id).first()
    if (count.n >= 10) await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = (SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY created_at LIMIT 1)').bind(user.id).run()
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, user_agent = excluded.user_agent
        WHERE push_subscriptions.p256dh = excluded.p256dh AND push_subscriptions.auth = excluded.auth`
    ).bind(newId('psh'), user.id, sub.endpoint, sub.p256dh, sub.auth, (request.headers.get('User-Agent') || '').slice(0, 200)).run()
    const saved = await env.DB.prepare('SELECT user_id FROM push_subscriptions WHERE endpoint = ?').bind(sub.endpoint).first()
    if (saved?.user_id !== user.id) throw new HttpError(409, 'That device is registered differently. Turn notifications off and on again in this browser.', 'push_conflict')
    return json({ ok: true }, { status: 201 })
  }))

  router.delete('/api/push/subscriptions', authed(async (request, env, user) => {
    const body = await readBody(request)
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(String(body.endpoint || ''), user.id).run()
    return json({ ok: true })
  }))

  router.post('/api/push/test', authed(async (_req, env, user) => {
    const res = await pushToUser(env, user.id, { title: 'Team 302', body: 'Notifications are on for this device.', url: '/inbox', tag: 'test' })
    return json(res)
  }))
}
