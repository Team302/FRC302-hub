import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam } from './harness.mjs'
import { csvCell } from '../src/lib/csv.js'

test('csv cells: formulas defused, numbers kept, quoting', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`)
  assert.equal(csvCell('+1 555'), "'+1 555")
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)")
  assert.equal(csvCell(-12.5), '-12.5')
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"')
  assert.equal(csvCell(null), '')
})

test('board export: groups in order, subitems under their parent, custom columns, hidden built-ins left out', async () => {
  const app = await makeTeam()
  const board = (await app.call('lead', 'POST', '/api/boards', { name: 'Parts & purchasing', template: 'purchasing' })).data.board
  const full = (await app.call('lead', 'GET', `/api/boards/${board.id}`)).data
  const cost = full.columns.find((c) => c.type === 'number')
  const g = full.groups[0]
  const item = (await app.call('alex', 'POST', '/api/items', { board_id: board.id, group_id: g.id, title: '=cmd|calc', assignee_id: app.users.alex.id })).data.item
  await app.call('alex', 'PUT', `/api/items/${item.id}/values/${cost.id}`, { value: 129.99 })
  await app.call('alex', 'POST', '/api/items', { board_id: board.id, parent_id: item.id, title: 'Spare bearings' })
  const gone = (await app.call('alex', 'POST', '/api/items', { board_id: board.id, group_id: g.id, title: 'Trashed one' })).data.item
  await app.call('alex', 'DELETE', `/api/items/${gone.id}`)

  const res = await app.call('sam', 'GET', `/api/boards/${board.id}/export.csv`)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /text\/csv/)
  assert.match(res.headers.get('content-disposition'), /filename\*=UTF-8''Parts%20%26%20purchasing/)
  const lines = res.data.replace(/^﻿/, '').trim().split('\r\n')
  const header = lines[0].split(',')
  assert.deepEqual(header.slice(0, 3), ['Group', 'Task', 'Subitem of'])
  assert.ok(!header.includes('Priority'), 'the purchasing template hides Priority')
  assert.ok(header.includes(cost.title))
  assert.equal(lines.length, 3, 'header, task, subitem; the trashed task is left out')
  assert.ok(lines[1].includes("'=cmd|calc"), 'formula defused')
  assert.ok(lines[1].includes('129.99'))
  assert.ok(lines[2].startsWith(`${g.name},Spare bearings,'=cmd|calc`))
})

test('backup: mentors only, no secrets, logged', async () => {
  const app = await makeTeam()
  app.sql("UPDATE users SET calendar_token_hash = 'deadbeef', clerk_user_id = 'user_123' WHERE id = ?", app.users.alex.id)
  assert.equal((await app.call('lead', 'GET', '/api/admin/backup')).status, 403)
  const res = await app.call('mentor', 'GET', '/api/admin/backup')
  assert.equal(res.status, 200)
  assert.equal(res.data.app, '302-hub')
  assert.ok(!('vault_entries' in res.data.tables))
  const text = JSON.stringify(res.data)
  for (const leak of ['deadbeef', 'user_123', 'p256dh', 'calendar_token_hash']) assert.ok(!text.includes(leak), `backup leaks ${leak}`)
  const log = (await app.call('mentor', 'GET', '/api/activity')).data
  assert.ok(JSON.stringify(log).includes('backup.download'))
})
