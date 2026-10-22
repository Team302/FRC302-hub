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
  ['2027 Robot', 'st_mech', 'green', 'build', [
    ['Swerve module CAD', 'Sofia', 'review', 'high', 1, 'Drivetrain', [-10, 2], 12, true],
    ['Order MK4i modules and spares', 'Jordan', 'done', 'critical', -3, 'Drivetrain', null, 1, true],
    ['Cut and drill frame rails', 'Marcus', 'working', 'high', 2, 'Drivetrain', [-2, 4], 6, false],
    ['Belly pan (waiting on polycarb)', 'Marcus', 'stuck', 'medium', -1, 'Drivetrain', [-4, -1], 3, false],
    ['Intake roller prototype', 'Ava', 'working', 'high', 5, 'Intake', [0, 8], 10, false],
    ['Shooter flywheel spin-up test', 'Ethan', 'not_started', 'medium', 12, 'Shooter', [9, 16], 4, false],
    ['Climber hook geometry', null, 'not_started', 'low', 20, 'Climber', [14, 24], 8, false],
    ['Wire PDH and CAN bus', 'Ava', 'not_started', 'high', 9, 'Electrical', [6, 12], 5, true],
  ]],
  ['Software', 'st_prog', 'blue', 'blank', [
    ['Swerve drive characterization', 'Ethan', 'working', 'high', 3], ['AprilTag pose estimation', 'Priya', 'working', 'critical', 5],
    ['Auto: three-piece center', 'Priya', 'not_started', 'high', 12], ['Driver dashboard layout', 'Ethan', 'review', 'low', 4],
  ]],
  ['Outreach', 'st_out', 'pink', 'outreach', [
    ['Library STEM night', 'Mia', 'done', 'medium', -7], ['Elementary school robot demo', 'Mia', 'working', 'high', 6],
    ['Sponsor thank-you visits', 'Noah', 'not_started', 'medium', 14], ['Summer camp volunteer signup', null, 'not_started', 'low', null],
  ]],
]
let robot
for (const [name, subteam, color, template, items] of boards) {
  const { board } = await call(lead, 'POST', '/boards', { name, subteam_id: subteam, color, template })
  const full = await call(lead, 'GET', `/boards/${board.id}`)
  robot ??= { board, ...full }
  const col = Object.fromEntries(full.columns.map((c) => [c.title, c]))
  for (const [i, [title, who, status, priority, due, subsystem, span, hours, parts]] of items.entries()) {
    const { item } = await call(lead, 'POST', '/items', { board_id: board.id, group_id: full.groups[Math.min(i % 3, full.groups.length - 1)].id, title, status, priority, assignee_id: who ? ids[who] : null, due_date: due === null ? null : day(due) })
    const put = (c, value) => call(lead, 'PUT', `/items/${item.id}/values/${c.id}`, { value })
    if (col.Subsystem && subsystem) await put(col.Subsystem, [col.Subsystem.settings.options.find((o) => o.label === subsystem).id])
    if (col.Timeline && span) await put(col.Timeline, { start: day(span[0]), end: day(span[1]) })
    if (col['Est. hours'] && hours) await put(col['Est. hours'], hours)
    if (col['Parts ordered'] && parts) await put(col['Parts ordered'], true)
    if (col['Event date'] && due !== null) await put(col['Event date'], day(due))
    if (col.Volunteers && who) await put(col.Volunteers, [ids[who], ids.Noah])
    if (col['Volunteer hours'] && status === 'done') await put(col['Volunteer hours'], 14)
    if (status === 'stuck') await call(lead, 'POST', `/items/${item.id}/updates`, { body: '@Coach Rivera polycarb is backordered until next week. Can we use last year’s scrap?', mentions: [me.id] })
    if (title.startsWith('Swerve module CAD')) {
      for (const [t, w, s] of [['Module mount plate', 'Sofia', 'done'], ['Encoder bracket', 'Sofia', 'working'], ['Bevel gear clearance check', 'Marcus', 'not_started']]) {
        await call(lead, 'POST', '/items', { board_id: board.id, parent_id: item.id, title: t, assignee_id: ids[w], status: s })
      }
      await call(lead, 'PUT', `/items/${item.id}/values/${col.CAD.id}`, { value: { url: 'https://cad.onshape.com/', text: 'Swerve assembly' } })
    }
  }
}
// One task for the coach so Home and My work have something, and an automation to show off.
await call(lead, 'POST', '/items', { board_id: robot.board.id, group_id: robot.groups[0].id, title: 'Approve drivetrain budget', assignee_id: me.id, due_date: day(1), priority: 'high' })
await call(lead, 'POST', `/boards/${robot.board.id}/automations`, { trigger: { type: 'status_to', status: 'done' }, action: { type: 'move_to_group', group_id: robot.groups.at(-1).id } })
await call(lead, 'POST', `/boards/${robot.board.id}/automations`, { trigger: { type: 'status_to', status: 'stuck' }, action: { type: 'notify', user_ids: [me.id] } })

const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(18, 30, 0, 0)
const { meeting } = await call(lead, 'POST', '/meetings', { title: 'Tuesday all-hands', starts_at: start.toISOString(), duration_min: 45, location: 'Shop', facilitator_id: ids.Jordan })
for (const [title, minutes, who] of [['Wins from last week', 5, 'Jordan'], ['Drivetrain status', 10, 'Marcus'], ['Software: vision progress', 10, 'Priya'], ['Sponsor update', 5, 'Noah'], ['Open floor / blockers', 10, null]]) {
  await call(lead, 'POST', `/meetings/${meeting.id}/agenda`, { title, minutes, owner_id: who ? ids[who] : null })
}
const live = new Date(Date.now() - 7 * 60000)
const { meeting: m2 } = await call(lead, 'POST', '/meetings', { title: 'Build session — leads sync', kind: 'leadership', starts_at: live.toISOString(), duration_min: 20, location: 'Room 302' })
for (const [title, minutes] of [['What shipped today', 5], ['Blockers', 10], ['Tomorrow’s plan', 5]]) await call(lead, 'POST', `/meetings/${m2.id}/agenda`, { title, minutes })
await call(lead, 'POST', `/meetings/${m2.id}/start`)

// A season's worth of past build sessions with attendance, so People → Attendance has data.
const roster = Object.values(ids)
for (let w = 6; w >= 1; w--) {
  const when = new Date(); when.setDate(when.getDate() - w * 7); when.setHours(15, 0, 0, 0)
  const { meeting: past } = await call(lead, 'POST', '/meetings', { title: 'Saturday build session', kind: 'build', starts_at: when.toISOString(), duration_min: 240, location: 'Shop' })
  await call(lead, 'POST', `/meetings/${past.id}/agenda`, { title: 'Build', minutes: 220 })
  await call(lead, 'POST', `/meetings/${past.id}/start`)
  for (const [i, uid] of [...roster, me.id].entries()) {
    const roll = (i * 7 + w * 3) % 10
    const status = roll < 6 ? 'present' : roll < 7 ? 'late' : roll < 8 ? 'excused' : 'absent'
    await call(lead, 'PUT', `/meetings/${past.id}/attendance/${uid}`, { status })
  }
  await call(lead, 'POST', `/meetings/${past.id}/end`)
}
// Weekly all-hands for the next two months.
const tue = new Date(); tue.setDate(tue.getDate() + ((9 - tue.getDay()) % 7 || 7)); tue.setHours(18, 30, 0, 0)
const until = new Date(tue); until.setDate(until.getDate() + 56)
await call(lead, 'POST', '/meetings', { title: 'Weekly all-hands', starts_at: tue.toISOString(), duration_min: 45, location: 'Room 302', repeat_until: until.toISOString().slice(0, 10), copy_agenda_from: meeting.id })

// Parts & purchasing board.
{
  const { board } = await call(lead, 'POST', '/boards', { name: 'Parts & purchasing', subteam_id: 'st_biz', color: 'amber', template: 'purchasing' })
  const full = await call(lead, 'GET', `/boards/${board.id}`)
  const col = Object.fromEntries(full.columns.map((c) => [c.title, c]))
  const vendor = (name) => [col.Vendor.settings.options.find((o) => o.label === name).id]
  for (const [title, g, v, qty, cost, who] of [
    ['MK4i swerve modules (L2)', 3, 'Other', 4, 1196, 'Jordan'], ['NEO Vortex motors', 2, 'REV', 8, 400, 'Jordan'],
    ['1/8" polycarbonate sheet', 1, 'McMaster-Carr', 2, 96.5, 'Marcus'], ['CANcoder', 0, 'CTRE', 4, 260, 'Ava'],
    ['Bearings, 1/2" hex', 0, 'WCP', 20, 59, 'Marcus'], ['Battery (MK ES17-12)', 1, 'AndyMark', 3, 165, 'Ava'],
  ]) {
    const { item } = await call(lead, 'POST', '/items', { board_id: board.id, group_id: full.groups[g].id, title, assignee_id: ids[who], due_date: day(7 + g * 3) })
    await call(lead, 'PUT', `/items/${item.id}/values/${col.Vendor.id}`, { value: vendor(v) })
    await call(lead, 'PUT', `/items/${item.id}/values/${col.Qty.id}`, { value: qty })
    await call(lead, 'PUT', `/items/${item.id}/values/${col['Total cost'].id}`, { value: cost })
  }
}

// The season: kickoff and competitions relative to today so the countdown always shows.
for (const [name, kind, start, len, location] of [
  ['FRC Kickoff', 'kickoff', 74, 0, 'Lake Orion High School'],
  ['Stop build: robot bag-and-tag', 'deadline', 130, 0, ''],
  ['FIM District Lake City Event', 'competition', 143, 2, 'Lake City, MI'],
  ['FIM District Troy Event', 'competition', 157, 2, 'Troy, MI'],
  ['Impact Award essay due', 'deadline', 40, 0, ''],
  ['Library STEM night', 'outreach', 9, 0, 'Orion Township Public Library'],
]) await call(lead, 'POST', '/events', { name, kind, starts_on: day(start), ends_on: day(start + len), location })

for (const [name, url, username, secret, min_role, totp, notes] of [
  ['Onshape team account', 'https://cad.onshape.com', 'cad@example.org', 'demo-Onsh4pe!', 'lead', 'JBSWY3DPEHPK3PXP', ''],
  ['Shop Wi-Fi', '', 'Dragons302', 'demo-wifi-pass', 'member', null, 'SSID is Dragons302-5G in the shop.'],
  ['FIRST team dashboard', 'https://frc-events.firstinspires.org', 'coach@example.org', 'demo-first-pw', 'admin', null, 'Registration, payments, consent forms.'],
  ['Team Instagram', 'https://instagram.com', 'firstteam302', 'demo-insta-pw', 'lead', null, 'Outreach leads post; mentors approve.'],
]) await call(admin, 'POST', '/vault', { name, url, username, secret, min_role, totp: totp || undefined, notes })

console.log(`Seeded. Sign in as ${bootstrap} (mentor), jordan@example.org (lead) or marcus@example.org (member).`)
