// People and subteams. Mentors (admin) manage the roster; everyone can see who is on the team.
// Emails are shown to leads and mentors only: most members are minors, and a roster of their
// addresses has no business being visible to every account.
import { atLeast, requireRole, ROLES } from '../lib/auth.js'
import { logActivity } from '../lib/activity.js'
import { badRequest, conflict, forbidden, json, newId, notFound, readBody } from '../lib/http.js'
import * as v from '../lib/validate.js'

const COLORS = ['gray', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'violet', 'pink']
export { COLORS }

function present(user, viewer) {
  const out = { id: user.id, name: user.name, role: user.role, subteam_id: user.subteam_id, is_active: !!user.is_active }
  if (atLeast(viewer, 'lead') || viewer.id === user.id) out.email = user.email
  if (atLeast(viewer, 'admin')) {
    out.last_seen_at = user.last_seen_at
    out.has_signed_in = !!user.clerk_user_id || !!user.last_seen_at
  }
  return out
}

async function activeAdminCount(env) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1").first()
  return row.n
}

export function teamRoutes(router, authed) {
  router.get('/api/me', authed(async (_req, _env, user) => json({ user })))

  router.patch('/api/me', authed(async (request, env, user) => {
    const body = await readBody(request)
    const name = v.text(body.name, 'Name', { max: 80, required: true })
    // Names show on notifications ("Mentor Mo assigned you…"), so no one can take another active
    // person's name.
    if (await env.DB.prepare('SELECT 1 FROM users WHERE is_active = 1 AND id <> ? AND lower(trim(name)) = lower(?)').bind(user.id, name.trim()).first()) {
      throw conflict('Someone on the team already has that name. Add a last initial.', 'name_taken')
    }
    await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, user.id).run()
    return json({ user: { ...user, name } })
  }))

  router.get('/api/users', authed(async (request, env, user) => {
    const includeInactive = atLeast(user, 'admin') && new URL(request.url).searchParams.get('all') === '1'
    const { results } = await env.DB.prepare(
      `SELECT id, email, name, role, subteam_id, is_active, clerk_user_id, last_seen_at FROM users
        ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY name COLLATE NOCASE`
    ).all()
    return json({ users: results.map((u) => present(u, user)) })
  }))

  router.post('/api/users', authed(async (request, env, user) => {
    requireRole(user, 'admin')
    const body = await readBody(request)
    const email = v.email(body.email)
    const name = v.text(body.name, 'Name', { max: 80, required: true })
    const role = v.oneOf(body.role ?? 'member', 'Role', ROLES)
    const subteamId = v.id(body.subteam_id, 'Subteam') ?? null
    if (subteamId && !(await env.DB.prepare('SELECT 1 FROM subteams WHERE id = ?').bind(subteamId).first())) throw badRequest('That subteam does not exist.')
    const existing = await env.DB.prepare('SELECT id, is_active FROM users WHERE lower(email) = ?').bind(email).first()
    if (existing?.is_active) throw conflict('Someone with that email is already on the team.', 'duplicate')
    let id = existing?.id
    if (existing) {
      // Re-adding a former member reactivates their row (and keeps their history), with the
      // Clerk link cleared so a new login can claim it.
      await env.DB.prepare('UPDATE users SET name = ?, role = ?, subteam_id = ?, is_active = 1, clerk_user_id = NULL WHERE id = ?').bind(name, role, subteamId, id).run()
    } else {
      id = newId('usr')
      await env.DB.prepare('INSERT INTO users (id, email, name, role, subteam_id) VALUES (?, ?, ?, ?, ?)').bind(id, email, name, role, subteamId).run()
    }
    await logActivity(env, request, user, { action: 'user.add', entity: 'user', entityId: id, summary: `Added ${name} as ${role}` })
    const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
    return json({ user: present(row, user) }, { status: 201 })
  }))

  router.patch('/api/users/:id', authed(async (request, env, user) => {
    requireRole(user, 'admin')
    const body = await readBody(request)
    const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(request.params.id).first()
    if (!target) throw notFound('That person')
    const name = v.text(body.name, 'Name', { max: 80, required: body.name !== undefined })
    const role = v.oneOf(body.role, 'Role', ROLES)
    const subteamId = v.id(body.subteam_id, 'Subteam')
    const isActive = body.is_active === undefined ? undefined : !!body.is_active
    const losingAdmin = target.role === 'admin' && target.is_active && ((role && role !== 'admin') || isActive === false)
    if (losingAdmin && (await activeAdminCount(env)) <= 1) throw conflict('The team needs at least one active mentor (admin). Promote someone else first.', 'last_admin')
    const sets = []
    const binds = []
    if (name !== undefined) { sets.push('name = ?'); binds.push(name) }
    if (role !== undefined) { sets.push('role = ?'); binds.push(role) }
    if (subteamId !== undefined) { sets.push('subteam_id = ?'); binds.push(subteamId) }
    if (isActive !== undefined) { sets.push('is_active = ?'); binds.push(isActive ? 1 : 0) }
    if (!sets.length) throw badRequest('Nothing to change.')
    await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, target.id).run()
    // Removal takes effect on their devices too: no more pushes, and their calendar link stops.
    if (isActive === false) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').bind(target.id),
        env.DB.prepare('UPDATE users SET calendar_token_hash = NULL WHERE id = ?').bind(target.id),
      ])
    }
    const changes = [role && role !== target.role && `role ${target.role} → ${role}`, isActive === false && 'removed', isActive === true && !target.is_active && 'reactivated'].filter(Boolean)
    await logActivity(env, request, user, { action: 'user.update', entity: 'user', entityId: target.id, summary: `${target.name}: ${changes.join(', ') || 'details changed'}` })
    const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(target.id).first()
    return json({ user: present(row, user) })
  }))

  // ── Subteams ──
  router.get('/api/subteams', authed(async (_req, env) => {
    const { results } = await env.DB.prepare('SELECT id, name, color, position FROM subteams ORDER BY position, name').all()
    return json({ subteams: results })
  }))

  router.post('/api/subteams', authed(async (request, env, user) => {
    requireRole(user, 'admin')
    const body = await readBody(request)
    const name = v.text(body.name, 'Name', { max: 40, required: true })
    const color = v.oneOf(body.color ?? 'gray', 'Color', COLORS)
    const id = newId('st')
    const max = await env.DB.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM subteams').first()
    try {
      await env.DB.prepare('INSERT INTO subteams (id, name, color, position) VALUES (?, ?, ?, ?)').bind(id, name, color, max.p).run()
    } catch (e) {
      if (/unique/i.test(String(e?.message))) throw conflict('A subteam with that name already exists.')
      throw e
    }
    return json({ subteam: { id, name, color, position: max.p } }, { status: 201 })
  }))

  router.patch('/api/subteams/:id', authed(async (request, env, user) => {
    requireRole(user, 'admin')
    const body = await readBody(request)
    const name = v.text(body.name, 'Name', { max: 40, required: body.name !== undefined })
    const color = v.oneOf(body.color, 'Color', COLORS)
    const row = await env.DB.prepare('SELECT * FROM subteams WHERE id = ?').bind(request.params.id).first()
    if (!row) throw notFound('That subteam')
    await env.DB.prepare('UPDATE subteams SET name = ?, color = ? WHERE id = ?').bind(name ?? row.name, color ?? row.color, row.id).run()
    return json({ subteam: { ...row, name: name ?? row.name, color: color ?? row.color } })
  }))

  router.delete('/api/subteams/:id', authed(async (request, env, user) => {
    requireRole(user, 'admin')
    const res = await env.DB.prepare('DELETE FROM subteams WHERE id = ?').bind(request.params.id).run()
    if (!res.meta?.changes) throw notFound('That subteam')
    return json({ ok: true })
  }))

  router.get('/api/activity', authed(async (request, env, user) => {
    if (!atLeast(user, 'admin')) throw forbidden('Only mentors can see the activity log.')
    const params = new URL(request.url).searchParams
    const before = Number.parseInt(params.get('before') || '', 10)
    const entity = params.get('entity')
    const where = []
    const binds = []
    if (Number.isFinite(before)) { where.push('a.id < ?'); binds.push(before) }
    if (entity && /^[a-z_]{1,20}$/.test(entity)) { where.push('a.entity = ?'); binds.push(entity) }
    const { results } = await env.DB.prepare(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.summary, a.ip, a.created_at, u.name AS actor_name
         FROM activity a LEFT JOIN users u ON u.id = a.actor_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.id DESC LIMIT 100`
    ).bind(...binds).all()
    return json({ activity: results })
  }))
}
