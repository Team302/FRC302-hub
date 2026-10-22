// ─── Sessions ────────────────────────────────────────────────────────────────
// Two schemes, chosen by configuration, never both at once:
//
//   Clerk (production). The browser holds a Clerk session token and sends it as
//   `Authorization: Bearer …`. It is verified locally against CLERK_JWT_KEY (RS256 pinned,
//   issuer derived from CLERK_PUBLISHABLE_KEY, azp pinned to APP_URL) — the same networkless
//   check ProjectPro uses (its lib/clerkSession.js). A valid token proves an email and nothing
//   more; the `users` table decides who is on the team. Unknown emails get a 401, never an account.
//
//   Dev login (local only). An HS256 token this worker signs with JWT_SECRET, issued by
//   POST /api/auth/dev-login. Refused unless ENVIRONMENT=development AND DEV_LOGIN=on AND Clerk is
//   not configured, and the route itself only answers requests to localhost.
//
// Role and is_active are re-read from the row on EVERY request, so demoting or removing someone
// takes effect immediately, not when their token expires.
import { importSPKI, jwtVerify, SignJWT } from 'jose'
import { HttpError } from './http.js'

export const ROLE_RANK = { member: 1, lead: 2, admin: 3 }
export const ROLES = Object.keys(ROLE_RANK)

export const atLeast = (user, role) => (ROLE_RANK[user?.role] || 0) >= ROLE_RANK[role]

export function requireRole(user, role, message) {
  if (!atLeast(user, role)) throw new HttpError(403, message || `Only ${role === 'admin' ? 'mentors' : 'leads and mentors'} can do that.`, 'forbidden')
}

const trimmed = (v) => (typeof v === 'string' ? v.trim() : '')

export const clerkConfigured = (env) => trimmed(env?.CLERK_JWT_KEY) !== ''

// The .dev.vars.example placeholder is public, so a JWT_SECRET still starting with it signs nothing.
export function devLoginEnabled(env) {
  const secret = trimmed(env?.JWT_SECRET)
  return env?.ENVIRONMENT === 'development' && env?.DEV_LOGIN === 'on' && !clerkConfigured(env) && secret.length >= 32 && !secret.startsWith('change-me')
}

// ── Clerk ──
function normalizePem(raw) {
  const value = trimmed(raw).replace(/\\n/g, '\n')
  if (!value) return ''
  if (value.includes('-----BEGIN')) return value
  const body = value.replace(/\s+/g, '')
  return `-----BEGIN PUBLIC KEY-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`
}

const keyCache = new Map()
async function clerkKey(env) {
  const pem = normalizePem(env.CLERK_JWT_KEY)
  if (!keyCache.has(pem)) keyCache.set(pem, importSPKI(pem, 'RS256').catch((e) => { keyCache.delete(pem); throw e }))
  return keyCache.get(pem)
}

export function clerkIssuer(env) {
  const explicit = trimmed(env?.CLERK_ISSUER)
  if (explicit) return explicit.replace(/\/+$/, '')
  const body = /^pk_(?:test|live)_([A-Za-z0-9+/_-]+=*)$/.exec(trimmed(env?.CLERK_PUBLISHABLE_KEY))?.[1]
  if (!body) return ''
  try {
    const b64 = body.replace(/-/g, '+').replace(/_/g, '/')
    const host = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/\$+$/, '')
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? `https://${host}` : ''
  } catch {
    return ''
  }
}

const originOf = (v) => { try { return new URL(String(v).trim()).origin } catch { return '' } }

export function authorizedParty(azp, env) {
  if (typeof azp !== 'string' || !azp) return false
  if (env?.ENVIRONMENT !== 'production' && /^http:\/\/localhost(:\d{1,5})?$/.test(azp)) return true
  const allowed = [env?.APP_URL, ...String(env?.CLERK_AUTHORIZED_PARTIES || '').split(',')].map(originOf).filter(Boolean)
  return allowed.includes(azp.replace(/\/+$/, ''))
}

async function verifyClerk(token, env) {
  const issuer = clerkIssuer(env)
  if (!issuer) return null
  let payload
  try {
    ({ payload } = await jwtVerify(token, await clerkKey(env), { algorithms: ['RS256'], issuer, clockTolerance: 5 }))
  } catch {
    return null
  }
  if (typeof payload.exp !== 'number' || typeof payload.sub !== 'string' || !payload.sub) return null
  if (payload.sts !== undefined && payload.sts !== 'active') return null
  if (!authorizedParty(payload.azp, env)) return null
  const email = ['email', 'email_address', 'primary_email_address', 'primary_email']
    .map((k) => payload[k]).find((v) => typeof v === 'string' && v.includes('@'))?.trim().toLowerCase()
  if (!email) return null
  // The session-token template must carry "email_verified": "{{user.email_verified}}". Without
  // it there is no proof the email belongs to this login, and the email is what picks the row.
  if (payload.email_verified !== true && payload.email_verified !== 'true') return null
  return { clerkUserId: payload.sub, email }
}

// Clerk identity → users row id, or null. Rows are matched by clerk_user_id first, then by email
// (first sign-in after a mentor added them). A row already linked to a different Clerk login is
// refused: one row, one login.
async function resolveClerkUser(env, { clerkUserId, email }) {
  const linked = await env.DB.prepare('SELECT id FROM users WHERE clerk_user_id = ? AND is_active = 1').bind(clerkUserId).first()
  if (linked) return linked.id
  const row = await env.DB.prepare('SELECT id, clerk_user_id FROM users WHERE lower(email) = ?').bind(email).first()
  if (row) {
    if (row.clerk_user_id && row.clerk_user_id !== clerkUserId) return null
    if (!row.clerk_user_id) await env.DB.prepare('UPDATE users SET clerk_user_id = ? WHERE id = ? AND clerk_user_id IS NULL').bind(clerkUserId, row.id).run()
    return row.id
  }
  return bootstrapAdmin(env, email, clerkUserId)
}

// The very first mentor. BOOTSTRAP_ADMIN_EMAIL names them; it only works while the team has no
// admin at all, so once set up, the variable can't be used to mint a second admin.
export async function bootstrapAdmin(env, email, clerkUserId = null) {
  const wanted = trimmed(env?.BOOTSTRAP_ADMIN_EMAIL).toLowerCase()
  if (!wanted || wanted !== email) return null
  const anyAdmin = await env.DB.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").first()
  if (anyAdmin) return null
  const id = `usr_${crypto.randomUUID().replace(/-/g, '')}`
  await env.DB.prepare("INSERT OR IGNORE INTO users (id, email, name, role, clerk_user_id) VALUES (?, ?, ?, 'admin', ?)")
    .bind(id, email, email.split('@')[0], clerkUserId).run()
  const row = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = ?').bind(email).first()
  return row?.id ?? null
}

// ── Dev ──
const devSecret = (env) => new TextEncoder().encode(trimmed(env.JWT_SECRET))

export async function signDevToken(env, userId) {
  return new SignJWT({ uid: userId }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('12h').sign(devSecret(env))
}

async function verifyDev(token, env) {
  try {
    const { payload } = await jwtVerify(token, devSecret(env), { algorithms: ['HS256'], requiredClaims: ['exp'] })
    return typeof payload.uid === 'string' ? payload.uid : null
  } catch {
    return null
  }
}

// ── Middleware ──
function bearer(request) {
  return /^Bearer\s+(\S+)$/i.exec((request.headers.get('Authorization') || '').trim())?.[1] || ''
}

export async function authenticate(request, env) {
  const token = bearer(request)
  if (!token) throw new HttpError(401, 'Sign in to continue.', 'unauthenticated')
  let userId = null
  if (clerkConfigured(env)) {
    const identity = await verifyClerk(token, env)
    if (identity) userId = await resolveClerkUser(env, identity)
  } else if (devLoginEnabled(env)) {
    userId = await verifyDev(token, env)
  }
  if (!userId) throw new HttpError(401, 'Your session is not valid here. Ask a mentor to add you to the team.', 'unauthenticated')
  const user = await env.DB.prepare('SELECT id, email, name, role, subteam_id, is_active, last_seen_at FROM users WHERE id = ?').bind(userId).first()
  if (!user || !user.is_active) throw new HttpError(401, 'This account is not active.', 'inactive')
  // last_seen_at at most every 10 minutes, so a busy page doesn't write on every request.
  if (!user.last_seen_at || Date.parse(`${user.last_seen_at}Z`) < Date.now() - 10 * 60 * 1000) {
    await env.DB.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").bind(user.id).run()
  }
  return { id: user.id, email: user.email, name: user.name, role: user.role, subteam_id: user.subteam_id }
}
