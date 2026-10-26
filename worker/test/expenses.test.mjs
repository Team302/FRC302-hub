import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam } from './harness.mjs'
import { seasonOf } from '../src/routes/expenses.js'

const today = new Date().toISOString().slice(0, 10)
const season = seasonOf(today)
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const inbox = async (app, who) => (await app.call(who, 'GET', '/api/notifications')).data.notifications

async function setup() {
  const app = await makeTeam()
  const parts = (await app.call('mentor', 'POST', '/api/budget-categories', { season, name: 'Robot parts', budget_cents: 500000 })).data.category
  const travel = (await app.call('mentor', 'POST', '/api/budget-categories', { season, name: 'Travel', budget_cents: 200000 })).data.category
  const submit = (who, f = {}) => app.call(who, 'POST', '/api/expenses', { description: 'Bearings', vendor: 'WCP', amount_cents: 4520, spent_on: today, payment: 'personal', category_id: parts.id, ...f })
  return { app, parts, travel, submit }
}

test('seasons run Aug 1 to Jul 31, named for kickoff', () => {
  assert.equal(seasonOf('2026-07-31'), 2026)
  assert.equal(seasonOf('2026-08-01'), 2027)
  assert.equal(seasonOf('2027-01-04'), 2027)
})

test('anyone submits; mentors are told; members see only their own', async () => {
  const { app, submit } = await setup()
  const a = await submit('alex')
  assert.equal(a.status, 201)
  assert.equal(a.data.expense.status, 'submitted')
  assert.equal(a.data.expense.season, season)
  assert.ok((await inbox(app, 'mentor')).some((n) => /Alex submitted \$45\.20 at WCP for Bearings \(to be paid back\)/.test(n.body)))
  await submit('sam', { description: 'Pizza', amount_cents: 6000 })
  const mine = (await app.call('alex', 'GET', '/api/expenses')).data.expenses
  assert.deepEqual(mine.map((e) => e.description), ['Bearings'])
  assert.equal((await app.call('lead', 'GET', '/api/expenses')).data.expenses.length, 2, 'leads see all')
  const samId = (await app.call('lead', 'GET', '/api/expenses')).data.expenses.find((e) => e.description === 'Pizza').id
  assert.equal((await app.call('alex', 'GET', `/api/expenses/${samId}`)).status, 404, 'someone else’s is not found')
  assert.equal((await app.call('alex', 'GET', '/api/expenses/summary')).status, 403)
  assert.equal((await app.call('alex', 'GET', '/api/expenses/export.csv')).status, 403)
})

test('validation: amount, future date, category from another season', async () => {
  const { app, submit } = await setup()
  assert.equal((await submit('alex', { amount_cents: 0 })).status, 400)
  assert.equal((await submit('alex', { amount_cents: 12.5 })).status, 400, 'cents are whole numbers')
  assert.equal((await submit('alex', { spent_on: '2099-01-01' })).status, 400)
  const old = (await app.call('mentor', 'POST', '/api/budget-categories', { season: season - 1, name: 'Old parts' })).data.category
  const r = await submit('alex', { category_id: old.id })
  assert.equal(r.status, 400)
  assert.match(r.data.error, /season/)
})

test('approve, reject with a reason, pay back; who may', async () => {
  const { app, submit } = await setup()
  const e = (await submit('alex')).data.expense
  assert.equal((await app.call('lead', 'POST', `/api/expenses/${e.id}/decision`, { decision: 'approved' })).status, 403, 'leads don’t approve')
  assert.equal((await app.call('mentor', 'POST', `/api/expenses/${e.id}/reimbursed`)).status, 409, 'not approved yet')
  const ok = await app.call('mentor', 'POST', `/api/expenses/${e.id}/decision`, { decision: 'approved' })
  assert.equal(ok.data.expense.status, 'approved')
  // Once decided, the submitter can't change or delete it.
  assert.equal((await app.call('alex', 'PATCH', `/api/expenses/${e.id}`, { amount_cents: 99999 })).status, 403)
  assert.equal((await app.call('alex', 'DELETE', `/api/expenses/${e.id}`)).status, 403)
  const paid = await app.call('mentor', 'POST', `/api/expenses/${e.id}/reimbursed`)
  assert.equal(paid.data.expense.status, 'reimbursed')
  assert.ok((await inbox(app, 'alex')).some((n) => /paid back/.test(n.body)))
  assert.equal((await app.call('mentor', 'POST', `/api/expenses/${e.id}/decision`, { decision: 'rejected', note: 'x' })).status, 409)

  const team = (await submit('sam', { payment: 'team' })).data.expense
  await app.call('mentor', 'POST', `/api/expenses/${team.id}/decision`, { decision: 'approved' })
  assert.equal((await app.call('mentor', 'POST', `/api/expenses/${team.id}/reimbursed`)).status, 409, 'team money: nothing to pay back')

  const bad = (await submit('sam', { description: 'Energy drinks' })).data.expense
  assert.equal((await app.call('mentor', 'POST', `/api/expenses/${bad.id}/decision`, { decision: 'rejected' })).status, 400, 'a reason is required')
  await app.call('mentor', 'POST', `/api/expenses/${bad.id}/decision`, { decision: 'rejected', note: 'Not a team expense' })
  assert.ok((await inbox(app, 'sam')).some((n) => /didn’t approve.*Not a team expense/.test(n.body)))
  assert.ok(JSON.stringify((await app.call('mentor', 'GET', '/api/activity')).data).includes('expense.reject'))
})

test('a mentor can’t approve their own reimbursement when another mentor exists', async () => {
  const { app, submit } = await setup()
  const own = (await submit('mentor')).data.expense
  assert.equal((await app.call('mentor', 'POST', `/api/expenses/${own.id}/decision`, { decision: 'approved' })).status, 200, 'the only mentor may')
  await app.addUser('coach2', 'admin', { name: 'Coach Two' })
  const own2 = (await submit('mentor', { description: 'Gas' })).data.expense
  assert.equal((await app.call('mentor', 'POST', `/api/expenses/${own2.id}/decision`, { decision: 'approved' })).status, 403)
  assert.equal((await app.call('coach2', 'POST', `/api/expenses/${own2.id}/decision`, { decision: 'approved' })).status, 200)
})

test('summary: budget vs spent vs pending, and who is owed', async () => {
  const { app, parts, travel, submit } = await setup()
  const a = (await submit('alex', { amount_cents: 10000 })).data.expense
  const b = (await submit('sam', { amount_cents: 2500, payment: 'team' })).data.expense
  await submit('sam', { amount_cents: 700, category_id: travel.id })
  await submit('alex', { amount_cents: 300, category_id: null })
  await app.call('mentor', 'POST', `/api/expenses/${a.id}/decision`, { decision: 'approved' })
  await app.call('mentor', 'POST', `/api/expenses/${b.id}/decision`, { decision: 'approved' })
  const s = (await app.call('lead', 'GET', '/api/expenses/summary')).data
  const p = s.categories.find((c) => c.id === parts.id)
  assert.deepEqual([p.budget_cents, p.spent_cents, p.pending_cents], [500000, 12500, 0])
  assert.equal(s.categories.find((c) => c.id === travel.id).pending_cents, 700)
  assert.equal(s.uncategorized.pending_cents, 300)
  assert.deepEqual(s.totals, { budget_cents: 700000, spent_cents: 12500, pending_cents: 1000, owed_cents: 10000 })
  assert.deepEqual(s.owed.map((o) => [o.name, o.cents]), [['Alex', 10000]])
  // A category in use can't be deleted.
  assert.equal((await app.call('mentor', 'DELETE', `/api/budget-categories/${parts.id}`)).status, 409)
  assert.equal((await app.call('lead', 'POST', '/api/budget-categories', { name: 'X' })).status, 403)
})

test('receipts: only images/PDF, only the submitter or a mentor, private to who can see the expense', async () => {
  const { app, submit } = await setup()
  const e = (await submit('alex')).data.expense
  assert.equal((await app.upload('alex', `/api/expenses/${e.id}/receipt`, png, { type: 'text/html', filename: 'r.html' })).status, 400)
  assert.equal((await app.upload('lead', `/api/expenses/${e.id}/receipt`, png, { type: 'image/png', filename: 'r.png' })).status, 403)
  const up = await app.upload('alex', `/api/expenses/${e.id}/receipt`, png, { type: 'image/png', filename: 'receipt.png' })
  assert.equal(up.status, 201)
  assert.equal(up.data.expense.has_receipt, true)
  assert.ok(!('receipt_key' in up.data.expense), 'the storage key isn’t exposed')
  assert.equal((await app.download('mentor', `/api/expenses/${e.id}/receipt`)).status, 200)
  assert.equal((await app.download('sam', `/api/expenses/${e.id}/receipt`)).status, 404)
  // Replacing deletes the old file; deleting the expense deletes the receipt.
  await app.upload('alex', `/api/expenses/${e.id}/receipt`, png, { type: 'image/png', filename: 'receipt2.png' })
  assert.equal(app.env.FILES.objects.size, 1)
  await app.call('alex', 'DELETE', `/api/expenses/${e.id}`)
  assert.equal(app.env.FILES.objects.size, 0)
})

test('CSV export for the treasurer', async () => {
  const { app, submit } = await setup()
  await submit('alex', { description: '=HYPERLINK("x")' })
  const res = await app.call('lead', 'GET', `/api/expenses/export.csv?season=${season}`)
  assert.equal(res.status, 200)
  const lines = res.data.replace(/^﻿/, '').trim().split('\r\n')
  assert.equal(lines.length, 2)
  assert.ok(lines[1].includes(`"'=HYPERLINK(""x"")"`))
  assert.ok(lines[1].includes(',45.2,'))
})
