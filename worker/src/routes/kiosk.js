// Shop kiosk: a tablet by the shop door where students tap their name to check in to whatever
// meeting is live. It's better evidence than self check-in from a phone (the tablet is in the
// room), but anyone at the tablet can tap anyone's name, so every kiosk mark is tagged with the
// kiosk and whoever runs the meeting can correct it.
//
// The kiosk URL (/kiosk/<token>) is the credential; only SHA-256(token) is stored. With it you can
// see first names + last initials and the live meeting's title, and record check-ins. Nothing
// else: no tasks, no vault, no emails. Leadership and mentor meetings never appear on a kiosk.
// Leads create kiosks (they expire, default 120 days) and revoke them.
import { logActivity, rateLimit } from '../lib/activity.js'
import { requireRole } from '../lib/auth.js'
import { HttpError, json, newId, notFound, readBody } from '../lib/http.js'
import * as v from '../lib/validate.js'
import { checkOut, LATE_AFTER_MIN } from './meetings.js'

const KIOSK_KINDS = ['general', 'build', 'subteam']
const CHECKINS_PER_HOUR = 400

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('')

// "Ava Thompson" → "Ava T."
export const shortName = (name) => {
  const parts = String(name).trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)[0]}.` : parts[0]
}

async function kioskFor(env, token) {
  if (!/^[0-9a-f]{64}$/.test(token || '')) throw notFound('That kiosk link')
  const kiosk = await env.DB.prepare(
    "SELECT * FROM kiosks WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > datetime('now')"
  ).bind(await sha256Hex(token)).first()
  // One answer for wrong, revoked and expired, so a guesser learns nothing.
  if (!kiosk) throw new HttpError(404, 'This kiosk link isn’t active. Ask a lead for a new one.', 'kiosk_inactive')
  return kiosk
}

const liveMeetings = (env) => env.DB.prepare(
  `SELECT id, title, kind, subteam_id, starts_at FROM meetings WHERE status = 'live' AND kind IN (${KIOSK_KINDS.map(() => '?').join(', ')}) ORDER BY starts_at DESC`
).bind(...KIOSK_KINDS).all()

export function kioskRoutes(router, authed) {
  // ── Managing kiosks (leads) ──
  router.get('/api/kiosks', authed(async (_req, env, user) => {
    requireRole(user, 'lead')
    const { results } = await env.DB.prepare(
      `SELECT k.id, k.name, k.created_at, k.expires_at, k.last_used_at, u.name AS created_by_name
         FROM kiosks k LEFT JOIN users u ON u.id = k.created_by
        WHERE k.revoked_at IS NULL AND k.expires_at > datetime('now') ORDER BY k.created_at DESC`
    ).all()
    return json({ kiosks: results })
  }))

  router.post('/api/kiosks', authed(async (request, env, user) => {
    requireRole(user, 'lead', 'Only leads and mentors can set up a kiosk.')
    const body = await readBody(request)
    const name = v.text(body.name, 'Name', { max: 60, required: true })
    const days = v.int(body.days, 'Days', { min: 1, max: 365 }) ?? 120
    const token = randomToken()
    const id = newId('ksk')
    await env.DB.prepare(`INSERT INTO kiosks (id, name, token_hash, created_by, expires_at) VALUES (?, ?, ?, ?, datetime('now', '+${days} days'))`)
      .bind(id, name, await sha256Hex(token), user.id).run()
    await logActivity(env, request, user, { action: 'kiosk.create', entity: 'kiosk', entityId: id, summary: `Set up kiosk “${name}” for ${days} days` })
    // The token is shown once; only its hash is kept.
    return json({ kiosk: await env.DB.prepare('SELECT id, name, created_at, expires_at FROM kiosks WHERE id = ?').bind(id).first(), token }, { status: 201 })
  }))

  router.delete('/api/kiosks/:id', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const kiosk = await env.DB.prepare('SELECT id, name FROM kiosks WHERE id = ? AND revoked_at IS NULL').bind(request.params.id).first()
    if (!kiosk) throw notFound('That kiosk')
    await env.DB.prepare("UPDATE kiosks SET revoked_at = datetime('now') WHERE id = ?").bind(kiosk.id).run()
    await logActivity(env, request, user, { action: 'kiosk.revoke', entity: 'kiosk', entityId: kiosk.id, summary: `Turned off kiosk “${kiosk.name}”` })
    return json({ ok: true })
  }))

  // ── The kiosk itself (no sign-in; the token is the credential) ──
  router.get('/api/kiosk/:token', async (request, env) => {
    const kiosk = await kioskFor(env, request.params.token)
    const [{ results: meetings }, { results: people }, { results: subteams }] = await Promise.all([
      liveMeetings(env),
      env.DB.prepare("SELECT id, name, subteam_id FROM users WHERE is_active = 1 AND role <> 'admin' ORDER BY name COLLATE NOCASE").all(),
      env.DB.prepare('SELECT id, name FROM subteams').all(),
    ])
    const ids = meetings.map((m) => m.id)
    const marks = ids.length
      ? (await env.DB.prepare(`SELECT meeting_id, user_id, status, checked_out_at FROM attendance WHERE meeting_id IN (${ids.map(() => '?').join(', ')})`).bind(...ids).all()).results
      : []
    await env.DB.prepare("UPDATE kiosks SET last_used_at = datetime('now') WHERE id = ?").bind(kiosk.id).run()
    return json({
      kiosk: { name: kiosk.name },
      team: env.TEAM_NAME || 'Team 302',
      meetings: meetings.map((m) => ({ id: m.id, title: m.title, subteam_id: m.subteam_id })),
      subteams,
      people: people.map((p) => ({
        id: p.id,
        name: shortName(p.name),
        subteam_id: p.subteam_id,
        checked_in: Object.fromEntries(marks.filter((r) => r.user_id === p.id).map((r) => [r.meeting_id, r.status])),
        checked_out: Object.fromEntries(marks.filter((r) => r.user_id === p.id && r.checked_out_at).map((r) => [r.meeting_id, true])),
      })),
    })
  })

  router.post('/api/kiosk/:token/checkin', async (request, env) => {
    const kiosk = await kioskFor(env, request.params.token)
    if (!(await rateLimit(env, `kiosk:${kiosk.id}`, CHECKINS_PER_HOUR, 3600))) throw new HttpError(429, 'Too many check-ins from this kiosk. Wait a bit.', 'rate_limited')
    const body = await readBody(request)
    const meetingId = v.id(body.meeting_id, 'Meeting', { nullable: false })
    const userId = v.id(body.user_id, 'Person', { nullable: false })
    const meeting = await env.DB.prepare(
      `SELECT id, starts_at FROM meetings WHERE id = ? AND status = 'live' AND kind IN (${KIOSK_KINDS.map(() => '?').join(', ')})`
    ).bind(meetingId, ...KIOSK_KINDS).first()
    if (!meeting) throw new HttpError(409, 'That meeting isn’t running any more.', 'not_live')
    const person = await env.DB.prepare("SELECT id FROM users WHERE id = ? AND is_active = 1 AND role <> 'admin'").bind(userId).first()
    if (!person) throw notFound('That person')
    const late = Date.now() > Date.parse(meeting.starts_at) + LATE_AFTER_MIN * 60 * 1000
    // Never overwrites a status: a mark the meeting runner set (or an earlier check-in) stays.
    // Someone who checked out and comes back is simply back (the check-out is cleared).
    await env.DB.prepare(
      `INSERT INTO attendance (meeting_id, user_id, status, recorded_by, via, checked_in_at) VALUES (?, ?, ?, NULL, ?, datetime('now'))
       ON CONFLICT(meeting_id, user_id) DO UPDATE SET checked_out_at = NULL WHERE attendance.status IN ('present', 'late')`
    ).bind(meeting.id, person.id, late ? 'late' : 'present', `kiosk:${kiosk.id}`).run()
    const row = await env.DB.prepare('SELECT status FROM attendance WHERE meeting_id = ? AND user_id = ?').bind(meeting.id, person.id).first()
    return json({ status: row.status })
  })

  router.post('/api/kiosk/:token/checkout', async (request, env) => {
    const kiosk = await kioskFor(env, request.params.token)
    if (!(await rateLimit(env, `kiosk:${kiosk.id}`, CHECKINS_PER_HOUR, 3600))) throw new HttpError(429, 'Too many check-ins from this kiosk. Wait a bit.', 'rate_limited')
    const body = await readBody(request)
    const meeting = await env.DB.prepare(
      `SELECT id, status FROM meetings WHERE id = ? AND kind IN (${KIOSK_KINDS.map(() => '?').join(', ')})`
    ).bind(v.id(body.meeting_id, 'Meeting', { nullable: false }), ...KIOSK_KINDS).first()
    if (!meeting) throw notFound('That meeting')
    return json(await checkOut(env, meeting, v.id(body.user_id, 'Person', { nullable: false })))
  })
}
