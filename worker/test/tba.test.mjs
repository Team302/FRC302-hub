import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { makeTeam } from './harness.mjs'

const realFetch = globalThis.fetch
let calls
function stub(routes) {
  calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), key: init?.headers?.['X-TBA-Auth-Key'] })
    const path = String(url).replace('https://www.thebluealliance.com/api/v3', '')
    if (!(path in routes)) return new Response('{}', { status: 404 })
    const r = routes[path]
    return typeof r === 'number' ? new Response('{}', { status: r }) : Response.json(r)
  }
}
beforeEach(() => { calls = [] })
afterEach(() => { globalThis.fetch = realFetch })

const EVENTS_2027 = [
  { key: '2027miket', name: 'FIM District Kettering University Event #1', event_type: 1, city: 'Flint', state_prov: 'MI', start_date: '2027-03-04', end_date: '2027-03-06' },
  { key: '2027mitvc', name: 'FIM District Troy Event', event_type: 1, city: 'Troy', state_prov: 'MI', start_date: '2027-03-18', end_date: '2027-03-20' },
  { key: 'bad key!', name: 'Injected', event_type: 1, start_date: '2027-01-01' },
]

test('import: needs a key, creates, then updates in place and links hand-entered events', async () => {
  const app = await makeTeam()
  const r0 = await app.call('lead', 'POST', '/api/events/import-tba', { year: 2027 })
  assert.equal(r0.status, 503)
  assert.equal(r0.data.code, 'tba_not_configured')

  app.env.TBA_API_KEY = 'k'.repeat(64)
  // A competition someone already typed in by hand, same start date as Troy.
  await app.call('lead', 'POST', '/api/events', { name: 'Troy district', kind: 'competition', starts_on: '2027-03-18', notes: 'Bus at 6am' })
  stub({ '/team/frc302/events/2027/simple': EVENTS_2027 })
  assert.equal((await app.call('alex', 'POST', '/api/events/import-tba', { year: 2027 })).status, 403)
  const r1 = await app.call('lead', 'POST', '/api/events/import-tba', { year: 2027 })
  assert.equal(r1.status, 200)
  assert.deepEqual([r1.data.created, r1.data.updated], [1, 1])
  assert.equal(calls[0].key, 'k'.repeat(64))

  const events = (await app.call('alex', 'GET', '/api/events?scope=all')).data
  assert.deepEqual(events.tba, { configured: true, team: '302' })
  assert.deepEqual(events.events.map((e) => [e.name, e.tba_key, e.location]), [
    ['FIM District Kettering University Event #1', '2027miket', 'Flint, MI'],
    ['FIM District Troy Event', '2027mitvc', 'Troy, MI'],
  ])
  assert.equal(events.events[1].notes, 'Bus at 6am', 'notes on a linked event are kept')

  // Running it again changes nothing but refreshes.
  stub({ '/team/frc302/events/2027/simple': [{ ...EVENTS_2027[0], end_date: '2027-03-07' }] })
  const r2 = await app.call('lead', 'POST', '/api/events/import-tba', { year: 2027 })
  assert.deepEqual([r2.data.created, r2.data.updated], [0, 1])
  assert.equal((await app.call('alex', 'GET', '/api/events?scope=all')).data.events[0].ends_on, '2027-03-07')

  stub({ '/team/frc302/events/2027/simple': 401 })
  assert.equal((await app.call('lead', 'POST', '/api/events/import-tba', { year: 2027 })).data.code, 'tba_bad_key')
  assert.equal((await app.call('lead', 'POST', '/api/events/import-tba', { year: 1800 })).status, 400)
})

test('live: rank, record, next and last match from our side', async () => {
  const app = await makeTeam({ TBA_API_KEY: 'k' })
  stub({ '/team/frc302/events/2027/simple': EVENTS_2027.slice(0, 1) })
  await app.call('lead', 'POST', '/api/events/import-tba', { year: 2027 })
  const event = (await app.call('alex', 'GET', '/api/events?scope=all')).data.events[0]
  const hand = (await app.call('lead', 'POST', '/api/events', { name: 'Outreach day', kind: 'outreach', starts_on: '2027-04-01' })).data.event
  assert.equal((await app.call('alex', 'GET', `/api/events/${hand.id}/live`)).status, 409)

  stub({
    '/team/frc302/event/2027miket/status': {
      qual: { num_teams: 40, ranking: { rank: 3, record: { wins: 5, losses: 1, ties: 0 } } },
      alliance: null, playoff: null, next_match_key: '2027miket_qm40', last_match_key: '2027miket_qm31',
      overall_status_str: '<b>Rank 3</b>',
    },
    '/team/frc302/event/2027miket/matches/simple': [
      { key: '2027miket_qm31', comp_level: 'qm', set_number: 1, match_number: 31, winning_alliance: 'blue', actual_time: 1804000000, time: 1804000000,
        alliances: { red: { team_keys: ['frc1', 'frc2', 'frc3'], score: 40 }, blue: { team_keys: ['frc302', 'frc33', 'frc67'], score: 88 } } },
      { key: '2027miket_qm40', comp_level: 'qm', set_number: 1, match_number: 40, winning_alliance: '', actual_time: null, predicted_time: 1804003600, time: 1804003000,
        alliances: { red: { team_keys: ['frc302', 'frc494', 'frc27'], score: -1 }, blue: { team_keys: ['frc4', 'frc5', 'frc6'], score: -1 } } },
    ],
  })
  const res = await app.call('alex', 'GET', `/api/events/${event.id}/live`)
  assert.equal(res.status, 200)
  const live = res.data.live
  assert.deepEqual([live.rank, live.num_teams, live.qual_record], [3, 40, { wins: 5, losses: 1, ties: 0 }])
  assert.deepEqual(live.last_match, { key: '2027miket_qm31', label: 'Qual 31', alliance: 'blue', partners: ['33', '67'], opponents: ['1', '2', '3'], time: new Date(1804000000000).toISOString(), score: [88, 40], result: 'win' })
  assert.equal(live.next_match.label, 'Qual 40')
  assert.equal(live.next_match.alliance, 'red')
  assert.deepEqual(live.next_match.partners, ['494', '27'])
  assert.equal(live.next_match.time, new Date(1804003600000).toISOString(), 'predicted time wins over the schedule')
  assert.equal(live.next_match.result, null)
  assert.equal([live.matches_played, live.matches_total].join('/'), '1/2')
  assert.ok(!JSON.stringify(live).includes('<b>'), 'TBA HTML strings are not passed through')
})
