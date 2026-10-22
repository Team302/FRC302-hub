// The other board views: Kanban, Calendar, Timeline (Gantt) and Chart.
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Avatar from '../ui/Avatar'
import Donut from '../ui/Donut'
import HBarList from '../ui/HBarList'
import StatCard from '../ui/StatCard'
import { DateCell } from './cells'
import { LABEL_FILL, PRIORITY, SWATCH } from '../../lib/constants'
import { todayIso } from '../../lib/format'

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const atNoon = (s) => new Date(`${s}T12:00:00`)

function Card({ item, users, groupName, onOpen, dragProps, extra }) {
  const owner = users.find((u) => u.id === item.assignee_id)
  return (
    <div {...dragProps} className={`card p-3 ${dragProps?.draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      <button type="button" className="text-left text-sm font-medium leading-5 hover:text-accent-700 w-full" onClick={() => onOpen(item.id)}>{item.title}</button>
      {extra}
      <div className="flex items-center justify-between gap-2 mt-2.5">
        <span className="text-xs text-brand-gray-500 truncate">{groupName}</span>
        <span className="flex items-center gap-2 shrink-0">
          {item.due_date && <span className="text-xs"><DateCell due readOnly value={item.due_date} done={item.status === 'done'} onChange={() => {}} /></span>}
          <Avatar name={owner?.name} seed={owner?.id} size="xs" />
        </span>
      </div>
    </div>
  )
}

// ── Kanban: lanes by built-in status, or by any custom status column ──
export function KanbanView({ items, statuses, columns, values, groups, users, actions, onOpen, readOnly }) {
  const laneColumns = columns.filter((c) => c.type === 'status')
  const [laneBy, setLaneBy] = useState('status')
  const [drag, setDrag] = useState(null)
  const [over, setOver] = useState(null)
  const col = laneColumns.find((c) => c.id === laneBy)
  const lanes = col
    ? [...col.settings.labels.map((l) => ({ id: l.id, label: l.label, fill: LABEL_FILL[l.color][0] })), { id: null, label: 'Empty', fill: 'rgb(var(--brand-gray-300))' }]
    : statuses.map((s) => ({ id: s.id, label: s.label, fill: s.fill }))
  const laneOf = (i) => (col ? values[i.id]?.[col.id] ?? null : i.status)
  const groupName = Object.fromEntries(groups.map((g) => [g.id, g.name]))
  const move = (item, laneId) => (col ? actions.setValue(item.id, col.id, laneId) : actions.updateItem(item.id, { status: laneId }))

  return (
    <div>
      {laneColumns.length > 0 && (
        <label className="inline-flex items-center gap-2 text-sm text-brand-gray-600 mb-4">Lanes by
          <select className="input py-1 w-auto" value={laneBy} onChange={(e) => setLaneBy(e.target.value)}>
            <option value="status">Status</option>
            {laneColumns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
      )}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {lanes.map((lane) => {
          const laneItems = items.filter((i) => laneOf(i) === lane.id)
          return (
            <div key={lane.id ?? 'none'} className={`w-72 shrink-0 rounded-card bg-brand-gray-50/60 border border-brand-gray-200 transition-colors ${over === lane.id ? 'ring-2 ring-accent-500/50' : ''}`}
              onDragOver={(e) => { if (drag && !readOnly) { e.preventDefault(); setOver(lane.id) } }} onDragLeave={() => setOver(undefined)}
              onDrop={(e) => { e.preventDefault(); setOver(undefined); if (drag && laneOf(drag) !== lane.id) move(drag, lane.id); setDrag(null) }}>
              <div className="flex items-center gap-2 px-3 h-11 rounded-t-card text-sm font-medium" style={{ borderTop: `3px solid ${lane.fill}` }}>
                <span className="truncate">{lane.label}</span><span className="text-xs text-brand-gray-500 font-normal">{laneItems.length}</span>
              </div>
              <div className="px-2 pb-2 space-y-2 min-h-[6rem]">
                {laneItems.map((item) => (
                  <Card key={item.id} item={item} users={users} groupName={groupName[item.group_id]} onOpen={onOpen}
                    dragProps={readOnly ? {} : { draggable: true, onDragStart: () => setDrag(item), onDragEnd: () => setDrag(null) }}
                    extra={item.priority !== 'medium' && <span style={{ backgroundColor: PRIORITY[item.priority].fill, color: PRIORITY[item.priority].ink }} className="inline-block mt-2 px-1.5 py-0.5 rounded text-[11px] font-medium">{PRIORITY[item.priority].label}</span>} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Calendar: a month grid by due date (or any date column); drag a task to another day ──
export function CalendarView({ items, columns, values, statuses, actions, onOpen, readOnly }) {
  const dateColumns = columns.filter((c) => c.type === 'date')
  const [by, setBy] = useState('due')
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [drag, setDrag] = useState(null)
  const dateOf = (i) => (by === 'due' ? i.due_date : values[i.id]?.[by]) || null
  const setDate = (i, d) => (by === 'due' ? actions.updateItem(i.id, { due_date: d }) : actions.setValue(i.id, by, d))
  const start = new Date(month)
  start.setDate(1 - ((start.getDay() + 6) % 7)) // Monday-first grid
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  const byDay = useMemo(() => {
    const map = {}
    for (const i of items) { const d = dateOf(i); if (d) (map[d] ||= []).push(i) }
    return map
  }, [items, by, values]) // eslint-disable-line react-hooks/exhaustive-deps
  const today = todayIso()
  const undated = items.filter((i) => !dateOf(i)).length

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1">
          <button className="btn-icon" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="w-4 h-4" /></button>
          <button className="btn-icon" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="w-4 h-4" /></button>
        </div>
        <h2 className="section-title min-w-[10rem]">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <button className="btn-secondary btn-sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)) }}>Today</button>
        {dateColumns.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-brand-gray-600">Date
            <select className="input py-1 w-auto" value={by} onChange={(e) => setBy(e.target.value)}>
              <option value="due">Due date</option>
              {dateColumns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
        )}
        {undated > 0 && <span className="text-xs text-brand-gray-500 ml-auto">{undated} tasks without a date aren’t shown</span>}
      </div>
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-brand-gray-200 text-xs font-medium text-brand-gray-500">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="px-2 py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const key = iso(d)
            const inMonth = d.getMonth() === month.getMonth()
            const list = byDay[key] || []
            return (
              <div key={key} className={`min-h-[7.5rem] border-b border-r border-brand-gray-100 p-1.5 ${inMonth ? '' : 'bg-brand-gray-50/70'}`}
                onDragOver={(e) => { if (drag && !readOnly) e.preventDefault() }}
                onDrop={(e) => { e.preventDefault(); if (drag && dateOf(drag) !== key) setDate(drag, key); setDrag(null) }}>
                <div className={`text-xs mb-1 w-6 h-6 flex items-center justify-center rounded-full ${key === today ? 'bg-accent-600 text-white font-semibold' : inMonth ? 'text-brand-gray-700' : 'text-brand-gray-400'}`}>{d.getDate()}</div>
                <div className="space-y-1">
                  {list.slice(0, 4).map((i) => {
                    const s = statuses.find((x) => x.id === i.status)
                    return (
                      <button key={i.id} type="button" draggable={!readOnly} onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)} onClick={() => onOpen(i.id)}
                        className="w-full text-left text-[12px] leading-4 px-1.5 py-1 rounded-md truncate border-l-[3px] bg-brand-gray-100 hover:bg-brand-gray-200"
                        style={{ borderLeftColor: s?.fill }} title={`${i.title} · ${s?.label}`}>
                        <span className={i.status === 'done' ? 'line-through text-brand-gray-500' : ''}>{i.title}</span>
                      </button>
                    )
                  })}
                  {list.length > 4 && <p className="text-[11px] text-brand-gray-500 px-1">+{list.length - 4} more</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Timeline (Gantt): bars from a timeline column, or created → due date ──
export function TimelineView({ items, groups, columns, values, statuses, onOpen }) {
  const timelineColumns = columns.filter((c) => c.type === 'timeline')
  const [by, setBy] = useState(timelineColumns[0]?.id || 'due')
  const rangeOf = (i) => {
    if (by !== 'due') { const v = values[i.id]?.[by]; return v ? { start: v.start, end: v.end } : null }
    return i.due_date ? { start: (i.created_at || '').slice(0, 10) > i.due_date ? i.due_date : (i.created_at || '').slice(0, 10), end: i.due_date } : null
  }
  const ranged = items.map((i) => ({ item: i, r: rangeOf(i) })).filter((x) => x.r)
  const today = todayIso()
  const [from, to] = ranged.length
    ? [ranged.map((x) => x.r.start).concat(today).sort()[0], ranged.map((x) => x.r.end).concat(today).sort().at(-1)]
    : [today, today]
  const start = atNoon(from); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7)
  const end = atNoon(to); end.setDate(end.getDate() + 14)
  const totalDays = Math.max(14, Math.round((end - start) / 86400000))
  const DAY = 26
  const x = (s) => Math.round((atNoon(s) - start) / 86400000) * DAY
  const weeks = Array.from({ length: Math.ceil(totalDays / 7) }, (_, w) => { const d = new Date(start); d.setDate(d.getDate() + w * 7); return d })

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <label className="flex items-center gap-2 text-sm text-brand-gray-600">Bars from
          <select className="input py-1 w-auto" value={by} onChange={(e) => setBy(e.target.value)}>
            {timelineColumns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            <option value="due">Created → due date</option>
          </select>
        </label>
        {timelineColumns.length === 0 && <span className="text-xs text-brand-gray-500">Add a Timeline column to plan start and end dates.</span>}
      </div>
      <div className="card overflow-x-auto">
        <div className="relative" style={{ width: 260 + totalDays * DAY }}>
          <div className="flex sticky top-0 border-b border-brand-gray-200 bg-white z-10">
            <div className="w-[260px] shrink-0 px-4 py-2 text-xs font-medium text-brand-gray-500 sticky left-0 bg-white border-r border-brand-gray-200">Task</div>
            {weeks.map((w) => <div key={w.toISOString()} style={{ width: 7 * DAY }} className="shrink-0 px-2 py-2 text-xs text-brand-gray-500 border-l border-brand-gray-100">{w.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>)}
          </div>
          <div className="absolute top-0 bottom-0 w-px bg-flame-500/70 z-[5]" style={{ left: 260 + x(today) + DAY / 2 }} aria-hidden="true" />
          {groups.map((g) => {
            const rows = ranged.filter((r) => r.item.group_id === g.id)
            if (!rows.length) return null
            return (
              <div key={g.id}>
                <div className="sticky left-0 w-[260px] px-4 pt-3 pb-1 text-xs font-semibold text-brand-gray-600 bg-white flex items-center gap-2"><span className={`w-2 h-2 rounded-sm ${SWATCH[g.color]}`} />{g.name}</div>
                {rows.map(({ item, r }) => {
                  const s = statuses.find((st) => st.id === item.status)
                  return (
                    <div key={item.id} className="flex items-center h-9 border-b border-brand-gray-100">
                      <button type="button" onClick={() => onOpen(item.id)} className="w-[260px] shrink-0 sticky left-0 z-[6] bg-white px-4 text-left text-sm truncate h-full border-r border-brand-gray-200 hover:text-accent-700">{item.title}</button>
                      <div className="relative h-full flex-1">
                        <button type="button" onClick={() => onOpen(item.id)} title={`${item.title}: ${r.start} → ${r.end}`}
                          style={{ left: x(r.start), width: Math.max(DAY, x(r.end) - x(r.start) + DAY), backgroundColor: s?.fill, color: s?.ink }}
                          className="absolute top-1.5 h-6 rounded-md text-[11px] font-medium px-2 truncate text-left hover:brightness-110">{item.title}</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
          {ranged.length === 0 && <p className="px-4 py-10 text-sm text-brand-gray-500">No tasks have dates for this view yet.</p>}
        </div>
      </div>
    </div>
  )
}

// ── Chart: status mix, workload per person, and the numbers that matter ──
export function ChartView({ items, statuses, users, groups }) {
  const top = items.filter((i) => !i.parent_id)
  const today = todayIso()
  const open = top.filter((i) => i.status !== 'done')
  const overdue = open.filter((i) => i.due_date && i.due_date < today)
  const stuck = open.filter((i) => i.status === 'stuck')
  const done = top.length - open.length
  const load = {}
  for (const i of open) load[i.assignee_id || ''] = (load[i.assignee_id || ''] || 0) + 1
  const workload = Object.entries(load).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({
    key: id || 'none', label: id ? users.find((u) => u.id === id)?.name || 'Former member' : 'Unassigned', value: n,
    secondary: `${overdue.filter((i) => (i.assignee_id || '') === id).length} overdue`,
  }))
  const byGroup = groups.map((g) => ({ key: g.id, label: g.name, value: top.filter((i) => i.group_id === g.id && i.status !== 'done').length }))
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title="Open tasks" value={open.length} />
        <StatCard title="Done" value={done} sub={top.length ? `${Math.round((done / top.length) * 100)}% of ${top.length}` : undefined} />
        <StatCard title="Overdue" value={overdue.length} tone={overdue.length ? 'danger' : undefined} />
        <StatCard title="Stuck" value={stuck.length} tone={stuck.length ? 'warning' : undefined} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="section-title mb-4">Status</h3>
          <div className="flex flex-wrap items-center gap-8">
            <Donut ariaLabel="Tasks by status" centerValue={top.length} centerLabel="tasks"
              segments={statuses.map((s) => ({ key: s.id, label: s.label, value: top.filter((i) => i.status === s.id).length, color: s.fill }))} />
            <ul className="space-y-2 text-sm">
              {statuses.map((s) => (
                <li key={s.id} className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.fill }} />{s.label}<span className="text-brand-gray-500 tabular-nums ml-2">{top.filter((i) => i.status === s.id).length}</span></li>
              ))}
            </ul>
          </div>
        </section>
        <section className="card p-5">
          <h3 className="section-title mb-4">Open tasks per person</h3>
          <HBarList items={workload} ariaLabel="Open tasks per person" emptyMessage="No open tasks" limit={8} />
        </section>
        <section className="card p-5 lg:col-span-2">
          <h3 className="section-title mb-4">Open tasks per group</h3>
          <HBarList items={byGroup} ariaLabel="Open tasks per group" />
        </section>
      </div>
    </div>
  )
}
