import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam } from './harness.mjs'
import { purgeTrash } from '../src/lib/trash.js'

async function setup() {
  const app = await makeTeam()
  const board = (await app.call('lead', 'POST', '/api/boards', { name: 'Robot' })).data.board
  const group = (await app.call('lead', 'GET', `/api/boards/${board.id}`)).data.groups[0]
  const mk = (who, title, extra = {}) => app.call(who, 'POST', '/api/items', { board_id: board.id, group_id: group.id, title, ...extra }).then((r) => r.data.item)
  return { app, board, group, mk }
}

test('delete moves a task and its subitems to the trash; restore brings them back', async () => {
  const { app, board, mk } = await setup()
  const item = await mk('alex', 'Intake')
  const s1 = await mk('alex', 'Rollers', { parent_id: item.id })
  const s2 = await mk('alex', 'Belts', { parent_id: item.id })
  // s2 was already in the trash on its own: it must not come back with the parent.
  assert.equal((await app.call('alex', 'DELETE', `/api/items/${s2.id}`)).status, 200)
  await new Promise((r) => setTimeout(r, 1100))
  assert.equal((await app.call('alex', 'DELETE', `/api/items/${item.id}`)).status, 200)

  assert.equal((await app.call('lead', 'GET', `/api/items/${item.id}`)).status, 404)
  const b = (await app.call('lead', 'GET', `/api/boards/${board.id}`)).data
  assert.ok(!b.items.some((i) => [item.id, s1.id, s2.id].includes(i.id)), 'trashed tasks are off the board')
  assert.equal((await app.call('lead', 'GET', '/api/search?q=Intake')).data.items.length, 0)

  const trash = (await app.call('lead', 'GET', `/api/boards/${board.id}/trash`)).data
  assert.equal(trash.days, 30)
  assert.deepEqual(trash.items.map((i) => [i.title, i.subitem_count]), [['Intake', 1], ['Belts', 0]])
  assert.equal(trash.items[0].deleted_by_name, 'Alex')

  // A subitem can't come back while its parent is trashed.
  assert.equal((await app.call('alex', 'POST', `/api/items/${s2.id}/restore`)).status, 409)
  const back = await app.call('alex', 'POST', `/api/items/${item.id}/restore`)
  assert.equal(back.status, 200)
  const detail = (await app.call('lead', 'GET', `/api/items/${item.id}`)).data
  assert.deepEqual(detail.subitems.map((s) => s.title), ['Rollers'])
  assert.deepEqual(detail.events.slice(0, 2).map((e) => e.field), ['restored', 'deleted'])
  assert.equal((await app.call('alex', 'POST', `/api/items/${s2.id}/restore`)).status, 200)
  assert.equal((await app.call('alex', 'POST', `/api/items/${s2.id}/restore`)).status, 404, 'not in the trash any more')
})

test('who can restore', async () => {
  const { app, mk } = await setup()
  const mine = await mk('alex', 'Mine')
  await app.call('lead', 'DELETE', `/api/items/${mine.id}`)
  assert.equal((await app.call('sam', 'POST', `/api/items/${mine.id}/restore`)).status, 403)
  assert.equal((await app.call('alex', 'POST', `/api/items/${mine.id}/restore`)).status, 200, 'the creator can')
  const theirs = await mk('sam', 'Theirs')
  await app.call('sam', 'DELETE', `/api/items/${theirs.id}`)
  assert.equal((await app.call('alex', 'POST', `/api/items/${theirs.id}/restore`)).status, 403)
  assert.equal((await app.call('lead', 'POST', `/api/items/${theirs.id}/restore`)).status, 200, 'a lead can')
})

test('bulk delete is undone by bulk restore, parents before subitems', async () => {
  const { app, board, mk } = await setup()
  const a = await mk('alex', 'A')
  const sub = await mk('alex', 'A1', { parent_id: a.id })
  const b = await mk('alex', 'B')
  const del = await app.call('alex', 'POST', '/api/items/bulk', { ids: [sub.id, a.id, b.id], action: 'delete' })
  assert.equal(del.status, 200)
  const res = await app.call('alex', 'POST', '/api/items/restore', { ids: [sub.id, a.id, b.id] })
  assert.equal(res.status, 200)
  const items = (await app.call('lead', 'GET', `/api/boards/${board.id}`)).data.items
  assert.deepEqual(items.map((i) => i.title).sort(), ['A', 'A1', 'B'])
})

test('trash is emptied after 30 days; a deleted group takes its trash with it', async () => {
  const { app, board, group, mk } = await setup()
  const old = await mk('alex', 'Old')
  const fresh = await mk('alex', 'Fresh')
  await app.call('alex', 'DELETE', `/api/items/${old.id}`)
  await app.call('alex', 'DELETE', `/api/items/${fresh.id}`)
  app.sql("UPDATE items SET deleted_at = datetime('now', '-31 days') WHERE id = ?", old.id)
  assert.equal(await purgeTrash(app.env), 1)
  assert.deepEqual((await app.call('lead', 'GET', `/api/boards/${board.id}/trash`)).data.items.map((i) => i.title), ['Fresh'])

  const g2 = (await app.call('lead', 'POST', `/api/boards/${board.id}/groups`, { name: 'Later' })).data.group
  const t = await mk('alex', 'In later', { group_id: g2.id })
  await app.upload('alex', `/api/items/${t.id}/attachments`, new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { type: 'image/png', filename: 'x.png' })
  await app.call('alex', 'DELETE', `/api/items/${t.id}`)
  assert.equal(app.env.FILES.objects.size, 1)
  assert.equal((await app.call('lead', 'DELETE', `/api/groups/${g2.id}`)).status, 200)
  assert.equal(app.env.FILES.objects.size, 0)
  assert.equal(group.id !== g2.id, true)
})
