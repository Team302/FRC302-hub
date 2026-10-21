// Boards → groups → items, Monday-style. Every member can see every board and create and edit
// items (a robotics team runs on students picking up work); creating, renaming or removing
// boards and groups takes a lead. Deleting an item takes a lead or the person who made it.
import { atLeast, requireRole } from '../lib/auth.js'
import { logActivity } from '../lib/activity.js'
import { badRequest, conflict, forbidden, json, newId, notFound, readBody } from '../lib/http.js'
import * as v from '../lib/validate.js'
import { COLORS } from './team.js'

export const STATUSES = ['not_started', 'working', 'stuck', 'review', 'done']
export const PRIORITIES = ['low', 'medium', 'high', 'critical']
const DEFAULT_GROUPS = [['This week', 'green'], ['Next up', 'blue'], ['Backlog', 'gray']]

const ITEM_COLUMNS = `i.id, i.board_id, i.group_id, i.title, i.description, i.status, i.priority, i.assignee_id,
  i.due_date, i.position, i.source_meeting_id, i.created_by, i.created_at, i.updated_at, i.completed_at,
  u.name AS assignee_name, (SELECT COUNT(*) FROM item_updates iu WHERE iu.item_id = i.id) AS update_count`

async function getBoard(env, id) {
  const board = await env.DB.prepare('SELECT * FROM boards WHERE id = ?').bind(id).first()
  if (!board) throw notFound('That board')
  return board
}

async function getItem(env, id) {
  const item = await env.DB.prepare(`SELECT ${ITEM_COLUMNS} FROM items i LEFT JOIN users u ON u.id = i.assignee_id WHERE i.id = ?`).bind(id).first()
  if (!item) throw notFound('That task')
  return item
}

async function assertActiveUser(env, id) {
  if (id && !(await env.DB.prepare('SELECT 1 FROM users WHERE id = ? AND is_active = 1').bind(id).first())) {
    throw badRequest('That person is not on the team.')
  }
}

// Shared with meetings.js (action items are board items).
export async function insertItem(env, user, fields) {
  const group = await env.DB.prepare('SELECT id, board_id FROM board_groups WHERE id = ?').bind(fields.group_id).first()
  if (!group || group.board_id !== fields.board_id) throw badRequest('That group is not on that board.')
  const board = await getBoard(env, fields.board_id)
  if (board.is_archived) throw conflict('That board is archived.')
  await assertActiveUser(env, fields.assignee_id)
  const id = newId('itm')
  const pos = await env.DB.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM items WHERE group_id = ?').bind(group.id).first()
  const status = fields.status || 'not_started'
  await env.DB.prepare(
    `INSERT INTO items (id, board_id, group_id, title, description, status, priority, assignee_id, due_date, position, source_meeting_id, created_by, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${status === 'done' ? "datetime('now')" : 'NULL'})`
  ).bind(id, board.id, group.id, fields.title, fields.description || '', status, fields.priority || 'medium',
    fields.assignee_id || null, fields.due_date || null, pos.p, fields.source_meeting_id || null, user.id).run()
  return getItem(env, id)
}

export function boardRoutes(router, authed) {
  router.get('/api/boards', authed(async (request, env) => {
    const archived = new URL(request.url).searchParams.get('archived') === '1' ? 1 : 0
    const { results } = await env.DB.prepare(
      `SELECT b.*, s.name AS subteam_name,
              COUNT(i.id) AS item_count,
              SUM(CASE WHEN i.status = 'done' THEN 1 ELSE 0 END) AS done_count,
              SUM(CASE WHEN i.status = 'stuck' THEN 1 ELSE 0 END) AS stuck_count,
              SUM(CASE WHEN i.status <> 'done' AND i.due_date < date('now') THEN 1 ELSE 0 END) AS overdue_count
         FROM boards b
         LEFT JOIN subteams s ON s.id = b.subteam_id
         LEFT JOIN items i ON i.board_id = b.id
        WHERE b.is_archived = ?
        GROUP BY b.id ORDER BY b.created_at`
    ).bind(archived).all()
    return json({ boards: results.map((b) => ({ ...b, done_count: b.done_count || 0, stuck_count: b.stuck_count || 0, overdue_count: b.overdue_count || 0 })) })
  }))

  router.post('/api/boards', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const body = await readBody(request)
    const name = v.text(body.name, 'Name', { max: 80, required: true })
    const description = v.text(body.description, 'Description', { max: 500 }) ?? ''
    const subteamId = v.id(body.subteam_id, 'Subteam') ?? null
    const color = v.oneOf(body.color ?? 'green', 'Color', COLORS)
    const id = newId('brd')
    const stmts = [env.DB.prepare('INSERT INTO boards (id, name, description, subteam_id, color, created_by) VALUES (?, ?, ?, ?, ?, ?)').bind(id, name, description, subteamId, color, user.id)]
    DEFAULT_GROUPS.forEach(([g, c], i) => stmts.push(env.DB.prepare('INSERT INTO board_groups (id, board_id, name, color, position) VALUES (?, ?, ?, ?, ?)').bind(newId('grp'), id, g, c, i)))
    await env.DB.batch(stmts)
    await logActivity(env, request, user, { action: 'board.create', entity: 'board', entityId: id, summary: `Created board ${name}` })
    return json({ board: await getBoard(env, id) }, { status: 201 })
  }))

  router.get('/api/boards/:id', authed(async (request, env) => {
    const board = await getBoard(env, request.params.id)
    const [{ results: groups }, { results: items }] = await Promise.all([
      env.DB.prepare('SELECT * FROM board_groups WHERE board_id = ? ORDER BY position').bind(board.id).all(),
      env.DB.prepare(`SELECT ${ITEM_COLUMNS} FROM items i LEFT JOIN users u ON u.id = i.assignee_id WHERE i.board_id = ? ORDER BY i.position`).bind(board.id).all(),
    ])
    return json({ board, groups, items })
  }))

  router.patch('/api/boards/:id', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const board = await getBoard(env, request.params.id)
    const body = await readBody(request)
    const next = {
      name: v.text(body.name, 'Name', { max: 80, required: body.name !== undefined }) ?? board.name,
      description: v.text(body.description, 'Description', { max: 500 }) ?? board.description,
      subteam_id: v.id(body.subteam_id, 'Subteam') !== undefined ? v.id(body.subteam_id, 'Subteam') : board.subteam_id,
      color: v.oneOf(body.color, 'Color', COLORS) ?? board.color,
      is_archived: body.is_archived === undefined ? board.is_archived : (body.is_archived ? 1 : 0),
    }
    await env.DB.prepare('UPDATE boards SET name = ?, description = ?, subteam_id = ?, color = ?, is_archived = ? WHERE id = ?')
      .bind(next.name, next.description, next.subteam_id, next.color, next.is_archived, board.id).run()
    return json({ board: await getBoard(env, board.id) })
  }))

  router.delete('/api/boards/:id', authed(async (request, env, user) => {
    requireRole(user, 'admin', 'Only mentors can delete a board. Leads can archive it instead.')
    const board = await getBoard(env, request.params.id)
    await env.DB.prepare('DELETE FROM boards WHERE id = ?').bind(board.id).run()
    await logActivity(env, request, user, { action: 'board.delete', entity: 'board', entityId: board.id, summary: `Deleted board ${board.name}` })
    return json({ ok: true })
  }))

  // ── Groups ──
  router.post('/api/boards/:id/groups', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const board = await getBoard(env, request.params.id)
    const body = await readBody(request)
    const name = v.text(body.name, 'Name', { max: 60, required: true })
    const color = v.oneOf(body.color ?? 'gray', 'Color', COLORS)
    const id = newId('grp')
    const pos = await env.DB.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM board_groups WHERE board_id = ?').bind(board.id).first()
    await env.DB.prepare('INSERT INTO board_groups (id, board_id, name, color, position) VALUES (?, ?, ?, ?, ?)').bind(id, board.id, name, color, pos.p).run()
    return json({ group: await env.DB.prepare('SELECT * FROM board_groups WHERE id = ?').bind(id).first() }, { status: 201 })
  }))

  router.patch('/api/groups/:id', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const group = await env.DB.prepare('SELECT * FROM board_groups WHERE id = ?').bind(request.params.id).first()
    if (!group) throw notFound('That group')
    const body = await readBody(request)
    const name = v.text(body.name, 'Name', { max: 60, required: body.name !== undefined }) ?? group.name
    const color = v.oneOf(body.color, 'Color', COLORS) ?? group.color
    const position = v.int(body.position, 'Position', { max: 1000 }) ?? group.position
    await env.DB.prepare('UPDATE board_groups SET name = ?, color = ?, position = ? WHERE id = ?').bind(name, color, position, group.id).run()
    return json({ group: { ...group, name, color, position } })
  }))

  router.delete('/api/groups/:id', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const group = await env.DB.prepare('SELECT * FROM board_groups WHERE id = ?').bind(request.params.id).first()
    if (!group) throw notFound('That group')
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM items WHERE group_id = ?').bind(group.id).first()
    if (count.n > 0) throw conflict(`Move or delete the ${count.n} task(s) in “${group.name}” first.`, 'group_not_empty')
    await env.DB.prepare('DELETE FROM board_groups WHERE id = ?').bind(group.id).run()
    return json({ ok: true })
  }))

  // ── Items ──
  router.post('/api/items', authed(async (request, env, user) => {
    const body = await readBody(request)
    const item = await insertItem(env, user, {
      board_id: v.id(body.board_id, 'Board', { nullable: false }),
      group_id: v.id(body.group_id, 'Group', { nullable: false }),
      title: v.text(body.title, 'Title', { max: 200, required: true }),
      description: v.text(body.description, 'Description', { max: 5000 }),
      status: v.oneOf(body.status, 'Status', STATUSES),
      priority: v.oneOf(body.priority, 'Priority', PRIORITIES),
      assignee_id: v.id(body.assignee_id, 'Assignee'),
      due_date: v.date(body.due_date, 'Due date'),
    })
    return json({ item }, { status: 201 })
  }))

  router.get('/api/items/:id', authed(async (request, env) => {
    const item = await getItem(env, request.params.id)
    const { results: updates } = await env.DB.prepare(
      `SELECT iu.id, iu.body, iu.created_at, iu.author_id, u.name AS author_name
         FROM item_updates iu LEFT JOIN users u ON u.id = iu.author_id WHERE iu.item_id = ? ORDER BY iu.created_at, iu.rowid`
    ).bind(item.id).all()
    const meeting = item.source_meeting_id
      ? await env.DB.prepare('SELECT id, title, starts_at FROM meetings WHERE id = ?').bind(item.source_meeting_id).first()
      : null
    return json({ item, updates, meeting })
  }))

  router.patch('/api/items/:id', authed(async (request, env, user) => {
    const item = await getItem(env, request.params.id)
    const body = await readBody(request)
    const next = {
      title: v.text(body.title, 'Title', { max: 200, required: body.title !== undefined }),
      description: v.text(body.description, 'Description', { max: 5000 }),
      status: v.oneOf(body.status, 'Status', STATUSES),
      priority: v.oneOf(body.priority, 'Priority', PRIORITIES),
      assignee_id: v.id(body.assignee_id, 'Assignee'),
      due_date: v.date(body.due_date, 'Due date'),
      group_id: v.id(body.group_id, 'Group', { nullable: false }),
      position: v.int(body.position, 'Position', { max: 100000 }),
    }
    if (next.group_id && next.group_id !== item.group_id) {
      const group = await env.DB.prepare('SELECT board_id FROM board_groups WHERE id = ?').bind(next.group_id).first()
      if (!group || group.board_id !== item.board_id) throw badRequest('That group is not on this board.')
    }
    if (next.assignee_id) await assertActiveUser(env, next.assignee_id)
    const sets = []
    const binds = []
    for (const [col, val] of Object.entries(next)) {
      if (val !== undefined) { sets.push(`${col} = ?`); binds.push(val) }
    }
    if (!sets.length) throw badRequest('Nothing to change.')
    if (next.status && next.status !== item.status) sets.push(next.status === 'done' ? "completed_at = datetime('now')" : 'completed_at = NULL')
    sets.push("updated_at = datetime('now')")
    await env.DB.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, item.id).run()
    return json({ item: await getItem(env, item.id) })
  }))

  router.delete('/api/items/:id', authed(async (request, env, user) => {
    const item = await getItem(env, request.params.id)
    if (!atLeast(user, 'lead') && item.created_by !== user.id) throw forbidden('Only a lead, or the person who created it, can delete a task.')
    await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(item.id).run()
    await logActivity(env, request, user, { action: 'item.delete', entity: 'item', entityId: item.id, summary: `Deleted task “${item.title}”` })
    return json({ ok: true })
  }))

  router.post('/api/items/:id/updates', authed(async (request, env, user) => {
    const item = await getItem(env, request.params.id)
    const body = await readBody(request)
    const text = v.text(body.body, 'Update', { max: 5000, required: true })
    const id = newId('upd')
    await env.DB.batch([
      env.DB.prepare('INSERT INTO item_updates (id, item_id, author_id, body) VALUES (?, ?, ?, ?)').bind(id, item.id, user.id, text),
      env.DB.prepare("UPDATE items SET updated_at = datetime('now') WHERE id = ?").bind(item.id),
    ])
    return json({ update: { id, body: text, author_id: user.id, author_name: user.name, created_at: new Date().toISOString() } }, { status: 201 })
  }))

  router.delete('/api/updates/:id', authed(async (request, env, user) => {
    const row = await env.DB.prepare('SELECT * FROM item_updates WHERE id = ?').bind(request.params.id).first()
    if (!row) throw notFound('That update')
    if (row.author_id !== user.id && !atLeast(user, 'lead')) throw forbidden('You can only delete your own updates.')
    await env.DB.prepare('DELETE FROM item_updates WHERE id = ?').bind(row.id).run()
    return json({ ok: true })
  }))

  // Everything assigned to me that isn't done, soonest first (no date last).
  router.get('/api/my-work', authed(async (_req, env, user) => {
    const { results } = await env.DB.prepare(
      `SELECT ${ITEM_COLUMNS}, b.name AS board_name, b.color AS board_color
         FROM items i JOIN boards b ON b.id = i.board_id LEFT JOIN users u ON u.id = i.assignee_id
        WHERE i.assignee_id = ? AND i.status <> 'done' AND b.is_archived = 0
        ORDER BY i.due_date IS NULL, i.due_date, CASE i.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`
    ).bind(user.id).all()
    return json({ items: results })
  }))
}
