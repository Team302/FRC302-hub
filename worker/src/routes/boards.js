// Boards, groups, custom columns, templates, favorites and automations. Everyone can see every
// board; changing a board's structure (groups, columns, automations, settings) takes a lead.
import { requireRole } from '../lib/auth.js'
import { logActivity } from '../lib/activity.js'
import { badRequest, conflict, json, newId, notFound, readBody } from '../lib/http.js'
import { cleanSettings, COLUMN_TYPES, DEFAULT_SETTINGS } from '../lib/columns.js'
import { STATUSES } from '../lib/items.js'
import { deleteFilesForBoard } from './attachments.js'
import * as v from '../lib/validate.js'
import { COLORS } from './team.js'

const BUILTINS = ['owner', 'status', 'priority', 'due']

// Templates: groups, then extra columns as [type, title, settings].
const opt = (label, color = 'gray') => ({ label, color })
export const TEMPLATES = {
  blank: { groups: [['This week', 'green'], ['Next up', 'blue'], ['Backlog', 'gray']], columns: [] },
  build: {
    groups: [['Design', 'violet'], ['Fabrication', 'orange'], ['Assembly', 'blue'], ['Testing', 'green']],
    columns: [
      ['dropdown', 'Subsystem', { options: [opt('Drivetrain', 'orange'), opt('Intake', 'teal'), opt('Shooter', 'red'), opt('Climber', 'violet'), opt('Electrical', 'amber')] }],
      ['timeline', 'Timeline'],
      ['number', 'Est. hours', { unit: 'h' }],
      ['checkbox', 'Parts ordered'],
      ['link', 'CAD'],
    ],
  },
  competition: {
    groups: [['Before we leave', 'amber'], ['At the event', 'red'], ['After', 'gray']],
    columns: [
      ['dropdown', 'Area', { options: [opt('Travel', 'blue'), opt('Pit', 'orange'), opt('Scouting', 'teal'), opt('Drive team', 'red'), opt('Spirit', 'pink')] }],
      ['people', 'Helpers'],
      ['checkbox', 'Packed'],
    ],
  },
  purchasing: {
    hidden: ['priority'],
    groups: [['Requested', 'amber'], ['Approved', 'blue'], ['Ordered', 'violet'], ['Received', 'green']],
    columns: [
      ['dropdown', 'Vendor', { options: [opt('AndyMark', 'orange'), opt('REV', 'red'), opt('WCP', 'blue'), opt('McMaster-Carr', 'yellow'), opt('VEX', 'gray'), opt('CTRE', 'teal'), opt('Amazon', 'amber'), opt('Other', 'gray')] }],
      ['link', 'Product link'],
      ['number', 'Qty'],
      ['number', 'Total cost', { unit: '$' }],
      ['dropdown', 'Subsystem', { options: [opt('Drivetrain', 'orange'), opt('Intake', 'teal'), opt('Shooter', 'red'), opt('Climber', 'violet'), opt('Electrical', 'amber'), opt('Tools / shop', 'gray')] }],
      ['date', 'Needed by'],
      ['text', 'Tracking #'],
    ],
  },
  outreach: {
    groups: [['Planning', 'blue'], ['Confirmed', 'green'], ['Done', 'gray']],
    columns: [
      ['date', 'Event date'],
      ['people', 'Volunteers'],
      ['number', 'Volunteer hours', { unit: 'h' }],
      ['text', 'Contact'],
    ],
  },
}

async function getBoard(env, id) {
  const board = await env.DB.prepare('SELECT * FROM boards WHERE id = ?').bind(id).first()
  if (!board) throw notFound('That board')
  return board
}

const parseColumn = (c) => ({ ...c, settings: JSON.parse(c.settings || '{}') })
const presentBoard = (b) => ({ ...b, status_labels: JSON.parse(b.status_labels || '{}'), hidden_builtins: JSON.parse(b.hidden_builtins || '[]') })

async function getColumn(env, id) {
  const column = await env.DB.prepare('SELECT * FROM board_columns WHERE id = ?').bind(id).first()
  if (!column) throw notFound('That column')
  return column
}

function cleanStatusLabels(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw badRequest('Status labels must be an object.')
  const out = {}
  for (const [key, val] of Object.entries(input)) {
    if (!STATUSES.includes(key)) throw badRequest(`Unknown status “${key}”.`)
    const label = typeof val?.label === 'string' ? val.label.trim().slice(0, 30) : ''
    if (label) out[key] = { label }
  }
  return out
}

async function validateAutomation(env, board, trigger, action) {
  if (!trigger || !['status_to', 'item_created'].includes(trigger.type)) throw badRequest('Pick a trigger.')
  if (trigger.type === 'status_to' && !STATUSES.includes(trigger.status)) throw badRequest('Pick a status for the trigger.')
  const t = trigger.type === 'status_to' ? { type: 'status_to', status: trigger.status } : { type: 'item_created' }
  if (!action || !['move_to_group', 'notify', 'assign', 'set_status'].includes(action.type)) throw badRequest('Pick an action.')
  let a
  if (action.type === 'move_to_group') {
    const g = await env.DB.prepare('SELECT board_id FROM board_groups WHERE id = ?').bind(action.group_id).first()
    if (!g || g.board_id !== board.id) throw badRequest('Pick a group on this board.')
    a = { type: 'move_to_group', group_id: action.group_id }
  } else if (action.type === 'set_status') {
    if (!STATUSES.includes(action.status)) throw badRequest('Pick a status.')
    if (t.type === 'status_to' && t.status === action.status) throw badRequest('That would trigger itself.')
    a = { type: 'set_status', status: action.status }
  } else {
    const ids = action.type === 'assign' ? [action.user_id] : action.user_ids
    if (!Array.isArray(ids) || !ids.length || ids.length > 20) throw badRequest('Pick who.')
    for (const id of ids) if (!(await env.DB.prepare('SELECT 1 FROM users WHERE id = ? AND is_active = 1').bind(id).first())) throw badRequest('Everyone must be on the team.')
    a = action.type === 'assign' ? { type: 'assign', user_id: ids[0] } : { type: 'notify', user_ids: [...new Set(ids)] }
  }
  return { t, a }
}

export function boardRoutes(router, authed) {
  router.get('/api/boards', authed(async (request, env, user) => {
    const archived = new URL(request.url).searchParams.get('archived') === '1' ? 1 : 0
    const { results } = await env.DB.prepare(
      `SELECT b.id, b.name, b.description, b.subteam_id, b.color, b.is_archived, b.created_at, s.name AS subteam_name,
              EXISTS (SELECT 1 FROM board_favorites f WHERE f.board_id = b.id AND f.user_id = ?) AS is_favorite,
              COUNT(i.id) AS item_count,
              SUM(CASE WHEN i.status = 'done' THEN 1 ELSE 0 END) AS done_count,
              SUM(CASE WHEN i.status = 'working' THEN 1 ELSE 0 END) AS working_count,
              SUM(CASE WHEN i.status = 'stuck' THEN 1 ELSE 0 END) AS stuck_count,
              SUM(CASE WHEN i.status <> 'done' AND i.due_date < date('now') THEN 1 ELSE 0 END) AS overdue_count
         FROM boards b
         LEFT JOIN subteams s ON s.id = b.subteam_id
         LEFT JOIN items i ON i.board_id = b.id AND i.parent_id IS NULL
        WHERE b.is_archived = ?
        GROUP BY b.id ORDER BY b.created_at`
    ).bind(user.id, archived).all()
    return json({ boards: results.map((b) => ({ ...b, is_favorite: !!b.is_favorite, done_count: b.done_count || 0, working_count: b.working_count || 0, stuck_count: b.stuck_count || 0, overdue_count: b.overdue_count || 0 })) })
  }))

  router.post('/api/boards', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const body = await readBody(request)
    const name = v.text(body.name, 'Name', { max: 80, required: true })
    const description = v.text(body.description, 'Description', { max: 500 }) ?? ''
    const subteamId = v.id(body.subteam_id, 'Subteam') ?? null
    const color = v.oneOf(body.color ?? 'green', 'Color', COLORS)
    const template = TEMPLATES[v.oneOf(body.template ?? 'blank', 'Template', Object.keys(TEMPLATES))]
    const id = newId('brd')
    const stmts = [env.DB.prepare('INSERT INTO boards (id, name, description, subteam_id, color, created_by, hidden_builtins) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, name, description, subteamId, color, user.id, JSON.stringify(template.hidden || []))]
    template.groups.forEach(([g, c], i) => stmts.push(env.DB.prepare('INSERT INTO board_groups (id, board_id, name, color, position) VALUES (?, ?, ?, ?, ?)').bind(newId('grp'), id, g, c, i)))
    template.columns.forEach(([type, title, settings], i) => stmts.push(env.DB.prepare('INSERT INTO board_columns (id, board_id, type, title, settings, position) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(newId('col'), id, type, title, JSON.stringify(cleanSettings(type, settings)), i)))
    await env.DB.batch(stmts)
    await logActivity(env, request, user, { action: 'board.create', entity: 'board', entityId: id, summary: `Created board ${name}` })
    return json({ board: presentBoard(await getBoard(env, id)) }, { status: 201 })
  }))

  router.get('/api/boards/:id', authed(async (request, env) => {
    const board = await getBoard(env, request.params.id)
    const [{ results: groups }, { results: items }, { results: columns }, { results: values }, auto] = await Promise.all([
      env.DB.prepare('SELECT * FROM board_groups WHERE board_id = ? ORDER BY position').bind(board.id).all(),
      env.DB.prepare(`SELECT i.id, i.board_id, i.group_id, i.parent_id, i.title, i.status, i.priority, i.assignee_id, i.due_date, i.position,
                             i.created_by, i.created_at, i.updated_at, i.completed_at, u.name AS assignee_name,
                             (SELECT COUNT(*) FROM item_updates iu WHERE iu.item_id = i.id) AS update_count,
                             (SELECT COUNT(*) FROM attachments a WHERE a.item_id = i.id) AS file_count
                        FROM items i LEFT JOIN users u ON u.id = i.assignee_id WHERE i.board_id = ? ORDER BY i.position, i.created_at`).bind(board.id).all(),
      env.DB.prepare('SELECT * FROM board_columns WHERE board_id = ? ORDER BY position, created_at').bind(board.id).all(),
      env.DB.prepare('SELECT v.item_id, v.column_id, v.value FROM item_values v JOIN items i ON i.id = v.item_id WHERE i.board_id = ?').bind(board.id).all(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM automations WHERE board_id = ? AND is_active = 1').bind(board.id).first(),
    ])
    const valueMap = {}
    for (const row of values) (valueMap[row.item_id] ||= {})[row.column_id] = JSON.parse(row.value)
    return json({ board: presentBoard(board), groups, columns: columns.map(parseColumn), items, values: valueMap, automation_count: auto.n })
  }))

  router.patch('/api/boards/:id', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const board = await getBoard(env, request.params.id)
    const body = await readBody(request)
    const subteam = v.id(body.subteam_id, 'Subteam')
    let hidden
    if (body.hidden_builtins !== undefined) {
      if (!Array.isArray(body.hidden_builtins) || !body.hidden_builtins.every((h) => BUILTINS.includes(h))) throw badRequest('Unknown built-in column.')
      if (body.hidden_builtins.includes('status')) throw badRequest('The Status column can’t be hidden: it decides when a task is done.')
      hidden = JSON.stringify([...new Set(body.hidden_builtins)])
    }
    const next = {
      name: v.text(body.name, 'Name', { max: 80, required: body.name !== undefined }) ?? board.name,
      description: v.text(body.description, 'Description', { max: 500 }) ?? board.description,
      subteam_id: subteam !== undefined ? subteam : board.subteam_id,
      color: v.oneOf(body.color, 'Color', COLORS) ?? board.color,
      is_archived: body.is_archived === undefined ? board.is_archived : (body.is_archived ? 1 : 0),
      status_labels: body.status_labels === undefined ? board.status_labels : JSON.stringify(cleanStatusLabels(body.status_labels)),
      hidden_builtins: hidden ?? board.hidden_builtins,
    }
    await env.DB.prepare('UPDATE boards SET name = ?, description = ?, subteam_id = ?, color = ?, is_archived = ?, status_labels = ?, hidden_builtins = ? WHERE id = ?')
      .bind(next.name, next.description, next.subteam_id, next.color, next.is_archived, next.status_labels, next.hidden_builtins, board.id).run()
    return json({ board: presentBoard(await getBoard(env, board.id)) })
  }))

  router.delete('/api/boards/:id', authed(async (request, env, user) => {
    requireRole(user, 'admin', 'Only mentors can delete a board. Leads can archive it instead.')
    const board = await getBoard(env, request.params.id)
    await deleteFilesForBoard(env, board.id)
    await env.DB.prepare('DELETE FROM boards WHERE id = ?').bind(board.id).run()
    await logActivity(env, request, user, { action: 'board.delete', entity: 'board', entityId: board.id, summary: `Deleted board ${board.name}` })
    return json({ ok: true })
  }))

  router.put('/api/boards/:id/favorite', authed(async (request, env, user) => {
    const board = await getBoard(env, request.params.id)
    const body = await readBody(request)
    await env.DB.prepare(body.favorite ? 'INSERT OR IGNORE INTO board_favorites (user_id, board_id) VALUES (?, ?)' : 'DELETE FROM board_favorites WHERE user_id = ? AND board_id = ?')
      .bind(user.id, board.id).run()
    return json({ favorite: !!body.favorite })
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

  router.post('/api/boards/:id/groups/order', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const board = await getBoard(env, request.params.id)
    const body = await readBody(request)
    const { results } = await env.DB.prepare('SELECT id FROM board_groups WHERE board_id = ?').bind(board.id).all()
    const known = new Set(results.map((g) => g.id))
    if (!Array.isArray(body.ids) || body.ids.length !== known.size || !body.ids.every((id) => known.has(id))) throw badRequest('Send every group id exactly once.')
    await env.DB.batch(body.ids.map((id, i) => env.DB.prepare('UPDATE board_groups SET position = ? WHERE id = ?').bind(i, id)))
    return json({ ok: true })
  }))

  router.patch('/api/groups/:id', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const group = await env.DB.prepare('SELECT * FROM board_groups WHERE id = ?').bind(request.params.id).first()
    if (!group) throw notFound('That group')
    const body = await readBody(request)
    const name = v.text(body.name, 'Name', { max: 60, required: body.name !== undefined }) ?? group.name
    const color = v.oneOf(body.color, 'Color', COLORS) ?? group.color
    await env.DB.prepare('UPDATE board_groups SET name = ?, color = ? WHERE id = ?').bind(name, color, group.id).run()
    return json({ group: { ...group, name, color } })
  }))

  router.delete('/api/groups/:id', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const group = await env.DB.prepare('SELECT * FROM board_groups WHERE id = ?').bind(request.params.id).first()
    if (!group) throw notFound('That group')
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM items WHERE group_id = ? AND parent_id IS NULL').bind(group.id).first()
    if (count.n > 0) throw conflict(`Move or delete the ${count.n} task(s) in “${group.name}” first.`, 'group_not_empty')
    await env.DB.prepare('DELETE FROM board_groups WHERE id = ?').bind(group.id).run()
    return json({ ok: true })
  }))

  // ── Columns ──
  router.post('/api/boards/:id/columns', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const board = await getBoard(env, request.params.id)
    const body = await readBody(request)
    const type = v.oneOf(body.type, 'Column type', COLUMN_TYPES, { required: true })
    const title = v.text(body.title, 'Column name', { max: 40, required: true })
    const settings = cleanSettings(type, body.settings ?? DEFAULT_SETTINGS[type]?.())
    const count = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(position), -1) + 1 AS p FROM board_columns WHERE board_id = ?').bind(board.id).first()
    if (count.n >= 25) throw conflict('A board can have up to 25 extra columns.')
    const id = newId('col')
    await env.DB.prepare('INSERT INTO board_columns (id, board_id, type, title, settings, position) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, board.id, type, title, JSON.stringify(settings), count.p).run()
    return json({ column: parseColumn(await getColumn(env, id)) }, { status: 201 })
  }))

  router.patch('/api/columns/:id', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const column = await getColumn(env, request.params.id)
    const body = await readBody(request)
    const title = v.text(body.title, 'Column name', { max: 40, required: body.title !== undefined }) ?? column.title
    const settings = body.settings === undefined ? column.settings : JSON.stringify(cleanSettings(column.type, body.settings))
    // Labels or options that were removed: clear the values that pointed at them.
    const stmts = [env.DB.prepare('UPDATE board_columns SET title = ?, settings = ? WHERE id = ?').bind(title, settings, column.id)]
    if (body.settings !== undefined && (column.type === 'status' || column.type === 'dropdown')) {
      const s = JSON.parse(settings)
      const keep = new Set((s.labels || s.options).map((o) => o.id))
      const { results } = await env.DB.prepare('SELECT item_id, value FROM item_values WHERE column_id = ?').bind(column.id).all()
      for (const row of results) {
        const val = JSON.parse(row.value)
        const next = Array.isArray(val) ? val.filter((x) => keep.has(x)) : keep.has(val) ? val : null
        if (Array.isArray(val) ? next.length === val.length : next === val) continue
        stmts.push((next === null || (Array.isArray(next) && !next.length))
          ? env.DB.prepare('DELETE FROM item_values WHERE item_id = ? AND column_id = ?').bind(row.item_id, column.id)
          : env.DB.prepare('UPDATE item_values SET value = ? WHERE item_id = ? AND column_id = ?').bind(JSON.stringify(next), row.item_id, column.id))
      }
    }
    await env.DB.batch(stmts)
    return json({ column: parseColumn(await getColumn(env, column.id)) })
  }))

  router.post('/api/boards/:id/columns/order', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const board = await getBoard(env, request.params.id)
    const body = await readBody(request)
    const { results } = await env.DB.prepare('SELECT id FROM board_columns WHERE board_id = ?').bind(board.id).all()
    const known = new Set(results.map((c) => c.id))
    if (!Array.isArray(body.ids) || body.ids.length !== known.size || !body.ids.every((id) => known.has(id))) throw badRequest('Send every column id exactly once.')
    await env.DB.batch(body.ids.map((id, i) => env.DB.prepare('UPDATE board_columns SET position = ? WHERE id = ?').bind(i, id)))
    return json({ ok: true })
  }))

  router.delete('/api/columns/:id', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const column = await getColumn(env, request.params.id)
    await env.DB.prepare('DELETE FROM board_columns WHERE id = ?').bind(column.id).run()
    await logActivity(env, request, user, { action: 'column.delete', entity: 'board', entityId: column.board_id, summary: `Deleted column “${column.title}” and its values` })
    return json({ ok: true })
  }))

  // ── Automations ──
  router.get('/api/boards/:id/automations', authed(async (request, env) => {
    const board = await getBoard(env, request.params.id)
    const { results } = await env.DB.prepare(
      'SELECT a.*, u.name AS created_by_name FROM automations a LEFT JOIN users u ON u.id = a.created_by WHERE a.board_id = ? ORDER BY a.created_at'
    ).bind(board.id).all()
    return json({ automations: results.map((a) => ({ ...a, trigger: JSON.parse(a.trigger), action: JSON.parse(a.action), is_active: !!a.is_active })) })
  }))

  router.post('/api/boards/:id/automations', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const board = await getBoard(env, request.params.id)
    const body = await readBody(request)
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM automations WHERE board_id = ?').bind(board.id).first()
    if (count.n >= 20) throw conflict('A board can have up to 20 automations.')
    const { t, a } = await validateAutomation(env, board, body.trigger, body.action)
    const id = newId('aut')
    await env.DB.prepare('INSERT INTO automations (id, board_id, trigger, action, created_by) VALUES (?, ?, ?, ?, ?)')
      .bind(id, board.id, JSON.stringify(t), JSON.stringify(a), user.id).run()
    await logActivity(env, request, user, { action: 'automation.create', entity: 'board', entityId: board.id, summary: `Added an automation to ${board.name}` })
    return json({ automation: { id, board_id: board.id, trigger: t, action: a, is_active: true } }, { status: 201 })
  }))

  router.patch('/api/automations/:id', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const body = await readBody(request)
    const res = await env.DB.prepare('UPDATE automations SET is_active = ? WHERE id = ?').bind(body.is_active ? 1 : 0, request.params.id).run()
    if (!res.meta?.changes) throw notFound('That automation')
    return json({ ok: true })
  }))

  router.delete('/api/automations/:id', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const res = await env.DB.prepare('DELETE FROM automations WHERE id = ?').bind(request.params.id).run()
    if (!res.meta?.changes) throw notFound('That automation')
    return json({ ok: true })
  }))
}
