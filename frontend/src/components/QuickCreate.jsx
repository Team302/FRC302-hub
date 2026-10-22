// The "+" New menu's dialogs: a task (on any board), a board (from a template) or a meeting.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, post } from '../lib/api'
import { useSession } from '../context/Session'
import { useToast } from '../context/ToastContext'
import { atLeast, BOARD_TEMPLATES, COLORS, MEETING_KINDS, SWATCH } from '../lib/constants'
import { fromLocalInput, toLocalInput } from '../lib/format'
import Modal from './ui/Modal'

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-xs text-brand-gray-500 mt-1">{hint}</span>}
    </label>
  )
}

function TaskForm({ submit: run }) {
  const { boards, users, user } = useSession()
  const active = boards.filter((b) => !b.is_archived)
  const [form, setForm] = useState({ board_id: active[0]?.id || '', group_id: '', title: '', assignee_id: user.id, due_date: '' })
  const [groups, setGroups] = useState([])
  const navigate = useNavigate()
  useEffect(() => {
    if (!form.board_id) return
    get(`/boards/${form.board_id}`).then((d) => { setGroups(d.groups); setForm((f) => ({ ...f, group_id: d.groups[0]?.id || '' })) })
  }, [form.board_id])
  if (!active.length) return <p className="text-sm text-brand-gray-500">There are no boards yet. A lead needs to create one first.</p>
  const submit = (e) => run(e, async () => {
    const res = await post('/items', { ...form, assignee_id: form.assignee_id || null, due_date: form.due_date || null })
    navigate(`/boards/${form.board_id}?item=${res.item.id}`)
    return `Task added to ${active.find((b) => b.id === form.board_id)?.name}`
  })
  return (
    <form id="quick-create" onSubmit={submit} className="space-y-4">
      <Field label="Task"><input className="input" required autoFocus maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Board"><select className="input" value={form.board_id} onChange={(e) => setForm({ ...form, board_id: e.target.value })}>{active.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Group"><select className="input" value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
        <Field label="Owner"><select className="input" value={form.assignee_id || ''} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}><option value="">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        <Field label="Due date"><input type="date" className="input" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
      </div>
    </form>
  )
}

function BoardForm({ submit: run }) {
  const { subteams, refreshBoards } = useSession()
  const [form, setForm] = useState({ name: '', description: '', subteam_id: '', color: 'green', template: 'build' })
  const navigate = useNavigate()
  const submit = (e) => run(e, async () => {
    const res = await post('/boards', { ...form, subteam_id: form.subteam_id || null })
    await refreshBoards()
    navigate(`/boards/${res.board.id}`)
    return `${form.name} created`
  })
  return (
    <form id="quick-create" onSubmit={submit} className="space-y-4">
      <Field label="Board name"><input className="input" required autoFocus maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="2027 Drivetrain" /></Field>
      <div>
        <span className="label">Template</span>
        <div className="grid gap-2">
          {BOARD_TEMPLATES.map((t) => (
            <label key={t.id} className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${form.template === t.id ? 'border-accent-500 bg-accent-50' : 'border-brand-gray-200 hover:border-brand-gray-300'}`}>
              <input type="radio" name="template" className="mt-1" checked={form.template === t.id} onChange={() => setForm({ ...form, template: t.id })} />
              <span><span className="block text-sm font-medium">{t.label}</span><span className="block text-xs text-brand-gray-500 mt-0.5">{t.hint}</span></span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Subteam"><select className="input" value={form.subteam_id} onChange={(e) => setForm({ ...form, subteam_id: e.target.value })}><option value="">Whole team</option>{subteams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <div><span className="label">Colour</span><div className="flex flex-wrap gap-1.5 pt-1">{COLORS.map((c) => <button key={c} type="button" aria-label={c} aria-pressed={form.color === c} onClick={() => setForm({ ...form, color: c })} className={`w-5 h-5 rounded ${SWATCH[c]} ${form.color === c ? 'ring-2 ring-offset-2 ring-brand-black/60' : ''}`} />)}</div></div>
      </div>
      <Field label="Description"><input className="input" maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
    </form>
  )
}

function nextEvening() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(18, 0, 0, 0)
  return d.toISOString()
}

export function MeetingForm({ submit: run }) {
  const { user, users, subteams } = useSession()
  const [past, setPast] = useState([])
  const [form, setForm] = useState({ title: '', kind: 'general', starts_at: toLocalInput(nextEvening()), duration_min: 60, location: '', facilitator_id: user.id, subteam_id: '', copy_agenda_from: '', repeat: false, repeat_until: '' })
  const navigate = useNavigate()
  useEffect(() => { get('/meetings?scope=past').then((d) => setPast(d.meetings)).catch(() => {}) }, [])
  const submit = (e) => run(e, async () => {
    const { repeat, repeat_until: until, ...rest } = form
    const res = await post('/meetings', { ...rest, starts_at: fromLocalInput(form.starts_at), duration_min: Number(form.duration_min), subteam_id: form.subteam_id || null, copy_agenda_from: form.copy_agenda_from || undefined, repeat_until: repeat && until ? until : undefined })
    navigate(`/meetings/${res.meeting.id}`)
    return res.created > 1 ? `${res.created} weekly meetings scheduled` : 'Meeting scheduled'
  })
  return (
    <form id="quick-create" onSubmit={submit} className="space-y-4">
      <Field label="Title"><input className="input" required autoFocus maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Weekly all-hands" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type"><select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{MEETING_KINDS.filter((k) => !k.minRole || atLeast(user, k.minRole)).map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></Field>
        <Field label="Subteam"><select className="input" value={form.subteam_id} onChange={(e) => setForm({ ...form, subteam_id: e.target.value })}><option value="">—</option>{subteams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Starts"><input type="datetime-local" className="input" required value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></Field>
        <Field label="Length (minutes)"><input type="number" min={5} max={600} className="input" value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: e.target.value })} /></Field>
      </div>
      <div className="rounded-xl border border-brand-gray-200 p-3 space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.checked })} />Repeat every week</label>
        {form.repeat && <Field label="Until" hint="Same time each week, up to 52 meetings. Each one gets its own agenda and attendance."><input type="date" className="input" required min={form.starts_at.slice(0, 10)} value={form.repeat_until} onChange={(e) => setForm({ ...form, repeat_until: e.target.value })} /></Field>}
      </div>
      <Field label="Location"><input className="input" maxLength={120} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Shop, room 302, Discord…" /></Field>
      <Field label="Facilitator" hint="Runs the agenda and takes attendance."><select className="input" value={form.facilitator_id} onChange={(e) => setForm({ ...form, facilitator_id: e.target.value })}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      {past.length > 0 && <Field label="Copy agenda from"><select className="input" value={form.copy_agenda_from} onChange={(e) => setForm({ ...form, copy_agenda_from: e.target.value })}><option value="">Start with an empty agenda</option>{past.map((m) => <option key={m.id} value={m.id}>{m.title} · {new Date(m.starts_at).toLocaleDateString()}</option>)}</select></Field>}
    </form>
  )
}

const TITLES = { task: 'New task', board: 'New board', meeting: 'Schedule a meeting' }
const SUBMIT = { task: 'Create task', board: 'Create board', meeting: 'Schedule' }

export default function QuickCreate({ type, onClose }) {
  const { success, error } = useToast()
  const [busy, setBusy] = useState(false)
  if (!type) return null
  // Each form hands its request to `submit`: busy while it runs, a toast either way, and the
  // dialog only closes on success.
  const submit = async (e, request) => {
    e.preventDefault()
    setBusy(true)
    try {
      const message = await request()
      success(message)
      onClose()
    } catch (err) {
      error('Couldn’t create that', err.message)
    } finally {
      setBusy(false)
    }
  }
  const Form = { task: TaskForm, board: BoardForm, meeting: MeetingForm }[type]
  return (
    <Modal open onClose={onClose} title={TITLES[type]} size="md" dismissible={!busy}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="quick-create" disabled={busy}>{busy ? 'Saving…' : SUBMIT[type]}</button></>}>
      <Form submit={submit} />
    </Modal>
  )
}
