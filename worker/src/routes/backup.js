// A mentor's full backup as JSON: every board, task, meeting and event, for an off-site copy at
// the end of a season or before a risky change. Tables are an allowlist; users, attachments and
// vault_entries also list their columns, so a column added to those later stays out until someone
// decides it belongs. Tables marked '*' take every column, new ones included. Never included: vault passwords,
// 2FA keys and notes (they're encrypted with a key the backup doesn't have, and notes are where
// people paste secrets), push subscriptions, calendar link hashes, sign-in ids, notifications
// and rate limits. Attached files are listed, not included.
import { logActivity, rateLimit } from '../lib/activity.js'
import { requireRole } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'

const TABLES = {
  subteams: '*',
  users: 'id, email, name, role, subteam_id, is_active, last_seen_at, created_at',
  boards: '*',
  board_groups: '*',
  board_columns: '*',
  items: '*',
  item_values: '*',
  item_updates: '*',
  item_events: '*',
  automations: '*',
  meetings: '*',
  agenda_items: '*',
  attendance: '*',
  events: '*',
  attachments: 'id, item_id, filename, content_type, size, uploaded_by, created_at',
  equipment: '*',
  equipment_loans: '*',
  budget_categories: '*',
  expenses: 'id, season, category_id, description, vendor, amount_cents, spent_on, payment, status, submitted_by, decided_by, decided_at, decision_note, reimbursed_by, reimbursed_at, item_id, receipt_filename, created_at, updated_at',
  vault_entry_subteams: '*',
  vault_entries: 'id, name, url, username, min_role, owner_id, rotated_at, created_by, created_at, updated_at',
  activity: '*',
}

export const BACKUP_VERSION = 1

export function backupRoutes(router, authed) {
  router.get('/api/admin/backup', authed(async (request, env, user) => {
    requireRole(user, 'admin', 'Only mentors can download a backup.')
    if (!(await rateLimit(env, `backup:${user.id}`, 10, 3600))) throw new HttpError(429, 'That’s a lot of backups in an hour. Try again later.', 'rate_limited')
    const data = {}
    for (const [table, cols] of Object.entries(TABLES)) {
      data[table] = (await env.DB.prepare(`SELECT ${cols} FROM ${table}`).all()).results
    }
    await logActivity(env, request, user, { action: 'backup.download', entity: 'team', entityId: null, summary: 'Downloaded a full backup' })
    const stamp = new Date().toISOString()
    const body = JSON.stringify({ app: '302-hub', version: BACKUP_VERSION, created_at: stamp, created_by: user.email, team: env.TEAM_NAME || null, tables: data }, null, 1)
    return new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="302-hub-backup-${stamp.slice(0, 10)}.json"`,
      },
    })
  }))
}
