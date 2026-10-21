import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarClock, ListChecks, Plus, Users } from 'lucide-react'
import { get, post } from '../lib/api'
import { useSession } from '../context/Session'
import { atLeast, MEETING_KIND, MEETING_KINDS } from '../lib/constants'
import { fmtDay, fmtTime, fromLocalInput, toLocalInput } from '../lib/format'
import { EmptyState, Field, Modal, PageHeader, Spinner, useAction } from '../components/ui'

function nextMeetingTime() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(18, 0, 0, 0)
  return d.toISOString()
}

export default function Meetings() {
  const { user, users, subteams } = useSession()
  const [scope, setScope] = useState('upcoming')
  const [meetings, setMeetings] = useState(null)
  const [past, setPast] = useState([])
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', kind: 'general', starts_at: toLocalInput(nextMeetingTime()), duration_min: 60, location: '', facilitator_id: user.id, subteam_id: '', copy_agenda_from: '' })
  const run = useAction()
  const navigate = useNavigate()

  useEffect(() => { setMeetings(null); get(`/meetings?scope=${scope}`).then((d) => setMeetings(d.meetings)) }, [scope])
  useEffect(() => { if (creating) get('/meetings?scope=past').then((d) => setPast(d.meetings)) }, [creating])

  const create = async (e) => {
    e.preventDefault()
    const res = await run(() => post('/meetings', {
      ...form, starts_at: fromLocalInput(form.starts_at), duration_min: Number(form.duration_min),
      subteam_id: form.subteam_id || null, copy_agenda_from: form.copy_agenda_from || undefined,
    }))
    if (res) navigate(`/meetings/${res.meeting.id}`)
  }

  return (
    <div className="animate-fade-up">
      <PageHeader title="Meetings" subtitle="Agenda with timeboxes, attendance, decisions, and action items that land on a board."
        actions={atLeast(user, 'lead') && <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="w-4 h-4" />Schedule meeting</button>} />
      <div className="inline-flex rounded-control border border-brand-gray-200 p-0.5 glass mb-5">
        {['upcoming', 'past'].map((s) => (
          <button key={s} onClick={() => setScope(s)} aria-pressed={scope === s} className={`px-3 py-1 text-sm rounded-lg capitalize ${scope === s ? 'bg-brand-black text-white' : 'text-brand-gray-600'}`}>{s}</button>
        ))}
      </div>
      {!meetings ? <Spinner /> : meetings.length === 0 ? (
        <div className="card"><EmptyState icon={CalendarClock} title={scope === 'past' ? 'No past meetings' : 'Nothing scheduled'} body={atLeast(user, 'lead') ? 'Schedule one and build the agenda ahead of time — meetings run shorter when everyone knows the plan.' : undefined} /></div>
      ) : (
        <div className="card divide-y divide-brand-gray-100">
          {meetings.map((m) => {
            const d = new Date(m.starts_at)
            const over = m.agenda_minutes > m.duration_min
            return (
              <Link key={m.id} to={`/meetings/${m.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-brand-gray-50">
                <div className="w-14 text-center shrink-0 rounded-xl bg-brand-gray-100 py-1.5">
                  <p className="text-[10px] uppercase text-brand-gray-500 leading-3">{fmtDay(d).split(',')[0]}</p>
                  <p className="text-lg font-semibold leading-6">{d.getDate()}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{m.title}</p>
                    {m.status === 'live' && <span className="badge-success">Live</span>}
                    <span className="badge-gray">{MEETING_KIND[m.kind]?.label}</span>
                  </div>
                  <p className="text-sm text-brand-gray-500 truncate">{fmtTime(d)} · {m.duration_min} min{m.location ? ` · ${m.location}` : ''}{m.facilitator_name ? ` · run by ${m.facilitator_name}` : ''}</p>
                </div>
                <div className="hidden sm:flex items-center gap-4 text-xs text-brand-gray-500">
                  <span className={`flex items-center gap-1 ${over ? 'text-amber-700' : ''}`} title={over ? 'Agenda is longer than the meeting' : undefined}><ListChecks className="w-4 h-4" />{m.agenda_count} · {m.agenda_minutes}m</span>
                  {scope === 'past' && <span className="flex items-center gap-1"><Users className="w-4 h-4" />{m.present_count}</span>}
                  {scope === 'past' && <span>{m.action_count} actions</span>}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Schedule a meeting"
        footer={<><button className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn-primary" form="new-meeting">Create</button></>}>
        <form id="new-meeting" className="space-y-4" onSubmit={create}>
          <Field label="Title"><input className="input" required autoFocus maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Tuesday all-hands" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {MEETING_KINDS.filter((k) => !k.minRole || atLeast(user, k.minRole)).map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </Field>
            <Field label="Subteam">
              <select className="input" value={form.subteam_id} onChange={(e) => setForm({ ...form, subteam_id: e.target.value })}>
                <option value="">—</option>
                {subteams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Starts"><input type="datetime-local" className="input" required value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></Field>
            <Field label="Length (min)"><input type="number" min={5} max={600} className="input" value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: e.target.value })} /></Field>
          </div>
          <Field label="Location"><input className="input" maxLength={120} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Shop / Room 302 / Discord" /></Field>
          <Field label="Facilitator" hint="Runs the agenda and takes attendance. Can be a student.">
            <select className="input" value={form.facilitator_id} onChange={(e) => setForm({ ...form, facilitator_id: e.target.value })}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          {past.length > 0 && (
            <Field label="Copy agenda from">
              <select className="input" value={form.copy_agenda_from} onChange={(e) => setForm({ ...form, copy_agenda_from: e.target.value })}>
                <option value="">Start blank</option>
                {past.map((m) => <option key={m.id} value={m.id}>{m.title} — {fmtDay(new Date(m.starts_at))}</option>)}
              </select>
            </Field>
          )}
        </form>
      </Modal>
    </div>
  )
}
