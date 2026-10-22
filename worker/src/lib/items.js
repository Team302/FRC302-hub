// The one place items change. Every route that creates or edits an item (the table, bulk
// actions, meeting action items, automations) goes through here, so history, notifications and
// automations behave the same no matter where the change came from.
import { badRequest, conflict, newId, notFound } from './http.js'
import { cleanValue, describeValue } from './columns.js'
import { notify } from './notify.js'

export const STATUSES = ['not_started', 'working', 'stuck', 'review', 'done']
export const PRIORITIES = ['low', 'medium', 'high', 'critical']
const DEFAULT_STATUS_LABELS = { not_started: 'Not started', working: 'Working on it', stuck: 'Stuck', review: 'Needs review', done: 'Done' }
const MAX_AUTOMATION_DEPTH = 3

export const ITEM_COLUMNS = `i.id, i.board_id, i.group_id, i.parent_id, i.title, i.description, i.status, i.priority, i.assignee_id,
  i.due_date, i.position, i.source_meeting_id, i.created_by, i.created_at, i.updated_at, i.completed_at,
  u.name AS assignee_name, (SELECT COUNT(*) FROM item_updates iu WHERE iu.item_id = i.id) AS update_count`

export async function getItem(env, id) {
  const item = await env.DB.prepare(`SELECT ${ITEM_COLUMNS} FROM items i LEFT JOIN users u ON u.id = i.assignee_id WHERE i.id = ?`).bind(id).first()
  if (!item) throw notFound('That task')
  return item
}

export function statusLabel(board, status) {
  let custom = {}
  try { custom = JSON.parse(board?.status_labels || '{}') } catch { /* defaults */ }
  return custom[status]?.label || DEFAULT_STATUS_LABELS[status]
}

async function boardOf(env, id) {
  const board = await env.DB.prepare('SELECT * FROM boards WHERE id = ?').bind(id).first()
  if (!board) throw notFound('That board')
  return board
}

export async function activeUserIds(env) {
  const { results } = await env.DB.prepare('SELECT id, name FROM users WHERE is_active = 1').all()
  return { ids: new Set(results.map((u) => u.id)), names: Object.fromEntries(results.map((u) => [u.id, u.name])) }
}

async function assertActive(env, userId) {
  if (userId && !(await env.DB.prepare('SELECT 1 FROM users WHERE id = ? AND is_active = 1').bind(userId).first())) {
    throw badRequest('That person is not on the team.')
  }
}

const event = (env, itemId, actorId, field, oldValue, newValue) => env.DB.prepare(
  'INSERT INTO item_events (item_id, actor_id, field, old_value, new_value) VALUES (?, ?, ?, ?, ?)'
).bind(itemId, actorId, field, oldValue == null ? null : String(oldValue).slice(0, 300), newValue == null ? null : String(newValue).slice(0, 300))

// ── Create ──
export async function createItem(env, user, fields, depth = 0) {
  const board = await boardOf(env, fields.board_id)
  if (board.is_archived) throw conflict('That board is archived.')
  let groupId = fields.group_id
  if (fields.parent_id) {
    const parent = await env.DB.prepare('SELECT id, board_id, group_id, parent_id FROM items WHERE id = ?').bind(fields.parent_id).first()
    if (!parent || parent.board_id !== board.id) throw badRequest('That parent task is not on this board.')
    if (parent.parent_id) throw badRequest('Subitems can’t have their own subitems.')
    groupId = parent.group_id
  }
  const group = await env.DB.prepare('SELECT id, board_id FROM board_groups WHERE id = ?').bind(groupId).first()
  if (!group || group.board_id !== board.id) throw badRequest('That group is not on that board.')
  await assertActive(env, fields.assignee_id)
  const id = newId('itm')
  const pos = await env.DB.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM items WHERE group_id = ? AND parent_id IS ?').bind(group.id, fields.parent_id || null).first()
  const status = fields.status || 'not_started'
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO items (id, board_id, group_id, parent_id, title, description, status, priority, assignee_id, due_date, position, source_meeting_id, created_by, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${status === 'done' ? "datetime('now')" : 'NULL'})`
    ).bind(id, board.id, group.id, fields.parent_id || null, fields.title, fields.description || '', status, fields.priority || 'medium',
      fields.assignee_id || null, fields.due_date || null, fields.position ?? pos.p, fields.source_meeting_id || null, user.id),
    event(env, id, user.id, 'created', null, fields.title),
  ])
  if (fields.assignee_id) {
    await notify(env, { userIds: [fields.assignee_id], actorId: user.id, kind: 'assigned', itemId: id, body: `${user.name} assigned you “${fields.title}” on ${board.name}` })
  }
  const item = await getItem(env, id)
  if (!fields.parent_id) await runAutomations(env, user, board, item, { type: 'item_created' }, depth)
  return getItem(env, id)
}

// ── Update built-in fields ──
// changes: any of title, description, status, priority, assignee_id, due_date, group_id, position.
export async function updateItem(env, user, item, changes, depth = 0) {
  const board = await boardOf(env, item.board_id)
  const sets = []
  const binds = []
  const stmts = []
  const changed = {}
  for (const [col, val] of Object.entries(changes)) {
    if (val === undefined || val === item[col]) continue
    if (col === 'group_id') {
      if (item.parent_id) throw badRequest('Subitems move with their parent.')
      const group = await env.DB.prepare('SELECT board_id, name FROM board_groups WHERE id = ?').bind(val).first()
      if (!group || group.board_id !== item.board_id) throw badRequest('That group is not on this board.')
      const old = await env.DB.prepare('SELECT name FROM board_groups WHERE id = ?').bind(item.group_id).first()
      stmts.push(env.DB.prepare('UPDATE items SET group_id = ? WHERE parent_id = ?').bind(val, item.id))
      stmts.push(event(env, item.id, user.id, 'group', old?.name, group.name))
    } else if (col === 'assignee_id') {
      await assertActive(env, val)
    }
    sets.push(`${col} = ?`)
    binds.push(val)
    changed[col] = val
  }
  if (!sets.length) return item
  if ('status' in changed) sets.push(changed.status === 'done' ? "completed_at = datetime('now')" : 'completed_at = NULL')
  sets.push("updated_at = datetime('now')")

  const names = 'assignee_id' in changed ? (await activeUserIds(env)).names : {}
  for (const col of Object.keys(changed)) {
    if (col === 'position' || col === 'group_id') continue
    if (col === 'status') stmts.push(event(env, item.id, user.id, 'status', statusLabel(board, item.status), statusLabel(board, changed.status)))
    else if (col === 'assignee_id') stmts.push(event(env, item.id, user.id, 'owner', item.assignee_name, names[changed.assignee_id] || null))
    else if (col === 'description') stmts.push(event(env, item.id, user.id, 'description', null, 'edited'))
    else stmts.push(event(env, item.id, user.id, col === 'due_date' ? 'due date' : col, item[col], changed[col]))
  }
  await env.DB.batch([env.DB.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, item.id), ...stmts])

  const title = changed.title || item.title
  if (changed.assignee_id) {
    await notify(env, { userIds: [changed.assignee_id], actorId: user.id, kind: 'assigned', itemId: item.id, body: `${user.name} assigned you “${title}” on ${board.name}` })
  }
  if ('status' in changed && item.assignee_id) {
    await notify(env, { userIds: [item.assignee_id], actorId: user.id, kind: 'status', itemId: item.id, body: `${user.name} set “${title}” to ${statusLabel(board, changed.status)}` })
  }
  const updated = await getItem(env, item.id)
  if ('status' in changed) await runAutomations(env, user, board, updated, { type: 'status_to', status: changed.status }, depth)
  return 'status' in changed ? getItem(env, item.id) : updated
}

// ── Custom column values ──
export async function setValue(env, user, item, column, rawValue) {
  if (column.board_id !== item.board_id) throw badRequest('That column is not on this board.')
  const { ids, names } = await activeUserIds(env)
  const value = cleanValue(column, rawValue, ids)
  const prev = await env.DB.prepare('SELECT value FROM item_values WHERE item_id = ? AND column_id = ?').bind(item.id, column.id).first()
  const oldValue = prev ? JSON.parse(prev.value) : null
  const stmts = [value === null
    ? env.DB.prepare('DELETE FROM item_values WHERE item_id = ? AND column_id = ?').bind(item.id, column.id)
    : env.DB.prepare('INSERT INTO item_values (item_id, column_id, value) VALUES (?, ?, ?) ON CONFLICT(item_id, column_id) DO UPDATE SET value = excluded.value')
      .bind(item.id, column.id, JSON.stringify(value)),
  env.DB.prepare("UPDATE items SET updated_at = datetime('now') WHERE id = ?").bind(item.id),
  ]
  if (column.type !== 'text' || (oldValue === null) !== (value === null)) {
    stmts.push(event(env, item.id, user.id, column.title, describeValue(column, oldValue, names), describeValue(column, value, names)))
  } else {
    stmts.push(event(env, item.id, user.id, column.title, null, 'edited'))
  }
  await env.DB.batch(stmts)
  if (column.type === 'people' && value) {
    const added = value.filter((id) => !(oldValue || []).includes(id))
    const board = await boardOf(env, item.board_id)
    await notify(env, { userIds: added, actorId: user.id, kind: 'assigned', itemId: item.id, body: `${user.name} added you to “${item.title}” (${column.title}) on ${board.name}` })
  }
  return value
}

// ── Automations ──
async function runAutomations(env, user, board, item, trigger, depth) {
  if (depth >= MAX_AUTOMATION_DEPTH || item.parent_id) return
  const { results } = await env.DB.prepare('SELECT * FROM automations WHERE board_id = ? AND is_active = 1 ORDER BY created_at').bind(board.id).all()
  for (const rule of results) {
    let t
    let a
    try { t = JSON.parse(rule.trigger); a = JSON.parse(rule.action) } catch { continue }
    if (t.type !== trigger.type || (t.type === 'status_to' && t.status !== trigger.status)) continue
    const current = await env.DB.prepare(`SELECT ${ITEM_COLUMNS} FROM items i LEFT JOIN users u ON u.id = i.assignee_id WHERE i.id = ?`).bind(item.id).first()
    if (!current) return
    // Automations act as the person whose change triggered them, so history shows who started it.
    try {
      if (a.type === 'move_to_group') await updateItem(env, user, current, { group_id: a.group_id }, depth + 1)
      else if (a.type === 'assign') await updateItem(env, user, current, { assignee_id: a.user_id }, depth + 1)
      else if (a.type === 'set_status') await updateItem(env, user, current, { status: a.status }, depth + 1)
      else if (a.type === 'notify') {
        const what = trigger.type === 'status_to' ? `is now ${statusLabel(board, trigger.status)}` : 'was created'
        // Automation notifications go out even when the triggering person is a recipient.
        await notify(env, { userIds: a.user_ids || [], actorId: null, kind: 'automation', itemId: item.id, body: `“${current.title}” on ${board.name} ${what}` })
      }
    } catch (e) {
      // A rule pointing at a deleted group or a removed person is skipped, not fatal.
      console.warn('[automation]', rule.id, e?.message)
    }
  }
}
