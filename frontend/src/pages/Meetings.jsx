import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, MonitorSmartphone, Plus } from 'lucide-react'
import { get } from '../lib/api'
import { useSession } from '../context/Session'
import { atLeast, MEETING_KIND } from '../lib/constants'
import { fmtTime } from '../lib/format'
import PageHeader from '../components/ui/PageHeader'
import EmptyState from '../components/ui/EmptyState'
import FilterChips from '../components/ui/FilterChips'
import { SkeletonTable } from '../components/ui/Skeleton'
import KioskSetup from '../components/KioskSetup'

export default function Meetings() {
  const { user, openNew } = useSession()
  const [scope, setScope] = useState('upcoming')
  const [meetings, setMeetings] = useState(null)
  const [kioskOpen, setKioskOpen] = useState(false)
  useEffect(() => { setMeetings(null); get(`/meetings?scope=${scope}`).then((d) => setMeetings(d.meetings)) }, [scope])

  return (
    <div>
      <PageHeader title="Meetings" subtitle="Agendas with timeboxes, attendance, decisions and action items."
        actions={atLeast(user, 'lead') && (
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => setKioskOpen(true)}><MonitorSmartphone className="w-4 h-4" />Shop kiosk</button>
            <button type="button" className="btn-primary" onClick={() => openNew('meeting')}><Plus className="w-4 h-4" />Schedule meeting</button>
          </div>
        )} />
      {kioskOpen && <KioskSetup onClose={() => setKioskOpen(false)} />}
      <FilterChips className="mb-4" aria-label="Show" value={scope} onChange={setScope} options={[{ key: 'upcoming', label: 'Upcoming' }, { key: 'past', label: 'Past' }]} />
      {!meetings ? <div className="card"><SkeletonTable rows={5} cols={4} /></div> : meetings.length === 0 ? (
        <div className="card"><EmptyState icon={CalendarDays} title={scope === 'past' ? 'No past meetings' : 'Nothing scheduled'} message={scope === 'upcoming' && atLeast(user, 'lead') ? 'Schedule one and build the agenda before it starts.' : undefined} /></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[760px]">
            <thead>
              <tr><th>Date</th><th>Meeting</th><th>Type</th><th>Facilitator</th><th className="text-right">Agenda</th>{scope === 'past' && <><th className="text-right">Attended</th><th className="text-right">Actions</th></>}</tr>
            </thead>
            <tbody>
              {meetings.map((m) => {
                const d = new Date(m.starts_at)
                const over = m.agenda_minutes > m.duration_min
                return (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap tabular-nums">
                      <span className="font-medium text-brand-black">{d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                      <span className="block text-xs text-brand-gray-500">{fmtTime(d)} · {m.duration_min} min</span>
                    </td>
                    <td>
                      <Link to={`/meetings/${m.id}`} className="font-medium text-brand-black hover:text-accent-700">{m.title}</Link>
                      {m.status === 'live' && <span className="badge-success ml-2">In progress</span>}
                      {m.location && <span className="block text-xs text-brand-gray-500">{m.location}</span>}
                    </td>
                    <td><span className="badge-gray">{MEETING_KIND[m.kind]?.label}</span></td>
                    <td className="text-brand-gray-600">{m.facilitator_name || '—'}</td>
                    <td className={`text-right tabular-nums whitespace-nowrap ${over ? 'text-amber-700' : 'text-brand-gray-600'}`} title={over ? 'Agenda is longer than the meeting' : undefined}>
                      {m.agenda_count ? `${m.agenda_count} · ${m.agenda_minutes} min` : '—'}
                    </td>
                    {scope === 'past' && <><td className="text-right tabular-nums">{m.present_count}</td><td className="text-right tabular-nums">{m.action_count}</td></>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
