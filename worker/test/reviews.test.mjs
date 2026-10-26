import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam } from './harness.mjs'
import { sendReviewReminders } from '../src/lib/reminders.js'

// mentor (admin), lead, alex and sam (members). Approval-required board unless noted.
async function setup({ approval = true } = {}) {
  const app = await makeTeam()
  // alex and sam both on Mechanical, so they can review each other's work on a Mechanical board.
  app.sql("UPDATE users SET subteam_id = 'st_mech' WHERE id = ?", app.users.sam.id)
  const board = (await app.call('lead', 'POST', '/api/boards', { name: 'Robot', subteam_id: 'st_mech' })).data.board
  if (approval) assert.equal((await app.call('lead', 'PATCH', `/api/boards/${board.id}`, { require_approval: true })).status, 200)
  const group = (await app.call('lead', 'GET', `/api/boards/${board.id}`)).data.groups[0]
  const u = app.users
  const mk = (who, fields = {}) => app.call(who, 'POST', '/api/items', { board_id: board.id, group_id: group.id, title: 'Intake', ...fields })
  return { app, board, group, u, mk }
}
const inbox = async (app, who) => (await app.call(who, 'GET', '/api/notifications')).data.notifications

test('turning approvals on shows the Reviewer column; new boards start with it hidden', async () => {
  const app = await makeTeam()
  const b = (await app.call('lead', 'POST', '/api/boards', { name: 'X' })).data.board
  assert.deepEqual(b.hidden_builtins, ['reviewer'])
  assert.equal((await app.call('alex', 'PATCH', `/api/boards/${b.id}`, { require_approval: true })).status, 403)
  const res = await app.call('lead', 'PATCH', `/api/boards/${b.id}`, { require_approval: true })
  assert.equal(res.data.board.require_approval, 1)
  assert.deepEqual(res.data.board.hidden_builtins, [])
})

test('on an approval board the owner can’t mark Done; submit, then the reviewer approves', async () => {
  const { app, u, mk } = await setup()
  const item = (await mk('alex', { assignee_id: u.alex.id, reviewer_id: u.sam.id })).data.item
  assert.equal(item.reviewer_id, u.sam.id)
  assert.ok((await inbox(app, 'sam')).some((n) => n.kind === 'review' && /made you the reviewer/.test(n.body)))

  const done = await app.call('alex', 'PATCH', `/api/items/${item.id}`, { status: 'done' })
  assert.equal(done.status, 403)
  assert.match(done.data.error, /review/)

  assert.equal((await app.call('alex', 'PATCH', `/api/items/${item.id}`, { status: 'review' })).status, 200)
  assert.ok((await inbox(app, 'sam')).some((n) => /asked you to review/.test(n.body)))
  assert.equal((await app.call('alex', 'POST', `/api/items/${item.id}/approve`)).status, 403, 'not the owner')

  const ok = await app.call('sam', 'POST', `/api/items/${item.id}/approve`)
  assert.equal(ok.status, 200)
  assert.equal(ok.data.item.status, 'done')
  assert.equal(ok.data.item.approved_by, u.sam.id)
  assert.ok(ok.data.item.approved_at)
  assert.ok((await inbox(app, 'alex')).some((n) => /approved/.test(n.body)))
  const events = (await app.call('alex', 'GET', `/api/items/${item.id}`)).data.events.map((e) => `${e.field}:${e.new_value}`)
  assert.ok(events.includes('review:approved'))

  // Reopening clears the sign-off.
  const reopened = await app.call('alex', 'PATCH', `/api/items/${item.id}`, { status: 'working' })
  assert.equal(reopened.data.item.approved_by, null)
})

test('request changes needs a note, sends it back, and tells the owner', async () => {
  const { app, u, mk } = await setup()
  const item = (await mk('alex', { assignee_id: u.alex.id, reviewer_id: u.sam.id, status: 'review' })).data.item
  assert.equal((await app.call('sam', 'POST', `/api/items/${item.id}/request-changes`, {})).status, 400)
  assert.equal((await app.call('alex', 'POST', `/api/items/${item.id}/request-changes`, { comment: 'x' })).status, 403)
  const res = await app.call('sam', 'POST', `/api/items/${item.id}/request-changes`, { comment: 'Chamfer the edges' })
  assert.equal(res.status, 200)
  assert.equal(res.data.item.status, 'working')
  const detail = (await app.call('alex', 'GET', `/api/items/${item.id}`)).data
  assert.equal(detail.updates.at(-1).body, 'Changes requested: Chamfer the edges')
  assert.ok((await inbox(app, 'alex')).some((n) => /asked for changes.*Chamfer/.test(n.body)))
  assert.equal((await app.call('sam', 'POST', `/api/items/${item.id}/request-changes`, { comment: 'again' })).status, 409, 'only from review')
})

test('leads can always mark Done; reviewer rules can’t be gamed', async () => {
  const { app, u, mk } = await setup()
  const item = (await mk('alex', { assignee_id: u.alex.id })).data.item
  // Nobody can make the owner their own reviewer.
  assert.equal((await app.call('alex', 'PATCH', `/api/items/${item.id}`, { reviewer_id: u.alex.id })).status, 400)
  // A member can't make themselves the reviewer to approve someone's task.
  assert.equal((await app.call('sam', 'PATCH', `/api/items/${item.id}`, { reviewer_id: u.sam.id })).status, 403)
  // ...nor in the same request as Done.
  assert.equal((await app.call('sam', 'PATCH', `/api/items/${item.id}`, { reviewer_id: u.sam.id, status: 'done' })).status, 403)
  // Can't swap the owner onto the reviewer either.
  await app.call('alex', 'PATCH', `/api/items/${item.id}`, { reviewer_id: u.sam.id })
  assert.equal((await app.call('sam', 'PATCH', `/api/items/${item.id}`, { assignee_id: u.sam.id })).status, 400)
  // Creating it already Done is blocked too.
  assert.equal((await mk('alex', { status: 'done' })).status, 403)
  // A lead can, and the sign-off is recorded.
  const res = await app.call('lead', 'PATCH', `/api/items/${item.id}`, { status: 'done' })
  assert.equal(res.status, 200)
  assert.equal(res.data.item.approved_by, u.lead.id)
})

test('bulk Done is all or nothing; automations can’t bypass the rule', async () => {
  const { app, board, group, u, mk } = await setup()
  const a = (await mk('alex', { title: 'A', reviewer_id: u.sam.id, assignee_id: u.alex.id })).data.item
  const b = (await mk('alex', { title: 'B', reviewer_id: u.lead.id })).data.item
  const res = await app.call('sam', 'POST', '/api/items/bulk', { ids: [a.id, b.id], action: 'update', changes: { status: 'done' } })
  assert.equal(res.status, 403)
  const items = (await app.call('lead', 'GET', `/api/boards/${board.id}`)).data.items
  assert.ok(items.every((i) => i.status !== 'done'), 'nothing changed')

  // "When status is Needs review, set to Done" would let anyone skip review. It's skipped.
  await app.call('lead', 'POST', `/api/boards/${board.id}/automations`, { trigger: { type: 'status_to', status: 'review' }, action: { type: 'set_status', status: 'done' } })
  await app.call('alex', 'PATCH', `/api/items/${a.id}`, { status: 'review' })
  const after = (await app.call('alex', 'GET', `/api/items/${a.id}`)).data.item
  assert.equal(after.status, 'review')
  assert.ok(group)
})

test('without approvals, Done is open; the reviewer still signs off when they mark it', async () => {
  const { app, u, mk } = await setup({ approval: false })
  const item = (await mk('alex', { assignee_id: u.alex.id, reviewer_id: u.sam.id })).data.item
  const own = await app.call('alex', 'PATCH', `/api/items/${item.id}`, { status: 'done' })
  assert.equal(own.status, 200)
  assert.equal(own.data.item.approved_by, null, 'the owner marking it Done is not an approval')
  await app.call('alex', 'PATCH', `/api/items/${item.id}`, { status: 'review' })
  const ok = await app.call('sam', 'POST', `/api/items/${item.id}/approve`)
  assert.equal(ok.data.item.approved_by, u.sam.id)
})

test('group default reviewer, My work “to review”, workload count', async () => {
  const { app, group, u, mk } = await setup()
  assert.equal((await app.call('alex', 'PATCH', `/api/groups/${group.id}`, { default_reviewer_id: u.sam.id })).status, 403)
  assert.equal((await app.call('lead', 'PATCH', `/api/groups/${group.id}`, { default_reviewer_id: u.sam.id })).data.group.default_reviewer_id, u.sam.id)
  const item = (await mk('alex', { assignee_id: u.alex.id })).data.item
  assert.equal(item.reviewer_id, u.sam.id)
  const own = (await mk('alex', { title: 'Sam’s own', assignee_id: u.sam.id })).data.item
  assert.equal(own.reviewer_id, null, 'the default isn’t applied to the reviewer’s own task')
  await app.call('alex', 'PATCH', `/api/items/${item.id}`, { status: 'review' })
  const mine = (await app.call('sam', 'GET', '/api/my-work')).data
  assert.deepEqual(mine.to_review.map((i) => i.title), ['Intake'])
  assert.equal(mine.to_review[0].assignee_name, 'Alex')
  const sam = (await app.call('lead', 'GET', '/api/reports/workload')).data.people.find((p) => p.user_id === u.sam.id)
  assert.equal(sam.reviewing, 1)
})

test('who can review: leads, mentors, or the subteam (the board’s, else the owner’s)', async () => {
  const app = await makeTeam()
  const u = app.users
  await app.addUser('pat', 'member', { name: 'Pat', subteam_id: 'st_mech' })
  // alex: Mechanical, sam: Electrical, lead: Programming.
  const mech = (await app.call('lead', 'POST', '/api/boards', { name: 'Mech', subteam_id: 'st_mech' })).data.board
  const g = (await app.call('lead', 'GET', `/api/boards/${mech.id}`)).data.groups[0]
  const t = (await app.call('alex', 'POST', '/api/items', { board_id: mech.id, group_id: g.id, title: 'T', assignee_id: u.alex.id })).data.item
  const sam = await app.call('alex', 'PATCH', `/api/items/${t.id}`, { reviewer_id: u.sam.id })
  assert.equal(sam.status, 400)
  assert.match(sam.data.error, /leads, mentors, or someone on/)
  assert.equal((await app.call('alex', 'PATCH', `/api/items/${t.id}`, { reviewer_id: u.pat.id })).status, 200, 'same subteam')
  assert.equal((await app.call('alex', 'PATCH', `/api/items/${t.id}`, { reviewer_id: u.lead.id })).status, 200, 'any lead')
  assert.equal((await app.call('alex', 'PATCH', `/api/items/${t.id}`, { reviewer_id: u.mentor.id })).status, 200, 'any mentor')

  // A board with no subteam goes by the owner's subteam.
  const open = (await app.call('lead', 'POST', '/api/boards', { name: 'Open' })).data.board
  const og = (await app.call('lead', 'GET', `/api/boards/${open.id}`)).data.groups[0]
  const t2 = (await app.call('sam', 'POST', '/api/items', { board_id: open.id, group_id: og.id, title: 'T2', assignee_id: u.sam.id })).data.item
  assert.equal((await app.call('sam', 'PATCH', `/api/items/${t2.id}`, { reviewer_id: u.pat.id })).status, 400)
  const t3 = (await app.call('alex', 'POST', '/api/items', { board_id: open.id, group_id: og.id, title: 'T3', assignee_id: u.alex.id, reviewer_id: u.pat.id })).data.item
  assert.equal(t3.reviewer_id, u.pat.id)
  // Handing T3 to sam would leave a reviewer from the wrong subteam: refused.
  assert.equal((await app.call('alex', 'PATCH', `/api/items/${t3.id}`, { assignee_id: u.sam.id })).status, 400)
  // No subteam anywhere: leads and mentors only.
  app.sql('UPDATE users SET subteam_id = NULL WHERE id = ?', u.sam.id)
  assert.equal((await app.call('sam', 'PATCH', `/api/items/${t2.id}`, { reviewer_id: u.alex.id })).status, 400)

  // A group default reviewer from another subteam is skipped, not applied.
  await app.call('lead', 'PATCH', `/api/groups/${g.id}`, { default_reviewer_id: u.sam.id })
  const t4 = (await app.call('alex', 'POST', '/api/items', { board_id: mech.id, group_id: g.id, title: 'T4', assignee_id: u.alex.id })).data.item
  assert.equal(t4.reviewer_id, null)
})

test('reviews waiting 2+ days get one reminder a day', async () => {
  const { app, u, mk } = await setup({ approval: false })
  const item = (await mk('alex', { assignee_id: u.alex.id, reviewer_id: u.sam.id })).data.item
  await app.call('alex', 'PATCH', `/api/items/${item.id}`, { status: 'review' })
  assert.ok((await app.call('alex', 'GET', `/api/items/${item.id}`)).data.item.review_requested_at)
  assert.equal(await sendReviewReminders(app.env), 0, 'not yet')
  app.sql("UPDATE items SET review_requested_at = datetime('now', '-3 days') WHERE id = ?", item.id)
  assert.equal(await sendReviewReminders(app.env), 1)
  assert.equal(await sendReviewReminders(app.env), 0, 'once a day')
  assert.ok((await inbox(app, 'sam')).some((n) => /waited 3 days for your review \(Alex\)/.test(n.body)))
  // Leaving review clears the clock.
  await app.call('sam', 'POST', `/api/items/${item.id}/approve`)
  assert.equal((await app.call('alex', 'GET', `/api/items/${item.id}`)).data.item.review_requested_at, null)
})
