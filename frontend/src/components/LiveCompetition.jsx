// Rank, record and next match from The Blue Alliance while the team is at a competition. Refreshes
// every minute while the tab is visible (the server caches TBA for a minute, so faster is wasted).
import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { get } from '../lib/api'
import { fmtTime } from '../lib/format'

const REFRESH_MS = 60000

const record = (r) => (r ? `${r.wins}-${r.losses}-${r.ties}` : '—')
const ALLIANCE = { red: 'bg-[#d83a52] text-white', blue: 'bg-[#2f6fdb] text-white' }

function minutesUntil(iso) {
  const m = Math.round((new Date(iso) - Date.now()) / 60000)
  if (m > 90) return null
  if (m > 1) return `in ${m} min`
  if (m >= -2) return 'now'
  return null
}

function Match({ title, m }) {
  if (!m) return null
  const soon = m.time && !m.result ? minutesUntil(m.time) : null
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wider text-brand-gray-500">{title}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${ALLIANCE[m.alliance]}`}>{m.alliance === 'red' ? 'Red' : 'Blue'}</span>
        <span className="font-semibold">{m.label}</span>
        {m.result && <span className={m.result === 'win' ? 'badge-success' : m.result === 'loss' ? 'badge-danger' : 'badge-gray'}>{m.result === 'win' ? 'Won' : m.result === 'loss' ? 'Lost' : 'Tie'} {m.score.join('–')}</span>}
        {!m.result && m.time && <span className="text-sm text-brand-gray-600">{fmtTime(new Date(m.time))}{soon && <span className="text-flame-600 font-medium"> · {soon}</span>}</span>}
      </div>
      <p className="text-xs text-brand-gray-500 mt-1 truncate">with {m.partners.join(', ') || '—'} · vs {m.opponents.join(', ')}</p>
    </div>
  )
}

export default function LiveCompetition({ event }) {
  const [live, setLive] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    const load = () => get(`/events/${event.id}/live`).then((d) => { if (alive) { setLive(d.live); setError('') } }).catch((e) => alive && setError(e.message))
    load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, REFRESH_MS)
    return () => { alive = false; clearInterval(t) }
  }, [event.id])

  if (error && !live) return <p className="text-sm text-brand-gray-500">Live results unavailable: {error}</p>
  if (!live) return <p className="text-sm text-brand-gray-500">Loading live results…</p>
  const stats = [
    ['Rank', live.rank ? <>{live.rank}<span className="text-sm font-normal text-brand-gray-500"> / {live.num_teams}</span></> : '—'],
    ['Quals', record(live.qual_record)],
    live.alliance ? ['Alliance', <>{live.alliance.number}<span className="text-sm font-normal text-brand-gray-500"> · {live.alliance.pick === 0 ? 'captain' : `pick ${live.alliance.pick}`}</span></>] : null,
    live.playoff ? ['Playoffs', live.playoff.status === 'won' ? 'Won' : live.playoff.status === 'eliminated' ? 'Out' : record(live.playoff.record)] : null,
  ].filter(Boolean)
  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
      <dl className="flex gap-6">
        {stats.map(([k, val]) => (
          <div key={k}><dt className="text-xs font-medium uppercase tracking-wider text-brand-gray-500">{k}</dt><dd className="text-2xl font-semibold tabular-nums mt-0.5">{val}</dd></div>
        ))}
      </dl>
      <Match title="Next match" m={live.next_match} />
      <Match title="Last match" m={live.last_match} />
      {!live.next_match && !live.last_match && <p className="text-sm text-brand-gray-500 self-center">The match schedule isn’t out yet.</p>}
      <a href={`https://www.thebluealliance.com/event/${live.event_key}`} target="_blank" rel="noopener noreferrer" className="link text-sm inline-flex items-center gap-1 self-center ml-auto">
        The Blue Alliance<ExternalLink className="w-3 h-3" />
      </a>
    </div>
  )
}
