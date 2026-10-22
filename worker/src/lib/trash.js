// The trash: deleted tasks wait here for TRASH_DAYS before the hourly cron removes them for good.
import { deleteFilesForItems } from '../routes/attachments.js'

export const TRASH_DAYS = 30

// Same text format as SQLite's datetime('now'), so stamps compare and sort with it.
export const sqlNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ')

export async function purgeTrash(env) {
  const { results } = await env.DB.prepare(
    `SELECT id FROM items WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-${TRASH_DAYS} days') LIMIT 500`
  ).all()
  if (!results.length) return 0
  const ids = results.map((r) => r.id)
  await deleteFilesForItems(env, ids)
  const ph = ids.map(() => '?').join(', ')
  await env.DB.prepare(`DELETE FROM items WHERE id IN (${ph})`).bind(...ids).run()
  return ids.length
}
