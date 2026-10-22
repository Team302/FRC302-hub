// The season at a glance: kickoff, competitions, deadlines and outreach days, with countdowns.
import { useEffect, useState } from 'react'
import { CalendarRange, ExternalLink, MapPin, Pencil, Plus, Trash2, Trophy } from 'lucide-react'
import { del, get, patch, post } from '../lib/api'
import { useSession } from '../context/Session'
import { atLeast } from '../lib/constants'
import useRun from '../lib/useRun'
import EmptyState from '../components/ui/EmptyState'
import FilterChips from '../components/ui/FilterChips'
import Modal from '../components/ui/Modal'
import PageHeader from '../components/ui/PageHeader'
import { SkeletonTable } from '../components/ui/Skeleton'
import Field from '../components/forms/Field'
import { useConfirm } from '../components/list/useConfirm'

export const EVENT_KIND = {
  kickoff: { label: 'Kickoff', cls: 'badge-black' },
  competition: { label: 'Competition', cls: 'badge-danger' },
  deadline: { label: 'Deadline', cls: 'badge-warning' },
  outreach: { label: 'Outreach', cls: 'badge-success' },
  other: { label: 'Other', cls: 'badge-gray' },
}

const at = (iso) => new Date(`${iso}T12:00:00`)
export function daysUntil(iso) {
  const t = new Date(); t.setHours(12, 0, 0, 0)
  return Math.round((at(iso) - t) / 86400000)
}
export function countdown(e) {
  const d = daysUntil(e.starts_on)
  if (d > 1) return `in ${d} days`
  if (d === 1) return 'tomorrow'
  if (d === 0 || daysUntil(e.ends_on) >= 0) return 'happening now'
  return `${-d} days ago`
}
const range = (e) => {
  const opts = { month: 'short', day: 'numeric' }
  const a = at(e.starts_on).toLocaleDateString(undefined, { ...opts, weekday: 'short' })
  return e.ends_on !== e.starts_on ? `${a} – ${at(e.ends_on).toLocaleDateString(undefined, opts)}` : a
}

function EventForm({ event, onClose, onSaved }) {
  const [form, setForm] = useState({ name: event?.name || '', kind: event?.kind || 'competition', starts_on: event?.starts_on || '', ends_on: event?.ends_on || '', location: event?.location || '', url: event?.url || '', notes: event?.notes || '' })
  const run = useRun()
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form, ends_on: form.ends_on || form.starts_on }
    const res = await run(() => (event ? patch(`/events/${event.id}`, body) : post('/events', body)), event ? 'Saved' : 'Event added')
    if (res) onSaved()
  }
  return (
    <Modal open onClose={onClose} title={event ? `Edit ${event.name}` : 'Add an event'} size="md"
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="event-form">{event ? 'Save' : 'Add event'}</button></>}>
      <form id="event-form" onSubmit={submit} className="space-y-4">
        <Field label="Name"><input className="input" required autoFocus maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="FIM District Lake City Event" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Type"><select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{Object.entries(EVENT_KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
          <Field label="Starts"><input type="date" className="input" required value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} /></Field>
          <Field label="Ends"><input type="date" className="input" min={form.starts_on} value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} /></Field>
        </div>
        <Field label="Location"><input className="input" maxLength={160} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
        <Field label="Link" hint="FIRST event page, registration, hotel booking…"><input className="input" type="url" maxLength={500} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" /></Field>
        <Field label="Notes"><textarea className="input" rows={3} maxLength={2000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </form>
    </Modal>
  )
}

export default function Season() {
  const { user } = useSession()
  const [scope, setScope] = useState('upcoming')
  const [events, setEvents] = useState(null)
  const [editing, setEditing] = useState(null)
  const run = useRun()
  const [confirm, confirmDialog] = useConfirm()
  const canManage = atLeast(user, 'lead')
  const load = () => get(`/events${scope === 'all' ? '?scope=all' : ''}`).then((d) => setEvents(d.events))
  useEffect(() => { setEvents(null); load() }, [scope]) // eslint-disable-line react-hooks/exhaustive-deps

  const next = events?.find((e) => daysUntil(e.ends_on) >= 0)
  return (
    <div>
      {confirmDialog}
      <PageHeader title="Season" subtitle="Kickoff, competitions, deadlines and outreach days. They’re in everyone’s calendar feed too."
        actions={canManage && <button type="button" className="btn-primary" onClick={() => setEditing('new')}><Plus className="w-4 h-4" />Add event</button>} />
      {next && (
        <div className="card p-6 mb-6 flex flex-wrap items-center gap-6 overflow-hidden relative">
          <div className="absolute inset-0 pointer-events-none opacity-60" style={{ background: 'radial-gradient(60% 120% at 0% 0%, rgb(var(--accent-500) / 0.18), transparent 60%), radial-gradient(40% 120% at 100% 100%, rgb(var(--flame-500) / 0.14), transparent 60%)' }} />
          <div className="relative">
            <p className="text-xs font-medium uppercase tracking-wider text-brand-gray-500">Next up</p>
            <h2 className="text-display mt-1">{next.name}</h2>
            <p className="text-sm text-brand-gray-600 mt-1">{range(next)}{next.location && ` · ${next.location}`}</p>
          </div>
          <div className="relative ml-auto text-right">
            {daysUntil(next.starts_on) > 0 ? (
              <>
                <p className="text-5xl font-semibold tabular-nums tracking-tight">{daysUntil(next.starts_on)}</p>
                <p className="text-sm text-brand-gray-500">{daysUntil(next.starts_on) === 1 ? 'day to go' : 'days to go'}</p>
              </>
            ) : <p className="text-2xl font-semibold text-accent-600">Happening now</p>}
          </div>
        </div>
      )}
      <FilterChips className="mb-4" aria-label="Show" value={scope} onChange={setScope} options={[{ key: 'upcoming', label: 'Upcoming' }, { key: 'all', label: 'Whole season' }]} />
      {!events ? <div className="card"><SkeletonTable rows={4} cols={3} /></div> : events.length === 0 ? (
        <div className="card"><EmptyState icon={Trophy} title="No events yet" message={canManage ? 'Add kickoff, your district events and key deadlines so everyone can see the countdown.' : 'Leads add kickoff, competitions and deadlines here.'} /></div>
      ) : (
        <ul className="card divide-y divide-brand-gray-100">
          {events.map((e) => {
            const past = daysUntil(e.ends_on) < 0
            return (
              <li key={e.id} className={`flex items-start gap-4 px-5 py-4 ${past ? 'opacity-60' : ''}`}>
                <div className="w-14 text-center shrink-0 rounded-xl bg-brand-gray-100 py-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-brand-gray-500">{at(e.starts_on).toLocaleDateString(undefined, { month: 'short' })}</p>
                  <p className="text-lg font-semibold leading-6 tabular-nums">{at(e.starts_on).getDate()}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{e.name}</p>
                    <span className={EVENT_KIND[e.kind].cls}>{EVENT_KIND[e.kind].label}</span>
                    <span className="text-xs text-brand-gray-500">{countdown(e)}</span>
                  </div>
                  <p className="text-sm text-brand-gray-600 mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5">
                    <span className="flex items-center gap-1"><CalendarRange className="w-3.5 h-3.5 text-brand-gray-400" />{range(e)}</span>
                    {e.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-brand-gray-400" />{e.location}</span>}
                    {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">Details<ExternalLink className="w-3 h-3" /></a>}
                  </p>
                  {e.notes && <p className="text-sm text-brand-gray-600 mt-1 whitespace-pre-wrap">{e.notes}</p>}
                </div>
                {canManage && (
                  <div className="flex shrink-0">
                    <button type="button" className="btn-icon" aria-label={`Edit ${e.name}`} onClick={() => setEditing(e)}><Pencil className="w-4 h-4" /></button>
                    <button type="button" className="btn-icon" aria-label={`Delete ${e.name}`} onClick={async () => { if (await confirm({ title: `Delete ${e.name}?`, confirmLabel: 'Delete', tone: 'danger' }) && (await run(() => del(`/events/${e.id}`), 'Deleted'))) load() }}><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {editing && <EventForm event={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}
