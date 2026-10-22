// Board controls: the toolbar filters (person, filter, sort), the bulk-action bar, board settings
// and automations.
import { useEffect, useState } from 'react'
import { ArrowDownUp, Copy, Filter, FolderInput, Plus, Trash2, UserRound, X, Zap } from 'lucide-react'
import Popover from './Popover'
import { Fill } from './cells'
import Avatar from '../ui/Avatar'
import Modal from '../ui/Modal'
import { del, get, patch, post } from '../../lib/api'
import { PRIORITIES, STATUSES } from '../../lib/constants'

const pill = (on) => `btn-sm ${on ? 'btn-secondary ring-1 ring-accent-500/60 text-accent-700' : 'btn-ghost'}`

export function PersonFilter({ users, value, onChange, me }) {
  const current = users.find((u) => u.id === value)
  return (
    <Popover trigger={({ toggle, ref }) => (
      <button ref={ref} type="button" onClick={toggle} className={pill(!!value)}>
        <UserRound className="w-4 h-4" />{value === me ? 'Me' : value === 'none' ? 'Unassigned' : current?.name || 'Person'}
        {value && <X className="w-3.5 h-3.5 -mr-1" onClick={(e) => { e.stopPropagation(); onChange('') }} aria-label="Clear person filter" />}
      </button>
    )}>
      {(close) => (
        <div className="p-1 w-60 max-h-80 overflow-y-auto">
          {[{ id: me, name: 'Me' }, { id: 'none', name: 'Unassigned' }, ...users.filter((u) => u.id !== me)].map((u) => (
            <button key={u.id} type="button" onClick={() => { onChange(u.id); close() }} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-brand-gray-100 ${value === u.id ? 'font-medium' : ''}`}>
              {u.id === 'none' ? <span className="w-5 h-5 rounded-full border border-dashed border-brand-gray-300" /> : <Avatar name={u.id === me ? users.find((x) => x.id === me)?.name : u.name} seed={u.id} size="xs" />}{u.name}
            </button>
          ))}
        </div>
      )}
    </Popover>
  )
}

export const EMPTY_FILTER = { statuses: [], priorities: [], due: '', hideDone: false }
export const filterCount = (f) => f.statuses.length + f.priorities.length + (f.due ? 1 : 0) + (f.hideDone ? 1 : 0)

export function FilterMenu({ value, onChange, statuses }) {
  const n = filterCount(value)
  const toggle = (key, id) => onChange({ ...value, [key]: value[key].includes(id) ? value[key].filter((x) => x !== id) : [...value[key], id] })
  return (
    <Popover width={320} trigger={({ toggle: t, ref }) => <button ref={ref} type="button" onClick={t} className={pill(n > 0)}><Filter className="w-4 h-4" />Filter{n ? ` · ${n}` : ''}</button>}>
      {() => (
        <div className="p-3 space-y-4">
          <div>
            <p className="label">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {statuses.map((s) => (
                <button key={s.id} type="button" onClick={() => toggle('statuses', s.id)} aria-pressed={value.statuses.includes(s.id)}
                  className={`h-7 px-2 rounded-md text-xs font-medium ${value.statuses.includes(s.id) ? 'ring-2 ring-offset-1 ring-brand-black/50' : 'opacity-80'}`} style={{ backgroundColor: s.fill, color: s.ink }}>{s.label}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="label">Priority</p>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITIES.map((p) => (
                <button key={p.id} type="button" onClick={() => toggle('priorities', p.id)} aria-pressed={value.priorities.includes(p.id)}
                  className={`h-7 px-2 rounded-md text-xs font-medium ${value.priorities.includes(p.id) ? 'ring-2 ring-offset-1 ring-brand-black/50' : 'opacity-80'}`} style={{ backgroundColor: p.fill, color: p.ink }}>{p.label}</button>
              ))}
            </div>
          </div>
          <label className="block"><span className="label">Due date</span>
            <select className="input py-1.5" value={value.due} onChange={(e) => onChange({ ...value, due: e.target.value })}>
              <option value="">Any time</option><option value="overdue">Overdue</option><option value="week">Due in the next 7 days</option><option value="none">No due date</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.hideDone} onChange={(e) => onChange({ ...value, hideDone: e.target.checked })} />Hide done tasks</label>
          {n > 0 && <button type="button" className="btn-ghost btn-sm w-full" onClick={() => onChange(EMPTY_FILTER)}>Clear filters</button>}
        </div>
      )}
    </Popover>
  )
}

export function SortMenu({ value, onChange, cols }) {
  const sortable = [{ key: 'title', title: 'Name' }, ...cols.filter((c) => ['status', 'owner', 'priority', 'due'].includes(c.key) || ['date', 'number', 'text', 'timeline', 'status', 'checkbox'].includes(c.type))]
  const current = sortable.find((c) => c.key === value?.key)
  return (
    <Popover width={260} trigger={({ toggle, ref }) => <button ref={ref} type="button" onClick={toggle} className={pill(!!value)}><ArrowDownUp className="w-4 h-4" />{current ? `Sort: ${current.title}` : 'Sort'}</button>}>
      {(close) => (
        <div className="p-3 space-y-3">
          <label className="block"><span className="label">Sort by</span>
            <select className="input py-1.5" value={value?.key || ''} onChange={(e) => onChange(e.target.value ? { key: e.target.value, dir: value?.dir || 'asc' } : null)}>
              <option value="">Manual order</option>
              {sortable.map((c) => <option key={c.key} value={c.key}>{c.title}</option>)}
            </select>
          </label>
          {value && (
            <div className="flex gap-1.5">
              {[['asc', 'Ascending'], ['desc', 'Descending']].map(([d, l]) => <button key={d} type="button" className={`btn-sm flex-1 ${value.dir === d ? 'btn-primary' : 'btn-secondary'}`} onClick={() => onChange({ ...value, dir: d })}>{l}</button>)}
            </div>
          )}
          <p className="text-xs text-brand-gray-500">{value ? 'Dragging rows is off while sorted.' : 'Drag rows to set the order.'}</p>
          {value && <button type="button" className="btn-ghost btn-sm w-full" onClick={() => { onChange(null); close() }}>Back to manual order</button>}
        </div>
      )}
    </Popover>
  )
}

// Sort comparator for a column key over items + values.
export function sortItems(items, sort, values, statuses) {
  if (!sort) return items
  const rank = { status: Object.fromEntries(statuses.map((s, i) => [s.id, i])), priority: { critical: 0, high: 1, medium: 2, low: 3 } }
  const key = (i) => {
    switch (sort.key) {
      case 'title': return i.title.toLowerCase()
      case 'status': return rank.status[i.status]
      case 'priority': return rank.priority[i.priority]
      case 'due': return i.due_date
      case 'owner': return i.assignee_name || null
      default: {
        const v = values[i.id]?.[sort.key]
        if (v && typeof v === 'object' && 'start' in v) return v.start
        return v ?? null
      }
    }
  }
  const dir = sort.dir === 'desc' ? -1 : 1
  return [...items].sort((a, b) => {
    const ka = key(a); const kb = key(b)
    if (ka === kb) return a.position - b.position
    if (ka === null || ka === undefined) return 1 // empties last either way
    if (kb === null || kb === undefined) return -1
    return (ka < kb ? -1 : 1) * dir
  })
}

// Bottom bar that appears with a selection, Monday-style.
export function BulkBar({ count, groups, statuses, users, onStatus, onOwner, onMove, onDuplicate, onDelete, onClear }) {
  const btn = 'flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-brand-gray-600 hover:bg-brand-gray-100 hover:text-brand-black'
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 glass-strong border rounded-2xl shadow-pop flex items-center gap-1 pl-1 pr-2 py-1.5 animate-fade-up" role="toolbar" aria-label="Selected tasks">
      <span className="flex items-center gap-2 px-3 border-r border-brand-gray-200 mr-1">
        <span className="w-7 h-7 rounded-lg bg-accent-600 text-white text-sm font-semibold flex items-center justify-center">{count}</span>
        <span className="text-sm font-medium">{count === 1 ? 'Task' : 'Tasks'} selected</span>
      </span>
      <Popover align="center" trigger={({ toggle, ref }) => <button ref={ref} type="button" onClick={toggle} className={btn}><span className="w-4 h-4 rounded bg-[#037f4c]" />Status</button>}>
        {(close) => <div className="p-2 grid gap-1.5 w-48">{statuses.map((s) => <button key={s.id} type="button" className="h-8 rounded-md overflow-hidden" onClick={() => { onStatus(s.id); close() }}><Fill fill={s.fill} ink={s.ink}>{s.label}</Fill></button>)}</div>}
      </Popover>
      <Popover align="center" trigger={({ toggle, ref }) => <button ref={ref} type="button" onClick={toggle} className={btn}><UserRound className="w-4 h-4" />Owner</button>}>
        {(close) => (
          <div className="p-1 w-56 max-h-72 overflow-y-auto">
            <button type="button" className="w-full text-left px-2 py-1.5 rounded-md text-sm text-brand-gray-500 hover:bg-brand-gray-100" onClick={() => { onOwner(null); close() }}>Remove owner</button>
            {users.map((u) => <button key={u.id} type="button" onClick={() => { onOwner(u.id); close() }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-brand-gray-100"><Avatar name={u.name} seed={u.id} size="xs" />{u.name}</button>)}
          </div>
        )}
      </Popover>
      <Popover align="center" trigger={({ toggle, ref }) => <button ref={ref} type="button" onClick={toggle} className={btn}><FolderInput className="w-4 h-4" />Move to</button>}>
        {(close) => <div className="p-1 w-52">{groups.map((g) => <button key={g.id} type="button" onClick={() => { onMove(g.id); close() }} className="w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-brand-gray-100">{g.name}</button>)}</div>}
      </Popover>
      <button type="button" className={btn} onClick={onDuplicate}><Copy className="w-4 h-4" />Duplicate</button>
      <button type="button" className={`${btn} hover:text-status-danger`} onClick={onDelete}><Trash2 className="w-4 h-4" />Delete</button>
      <button type="button" className="btn-icon ml-1" onClick={onClear} aria-label="Clear selection"><X className="w-4 h-4" /></button>
    </div>
  )
}

export function BoardSettings({ board, onClose, onSave, onArchive, onDelete, canDelete }) {
  const [form, setForm] = useState({ name: board.name, description: board.description, labels: Object.fromEntries(STATUSES.map((s) => [s.id, board.status_labels?.[s.id]?.label || ''])), hidden: board.hidden_builtins || [] })
  const save = async () => {
    const status_labels = Object.fromEntries(Object.entries(form.labels).filter(([, v]) => v.trim()).map(([k, v]) => [k, { label: v.trim() }]))
    if (await onSave({ name: form.name.trim(), description: form.description, status_labels, hidden_builtins: form.hidden })) onClose()
  }
  return (
    <Modal open onClose={onClose} title="Board settings" size="md"
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" onClick={save} disabled={!form.name.trim()}>Save</button></>}>
      <div className="space-y-5">
        <label className="block"><span className="label">Board name</span><input className="input" maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="block"><span className="label">Description</span><textarea className="input" rows={2} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <div>
          <span className="label">Status labels</span>
          <p className="text-xs text-brand-gray-500 mb-2">Rename them for this board. The colours and meaning stay the same: the green one marks a task complete.</p>
          <div className="grid grid-cols-2 gap-2">
            {STATUSES.map((s) => (
              <label key={s.id} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.fill }} />
                <input className="input py-1.5" maxLength={30} placeholder={s.label} value={form.labels[s.id]} onChange={(e) => setForm({ ...form, labels: { ...form.labels, [s.id]: e.target.value } })} aria-label={`${s.label} label`} />
              </label>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Built-in columns</span>
          <div className="flex flex-wrap gap-4">
            {[['owner', 'Owner'], ['priority', 'Priority'], ['due', 'Due date']].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!form.hidden.includes(k)} onChange={(e) => setForm({ ...form, hidden: e.target.checked ? form.hidden.filter((h) => h !== k) : [...form.hidden, k] })} />{l}</label>
            ))}
          </div>
        </div>
        <div className="pt-4 border-t border-brand-gray-200 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={onArchive}>{board.is_archived ? 'Restore board' : 'Archive board'}</button>
          {canDelete && <button type="button" className="btn-danger btn-sm" onClick={onDelete}>Delete board</button>}
        </div>
      </div>
    </Modal>
  )
}

// ── Automations: "When … then …" recipes ──
const ACTION_LABEL = { move_to_group: 'move it to', notify: 'notify', assign: 'assign it to', set_status: 'set status to' }

function describe(rule, statuses, groups, users) {
  const s = (id) => statuses.find((x) => x.id === id)?.label || id
  const when = rule.trigger.type === 'status_to' ? <>When status changes to <b>{s(rule.trigger.status)}</b></> : <>When a task is created</>
  const a = rule.action
  const what = a.type === 'move_to_group' ? groups.find((g) => g.id === a.group_id)?.name || 'a deleted group'
    : a.type === 'set_status' ? s(a.status)
      : a.type === 'assign' ? users.find((u) => u.id === a.user_id)?.name || 'a former member'
        : (a.user_ids || []).map((id) => users.find((u) => u.id === id)?.name || 'a former member').join(', ')
  return <>{when}, {ACTION_LABEL[a.type]} <b>{what}</b></>
}

export function AutomationsModal({ boardId, statuses, groups, users, canManage, onClose, onChanged }) {
  const [rules, setRules] = useState(null)
  const [form, setForm] = useState({ trigger: 'status_to', status: 'done', action: 'move_to_group', group_id: groups.at(-1)?.id || '', set_status: 'review', user_ids: [] })
  const [error, setError] = useState('')
  const load = () => get(`/boards/${boardId}/automations`).then((d) => setRules(d.automations))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e) => {
    e.preventDefault()
    setError('')
    const action = form.action === 'move_to_group' ? { type: 'move_to_group', group_id: form.group_id }
      : form.action === 'set_status' ? { type: 'set_status', status: form.set_status }
        : form.action === 'assign' ? { type: 'assign', user_id: form.user_ids[0] }
          : { type: 'notify', user_ids: form.user_ids }
    try {
      await post(`/boards/${boardId}/automations`, { trigger: form.trigger === 'status_to' ? { type: 'status_to', status: form.status } : { type: 'item_created' }, action })
      await load()
      onChanged()
    } catch (err) { setError(err.message) }
  }
  return (
    <Modal open onClose={onClose} title="Automations" size="lg" description="Rules that run on their own when tasks change. They act as the person whose change triggered them.">
      <div className="space-y-5">
        {!rules ? <div className="skeleton h-12 rounded-xl" /> : rules.length === 0 ? <p className="text-sm text-brand-gray-500">No automations on this board yet.</p> : (
          <ul className="card divide-y divide-brand-gray-100">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <Zap className={`w-4 h-4 shrink-0 ${r.is_active ? 'text-accent-600' : 'text-brand-gray-300'}`} />
                <p className={`flex-1 text-sm ${r.is_active ? '' : 'text-brand-gray-400'}`}>{describe(r, statuses, groups, users)}</p>
                {canManage && (
                  <>
                    <label className="flex items-center gap-1.5 text-xs text-brand-gray-500"><input type="checkbox" checked={r.is_active} onChange={async (e) => { await patch(`/automations/${r.id}`, { is_active: e.target.checked }); load(); onChanged() }} />On</label>
                    <button type="button" className="btn-icon" aria-label="Delete automation" onClick={async () => { await del(`/automations/${r.id}`); load(); onChanged() }}><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <form onSubmit={add} className="card p-4 space-y-3">
            <p className="text-sm font-medium">New automation</p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>When</span>
              <select className="input py-1.5 w-auto" value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })} aria-label="Trigger">
                <option value="status_to">status changes to</option><option value="item_created">a task is created</option>
              </select>
              {form.trigger === 'status_to' && (
                <select className="input py-1.5 w-auto" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} aria-label="Status">
                  {statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              )}
              <span>then</span>
              <select className="input py-1.5 w-auto" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value, user_ids: [] })} aria-label="Action">
                {form.trigger === 'status_to' && <option value="move_to_group">move it to group</option>}
                <option value="notify">notify</option>
                <option value="assign">assign it to</option>
                {form.trigger === 'status_to' && <option value="set_status">set status to</option>}
              </select>
              {form.action === 'move_to_group' && (
                <select className="input py-1.5 w-auto" value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })} aria-label="Group">
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
              {form.action === 'set_status' && (
                <select className="input py-1.5 w-auto" value={form.set_status} onChange={(e) => setForm({ ...form, set_status: e.target.value })} aria-label="New status">
                  {statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              )}
              {(form.action === 'notify' || form.action === 'assign') && (
                <select className="input py-1.5 w-auto" multiple={form.action === 'notify'} size={form.action === 'notify' ? 4 : undefined}
                  value={form.action === 'notify' ? form.user_ids : form.user_ids[0] || ''} aria-label="People"
                  onChange={(e) => setForm({ ...form, user_ids: form.action === 'notify' ? [...e.target.selectedOptions].map((o) => o.value) : [e.target.value] })}>
                  {form.action === 'assign' && <option value="">Choose…</option>}
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              )}
            </div>
            {error && <p className="text-sm text-status-danger">{error}</p>}
            <div className="flex justify-end"><button className="btn-primary btn-sm"><Plus className="w-4 h-4" />Add automation</button></div>
          </form>
        ) : <p className="text-xs text-brand-gray-500">Leads and mentors can add automations.</p>}
      </div>
    </Modal>
  )
}
