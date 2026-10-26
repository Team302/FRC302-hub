// Column definitions, headers, the "+" add-column menu, the column editor, and per-group summaries.
import { useState } from 'react'
import { AlignLeft, ArrowLeft, ArrowRight, Calendar, CalendarRange, CheckSquare, ChevronDown, CircleDot, EyeOff, Hash, Link2, Pencil, Plus, Tags, Trash2, Users } from 'lucide-react'
import Popover from './Popover'
import Modal from '../ui/Modal'
import { AvatarGroup } from '../ui/Avatar'
import { COLORS, COLUMN_TYPES, LABEL_FILL, PRIORITIES } from '../../lib/constants'

export const TYPE_ICON = { status: CircleDot, people: Users, date: Calendar, timeline: CalendarRange, text: AlignLeft, number: Hash, checkbox: CheckSquare, dropdown: Tags, link: Link2 }
const WIDTH = { status: 140, people: 120, date: 116, timeline: 176, text: 180, number: 110, checkbox: 96, dropdown: 160, link: 160 }

export const BUILTINS = [
  { key: 'owner', title: 'Owner', type: 'people', width: 120, hideable: true },
  { key: 'reviewer', title: 'Reviewer', type: 'people', width: 120, hideable: true },
  { key: 'status', title: 'Status', type: 'status', width: 140, hideable: false },
  { key: 'priority', title: 'Priority', type: 'status', width: 116, hideable: true },
  { key: 'due', title: 'Due date', type: 'date', width: 116, hideable: true },
]

// The board's visible columns, in order: built-ins (minus hidden) then custom columns.
export function boardColumns(board, columns) {
  const hidden = board.hidden_builtins || []
  return [
    ...BUILTINS.filter((b) => !hidden.includes(b.key)).map((b) => ({ ...b, builtin: true })),
    ...columns.map((c) => ({ key: c.id, title: c.title, type: c.type, width: WIDTH[c.type] || 140, column: c })),
  ]
}

const menuItem = 'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-brand-gray-700 rounded-md hover:bg-brand-gray-100 hover:text-brand-black'

export function ColumnHeader({ col, canManage, isFirst, isLast, onEdit, onMove, onDelete, onHide }) {
  const Icon = TYPE_ICON[col.type]
  return (
    <div className="group/h h-9 flex items-center justify-center gap-1 px-2 text-xs font-medium text-brand-gray-500 relative">
      <span className="truncate">{col.title}</span>
      {canManage && (col.column || col.hideable) && (
        <Popover align="end" trigger={({ toggle, ref }) => (
          <button ref={ref} type="button" onClick={toggle} aria-label={`${col.title} column options`}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-brand-gray-400 opacity-0 group-hover/h:opacity-100 focus:opacity-100 hover:bg-brand-gray-200 hover:text-brand-black">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        )}>
          {(close) => (
            <div className="p-1 w-52">
              {col.column && (
                <>
                  <p className="px-3 py-1 text-[11px] text-brand-gray-400 flex items-center gap-1.5">{Icon && <Icon className="w-3 h-3" />}{COLUMN_TYPES.find((t) => t.id === col.type)?.label} column</p>
                  <button type="button" className={menuItem} onClick={() => { close(); onEdit(col.column) }}><Pencil className="w-3.5 h-3.5" />Edit column</button>
                  {!isFirst && <button type="button" className={menuItem} onClick={() => { close(); onMove(col.column, -1) }}><ArrowLeft className="w-3.5 h-3.5" />Move left</button>}
                  {!isLast && <button type="button" className={menuItem} onClick={() => { close(); onMove(col.column, 1) }}><ArrowRight className="w-3.5 h-3.5" />Move right</button>}
                  <div className="my-1 border-t border-brand-gray-100" />
                  <button type="button" className={`${menuItem} text-status-danger hover:text-status-danger`} onClick={() => { close(); onDelete(col.column) }}><Trash2 className="w-3.5 h-3.5" />Delete column</button>
                </>
              )}
              {col.builtin && col.hideable && <button type="button" className={menuItem} onClick={() => { close(); onHide(col.key) }}><EyeOff className="w-3.5 h-3.5" />Hide column</button>}
            </div>
          )}
        </Popover>
      )}
    </div>
  )
}

export function AddColumnButton({ onPick }) {
  return (
    <Popover align="end" width={260} trigger={({ toggle, ref }) => (
      <button ref={ref} type="button" onClick={toggle} aria-label="Add column" title="Add column" className="w-full h-9 flex items-center justify-center text-brand-gray-400 hover:text-brand-black hover:bg-brand-gray-100/70">
        <Plus className="w-4 h-4" />
      </button>
    )}>
      {(close) => (
        <div className="p-1.5">
          <p className="px-2 pt-1 pb-1.5 text-[11px] font-medium text-brand-gray-400 uppercase tracking-wider">Add column</p>
          <div className="grid grid-cols-2 gap-1">
            {COLUMN_TYPES.map((t) => {
              const Icon = TYPE_ICON[t.id]
              return (
                <button key={t.id} type="button" onClick={() => { close(); onPick(t.id) }} title={t.hint}
                  className="flex items-center gap-2 px-2 py-2 rounded-md text-sm text-brand-gray-700 hover:bg-brand-gray-100 hover:text-brand-black">
                  <Icon className="w-4 h-4 text-brand-gray-400" />{t.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </Popover>
  )
}

// Create or edit a custom column: title, plus labels (status), options (tags) or unit (numbers).
export function ColumnEditor({ type, column, onClose, onSave }) {
  const editing = !!column
  const kind = column?.type || type
  const [title, setTitle] = useState(column?.title || COLUMN_TYPES.find((t) => t.id === kind)?.label || '')
  const [labels, setLabels] = useState(column?.settings?.labels || column?.settings?.options || (kind === 'status' ? [
    { id: 'n1', label: 'To do', color: 'gray' }, { id: 'n2', label: 'In progress', color: 'amber' }, { id: 'n3', label: 'Done', color: 'green' },
  ] : []))
  const [unit, setUnit] = useState(column?.settings?.unit || '')
  const [saving, setSaving] = useState(false)
  const hasLabels = kind === 'status' || kind === 'dropdown'
  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    const settings = kind === 'status' ? { labels } : kind === 'dropdown' ? { options: labels } : kind === 'number' ? { unit } : undefined
    const clean = settings && hasLabels ? { [kind === 'status' ? 'labels' : 'options']: labels.filter((l) => l.label.trim()).map((l) => (/^n\d+$/.test(l.id) ? { label: l.label, color: l.color } : l)) } : settings
    const ok = await onSave({ title: title.trim(), ...(clean ? { settings: clean } : {}) })
    setSaving(false)
    if (ok) onClose()
  }
  const removed = editing && hasLabels ? (column.settings.labels || column.settings.options).filter((o) => !labels.some((l) => l.id === o.id)) : []
  return (
    <Modal open onClose={onClose} title={editing ? `Edit ${column.title}` : `New ${COLUMN_TYPES.find((t) => t.id === kind)?.label.toLowerCase()} column`} size="sm"
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="column-form" disabled={saving || !title.trim()}>{editing ? 'Save' : 'Add column'}</button></>}>
      <form id="column-form" onSubmit={submit} className="space-y-4">
        <label className="block"><span className="label">Column name</span><input autoFocus className="input" maxLength={40} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        {kind === 'number' && <label className="block"><span className="label">Unit</span><input className="input" maxLength={8} placeholder="h, $, lbs…" value={unit} onChange={(e) => setUnit(e.target.value)} /></label>}
        {hasLabels && (
          <div>
            <span className="label">{kind === 'status' ? 'Labels' : 'Options'}</span>
            <ul className="space-y-1.5">
              {labels.map((l, i) => (
                <li key={l.id} className="flex items-center gap-2">
                  <Popover trigger={({ toggle, ref }) => <button ref={ref} type="button" onClick={toggle} aria-label="Label colour" style={{ backgroundColor: LABEL_FILL[l.color][0] }} className="w-7 h-7 rounded-md shrink-0" />}>
                    {(close) => (
                      <div className="p-2 grid grid-cols-7 gap-1.5 w-60">
                        {COLORS.map((c) => <button key={c} type="button" aria-label={c} onClick={() => { setLabels(labels.map((x, j) => (j === i ? { ...x, color: c } : x))); close() }} style={{ backgroundColor: LABEL_FILL[c][0] }} className="w-6 h-6 rounded-md" />)}
                      </div>
                    )}
                  </Popover>
                  <input className="input py-1.5" maxLength={40} value={l.label} aria-label={`Label ${i + 1}`} onChange={(e) => setLabels(labels.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <button type="button" className="btn-icon shrink-0" aria-label="Remove label" onClick={() => setLabels(labels.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5" /></button>
                </li>
              ))}
            </ul>
            {labels.length < 40 && <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => setLabels([...labels, { id: `n${Date.now()}`, label: '', color: COLORS[(labels.length * 3 + 1) % COLORS.length] }])}><Plus className="w-3.5 h-3.5" />Add {kind === 'status' ? 'label' : 'option'}</button>}
            {removed.length > 0 && <p className="mt-2 text-xs text-amber-700">Tasks using {removed.map((r) => `“${r.label}”`).join(', ')} will be cleared.</p>}
          </div>
        )}
      </form>
    </Modal>
  )
}

// ── Group summary row (the footer under each group) ──
function Distribution({ parts, total, label }) {
  if (!total) return <span className="w-full h-5" />
  return (
    <span className="flex w-full h-5 rounded overflow-hidden" role="img" aria-label={`${label}: ${parts.filter((p) => p.count).map((p) => `${p.label} ${p.count}`).join(', ')}`}>
      {parts.filter((p) => p.count).map((p) => <span key={p.id} title={`${p.label}: ${p.count}`} style={{ width: `${(p.count / total) * 100}%`, backgroundColor: p.fill }} />)}
    </span>
  )
}

const fmtShort = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function SummaryCell({ col, items, values, statuses, users }) {
  const n = items.length
  const vals = col.column ? items.map((i) => values[i.id]?.[col.key]).filter((v) => v !== undefined && v !== null) : []
  let body = null
  if (col.key === 'status') body = <Distribution label="Status" total={n} parts={statuses.map((s) => ({ ...s, count: items.filter((i) => i.status === s.id).length }))} />
  else if (col.key === 'priority') body = <Distribution label="Priority" total={n} parts={PRIORITIES.map((p) => ({ ...p, count: items.filter((i) => i.priority === p.id).length }))} />
  else if (col.key === 'due') {
    const dates = items.map((i) => i.due_date).filter(Boolean).sort()
    body = dates.length ? <span className="text-xs text-brand-gray-500 tabular-nums">{fmtShort(dates[0])}{dates.length > 1 && dates.at(-1) !== dates[0] ? ` – ${fmtShort(dates.at(-1))}` : ''}</span> : null
  } else if (col.key === 'owner' || col.key === 'reviewer') {
    const ids = [...new Set(items.map((i) => (col.key === 'owner' ? i.assignee_id : i.reviewer_id)).filter(Boolean))]
    body = ids.length ? <AvatarGroup size="xs" max={4} people={ids.map((id) => ({ id, name: users.find((u) => u.id === id)?.name || '' }))} /> : null
  } else if (col.type === 'status') {
    body = <Distribution label={col.title} total={n} parts={[...col.column.settings.labels.map((l) => ({ id: l.id, label: l.label, fill: LABEL_FILL[l.color][0], count: vals.filter((v) => v === l.id).length })), { id: '_', label: 'Empty', fill: 'rgb(var(--brand-gray-200))', count: n - vals.length }]} />
  } else if (col.type === 'number') {
    const sum = vals.reduce((s, v) => s + v, 0)
    body = vals.length ? <span className="text-xs font-medium tabular-nums">{col.column.settings.unit === '$' ? '$' : ''}{Math.round(sum * 100) / 100}{col.column.settings.unit && col.column.settings.unit !== '$' ? ` ${col.column.settings.unit}` : ''}<span className="text-brand-gray-400 font-normal"> sum</span></span> : null
  } else if (col.type === 'checkbox') {
    body = n ? <span className="text-xs text-brand-gray-500 tabular-nums">{vals.length}/{n}</span> : null
  } else if (col.type === 'date' && vals.length) {
    const s = [...vals].sort()
    body = <span className="text-xs text-brand-gray-500">{fmtShort(s[0])}{s.length > 1 && s.at(-1) !== s[0] ? ` – ${fmtShort(s.at(-1))}` : ''}</span>
  } else if (col.type === 'timeline' && vals.length) {
    const start = vals.map((v) => v.start).sort()[0]
    const end = vals.map((v) => v.end).sort().at(-1)
    body = <span className="text-xs text-brand-gray-500">{fmtShort(start)} – {fmtShort(end)}</span>
  } else if (col.type === 'people' && vals.length) {
    const ids = [...new Set(vals.flat())]
    body = <AvatarGroup size="xs" max={4} people={ids.map((id) => ({ id, name: users.find((u) => u.id === id)?.name || '' }))} />
  }
  return <div className="h-9 flex items-center justify-center px-2">{body}</div>
}

