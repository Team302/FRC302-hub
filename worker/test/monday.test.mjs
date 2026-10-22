import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam } from './harness.mjs'
import { sendDueReminders } from '../src/lib/reminders.js'

async function setup(template = 'build') {
  const app = await makeTeam()
  const b = await app.call('lead', 'POST', '/api/boards', { name: 'Robot', template })
  assert.equal(b.status, 201)
  const full = (await app.call('alex', 'GET', `/api/boards/${b.data.board.id}`)).data
  const add = async (title, extra = {}) => (await app.call('alex', 'POST', '/api/items', { board_id: full.board.id, group_id: full.groups[0].id, title, ...extra })).data.item
  return { app, board: full.board, groups: full.groups, columns: full.columns, add }
}

test('templates create groups and typed columns', async () => {
  const { groups, columns } = await setup('build')
  assert.deepEqual(groups.map((g) => g.name), ['Design', 'Fabrication', 'Assembly', 'Testing'])
  assert.deepEqual(columns.map((c) => c.type), ['dropdown', 'timeline', 'number', 'checkbox', 'link'])
  assert.equal(columns[0].settings.options.length, 5)
})

test('column values are validated per type and readable back from the board', async () => {
  const { app, board, columns, add } = await setup('build')
  const item = await add('Intake rollers')
  const col = Object.fromEntries(columns.map((c) => [c.type, c]))
  const put = (c, value) => app.call('alex', 'PUT', `/api/items/${item.id}/values/${c.id}`, { value })
  assert.equal((await put(col.dropdown, [col.dropdown.settings.options[1].id])).status, 200)
  assert.equal((await put(col.dropdown, ['nope'])).status, 400)
  assert.equal((await put(col.timeline, { start: '2027-01-10', end: '2027-01-20' })).status, 200)
  assert.equal((await put(col.timeline, { start: '2027-01-20', end: '2027-01-10' })).status, 400)
  assert.equal((await put(col.number, 6.5)).status, 200)
  assert.equal((await put(col.number, 'six')).status, 400)
  assert.equal((await put(col.checkbox, true)).status, 200)
  assert.equal((await put(col.link, { url: 'javascript:alert(1)' })).status, 400)
  assert.equal((await put(col.link, { url: 'https://cad.onshape.com/documents/x', text: 'Intake CAD' })).status, 200)
  const full = (await app.call('sam', 'GET', `/api/boards/${board.id}`)).data
  assert.equal(full.values[item.id][col.number.id], 6.5)
  assert.deepEqual(full.values[item.id][col.timeline.id], { start: '2027-01-10', end: '2027-01-20' })
  // Clearing removes the value
  await put(col.number, null)
  assert.equal((await app.call('sam', 'GET', `/api/boards/${board.id}`)).data.values[item.id][col.number.id], undefined)
  // A column from another board is refused
  const other = await setup('outreach')
  assert.equal((await app.call('alex', 'PUT', `/api/items/${item.id}/values/${other.columns[0].id}`, { value: '2027-01-01' })).status, 404)
})

test('columns: only leads manage them; removing a label clears values that used it', async () => {
  const { app, board, add } = await setup('blank')
  assert.equal((await app.call('alex', 'POST', `/api/boards/${board.id}/columns`, { type: 'status', title: 'QA' })).status, 403)
  const col = (await app.call('lead', 'POST', `/api/boards/${board.id}/columns`, { type: 'status', title: 'QA' })).data.column
  assert.equal(col.settings.labels.length, 3)
  const item = await add('Bumper')
  await app.call('alex', 'PUT', `/api/items/${item.id}/values/${col.id}`, { value: col.settings.labels[2].id })
  await app.call('lead', 'PATCH', `/api/columns/${col.id}`, { settings: { labels: col.settings.labels.slice(0, 2) } })
  assert.equal((await app.call('alex', 'GET', `/api/boards/${board.id}`)).data.values[item.id], undefined)
})

test('people columns notify the people added; mentions notify only people named', async () => {
  const { app, board, add } = await setup('blank')
  const col = (await app.call('lead', 'POST', `/api/boards/${board.id}/columns`, { type: 'people', title: 'Helpers' })).data.column
  const item = await add('Wire PDH')
  await app.call('alex', 'PUT', `/api/items/${item.id}/values/${col.id}`, { value: ['usr_sam'] })
  let inbox = (await app.call('sam', 'GET', '/api/notifications')).data
  assert.equal(inbox.unread, 1)
  assert.match(inbox.notifications[0].body, /added you to “Wire PDH”/)

  // Mentioning Lead by name notifies them; listing Sam's id without naming them does not.
  await app.call('alex', 'POST', `/api/items/${item.id}/updates`, { body: '@Lead Lee can you check the crimps?', mentions: ['usr_lead', 'usr_sam'] })
  assert.equal((await app.call('lead', 'GET', '/api/notifications')).data.unread, 1)
  assert.equal((await app.call('sam', 'GET', '/api/notifications')).data.unread, 1)
  await app.call('sam', 'POST', '/api/notifications/read', { all: true })
  inbox = (await app.call('sam', 'GET', '/api/notifications')).data
  assert.equal(inbox.unread, 0)
})

test('assignment and status changes notify the owner, never yourself', async () => {
  const { app, add } = await setup('blank')
  const item = await add('Swerve calibration')
  await app.call('alex', 'PATCH', `/api/items/${item.id}`, { assignee_id: 'usr_alex' })
  assert.equal((await app.call('alex', 'GET', '/api/notifications')).data.unread, 0)
  await app.call('lead', 'PATCH', `/api/items/${item.id}`, { status: 'stuck' })
  const inbox = (await app.call('alex', 'GET', '/api/notifications')).data
  assert.equal(inbox.unread, 1)
  assert.match(inbox.notifications[0].body, /Lead Lee set “Swerve calibration” to Stuck/)
})

test('history records every change with who made it', async () => {
  const { app, columns, add } = await setup('build')
  const item = await add('Shooter flywheel')
  await app.call('alex', 'PATCH', `/api/items/${item.id}`, { status: 'working', assignee_id: 'usr_sam', due_date: '2027-02-01' })
  await app.call('sam', 'PUT', `/api/items/${item.id}/values/${columns[2].id}`, { value: 4 })
  const { events } = (await app.call('alex', 'GET', `/api/items/${item.id}`)).data
  const fields = events.map((e) => `${e.field}:${e.actor_name}`)
  for (const f of ['created:Alex', 'status:Alex', 'owner:Alex', 'due date:Alex', 'Est. hours:Sam']) assert.ok(fields.includes(f), f)
  assert.ok(events.some((e) => e.field === 'owner' && e.new_value === 'Sam'))
})

test('subitems: one level, follow their parent, counted separately', async () => {
  const { app, board, groups, add } = await setup('blank')
  const parent = await add('Climber')
  const sub = (await app.call('alex', 'POST', '/api/items', { board_id: board.id, parent_id: parent.id, title: 'Hooks' })).data.item
  assert.equal(sub.group_id, parent.group_id)
  assert.equal((await app.call('alex', 'POST', '/api/items', { board_id: board.id, parent_id: sub.id, title: 'Too deep' })).status, 400)
  await app.call('alex', 'PATCH', `/api/items/${parent.id}`, { group_id: groups[1].id })
  assert.equal((await app.call('alex', 'GET', `/api/items/${sub.id}`)).data.item.group_id, groups[1].id)
  assert.equal((await app.call('alex', 'PATCH', `/api/items/${sub.id}`, { group_id: groups[2].id })).status, 400)
  const { subitems } = (await app.call('alex', 'GET', `/api/items/${parent.id}`)).data
  assert.deepEqual(subitems.map((s) => s.title), ['Hooks'])
  const boards = (await app.call('alex', 'GET', '/api/boards')).data.boards
  assert.equal(boards.find((b) => b.id === board.id).item_count, 1)
})

test('bulk update, duplicate and delete', async () => {
  const { app, board, groups, columns, add } = await setup('build')
  const a = await add('A')
  const b = await add('B')
  await app.call('alex', 'PUT', `/api/items/${a.id}/values/${columns[2].id}`, { value: 3 })
  const upd = await app.call('alex', 'POST', '/api/items/bulk', { ids: [a.id, b.id], action: 'update', changes: { status: 'review', group_id: groups[2].id } })
  assert.equal(upd.status, 200)
  assert.ok(upd.data.items.every((i) => i.status === 'review' && i.group_id === groups[2].id))
  const dup = await app.call('alex', 'POST', '/api/items/bulk', { ids: [a.id], action: 'duplicate' })
  const copy = dup.data.items[0]
  assert.equal(copy.title, 'A (copy)')
  assert.equal((await app.call('alex', 'GET', `/api/boards/${board.id}`)).data.values[copy.id][columns[2].id], 3)
  // Sam didn't create these and isn't a lead: nothing is deleted.
  assert.equal((await app.call('sam', 'POST', '/api/items/bulk', { ids: [a.id, b.id], action: 'delete' })).status, 403)
  assert.equal((await app.call('alex', 'POST', '/api/items/bulk', { ids: [a.id, b.id], action: 'delete' })).data.deleted, 2)
})

test('drag-and-drop ordering, including moving between groups', async () => {
  const { app, board, groups, add } = await setup('blank')
  const a = await add('A')
  const b = await add('B')
  const c = await add('C')
  await app.call('alex', 'POST', '/api/items/order', { group_id: groups[0].id, ids: [c.id, a.id, b.id] })
  let items = (await app.call('alex', 'GET', `/api/boards/${board.id}`)).data.items
  assert.deepEqual(items.filter((i) => i.group_id === groups[0].id).map((i) => i.title), ['C', 'A', 'B'])
  await app.call('alex', 'POST', '/api/items/order', { group_id: groups[1].id, ids: [a.id] })
  items = (await app.call('alex', 'GET', `/api/boards/${board.id}`)).data.items
  assert.equal(items.find((i) => i.id === a.id).group_id, groups[1].id)
  assert.equal((await app.call('alex', 'POST', `/api/boards/${board.id}/groups/order`, { ids: groups.map((g) => g.id).reverse() })).status, 403)
  assert.equal((await app.call('lead', 'POST', `/api/boards/${board.id}/groups/order`, { ids: groups.map((g) => g.id).reverse() })).status, 200)
})

test('automations: status → move to group and notify; loops are bounded', async () => {
  const { app, board, groups, add } = await setup('blank')
  assert.equal((await app.call('alex', 'POST', `/api/boards/${board.id}/automations`, { trigger: { type: 'status_to', status: 'done' }, action: { type: 'move_to_group', group_id: groups[2].id } })).status, 403)
  await app.call('lead', 'POST', `/api/boards/${board.id}/automations`, { trigger: { type: 'status_to', status: 'done' }, action: { type: 'move_to_group', group_id: groups[2].id } })
  await app.call('lead', 'POST', `/api/boards/${board.id}/automations`, { trigger: { type: 'status_to', status: 'stuck' }, action: { type: 'notify', user_ids: ['usr_mentor'] } })
  await app.call('lead', 'POST', `/api/boards/${board.id}/automations`, { trigger: { type: 'item_created' }, action: { type: 'assign', user_id: 'usr_lead' } })
  const item = await add('Gearbox')
  assert.equal((await app.call('alex', 'GET', `/api/items/${item.id}`)).data.item.assignee_id, 'usr_lead')
  const done = await app.call('alex', 'PATCH', `/api/items/${item.id}`, { status: 'done' })
  assert.equal(done.data.item.group_id, groups[2].id)
  await app.call('alex', 'PATCH', `/api/items/${item.id}`, { status: 'stuck' })
  assert.match((await app.call('mentor', 'GET', '/api/notifications')).data.notifications[0].body, /“Gearbox” on Robot is now Stuck/)
  // working → review → working would loop forever without the depth cap
  await app.call('lead', 'POST', `/api/boards/${board.id}/automations`, { trigger: { type: 'status_to', status: 'working' }, action: { type: 'set_status', status: 'review' } })
  await app.call('lead', 'POST', `/api/boards/${board.id}/automations`, { trigger: { type: 'status_to', status: 'review' }, action: { type: 'set_status', status: 'working' } })
  assert.equal((await app.call('alex', 'PATCH', `/api/items/${item.id}`, { status: 'working' })).status, 200)
  // a rule that triggers itself is refused
  assert.equal((await app.call('lead', 'POST', `/api/boards/${board.id}/automations`, { trigger: { type: 'status_to', status: 'done' }, action: { type: 'set_status', status: 'done' } })).status, 400)
})

test('status labels can be renamed per board; Status can’t be hidden', async () => {
  const { app, board } = await setup('blank')
  const res = await app.call('lead', 'PATCH', `/api/boards/${board.id}`, { status_labels: { working: { label: 'In the shop' } }, hidden_builtins: ['priority'] })
  assert.deepEqual(res.data.board.status_labels, { working: { label: 'In the shop' } })
  assert.deepEqual(res.data.board.hidden_builtins, ['priority'])
  assert.equal((await app.call('lead', 'PATCH', `/api/boards/${board.id}`, { hidden_builtins: ['status'] })).status, 400)
})

test('favorites and search respect visibility', async () => {
  const { app, board, add } = await setup('blank')
  await add('Pneumatics leak test')
  await app.call('alex', 'PUT', `/api/boards/${board.id}/favorite`, { favorite: true })
  assert.equal((await app.call('alex', 'GET', '/api/boards')).data.boards.find((b) => b.id === board.id).is_favorite, true)
  assert.equal((await app.call('sam', 'GET', '/api/boards')).data.boards.find((b) => b.id === board.id).is_favorite, false)
  await app.call('lead', 'POST', '/api/meetings', { title: 'Pneumatics captains sync', kind: 'leadership', starts_at: '2027-01-05T18:00:00Z' })
  const asMember = (await app.call('alex', 'GET', '/api/search?q=pneum')).data
  assert.equal(asMember.items.length, 1)
  assert.equal(asMember.meetings.length, 0)
  assert.equal((await app.call('lead', 'GET', '/api/search?q=pneum')).data.meetings.length, 1)
  assert.equal((await app.call('alex', 'GET', '/api/search?q=%25')).data.items.length, 0)
})

test('due reminders: once per task per day, owners only, not done', async () => {
  const { app, add } = await setup('blank')
  const today = new Date().toISOString().slice(0, 10)
  await add('Due today', { assignee_id: 'usr_sam', due_date: today })
  await add('Done already', { assignee_id: 'usr_sam', due_date: today, status: 'done' })
  await add('Far away', { assignee_id: 'usr_sam', due_date: '2099-01-01' })
  await app.call('sam', 'POST', '/api/notifications/read', { all: true })
  assert.equal(await sendDueReminders(app.env), 1)
  assert.equal(await sendDueReminders(app.env), 0)
  assert.match((await app.call('sam', 'GET', '/api/notifications')).data.notifications[0].body, /is due today/)
})
