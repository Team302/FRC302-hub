// The Blue Alliance (thebluealliance.com, API v3): the team's events for a season, and rank /
// record / next match while a competition is on. Needs a free read key from
// thebluealliance.com/account, set as the TBA_API_KEY secret. Answers are cached at the edge for
// a minute, so a whole team refreshing Home in the stands costs TBA one request a minute.
import { HttpError } from './http.js'

const BASE = 'https://www.thebluealliance.com/api/v3'

export const tbaConfigured = (env) => !!env.TBA_API_KEY
export const teamNumber = (env) => (/^\d{1,5}$/.test(env.TEAM_NUMBER || '') ? env.TEAM_NUMBER : '302')
export const EVENT_KEY = /^\d{4}[a-z0-9]{1,16}$/

export async function tba(env, path) {
  if (!tbaConfigured(env)) throw new HttpError(503, 'The Blue Alliance isn’t connected. A mentor sets the TBA_API_KEY secret (see the README).', 'tba_not_configured')
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'X-TBA-Auth-Key': env.TBA_API_KEY, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cf: { cacheTtlByStatus: { '200-299': 60, 404: 60, '500-599': 0 } },
    })
  } catch {
    throw new HttpError(502, 'Couldn’t reach The Blue Alliance. Try again in a minute.', 'tba_unreachable')
  }
  if (res.status === 404) return null
  if (res.status === 401) throw new HttpError(502, 'The Blue Alliance refused the TBA_API_KEY. Check the key.', 'tba_bad_key')
  if (!res.ok) throw new HttpError(502, `The Blue Alliance answered ${res.status}.`, 'tba_error')
  return res.json()
}

const clip = (s, n) => String(s ?? '').slice(0, n)

// One TBA event (the /simple shape) as our columns.
export function eventFromTba(e) {
  return {
    tba_key: e.key,
    name: clip(e.name, 120),
    kind: e.event_type === 100 ? 'other' : 'competition',
    starts_on: e.start_date,
    ends_on: /^\d{4}-\d{2}-\d{2}$/.test(e.end_date || '') && e.end_date >= e.start_date ? e.end_date : e.start_date,
    location: clip([e.city, e.state_prov].filter(Boolean).join(', '), 160),
    url: `https://www.thebluealliance.com/event/${e.key}`,
  }
}

export function matchLabel(m) {
  if (m.comp_level === 'qm') return `Qual ${m.match_number}`
  if (m.comp_level === 'f') return `Final ${m.match_number}`
  // Double-elimination playoffs (2023 on) number each match by its set.
  if (m.comp_level === 'sf' && Number(m.key.slice(0, 4)) >= 2023) return `Playoff ${m.set_number}`
  return `${m.comp_level.toUpperCase()} ${m.set_number}-${m.match_number}`
}

// A match from our team's side: which alliance we're on, partners, opponents, result.
export function matchFor(m, team) {
  if (!m) return null
  const me = `frc${team}`
  const side = m.alliances.red.team_keys.includes(me) ? 'red' : 'blue'
  const other = side === 'red' ? 'blue' : 'red'
  const num = (k) => k.replace(/^frc/, '')
  const at = m.actual_time || m.predicted_time || m.time
  const played = m.alliances[side].score >= 0 && !!m.actual_time
  return {
    key: m.key,
    label: matchLabel(m),
    alliance: side,
    partners: m.alliances[side].team_keys.filter((k) => k !== me).map(num),
    opponents: m.alliances[other].team_keys.map(num),
    time: at ? new Date(at * 1000).toISOString() : null,
    score: played ? [m.alliances[side].score, m.alliances[other].score] : null,
    result: played ? (m.winning_alliance === side ? 'win' : m.winning_alliance === other ? 'loss' : 'tie') : null,
  }
}

// Live status at one event: rank, record, alliance, playoff state, the last and next match.
export async function liveStatus(env, eventKey) {
  if (!EVENT_KEY.test(eventKey)) throw new HttpError(400, 'That isn’t a Blue Alliance event key.', 'bad_event_key')
  const team = teamNumber(env)
  const [status, matches] = await Promise.all([
    tba(env, `/team/frc${team}/event/${eventKey}/status`),
    tba(env, `/team/frc${team}/event/${eventKey}/matches/simple`),
  ])
  const byKey = Object.fromEntries((matches || []).map((m) => [m.key, m]))
  const r = status?.qual?.ranking
  const rec = (x) => (x ? { wins: x.wins, losses: x.losses, ties: x.ties } : null)
  return {
    team,
    event_key: eventKey,
    rank: r?.rank ?? null,
    num_teams: status?.qual?.num_teams ?? null,
    qual_record: rec(r?.record),
    alliance: status?.alliance ? { number: status.alliance.number, pick: status.alliance.pick, name: clip(status.alliance.name, 40) } : null,
    playoff: status?.playoff ? { level: status.playoff.level, status: status.playoff.status, record: rec(status.playoff.record) } : null,
    next_match: matchFor(byKey[status?.next_match_key], team),
    last_match: matchFor(byKey[status?.last_match_key], team),
    matches_played: (matches || []).filter((m) => m.actual_time).length,
    matches_total: (matches || []).length,
  }
}
