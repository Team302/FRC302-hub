import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Check, ClipboardCopy, Flag, Play, Plus, SkipForward, Square, Trash2, UserCheck } from 'lucide-react'
import { del, get, patch, post, put } from '../lib/api'
import { useSession } from '../context/Session'
import { atLeast, MEETING_KIND } from '../lib/constants'
import { fmtFull, fmtTime, mmss, parseServerTime } from '../lib/format'
import { Avatar, EmptyState, Field, PageHeader, PersonPicker, Spinner, StatusPicker, useAction, useToast } from '../components/ui'

const ATTEND = [
  { id: 'present', label: 'Present', cls: 'bg-[#037f4c] text-white' },
  { id: 'late', label: 'Late', cls: 'bg-[#fdab3d] text-[#1f1f1f]' },
  { id: 'excused', label: 'Excused', cls: 'bg-[#0b6bcb] text-white' },
  { id: 'absent', label: 'Absent', cls: 'bg-[#d83a52] text-white' },
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

function AutoSaveText({ value, onSave, placeholder, rows = 4, disabled }) {
  const [draft, setDraft] = useState(value || '')
  useEffect(() => setDraft(value || ''), [value])
  return <textarea className="input" rows={rows} value={draft} disabled={disabled} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== (value || '') && onSave(draft)} />
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

  return (
    <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
      <section className="card lg:col-span-2">
        <header className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="section-title">Agenda</h2>
          <span className={`text-sm ${total > meeting.duration_min ? 'text-amber-700 font-medium' : 'text-brand-gray-500'}`}>
            {total} of {meeting.duration_min} min{total > meeting.duration_min ? ' — over time, cut something' : ''}
          </span>
        </header>
        {agenda.length === 0 && <p className="px-5 pb-3 text-sm text-brand-gray-500">No topics yet. Give each one a timebox and an owner — that’s what keeps a meeting short.</p>}
        <ol className="divide-y divide-brand-gray-100">
          {agenda.map((a, i) => (
            <li key={a.id} className="flex items-center gap-3 px-5 py-2.5">
              <span className="w-6 text-sm text-brand-gray-400 tabular-nums">{i + 1}.</span>
              <div className="flex-1 min-w-0">
                <input className="w-full bg-transparent outline-none text-sm font-medium rounded focus:ring-2 focus:ring-accent-500/30 px-1 -mx-1" defaultValue={a.title} disabled={!canRun} aria-label="Topic"
                  onBlur={async (e) => e.target.value.trim() && e.target.value !== a.title && setAgenda(await run(() => patch(`/agenda/${a.id}`, { title: e.target.value.trim() })))} />
              </div>
              <PersonPicker value={a.owner_id} users={users} disabled={!canRun} onChange={async (owner_id) => setAgenda(await run(() => patch(`/agenda/${a.id}`, { owner_id })))} />
              <input type="number" min={1} max={240} className="input w-16 py-1 text-right" defaultValue={a.minutes} disabled={!canRun} aria-label="Minutes"
                onBlur={async (e) => Number(e.target.value) !== a.minutes && setAgenda(await run(() => patch(`/agenda/${a.id}`, { minutes: Number(e.target.value) })))} />
              <span className="text-xs text-brand-gray-500 -ml-2">min</span>
              {canRun && (
                <div className="flex">
                  <button className="btn-icon w-7 h-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button className="btn-icon w-7 h-7" disabled={i === agenda.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button className="btn-icon w-7 h-7" onClick={async () => setAgenda(await run(() => del(`/agenda/${a.id}`)))} aria-label="Remove topic"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </li>
          ))}
        </ol>
        {canRun && (
          <form onSubmit={add} className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-brand-gray-200">
            <input className="input flex-1 min-w-[12rem]" placeholder="Add a topic, e.g. “Drivetrain status”" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="New topic" />
            <PersonPicker value={form.owner_id} users={users} onChange={(owner_id) => setForm({ ...form, owner_id })} />
            <input type="number" min={1} max={240} className="input w-20" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} aria-label="Minutes" />
            <button className="btn-primary"><Plus className="w-4 h-4" />Add</button>
          </form>
        )}
      </section>
      <section className="card-padded space-y-3 h-fit">
        <h2 className="section-title">Details</h2>
        <p className="text-sm"><span className="text-brand-gray-500">When:</span> {fmtFull(new Date(meeting.starts_at))}</p>
        <p className="text-sm"><span className="text-brand-gray-500">Length:</span> {meeting.duration_min} min</p>
        {meeting.location && <p className="text-sm"><span className="text-brand-gray-500">Where:</span> {meeting.location}</p>}
        <p className="text-sm"><span className="text-brand-gray-500">Facilitator:</span> {meeting.facilitator_name || '—'}</p>
        <p className="text-xs text-brand-gray-500 pt-2">Tip: send the agenda out the day before. Topics without an owner tend to get skipped.</p>
      </section>
    </div>
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
    const res = await run(() => post(`/meetings/${meetingId}/actions`, { ...form, due_date: form.due_date || null }), 'Action item added to the board.')
    if (res) { onAdded(res.item); setForm((f) => ({ ...f, title: '', assignee_id: null, due_date: '' })) }
  }
  if (!boards.length) return <p className="text-sm text-brand-gray-500">Create a board first — action items become tasks on it.</p>
  return (
    <form onSubmit={submit} className="space-y-2">
      <input className="input" required placeholder="Who does what…" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Action item" />
      <div className="flex items-center gap-2">
        <div className="input py-1 flex-1"><PersonPicker value={form.assignee_id} users={users} onChange={(assignee_id) => setForm({ ...form, assignee_id })} /></div>
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
  const toast = useToast()
  const { meeting, agenda, attendance, actions, can_run: canRun } = data
  const live = meeting.status === 'live'
  const now = useNow(live)
  const active = agenda.find((a) => a.status === 'active')
  const elapsed = active ? (now - parseServerTime(active.started_at).getTime()) / 1000 : 0
  const remaining = active ? active.minutes * 60 - elapsed : 0
  const meetingElapsed = meeting.started_at ? (now - parseServerTime(meeting.started_at).getTime()) / 1000 : 0
  const me = attendance.find((a) => a.id === user.id)
  const counts = useMemo(() => Object.fromEntries(ATTEND.map((s) => [s.id, attendance.filter((a) => a.status === s.id).length])), [attendance])

  const act = async (path, body) => {
    const res = await run(() => post(`/meetings/${meeting.id}/${path}`, body))
    if (res) await reload()
  }
  const mark = async (person) => {
    const status = ATTEND_NEXT[person.status]
    setData((d) => ({ ...d, attendance: d.attendance.map((a) => (a.id === person.id ? { ...a, status } : a)) }))
    await run(() => put(`/meetings/${meeting.id}/attendance/${person.id}`, { status }))
  }
  const markAllPresent = async () => {
    for (const p of attendance.filter((a) => !a.status)) await run(() => put(`/meetings/${meeting.id}/attendance/${p.id}`, { status: 'present' }))
    reload()
  }
  const checkIn = async () => {
    const res = await run(() => post(`/meetings/${meeting.id}/checkin`))
    if (res) { toast(`Checked in (${res.status}).`); reload() }
  }

  if (meeting.status === 'scheduled') {
    return (
      <div className="card"><EmptyState icon={Play} title="Not started yet" body={canRun ? `Starts ${fmtTime(new Date(meeting.starts_at))}. When everyone’s in, start it — the first topic’s timer begins.` : 'Check-in opens when the facilitator starts the meeting.'}
        action={canRun && <button className="btn-primary btn-lg" onClick={() => act('start')} disabled={!agenda.length}><Play className="w-4 h-4" />{agenda.length ? 'Start meeting' : 'Add agenda topics first'}</button>} /></div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
      <div className="lg:col-span-2 space-y-6">
        <section className={`card p-6 ${active && remaining < 0 ? 'border-red-400/70' : ''}`}>
          {live && !canRun && !me?.status && (
            <button className="btn-primary w-full mb-5" onClick={checkIn}><UserCheck className="w-4 h-4" />Check in</button>
          )}
          {active ? (
            <>
              <p className="text-xs uppercase tracking-wide text-brand-gray-500">Now · topic {agenda.indexOf(active) + 1} of {agenda.length}</p>
              <div className="flex flex-wrap items-end justify-between gap-4 mt-1">
                <div className="min-w-0">
                  <h2 className="text-display truncate">{active.title}</h2>
                  {active.owner_name && <p className="text-sm text-brand-gray-500 mt-1 flex items-center gap-1.5"><Avatar name={active.owner_name} user={{ id: active.owner_id, name: active.owner_name }} size={20} />{active.owner_name}</p>}
                </div>
                <div className="text-right">
                  <p className={`font-mono text-5xl font-semibold tabular-nums ${remaining < 0 ? 'text-status-danger' : remaining < 60 ? 'text-amber-600' : 'text-brand-black'}`}>{mmss(remaining)}</p>
                  <p className="text-xs text-brand-gray-500">{remaining < 0 ? 'over' : 'left'} of {active.minutes}m</p>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-brand-gray-100 mt-4 overflow-hidden">
                <div className={`h-full ${remaining < 0 ? 'bg-red-500' : 'bg-accent-500'} transition-[width] duration-1000 ease-linear`} style={{ width: `${Math.min(100, (elapsed / (active.minutes * 60)) * 100)}%` }} />
              </div>
              {canRun && (
                <>
                  <div className="mt-5"><AutoSaveText value={active.notes} placeholder="Notes for this topic…" rows={3}
                    onSave={async (notes) => { const r = await run(() => patch(`/agenda/${active.id}`, { notes })); if (r) setData((d) => ({ ...d, agenda: r.agenda })) }} /></div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <button className="btn-primary" onClick={() => act('advance', {})}><Check className="w-4 h-4" />Done — next topic</button>
                    <button className="btn-secondary" onClick={() => act('advance', { skip: true })}><SkipForward className="w-4 h-4" />Skip</button>
                    <button className="btn-ghost ml-auto" onClick={() => window.confirm('End the meeting?') && act('end')}><Square className="w-4 h-4" />End meeting</button>
                  </div>
                </>
              )}
            </>
          ) : live ? (
            <div className="text-center py-4">
              <Flag className="w-8 h-8 mx-auto text-accent-600 mb-2" />
              <p className="font-medium">Agenda complete</p>
              <p className="text-sm text-brand-gray-500 mb-4">Capture decisions and action items, then end the meeting.</p>
              {canRun && <button className="btn-primary" onClick={() => act('end')}><Square className="w-4 h-4" />End meeting</button>}
            </div>
          ) : (
            <p className="text-sm text-brand-gray-500">This meeting has ended. See the Recap tab.</p>
          )}
          {meeting.started_at && (
            <p className="text-xs text-brand-gray-500 mt-4">Meeting clock {mmss(meetingElapsed)} of {meeting.duration_min}:00{meetingElapsed > meeting.duration_min * 60 ? ' — running over' : ''}</p>
          )}
        </section>

        <section className="card">
          <h3 className="section-title px-5 pt-4 pb-2">Agenda</h3>
          <ol className="divide-y divide-brand-gray-100">
            {agenda.map((a, i) => {
              const took = a.started_at && a.ended_at ? (parseServerTime(a.ended_at) - parseServerTime(a.started_at)) / 1000 : null
              return (
                <li key={a.id} className={`flex items-center gap-3 px-5 py-2 text-sm ${a.status === 'active' ? 'bg-accent-50' : ''}`}>
                  <span className="w-5 text-brand-gray-400">{i + 1}.</span>
                  <span className={`flex-1 truncate ${a.status === 'done' ? 'text-brand-gray-500' : a.status === 'skipped' ? 'text-brand-gray-400 line-through' : a.status === 'active' ? 'font-medium' : ''}`}>{a.title}</span>
                  <span className="text-xs text-brand-gray-500 tabular-nums">{took !== null ? <span className={took > a.minutes * 60 ? 'text-status-danger' : ''}>{mmss(took)} / {a.minutes}m</span> : `${a.minutes}m`}</span>
                </li>
              )
            })}
          </ol>
        </section>

        <section className="card-padded">
          <h3 className="section-title mb-2">Decisions</h3>
          <AutoSaveText value={meeting.decisions} disabled={!canRun} placeholder="One per line. “We’re building swerve.” “Fundraiser is Mar 3.”"
            onSave={async (decisions) => { const r = await run(() => patch(`/meetings/${meeting.id}`, { decisions })); if (r) setData((d) => ({ ...d, meeting: r.meeting })) }} />
        </section>
      </div>

      <div className="space-y-6">
        <section className="card">
          <header className="flex items-center justify-between px-5 pt-4 pb-2">
            <h3 className="section-title">Attendance</h3>
            <span className="text-xs text-brand-gray-500">{counts.present + counts.late}/{attendance.length} here</span>
          </header>
          {canRun && <p className="px-5 text-xs text-brand-gray-500 -mt-1 mb-2">Tap a name to cycle present → late → excused → absent. <button className="link" onClick={markAllPresent}>Mark rest present</button></p>}
          <ul className="px-3 pb-3 grid gap-1 max-h-[26rem] overflow-y-auto">
            {attendance.map((p) => {
              const s = ATTEND.find((x) => x.id === p.status)
              return (
                <li key={p.id}>
                  <button type="button" disabled={!canRun} onClick={() => mark(p)} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-brand-gray-100 disabled:hover:bg-transparent text-left">
                    <Avatar user={p} size={24} />
                    <span className="flex-1 text-sm truncate">{p.name}</span>
                    {s ? <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${s.cls}`}>{s.label}</span> : <span className="text-[11px] text-brand-gray-400">—</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
        <section className="card-padded">
          <h3 className="section-title mb-3">Action items</h3>
          {canRun && live && <ActionForm meetingId={meeting.id} users={users} run={run} onAdded={() => reload()} />}
          <ul className="mt-3 space-y-2">
            {actions.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                <Avatar name={a.assignee_name} user={a.assignee_id ? { id: a.assignee_id, name: a.assignee_name } : null} size={22} />
                <Link to={`/boards/${a.board_id}?item=${a.id}`} className="flex-1 truncate hover:text-accent-700">{a.title}</Link>
                <StatusPicker compact value={a.status} disabled onChange={() => {}} />
              </li>
            ))}
            {actions.length === 0 && <li className="text-sm text-brand-gray-500">None yet. Every “someone should…” becomes one here.</li>}
          </ul>
        </section>
      </div>
    </div>
  )
}

// ── Recap ──
function Recap({ meetingId }) {
  const [md, setMd] = useState(null)
  const toast = useToast()
  useEffect(() => { get(`/meetings/${meetingId}/recap`).then((d) => setMd(d.markdown)) }, [meetingId])
  if (md === null) return <Spinner />
  const copy = async () => {
    try { await navigator.clipboard.writeText(md); toast('Recap copied — paste it into Slack, Discord or email.') } catch { toast('Couldn’t copy. Select the text instead.', 'error') }
  }
  return (
    <section className="card">
      <header className="flex items-center justify-between px-5 pt-4 pb-3">
        <h2 className="section-title">Recap</h2>
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm" onClick={() => window.print()}>Print</button>
          <button className="btn-primary btn-sm" onClick={copy}><ClipboardCopy className="w-4 h-4" />Copy recap</button>
        </div>
      </header>
      <pre className="px-5 pb-5 whitespace-pre-wrap font-sans text-sm leading-6">{md}</pre>
    </section>
  )
}

export default function Meeting() {
  const { id } = useParams()
  const { user, users } = useSession()
  const [data, setData] = useState(null)
  const [missing, setMissing] = useState(false)
  const [tab, setTab] = useState(null)
  const run = useAction()
  const navigate = useNavigate()

  const reload = useCallback(() => get(`/meetings/${id}`).then(setData).catch((e) => e.status === 404 && setMissing(true)), [id])
  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    if (data && !tab) setTab(data.meeting.status === 'live' ? 'run' : data.meeting.status === 'ended' ? 'recap' : 'plan')
  }, [data, tab])
  // People following along (not running it) see the current topic move.
  useEffect(() => {
    if (data?.meeting.status !== 'live' || data.can_run) return undefined
    const t = setInterval(reload, 10000)
    return () => clearInterval(t)
  }, [data?.meeting.status, data?.can_run, reload])

  if (missing) return <EmptyState title="Meeting not found" action={<Link to="/meetings" className="btn-secondary">Back to meetings</Link>} />
  if (!data || !tab) return <Spinner />
  const { meeting } = data
  const remove = async () => {
    if (!window.confirm('Delete this meeting? Action items already on boards are kept.')) return
    if (await run(() => del(`/meetings/${meeting.id}`), 'Meeting deleted.')) navigate('/meetings')
  }

  return (
    <div className="animate-fade-up">
      <Link to="/meetings" className="text-xs text-brand-gray-500 hover:text-brand-black">Meetings /</Link>
      <PageHeader title={meeting.title} subtitle={`${fmtFull(new Date(meeting.starts_at))} · ${MEETING_KIND[meeting.kind]?.label}${meeting.location ? ` · ${meeting.location}` : ''}`}
        actions={atLeast(user, 'lead') && <button className="btn-ghost btn-sm" onClick={remove}><Trash2 className="w-4 h-4" />Delete</button>}>
        {meeting.status === 'live' && <span className="badge-success mt-2">Live</span>}
      </PageHeader>
      <div className="inline-flex rounded-control border border-brand-gray-200 p-0.5 glass mb-5" role="tablist">
        {[['plan', 'Plan'], ['run', meeting.status === 'live' ? 'Run (live)' : 'Run'], ['recap', 'Recap']].map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-3 py-1 text-sm rounded-lg ${tab === t ? 'bg-brand-black text-white' : 'text-brand-gray-600'}`}>{label}</button>
        ))}
      </div>
      {tab === 'plan' && <Plan data={data} setData={setData} users={users} run={run} />}
      {tab === 'run' && <Run data={data} setData={setData} users={users} run={run} reload={reload} />}
      {tab === 'recap' && <Recap meetingId={meeting.id} key={data.actions.length + meeting.decisions} />}
    </div>
  )
}
