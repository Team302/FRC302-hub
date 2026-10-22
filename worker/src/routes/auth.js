import { bootstrapAdmin, clerkConfigured, devLoginEnabled, signDevToken } from '../lib/auth.js'
import { forbidden, json, notFound, readBody } from '../lib/http.js'
import * as v from '../lib/validate.js'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

// Dev sign-in has no password, so by default it only answers the computer running the server.
// Two signs of another device: the app was opened by a network address instead of localhost, or
// the Vite dev proxy reports a non-loopback client (X-Dev-Client-Address, frontend/vite.config.js;
// a proxied request otherwise looks local). DEV_LOGIN_LAN=on (npm run dev:lan) lets them in on purpose.
const LAN_REFUSED = 'Development sign-in only works on the computer running the server (open http://localhost:5173 there). To allow other devices on this network, restart it with npm run dev:lan.'

function assertDevRequest(request, env) {
  if (!devLoginEnabled(env)) throw notFound('That page')
  if (env.DEV_LOGIN_LAN === 'on') return
  const client = request.headers.get('X-Dev-Client-Address')
  if (!LOCAL_HOSTS.has(new URL(request.url).hostname) || (client && !LOOPBACK.has(client))) throw forbidden(LAN_REFUSED)
}

export function authRoutes(router) {
  // What the browser needs to show a sign-in screen. Public, and holds nothing secret.
  router.get('/api/auth/config', (_req, env) => json({
    mode: clerkConfigured(env) ? 'clerk' : devLoginEnabled(env) ? 'dev' : 'off',
    clerk_publishable_key: clerkConfigured(env) ? env.CLERK_PUBLISHABLE_KEY || '' : '',
    team_name: env.TEAM_NAME || 'FRC Team 302',
  }))

  // Local development only (see lib/auth.js devLoginEnabled). Signs in as an existing user by
  // email, or as BOOTSTRAP_ADMIN_EMAIL on an empty database.
  router.post('/api/auth/dev-login', async (request, env) => {
    assertDevRequest(request, env)
    const body = await readBody(request)
    const email = v.email(body.email)
    let row = await env.DB.prepare('SELECT id, is_active FROM users WHERE lower(email) = ?').bind(email).first()
    if (!row) {
      const id = await bootstrapAdmin(env, email)
      row = id ? { id, is_active: 1 } : null
    }
    if (!row || !row.is_active) throw forbidden('No active team member has that email.')
    return json({ token: await signDevToken(env, row.id) })
  })

  router.get('/api/auth/dev-users', async (request, env) => {
    assertDevRequest(request, env)
    const { results } = await env.DB.prepare('SELECT email, name, role FROM users WHERE is_active = 1 ORDER BY role, name').all()
    return json({ users: results, bootstrap_email: results.length ? null : env.BOOTSTRAP_ADMIN_EMAIL || null })
  })
}
