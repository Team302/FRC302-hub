import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, UserPlus } from 'lucide-react'
import { del, get, patch, post } from '../lib/api'
import { useSession } from '../context/Session'
import { atLeast, ROLE, ROLES, SWATCH } from '../lib/constants'
import { parseServerTime, relative } from '../lib/format'
import { Avatar, Field, Modal, PageHeader, useAction } from '../components/ui'
import { ColorPicker } from './Boards'

function PersonForm({ person, subteams, onClose, onSaved }) {
  const editing = !!person
  const [form, setForm] = useState({ name: person?.name || '', email: person?.email || '', role: person?.role || 'member', subteam_id: person?.subteam_id || '' })
  const run = useAction()
  const submit = async (e) => {
    e.preventDefault()
    const body = { name: form.name, role: form.role, subteam_id: form.subteam_id || null }
    const res = await run(() => (editing ? patch(`/users/${person.id}`, body) : post('/users', { ...body, email: form.email })), editing ? 'Saved.' : `${form.name} added. They can sign in with ${form.email}.`)
    if (res) onSaved()
  }
  const toggleActive = async () => {
    if (person.is_active && !window.confirm(`Remove ${person.name} from the team? They lose access on their next click. Their tasks stay assigned to them, so reassign those from the boards.`)) return
    if (await run(() => patch(`/users/${person.id}`, { is_active: !person.is_active }), person.is_active ? 'Removed.' : 'Reactivated.')) onSaved()
  }
  return (
    <Modal open onClose={onClose} title={editing ? `Edit ${person.name}` : 'Add a team member'}
      footer={<>
        {editing && <button type="button" className={`${person.is_active ? 'btn-danger' : 'btn-secondary'} mr-auto`} onClick={toggleActive}>{person.is_active ? 'Remove from team' : 'Reactivate'}</button>}
        <button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="person-form">{editing ? 'Save' : 'Add'}</button>
      </>}>
      <form id="person-form" className="space-y-4" onSubmit={submit}>
        <Field label="Name"><input className="input" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        {!editing && <Field label="Email" hint="The address they’ll sign in with. Use their school or personal email — whichever they’ll actually use."><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>}
        <Field label="Role">
          <div className="grid gap-2">
            {ROLES.map((r) => (
              <label key={r.id} className={`flex items-start gap-2 rounded-xl border p-2.5 cursor-pointer ${form.role === r.id ? 'border-accent-500 bg-accent-50' : 'border-brand-gray-200'}`}>
                <input type="radio" name="role" className="mt-1" checked={form.role === r.id} onChange={() => setForm({ ...form, role: r.id })} />
                <span><span className="text-sm font-medium block">{r.label}</span><span className="text-xs text-brand-gray-500">{r.hint}</span></span>
              </label>
            ))}
          </div>
        </Field>
        <Field label="Subteam">
          <select className="input" value={form.subteam_id} onChange={(e) => setForm({ ...form, subteam_id: e.target.value })}>
            <option value="">—</option>
            {subteams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </form>
    </Modal>
  )
}

function Subteams({ subteams, refresh }) {
  const [name, setName] = useState('')
  const run = useAction()
  const add = async (e) => {
    e.preventDefault()
    if (name.trim() && (await run(() => post('/subteams', { name: name.trim(), color: 'gray' })))) { setName(''); refresh() }
  }
  return (
    <section className="card-padded">
      <h2 className="section-title mb-3">Subteams</h2>
      <ul className="space-y-2 mb-3">
        {subteams.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <ColorDot subteam={s} refresh={refresh} />
            <input className="input py-1 flex-1" defaultValue={s.name} aria-label="Subteam name" onBlur={async (e) => e.target.value.trim() && e.target.value !== s.name && (await run(() => patch(`/subteams/${s.id}`, { name: e.target.value.trim() }))) && refresh()} />
            <button className="btn-icon" aria-label={`Delete ${s.name}`} onClick={async () => window.confirm(`Delete ${s.name}? People and boards in it become unassigned.`) && (await run(() => del(`/subteams/${s.id}`))) && refresh()}><Trash2 className="w-4 h-4" /></button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2"><input className="input" placeholder="New subteam" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn-secondary"><Plus className="w-4 h-4" /></button></form>
    </section>
  )
}

function ColorDot({ subteam, refresh }) {
  const [open, setOpen] = useState(false)
  const run = useAction()
  return (
    <div className="relative">
      <button type="button" className={`w-5 h-5 rounded ${SWATCH[subteam.color]}`} onClick={() => setOpen((o) => !o)} aria-label="Change colour" />
      {open && <div className="menu-pop absolute p-2 w-52"><ColorPicker value={subteam.color} onChange={async (color) => { setOpen(false); if (await run(() => patch(`/subteams/${subteam.id}`, { color }))) refresh() }} /></div>}
    </div>
  )
}

export default function Team() {
  const { user, subteams, subteamById, refreshTeam } = useSession()
  const [people, setPeople] = useState([])
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState(null)
  const isAdmin = atLeast(user, 'admin')

  const load = () => get(`/users${showInactive ? '?all=1' : ''}`).then((d) => setPeople(d.users))
  useEffect(() => { load() }, [showInactive]) // eslint-disable-line react-hooks/exhaustive-deps
  const saved = () => { setEditing(null); load(); refreshTeam() }

  const groups = [...subteams.map((s) => ({ key: s.id, name: s.name, color: s.color })), { key: '', name: 'No subteam', color: 'gray' }]
    .map((g) => ({ ...g, people: people.filter((p) => (p.subteam_id || '') === g.key) })).filter((g) => g.people.length)

  return (
    <div className="animate-fade-up">
      <PageHeader title="Team" subtitle={`${people.filter((p) => p.is_active).length} people on FRC Team 302.`}
        actions={isAdmin && <>
          <label className="flex items-center gap-1.5 text-sm text-brand-gray-600"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />Show removed</label>
          <button className="btn-primary" onClick={() => setEditing('new')}><UserPlus className="w-4 h-4" />Add person</button>
        </>} />
      <div className={`grid gap-6 ${isAdmin ? 'lg:grid-cols-3' : ''}`}>
        <div className={`space-y-6 ${isAdmin ? 'lg:col-span-2' : ''}`}>
          {groups.map((g) => (
            <section key={g.key} className="card">
              <header className="flex items-center gap-2 px-5 pt-4 pb-2"><span className={`w-2.5 h-2.5 rounded-sm ${SWATCH[g.color]}`} /><h2 className="section-title">{g.name}</h2><span className="text-xs text-brand-gray-500">{g.people.length}</span></header>
              <ul className="divide-y divide-brand-gray-100">
                {g.people.map((p) => (
                  <li key={p.id} className={`flex items-center gap-3 px-5 py-2.5 ${p.is_active ? '' : 'opacity-50'}`}>
                    <Avatar user={p} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{p.name}{p.id === user.id && <span className="text-brand-gray-500 font-normal"> (you)</span>}</p>
                      {p.email && <p className="text-xs text-brand-gray-500 truncate">{p.email}</p>}
                    </div>
                    <span className={p.role === 'admin' ? 'badge-black' : p.role === 'lead' ? 'badge-success' : 'badge-gray'}>{ROLE[p.role].label}</span>
                    {isAdmin && <span className="hidden sm:block text-xs text-brand-gray-500 w-28 text-right">{!p.is_active ? 'Removed' : p.has_signed_in ? `Seen ${relative(parseServerTime(p.last_seen_at)) || '—'}` : 'Never signed in'}</span>}
                    {isAdmin && <button className="btn-icon" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}><Pencil className="w-4 h-4" /></button>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {isAdmin && <div className="space-y-6"><Subteams subteams={subteams} refresh={refreshTeam} />
          <section className="card-padded text-sm text-brand-gray-600 space-y-2">
            <h2 className="section-title text-brand-black">When someone leaves</h2>
            <p>Removing a person cuts their access on their next click. It doesn’t change shared passwords they saw — open the Vault, check each entry’s access log, and rotate what they revealed.</p>
          </section>
        </div>}
      </div>
      {editing && <PersonForm person={editing === 'new' ? null : editing} subteams={subteams} subteamById={subteamById} onClose={() => setEditing(null)} onSaved={saved} />}
    </div>
  )
}
