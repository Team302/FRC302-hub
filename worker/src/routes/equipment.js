// Equipment: what the team owns, where it lives, and who has it right now. Everyone can see the
// list. Leads and mentors manage the inventory, lend to anyone and record any return; members
// borrow for themselves and return their own loans. It's an honour system: the app records what
// people say they took and brought back, it can't see the shelf.
//
// A row can be a bin of identical things (quantity 6 of the same screwdriver). Available =
// quantity − what's on open loans. Lending is one conditional INSERT, so two people can't both
// take the last one even if they click at the same moment.
import { logActivity } from '../lib/activity.js'
import { atLeast, requireRole } from '../lib/auth.js'
import { csvResponse } from '../lib/csv.js'
import { badRequest, conflict, forbidden, json, newId, notFound, readBody } from '../lib/http.js'
import { notify } from '../lib/notify.js'
import * as v from '../lib/validate.js'

export const CATEGORIES = ['tool', 'power_tool', 'electronics', 'computer', 'robot_spare', 'safety', 'other']
export const CONDITIONS = ['good', 'needs_repair', 'broken', 'lost', 'retired']
export const RETURN_CONDITIONS = ['good', 'needs_repair', 'broken', 'lost']
const NOT_LENDABLE = ['retired', 'lost']
// How bad a condition is, for "came back worse than it went out".
const WORSE = { good: 0, needs_repair: 1, broken: 2, lost: 3 }
const LABEL = { good: 'good', needs_repair: 'needs repair', broken: 'broken', lost: 'lost', retired: 'retired' }

const OPEN_QTY = '(SELECT COALESCE(SUM(l.quantity), 0) FROM equipment_loans l WHERE l.equipment_id = e.id AND l.returned_at IS NULL)'

function fields(body, current = {}) {
  const tag = v.text(body.asset_tag, 'Asset tag', { max: 40 })
  return {
    name: v.text(body.name, 'Name', { max: 120, required: body.name !== undefined || !current.name }) ?? current.name,
    asset_tag: tag === undefined ? (current.asset_tag ?? null) : tag || null,
    category: v.oneOf(body.category, 'Category', CATEGORIES) ?? current.category ?? 'other',
    location: v.text(body.location, 'Location', { max: 120 }) ?? current.location ?? '',
    condition: v.oneOf(body.condition, 'Condition', CONDITIONS) ?? current.condition ?? 'good',
    quantity: v.int(body.quantity, 'Quantity', { min: 1, max: 10000 }) ?? current.quantity ?? 1,
    notes: v.text(body.notes, 'Notes', { max: 2000 }) ?? current.notes ?? '',
  }
}

const uniqueTag = async (fn) => {
  try {
    return await fn()
  } catch (e) {
    if (/unique/i.test(String(e?.message))) throw conflict('Another item already has that asset tag.', 'duplicate_tag')
    throw e
  }
}

// Items with their open loans attached: available count, who holds what, and what's overdue.
async function withLoans(env, items) {
  if (!items.length) return []
  const ids = items.map((i) => i.id)
  const { results: loans } = await env.DB.prepare(
    `SELECT l.id, l.equipment_id, l.borrower_id, u.name AS borrower_name, l.quantity, l.lent_at, l.due_on, l.notes,
            (l.due_on IS NOT NULL AND l.due_on < date('now')) AS overdue
       FROM equipment_loans l JOIN users u ON u.id = l.borrower_id
      WHERE l.returned_at IS NULL AND l.equipment_id IN (${ids.map(() => '?').join(', ')})
      ORDER BY l.lent_at`
  ).bind(...ids).all()
  return items.map((item) => {
    const holders = loans.filter((l) => l.equipment_id === item.id).map(({ equipment_id: _e, ...l }) => ({ ...l, overdue: !!l.overdue }))
    const out = holders.reduce((s, l) => s + l.quantity, 0)
    return { ...item, on_loan: out, available: Math.max(0, item.quantity - out), holders }
  })
}

async function loadItem(env, id) {
  const item = await env.DB.prepare('SELECT * FROM equipment WHERE id = ?').bind(id).first()
  if (!item) throw notFound('That item')
  return item
}

// Overdue loans: the borrower hears about it once a day (hourly cron, worker/src/index.js).
export async function sendEquipmentReminders(env, now = new Date()) {
  const today = now.toISOString().slice(0, 10)
  const { results } = await env.DB.prepare(
    `SELECT l.id, l.borrower_id, l.quantity, l.due_on, e.name
       FROM equipment_loans l JOIN equipment e ON e.id = l.equipment_id JOIN users u ON u.id = l.borrower_id
      WHERE l.returned_at IS NULL AND l.due_on IS NOT NULL AND l.due_on < ? AND u.is_active = 1
        AND NOT EXISTS (SELECT 1 FROM equipment_reminder_log r WHERE r.loan_id = l.id AND r.day = ?)
      LIMIT 500`
  ).bind(today, today).all()
  for (const loan of results) {
    const what = loan.quantity > 1 ? `${loan.quantity} × ${loan.name}` : loan.name
    await notify(env, { userIds: [loan.borrower_id], kind: 'equipment', url: '/equipment', body: `${what} was due back ${loan.due_on}. Return it, or ask a lead for more time.` })
    await env.DB.prepare('INSERT OR IGNORE INTO equipment_reminder_log (loan_id, day) VALUES (?, ?)').bind(loan.id, today).run()
  }
  return results.length
}

export function equipmentRoutes(router, authed) {
  // ?q= &category= &condition= (default: everything except retired; 'all' includes retired) &mine=1
  router.get('/api/equipment', authed(async (request, env, user) => {
    const p = new URL(request.url).searchParams
    const where = []
    const binds = []
    const q = (p.get('q') || '').trim().slice(0, 100)
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
      where.push("(e.name LIKE ? ESCAPE '\\' OR e.asset_tag LIKE ? ESCAPE '\\' OR e.location LIKE ? ESCAPE '\\' OR e.notes LIKE ? ESCAPE '\\')")
      binds.push(like, like, like, like)
    }
    const category = p.get('category')
    if (category) { where.push('e.category = ?'); binds.push(v.oneOf(category, 'Category', CATEGORIES)) }
    const condition = p.get('condition')
    if (condition && condition !== 'all') { where.push('e.condition = ?'); binds.push(v.oneOf(condition, 'Condition', CONDITIONS)) }
    else if (!condition) where.push("e.condition <> 'retired'")
    if (p.get('mine') === '1') { where.push('EXISTS (SELECT 1 FROM equipment_loans m WHERE m.equipment_id = e.id AND m.returned_at IS NULL AND m.borrower_id = ?)'); binds.push(user.id) }
    const { results } = await env.DB.prepare(
      `SELECT e.* FROM equipment e ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY e.name COLLATE NOCASE LIMIT 1000`
    ).bind(...binds).all()
    // What I'm holding, regardless of the filters, for the section at the top of the page.
    const { results: mine } = await env.DB.prepare(
      `SELECT l.id, l.equipment_id, e.name AS equipment_name, e.asset_tag, l.quantity, l.lent_at, l.due_on,
              (l.due_on IS NOT NULL AND l.due_on < date('now')) AS overdue
         FROM equipment_loans l JOIN equipment e ON e.id = l.equipment_id
        WHERE l.returned_at IS NULL AND l.borrower_id = ? ORDER BY l.due_on IS NULL, l.due_on, l.lent_at`
    ).bind(user.id).all()
    return json({ items: await withLoans(env, results), mine: mine.map((l) => ({ ...l, overdue: !!l.overdue })) })
  }))

  // Registered before /:id so "export.csv" isn't read as an id.
  router.get('/api/equipment/export.csv', authed(async (_req, env, user) => {
    requireRole(user, 'lead')
    const { results } = await env.DB.prepare('SELECT * FROM equipment ORDER BY name COLLATE NOCASE').all()
    const items = await withLoans(env, results)
    const rows = [['Name', 'Asset tag', 'Category', 'Location', 'Condition', 'Quantity', 'Available', 'Held by', 'Notes']]
    for (const i of items) {
      const held = i.holders.map((h) => `${h.borrower_name}${h.quantity > 1 ? ` ×${h.quantity}` : ''}${h.due_on ? ` (due ${h.due_on}${h.overdue ? ', overdue' : ''})` : ''}`).join('; ')
      rows.push([i.name, i.asset_tag || '', i.category, i.location, i.condition, i.quantity, i.available, held, i.notes])
    }
    return csvResponse(rows, `equipment-${new Date().toISOString().slice(0, 10)}.csv`)
  }))

  router.get('/api/equipment/:id', authed(async (request, env) => {
    const [item] = await withLoans(env, [await loadItem(env, request.params.id)])
    const { results: history } = await env.DB.prepare(
      `SELECT l.id, l.borrower_id, b.name AS borrower_name, l.quantity, l.lent_at, l.due_on, l.notes, l.lent_by, lb.name AS lent_by_name,
              l.returned_at, l.returned_to, rt.name AS returned_to_name, l.return_condition, l.return_notes,
              (l.returned_at IS NULL AND l.due_on IS NOT NULL AND l.due_on < date('now')) AS overdue
         FROM equipment_loans l JOIN users b ON b.id = l.borrower_id
         LEFT JOIN users lb ON lb.id = l.lent_by LEFT JOIN users rt ON rt.id = l.returned_to
        WHERE l.equipment_id = ? ORDER BY l.lent_at DESC, l.id LIMIT 200`
    ).bind(item.id).all()
    return json({ item, loans: history.map((l) => ({ ...l, overdue: !!l.overdue })) })
  }))

  router.post('/api/equipment', authed(async (request, env, user) => {
    requireRole(user, 'lead', 'Only leads and mentors can add equipment.')
    const f = fields(await readBody(request))
    const id = newId('eqp')
    await uniqueTag(() => env.DB.prepare(
      'INSERT INTO equipment (id, name, asset_tag, category, location, condition, quantity, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, f.name, f.asset_tag, f.category, f.location, f.condition, f.quantity, f.notes, user.id).run())
    await logActivity(env, request, user, { action: 'equipment.create', entity: 'equipment', entityId: id, summary: `Added ${f.quantity > 1 ? `${f.quantity} × ` : ''}${f.name} to equipment` })
    const [item] = await withLoans(env, [await loadItem(env, id)])
    return json({ item }, { status: 201 })
  }))

  router.patch('/api/equipment/:id', authed(async (request, env, user) => {
    requireRole(user, 'lead', 'Only leads and mentors can edit equipment.')
    const current = await loadItem(env, request.params.id)
    const f = fields(await readBody(request), current)
    const [withOut] = await withLoans(env, [current])
    if (f.quantity < withOut.on_loan) throw conflict(`${withOut.on_loan} of these are lent out. Record the returns before lowering the quantity below that.`, 'on_loan')
    await uniqueTag(() => env.DB.prepare(
      "UPDATE equipment SET name = ?, asset_tag = ?, category = ?, location = ?, condition = ?, quantity = ?, notes = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(f.name, f.asset_tag, f.category, f.location, f.condition, f.quantity, f.notes, current.id).run())
    if (f.condition !== current.condition) {
      await logActivity(env, request, user, { action: 'equipment.update', entity: 'equipment', entityId: current.id, summary: `${f.name}: ${LABEL[current.condition]} → ${LABEL[f.condition]}` })
    }
    const [item] = await withLoans(env, [await loadItem(env, current.id)])
    return json({ item })
  }))

  // Only an item nobody has. Something that's out has to come back (or be marked retired) first,
  // so a delete never erases who is holding what.
  router.delete('/api/equipment/:id', authed(async (request, env, user) => {
    requireRole(user, 'lead', 'Only leads and mentors can delete equipment.')
    const [item] = await withLoans(env, [await loadItem(env, request.params.id)])
    if (item.on_loan > 0) throw conflict('Someone still has this. Record the return first, or mark it retired instead of deleting it.', 'on_loan')
    await env.DB.prepare('DELETE FROM equipment WHERE id = ?').bind(item.id).run()
    await logActivity(env, request, user, { action: 'equipment.delete', entity: 'equipment', entityId: item.id, summary: `Deleted ${item.name}${item.asset_tag ? ` (${item.asset_tag})` : ''} from equipment` })
    return json({ ok: true })
  }))

  // { borrower_id, quantity = 1, due_on?, notes? }. Members may only borrow for themselves.
  router.post('/api/equipment/:id/lend', authed(async (request, env, user) => {
    const item = await loadItem(env, request.params.id)
    const body = await readBody(request)
    const borrowerId = v.id(body.borrower_id, 'Borrower') || user.id
    if (borrowerId !== user.id && !atLeast(user, 'lead')) throw forbidden('You can borrow things for yourself. Ask a lead to lend to someone else.')
    const quantity = v.int(body.quantity, 'Quantity', { min: 1, max: 10000 }) ?? 1
    const dueOn = v.date(body.due_on, 'Due date') ?? null
    const notes = v.text(body.notes, 'Notes', { max: 500 }) ?? ''
    // A day of slack: the server's "today" is UTC, which is already tomorrow on a Michigan evening.
    if (dueOn && dueOn < new Date(Date.now() - 86400000).toISOString().slice(0, 10)) throw badRequest('The due date is in the past.')
    const borrower = await env.DB.prepare('SELECT id, name FROM users WHERE id = ? AND is_active = 1').bind(borrowerId).first()
    if (!borrower) throw notFound('That person')
    if (NOT_LENDABLE.includes(item.condition)) throw conflict(`This item is marked ${LABEL[item.condition]}, so it can’t be lent out.`, 'not_lendable')

    // One statement: the availability check and the insert can't be split by another request.
    const id = newId('eqln')
    const res = await env.DB.prepare(
      `INSERT INTO equipment_loans (id, equipment_id, borrower_id, quantity, lent_by, due_on, notes)
       SELECT ?, e.id, ?, ?, ?, ?, ? FROM equipment e
        WHERE e.id = ? AND e.condition NOT IN ('retired', 'lost') AND e.quantity - ${OPEN_QTY} >= ?`
    ).bind(id, borrower.id, quantity, user.id, dueOn, notes, item.id, quantity).run()
    if (!res.meta.changes) {
      const [now] = await withLoans(env, [await loadItem(env, item.id)])
      if (NOT_LENDABLE.includes(now.condition)) throw conflict(`This item is marked ${LABEL[now.condition]}, so it can’t be lent out.`, 'not_lendable')
      throw conflict(now.available ? `Only ${now.available} of ${now.quantity} available.` : 'None available right now: they’re all lent out.', 'unavailable')
    }
    const what = quantity > 1 ? `${quantity} × ${item.name}` : item.name
    const self = borrower.id === user.id
    await logActivity(env, request, user, { action: 'equipment.lend', entity: 'equipment', entityId: item.id, summary: self ? `Borrowed ${what}` : `Lent ${what} to ${borrower.name}` })
    if (!self) await notify(env, { userIds: [borrower.id], actorId: user.id, kind: 'equipment', url: '/equipment', body: `${user.name} lent you ${what}${dueOn ? `, due back ${dueOn}` : ''}` })
    const [updated] = await withLoans(env, [await loadItem(env, item.id)])
    return json({ item: updated, loan_id: id }, { status: 201 })
  }))

  // { condition = 'good', notes? }. The borrower or any lead/mentor. Coming back worse than the
  // item's current condition updates the item; leads and mentors hear about damage.
  router.post('/api/equipment/loans/:id/return', authed(async (request, env, user) => {
    const loan = await env.DB.prepare(
      `SELECT l.*, e.name, e.condition AS item_condition, e.quantity AS item_quantity, u.name AS borrower_name
         FROM equipment_loans l JOIN equipment e ON e.id = l.equipment_id JOIN users u ON u.id = l.borrower_id WHERE l.id = ?`
    ).bind(request.params.id).first()
    if (!loan) throw notFound('That loan')
    if (loan.borrower_id !== user.id && !atLeast(user, 'lead')) throw forbidden('Only the borrower or a lead can record this return.')
    const body = await readBody(request)
    const condition = v.oneOf(body.condition ?? 'good', 'Condition', RETURN_CONDITIONS)
    const notes = v.text(body.notes, 'Notes', { max: 500 }) ?? ''
    const res = await env.DB.prepare(
      "UPDATE equipment_loans SET returned_at = datetime('now'), returned_to = ?, return_condition = ?, return_notes = ? WHERE id = ? AND returned_at IS NULL"
    ).bind(user.id, condition, notes, loan.id).run()
    if (!res.meta.changes) throw conflict('That was already returned.', 'already_returned')

    const what = loan.quantity > 1 ? `${loan.quantity} × ${loan.name}` : loan.name
    let changed = null
    if (loan.item_condition !== 'retired' && WORSE[condition] > (WORSE[loan.item_condition] ?? 0)) {
      if (condition === 'lost' && loan.item_quantity > loan.quantity) {
        // Some of a bin went missing: the bin is smaller, not lost.
        await env.DB.prepare("UPDATE equipment SET quantity = quantity - ?, updated_at = datetime('now') WHERE id = ?").bind(loan.quantity, loan.equipment_id).run()
        changed = `${loan.quantity} lost; ${loan.item_quantity - loan.quantity} left`
      } else {
        await env.DB.prepare("UPDATE equipment SET condition = ?, updated_at = datetime('now') WHERE id = ?").bind(condition, loan.equipment_id).run()
        changed = `now marked ${LABEL[condition]}`
      }
    }
    const by = loan.borrower_id === user.id ? `Returned ${what}` : `Recorded ${loan.borrower_name}’s return of ${what}`
    await logActivity(env, request, user, { action: 'equipment.return', entity: 'equipment', entityId: loan.equipment_id, summary: `${by} (${LABEL[condition]})${changed ? `; ${changed}` : ''}` })
    if (changed) {
      const { results: leads } = await env.DB.prepare("SELECT id FROM users WHERE is_active = 1 AND role IN ('lead', 'admin')").all()
      await notify(env, { userIds: leads.map((r) => r.id), actorId: user.id, kind: 'equipment', url: '/equipment', body: `${loan.borrower_name} returned ${what} as ${LABEL[condition]}${notes ? `: “${notes}”` : ''}` })
    }
    const [item] = await withLoans(env, [await loadItem(env, loan.equipment_id)])
    return json({ item })
  }))
}
