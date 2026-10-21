import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Archive, LayoutGrid, Plus } from 'lucide-react'
import { get, post } from '../lib/api'
import { useSession } from '../context/Session'
import { atLeast, COLORS, SWATCH } from '../lib/constants'
import { EmptyState, Field, Modal, PageHeader, ProgressBar, Spinner, useAction } from '../components/ui'

export function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLORS.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} aria-label={c} aria-pressed={value === c}
          className={`w-6 h-6 rounded-md ${SWATCH[c]} ${value === c ? 'ring-2 ring-offset-2 ring-brand-black' : ''}`} />
      ))}
    </div>
  )
}

export default function Boards() {
  const { user, subteams, subteamById } = useSession()
  const [boards, setBoards] = useState(null)
  const [archived, setArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', subteam_id: '', color: 'green' })
  const run = useAction()
  const navigate = useNavigate()

  useEffect(() => { setBoards(null); get(`/boards${archived ? '?archived=1' : ''}`).then((d) => setBoards(d.boards)) }, [archived])

  const create = async (e) => {
    e.preventDefault()
    const res = await run(() => post('/boards', { ...form, subteam_id: form.subteam_id || null }))
    if (res) navigate(`/boards/${res.board.id}`)
  }

  return (
    <div className="animate-fade-up">
      <PageHeader title="Boards" subtitle="One board per subteam or project. Every task has an owner, a status and a due date."
        actions={<>
          <button className={`btn-ghost btn-sm ${archived ? 'text-brand-black' : ''}`} onClick={() => setArchived((a) => !a)}><Archive className="w-4 h-4" />{archived ? 'Showing archived' : 'Archived'}</button>
          {atLeast(user, 'lead') && <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="w-4 h-4" />New board</button>}
        </>} />
      {!boards ? <Spinner /> : boards.length === 0 ? (
        <div className="card"><EmptyState icon={LayoutGrid} title={archived ? 'No archived boards' : 'No boards yet'} body={atLeast(user, 'lead') ? 'Start with one per subteam: Mechanical, Programming, Business…' : 'A lead will set these up.'} /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {boards.map((b) => (
            <Link key={b.id} to={`/boards/${b.id}`} className="card p-5 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className={`mt-1 w-3 h-3 rounded ${SWATCH[b.color]}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{b.name}</p>
                  <p className="text-sm text-brand-gray-500 line-clamp-2 min-h-[1.25rem]">{b.description || subteamById[b.subteam_id]?.name || ''}</p>
                </div>
              </div>
              <ProgressBar total={b.item_count} counts={{ done: b.done_count, stuck: b.stuck_count }} />
              <div className="flex gap-3 text-xs text-brand-gray-500">
                <span>{b.done_count}/{b.item_count} done</span>
                {b.stuck_count > 0 && <span className="text-status-danger">{b.stuck_count} stuck</span>}
                {b.overdue_count > 0 && <span className="text-amber-700">{b.overdue_count} overdue</span>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="New board"
        footer={<><button className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn-primary" form="new-board">Create board</button></>}>
        <form id="new-board" className="space-y-4" onSubmit={create}>
          <Field label="Name"><input className="input" autoFocus required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 2027 Drivetrain" /></Field>
          <Field label="Description"><input className="input" maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Subteam">
            <select className="input" value={form.subteam_id} onChange={(e) => setForm({ ...form, subteam_id: e.target.value })}>
              <option value="">Whole team</option>
              {subteams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Colour"><ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} /></Field>
          <p className="text-xs text-brand-gray-500">Starts with three groups — This week, Next up, Backlog — which you can rename.</p>
        </form>
      </Modal>
    </div>
  )
}
