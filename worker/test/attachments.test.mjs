import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam } from './harness.mjs'

async function setup() {
  const app = await makeTeam()
  const b = (await app.call('lead', 'POST', '/api/boards', { name: 'Robot' })).data.board
  const g = (await app.call('lead', 'GET', `/api/boards/${b.id}`)).data.groups[0]
  const item = (await app.call('alex', 'POST', '/api/items', { board_id: b.id, group_id: g.id, title: 'Intake' })).data.item
  return { app, board: b, group: g, item }
}
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])

test('upload, list, download (images inline, others as downloads), history', async () => {
  const { app, board, item } = await setup()
  const up = await app.upload('alex', `/api/items/${item.id}/attachments`, png, { type: 'image/png', filename: 'intake roller.png' })
  assert.equal(up.status, 201)
  const step = await app.upload('sam', `/api/items/${item.id}/attachments`, new Uint8Array([1, 2, 3]), { type: 'application/octet-stream', filename: 'intake.STEP' })
  assert.equal(step.status, 201)

  const list = await app.call('lead', 'GET', `/api/items/${item.id}/attachments`)
  assert.deepEqual(list.data.attachments.map((a) => [a.filename, a.inline]).sort(), [['intake roller.png', true], ['intake.STEP', false]])
  const img = await app.download('lead', `/api/attachments/${up.data.attachment.id}`)
  assert.equal(img.status, 200)
  assert.deepEqual([...img.bytes], [...png])
  assert.equal(img.headers.get('Content-Type'), 'image/png')
  assert.match(img.headers.get('Content-Disposition'), /^inline; filename\*=UTF-8''intake%20roller\.png/)
  const cad = await app.download('lead', `/api/attachments/${step.data.attachment.id}`)
  assert.equal(cad.headers.get('Content-Type'), 'application/octet-stream')
  assert.match(cad.headers.get('Content-Disposition'), /^attachment;/)
  assert.equal(cad.headers.get('X-Content-Type-Options'), 'nosniff')

  const boardData = (await app.call('alex', 'GET', `/api/boards/${board.id}`)).data
  assert.equal(boardData.items.find((i) => i.id === item.id).file_count, 2)
  const { events } = (await app.call('alex', 'GET', `/api/items/${item.id}`)).data
  assert.ok(events.some((e) => e.field === 'file' && e.new_value === 'intake roller.png'))
  // Downloads need a session.
  const anon = await app.call(null, 'GET', `/api/attachments/${up.data.attachment.id}`)
  assert.equal(anon.status, 401)
})

test('refuses types a browser could run, mismatched extensions, oversize and empty files', async () => {
  const { app, item } = await setup()
  const tryUp = (type, filename, bytes = png) => app.upload('alex', `/api/items/${item.id}/attachments`, bytes, { type, filename })
  assert.equal((await tryUp('text/html', 'x.html')).status, 400)
  assert.equal((await tryUp('image/svg+xml', 'x.svg')).status, 400)
  assert.equal((await tryUp('image/png', 'x.html')).status, 400)
  assert.equal((await tryUp('application/octet-stream', 'x.exe')).status, 400)
  assert.equal((await tryUp('application/javascript', 'x.js')).status, 400)
  assert.equal((await tryUp('image/png', 'empty.png', new Uint8Array())).status, 400)
  assert.equal((await tryUp('image/png', 'big.png', new Uint8Array(15 * 1024 * 1024 + 1))).status, 413)
  // Path pieces in names are stripped.
  const ok = await tryUp('image/png', '../../etc/passwd.png')
  assert.equal(ok.status, 201)
  assert.equal(ok.data.attachment.filename, 'etcpasswd.png')
})

test('who can delete; files are removed from storage with their task and board', async () => {
  const { app, board, group, item } = await setup()
  const a = (await app.upload('alex', `/api/items/${item.id}/attachments`, png, { type: 'image/png', filename: 'a.png' })).data.attachment
  assert.equal((await app.call('sam', 'DELETE', `/api/attachments/${a.id}`)).status, 403)
  assert.equal((await app.call('alex', 'DELETE', `/api/attachments/${a.id}`)).status, 200)
  assert.equal(app.env.FILES.objects.size, 0)

  // Subitem files go when the parent task is deleted.
  const sub = (await app.call('alex', 'POST', '/api/items', { board_id: board.id, parent_id: item.id, title: 'Rollers' })).data.item
  await app.upload('alex', `/api/items/${item.id}/attachments`, png, { type: 'image/png', filename: 'b.png' })
  await app.upload('alex', `/api/items/${sub.id}/attachments`, png, { type: 'image/png', filename: 'c.png' })
  assert.equal(app.env.FILES.objects.size, 2)
  await app.call('alex', 'DELETE', `/api/items/${item.id}`)
  assert.equal(app.env.FILES.objects.size, 0)

  // And everything goes with a deleted board.
  const other = (await app.call('alex', 'POST', '/api/items', { board_id: board.id, group_id: group.id, title: 'Shooter' })).data.item
  await app.upload('alex', `/api/items/${other.id}/attachments`, png, { type: 'image/png', filename: 'd.png' })
  await app.call('mentor', 'DELETE', `/api/boards/${board.id}`)
  assert.equal(app.env.FILES.objects.size, 0)
})

test('without an R2 bucket uploads are refused clearly', async () => {
  const app = await makeTeam({ FILES: undefined })
  const b = (await app.call('lead', 'POST', '/api/boards', { name: 'Robot' })).data.board
  const g = (await app.call('lead', 'GET', `/api/boards/${b.id}`)).data.groups[0]
  const item = (await app.call('alex', 'POST', '/api/items', { board_id: b.id, group_id: g.id, title: 'x' })).data.item
  assert.equal((await app.upload('alex', `/api/items/${item.id}/attachments`, png, { type: 'image/png', filename: 'a.png' })).status, 503)
})
