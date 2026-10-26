import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam } from './harness.mjs'
import { sendEquipmentReminders } from '../src/routes/equipment.js'

const add = async (app, body) => (await app.call('lead', 'POST', '/api/equipment', { name: 'Cordless drill', category: 'power_tool', location: 'Cabinet A', ...body })).data.item
const notes = (app, who) => app.sql('SELECT kind, body FROM notifications WHERE user_id = ? ORDER BY id', app.users[who].id)
const isoDay = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)

test('everyone can see the list; only leads and mentors manage it', async () => {
  const app = await makeTeam()
  assert.equal((await app.call('alex', 'POST', '/api/equipment', { name: 'Drill' })).status, 403)
  const item = await add(app, { asset_tag: 'T-001' })
  assert.equal(item.available, 1)
  assert.equal((await app.call('alex', 'GET', '/api/equipment')).data.items.length, 1)
  assert.equal((await app.call('alex', 'GET', `/api/equipment/${item.id}`)).status, 200)
  assert.equal((await app.call('alex', 'PATCH', `/api/equipment/${item.id}`, { name: 'Mine now' })).status, 403)
  assert.equal((await app.call('alex', 'DELETE', `/api/equipment/${item.id}`)).status, 403)
  assert.equal((await app.call('alex', 'GET', '/api/equipment/export.csv')).status, 403)
  const edited = await app.call('mentor', 'PATCH', `/api/equipment/${item.id}`, { location: 'Shelf 3' })
  assert.equal(edited.status, 200)
  assert.equal(edited.data.item.location, 'Shelf 3')
  assert.equal(edited.data.item.name, 'Cordless drill', 'PATCH leaves other fields alone')
  // Asset tags are unique, ignoring case; blank tags don't collide.
  assert.equal((await app.call('lead', 'POST', '/api/equipment', { name: 'Other', asset_tag: 't-001' })).status, 409)
  assert.equal((await app.call('lead', 'POST', '/api/equipment', { name: 'A', asset_tag: '' })).status, 201)
  assert.equal((await app.call('lead', 'POST', '/api/equipment', { name: 'B' })).status, 201)
  assert.equal((await app.call('lead', 'POST', '/api/equipment', { name: 'C', category: 'spaceship' })).status, 400)
  assert.equal((await app.call('lead', 'POST', '/api/equipment', { name: 'D', quantity: 0 })).status, 400)
})

test('members borrow for themselves only; leads lend to anyone and the borrower is told', async () => {
  const app = await makeTeam()
  const item = await add(app, { quantity: 3 })
  assert.equal((await app.call('alex', 'POST', `/api/equipment/${item.id}/lend`, { borrower_id: app.users.sam.id })).status, 403)
  const own = await app.call('alex', 'POST', `/api/equipment/${item.id}/lend`, { borrower_id: app.users.alex.id })
  assert.equal(own.status, 201)
  assert.equal(own.data.item.available, 2)
  assert.equal(notes(app, 'alex').length, 0, 'borrowing for yourself notifies nobody')
  const lent = await app.call('lead', 'POST', `/api/equipment/${item.id}/lend`, { borrower_id: app.users.sam.id, due_on: isoDay(3) })
  assert.equal(lent.status, 201)
  assert.deepEqual(lent.data.item.holders.map((h) => h.borrower_name).sort(), ['Alex', 'Sam'])
  const [n] = notes(app, 'sam')
  assert.equal(n.kind, 'equipment')
  assert.match(n.body, /Lead Lee lent you Cordless drill, due back/)
  assert.equal((await app.call('lead', 'POST', `/api/equipment/${item.id}/lend`, { borrower_id: 'usr_nobody' })).status, 404)
  assert.equal((await app.call('lead', 'POST', `/api/equipment/${item.id}/lend`, { due_on: '2020-01-01' })).status, 400)

  // "mine" shows what I hold, whatever the filters.
  const mine = (await app.call('alex', 'GET', '/api/equipment?mine=1')).data
  assert.equal(mine.items.length, 1)
  assert.equal(mine.mine.length, 1)
  assert.equal(mine.mine[0].equipment_name, 'Cordless drill')
  assert.equal((await app.call('mentor', 'GET', '/api/equipment?mine=1')).data.items.length, 0)

  const acts = app.sql("SELECT action, summary FROM activity WHERE action LIKE 'equipment.%' ORDER BY id").map((a) => a.summary)
  assert.deepEqual(acts, ['Added 3 × Cordless drill to equipment', 'Borrowed Cordless drill', 'Lent Cordless drill to Sam'])
})

test('members return only their own loans; leads record any return; no double returns', async () => {
  const app = await makeTeam()
  const item = await add(app, { quantity: 2 })
  const a = (await app.call('alex', 'POST', `/api/equipment/${item.id}/lend`, {})).data.loan_id
  const s = (await app.call('sam', 'POST', `/api/equipment/${item.id}/lend`, {})).data.loan_id
  assert.equal((await app.call('sam', 'POST', `/api/equipment/loans/${a}/return`, {})).status, 403)
  const back = await app.call('alex', 'POST', `/api/equipment/loans/${a}/return`, { condition: 'good' })
  assert.equal(back.status, 200)
  assert.equal(back.data.item.available, 1)
  assert.equal((await app.call('alex', 'POST', `/api/equipment/loans/${a}/return`, {})).status, 409)
  assert.equal((await app.call('lead', 'POST', `/api/equipment/loans/${s}/return`, { notes: 'left on the bench' })).status, 200)
  const [row] = app.sql('SELECT returned_to, return_condition, return_notes FROM equipment_loans WHERE id = ?', s)
  assert.deepEqual({ ...row }, { returned_to: app.users.lead.id, return_condition: 'good', return_notes: 'left on the bench' })
  const detail = (await app.call('alex', 'GET', `/api/equipment/${item.id}`)).data
  assert.equal(detail.item.available, 2)
  assert.equal(detail.loans.length, 2)
  assert.ok(detail.loans.every((l) => l.returned_at))
  assert.equal((await app.call('alex', 'POST', '/api/equipment/loans/eqln_nope/return', {})).status, 404)
})

test('availability: can’t lend more than is on the shelf', async () => {
  const app = await makeTeam()
  const bin = await add(app, { name: 'Allen key set', category: 'tool', quantity: 6 })
  assert.equal((await app.call('lead', 'POST', `/api/equipment/${bin.id}/lend`, { borrower_id: app.users.sam.id, quantity: 4 })).data.item.available, 2)
  const over = await app.call('alex', 'POST', `/api/equipment/${bin.id}/lend`, { quantity: 3 })
  assert.equal(over.status, 409)
  assert.equal(over.data.code, 'unavailable')
  assert.match(over.data.error, /Only 2 of 6/)
  const ok = await app.call('alex', 'POST', `/api/equipment/${bin.id}/lend`, { quantity: 2 })
  assert.equal(ok.data.item.available, 0)
  assert.equal(ok.data.item.on_loan, 6)
  const none = await app.call('mentor', 'POST', `/api/equipment/${bin.id}/lend`, {})
  assert.equal(none.status, 409)
  assert.match(none.data.error, /None available/)
  // Quantity can't drop below what's out.
  assert.equal((await app.call('lead', 'PATCH', `/api/equipment/${bin.id}`, { quantity: 5 })).status, 409)
  assert.equal((await app.call('lead', 'PATCH', `/api/equipment/${bin.id}`, { quantity: 8 })).data.item.available, 2)
  assert.equal(app.sql('SELECT COUNT(*) AS n FROM equipment_loans WHERE returned_at IS NULL')[0].n, 2)
})

test('retired and lost items can’t be lent', async () => {
  const app = await makeTeam()
  for (const condition of ['retired', 'lost']) {
    const item = await add(app, { name: `Old ${condition}`, condition })
    const res = await app.call('lead', 'POST', `/api/equipment/${item.id}/lend`, { borrower_id: app.users.alex.id })
    assert.equal(res.status, 409)
    assert.equal(res.data.code, 'not_lendable')
  }
  const broken = await add(app, { name: 'Wobbly saw', condition: 'broken' })
  assert.equal((await app.call('lead', 'POST', `/api/equipment/${broken.id}/lend`, { borrower_id: app.users.alex.id })).status, 201, 'broken can go out, e.g. for repair')
  // Retired items are hidden by default.
  assert.deepEqual((await app.call('alex', 'GET', '/api/equipment')).data.items.map((i) => i.name).sort(), ['Old lost', 'Wobbly saw'])
  assert.equal((await app.call('alex', 'GET', '/api/equipment?condition=all')).data.items.length, 3)
  assert.equal((await app.call('alex', 'GET', '/api/equipment?condition=retired')).data.items.length, 1)
  assert.equal((await app.call('alex', 'GET', '/api/equipment?q=wobbly')).data.items.length, 1)
  assert.equal((await app.call('alex', 'GET', '/api/equipment?q=%25')).data.items.length, 0, 'LIKE wildcards are literal')
  assert.equal((await app.call('alex', 'GET', '/api/equipment?category=nope')).status, 400)
})

test('returning something damaged updates its condition and tells leads and mentors', async () => {
  const app = await makeTeam()
  const drill = await add(app)
  const loan = (await app.call('alex', 'POST', `/api/equipment/${drill.id}/lend`, {})).data.loan_id
  const res = await app.call('alex', 'POST', `/api/equipment/loans/${loan}/return`, { condition: 'broken', notes: 'chuck slips' })
  assert.equal(res.data.item.condition, 'broken')
  assert.match(notes(app, 'lead')[0].body, /Alex returned Cordless drill as broken: “chuck slips”/)
  assert.equal(notes(app, 'mentor').length, 1)
  assert.equal(notes(app, 'sam').length, 0)
  // Coming back "good" doesn't un-break it: a lead decides it's fixed.
  const again = (await app.call('lead', 'POST', `/api/equipment/${drill.id}/lend`, { borrower_id: app.users.sam.id })).data.loan_id
  assert.equal((await app.call('sam', 'POST', `/api/equipment/loans/${again}/return`, { condition: 'good' })).data.item.condition, 'broken')

  // A few lost from a bin: the bin shrinks, it isn't marked lost.
  const bin = await add(app, { name: 'Zip ties', quantity: 10 })
  const l2 = (await app.call('sam', 'POST', `/api/equipment/${bin.id}/lend`, { quantity: 3 })).data.loan_id
  const after = (await app.call('sam', 'POST', `/api/equipment/loans/${l2}/return`, { condition: 'lost' })).data.item
  assert.equal(after.quantity, 7)
  assert.equal(after.condition, 'good')
  assert.equal((await app.call('sam', 'POST', `/api/equipment/loans/${l2}/return`, { condition: 'lost' })).status, 409)
  assert.equal((await app.call('sam', 'POST', `/api/equipment/loans/x/return`, { condition: 'retired' })).status, 404)
})

test('overdue reminders go to the borrower once a day', async () => {
  const app = await makeTeam()
  const item = await add(app, { name: 'Laptop 3', category: 'computer' })
  const loan = (await app.call('lead', 'POST', `/api/equipment/${item.id}/lend`, { borrower_id: app.users.alex.id, due_on: isoDay(1) })).data.loan_id
  const other = await add(app, { name: 'Multimeter' })
  await app.call('lead', 'POST', `/api/equipment/${other.id}/lend`, { borrower_id: app.users.sam.id, due_on: isoDay(5) })
  assert.equal(await sendEquipmentReminders(app.env), 0, 'nothing is overdue yet')
  app.sql('UPDATE equipment_loans SET due_on = ? WHERE id = ?', isoDay(-2), loan)
  const before = notes(app, 'alex').length
  assert.equal(await sendEquipmentReminders(app.env), 1)
  assert.equal(await sendEquipmentReminders(app.env), 0, 'only once per day')
  const fresh = notes(app, 'alex').slice(before)
  assert.equal(fresh.length, 1)
  assert.match(fresh[0].body, /Laptop 3 was due back/)
  assert.equal(await sendEquipmentReminders(app.env, new Date(Date.now() + 86400000)), 1, 'again the next day')
  const list = (await app.call('alex', 'GET', '/api/equipment')).data
  assert.equal(list.mine[0].overdue, true)
  assert.equal(list.items.find((i) => i.id === item.id).holders[0].overdue, true)
  await app.call('alex', 'POST', `/api/equipment/loans/${loan}/return`, {})
  assert.equal(await sendEquipmentReminders(app.env, new Date(Date.now() + 2 * 86400000)), 0, 'returned: no more reminders')
})

test('delete is refused while something is out; the CSV export defuses formulas', async () => {
  const app = await makeTeam()
  const item = await add(app, { name: '=HYPERLINK("http://evil")', notes: '+1 spare' })
  const loan = (await app.call('lead', 'POST', `/api/equipment/${item.id}/lend`, { borrower_id: app.users.alex.id, due_on: isoDay(2) })).data.loan_id
  const blocked = await app.call('lead', 'DELETE', `/api/equipment/${item.id}`)
  assert.equal(blocked.status, 409)
  assert.equal(blocked.data.code, 'on_loan')

  const res = await app.download('lead', '/api/equipment/export.csv')
  assert.equal(res.status, 200)
  assert.match(res.headers.get('Content-Type'), /text\/csv/)
  const csv = new TextDecoder().decode(res.bytes)
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"")"`), 'formula is quoted, not live')
  assert.ok(csv.includes("'+1 spare"))
  assert.ok(csv.includes(`Alex (due ${isoDay(2)})`))

  await app.call('alex', 'POST', `/api/equipment/loans/${loan}/return`, {})
  assert.equal((await app.call('lead', 'DELETE', `/api/equipment/${item.id}`)).status, 200)
  assert.equal(app.sql('SELECT COUNT(*) AS n FROM equipment_loans')[0].n, 0, 'history goes with the item')
  assert.equal((await app.call('lead', 'GET', `/api/equipment/${item.id}`)).status, 404)
  assert.ok(app.sql("SELECT action FROM activity WHERE action = 'equipment.delete'").length === 1)
  assert.ok(app.sql("SELECT action FROM activity WHERE action = 'equipment.return'").length === 1)
})
