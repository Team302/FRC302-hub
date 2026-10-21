import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, Columns3, MessageSquare, MoreHorizontal, Plus, Search, Settings2, Table2, UserRound } from 'lucide-react'
import { del, get, patch, post } from '../lib/api'
import { useSession } from '../context/Session'
import { atLeast, BORDER, PRIORITIES, PRIORITY, STATUSES, SWATCH, TEXT } from '../lib/constants'
import { Avatar, EmptyState, Field, MenuItem, Modal, PersonPicker, Popover, Spinner, StatusPicker, useAction } from '../components/ui'
import { DueLabel } from './Home'
import { ColorPicker } from './Boards'
import ItemDrawer from '../components/ItemDrawer'

function InlineText({ value, onSave, className = '', disabled, placeholder }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  if (!editing || disabled) {
    return <button type="button" disabled={disabled} onClick={() => setEditing(true)} className={`text-left truncate rounded px-1 -mx-1 hover:ring-1 hover:ring-brand-gray-300 disabled:hover:ring-0 ${className}`}>{value || <span className="text-brand-gray-400">{placeholder}</span>}</button>
  }
  const commit = () => { setEditing(false); const v = draft.trim(); if (v && v !== value) onSave(v); else setDraft(value) }
  return <input autoFocus className={`input py-0.5 px-1 ${className}`} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
    onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }} />
}

function PriorityPicker({ value, onChange }) {
  return (
    <Popover trigger={({ toggle }) => <button type="button" onClick={toggle} className={`text-sm ${PRIORITY[value].cls} rounded px-1 hover:bg-brand-gray-100`}>{PRIORITY[value].label}</button>}>
      {(close) => PRIORITIES.map((p) => <MenuItem key={p.id} active={p.id === value} onClick={() => { onChange(p.id); close() }}><span className={p.cls}>{p.label}</span></MenuItem>)}
    </Popover>
  )
}

function DuePicker({ value, onChange, done }) {
  const ref = useRef(null)
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={() => ref.current?.showPicker?.() ?? ref.current?.focus()} className="rounded px-1 hover:bg-brand-gray-100"><DueLabel due={value} done={done} /></button>
      <input ref={ref} type="date" tabIndex={-1} aria-label="Due date" className="absolute inset-0 opacity-0 pointer-events-none" value={value || ''} onChange={(e) => onChange(e.target.value || null)} />
    </span>
  )
}

function GroupSection({ group, items, users, canManage, onUpdateItem, onAdd, onOpen, onGroupChange, onGroupDelete, dragging, setDragging }) {
  const [collapsed, setCollapsed] = useState(false)
  const [adding, setAdding] = useState('')
  const doneCount = items.filter((i) => i.status === 'done').length
  const submit = (e) => { e.preventDefault(); if (adding.trim()) { onAdd(group.id, adding.trim()); setAdding('') } }

  return (
    <section className="mb-6"
      onDragOver={(e) => { if (dragging) e.preventDefault() }}
      onDrop={(e) => { e.preventDefault(); if (dragging && dragging.group_id !== group.id) onUpdateItem(dragging, { group_id: group.id }); setDragging(null) }}>
      <div className="flex items-center gap-2 mb-2">
        <button className="btn-icon w-6 h-6" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand group' : 'Collapse group'}>
          {collapsed ? <ChevronRight className={`w-4 h-4 ${TEXT[group.color]}`} /> : <ChevronDown className={`w-4 h-4 ${TEXT[group.color]}`} />}
        </button>
        <InlineText value={group.name} disabled={!canManage} onSave={(name) => onGroupChange(group, { name })} className={`font-semibold ${TEXT[group.color]}`} />
        <span className="text-xs text-brand-gray-500">{doneCount}/{items.length}</span>
        {canManage && (
          <Popover trigger={({ toggle }) => <button className="btn-icon w-6 h-6" onClick={toggle} aria-label="Group options"><MoreHorizontal className="w-4 h-4" /></button>}>
            {(close) => (
              <div className="p-2 w-56 space-y-2">
                <ColorPicker value={group.color} onChange={(color) => { onGroupChange(group, { color }); close() }} />
                <MenuItem danger onClick={() => { close(); onGroupDelete(group) }}>Delete group</MenuItem>
              </div>
            )}
          </Popover>
        )}
      </div>
      {!collapsed && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-xs text-brand-gray-500 border-b border-brand-gray-200">
                <th className="w-1 p-0" />
                <th className="text-left font-medium px-3 py-2">Task</th>
                <th className="text-left font-medium px-3 py-2 w-44">Owner</th>
                <th className="font-medium px-3 py-2 w-36">Status</th>
                <th className="text-left font-medium px-3 py-2 w-24">Priority</th>
                <th className="text-left font-medium px-3 py-2 w-28">Due</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} draggable onDragStart={() => setDragging(item)} onDragEnd={() => setDragging(null)}
                  className={`group border-b border-brand-gray-100 hover:bg-brand-gray-50/80 ${dragging?.id === item.id ? 'opacity-40' : ''}`}>
                  <td className={`p-0 border-l-4 ${BORDER[group.color]}`} />
                  <td className="px-3 py-1.5 max-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <InlineText value={item.title} onSave={(title) => onUpdateItem(item, { title })} className={`flex-1 min-w-0 ${item.status === 'done' ? 'text-brand-gray-400 line-through' : ''}`} />
                      <button onClick={() => onOpen(item.id)} className="btn-ghost btn-sm opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0">Open</button>
                    </div>
                  </td>
                  <td className="px-3 py-1.5"><PersonPicker value={item.assignee_id} users={users} onChange={(assignee_id) => onUpdateItem(item, { assignee_id })} /></td>
                  <td className="px-2 py-1"><StatusPicker value={item.status} onChange={(status) => onUpdateItem(item, { status })} /></td>
                  <td className="px-3 py-1.5"><PriorityPicker value={item.priority} onChange={(priority) => onUpdateItem(item, { priority })} /></td>
                  <td className="px-3 py-1.5"><DuePicker value={item.due_date} done={item.status === 'done'} onChange={(due_date) => onUpdateItem(item, { due_date })} /></td>
                  <td className="px-2 py-1.5 text-center">
                    <button onClick={() => onOpen(item.id)} className={`inline-flex items-center gap-1 text-xs ${item.update_count ? 'text-accent-600' : 'text-brand-gray-300 hover:text-brand-gray-500'}`} aria-label={`${item.update_count} updates`}>
                      <MessageSquare className="w-4 h-4" />{item.update_count || ''}
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td className={`p-0 border-l-4 ${BORDER[group.color]} opacity-40`} />
                <td colSpan={6} className="px-3 py-1.5">
                  <form onSubmit={submit} className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-brand-gray-400" />
                    <input className="flex-1 bg-transparent outline-none text-sm placeholder:text-brand-gray-400 py-1" placeholder="Add task" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label={`Add task to ${group.name}`} />
                  </form>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Kanban({ items, users, onUpdateItem, onOpen, groupsById }) {
  const [dragging, setDragging] = useState(null)
  const [over, setOver] = useState(null)
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STATUSES.map((s) => {
        const col = items.filter((i) => i.status === s.id)
        return (
          <div key={s.id} className={`w-72 shrink-0 rounded-card p-2 transition-colors ${over === s.id ? 'bg-brand-gray-100' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(s.id) }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); if (dragging && dragging.status !== s.id) onUpdateItem(dragging, { status: s.id }); setDragging(null) }}>
            <div className="flex items-center gap-2 px-1 mb-2"><span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} /><span className="text-sm font-medium">{s.label}</span><span className="text-xs text-brand-gray-500">{col.length}</span></div>
            <div className="space-y-2 min-h-[4rem]">
              {col.map((item) => (
                <div key={item.id} draggable onDragStart={() => setDragging(item)} onDragEnd={() => setDragging(null)}
                  className={`card p-3 cursor-grab active:cursor-grabbing ${dragging?.id === item.id ? 'opacity-40' : ''}`}>
                  <button className="text-left text-sm font-medium hover:text-accent-700 w-full" onClick={() => onOpen(item.id)}>{item.title}</button>
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <span className="text-xs text-brand-gray-500 truncate">{groupsById[item.group_id]?.name}</span>
                    <div className="flex items-center gap-2">
                      <DueLabel due={item.due_date} done={item.status === 'done'} />
                      <Avatar user={users.find((u) => u.id === item.assignee_id)} name={item.assignee_name} size={22} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Board() {
  const { id } = useParams()
  const { user, users, subteams } = useSession()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [view, setView] = useState(() => { try { return localStorage.getItem('hub302.boardView') || 'table' } catch { return 'table' } })
  const [q, setQ] = useState('')
  const [person, setPerson] = useState('')
  const [hideDone, setHideDone] = useState(false)
  const [dragging, setDragging] = useState(null)
  const [settings, setSettings] = useState(false)
  const run = useAction()
  const openItemId = params.get('item')
  const canManage = atLeast(user, 'lead')

  const load = useCallback(() => get(`/boards/${id}`).then(setData).catch((e) => e.status === 404 && setNotFound(true)), [id])
  useEffect(() => { load() }, [load])
  useEffect(() => { try { localStorage.setItem('hub302.boardView', view) } catch { /* ignore */ } }, [view])

  const updateItem = useCallback(async (item, fields) => {
    setData((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, ...fields } : i)) }))
    const res = await run(() => patch(`/items/${item.id}`, fields))
    setData((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? (res ? res.item : item) : i)) }))
  }, [run])

  const addItem = async (group_id, title) => {
    const res = await run(() => post('/items', { board_id: id, group_id, title }))
    if (res) setData((d) => ({ ...d, items: [...d.items, res.item] }))
  }

  const changeGroup = async (group, fields) => {
    const res = await run(() => patch(`/groups/${group.id}`, fields))
    if (res) setData((d) => ({ ...d, groups: d.groups.map((g) => (g.id === group.id ? res.group : g)) }))
  }
  const deleteGroup = async (group) => {
    if (!window.confirm(`Delete the group “${group.name}”?`)) return
    const res = await run(() => del(`/groups/${group.id}`), 'Group deleted.')
    if (res) setData((d) => ({ ...d, groups: d.groups.filter((g) => g.id !== group.id) }))
  }
  const addGroup = async () => {
    const res = await run(() => post(`/boards/${id}/groups`, { name: 'New group', color: 'gray' }))
    if (res) setData((d) => ({ ...d, groups: [...d.groups, res.group] }))
  }

  const filtered = useMemo(() => {
    if (!data) return []
    const needle = q.trim().toLowerCase()
    return data.items.filter((i) => (!needle || i.title.toLowerCase().includes(needle))
      && (!person || (person === 'none' ? !i.assignee_id : i.assignee_id === person))
      && (!hideDone || i.status !== 'done'))
  }, [data, q, person, hideDone])

  if (notFound) return <EmptyState title="Board not found" body="It may have been deleted." action={<Link to="/boards" className="btn-secondary">Back to boards</Link>} />
  if (!data) return <Spinner />
  const groupsById = Object.fromEntries(data.groups.map((g) => [g.id, g]))

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <Link to="/boards" className="text-xs text-brand-gray-500 hover:text-brand-black">Boards /</Link>
          <div className="flex items-center gap-2.5">
            <span className={`w-3 h-3 rounded ${SWATCH[data.board.color]}`} />
            <h1 className="page-title truncate">{data.board.name}</h1>
            {data.board.is_archived ? <span className="badge-gray">Archived</span> : null}
          </div>
          {data.board.description && <p className="page-subtitle">{data.board.description}</p>}
        </div>
        {canManage && <button className="btn-secondary btn-sm" onClick={() => setSettings(true)}><Settings2 className="w-4 h-4" />Board settings</button>}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="inline-flex rounded-control border border-brand-gray-200 p-0.5 glass">
          {[['table', Table2, 'Table'], ['kanban', Columns3, 'Kanban']].map(([v, Icon, label]) => (
            <button key={v} onClick={() => setView(v)} className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded-lg ${view === v ? 'bg-brand-black text-white' : 'text-brand-gray-600 hover:text-brand-black'}`} aria-pressed={view === v}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-gray-400" />
          <input className="input pl-8 py-1.5 w-48" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks" />
        </div>
        <button className={`btn-sm ${person === user.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPerson((p) => (p === user.id ? '' : user.id))}><UserRound className="w-4 h-4" />Mine</button>
        <select className="input py-1.5 w-auto" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Filter by person">
          <option value="">Everyone</option>
          <option value="none">Unassigned</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-brand-gray-600 ml-1"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />Hide done</label>
      </div>

      {view === 'table' ? (
        <>
          {data.groups.map((g) => (
            <GroupSection key={g.id} group={g} items={filtered.filter((i) => i.group_id === g.id)} users={users} canManage={canManage}
              onUpdateItem={updateItem} onAdd={addItem} onOpen={(itemId) => setParams({ item: itemId })}
              onGroupChange={changeGroup} onGroupDelete={deleteGroup} dragging={dragging} setDragging={setDragging} />
          ))}
          {canManage && <button className="btn-ghost btn-sm" onClick={addGroup}><Plus className="w-4 h-4" />Add group</button>}
        </>
      ) : (
        <Kanban items={filtered} users={users} onUpdateItem={updateItem} onOpen={(itemId) => setParams({ item: itemId })} groupsById={groupsById} />
      )}

      {openItemId && (
        <ItemDrawer itemId={openItemId} groups={data.groups} onClose={() => setParams({})}
          onChanged={(item) => setData((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? item : i)) }))}
          onDeleted={(itemId) => { setData((d) => ({ ...d, items: d.items.filter((i) => i.id !== itemId) })); setParams({}) }} />
      )}

      <BoardSettings open={settings} onClose={() => setSettings(false)} board={data.board} subteams={subteams} user={user}
        onSaved={(board) => setData((d) => ({ ...d, board }))} onDeleted={() => navigate('/boards')} />
    </div>
  )
}

function BoardSettings({ open, onClose, board, subteams, user, onSaved, onDeleted }) {
  const [form, setForm] = useState(board)
  const run = useAction()
  useEffect(() => setForm(board), [board, open])
  const save = async (fields) => {
    const res = await run(() => patch(`/boards/${board.id}`, fields), 'Board saved.')
    if (res) { onSaved(res.board); onClose() }
  }
  const remove = async () => {
    if (window.prompt(`This deletes every task on “${board.name}”. Type the board name to confirm.`) !== board.name) return
    if (await run(() => del(`/boards/${board.id}`), 'Board deleted.')) onDeleted()
  }
  return (
    <Modal open={open} onClose={onClose} title="Board settings"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => save({ name: form.name, description: form.description, subteam_id: form.subteam_id || null, color: form.color })}>Save</button></>}>
      <div className="space-y-4">
        <Field label="Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Description"><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Subteam">
          <select className="input" value={form.subteam_id || ''} onChange={(e) => setForm({ ...form, subteam_id: e.target.value })}>
            <option value="">Whole team</option>
            {subteams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Colour"><ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} /></Field>
        <div className="divider" />
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary btn-sm" onClick={() => save({ is_archived: !board.is_archived })}>{board.is_archived ? 'Unarchive board' : 'Archive board'}</button>
          {atLeast(user, 'admin') && <button className="btn-danger btn-sm" onClick={remove}>Delete board</button>}
        </div>
      </div>
    </Modal>
  )
}
