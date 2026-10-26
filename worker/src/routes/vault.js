// The team credential vault. Rules:
//   - An entry is invisible (404, not 403) to anyone below its min_role, and, when it is limited
//     to subteams, to anyone not on one of them. Mentors see every subteam's entries.
//   - Listing never returns a secret. A secret leaves the server only through /reveal or /totp,
//     one entry at a time, each written to the activity log with who, when and from what IP,
//     and rate-limited per person so an account can't be used to scrape the vault.
//   - Leads can add entries for leads or members; only mentors can make or touch mentor-only
//     entries. Leads can edit entries they own; mentors can edit anything they can see.
//   - The secret itself is never returned by create/update, and editing an entry without
//     sending a new secret keeps the old one.
import { atLeast, requireRole, ROLE_RANK } from '../lib/auth.js'
import { logActivity, rateLimit } from '../lib/activity.js'
import { badRequest, forbidden, HttpError, json, newId, notFound, readBody } from '../lib/http.js'
import { normaliseSeed, totpCode } from '../lib/totp.js'
import * as v from '../lib/validate.js'
import { openSecret, sealSecret, vaultAad, vaultConfigured, VaultCryptoError } from '../lib/vaultCrypto.js'

const ACCESS = ['admin', 'lead', 'member']
const REVEALS_PER_HOUR = 30

// "st_a,st_b" (GROUP_CONCAT) → ['st_a', 'st_b']
const idList = (text) => (text ? text.split(',') : [])

// Role first, then subteams. Mentors aren't limited by subteam: they run the vault.
const canSee = (user, e) => atLeast(user, e.min_role) && (atLeast(user, 'admin') || !e.subteam_ids.length || e.subteam_ids.includes(user.subteam_id))

const SELECT_ENTRY = `SELECT v.*, u.name AS owner_name,
  (SELECT GROUP_CONCAT(s.subteam_id) FROM vault_entry_subteams s WHERE s.entry_id = v.id) AS subteam_list
  FROM vault_entries v LEFT JOIN users u ON u.id = v.owner_id`

function present(e, user) {
  return {
    id: e.id, name: e.name, url: e.url, username: e.username, notes: e.notes, min_role: e.min_role, subteam_ids: e.subteam_ids,
    owner_id: e.owner_id, owner_name: e.owner_name ?? null, has_secret: !!e.secret_enc, has_totp: !!e.totp_enc,
    rotated_at: e.rotated_at, created_at: e.created_at, updated_at: e.updated_at,
    can_edit: canEdit(user, e),
  }
}

const canEdit = (user, e) => atLeast(user, 'admin') || (atLeast(user, 'lead') && e.min_role !== 'admin' && (e.owner_id === user.id || e.created_by === user.id))

function requireVault(env) {
  if (!vaultConfigured(env)) throw new HttpError(503, 'The vault is not set up yet: a mentor needs to set the VAULT_KEY secret.', 'vault_not_configured')
}

async function getEntry(env, user, id) {
  const row = await env.DB.prepare(`${SELECT_ENTRY} WHERE v.id = ?`).bind(id).first()
  const e = row && { ...row, subteam_ids: idList(row.subteam_list) }
  if (!e || !canSee(user, e)) throw notFound('That vault entry')
  return e
}

// subteam_ids from a request: undefined = leave as is; [] = no limit. Every id must exist. A
// non-mentor can't limit an entry to subteams they aren't on: they'd lock themselves out.
async function subteamIds(env, user, raw) {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw) || raw.length > 20 || !raw.every((x) => typeof x === 'string')) throw badRequest('Subteams must be a list.')
  const ids = [...new Set(raw)]
  if (ids.length) {
    const { results } = await env.DB.prepare(`SELECT id FROM subteams WHERE id IN (${ids.map(() => '?').join(', ')})`).bind(...ids).all()
    if (results.length !== ids.length) throw badRequest('One of those subteams doesn’t exist.')
    if (!atLeast(user, 'admin') && !ids.includes(user.subteam_id)) throw badRequest('Include your own subteam, or you won’t be able to see the entry. A mentor can set any subteams.')
  }
  return ids
}

async function subteamNames(env, ids) {
  const { results } = await env.DB.prepare(`SELECT name FROM subteams WHERE id IN (${ids.map(() => '?').join(', ')}) ORDER BY name`).bind(...ids).all()
  return results.map((r) => r.name).join(' + ')
}

const setSubteams = (env, entryId, ids) => [
  env.DB.prepare('DELETE FROM vault_entry_subteams WHERE entry_id = ?').bind(entryId),
  ...ids.map((sid) => env.DB.prepare('INSERT INTO vault_entry_subteams (entry_id, subteam_id) VALUES (?, ?)').bind(entryId, sid)),
]

function cryptoFailure(e) {
  if (e instanceof VaultCryptoError) {
    console.error('[vault]', e.code)
    return new HttpError(500, e.code === 'unknown_key'
      ? 'This secret was saved with an encryption key the server no longer has. A mentor needs to restore VAULT_KEY_PREVIOUS or re-enter it.'
      : 'This secret could not be decrypted. A mentor should check the vault key configuration.', e.code)
  }
  return e
}

async function guardReveal(env, request, user) {
  if (!(await rateLimit(env, `reveal:${user.id}`, REVEALS_PER_HOUR, 3600))) {
    await logActivity(env, request, user, { action: 'vault.rate_limited', entity: 'vault', summary: 'Hit the hourly reveal limit' })
    throw new HttpError(429, `You’ve revealed ${REVEALS_PER_HOUR} secrets this hour. Try again later, or ask a mentor.`, 'rate_limited')
  }
}

// Re-seal under the current key if this blob was written with the previous one.
async function resealIfStale(env, entryId, column, plaintext, stale) {
  if (!stale) return
  const blob = await sealSecret(env, plaintext, vaultAad(entryId, column))
  await env.DB.prepare(`UPDATE vault_entries SET ${column} = ? WHERE id = ?`).bind(blob, entryId).run()
}

export function vaultRoutes(router, authed) {
  router.get('/api/vault', authed(async (_req, env, user) => {
    const allowed = ACCESS.filter((r) => ROLE_RANK[r] <= ROLE_RANK[user.role])
    const { results } = await env.DB.prepare(
      `${SELECT_ENTRY} WHERE v.min_role IN (${allowed.map(() => '?').join(', ')}) ORDER BY v.name COLLATE NOCASE`
    ).bind(...allowed).all()
    // The subteam check is the same function the single-entry routes use.
    const entries = results.map((r) => ({ ...r, subteam_ids: idList(r.subteam_list) })).filter((e) => canSee(user, e))
    return json({ configured: vaultConfigured(env), entries: entries.map((e) => present(e, user)) })
  }))

  router.post('/api/vault', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    requireVault(env)
    const body = await readBody(request)
    const minRole = v.oneOf(body.min_role ?? 'lead', 'Who can see it', ACCESS)
    if (minRole === 'admin') requireRole(user, 'admin', 'Only mentors can create mentor-only entries.')
    const id = newId('vlt')
    const secret = v.text(body.secret, 'Password', { max: 2000 })
    const totpRaw = v.text(body.totp, 'Authenticator key', { max: 500 })
    const seed = totpRaw ? normaliseSeed(totpRaw) : null
    if (totpRaw && !seed) throw badRequest('That authenticator key isn’t valid. Paste the setup key (letters A–Z and 2–7) or the otpauth:// link.')
    const ownerId = v.id(body.owner_id, 'Owner') ?? user.id
    const subteams = (await subteamIds(env, user, body.subteam_ids)) ?? []
    let secretEnc = null
    let totpEnc = null
    try {
      if (secret) secretEnc = await sealSecret(env, secret, vaultAad(id, 'secret_enc'))
      if (seed) totpEnc = await sealSecret(env, seed, vaultAad(id, 'totp_enc'))
    } catch (e) { throw cryptoFailure(e) }
    await env.DB.prepare(
      `INSERT INTO vault_entries (id, name, url, username, secret_enc, totp_enc, notes, min_role, owner_id, rotated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${secretEnc ? "datetime('now')" : 'NULL'}, ?)`
    ).bind(id, v.text(body.name, 'Name', { max: 100, required: true }), v.url(body.url, 'Link') ?? '', v.text(body.username, 'Username', { max: 200 }) ?? '',
      secretEnc, totpEnc, v.text(body.notes, 'Notes', { max: 2000 }) ?? '', minRole, ownerId, user.id).run()
    if (subteams.length) await env.DB.batch(setSubteams(env, id, subteams))
    const entry = await getEntry(env, user, id)
    await logActivity(env, request, user, { action: 'vault.create', entity: 'vault', entityId: id, summary: `Added “${entry.name}” (${minRole}+${subteams.length ? `, ${await subteamNames(env, subteams)} only` : ''})` })
    return json({ entry: present(entry, user) }, { status: 201 })
  }))

  router.patch('/api/vault/:id', authed(async (request, env, user) => {
    requireVault(env)
    const entry = await getEntry(env, user, request.params.id)
    if (!canEdit(user, entry)) throw forbidden('Only a mentor or this entry’s owner can change it.')
    const body = await readBody(request)
    const minRole = v.oneOf(body.min_role, 'Who can see it', ACCESS)
    if (minRole === 'admin') requireRole(user, 'admin', 'Only mentors can make an entry mentor-only.')
    const subteams = await subteamIds(env, user, body.subteam_ids)
    const sets = []
    const binds = []
    const plain = {
      name: v.text(body.name, 'Name', { max: 100, required: body.name !== undefined }),
      url: v.url(body.url, 'Link'),
      username: v.text(body.username, 'Username', { max: 200 }),
      notes: v.text(body.notes, 'Notes', { max: 2000 }),
      min_role: minRole,
      owner_id: atLeast(user, 'admin') ? v.id(body.owner_id, 'Owner') : undefined,
    }
    for (const [col, val] of Object.entries(plain)) if (val !== undefined) { sets.push(`${col} = ?`); binds.push(val) }
    const changed = []
    try {
      // secret: a string replaces it, null clears it, absent keeps it.
      if (body.secret === null) { sets.push('secret_enc = NULL'); changed.push('password cleared') } else if (body.secret !== undefined) {
        const secret = v.text(body.secret, 'Password', { max: 2000, required: true })
        sets.push('secret_enc = ?', "rotated_at = datetime('now')")
        binds.push(await sealSecret(env, secret, vaultAad(entry.id, 'secret_enc')))
        changed.push('password changed')
      }
      if (body.totp === null) { sets.push('totp_enc = NULL'); changed.push('authenticator removed') } else if (body.totp !== undefined) {
        const seed = normaliseSeed(body.totp)
        if (!seed) throw badRequest('That authenticator key isn’t valid.')
        sets.push('totp_enc = ?')
        binds.push(await sealSecret(env, seed, vaultAad(entry.id, 'totp_enc')))
        changed.push('authenticator changed')
      }
    } catch (e) { throw cryptoFailure(e) }
    const subteamsChanged = subteams !== undefined && [...subteams].sort().join() !== [...entry.subteam_ids].sort().join()
    if (!sets.length && !subteamsChanged) throw badRequest('Nothing to change.')
    sets.push("updated_at = datetime('now')")
    await env.DB.batch([
      env.DB.prepare(`UPDATE vault_entries SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, entry.id),
      ...(subteamsChanged ? setSubteams(env, entry.id, subteams) : []),
    ])
    if (minRole && minRole !== entry.min_role) changed.push(`access ${entry.min_role} → ${minRole}`)
    if (subteamsChanged) changed.push(`subteams ${entry.subteam_ids.length ? await subteamNames(env, entry.subteam_ids) : 'any'} → ${subteams.length ? await subteamNames(env, subteams) : 'any'}`)
    await logActivity(env, request, user, { action: 'vault.update', entity: 'vault', entityId: entry.id, summary: `Edited “${entry.name}”${changed.length ? `: ${changed.join(', ')}` : ''}` })
    const row = await env.DB.prepare(`${SELECT_ENTRY} WHERE v.id = ?`).bind(entry.id).first()
    return json({ entry: present({ ...row, subteam_ids: idList(row.subteam_list) }, user) })
  }))

  router.delete('/api/vault/:id', authed(async (request, env, user) => {
    requireRole(user, 'admin', 'Only mentors can delete vault entries.')
    const entry = await getEntry(env, user, request.params.id)
    await env.DB.prepare('DELETE FROM vault_entries WHERE id = ?').bind(entry.id).run()
    await logActivity(env, request, user, { action: 'vault.delete', entity: 'vault', entityId: entry.id, summary: `Deleted “${entry.name}”` })
    return json({ ok: true })
  }))

  router.post('/api/vault/:id/reveal', authed(async (request, env, user) => {
    requireVault(env)
    const entry = await getEntry(env, user, request.params.id)
    if (!entry.secret_enc) throw notFound('A saved password for that entry')
    await guardReveal(env, request, user)
    // Audit first: if the log write fails, nothing is revealed.
    await logActivity(env, request, user, { action: 'vault.reveal', entity: 'vault', entityId: entry.id, summary: `Revealed password for “${entry.name}”` })
    try {
      const { plaintext, stale } = await openSecret(env, entry.secret_enc, vaultAad(entry.id, 'secret_enc'))
      await resealIfStale(env, entry.id, 'secret_enc', plaintext, stale)
      return json({ secret: plaintext }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (e) { throw cryptoFailure(e) }
  }))

  router.post('/api/vault/:id/totp', authed(async (request, env, user) => {
    requireVault(env)
    const entry = await getEntry(env, user, request.params.id)
    if (!entry.totp_enc) throw notFound('An authenticator for that entry')
    await guardReveal(env, request, user)
    await logActivity(env, request, user, { action: 'vault.totp', entity: 'vault', entityId: entry.id, summary: `Got a 2FA code for “${entry.name}”` })
    try {
      const { plaintext, stale } = await openSecret(env, entry.totp_enc, vaultAad(entry.id, 'totp_enc'))
      await resealIfStale(env, entry.id, 'totp_enc', plaintext, stale)
      // The code only, never the seed: a code is useless in 30 seconds, the seed works forever.
      return json(await totpCode(plaintext), { headers: { 'Cache-Control': 'no-store' } })
    } catch (e) { throw cryptoFailure(e) }
  }))

  router.get('/api/vault/:id/audit', authed(async (request, env, user) => {
    requireRole(user, 'admin', 'Only mentors can see who opened an entry.')
    const entry = await getEntry(env, user, request.params.id)
    const { results } = await env.DB.prepare(
      `SELECT a.id, a.action, a.summary, a.ip, a.created_at, u.name AS actor_name
         FROM activity a LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.entity = 'vault' AND a.entity_id = ? ORDER BY a.id DESC LIMIT 200`
    ).bind(entry.id).all()
    return json({ audit: results })
  }))

  // After setting VAULT_KEY_PREVIOUS = old key and VAULT_KEY = new key: re-seal everything under
  // the new key, then VAULT_KEY_PREVIOUS can be deleted.
  router.post('/api/vault/rekey', authed(async (request, env, user) => {
    requireRole(user, 'admin')
    requireVault(env)
    const { results } = await env.DB.prepare('SELECT id, secret_enc, totp_enc FROM vault_entries').all()
    let resealed = 0
    const failed = []
    for (const row of results) {
      for (const column of ['secret_enc', 'totp_enc']) {
        if (!row[column]) continue
        try {
          const { plaintext, stale } = await openSecret(env, row[column], vaultAad(row.id, column))
          if (stale) { await resealIfStale(env, row.id, column, plaintext, true); resealed++ }
        } catch {
          failed.push(row.id)
        }
      }
    }
    await logActivity(env, request, user, { action: 'vault.rekey', entity: 'vault', summary: `Re-encrypted ${resealed} secret(s); ${failed.length} failed` })
    return json({ resealed, failed: [...new Set(failed)] })
  }))
}
