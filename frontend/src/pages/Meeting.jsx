import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, CalendarDays, Check, ClipboardCopy, Flag, MapPin, Play, Plus, Printer, SkipForward, Square, Timer, Trash2, User, UserCheck } from 'lucide-react'
import { del, get, patch, post, put } from '../lib/api'
import { useSession } from '../context/Session'
import { useToast } from '../context/ToastContext'
import { atLeast, MEETING_KIND } from '../lib/constants'
import { fmtFull, fmtTime, mmss, parseServerTime } from '../lib/format'
import Avatar from '../components/ui/Avatar'
import EmptyState from '../components/ui/EmptyState'
import SegmentedControl from '../components/ui/SegmentedControl'
import { SkeletonTable } from '../components/ui/Skeleton'
import { useConfirm } from '../components/list/useConfirm'
import { PeopleCell, StatusPill } from '../components/board/cells'

const ATTEND = [
  { id: 'present', label: 'Present', fill: '#037f4c', ink: '#ffffff' },
  { id: 'late', label: 'Late', fill: '#fdab3d', ink: '#1f1f1f' },
  { id: 'excused', label: 'Excused', fill: '#0b6bcb', ink: '#ffffff' },
  { id: 'absent', label: 'Absent', fill: '#d83a52', ink: '#ffffff' },
]
const ATTEND_NEXT = { undefined: 'present', null: 'present', present: 'late', late: 'excused', excused: 'absent', absent: null }

function useNow(active) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return undefined
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

function AutoSaveText({ value, onSave, placeholder, rows = 4, disabled, label }) {
  const [draft, setDraft] = useState(value || '')
  useEffect(() => setDraft(value || ''), [value])
  return <textarea className="input" rows={rows} value={draft} disabled={disabled} placeholder={placeholder} aria-label={label} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== (value || '') && onSave(draft)} />
}

function Section({ title, aside, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-brand-gray-200">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  )
}

// ── Plan ──
function Plan({ data, setData, users, run }) {
  const { meeting, agenda, can_run: canRun } = data
  const [form, setForm] = useState({ title: '', minutes: 5, owner_id: null })
  const total = agenda.reduce((s, a) => s + a.minutes, 0)
  const setAgenda = (res) => res && setData((d) => ({ ...d, agenda: res.agenda }))
  const add = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    const res = await run(() => post(`/meetings/${meeting.id}/agenda`, { ...form, minutes: Number(form.minutes) }))
    if (res) { setAgenda(res); setForm({ title: '', minutes: 5, owner_id: null }) }
  }
  const move = async (i, dir) => {
    const ids = agenda.map((a) => a.id)
    ;[ids[i], ids[i + dir]] = [ids[i + dir], ids[i]]
    setAgenda(await run(() => post(`/meetings/${meeting.id}/agenda/order`, { ids })))
  }
  const over = total > meeting.duration_min

  return (
    <Section title="Agenda" aside={<span className={`text-sm tabular-nums ${over ? 'text-amber-700 font-medium' : 'text-brand-gray-500'}`}>{total} of {meeting.duration_min} min{over ? ' · over time' : ''}</span>}>
      {agenda.length === 0 && <p className="px-5 py-6 text-sm text-brand-gray-500">No topics yet. Give each topic an owner and a time limit.</p>}
      {agenda.length > 0 && (
        <table className="table table-fixed">
          <colgroup><col className="w-10" /><col /><col className="w-36" /><col className="w-24" />{canRun && <col className="w-28" />}</colgroup>
          <thead><tr><th>#</th><th>Topic</th><th className="text-center">Owner</th><th className="text-right">Minutes</th>{canRun && <th />}</tr></thead>
          <tbody>
            {agenda.map((a, i) => (
              <tr key={a.id}>
                <td className="text-brand-gray-400 tabular-nums">{i + 1}</td>
                <td><input className="w-full bg-transparent outline-none font-medium rounded focus:ring-2 focus:ring-accent-500/30 px-1 -mx-1" defaultValue={a.title} disabled={!canRun} aria-label="Topic"
                  onBlur={async (e) => e.target.value.trim() && e.target.value !== a.title && setAgenda(await run(() => patch(`/agenda/${a.id}`, { title: e.target.value.trim() })))} /></td>
                <td className="p-0"><PeopleCell value={a.owner_id} users={users} readOnly={!canRun} onChange={async (owner_id) => setAgenda(await run(() => patch(`/agenda/${a.id}`, { owner_id })))} /></td>
                <td className="text-right"><input type="number" min={1} max={240} className="input w-16 py-1 text-right inline-block" defaultValue={a.minutes} disabled={!canRun} aria-label="Minutes"
                  onBlur={async (e) => Number(e.target.value) !== a.minutes && setAgenda(await run(() => patch(`/agenda/${a.id}`, { minutes: Number(e.target.value) })))} /></td>
                {canRun && (
                  <td className="text-right whitespace-nowrap">
                    <button className="btn-icon w-7 h-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button className="btn-icon w-7 h-7" disabled={i === agenda.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="w-3.5 h-3.5" /></button>
                    <button className="btn-icon w-7 h-7" onClick={async () => setAgenda(await run(() => del(`/agenda/${a.id}`)))} aria-label="Remove topic"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canRun && (
        <form onSubmit={add} className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-brand-gray-200">
          <input className="input flex-1 min-w-[12rem]" placeholder="Add a topic" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="New topic" />
          <div className="w-36 border border-brand-gray-200 rounded-control overflow-hidden"><PeopleCell value={form.owner_id} users={users} onChange={(owner_id) => setForm({ ...form, owner_id })} /></div>
          <input type="number" min={1} max={240} className="input w-20" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} aria-label="Minutes" />
          <button className="btn-primary"><Plus className="w-4 h-4" />Add</button>
        </form>
      )}
    </Section>
  )
}

// ── Run ──
function ActionForm({ meetingId, users, run, onAdded }) {
  const [boards, setBoards] = useState([])
  const [groups, setGroups] = useState([])
  const [form, setForm] = useState({ title: '', assignee_id: null, due_date: '', board_id: '', group_id: '' })
  useEffect(() => { get('/boards').then((d) => { setBoards(d.boards); if (d.boards[0]) setForm((f) => ({ ...f, board_id: d.boards[0].id })) }) }, [])
  useEffect(() => {
    if (!form.board_id) return
    get(`/boards/${form.board_id}`).then((d) => { setGroups(d.groups); setForm((f) => ({ ...f, group_id: d.groups[0]?.id || '' })) })
  }, [form.board_id])
  const submit = async (e) => {
    e.preventDefault()
    const res = await run(() => post(`/meetings/${meetingId}/actions`, { ...form, due_date: form.due_date || null }), 'Added to the board')
    if (res) { onAdded(); setForm((f) => ({ ...f, title: '', assignee_id: null, due_date: '' })) }
  }
  if (!boards.length) return <p className="text-sm text-brand-gray-500">Action items are created as tasks on a board. Create a board first.</p>
  return (
    <form onSubmit={submit} className="space-y-2">
      <input className="input" required placeholder="What needs doing" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Action item" />
      <div className="flex items-center gap-2">
        <div className="flex-1 border border-brand-gray-200 rounded-control overflow-hidden"><PeopleCell value={form.assignee_id} users={users} onChange={(assignee_id) => setForm({ ...form, assignee_id })} /></div>
        <input type="date" className="input w-40" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} aria-label="Due date" />
      </div>
      <div className="flex items-center gap-2">
        <select className="input" value={form.board_id} onChange={(e) => setForm({ ...form, board_id: e.target.value })} aria-label="Board">{boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select className="input" value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })} aria-label="Group">{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
      </div>
      <button className="btn-primary w-full" disabled={!form.title.trim() || !form.group_id}><Plus className="w-4 h-4" />Add action item</button>
    </form>
  )
}

function Run({ data, setData, users, run, reload }) {
  const { user } = useSession()
  const [confirm, confirmDialog] = useConfirm()
  const { meeting, agenda, attendance, actions, can_run: canRun } = data
  const live = meeting.status === 'live'
  const now = useNow(live)
  const active = agenda.find((a) => a.status === 'active')
  const elapsed = active ? (now - parseServerTime(active.started_at).getTime()) / 1000 : 0
  const remaining = active ? active.minutes * 60 - elapsed : 0
  const meetingElapsed = meeting.started_at ? (now - parseServerTime(meeting.started_at).getTime()) / 1000 : 0
  const me = attendance.find((a) => a.id === user.id)
  const counts = useMemo(() => Object.fromEntries(ATTEND.map((s) => [s.id, attendance.filter((a) => a.status === s.id).length])), [attendance])

  const act = async (path, body) => { if (await run(() => post(`/meetings/${meeting.id}/${path}`, body))) await reload() }
  const mark = async (person) => {
    const status = ATTEND_NEXT[person.status]
    setData((d) => ({ ...d, attendance: d.attendance.map((a) => (a.id === person.id ? { ...a, status } : a)) }))
    await run(() => put(`/meetings/${meeting.id}/attendance/${person.id}`, { status }))
  }
  const markRestPresent = async () => {
    for (const p of attendance.filter((a) => !a.status)) await run(() => put(`/meetings/${meeting.id}/attendance/${p.id}`, { status: 'present' }))
    reload()
  }
  const endMeeting = async () => { if (await confirm({ title: 'End the meeting?', message: 'The current topic is marked done and the recap is ready to share.', confirmLabel: 'End meeting' })) act('end') }

  if (meeting.status === 'scheduled') {
    return (
      <div className="card">
        <EmptyState icon={Play} title="Not started" message={canRun ? `Scheduled for ${fmtTime(new Date(meeting.starts_at))}. Starting it begins the first topic’s timer and opens check-in.` : 'Check-in opens when the facilitator starts the meeting.'}
          action={canRun && <button className="btn-primary" onClick={() => act('start')} disabled={!agenda.length}><Play className="w-4 h-4" />{agenda.length ? 'Start meeting' : 'Add agenda topics first'}</button>} />
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
      {confirmDialog}
      <div className="lg:col-span-2 space-y-6">
        <section className={`card p-6 ${active && remaining < 0 ? 'border-red-300' : ''}`}>
          {live && !me?.status && (
            <button className="btn-primary w-full mb-5" onClick={async () => { if (await run(() => post(`/meetings/${meeting.id}/checkin`), 'Checked in')) reload() }}><UserCheck className="w-4 h-4" />Check in</button>
          )}
          {active ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-brand-gray-500">Topic {agenda.indexOf(active) + 1} of {agenda.length}</p>
              <div className="flex flex-wrap items-end justify-between gap-4 mt-1">
                <div className="min-w-0">
                  <h2 className="text-display truncate">{active.title}</h2>
                  {active.owner_name && <p className="text-sm text-brand-gray-500 mt-1 flex items-center gap-1.5"><Avatar name={active.owner_name} seed={active.owner_id} size="xs" />{active.owner_name}</p>}
                </div>
                <div className="text-right">
                  <p className={`font-mono text-5xl font-semibold tabular-nums tracking-tight ${remaining < 0 ? 'text-status-danger' : remaining < 60 ? 'text-amber-600' : 'text-brand-black'}`}>{mmss(remaining)}</p>
                  <p className="text-xs text-brand-gray-500">{remaining < 0 ? 'over' : 'remaining'} of {active.minutes} min</p>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-brand-gray-100 mt-4 overflow-hidden">
                <div className={`h-full ${remaining < 0 ? 'bg-red-500' : 'bg-accent-500'} transition-[width] duration-1000 ease-linear`} style={{ width: `${Math.min(100, (elapsed / (active.minutes * 60)) * 100)}%` }} />
              </div>
              {canRun && (
                <>
                  <div className="mt-5"><AutoSaveText label="Topic notes" value={active.notes} placeholder="Notes for this topic" rows={3}
                    onSave={async (notes) => { const r = await run(() => patch(`/agenda/${active.id}`, { notes })); if (r) setData((d) => ({ ...d, agenda: r.agenda })) }} /></div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <button className="btn-primary" onClick={() => act('advance', {})}><Check className="w-4 h-4" />Next topic</button>
                    <button className="btn-secondary" onClick={() => act('advance', { skip: true })}><SkipForward className="w-4 h-4" />Skip</button>
                    <button className="btn-ghost ml-auto" onClick={endMeeting}><Square className="w-4 h-4" />End meeting</button>
                  </div>
                </>
              )}
            </>
          ) : live ? (
            <div className="text-center py-4">
              <Flag className="w-7 h-7 mx-auto text-accent-600 mb-2" />
              <p className="font-medium">Agenda complete</p>
              <p className="text-sm text-brand-gray-500 mb-4">Record decisions and action items, then end the meeting.</p>
              {canRun && <button className="btn-primary" onClick={endMeeting}><Square className="w-4 h-4" />End meeting</button>}
            </div>
          ) : <p className="text-sm text-brand-gray-500">This meeting has ended. The recap is ready.</p>}
          {meeting.started_at && (
            <p className="text-xs text-brand-gray-500 mt-4 tabular-nums">Elapsed {mmss(meetingElapsed)} of {meeting.duration_min}:00{meetingElapsed > meeting.duration_min * 60 ? ' · running over' : ''}</p>
          )}
        </section>

        <Section title="Agenda">
          <ol className="divide-y divide-brand-gray-100">
            {agenda.map((a, i) => {
              const took = a.started_at && a.ended_at ? (parseServerTime(a.ended_at) - parseServerTime(a.started_at)) / 1000 : null
              return (
                <li key={a.id} className={`flex items-center gap-3 px-5 py-2.5 text-sm ${a.status === 'active' ? 'bg-accent-50' : ''}`}>
                  <span className="w-5 text-brand-gray-400 tabular-nums">{i + 1}</span>
                  <span className={`flex-1 truncate ${a.status === 'done' ? 'text-brand-gray-500' : a.status === 'skipped' ? 'text-brand-gray-400 line-through' : a.status === 'active' ? 'font-medium' : ''}`}>{a.title}</span>
                  <span className="text-xs text-brand-gray-500 tabular-nums">{took !== null ? <span className={took > a.minutes * 60 ? 'text-status-danger' : ''}>{mmss(took)} / {a.minutes} min</span> : `${a.minutes} min`}</span>
                </li>
              )
            })}
          </ol>
        </Section>

        <Section title="Decisions">
          <div className="p-5">
            <AutoSaveText label="Decisions" value={meeting.decisions} disabled={!canRun} placeholder="One decision per line"
              onSave={async (decisions) => { const r = await run(() => patch(`/meetings/${meeting.id}`, { decisions })); if (r) setData((d) => ({ ...d, meeting: r.meeting })) }} />
          </div>
        </Section>
      </div>

      <div className="space-y-6">
        <Section title="Attendance" aside={<span className="text-xs text-brand-gray-500 tabular-nums">{counts.present + counts.late} of {attendance.length} here</span>}>
          {canRun && <p className="px-5 pt-3 text-xs text-brand-gray-500">Click a name to cycle present, late, excused, absent. <button className="link" onClick={markRestPresent}>Mark the rest present</button></p>}
          <ul className="p-2 grid gap-0.5 max-h-[26rem] overflow-y-auto">
            {attendance.map((p) => {
              const s = ATTEND.find((x) => x.id === p.status)
              return (
                <li key={p.id}>
                  <button type="button" disabled={!canRun} onClick={() => mark(p)} className="w-full flex items-center gap-2.5 rounded-lg px-3 py-1.5 hover:bg-brand-gray-100 disabled:hover:bg-transparent text-left">
                    <Avatar name={p.name} seed={p.id} size="sm" />
                    <span className="flex-1 text-sm truncate">{p.name}</span>
                    {s ? <span style={{ backgroundColor: s.fill, color: s.ink }} className="text-[11px] font-medium rounded-full px-2 py-0.5">{s.label}</span> : <span className="text-[11px] text-brand-gray-400">—</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </Section>
        <Section title="Action items">
          <div className="p-5">
            {canRun && live && <ActionForm meetingId={meeting.id} users={users} run={run} onAdded={reload} />}
            <ul className={`space-y-2 ${canRun && live ? 'mt-4' : ''}`}>
              {actions.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <Avatar name={a.assignee_name} seed={a.assignee_id} size="xs" />
                  <Link to={`/boards/${a.board_id}?item=${a.id}`} className="flex-1 truncate hover:text-accent-700">{a.title}</Link>
                  <StatusPill status={a.status} small />
                </li>
              ))}
              {actions.length === 0 && <li className="text-sm text-brand-gray-500">None yet.</li>}
            </ul>
          </div>
        </Section>
      </div>
    </div>
  )
}

// ── Recap ──
function Recap({ meetingId }) {
  const [md, setMd] = useState(null)
  const { success, error } = useToast()
  useEffect(() => { get(`/meetings/${meetingId}/recap`).then((d) => setMd(d.markdown)) }, [meetingId])
  if (md === null) return <div className="card"><SkeletonTable rows={4} cols={1} /></div>
  const copy = async () => {
    try { await navigator.clipboard.writeText(md); success('Recap copied', 'Paste it into Slack, Discord or an email.') } catch { error('Couldn’t copy', 'Select the text and copy it instead.') }
  }
  return (
    <Section title="Recap" aside={<div className="flex gap-2 print:hidden"><button className="btn-secondary btn-sm" onClick={() => window.print()}><Printer className="w-4 h-4" />Print</button><button className="btn-primary btn-sm" onClick={copy}><ClipboardCopy className="w-4 h-4" />Copy</button></div>}>
      <pre className="px-5 py-4 whitespace-pre-wrap font-sans text-sm leading-6">{md}</pre>
    </Section>
  )
}

export default function Meeting() {
  const { id } = useParams()
  const { user, users } = useSession()
  const { success, error } = useToast()
  const [confirm, confirmDialog] = useConfirm()
  const [data, setData] = useState(null)
  const [missing, setMissing] = useState(false)
  const [tab, setTab] = useState(null)
  const navigate = useNavigate()

  const run = useCallback(async (fn, okMessage) => {
    try { const out = await fn(); if (okMessage) success(okMessage); return out } catch (e) { error('Couldn’t save that', e.message); return undefined }
  }, [success, error])
  const reload = useCallback(() => get(`/meetings/${id}`).then(setData).catch((e) => e.status === 404 && setMissing(true)), [id])
  useEffect(() => { setTab(null); reload() }, [reload])
  useEffect(() => { if (data && !tab) setTab(data.meeting.status === 'live' ? 'run' : data.meeting.status === 'ended' ? 'recap' : 'plan') }, [data, tab])
  // People following along (not running it) see the current topic move.
  useEffect(() => {
    if (data?.meeting.status !== 'live' || data.can_run) return undefined
    const t = setInterval(reload, 10000)
    return () => clearInterval(t)
  }, [data?.meeting.status, data?.can_run, reload])

  if (missing) return <EmptyState icon={CalendarDays} title="Meeting not found" message="It may have been deleted, or it’s one you don’t have access to." action={<Link to="/meetings" className="btn-secondary">All meetings</Link>} />
  if (!data || !tab) return <div className="card"><SkeletonTable rows={6} cols={3} /></div>
  const { meeting } = data
  const remove = async () => {
    if (!(await confirm({ title: 'Delete this meeting?', message: 'Action items already on boards are kept.', confirmLabel: 'Delete', tone: 'danger' }))) return
    if (await run(() => del(`/meetings/${meeting.id}`), 'Meeting deleted')) navigate('/meetings')
  }

  return (
    <div>
      {confirmDialog}
      <nav className="text-xs text-brand-gray-500 mb-2" aria-label="Breadcrumb"><Link to="/meetings" className="hover:text-brand-black">Meetings</Link> <span aria-hidden="true">/</span></nav>
      <div className="flex flex-wrap items-start justify-between gap-4 pb-5 mb-6 border-b border-brand-gray-200">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="page-title">{meeting.title}</h1>
            {meeting.status === 'live' && <span className="badge-success">In progress</span>}
            {meeting.status === 'ended' && <span className="badge-gray">Ended</span>}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm text-brand-gray-600">
            <span className="flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-brand-gray-400" />{fmtFull(new Date(meeting.starts_at))}</span>
            <span className="flex items-center gap-1.5"><Timer className="w-4 h-4 text-brand-gray-400" />{meeting.duration_min} min</span>
            {meeting.location && <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-brand-gray-400" />{meeting.location}</span>}
            <span className="flex items-center gap-1.5"><User className="w-4 h-4 text-brand-gray-400" />{meeting.facilitator_name || 'No facilitator'}</span>
            <span className="badge-gray">{MEETING_KIND[meeting.kind]?.label}</span>
          </div>
        </div>
        {atLeast(user, 'lead') && <button className="btn-ghost btn-sm" onClick={remove}><Trash2 className="w-4 h-4" />Delete</button>}
      </div>
      <SegmentedControl className="mb-6" size="md" aria-label="Meeting sections" value={tab} onChange={setTab} options={[
        { value: 'plan', label: 'Agenda' }, { value: 'run', label: meeting.status === 'live' ? 'Run · live' : 'Run' }, { value: 'recap', label: 'Recap' },
      ]} />
      {tab === 'plan' && <Plan data={data} setData={setData} users={users} run={run} />}
      {tab === 'run' && <Run data={data} setData={setData} users={users} run={run} reload={reload} />}
      {tab === 'recap' && <Recap meetingId={meeting.id} key={data.actions.length + meeting.decisions} />}
    </div>
  )
}
