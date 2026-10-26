// Expenses: what the team spends against its season budget, and paying people back.
//
// Anyone can submit an expense (with a receipt). Mentors approve or reject it, and mark personal
// ones as paid back. Money is about adults and minors alike, so visibility is tighter than the
// rest of the hub: members see only their own expenses; leads and mentors see everything. Budget
// categories are set by mentors.
//
// A mentor can't approve their own reimbursement while another mentor could, and every
// decision is in the audit log. Amounts are integer cents throughout.
import { logActivity } from '../lib/activity.js'
import { atLeast, requireRole } from '../lib/auth.js'
import { csvResponse } from '../lib/csv.js'
import { badRequest, conflict, forbidden, HttpError, json, newId, notFound, readBody } from '../lib/http.js'
import { notify } from '../lib/notify.js'
import * as v from '../lib/validate.js'
import { cleanFilename, extOf, MAX_BYTES, requireStorage } from './attachments.js'

const MAX_CENTS = 10_000_000 // $100,000: anything bigger is a typo
const RECEIPT_TYPES = { 'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'], 'image/heic': ['heic'], 'application/pdf': ['pdf'] }
export const RECEIPT_INLINE = new Set(['image/png', 'image/jpeg', 'image/webp'])

// The FRC season a date belongs to: Aug 1 of the year before kickoff through Jul 31.
export const seasonOf = (isoDate) => {
  const [y, m] = isoDate.split('-').map(Number)
  return m >= 8 ? y + 1 : y
}
export const currentSeason = (now = new Date()) => seasonOf(now.toISOString().slice(0, 10))
export const money = (cents) => `$${(cents / 100).toFixed(2)}`

const COLUMNS = `e.*, s.name AS submitted_by_name, d.name AS decided_by_name, r.name AS reimbursed_by_name, c.name AS category_name,
  i.title AS item_title, i.board_id AS item_board_id`
const FROM = `FROM expenses e
  LEFT JOIN users s ON s.id = e.submitted_by LEFT JOIN users d ON d.id = e.decided_by LEFT JOIN users r ON r.id = e.reimbursed_by
  LEFT JOIN budget_categories c ON c.id = e.category_id LEFT JOIN live_items i ON i.id = e.item_id`

const present = (e) => {
  const { receipt_key: key, ...rest } = e
  return { ...rest, has_receipt: !!key }
}

async function getExpense(env, user, id) {
  const e = await env.DB.prepare(`SELECT ${COLUMNS} ${FROM} WHERE e.id = ?`).bind(id).first()
  // Someone else's expense is "not found" to a member, so ids can't be probed.
  if (!e || (!atLeast(user, 'lead') && e.submitted_by !== user.id)) throw notFound('That expense')
  return e
}

async function activeAdmins(env) {
  return (await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1").all()).results.map((r) => r.id)
}

async function fields(env, body, current = {}) {
  const amount = v.int(body.amount_cents, 'Amount', { min: 1, max: MAX_CENTS }) ?? current.amount_cents
  const spentOn = v.date(body.spent_on, 'Date') ?? current.spent_on
  if (!amount) throw badRequest('Amount is required.')
  if (!spentOn) throw badRequest('Date is required.')
  if (spentOn > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) throw badRequest('That date is in the future.')
  const season = seasonOf(spentOn)
  let categoryId = v.id(body.category_id, 'Category')
  if (categoryId === undefined) categoryId = current.category_id ?? null
  if (categoryId) {
    const c = await env.DB.prepare('SELECT season FROM budget_categories WHERE id = ?').bind(categoryId).first()
    if (!c) throw badRequest('That category doesn’t exist.')
    if (c.season !== season) throw badRequest(`That category is for the ${c.season} season, and this expense is in ${season}.`)
  }
  let itemId = v.id(body.item_id, 'Task')
  if (itemId === undefined) itemId = current.item_id ?? null
  if (itemId && !(await env.DB.prepare('SELECT 1 FROM live_items WHERE id = ?').bind(itemId).first())) throw badRequest('That task doesn’t exist.')
  return {
    description: v.text(body.description, 'What it was for', { max: 200, required: body.description !== undefined || !current.description }) ?? current.description,
    vendor: v.text(body.vendor, 'Vendor', { max: 120 }) ?? current.vendor ?? '',
    amount_cents: amount,
    spent_on: spentOn,
    season,
    payment: v.oneOf(body.payment, 'Paid with', ['team', 'personal']) ?? current.payment ?? 'team',
    category_id: categoryId,
    item_id: itemId,
  }
}

export function expenseRoutes(router, authed) {
  // ?season=2027 (default: current) &status= &mine=1
  router.get('/api/expenses', authed(async (request, env, user) => {
    const params = new URL(request.url).searchParams
    const season = v.int(params.get('season') ? Number(params.get('season')) : undefined, 'Season', { min: 2000, max: 2100 }) ?? currentSeason()
    const status = params.get('status')
    const where = ['e.season = ?']
    const binds = [season]
    if (!atLeast(user, 'lead') || params.get('mine') === '1') { where.push('e.submitted_by = ?'); binds.push(user.id) }
    if (status) { where.push('e.status = ?'); binds.push(v.oneOf(status, 'Status', ['submitted', 'approved', 'rejected', 'reimbursed'])) }
    const { results } = await env.DB.prepare(`SELECT ${COLUMNS} ${FROM} WHERE ${where.join(' AND ')} ORDER BY e.spent_on DESC, e.created_at DESC LIMIT 1000`).bind(...binds).all()
    const { results: categories } = await env.DB.prepare('SELECT * FROM budget_categories WHERE season = ? ORDER BY position, name').bind(season).all()
    return json({ season, current_season: currentSeason(), expenses: results.map(present), categories })
  }))

  // Budget vs spent per category, totals and who is owed money. Leads and mentors.
  router.get('/api/expenses/summary', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const p = new URL(request.url).searchParams.get('season')
    const season = v.int(p ? Number(p) : undefined, 'Season', { min: 2000, max: 2100 }) ?? currentSeason()
    const [{ results: categories }, { results: rows }, { results: owed }] = await Promise.all([
      env.DB.prepare('SELECT * FROM budget_categories WHERE season = ? ORDER BY position, name').bind(season).all(),
      env.DB.prepare(
        `SELECT category_id, status, SUM(amount_cents) AS cents, COUNT(*) AS n FROM expenses WHERE season = ? GROUP BY category_id, status`
      ).bind(season).all(),
      env.DB.prepare(
        `SELECT e.submitted_by AS user_id, u.name, SUM(e.amount_cents) AS cents, COUNT(*) AS n FROM expenses e LEFT JOIN users u ON u.id = e.submitted_by
          WHERE e.season = ? AND e.payment = 'personal' AND e.status = 'approved' GROUP BY e.submitted_by ORDER BY cents DESC`
      ).bind(season).all(),
    ])
    const tally = (catId) => {
      const mine = rows.filter((r) => r.category_id === catId)
      const sum = (...st) => mine.filter((r) => st.includes(r.status)).reduce((s, r) => s + r.cents, 0)
      return { spent_cents: sum('approved', 'reimbursed'), pending_cents: sum('submitted') }
    }
    const byCategory = categories.map((c) => ({ id: c.id, name: c.name, budget_cents: c.budget_cents, ...tally(c.id) }))
    const uncategorized = tally(null)
    const total = (k) => byCategory.reduce((s, c) => s + c[k], 0) + uncategorized[k]
    return json({
      season,
      categories: byCategory,
      uncategorized,
      totals: { budget_cents: categories.reduce((s, c) => s + c.budget_cents, 0), spent_cents: total('spent_cents'), pending_cents: total('pending_cents'), owed_cents: owed.reduce((s, o) => s + o.cents, 0) },
      owed,
    })
  }))

  router.get('/api/expenses/export.csv', authed(async (request, env, user) => {
    requireRole(user, 'lead')
    const p = new URL(request.url).searchParams.get('season')
    const season = v.int(p ? Number(p) : undefined, 'Season', { min: 2000, max: 2100 }) ?? currentSeason()
    const { results } = await env.DB.prepare(`SELECT ${COLUMNS} ${FROM} WHERE e.season = ? ORDER BY e.spent_on, e.created_at`).bind(season).all()
    const rows = [['Date', 'What', 'Vendor', 'Category', 'Amount', 'Paid with', 'Submitted by', 'Status', 'Decided by', 'Note', 'Paid back', 'Receipt']]
    for (const e of results) {
      rows.push([e.spent_on, e.description, e.vendor, e.category_name || '', e.amount_cents / 100, e.payment === 'personal' ? 'Out of pocket' : 'Team',
        e.submitted_by_name || '', e.status, e.decided_by_name || '', e.decision_note, e.reimbursed_at?.slice(0, 10) || '', e.receipt_key ? 'yes' : 'no'])
    }
    return csvResponse(rows, `expenses-${season}.csv`)
  }))

  router.post('/api/expenses', authed(async (request, env, user) => {
    const f = await fields(env, await readBody(request))
    const id = newId('exp')
    await env.DB.prepare(
      `INSERT INTO expenses (id, season, category_id, description, vendor, amount_cents, spent_on, payment, submitted_by, item_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, f.season, f.category_id, f.description, f.vendor, f.amount_cents, f.spent_on, f.payment, user.id, f.item_id).run()
    await notify(env, {
      userIds: await activeAdmins(env), actorId: user.id, kind: 'expense',
      body: `${user.name} submitted ${money(f.amount_cents)}${f.vendor ? ` at ${f.vendor}` : ''} for ${f.description}${f.payment === 'personal' ? ' (to be paid back)' : ''}`,
    })
    return json({ expense: present(await getExpense(env, user, id)) }, { status: 201 })
  }))

  router.get('/api/expenses/:id', authed(async (request, env, user) => json({ expense: present(await getExpense(env, user, request.params.id)) })))

  // The submitter edits while it's waiting for review; mentors any time.
  router.patch('/api/expenses/:id', authed(async (request, env, user) => {
    const e = await getExpense(env, user, request.params.id)
    const admin = atLeast(user, 'admin')
    if (!admin && (e.submitted_by !== user.id || e.status !== 'submitted')) throw forbidden('Only a mentor can change an expense once it has been decided.')
    const f = await fields(env, await readBody(request), e)
    await env.DB.prepare(
      `UPDATE expenses SET season = ?, category_id = ?, description = ?, vendor = ?, amount_cents = ?, spent_on = ?, payment = ?, item_id = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(f.season, f.category_id, f.description, f.vendor, f.amount_cents, f.spent_on, f.payment, f.item_id, e.id).run()
    if (admin && e.status !== 'submitted' && f.amount_cents !== e.amount_cents) {
      await logActivity(env, request, user, { action: 'expense.edit', entity: 'expense', entityId: e.id, summary: `Changed “${e.description}” from ${money(e.amount_cents)} to ${money(f.amount_cents)} after it was ${e.status}` })
    }
    return json({ expense: present(await getExpense(env, user, e.id)) })
  }))

  router.delete('/api/expenses/:id', authed(async (request, env, user) => {
    const e = await getExpense(env, user, request.params.id)
    if (!atLeast(user, 'admin') && (e.submitted_by !== user.id || e.status !== 'submitted')) throw forbidden('Only a mentor can delete an expense once it has been decided.')
    if (e.receipt_key && env.FILES) await env.FILES.delete(e.receipt_key)
    await env.DB.prepare('DELETE FROM expenses WHERE id = ?').bind(e.id).run()
    await logActivity(env, request, user, { action: 'expense.delete', entity: 'expense', entityId: e.id, summary: `Deleted expense “${e.description}” (${money(e.amount_cents)}, ${e.status})` })
    return json({ ok: true })
  }))

  // ── Decisions (mentors) ──
  router.post('/api/expenses/:id/decision', authed(async (request, env, user) => {
    requireRole(user, 'admin', 'Only mentors approve expenses.')
    const e = await getExpense(env, user, request.params.id)
    const body = await readBody(request)
    const decision = v.oneOf(body.decision, 'Decision', ['approved', 'rejected'], { required: true })
    const note = v.text(body.note, 'Note', { max: 500, required: decision === 'rejected' }) ?? ''
    if (e.status === 'reimbursed') throw conflict('That expense has already been paid back.')
    // Approving your own reimbursement needs a second mentor, when there is one.
    if (decision === 'approved' && e.submitted_by === user.id && e.payment === 'personal' && (await activeAdmins(env)).length > 1) {
      throw forbidden('Another mentor needs to approve your own reimbursement.')
    }
    await env.DB.prepare(
      "UPDATE expenses SET status = ?, decided_by = ?, decided_at = datetime('now'), decision_note = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(decision, user.id, note, e.id).run()
    await logActivity(env, request, user, { action: `expense.${decision === 'approved' ? 'approve' : 'reject'}`, entity: 'expense', entityId: e.id, summary: `${decision === 'approved' ? 'Approved' : 'Rejected'} ${money(e.amount_cents)} for “${e.description}” (${e.submitted_by_name || 'former member'})${e.submitted_by === user.id ? ' — their own' : ''}` })
    await notify(env, {
      userIds: [e.submitted_by], actorId: user.id, kind: 'expense',
      body: decision === 'approved'
        ? `${user.name} approved your ${money(e.amount_cents)} expense for ${e.description}${e.payment === 'personal' ? '. You’ll be paid back.' : ''}`
        : `${user.name} didn’t approve your ${money(e.amount_cents)} expense for ${e.description}: ${note}`,
    })
    return json({ expense: present(await getExpense(env, user, e.id)) })
  }))

  router.post('/api/expenses/:id/reimbursed', authed(async (request, env, user) => {
    requireRole(user, 'admin', 'Only mentors record paying someone back.')
    const e = await getExpense(env, user, request.params.id)
    if (e.payment !== 'personal') throw conflict('That was paid with team money; there’s nothing to pay back.')
    if (e.status !== 'approved') throw conflict('Only an approved expense can be paid back.')
    await env.DB.prepare("UPDATE expenses SET status = 'reimbursed', reimbursed_by = ?, reimbursed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(user.id, e.id).run()
    await logActivity(env, request, user, { action: 'expense.reimburse', entity: 'expense', entityId: e.id, summary: `Paid back ${money(e.amount_cents)} to ${e.submitted_by_name || 'a former member'} for “${e.description}”` })
    await notify(env, { userIds: [e.submitted_by], actorId: user.id, kind: 'expense', body: `${user.name} marked your ${money(e.amount_cents)} for ${e.description} as paid back` })
    return json({ expense: present(await getExpense(env, user, e.id)) })
  }))

  // ── Receipts (one per expense; a new upload replaces it) ──
  router.post('/api/expenses/:id/receipt', authed(async (request, env, user) => {
    requireStorage(env)
    const e = await getExpense(env, user, request.params.id)
    if (!atLeast(user, 'admin') && (e.submitted_by !== user.id || e.status === 'reimbursed')) throw forbidden('Only the person who submitted it, or a mentor, can add the receipt.')
    const filename = cleanFilename(request.headers.get('X-Filename'))
    const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase()
    if (!Object.hasOwn(RECEIPT_TYPES, type) || !RECEIPT_TYPES[type].includes(extOf(filename))) throw badRequest('Receipts can be a photo (PNG, JPEG, WebP, HEIC) or a PDF.')
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BYTES) throw new HttpError(413, 'Receipts can be up to 15 MB.')
    const body = await request.arrayBuffer()
    if (!body.byteLength) throw badRequest('That file is empty.')
    if (body.byteLength > MAX_BYTES) throw new HttpError(413, 'Receipts can be up to 15 MB.')
    const key = newId('rcp')
    await env.FILES.put(key, body, { httpMetadata: { contentType: type } })
    await env.DB.prepare("UPDATE expenses SET receipt_key = ?, receipt_filename = ?, receipt_type = ?, receipt_size = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(key, filename, type, body.byteLength, e.id).run()
    if (e.receipt_key) await env.FILES.delete(e.receipt_key)
    return json({ expense: present(await getExpense(env, user, e.id)) }, { status: 201 })
  }))

  router.get('/api/expenses/:id/receipt', authed(async (request, env, user) => {
    requireStorage(env)
    const e = await getExpense(env, user, request.params.id)
    if (!e.receipt_key) throw notFound('That receipt')
    const object = await env.FILES.get(e.receipt_key)
    if (!object) throw notFound('That receipt')
    const inline = RECEIPT_INLINE.has(e.receipt_type)
    return new Response(object.body, {
      headers: {
        'Content-Type': inline ? e.receipt_type : 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(e.receipt_filename)}`,
        'Content-Length': String(e.receipt_size),
      },
    })
  }))

  // ── Budget categories (mentors set them; everyone can read the names) ──
  router.post('/api/budget-categories', authed(async (request, env, user) => {
    requireRole(user, 'admin', 'Only mentors set the budget.')
    const body = await readBody(request)
    const season = v.int(body.season, 'Season', { min: 2000, max: 2100 }) ?? currentSeason()
    const name = v.text(body.name, 'Name', { max: 60, required: true })
    const budget = v.int(body.budget_cents, 'Budget', { min: 0, max: MAX_CENTS }) ?? 0
    if (await env.DB.prepare('SELECT 1 FROM budget_categories WHERE season = ? AND lower(name) = lower(?)').bind(season, name).first()) throw conflict('There’s already a category with that name this season.')
    const pos = await env.DB.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM budget_categories WHERE season = ?').bind(season).first()
    const id = newId('bud')
    await env.DB.prepare('INSERT INTO budget_categories (id, season, name, budget_cents, position) VALUES (?, ?, ?, ?, ?)').bind(id, season, name, budget, pos.p).run()
    await logActivity(env, request, user, { action: 'budget.create', entity: 'budget', entityId: id, summary: `Budget ${season}: added ${name} (${money(budget)})` })
    return json({ category: await env.DB.prepare('SELECT * FROM budget_categories WHERE id = ?').bind(id).first() }, { status: 201 })
  }))

  router.patch('/api/budget-categories/:id', authed(async (request, env, user) => {
    requireRole(user, 'admin', 'Only mentors set the budget.')
    const c = await env.DB.prepare('SELECT * FROM budget_categories WHERE id = ?').bind(request.params.id).first()
    if (!c) throw notFound('That category')
    const body = await readBody(request)
    const name = v.text(body.name, 'Name', { max: 60, required: body.name !== undefined }) ?? c.name
    const budget = v.int(body.budget_cents, 'Budget', { min: 0, max: MAX_CENTS }) ?? c.budget_cents
    await env.DB.prepare('UPDATE budget_categories SET name = ?, budget_cents = ? WHERE id = ?').bind(name, budget, c.id).run()
    if (budget !== c.budget_cents) await logActivity(env, request, user, { action: 'budget.update', entity: 'budget', entityId: c.id, summary: `Budget ${c.season}: ${c.name} ${money(c.budget_cents)} → ${money(budget)}` })
    return json({ category: { ...c, name, budget_cents: budget } })
  }))

  router.delete('/api/budget-categories/:id', authed(async (request, env, user) => {
    requireRole(user, 'admin', 'Only mentors set the budget.')
    const c = await env.DB.prepare('SELECT * FROM budget_categories WHERE id = ?').bind(request.params.id).first()
    if (!c) throw notFound('That category')
    const used = await env.DB.prepare('SELECT COUNT(*) AS n FROM expenses WHERE category_id = ?').bind(c.id).first()
    if (used.n) throw conflict(`${used.n} expense(s) use “${c.name}”. Move them to another category first.`)
    await env.DB.prepare('DELETE FROM budget_categories WHERE id = ?').bind(c.id).run()
    await logActivity(env, request, user, { action: 'budget.delete', entity: 'budget', entityId: c.id, summary: `Budget ${c.season}: removed ${c.name}` })
    return json({ ok: true })
  }))
}
