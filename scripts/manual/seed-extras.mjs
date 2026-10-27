// What the manual shows beyond scripts/seed-demo.mjs: equipment and loans, a season budget and
// expenses at each stage, a trip with a waitlist and a part-done checklist, a review waiting, and
// a shop kiosk. All fake.
import { api, login } from './server.mjs'

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)


async function meetingRefs(token) {
  const all = [...(await api(token, 'GET', '/meetings')).meetings, ...(await api(token, 'GET', '/meetings?scope=past')).meetings]
  const live = all.find((m) => m.title === 'Tuesday all-hands')
  const detail = await api(token, 'GET', `/meetings/${live.id}`)
  return {
    // When the live meeting started (UTC), so its figure can pin the clock to a normal-looking countdown.
    allHandsStartedAt: Date.parse(`${detail.meeting.started_at.replace(' ', 'T')}Z`),
    nextWeekly: all.find((m) => m.title === 'Weekly all-hands' && m.status === 'scheduled'),
    pastMeeting: all.find((m) => m.title === 'Saturday build session'),
  }
}

export async function seedExtras() {
  const t = {}
  for (const n of ['coach@team302.org', 'dana', 'jordan', 'priya', 'ava', 'ethan', 'liam', 'marcus', 'mia', 'noah', 'sofia']) {
    t[n.split('@')[0]] = await login(n.includes('@') ? n : `${n}@example.org`)
  }
  const users = (await api(t.coach, 'GET', '/users')).users
  const id = (first) => users.find((u) => u.name.startsWith(first)).id

  // Equipment
  const eq = async (b) => (await api(t.jordan, 'POST', '/equipment', b)).item
  const drill = await eq({ name: 'DeWalt 20V drill', asset_tag: 'T-014', category: 'power_tool', location: 'Tool wall', quantity: 3 })
  const laptop = await eq({ name: 'Driver station laptop', asset_tag: 'C-002', category: 'computer', location: 'Pit cart' })
  await eq({ name: 'NEO brushless motor (spare)', category: 'robot_spare', location: 'Bin 12', quantity: 6 })
  await eq({ name: 'Safety glasses', category: 'safety', location: 'By the door', quantity: 40 })
  await eq({ name: 'Digital calipers', asset_tag: 'T-031', category: 'tool', location: 'Drawer 4', quantity: 2 })
  await eq({ name: 'Oscilloscope', asset_tag: 'E-007', category: 'electronics', location: 'Electrical bench' })
  await api(t.jordan, 'POST', `/equipment/${laptop.id}/lend`, { borrower_id: id('Ethan'), due_on: day(3) })
  await api(t.ava, 'POST', `/equipment/${drill.id}/lend`, { borrower_id: id('Ava') })

  // Budget and expenses
  const season = new Date().getMonth() >= 7 ? new Date().getFullYear() + 1 : new Date().getFullYear()
  const cat = async (name, dollars) => (await api(t.coach, 'POST', '/budget-categories', { season, name, budget_cents: dollars * 100 })).category
  const parts = await cat('Robot parts', 6000)
  const tools = await cat('Tools', 1500)
  const travel = await cat('Travel', 4000)
  const outreach = await cat('Outreach', 800)
  const ex = async (who, b) => (await api(t[who], 'POST', '/expenses', { spent_on: day(-5), payment: 'team', ...b })).expense
  const e1 = await ex('jordan', { amount_cents: 48999, description: 'Swerve modules (2)', vendor: 'REV Robotics', category_id: parts.id })
  const e2 = await ex('ava', { amount_cents: 2350, description: 'Wago connectors and heat shrink', vendor: 'AndyMark', category_id: parts.id, payment: 'personal' })
  const e3 = await ex('marcus', { amount_cents: 8900, description: 'Replacement drill batteries', vendor: 'Home Depot', category_id: tools.id, payment: 'personal' })
  await ex('mia', { amount_cents: 6400, description: 'Library STEM night supplies', vendor: 'Michaels', category_id: outreach.id, payment: 'personal' })
  await ex('priya', { amount_cents: 120000, description: 'Hotel deposit, Lake City', vendor: 'Holiday Inn Express', category_id: travel.id })
  await api(t.coach, 'POST', `/expenses/${e1.id}/decision`, { decision: 'approved' })
  await api(t.dana, 'POST', `/expenses/${e3.id}/decision`, { decision: 'approved' })
  await api(t.coach, 'POST', `/expenses/${e3.id}/reimbursed`, {})
  await api(t.coach, 'POST', `/expenses/${e2.id}/decision`, { decision: 'approved' })

  // A trip with a cap, a waitlist and a part-done checklist
  const trip = (await api(t.jordan, 'POST', '/events', { name: 'FIM District Lake City', kind: 'competition', starts_on: day(24), ends_on: day(26), location: 'Lake City, MI' })).event
  let v = await api(t.jordan, 'PATCH', `/events/${trip.id}/roster`, { roster_open: true, capacity: 5, signup_closes_on: day(14) })
  for (const n of ['ethan', 'liam', 'marcus', 'mia', 'noah', 'sofia']) await api(t[n], 'POST', `/events/${trip.id}/roster`, n === 'liam' ? { note: 'Leaving Saturday at noon' } : {})
  await api(t.coach, 'POST', `/events/${trip.id}/roster`, {})
  v = await api(t.jordan, 'POST', `/events/${trip.id}/requirements`, { label: 'Safety glasses packed' })
  const [slip, fee, med, glasses] = v.requirements.map((r) => r.id)
  const going = v.people.filter((p) => p.status === 'going' && !p.mentor)
  for (const [i, p] of going.entries()) {
    if (i < 3) await api(t.coach, 'PUT', `/events/${trip.id}/checks`, { requirement_id: slip, user_id: p.user_id, done: true })
    if (i < 2) await api(t.coach, 'PUT', `/events/${trip.id}/checks`, { requirement_id: fee, user_id: p.user_id, done: true })
    if (i === 0) for (const r of [med, glasses]) await api(t.coach, 'PUT', `/events/${trip.id}/checks`, { requirement_id: r, user_id: p.user_id, done: true })
  }

  // A whole-team meeting in progress (students can check in to it), with a few already here
  const meetings = (await api(t.jordan, 'GET', '/meetings')).meetings
  const allHands = meetings.find((m) => m.title === 'Tuesday all-hands')
  await api(t.jordan, 'POST', `/meetings/${allHands.id}/start`)
  for (const n of ['marcus', 'mia', 'sofia', 'noah']) await api(t[n], 'POST', `/meetings/${allHands.id}/checkin`)

  // A review waiting for Marcus
  const robot = (await api(t.jordan, 'GET', '/boards')).boards.find((b) => b.name === '2027 Robot')
  const cad = (await api(t.jordan, 'GET', `/boards/${robot.id}`)).items.find((i) => i.title === 'Swerve module CAD')
  await api(t.jordan, 'PATCH', `/items/${cad.id}`, { reviewer_id: id('Marcus') })

  // A shop kiosk link
  const kiosk = await api(t.jordan, 'POST', '/kiosks', { name: 'Shop door tablet' })

  return { trip, kiosk, tokens: t, allHands, robot, cad, ...(await meetingRefs(t.jordan)) }
}

// For --reuse: the same context from a hub that was already seeded.
export async function contextFromServer() {
  const t = { coach: await login('coach@team302.org'), jordan: await login('jordan@example.org') }
  const trip = (await api(t.jordan, 'GET', '/events?scope=all')).events.find((e) => e.name === 'FIM District Lake City')
  const kiosk = await api(t.jordan, 'POST', '/kiosks', { name: 'Shop door tablet' })
  const allHands = (await api(t.jordan, 'GET', '/meetings')).meetings.find((m) => m.title === 'Tuesday all-hands')
  const robot = (await api(t.jordan, 'GET', '/boards')).boards.find((b) => b.name === '2027 Robot')
  const cad = (await api(t.jordan, 'GET', `/boards/${robot.id}`)).items.find((i) => i.title === 'Swerve module CAD')
  return { trip, kiosk, tokens: t, allHands, robot, cad, ...(await meetingRefs(t.jordan)) }
}
