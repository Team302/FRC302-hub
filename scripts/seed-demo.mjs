// Fills a LOCAL dev server with a demo team, boards, a meeting and vault entries, through the
// real API. Needs `npm run dev` running with DEV_LOGIN=on and BOOTSTRAP_ADMIN_EMAIL set.
//   node scripts/seed-demo.mjs [http://localhost:8787]
// All names, emails and passwords are fake.
const base = process.argv[2] || 'http://localhost:8787'
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) throw new Error('Refusing: demo data only goes to a local server.')

async function call(token, method, path, body) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${data.error}`)
  return data
}

const { bootstrap_email: bootstrap } = await call(null, 'GET', '/auth/dev-users')
if (!bootstrap) throw new Error('This database already has people in it; seed a fresh one.')
const { token: admin } = await call(null, 'POST', '/auth/dev-login', { email: bootstrap })
await call(admin, 'PATCH', '/me', { name: 'Coach Rivera' })

const people = [
  ['Jordan Kim', 'lead', 'st_mech'], ['Priya Patel', 'lead', 'st_prog'], ['Marcus Lee', 'member', 'st_mech'],
  ['Ava Thompson', 'member', 'st_elec'], ['Ethan Brooks', 'member', 'st_prog'], ['Sofia Garcia', 'member', 'st_cad'],
  ['Noah Williams', 'member', 'st_biz'], ['Mia Chen', 'member', 'st_out'], ['Liam Novak', 'member', 'st_strat'],
  ['Dana Walsh', 'admin', null],
]
const ids = {}
for (const [name, role, subteam] of people) {
  const email = `${name.split(' ')[0].toLowerCase()}@example.org`
  ids[name.split(' ')[0]] = (await call(admin, 'POST', '/users', { name, email, role, subteam_id: subteam })).user.id
}
const { user: me } = await call(admin, 'GET', '/me')
const { token: lead } = await call(null, 'POST', '/auth/dev-login', { email: 'jordan@example.org' })

const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const boards = [
  ['Drivetrain', 'st_mech', 'orange', [
    ['Finalize swerve module CAD', 'Sofia', 'review', 'high', 1], ['Order MK4i modules + spares', 'Jordan', 'done', 'critical', -3],
    ['Cut and drill frame rails', 'Marcus', 'working', 'high', 2], ['Bumper frame', null, 'not_started', 'medium', 9],
    ['Belly pan — waiting on polycarb', 'Marcus', 'stuck', 'medium', -1],
  ]],
  ['Software', 'st_prog', 'blue', [
    ['Swerve drive characterization', 'Ethan', 'working', 'high', 3], ['AprilTag pose estimation', 'Priya', 'working', 'critical', 5],
    ['Auto: 3-piece center', 'Priya', 'not_started', 'high', 12], ['Driver dashboard layout', 'Ethan', 'review', 'low', 4],
  ]],
  ['Business & Outreach', 'st_biz', 'green', [
    ['Sponsor thank-you packets', 'Noah', 'working', 'medium', 6], ['Impact award essay draft', 'Mia', 'not_started', 'high', 14],
    ['Library STEM night volunteers', 'Mia', 'done', 'medium', -7], ['Update team website sponsors page', null, 'not_started', 'low', null],
  ]],
]
let firstBoard
for (const [name, subteam, color, items] of boards) {
  const { board } = await call(lead, 'POST', '/boards', { name, subteam_id: subteam, color })
  firstBoard ??= board
  const { groups } = await call(lead, 'GET', `/boards/${board.id}`)
  for (const [i, [title, who, status, priority, due]] of items.entries()) {
    const { item } = await call(lead, 'POST', '/items', { board_id: board.id, group_id: groups[i % 2].id, title, status, priority, assignee_id: who ? ids[who] : null, due_date: due === null ? null : day(due) })
    if (status === 'stuck') await call(lead, 'POST', `/items/${item.id}/updates`, { body: 'Polycarb sheet is backordered until next week. Can we use the scrap from last year?' })
  }
}
// One task for the coach so Home has something.
const { groups: g0 } = await call(lead, 'GET', `/boards/${firstBoard.id}`)
await call(lead, 'POST', '/items', { board_id: firstBoard.id, group_id: g0[0].id, title: 'Sign off on drivetrain budget', assignee_id: me.id, due_date: day(1), priority: 'high' })

const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(18, 30, 0, 0)
const { meeting } = await call(lead, 'POST', '/meetings', { title: 'Tuesday all-hands', starts_at: start.toISOString(), duration_min: 45, location: 'Shop', facilitator_id: ids.Jordan })
for (const [title, minutes, who] of [['Wins from last week', 5, 'Jordan'], ['Drivetrain status', 10, 'Marcus'], ['Software: vision progress', 10, 'Priya'], ['Sponsor update', 5, 'Noah'], ['Open floor / blockers', 10, null]]) {
  await call(lead, 'POST', `/meetings/${meeting.id}/agenda`, { title, minutes, owner_id: who ? ids[who] : null })
}
const live = new Date(Date.now() - 7 * 60000)
const { meeting: m2 } = await call(lead, 'POST', '/meetings', { title: 'Build session — leads sync', kind: 'leadership', starts_at: live.toISOString(), duration_min: 20, location: 'Room 302' })
for (const [title, minutes] of [['What shipped today', 5], ['Blockers', 10], ['Tomorrow’s plan', 5]]) await call(lead, 'POST', `/meetings/${m2.id}/agenda`, { title, minutes })
await call(lead, 'POST', `/meetings/${m2.id}/start`)

for (const [name, url, username, secret, min_role, totp, notes] of [
  ['Onshape team account', 'https://cad.onshape.com', 'cad@example.org', 'demo-Onsh4pe!', 'lead', 'JBSWY3DPEHPK3PXP', ''],
  ['Shop Wi-Fi', '', 'Dragons302', 'demo-wifi-pass', 'member', null, 'SSID is Dragons302-5G in the shop.'],
  ['FIRST team dashboard', 'https://frc-events.firstinspires.org', 'coach@example.org', 'demo-first-pw', 'admin', null, 'Registration, payments, consent forms.'],
  ['Team Instagram', 'https://instagram.com', 'firstteam302', 'demo-insta-pw', 'lead', null, 'Outreach leads post; mentors approve.'],
]) await call(admin, 'POST', '/vault', { name, url, username, secret, min_role, totp: totp || undefined, notes })

console.log(`Seeded. Sign in as ${bootstrap} (mentor), jordan@example.org (lead) or marcus@example.org (member).`)
