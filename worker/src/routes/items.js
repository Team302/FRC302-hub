// Items (tasks), subitems, column values, updates with @mentions, history, bulk actions,
// reordering and duplication. Every member can create and edit items; deleting takes a lead or
// the item's creator. All edits go through lib/items.js.
import { atLeast } from '../lib/auth.js'
import { logActivity } from '../lib/activity.js'
import { badRequest, forbidden, json, newId, notFound, readBody } from '../lib/http.js'
import { createItem, getItem, ITEM_COLUMNS, PRIORITIES, setValue, STATUSES, updateItem } from '../lib/items.js'
import { notify, resolveMentions } from '../lib/notify.js'
import { deleteFilesForItems } from './attachments.js'
import * as v from '../lib/validate.js'

const MAX_BULK = 200

function itemChanges(body) {
  return {
    title: v.text(body.title, 'Title', { max: 200, required: body.title !== undefined }),
    description: v.text(body.description, 'Description', { max: 5000 }),
    status: v.oneOf(body.status, 'Status', STATUSES),
    priority: v.oneOf(body.priority, 'Priority', PRIORITIES),
    assignee_id: v.id(body.assignee_id, 'Owner'),
    due_date: v.date(body.due_date, 'Due date'),
    group_id: v.id(body.group_id, 'Group', { nullable: false }),
  }
}

const canDelete = (user, item) => atLeast(user, 'lead') || item.created_by === user.id

async function getColumn(env, id) {
  const column = await env.DB.prepare('SELECT * FROM board_columns WHERE id = ?').bind(id).first()
  if (!column) throw notFound('That column')
  return column
}

async function deleteItem(env, request, user, item) {
  if (!canDelete(user, item)) throw forbidden('Only a lead, or the person who created it, can delete a task.')
  await deleteFilesForItems(env, [item.id])
  await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(item.id).run()
  await logActivity(env, request, user, { action: 'item.delete', entity: 'item', entityId: item.id, summary: `Deleted task “${item.title}”` })
}

async function duplicateItem(env, user, item) {
  const copy = await createItem(env, user, { ...item, title: `${item.title} (copy)`, status: 'not_started', parent_id: item.parent_id, source_meeting_id: null, position: item.position })
  const { results: values } = await env.DB.prepare('SELECT column_id, value FROM item_values WHERE item_id = ?').bind(item.id).all()
  const { results: subs } = await env.DB.prepare('SELECT * FROM items WHERE parent_id = ? ORDER BY position').bind(item.id).all()
  const stmts = values.map((r) => env.DB.prepare('INSERT INTO item_values (item_id, column_id, value) VALUES (?, ?, ?)').bind(copy.id, r.column_id, r.value))
  for (const s of subs) {
    stmts.push(env.DB.prepare(
      `INSERT INTO items (id, board_id, group_id, parent_id, title, description, status, priority, assignee_id, due_date, position, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'not_started', ?, ?, ?, ?, ?)`
    ).bind(newId('itm'), s.board_id, copy.group_id, copy.id, s.title, s.description, s.priority, s.assignee_id, s.due_date, s.position, user.id))
  }
  if (stmts.length) await env.DB.batch(stmts)
  return copy
}

export function itemRoutes(router, authed) {
  router.post('/api/items', authed(async (request, env, user) => {
    const body = await readBody(request)
    const changes = itemChanges(body)
    const item = await createItem(env, user, {
      ...changes,
      board_id: v.id(body.board_id, 'Board', { nullable: false }),
      group_id: v.id(body.group_id, 'Group', { nullable: !!body.parent_id }) ?? changes.group_id,
      parent_id: v.id(body.parent_id, 'Parent task') ?? null,
      title: changes.title ?? v.text(body.title, 'Title', { required: true }),
    })
    return json({ item }, { status: 201 })
  }))

  router.get('/api/items/:id', authed(async (request, env) => {
    const item = await getItem(env, request.params.id)
    const [{ results: updates }, { results: events }, { results: subitems }, parent, meeting] = await Promise.all([
      env.DB.prepare(
        `SELECT iu.id, iu.body, iu.created_at, iu.author_id, u.name AS author_name
           FROM item_updates iu LEFT JOIN users u ON u.id = iu.author_id WHERE iu.item_id = ? ORDER BY iu.created_at, iu.rowid`
      ).bind(item.id).all(),
      env.DB.prepare(
        `SELECT e.id, e.field, e.old_value, e.new_value, e.created_at, u.name AS actor_name
           FROM item_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.item_id = ? ORDER BY e.id DESC LIMIT 200`
      ).bind(item.id).all(),
      env.DB.prepare(`SELECT ${ITEM_COLUMNS} FROM items i LEFT JOIN users u ON u.id = i.assignee_id WHERE i.parent_id = ? ORDER BY i.position, i.created_at`).bind(item.id).all(),
      item.parent_id ? env.DB.prepare('SELECT id, title FROM items WHERE id = ?').bind(item.parent_id).first() : null,
      item.source_meeting_id ? env.DB.prepare('SELECT id, title, starts_at FROM meetings WHERE id = ?').bind(item.source_meeting_id).first() : null,
    ])
    return json({ item, updates, events, subitems, parent, meeting })
  }))

  router.patch('/api/items/:id', authed(async (request, env, user) => {
    const item = await getItem(env, request.params.id)
    const body = await readBody(request)
    const updated = await updateItem(env, user, item, itemChanges(body))
    return json({ item: updated })
  }))

  router.put('/api/items/:id/values/:columnId', authed(async (request, env, user) => {
    const item = await getItem(env, request.params.id)
    const column = await getColumn(env, request.params.columnId)
    const body = await readBody(request)
    const value = await setValue(env, user, item, column, body.value)
    return json({ value })
  }))

  router.delete('/api/items/:id', authed(async (request, env, user) => {
    await deleteItem(env, request, user, await getItem(env, request.params.id))
    return json({ ok: true })
  }))

  router.post('/api/items/:id/duplicate', authed(async (request, env, user) => {
    return json({ item: await duplicateItem(env, user, await getItem(env, request.params.id)) }, { status: 201 })
  }))

  // Bulk: { ids, action: 'update' | 'delete' | 'duplicate', changes? }. All-or-nothing on
  // permission: if any selected item can't be deleted by this person, nothing is.
  router.post('/api/items/bulk', authed(async (request, env, user) => {
    const body = await readBody(request)
    if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > MAX_BULK) throw badRequest(`Select 1–${MAX_BULK} tasks.`)
    const items = []
    for (const id of new Set(body.ids)) items.push(await getItem(env, v.id(id, 'Task', { nullable: false })))
    if (new Set(items.map((i) => i.board_id)).size > 1) throw badRequest('Bulk actions work on one board at a time.')
    if (body.action === 'delete') {
      if (!items.every((i) => canDelete(user, i))) throw forbidden('Some of those tasks can only be deleted by a lead or the person who created them.')
      for (const item of items) await deleteItem(env, request, user, item)
      return json({ deleted: items.length })
    }
    if (body.action === 'duplicate') {
      const copies = []
      for (const item of items) copies.push(await duplicateItem(env, user, item))
      return json({ items: copies })
    }
    if (body.action !== 'update') throw badRequest('Unknown bulk action.')
    const changes = itemChanges(body.changes || {})
    delete changes.title
    delete changes.description
    const out = []
    for (const item of items) out.push(await updateItem(env, user, item, item.parent_id ? { ...changes, group_id: undefined } : changes))
    return json({ items: out })
  }))

  // Drag-and-drop: the ids of a group's top-level items (or a parent's subitems) in their new
  // order. An item dragged in from another group is moved here first.
  router.post('/api/items/order', authed(async (request, env, user) => {
    const body = await readBody(request)
    if (!Array.isArray(body.ids) || body.ids.length > 1000) throw badRequest('Send the task ids in order.')
    const groupId = v.id(body.group_id, 'Group')
    const parentId = v.id(body.parent_id, 'Parent task')
    if (!groupId && !parentId) throw badRequest('Say which group or parent task this order is for.')
    const items = []
    for (const id of body.ids) items.push(await getItem(env, id))
    for (const item of items) {
      if (parentId ? item.parent_id !== parentId : item.parent_id) throw badRequest('Those tasks don’t belong together.')
      if (groupId && item.group_id !== groupId) await updateItem(env, user, item, { group_id: groupId })
    }
    if (items.length) await env.DB.batch(items.map((item, i) => env.DB.prepare('UPDATE items SET position = ? WHERE id = ?').bind(i, item.id)))
    return json({ ok: true })
  }))

  // ── Updates (comments) with @mentions ──
  router.post('/api/items/:id/updates', authed(async (request, env, user) => {
    const item = await getItem(env, request.params.id)
    const body = await readBody(request)
    const text = v.text(body.body, 'Update', { max: 5000, required: true })
    const id = newId('upd')
    await env.DB.batch([
      env.DB.prepare('INSERT INTO item_updates (id, item_id, author_id, body) VALUES (?, ?, ?, ?)').bind(id, item.id, user.id, text),
      env.DB.prepare("UPDATE items SET updated_at = datetime('now') WHERE id = ?").bind(item.id),
    ])
    const mentioned = await resolveMentions(env, text, body.mentions)
    const snippet = text.length > 80 ? `${text.slice(0, 80)}…` : text
    await notify(env, { userIds: mentioned, actorId: user.id, kind: 'mentioned', itemId: item.id, body: `${user.name} mentioned you on “${item.title}”: ${snippet}` })
    // The owner hears about updates on their task (unless they were just mentioned anyway).
    if (item.assignee_id && !mentioned.includes(item.assignee_id)) {
      await notify(env, { userIds: [item.assignee_id], actorId: user.id, kind: 'update', itemId: item.id, body: `${user.name} posted on “${item.title}”: ${snippet}` })
    }
    return json({ update: { id, body: text, author_id: user.id, author_name: user.name, created_at: new Date().toISOString() } }, { status: 201 })
  }))

  router.delete('/api/updates/:id', authed(async (request, env, user) => {
    const row = await env.DB.prepare('SELECT * FROM item_updates WHERE id = ?').bind(request.params.id).first()
    if (!row) throw notFound('That update')
    if (row.author_id !== user.id && !atLeast(user, 'lead')) throw forbidden('You can only delete your own updates.')
    await env.DB.prepare('DELETE FROM item_updates WHERE id = ?').bind(row.id).run()
    return json({ ok: true })
  }))

  // Everything assigned to me that isn't done (subitems included), soonest first.
  router.get('/api/my-work', authed(async (_req, env, user) => {
    const { results } = await env.DB.prepare(
      `SELECT ${ITEM_COLUMNS}, b.name AS board_name, b.color AS board_color, p.title AS parent_title
         FROM items i JOIN boards b ON b.id = i.board_id LEFT JOIN users u ON u.id = i.assignee_id LEFT JOIN items p ON p.id = i.parent_id
        WHERE i.assignee_id = ? AND i.status <> 'done' AND b.is_archived = 0
        ORDER BY i.due_date IS NULL, i.due_date, CASE i.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`
    ).bind(user.id).all()
    return json({ items: results })
  }))

  // ── Notifications ──
  router.get('/api/notifications', authed(async (_req, env, user) => {
    const [{ results }, unread] = await Promise.all([
      env.DB.prepare(
        `SELECT n.id, n.kind, n.body, n.item_id, n.read_at, n.created_at, a.name AS actor_name, i.board_id
           FROM notifications n LEFT JOIN users a ON a.id = n.actor_id LEFT JOIN items i ON i.id = n.item_id
          WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 50`
      ).bind(user.id).all(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(user.id).first(),
    ])
    return json({ notifications: results, unread: unread.n })
  }))

  router.post('/api/notifications/read', authed(async (request, env, user) => {
    const body = await readBody(request)
    if (body.all) {
      await env.DB.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").bind(user.id).run()
    } else if (Array.isArray(body.ids) && body.ids.length <= 100 && body.ids.every(Number.isInteger)) {
      if (body.ids.length) {
        await env.DB.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL AND id IN (${body.ids.map(() => '?').join(', ')})`)
          .bind(user.id, ...body.ids).run()
      }
    } else {
      throw badRequest('Send ids or all: true.')
    }
    return json({ ok: true })
  }))

  // ── Search (⌘K) ── boards, tasks and the meetings this person may see.
  router.get('/api/search', authed(async (request, env, user) => {
    const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 100)
    if (q.length < 2) return json({ boards: [], items: [], meetings: [] })
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    const kinds = ['general', 'subteam', 'build', ...(atLeast(user, 'lead') ? ['leadership'] : []), ...(atLeast(user, 'admin') ? ['mentor'] : [])]
    const [boards, items, meetings] = await Promise.all([
      env.DB.prepare("SELECT id, name, color FROM boards WHERE name LIKE ? ESCAPE '\\' AND is_archived = 0 LIMIT 5").bind(like).all(),
      env.DB.prepare(
        `SELECT i.id, i.title, i.status, i.board_id, b.name AS board_name FROM items i JOIN boards b ON b.id = i.board_id
          WHERE i.title LIKE ? ESCAPE '\\' AND b.is_archived = 0 ORDER BY i.status = 'done', i.updated_at DESC LIMIT 10`
      ).bind(like).all(),
      env.DB.prepare(
        `SELECT id, title, starts_at FROM meetings WHERE title LIKE ? ESCAPE '\\' AND kind IN (${kinds.map(() => '?').join(', ')}) ORDER BY starts_at DESC LIMIT 5`
      ).bind(like, ...kinds).all(),
    ])
    return json({ boards: boards.results, items: items.results, meetings: meetings.results })
  }))
}
