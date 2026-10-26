// Board cells: one editor per column type, Monday-style (click the cell, edit in place).
// Every cell is a fixed-height block so rows line up; colour cells fill the whole block.
import { useEffect, useRef, useState } from 'react'
import { Check, ExternalLink, Link2, Plus, X } from 'lucide-react'
import Avatar, { AvatarGroup } from '../ui/Avatar'
import Popover from './Popover'
import { LABEL_FILL, PRIORITIES, PRIORITY, STATUS } from '../../lib/constants'
import { dueInfo } from '../../lib/format'

const CELL = 'h-9 w-full flex items-center px-2 text-sm'
const cellButton = `${CELL} hover:bg-brand-gray-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/50 disabled:hover:bg-transparent disabled:cursor-default`

export function Fill({ fill, ink, children, className = '' }) {
  return <span style={{ backgroundColor: fill, color: ink }} className={`w-full h-full flex items-center justify-center px-2 text-[13px] font-medium truncate ${className}`}>{children}</span>
}

export function StatusPill({ status, statuses, small }) {
  const s = (statuses && statuses.find((x) => x.id === status)) || STATUS[status] || STATUS.not_started
  return <span style={{ backgroundColor: s.fill, color: s.ink }} className={`inline-flex items-center rounded-full font-medium whitespace-nowrap ${small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs'}`}>{s.label}</span>
}

// A list of colour blocks to choose from (status, priority, custom status labels).
function LabelPicker({ options, value, onPick, onClear }) {
  return (
    <div className="p-2 grid gap-1.5 w-48">
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onPick(o.id)} style={{ backgroundColor: o.fill, color: o.ink }}
          className={`h-8 rounded-md text-[13px] font-medium px-2 truncate transition-[filter] hover:brightness-110 ${o.id === value ? 'ring-2 ring-offset-2 ring-offset-white ring-brand-black/50' : ''}`}>
          {o.label || ' '}
        </button>
      ))}
      {onClear && <button type="button" onClick={onClear} className="h-8 rounded-md text-xs text-brand-gray-500 border border-dashed border-brand-gray-300 hover:text-brand-black">Clear</button>}
    </div>
  )
}

export function StatusCell({ value, statuses, onChange, readOnly }) {
  const s = statuses.find((x) => x.id === value) || statuses[0]
  return (
    <Popover trigger={({ toggle, ref }) => (
      <button ref={ref} type="button" disabled={readOnly} onClick={toggle} className={`${CELL} p-0`} aria-label={`Status: ${s.label}`}>
        <Fill fill={s.fill} ink={s.ink} className="hover:brightness-105">{s.label}</Fill>
      </button>
    )}>
      {(close) => <LabelPicker options={statuses} value={value} onPick={(v) => { onChange(v); close() }} />}
    </Popover>
  )
}

export function PriorityCell({ value, onChange, readOnly }) {
  const p = PRIORITY[value] || PRIORITY.medium
  return (
    <Popover trigger={({ toggle, ref }) => (
      <button ref={ref} type="button" disabled={readOnly} onClick={toggle} className={`${CELL} p-0`} aria-label={`Priority: ${p.label}`}>
        <Fill fill={p.fill} ink={p.ink}>{p.label}</Fill>
      </button>
    )}>
      {(close) => <LabelPicker options={PRIORITIES} value={value} onPick={(v) => { onChange(v); close() }} />}
    </Popover>
  )
}

export function LabelCell({ column, value, onChange, readOnly }) {
  const labels = column.settings.labels.map((l) => ({ ...l, fill: LABEL_FILL[l.color][0], ink: LABEL_FILL[l.color][1] }))
  const current = labels.find((l) => l.id === value)
  return (
    <Popover trigger={({ toggle, ref }) => (
      <button ref={ref} type="button" disabled={readOnly} onClick={toggle} className={`${CELL} p-0`} aria-label={`${column.title}: ${current?.label || 'empty'}`}>
        {current ? <Fill fill={current.fill} ink={current.ink}>{current.label}</Fill> : <span className="w-full h-full hover:bg-brand-gray-100/70" />}
      </button>
    )}>
      {(close) => <LabelPicker options={labels} value={value} onPick={(v) => { onChange(v); close() }} onClear={current ? () => { onChange(null); close() } : null} />}
    </Popover>
  )
}

function PeopleList({ users, selected, onToggle, multi, label = 'Owner' }) {
  const [q, setQ] = useState('')
  const shown = users.filter((u) => u.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="w-60">
      <div className="px-2 pt-1 pb-1.5"><input autoFocus className="input py-1.5" placeholder="Search names" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search names" /></div>
      <div className="max-h-64 overflow-y-auto pb-1">
        {shown.map((u) => {
          const on = selected.includes(u.id)
          return (
            <button key={u.id} type="button" onClick={() => onToggle(u.id)} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-brand-gray-100">
              <Avatar name={u.name} seed={u.id} size="xs" />
              <span className="flex-1 truncate">{u.name}</span>
              {on && <Check className="w-3.5 h-3.5 text-accent-600" />}
            </button>
          )
        })}
        {shown.length === 0 && <p className="px-3 py-2 text-xs text-brand-gray-500">No one matches.</p>}
        {!multi && selected.length > 0 && <button type="button" onClick={() => onToggle(null)} className="w-full px-3 py-1.5 text-left text-xs text-brand-gray-500 hover:bg-brand-gray-100">Remove {label.toLowerCase()}</button>}
      </div>
    </div>
  )
}

// Single owner (built-in) or several people (custom column).
export function PeopleCell({ value, users, onChange, readOnly, multi = false, label = 'Owner' }) {
  const ids = multi ? (value || []) : (value ? [value] : [])
  const people = ids.map((id) => users.find((u) => u.id === id)).filter(Boolean)
  return (
    <Popover trigger={({ toggle, ref }) => (
      <button ref={ref} type="button" disabled={readOnly} onClick={toggle} className={`${cellButton} justify-center group`} aria-label={`${label}: ${people.map((p) => p.name).join(', ') || 'nobody'}`}>
        {people.length === 0 ? (
          <span className="w-6 h-6 rounded-full border border-dashed border-brand-gray-300 flex items-center justify-center text-brand-gray-300 group-hover:text-brand-gray-500"><Plus className="w-3 h-3" /></span>
        ) : people.length === 1 && !multi ? (
          <span className="flex items-center gap-1.5 min-w-0"><Avatar name={people[0].name} seed={people[0].id} size="sm" /><span className="truncate text-brand-gray-700 hidden xl:inline">{people[0].name.split(' ')[0]}</span></span>
        ) : (
          <AvatarGroup people={people.map((p) => ({ id: p.id, name: p.name }))} max={3} />
        )}
      </button>
    )}>
      {(close) => (
        <PeopleList users={users} multi={multi} label={label} selected={ids} onToggle={(id) => {
          if (!multi) { onChange(id === ids[0] ? null : id); close(); return }
          const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
          onChange(next.length ? next : null)
        }} />
      )}
    </Popover>
  )
}

export function DateCell({ value, onChange, readOnly, done, due = false, label = 'Date' }) {
  const ref = useRef(null)
  const info = dueInfo(value, done)
  const tone = !due || !info ? 'text-brand-gray-700' : { overdue: 'text-status-danger font-medium', soon: 'text-amber-700 font-medium', muted: 'text-brand-gray-400 line-through', normal: 'text-brand-gray-700' }[info.tone]
  return (
    <span className="relative block group">
      <button type="button" disabled={readOnly} onClick={() => { try { ref.current?.showPicker() } catch { ref.current?.focus() } }} className={`${cellButton} justify-center ${tone}`} aria-label={`${label}: ${value || 'none'}`}>
        {info ? info.label : ''}
      </button>
      {value && !readOnly && (
        <button type="button" onClick={() => onChange(null)} aria-label={`Clear ${label}`} className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex w-5 h-5 items-center justify-center rounded text-brand-gray-400 hover:text-brand-black hover:bg-brand-gray-200"><X className="w-3 h-3" /></button>
      )}
      <input ref={ref} type="date" tabIndex={-1} aria-hidden="true" className="absolute inset-0 opacity-0 pointer-events-none" value={value || ''} onChange={(e) => onChange(e.target.value || null)} />
    </span>
  )
}

const shortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function TimelineCell({ value, onChange, readOnly, title }) {
  const [draft, setDraft] = useState(value || { start: '', end: '' })
  useEffect(() => setDraft(value || { start: '', end: '' }), [value])
  const pct = value ? Math.max(0, Math.min(100, ((Date.now() - Date.parse(`${value.start}T00:00:00`)) / (Date.parse(`${value.end}T23:59:59`) - Date.parse(`${value.start}T00:00:00`))) * 100)) : 0
  return (
    <Popover width={260} trigger={({ toggle, ref }) => (
      <button ref={ref} type="button" disabled={readOnly} onClick={toggle} className={`${cellButton} justify-center`} aria-label={`${title}: ${value ? `${value.start} to ${value.end}` : 'none'}`}>
        {value ? (
          <span className="relative w-full max-w-[150px] h-6 rounded-full overflow-hidden bg-brand-gray-200 text-[12px] font-medium flex items-center justify-center">
            <span className="absolute inset-y-0 left-0 bg-accent-500" style={{ width: `${pct}%` }} />
            <span className={`relative ${pct > 55 ? 'text-white' : 'text-brand-gray-800'}`}>{shortDate(value.start)} – {shortDate(value.end)}</span>
          </span>
        ) : null}
      </button>
    )}>
      {(close) => (
        <form className="p-3 space-y-2" onSubmit={(e) => { e.preventDefault(); if (draft.start && draft.end) { onChange(draft); close() } }}>
          <label className="block"><span className="label">Start</span><input type="date" className="input" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value, end: draft.end && draft.end < e.target.value ? e.target.value : draft.end })} /></label>
          <label className="block"><span className="label">End</span><input type="date" className="input" min={draft.start} value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></label>
          <div className="flex justify-between pt-1">
            {value ? <button type="button" className="btn-ghost btn-sm" onClick={() => { onChange(null); close() }}>Clear</button> : <span />}
            <button className="btn-primary btn-sm" disabled={!draft.start || !draft.end}>Save</button>
          </div>
        </form>
      )}
    </Popover>
  )
}

export function TextCell({ value, onChange, readOnly, placeholder = '', title, number = false, unit = '' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => setDraft(value ?? ''), [value])
  const commit = () => {
    setEditing(false)
    if (number) {
      const n = draft === '' ? null : Number(draft)
      if (n !== null && !Number.isFinite(n)) { setDraft(value ?? ''); return }
      if (n !== (value ?? null)) onChange(n)
    } else if ((draft.trim() || null) !== (value || null)) onChange(draft.trim() || null)
  }
  if (editing && !readOnly) {
    return <input autoFocus aria-label={title} inputMode={number ? 'decimal' : undefined} className={`${CELL} bg-white outline-none ring-2 ring-inset ring-accent-500/60 ${number ? 'text-center tabular-nums' : ''}`}
      value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) } }} />
  }
  const shown = value === null || value === undefined || value === '' ? '' : number ? `${unit === '$' ? '$' : ''}${Number(value).toLocaleString()}${unit && unit !== '$' ? ` ${unit}` : ''}` : value
  return (
    <button type="button" disabled={readOnly} onClick={() => setEditing(true)} title={!number && shown ? shown : undefined} aria-label={`${title}: ${shown || 'empty'}`}
      className={`${cellButton} ${number ? 'justify-center tabular-nums' : 'justify-start'} text-brand-gray-800`}>
      <span className="truncate">{shown || <span className="text-brand-gray-300">{placeholder}</span>}</span>
    </button>
  )
}

export function CheckboxCell({ value, onChange, readOnly, title }) {
  return (
    <button type="button" role="checkbox" aria-checked={!!value} aria-label={title} disabled={readOnly} onClick={() => onChange(!value)} className={`${cellButton} justify-center`}>
      <span className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center transition-colors ${value ? 'bg-accent-600 border-accent-600 text-white' : 'border-brand-gray-300 bg-white'}`}>
        {value && <Check className="w-3 h-3" strokeWidth={3} />}
      </span>
    </button>
  )
}

export function TagsCell({ column, value, onChange, readOnly }) {
  const options = column.settings.options
  const ids = value || []
  const chosen = ids.map((id) => options.find((o) => o.id === id)).filter(Boolean)
  return (
    <Popover width={220} trigger={({ toggle, ref }) => (
      <button ref={ref} type="button" disabled={readOnly} onClick={toggle} className={`${cellButton} justify-center gap-1 overflow-hidden`} aria-label={`${column.title}: ${chosen.map((c) => c.label).join(', ') || 'none'}`}>
        {chosen.slice(0, 2).map((o) => (
          <span key={o.id} style={{ backgroundColor: LABEL_FILL[o.color][0], color: LABEL_FILL[o.color][1] }} className="px-1.5 py-0.5 rounded text-[11px] font-medium truncate max-w-[90px]">{o.label}</span>
        ))}
        {chosen.length > 2 && <span className="text-[11px] text-brand-gray-500">+{chosen.length - 2}</span>}
      </button>
    )}>
      {() => (
        <div className="p-1.5 max-h-64 overflow-y-auto">
          {options.length === 0 && <p className="px-2 py-1.5 text-xs text-brand-gray-500">No options yet. A lead can add them from the column menu.</p>}
          {options.map((o) => {
            const on = ids.includes(o.id)
            return (
              <button key={o.id} type="button" onClick={() => { const next = on ? ids.filter((x) => x !== o.id) : [...ids, o.id]; onChange(next.length ? next : null) }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-brand-gray-100">
                <span style={{ backgroundColor: LABEL_FILL[o.color][0] }} className="w-3 h-3 rounded-sm" />
                <span className="flex-1 text-left truncate">{o.label}</span>
                {on && <Check className="w-3.5 h-3.5 text-accent-600" />}
              </button>
            )
          })}
        </div>
      )}
    </Popover>
  )
}

export function LinkCell({ value, onChange, readOnly, title }) {
  const [draft, setDraft] = useState({ url: value?.url || '', text: value?.text || '' })
  useEffect(() => setDraft({ url: value?.url || '', text: value?.text || '' }), [value])
  return (
    <span className="relative flex items-center group h-9">
      {value ? (
        <a href={value.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 px-2 text-sm link truncate flex items-center gap-1">
          <ExternalLink className="w-3 h-3 shrink-0" /><span className="truncate">{value.text || new URL(value.url).hostname}</span>
        </a>
      ) : <span className="flex-1" />}
      {!readOnly && (
        <Popover width={280} trigger={({ toggle, ref }) => (
          <button ref={ref} type="button" onClick={toggle} aria-label={`Edit ${title}`} className={`${value ? 'hidden group-hover:flex' : 'flex'} absolute inset-y-0 right-0 ${value ? 'w-7' : 'w-full'} items-center justify-center text-brand-gray-300 hover:text-brand-gray-600 hover:bg-brand-gray-100/70`}>
            <Link2 className="w-3.5 h-3.5" />
          </button>
        )}>
          {(close) => (
            <form className="p-3 space-y-2" onSubmit={(e) => { e.preventDefault(); onChange(draft.url.trim() ? draft : null); close() }}>
              <label className="block"><span className="label">Link</span><input autoFocus className="input" type="url" placeholder="https://" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} /></label>
              <label className="block"><span className="label">Text to show</span><input className="input" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} /></label>
              <div className="flex justify-between pt-1">
                {value ? <button type="button" className="btn-ghost btn-sm" onClick={() => { onChange(null); close() }}>Remove</button> : <span />}
                <button className="btn-primary btn-sm">Save</button>
              </div>
            </form>
          )}
        </Popover>
      )}
    </span>
  )
}

// One cell for any custom column.
export function ColumnCell({ column, value, onChange, users, readOnly }) {
  switch (column.type) {
    case 'status': return <LabelCell column={column} value={value} onChange={onChange} readOnly={readOnly} />
    case 'people': return <PeopleCell multi label={column.title} value={value} users={users} onChange={onChange} readOnly={readOnly} />
    case 'date': return <DateCell label={column.title} value={value} onChange={onChange} readOnly={readOnly} />
    case 'timeline': return <TimelineCell title={column.title} value={value} onChange={onChange} readOnly={readOnly} />
    case 'text': return <TextCell title={column.title} value={value} onChange={onChange} readOnly={readOnly} />
    case 'number': return <TextCell number unit={column.settings.unit} title={column.title} value={value} onChange={onChange} readOnly={readOnly} />
    case 'checkbox': return <CheckboxCell title={column.title} value={value} onChange={onChange} readOnly={readOnly} />
    case 'dropdown': return <TagsCell column={column} value={value} onChange={onChange} readOnly={readOnly} />
    case 'link': return <LinkCell title={column.title} value={value} onChange={onChange} readOnly={readOnly} />
    default: return null
  }
}
