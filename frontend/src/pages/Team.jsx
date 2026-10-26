import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react'
import { del, get, patch, post } from '../lib/api'
import { useSession } from '../context/Session'
import { atLeast, COLORS, ROLE, ROLES, SWATCH } from '../lib/constants'
import { parseServerTime, relative } from '../lib/format'
import useRun from '../lib/useRun'
import Avatar from '../components/ui/Avatar'
import EmptyState from '../components/ui/EmptyState'
import FilterChips from '../components/ui/FilterChips'
import Modal from '../components/ui/Modal'
import PageHeader from '../components/ui/PageHeader'
import { SkeletonTable } from '../components/ui/Skeleton'
import Field from '../components/forms/Field'
import Popover from '../components/board/Popover'
import { useConfirm } from '../components/list/useConfirm'

function PersonForm({ person, subteams, onClose, onSaved }) {
  const editing = !!person
  const [form, setForm] = useState({ name: person?.name || '', email: person?.email || '', role: person?.role || 'member', subteam_id: person?.subteam_id || '' })
  const run = useRun()
  const [confirm, confirmDialog] = useConfirm()
  const submit = async (e) => {
    e.preventDefault()
    const body = { name: form.name, role: form.role, subteam_id: form.subteam_id || null }
    const res = await run(() => (editing ? patch(`/users/${person.id}`, body) : post('/users', { ...body, email: form.email })), editing ? 'Saved' : `${form.name} added`)
    if (res) onSaved()
  }
  const toggleActive = async () => {
    if (person.is_active && !(await confirm({ title: `Remove ${person.name}?`, message: 'They lose access on their next click. Tasks they own stay assigned to them, so reassign those. Remove them from the team password manager too, and change any shared passwords they knew.', confirmLabel: 'Remove', tone: 'danger' }))) return
    if (await run(() => patch(`/users/${person.id}`, { is_active: !person.is_active }), person.is_active ? `${person.name} removed` : `${person.name} reactivated`)) onSaved()
  }
  return (
    <Modal open onClose={onClose} title={editing ? person.name : 'Add a person'} size="md"
      footer={<>
        {editing && <button type="button" className={`${person.is_active ? 'btn-danger' : 'btn-secondary'} mr-auto`} onClick={toggleActive}>{person.is_active ? 'Remove from team' : 'Reactivate'}</button>}
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="person-form">{editing ? 'Save' : 'Add person'}</button>
      </>}>
      {confirmDialog}
      <form id="person-form" className="space-y-4" onSubmit={submit}>
        <Field label="Name"><input className="input" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        {!editing && <Field label="Email" hint="The address they sign in with."><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>}
        <div>
          <span className="label">Role</span>
          <div className="grid gap-2">
            {ROLES.map((r) => (
              <label key={r.id} className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${form.role === r.id ? 'border-accent-500 bg-accent-50' : 'border-brand-gray-200 hover:border-brand-gray-300'}`}>
                <input type="radio" name="role" className="mt-1" checked={form.role === r.id} onChange={() => setForm({ ...form, role: r.id })} />
                <span><span className="text-sm font-medium block">{r.label}</span><span className="text-xs text-brand-gray-500">{r.hint}</span></span>
              </label>
            ))}
          </div>
        </div>
        <Field label="Subteam">
          <select className="input" value={form.subteam_id} onChange={(e) => setForm({ ...form, subteam_id: e.target.value })}>
            <option value="">None</option>
            {subteams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </form>
    </Modal>
  )
}

function Subteams({ subteams, refresh }) {
  const [name, setName] = useState('')
  const run = useRun()
  const [confirm, confirmDialog] = useConfirm()
  const add = async (e) => {
    e.preventDefault()
    if (name.trim() && (await run(() => post('/subteams', { name: name.trim(), color: 'gray' })))) { setName(''); refresh() }
  }
  return (
    <section className="card">
      {confirmDialog}
      <header className="px-5 pt-4 pb-3 border-b border-brand-gray-200"><h2 className="text-[15px] font-semibold">Subteams</h2></header>
      <ul className="p-3 space-y-1.5">
        {subteams.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <Popover trigger={({ toggle, ref }) => <button ref={ref} type="button" className={`w-5 h-5 rounded shrink-0 ${SWATCH[s.color]}`} onClick={toggle} aria-label={`${s.name} colour`} />}>
              {(close) => (
                <div className="p-2 grid grid-cols-7 gap-1.5 w-56">
                  {COLORS.map((c) => <button key={c} type="button" aria-label={c} className={`w-5 h-5 rounded ${SWATCH[c]}`} onClick={async () => { close(); if (await run(() => patch(`/subteams/${s.id}`, { color: c }))) refresh() }} />)}
                </div>
              )}
            </Popover>
            <input className="input py-1.5 flex-1" defaultValue={s.name} aria-label="Subteam name" onBlur={async (e) => e.target.value.trim() && e.target.value !== s.name && (await run(() => patch(`/subteams/${s.id}`, { name: e.target.value.trim() }))) && refresh()} />
            <button className="btn-icon" aria-label={`Delete ${s.name}`} onClick={async () => { if (await confirm({ title: `Delete ${s.name}?`, message: 'People and boards in it become unassigned.', confirmLabel: 'Delete', tone: 'danger' }) && (await run(() => del(`/subteams/${s.id}`)))) refresh() }}><Trash2 className="w-4 h-4" /></button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2 px-3 pb-3"><input className="input py-1.5" placeholder="New subteam" value={name} onChange={(e) => setName(e.target.value)} aria-label="New subteam" /><button className="btn-secondary btn-sm" aria-label="Add subteam"><Plus className="w-4 h-4" /></button></form>
    </section>
  )
}

export default function Team() {
  const { user, subteams, subteamById, refreshTeam } = useSession()
  const [people, setPeople] = useState(null)
  const [scope, setScope] = useState('active')
  const [subteam, setSubteam] = useState('')
  const [editing, setEditing] = useState(null)
  const isAdmin = atLeast(user, 'admin')
  const load = () => get(`/users${scope === 'all' ? '?all=1' : ''}`).then((d) => setPeople(d.users))
  useEffect(() => { load() }, [scope]) // eslint-disable-line react-hooks/exhaustive-deps
  const saved = () => { setEditing(null); load(); refreshTeam() }

  const shown = (people || []).filter((p) => !subteam || (p.subteam_id || 'none') === subteam)
  const order = { admin: 0, lead: 1, member: 2 }
  shown.sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name))

  return (
    <div>
      <PageHeader title="People" subtitle={people ? `${people.filter((p) => p.is_active).length} people on the team` : ' '}
        actions={isAdmin && <button type="button" className="btn-primary" onClick={() => setEditing('new')}><UserPlus className="w-4 h-4" />Add person</button>} />
      <div className={`grid gap-6 ${isAdmin ? 'xl:grid-cols-[1fr_320px]' : ''} [&>*]:min-w-0`}>
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <FilterChips aria-label="Subteam" scroll value={subteam} onChange={setSubteam} options={[
              { key: '', label: 'Everyone' }, ...subteams.map((s) => ({ key: s.id, label: s.name, count: people ? people.filter((p) => p.subteam_id === s.id).length : null })),
            ]} />
            {isAdmin && <label className="flex items-center gap-1.5 text-sm text-brand-gray-600 ml-auto"><input type="checkbox" checked={scope === 'all'} onChange={(e) => setScope(e.target.checked ? 'all' : 'active')} />Show removed</label>}
          </div>
          {!people ? <div className="card"><SkeletonTable rows={6} cols={4} /></div> : shown.length === 0 ? (
            <div className="card"><EmptyState icon={Users} title="No one here" /></div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="table min-w-[640px]">
                <thead><tr><th>Name</th><th>Role</th><th>Subteam</th>{isAdmin && <th>Last active</th>}{isAdmin && <th className="w-12" />}</tr></thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id} className={p.is_active ? '' : 'opacity-50'}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={p.name} seed={p.id} size="md" />
                          <div className="min-w-0">
                            <p className="font-medium text-brand-black truncate">{p.name}{p.id === user.id && <span className="text-brand-gray-500 font-normal"> (you)</span>}</p>
                            {p.email && <p className="text-xs text-brand-gray-500 truncate">{p.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td><span className={p.role === 'admin' ? 'badge-black' : p.role === 'lead' ? 'badge-success' : 'badge-gray'}>{ROLE[p.role].label}</span></td>
                      <td className="text-brand-gray-600">{subteamById[p.subteam_id]?.name ? <span className="inline-flex items-center gap-1.5"><span className={`w-2 h-2 rounded-sm ${SWATCH[subteamById[p.subteam_id].color]}`} />{subteamById[p.subteam_id].name}</span> : '—'}</td>
                      {isAdmin && <td className="text-brand-gray-500 whitespace-nowrap">{!p.is_active ? 'Removed' : p.has_signed_in ? relative(parseServerTime(p.last_seen_at)) || '—' : 'Never signed in'}</td>}
                      {isAdmin && <td><button className="btn-icon" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}><Pencil className="w-4 h-4" /></button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {isAdmin && <div><Subteams subteams={subteams} refresh={refreshTeam} /></div>}
      </div>
      {editing && <PersonForm person={editing === 'new' ? null : editing} subteams={subteams} onClose={() => setEditing(null)} onSaved={saved} />}
    </div>
  )
}
