// 302 Hub worker. Answers /api/*; everything else is the React app, served by Workers Assets
// (wrangler.toml [assets]). The app and the API share one origin, so there is no CORS: a
// cross-origin page can't read any answer, and auth is a bearer token, so there is no
// cookie for a cross-site form to ride on either.
import { Router } from 'itty-router'
import { authenticate } from './lib/auth.js'
import { HttpError } from './lib/http.js'
import { authRoutes } from './routes/auth.js'
import { boardRoutes } from './routes/boards.js'
import { homeRoutes } from './routes/home.js'
import { meetingRoutes } from './routes/meetings.js'
import { teamRoutes } from './routes/team.js'
import { vaultRoutes } from './routes/vault.js'

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
}

const authed = (handler) => async (request, env, ctx) => handler(request, env, await authenticate(request, env), ctx)

export function buildRouter() {
  const router = Router()
  authRoutes(router)
  teamRoutes(router, authed)
  boardRoutes(router, authed)
  meetingRoutes(router, authed)
  vaultRoutes(router, authed)
  homeRoutes(router, authed)
  router.get('/api/health', () => Response.json({ ok: true }))
  router.all('/api/*', () => { throw new HttpError(404, 'No such API route.', 'not_found') })
  return router
}

const router = buildRouter()

function withHeaders(response) {
  const out = new Response(response.body, response)
  for (const [k, val] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(k) || k === 'Cache-Control') out.headers.set(k, val)
  return out
}

export async function handle(request, env, ctx) {
  const { pathname } = new URL(request.url)
  if (!pathname.startsWith('/api/')) {
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 })
  }
  try {
    const response = await router.fetch(request, env, ctx)
    return withHeaders(response || Response.json({ error: 'No such API route.' }, { status: 404 }))
  } catch (e) {
    if (e instanceof HttpError) return withHeaders(Response.json({ error: e.message, code: e.code }, { status: e.status }))
    // Never echo internal error text: it can carry SQL or, in the vault, worse.
    console.error('[api]', request.method, pathname, e?.stack || e)
    return withHeaders(Response.json({ error: 'Something went wrong on the server.' }, { status: 500 }))
  }
}

export default { fetch: handle }
