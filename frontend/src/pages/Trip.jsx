// One event's trip roster: who's going, the waitlist, and each person's checklist (permission
// slip, fee, forms). Members see who's going and their own checklist; leads and mentors see
// everyone's and tick items off. Items marked mentor-only are ticked by mentors (see
// worker/src/routes/trips.js).
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarRange, Check, Download, Lock, MapPin, Plus, Settings2, Trash2, UserPlus, X } from 'lucide-react'
import { del, downloadFile, get, patch, post, put } from '../lib/api'
import { useSession } from '../context/Session'
import { useToast } from '../context/ToastContext'
import { atLeast } from '../lib/constants'
import useRun from '../lib/useRun'
import Avatar from '../components/ui/Avatar'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import PageHeader from '../components/ui/PageHeader'
import { SkeletonTable } from '../components/ui/Skeleton'
import Field from '../components/forms/Field'
import { useConfirm } from '../components/list/useConfirm'
import { EVENT_KIND } from './Season'

const at = (iso) => new Date(`${iso}T12:00:00`)
const day = (iso) => at(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

function Settings({ event, onClose, onSaved }) {
  const [form, setForm] = useState({ roster_open: !!event.roster_open, capacity: event.capacity ?? '', signup_closes_on: event.signup_closes_on || '' })
  const run = useRun()
  const submit = async (e) => {
    e.preventDefault()
    const res = await run(() => patch(`/events/${event.id}/roster`, { roster_open: form.roster_open, capacity: form.capacity === '' ? null : Number(form.capacity), signup_closes_on: form.signup_closes_on || null }), 'Saved')
    if (res) onSaved(res)
  }
  return (
    <Modal open onClose={onClose} title="Sign-up settings" size="sm"
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="trip-settings">Save</button></>}>
      <form id="trip-settings" onSubmit={submit} className="space-y-4">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5" checked={form.roster_open} onChange={(e) => setForm({ ...form, roster_open: e.target.checked })} />
          <span><b>Sign-up open</b><span className="block text-brand-gray-500">Students add or remove themselves. Leads and mentors can always change the list.</span></span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Places" hint="Empty for no limit. Past it, people join a waitlist."><input type="number" min={1} max={500} className="input" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field>
          <Field label="Sign-up closes" hint="Last day. Empty: the day before."><input type="date" className="input" max={event.ends_on} value={form.signup_closes_on} onChange={(e) => setForm({ ...form, signup_closes_on: e.target.value })} /></Field>
        </div>
      </form>
    </Modal>
  )
}

function Checklist({ view, isMentor, onChange, confirm }) {
  const [label, setLabel] = useState('')
  const run = useRun()
  const id = view.event.id
  const add = async (e) => {
    e.preventDefault()
    const res = await run(() => post(`/events/${id}/requirements`, { label }))
    if (res) { setLabel(''); onChange(res) }
  }
  return (
    <section className="card p-5">
      <h2 className="text-[15px] font-semibold">Checklist</h2>
      <p className="text-sm text-brand-gray-500 mt-0.5">What everyone going needs done. The hub only records that it’s done; keep the forms themselves with the school.</p>
      <ul className="mt-3 divide-y divide-brand-gray-100">
        {view.requirements.map((r) => (
          <li key={r.id} className="flex items-center gap-2 py-2 text-sm">
            <span className="flex-1 min-w-0">{r.label}</span>
            {r.mentor_only ? <span className="badge-gray inline-flex items-center gap-1"><Lock className="w-3 h-3" />Mentors tick</span> : null}
            {(!r.mentor_only || isMentor) && (
              <button type="button" className="btn-icon" aria-label={`Remove ${r.label}`} onClick={async () => {
                if (await confirm({ title: `Remove “${r.label}”?`, message: 'Its ticks are removed for everyone.', confirmLabel: 'Remove', tone: 'danger' })) { const res = await run(() => del(`/events/${id}/requirements/${r.id}`)); if (res) onChange(res) }
              }}><Trash2 className="w-4 h-4" /></button>
            )}
          </li>
        ))}
        {view.requirements.length === 0 && <li className="py-2 text-sm text-brand-gray-500">Nothing yet.</li>}
      </ul>
      <form onSubmit={add} className="flex gap-2 mt-3">
        <input className="input flex-1" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Room assigned" aria-label="New checklist item" />
        <button className="btn-secondary" disabled={!label.trim()}><Plus className="w-4 h-4" />Add</button>
      </form>
    </section>
  )
}

export default function Trip() {
  const { id } = useParams()
  const { user, users } = useSession()
  const [view, setView] = useState(null)
  const [failed, setFailed] = useState(null)
  const [settings, setSettings] = useState(false)
  const [adding, setAdding] = useState('')
  const [note, setNote] = useState(null)
  const run = useRun()
  const { error } = useToast()
  const [confirm, confirmDialog] = useConfirm()
  const lead = atLeast(user, 'lead')
  const isMentor = atLeast(user, 'admin')

  const load = useCallback(() => get(`/events/${id}/roster`).then(setView).catch((e) => setFailed(e)), [id])
  useEffect(() => { load() }, [load])

  if (failed) return <div className="card"><EmptyState title="Couldn’t load this trip" message={failed.message} /></div>
  if (!view) return <div className="card"><SkeletonTable rows={5} cols={3} /></div>

  const { event, summary, me } = view
  const going = view.people.filter((p) => p.status === 'going')
  const waitlist = view.people.filter((p) => p.status === 'waitlist')
  const full = event.capacity != null && summary.going >= event.capacity
  const waitPos = me?.status === 'waitlist' ? waitlist.findIndex((p) => p.user_id === me.user_id) + 1 : 0
  const notListed = users.filter((u) => !view.people.some((p) => p.user_id === u.id))
  const signupState = !event.roster_open ? 'Sign-up is closed' : view.can_self_serve ? `Sign-up open${event.signup_closes_on ? ` until ${day(event.signup_closes_on)}` : ''}` : 'Sign-up has closed'

  const act = async (fn, ok) => { const res = await run(fn, ok); if (res) setView(res); return res }
  const tick = (p, r) => act(() => put(`/events/${id}/checks`, { requirement_id: r.id, user_id: p.user_id, done: !p.checks[r.id] }))

  return (
    <div className="animate-fade-up">
      {confirmDialog}
      <Link to="/season" className="link inline-flex items-center gap-1 text-sm mb-3"><ArrowLeft className="w-4 h-4" />Season</Link>
      <PageHeader title={event.name}
        subtitle={<span className="flex flex-wrap gap-x-4 gap-y-0.5">
          <span className="inline-flex items-center gap-1"><CalendarRange className="w-3.5 h-3.5" />{day(event.starts_on)}{event.ends_on !== event.starts_on && ` – ${day(event.ends_on)}`}</span>
          {event.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{event.location}</span>}
          <span className={EVENT_KIND[event.kind]?.cls}>{EVENT_KIND[event.kind]?.label}</span>
        </span>}
        actions={lead && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => downloadFile(`/api/events/${id}/roster.csv`, 'roster.csv').catch((e) => error('Couldn’t export', e.message))}><Download className="w-4 h-4" />Export CSV</button>
            <button type="button" className="btn-primary" onClick={() => setSettings(true)}><Settings2 className="w-4 h-4" />Sign-up settings</button>
          </div>
        )} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="card p-4"><p className="text-xs text-brand-gray-500">Students going</p><p className="text-2xl font-semibold tabular-nums">{summary.going}{event.capacity != null && <span className="text-base text-brand-gray-400"> / {event.capacity}</span>}</p>{summary.mentors > 0 && <p className="text-xs text-brand-gray-500">+ {summary.mentors} mentor{summary.mentors === 1 ? '' : 's'}</p>}</div>
        <div className="card p-4"><p className="text-xs text-brand-gray-500">Waitlist</p><p className="text-2xl font-semibold tabular-nums">{summary.waitlist}</p></div>
        {lead && <div className="card p-4"><p className="text-xs text-brand-gray-500">All done</p><p className="text-2xl font-semibold tabular-nums">{summary.cleared}<span className="text-base text-brand-gray-400"> / {summary.going}</span></p></div>}
        <div className={`card p-4 ${lead ? '' : 'col-span-2'}`}><p className="text-xs text-brand-gray-500">Sign-up</p><p className="text-sm font-medium mt-1.5">{signupState}</p></div>
      </div>

      <section className="card p-5 mb-5">
        {me ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-semibold flex-1 min-w-[200px]">{me.status === 'going' ? (me.mentor ? 'You’re going as a chaperone' : 'You’re going') : `You’re #${waitPos} on the waitlist`}</p>
              {view.can_self_serve && (
                <button type="button" className="btn-ghost" onClick={async () => { if (await confirm({ title: 'Drop out?', message: me.status === 'going' ? 'Your place goes to the first person on the waitlist, and your checklist is cleared.' : 'You’ll leave the waitlist.', confirmLabel: 'Drop out', tone: 'danger' })) act(() => del(`/events/${id}/roster/${user.id}`), 'You’re off the list') }}>Drop out</button>
              )}
            </div>
            {me.status === 'going' && !me.mentor && view.requirements.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {view.requirements.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-sm">
                    <span className={`w-5 h-5 rounded-full grid place-items-center shrink-0 ${me.checks[r.id] ? 'bg-accent-600 text-white' : 'border border-brand-gray-300'}`}>{me.checks[r.id] && <Check className="w-3 h-3" strokeWidth={3} />}</span>
                    <span className={me.checks[r.id] ? '' : 'text-brand-gray-600'}>{r.label}</span>
                    {!me.checks[r.id] && <span className="text-xs text-brand-gray-500">{r.mentor_only ? 'a mentor ticks this when it’s in' : 'not done yet'}</span>}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              {note === null ? (
                <button type="button" className="text-sm link" onClick={() => setNote(me.note || '')}>{me.note ? `Note: ${me.note}` : 'Add a note (e.g. leaving early)'}</button>
              ) : (
                <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await act(() => patch(`/events/${id}/roster/${user.id}`, { note }), 'Saved')) setNote(null) }}>
                  <input className="input flex-1" autoFocus maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Leaving Saturday at noon" aria-label="Note" />
                  <button className="btn-primary">Save</button>
                  <button type="button" className="btn-ghost" onClick={() => setNote(null)}>Cancel</button>
                </form>
              )}
              <p className="text-xs text-brand-gray-500 mt-1">Leads and mentors can see it. Don’t put medical details here; those go on the school’s form.</p>
            </div>
          </>
        ) : isMentor ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 min-w-[200px] text-sm text-brand-gray-600">Chaperoning? Add yourself. Mentors don’t take a student place.</p>
            <button type="button" className="btn-secondary" onClick={() => act(() => post(`/events/${id}/roster`, {}), 'You’re on the list')}>Add me</button>
          </div>
        ) : view.can_self_serve || lead ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 min-w-[200px] text-sm text-brand-gray-600">{full ? 'All places are taken. Join the waitlist and you’ll be told if one opens up.' : 'Coming? Sign up so the mentors can plan rides, rooms and forms.'}</p>
            <button type="button" className="btn-primary" onClick={() => act(() => post(`/events/${id}/roster`, {}), full ? 'You’re on the waitlist' : 'You’re signed up')}>{full ? 'Join the waitlist' : 'I’m going'}</button>
          </div>
        ) : (
          <p className="text-sm text-brand-gray-600">{event.roster_open ? 'Sign-up has closed. Ask a lead or mentor if you need to be added.' : 'Sign-up for this event isn’t open.'}</p>
        )}
      </section>

      <div className={lead ? 'grid lg:grid-cols-[1fr_320px] gap-5 items-start' : ''}>
        <section className="card">
          <div className="flex flex-wrap items-center gap-3 px-5 pt-5 pb-3">
            <h2 className="text-[15px] font-semibold flex-1">Who’s going</h2>
            {lead && notListed.length > 0 && (
              <form className="flex gap-2 w-full sm:w-auto" onSubmit={async (e) => { e.preventDefault(); if (adding && (await act(() => post(`/events/${id}/roster`, { user_id: adding }), 'Added'))) setAdding('') }}>
                <select className="input flex-1 sm:w-48" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Add someone">
                  <option value="">Add someone…</option>
                  {notListed.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <button className="btn-secondary" disabled={!adding}><UserPlus className="w-4 h-4" />Add</button>
              </form>
            )}
          </div>
          {view.people.length === 0 ? <EmptyState title="Nobody yet" message={event.roster_open ? 'People who sign up show up here.' : lead ? 'Open sign-up in Sign-up settings, or add people yourself.' : undefined} /> : (
            <ul className="divide-y divide-brand-gray-100 border-t border-brand-gray-100">
              {[...going, ...waitlist].map((p, i) => (
                <li key={p.user_id} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={p.name} seed={p.user_id} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{p.name}{p.user_id === user.id && <span className="text-brand-gray-500 font-normal"> (you)</span>}</p>
                      <p className="text-xs text-brand-gray-500 truncate">{[p.mentor ? 'Mentor' : p.subteam_name, p.status === 'waitlist' && `Waitlist #${i - going.length + 1}`, lead && p.note].filter(Boolean).join(' · ')}</p>
                    </div>
                    {lead && p.status === 'going' && !p.mentor && view.requirements.length > 0 && <span className={`text-xs font-medium tabular-nums ${p.cleared ? 'text-accent-600' : 'text-brand-gray-500'}`}>{p.done}/{view.requirements.length}</span>}
                    {lead && (
                      <div className="flex shrink-0">
                        {p.status === 'waitlist' && <button type="button" className="btn-ghost text-xs" onClick={() => act(() => patch(`/events/${id}/roster/${p.user_id}`, { status: 'going' }), `${p.name} is going`)}>Move up</button>}
                        <button type="button" className="btn-icon" aria-label={`Take ${p.name} off the list`} onClick={async () => { if (await confirm({ title: `Take ${p.name} off the list?`, message: 'Their checklist is cleared and they’re told.', confirmLabel: 'Take off', tone: 'danger' })) act(() => del(`/events/${id}/roster/${p.user_id}`), 'Removed') }}><X className="w-4 h-4" /></button>
                      </div>
                    )}
                  </div>
                  {lead && p.status === 'going' && !p.mentor && view.requirements.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 pl-11">
                      {view.requirements.map((r) => {
                        const done = !!p.checks[r.id]
                        const locked = r.mentor_only && !isMentor
                        return (
                          <button key={r.id} type="button" disabled={locked} onClick={() => tick(p, r)} aria-pressed={done}
                            title={locked ? 'Only mentors tick this' : done ? `Ticked by ${p.checks[r.id].by || 'someone'}` : 'Tick when it’s done'}
                            className={`h-7 px-2.5 rounded-full text-xs font-medium border inline-flex items-center gap-1 ${done ? 'bg-accent-600 border-accent-600 text-white' : 'border-brand-gray-200 text-brand-gray-600'} ${locked ? 'cursor-not-allowed opacity-70' : 'hover:border-accent-500/60'}`}>
                            {done ? <Check className="w-3 h-3" strokeWidth={3} /> : locked ? <Lock className="w-3 h-3" /> : null}{r.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        {lead && <Checklist view={view} isMentor={isMentor} onChange={setView} confirm={confirm} />}
      </div>
      {settings && <Settings event={event} onClose={() => setSettings(false)} onSaved={(res) => { setSettings(false); setView(res) }} />}
    </div>
  )
}
