import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam } from './harness.mjs'

async function board(app) {
  const b = await app.call('lead', 'POST', '/api/boards', { name: 'Drivetrain', subteam_id: 'st_mech' })
  assert.equal(b.status, 201)
  const full = await app.call('alex', 'GET', `/api/boards/${b.data.board.id}`)
  return { board: full.data.board, groups: full.data.groups }
}

test('boards: members create and edit items; leads manage structure', async () => {
  const app = await makeTeam()
  const { board: b, groups } = await board(app)
  assert.deepEqual(groups.map((g) => g.name), ['This week', 'Next up', 'Backlog'])
  const item = await app.call('alex', 'POST', '/api/items', { board_id: b.id, group_id: groups[0].id, title: 'Cut gussets', assignee_id: 'usr_alex', due_date: '2026-01-10' })
  assert.equal(item.status, 201)
  const done = await app.call('sam', 'PATCH', `/api/items/${item.data.item.id}`, { status: 'done' })
  assert.ok(done.data.item.completed_at)
  const reopened = await app.call('sam', 'PATCH', `/api/items/${item.data.item.id}`, { status: 'working' })
  assert.equal(reopened.data.item.completed_at, null)
  assert.equal((await app.call('alex', 'POST', `/api/boards/${b.id}/groups`, { name: 'Nope' })).status, 403)
  assert.equal((await app.call('lead', 'DELETE', `/api/boards/${b.id}`)).status, 403)
  assert.equal((await app.call('lead', 'DELETE', `/api/groups/${groups[0].id}`)).status, 409)
})

test('items: delete is lead-or-creator; moves stay within the board; assignees must be active', async () => {
  const app = await makeTeam()
  const { board: b, groups } = await board(app)
  const other = await board(app)
  const item = (await app.call('alex', 'POST', '/api/items', { board_id: b.id, group_id: groups[0].id, title: 'A' })).data.item
  assert.equal((await app.call('sam', 'DELETE', `/api/items/${item.id}`)).status, 403)
  assert.equal((await app.call('alex', 'PATCH', `/api/items/${item.id}`, { group_id: other.groups[0].id })).status, 400)
  assert.equal((await app.call('alex', 'POST', '/api/items', { board_id: b.id, group_id: other.groups[0].id, title: 'B' })).status, 400)
  app.sql("UPDATE users SET is_active = 0 WHERE id = 'usr_sam'")
  assert.equal((await app.call('alex', 'PATCH', `/api/items/${item.id}`, { assignee_id: 'usr_sam' })).status, 400)
  assert.equal((await app.call('alex', 'DELETE', `/api/items/${item.id}`)).status, 200)
})

test('my work and home', async () => {
  const app = await makeTeam()
  const { board: b, groups } = await board(app)
  await app.call('lead', 'POST', '/api/items', { board_id: b.id, group_id: groups[0].id, title: 'Late', assignee_id: 'usr_alex', due_date: '2000-01-01' })
  await app.call('lead', 'POST', '/api/items', { board_id: b.id, group_id: groups[0].id, title: 'Done', assignee_id: 'usr_alex', status: 'done' })
  const mine = await app.call('alex', 'GET', '/api/my-work')
  assert.deepEqual(mine.data.items.map((i) => i.title), ['Late'])
  const home = await app.call('alex', 'GET', '/api/home')
  assert.equal(home.data.overdue_count, 1)
})

test('meetings: visibility by kind, hidden is 404', async () => {
  const app = await makeTeam()
  const lead = await app.call('lead', 'POST', '/api/meetings', { title: 'Captains', kind: 'leadership', starts_at: '2026-01-05T18:00:00-05:00' })
  assert.equal((await app.call('lead', 'POST', '/api/meetings', { title: 'Mentors', kind: 'mentor', starts_at: '2026-01-05T18:00:00-05:00' })).status, 403)
  assert.equal((await app.call('alex', 'POST', '/api/meetings', { title: 'x', starts_at: '2026-01-05T18:00:00Z' })).status, 403)
  assert.equal((await app.call('alex', 'GET', `/api/meetings/${lead.data.meeting.id}`)).status, 404)
  assert.equal((await app.call('alex', 'GET', '/api/meetings')).data.meetings.length, 0)
  assert.equal((await app.call('lead', 'GET', '/api/meetings')).data.meetings.length, 1)
})

test('meetings: run an agenda, attendance, action items become tasks, recap', async () => {
  const app = await makeTeam()
  const { board: b, groups } = await board(app)
  const m = (await app.call('lead', 'POST', '/api/meetings', { title: 'All hands', starts_at: new Date(Date.now() - 30 * 60000).toISOString(), facilitator_id: 'usr_alex' })).data.meeting
  for (const [title, minutes] of [['Wins', 5], ['Build status', 15], ['Outreach', 10]]) {
    await app.call('alex', 'POST', `/api/meetings/${m.id}/agenda`, { title, minutes })
  }
  assert.equal((await app.call('sam', 'POST', `/api/meetings/${m.id}/agenda`, { title: 'x' })).status, 403)
  assert.equal((await app.call('sam', 'POST', `/api/meetings/${m.id}/checkin`)).status, 409)

  const started = await app.call('alex', 'POST', `/api/meetings/${m.id}/start`)
  assert.deepEqual(started.data.agenda.map((a) => a.status), ['active', 'pending', 'pending'])
  const adv = await app.call('alex', 'POST', `/api/meetings/${m.id}/advance`, { skip: true })
  assert.deepEqual(adv.data.agenda.map((a) => a.status), ['skipped', 'active', 'pending'])

  // started 30 min ago → self check-in is "late"
  assert.equal((await app.call('sam', 'POST', `/api/meetings/${m.id}/checkin`)).data.status, 'late')
  assert.equal((await app.call('alex', 'PUT', `/api/meetings/${m.id}/attendance/usr_sam`, { status: 'present' })).status, 200)
  assert.equal((await app.call('sam', 'PUT', `/api/meetings/${m.id}/attendance/usr_alex`, { status: 'present' })).status, 403)

  const action = await app.call('alex', 'POST', `/api/meetings/${m.id}/actions`, { title: 'Order bearings', assignee_id: 'usr_sam', due_date: '2026-01-12', board_id: b.id, group_id: groups[0].id })
  assert.equal(action.status, 201)
  assert.equal(action.data.item.source_meeting_id, m.id)
  await app.call('alex', 'PATCH', `/api/meetings/${m.id}`, { decisions: 'Swerve this year' })

  const ended = await app.call('alex', 'POST', `/api/meetings/${m.id}/end`)
  assert.equal(ended.data.meeting.status, 'ended')
  const recap = await app.call('sam', 'GET', `/api/meetings/${m.id}/recap`)
  assert.match(recap.data.markdown, /Order bearings — Sam, due 2026-01-12/)
  assert.match(recap.data.markdown, /Swerve this year/)
  assert.match(recap.data.markdown, /~~Wins~~ \(skipped\)/)
  assert.equal((await app.call('sam', 'GET', '/api/meetings?scope=past')).data.meetings[0].action_count, 1)
})

test('copying an agenda from a previous meeting', async () => {
  const app = await makeTeam()
  const a = (await app.call('lead', 'POST', '/api/meetings', { title: 'Week 1', starts_at: '2026-01-05T18:00:00Z' })).data.meeting
  await app.call('lead', 'POST', `/api/meetings/${a.id}/agenda`, { title: 'Wins', minutes: 5 })
  const b = (await app.call('lead', 'POST', '/api/meetings', { title: 'Week 2', starts_at: '2026-01-12T18:00:00Z', copy_agenda_from: a.id })).data.meeting
  const full = await app.call('lead', 'GET', `/api/meetings/${b.id}`)
  assert.deepEqual(full.data.agenda.map((x) => x.title), ['Wins'])
})

test('team: emails hidden from members; last admin cannot be removed', async () => {
  const app = await makeTeam()
  const asMember = await app.call('alex', 'GET', '/api/users')
  assert.ok(asMember.data.users.every((u) => u.id === 'usr_alex' || u.email === undefined))
  const asLead = await app.call('lead', 'GET', '/api/users')
  assert.ok(asLead.data.users.every((u) => u.email))
  assert.equal((await app.call('mentor', 'PATCH', '/api/users/usr_mentor', { role: 'lead' })).status, 409)
  assert.equal((await app.call('lead', 'POST', '/api/users', { email: 'new@example.org', name: 'New' })).status, 403)
  const added = await app.call('mentor', 'POST', '/api/users', { email: 'New@Example.org', name: 'New', role: 'member' })
  assert.equal(added.status, 201)
  assert.equal((await app.call('mentor', 'POST', '/api/users', { email: 'new@example.org', name: 'Dup' })).status, 409)
  assert.equal((await app.call('alex', 'GET', '/api/activity')).status, 403)
  assert.ok((await app.call('mentor', 'GET', '/api/activity')).data.activity.some((a) => a.action === 'user.add'))
})
