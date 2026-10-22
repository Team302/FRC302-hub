// The Main Table view: one block per group (coloured header, column headers, rows, an add-row,
// and a summary footer), Monday-style. The checkbox and task columns stay pinned while the rest
// scroll sideways. Rows drag to reorder or move between groups; subitems expand under their task.
import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GripVertical, Maximize2, MessageSquare, MoreHorizontal, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react'
import Popover from './Popover'
import { ColumnCell, DateCell, PeopleCell, PriorityCell, StatusCell } from './cells'
import { AddColumnButton, ColumnHeader, SummaryCell } from './columns'
import { BORDER, COLORS, SWATCH, TEXT } from '../../lib/constants'

const CHECK_W = 44
// Narrower pinned task column on phones, so the other columns are reachable.
const titleWidth = () => (typeof window !== 'undefined' && window.innerWidth < 640 ? 190 : 340)
const ADD_W = 44

function Checkbox({ checked, indeterminate, onChange, label }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate }, [indeterminate])
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={label} className="w-4 h-4 rounded border-brand-gray-300 accent-[rgb(var(--accent-600))] cursor-pointer" />
}

function TitleEditor({ value, onSave, className = '', autoEdit = false, onDone }) {
  const [editing, setEditing] = useState(autoEdit)
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  if (!editing) {
    return <button type="button" onClick={() => setEditing(true)} className={`min-w-0 text-left truncate rounded px-1 -mx-1 py-0.5 hover:ring-1 hover:ring-brand-gray-300 ${className}`}>{value}</button>
  }
  const commit = () => { setEditing(false); onDone?.(); const v = draft.trim(); if (v && v !== value) onSave(v); else setDraft(value) }
  return <input autoFocus aria-label="Task name" className="input py-0.5 px-1 h-7 min-w-0 flex-1" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
    onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); onDone?.() } }} />
}

function GroupMenu({ group, isFirst, isLast, onRename, onColor, onMove, onDelete }) {
  const item = 'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-brand-gray-700 rounded-md hover:bg-brand-gray-100 hover:text-brand-black'
  return (
    <Popover trigger={({ toggle, ref }) => <button ref={ref} type="button" onClick={toggle} className="btn-icon w-7 h-7" aria-label={`${group.name} group options`}><MoreHorizontal className="w-4 h-4" /></button>}>
      {(close) => (
        <div className="p-1 w-56">
          <button type="button" className={item} onClick={() => { close(); onRename() }}><Pencil className="w-3.5 h-3.5" />Rename group</button>
          {!isFirst && <button type="button" className={item} onClick={() => { close(); onMove(-1) }}><ArrowUp className="w-3.5 h-3.5" />Move up</button>}
          {!isLast && <button type="button" className={item} onClick={() => { close(); onMove(1) }}><ArrowDown className="w-3.5 h-3.5" />Move down</button>}
          <div className="px-3 pt-2 pb-1 text-[11px] text-brand-gray-400">Colour</div>
          <div className="px-3 pb-2 grid grid-cols-7 gap-1.5">
            {COLORS.map((c) => <button key={c} type="button" aria-label={c} onClick={() => { close(); onColor(c) }} className={`w-5 h-5 rounded ${SWATCH[c]} ${group.color === c ? 'ring-2 ring-offset-1 ring-brand-black/60' : ''}`} />)}
          </div>
          <div className="my-1 border-t border-brand-gray-100" />
          <button type="button" className={`${item} text-status-danger hover:text-status-danger`} onClick={() => { close(); onDelete() }}><Trash2 className="w-3.5 h-3.5" />Delete group</button>
        </div>
      )}
    </Popover>
  )
}

function Row({ item, cols, ctx, titleW, depth, subCount, expanded, onToggleExpand, groupColor, dragProps, dropIndicator }) {
  const { values, users, statuses, selected, toggleSelect, actions, openItem, canEdit } = ctx
  const v = values[item.id] || {}
  const pinnedBg = selected.has(item.id) ? 'bg-accent-50' : depth ? 'bg-brand-gray-50' : 'bg-white'
  return (
    <tr {...dragProps} className={`group/row ${selected.has(item.id) ? 'bg-accent-50' : depth ? 'bg-brand-gray-50/60' : ''} ${dropIndicator ? 'shadow-[inset_0_2px_0_0_rgb(var(--accent-500))]' : ''}`}>
      <td className={`sticky left-0 z-10 p-0 border-b border-brand-gray-200 ${pinnedBg}`} style={{ width: CHECK_W }}>
        <div className="h-9 flex items-center">
          <span className={`self-stretch w-1.5 shrink-0 ${depth ? '' : SWATCH[groupColor]}`} />
          <span className="flex-1 flex items-center justify-center"><Checkbox checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} label={`Select ${item.title}`} /></span>
        </div>
      </td>
      <td className={`sticky z-10 p-0 border-b border-r border-brand-gray-200 ${pinnedBg}`} style={{ left: CHECK_W, width: titleW }}>
        <div className="h-9 flex items-center gap-1 pr-2" style={{ paddingLeft: depth ? 28 : 4 }}>
          <span className={`w-4 shrink-0 text-brand-gray-300 ${dragProps.draggable ? 'cursor-grab opacity-0 group-hover/row:opacity-100' : 'opacity-0'}`} aria-hidden="true"><GripVertical className="w-4 h-4" /></span>
          {!depth ? (
            <button type="button" onClick={onToggleExpand} aria-label={expanded ? 'Hide subitems' : 'Show subitems'} aria-expanded={expanded}
              className={`w-5 h-5 shrink-0 rounded flex items-center justify-center text-brand-gray-400 hover:bg-brand-gray-200 hover:text-brand-black ${subCount ? '' : 'opacity-0 group-hover/row:opacity-100 focus:opacity-100'}`}>
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : <span className="w-5 shrink-0 border-l-2 border-b-2 border-brand-gray-300 h-3 -mt-3 rounded-bl" aria-hidden="true" />}
          <TitleEditor value={item.title} onSave={(title) => actions.updateItem(item.id, { title })}
            className={`flex-1 text-sm ${item.status === 'done' ? 'text-brand-gray-400' : 'text-brand-black'}`} />
          {subCount > 0 && <span className="text-[11px] text-brand-gray-500 bg-brand-gray-100 rounded px-1.5 shrink-0" title={`${subCount} subitems`}>{subCount}</span>}
          {item.file_count > 0 && <span className="text-[11px] text-brand-gray-500 flex items-center gap-0.5 shrink-0" title={`${item.file_count} files`}><Paperclip className="w-3 h-3" />{item.file_count}</span>}
          <button type="button" onClick={() => openItem(item.id)} aria-label={`Open ${item.title}${item.update_count ? ` (${item.update_count} updates)` : ''}`}
            className={`shrink-0 h-7 px-1.5 rounded flex items-center gap-1 text-xs ${item.update_count ? 'text-accent-600' : 'text-brand-gray-300 opacity-0 group-hover/row:opacity-100 focus:opacity-100'} hover:bg-brand-gray-100 hover:text-brand-black`}>
            {item.update_count ? <><MessageSquare className="w-4 h-4" />{item.update_count}</> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </td>
      {cols.map((col) => (
        <td key={col.key} className="p-0 border-b border-r border-brand-gray-200" style={{ width: col.width }}>
          {col.key === 'owner' ? <PeopleCell value={item.assignee_id} users={users} readOnly={!canEdit} onChange={(assignee_id) => actions.updateItem(item.id, { assignee_id })} />
            : col.key === 'status' ? <StatusCell value={item.status} statuses={statuses} readOnly={!canEdit} onChange={(status) => actions.updateItem(item.id, { status })} />
              : col.key === 'priority' ? <PriorityCell value={item.priority} readOnly={!canEdit} onChange={(priority) => actions.updateItem(item.id, { priority })} />
                : col.key === 'due' ? <DateCell due label="Due date" value={item.due_date} done={item.status === 'done'} readOnly={!canEdit} onChange={(due_date) => actions.updateItem(item.id, { due_date })} />
                  : <ColumnCell column={col.column} value={v[col.key] ?? null} users={users} readOnly={!canEdit} onChange={(val) => actions.setValue(item.id, col.key, val)} />}
        </td>
      ))}
      <td className="p-0 border-b border-brand-gray-200" style={{ width: ADD_W }} />
    </tr>
  )
}

function AddRow({ placeholder, onAdd, depth, groupColor, cols, dropIndicator, dropProps }) {
  const [title, setTitle] = useState('')
  const submit = (e) => { e.preventDefault(); if (title.trim()) { onAdd(title.trim()); setTitle('') } }
  return (
    <tr {...dropProps} className={dropIndicator ? 'shadow-[inset_0_2px_0_0_rgb(var(--accent-500))]' : ''}>
      <td className={`sticky left-0 z-10 p-0 border-b border-brand-gray-200 ${depth ? 'bg-brand-gray-50' : 'bg-white'}`}>
        <div className="h-9 flex"><span className={`w-1.5 ${depth ? '' : `${SWATCH[groupColor]} opacity-40`}`} /></div>
      </td>
      <td className={`sticky z-10 p-0 border-b border-r border-brand-gray-200 ${depth ? 'bg-brand-gray-50' : 'bg-white'}`} style={{ left: CHECK_W }}>
        <form onSubmit={submit} className="h-9 flex items-center gap-2 pr-2" style={{ paddingLeft: depth ? 56 : 32 }}>
          <input className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-brand-gray-400 focus:placeholder:text-brand-gray-300 rounded px-1 -mx-1 focus:ring-1 focus:ring-accent-500/50 h-7"
            placeholder={placeholder} value={title} onChange={(e) => setTitle(e.target.value)} aria-label={placeholder} />
          {title.trim() && <button className="btn-primary btn-sm py-1">Add</button>}
        </form>
      </td>
      <td colSpan={cols.length + 1} className="p-0 border-b border-brand-gray-200" />
    </tr>
  )
}

export default function BoardTable({ groups, cols, itemsByGroup, subitemsOf, ctx, canManage, dragEnabled, onAddColumn, columnHandlers, groupHandlers }) {
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [expanded, setExpanded] = useState(() => new Set())
  const [renaming, setRenaming] = useState(null)
  const [drag, setDrag] = useState(null) // { id, groupId, parentId }
  const [drop, setDrop] = useState(null) // { groupId, parentId, beforeId }
  const { selected, setSelected, actions } = ctx
  const TITLE_W = titleWidth()
  const tableWidth = CHECK_W + TITLE_W + cols.reduce((s, c) => s + c.width, 0) + ADD_W

  const toggle = (setFn, id) => setFn((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  function finishDrop(target) {
    if (!drag || !target) return
    const { groupId, parentId, beforeId } = target
    if (drag.parentId !== parentId && (drag.parentId || parentId)) return // subitems stay with their parent
    const list = (parentId ? subitemsOf(parentId) : itemsByGroup[groupId] || []).map((i) => i.id).filter((id) => id !== drag.id)
    const at = beforeId ? list.indexOf(beforeId) : list.length
    list.splice(at < 0 ? list.length : at, 0, drag.id)
    actions.reorder(parentId ? { parentId, ids: list } : { groupId, ids: list })
  }

  const rowDrag = (item, groupId, parentId) => (dragEnabled ? {
    draggable: true,
    onDragStart: (e) => { e.dataTransfer.effectAllowed = 'move'; setDrag({ id: item.id, groupId, parentId }) },
    onDragEnd: () => { setDrag(null); setDrop(null) },
    onDragOver: (e) => { if (!drag || drag.id === item.id) return; e.preventDefault(); setDrop({ groupId, parentId, beforeId: item.id }) },
    onDrop: (e) => { e.preventDefault(); finishDrop({ groupId, parentId, beforeId: item.id }); setDrag(null); setDrop(null) },
  } : { draggable: false })
  const endDrop = (groupId, parentId) => (dragEnabled ? {
    onDragOver: (e) => { if (!drag) return; e.preventDefault(); setDrop({ groupId, parentId, beforeId: null }) },
    onDrop: (e) => { e.preventDefault(); finishDrop({ groupId, parentId, beforeId: null }); setDrag(null); setDrop(null) },
  } : {})
  const isDropAt = (groupId, parentId, beforeId) => drop && drop.groupId === groupId && (drop.parentId || null) === (parentId || null) && drop.beforeId === beforeId

  return (
    <div className="overflow-x-auto pb-4 -mx-1 px-1">
      <div style={{ minWidth: tableWidth }}>
        {groups.map((group, gi) => {
          const items = itemsByGroup[group.id] || []
          const isCollapsed = collapsed.has(group.id)
          const ids = items.map((i) => i.id)
          const allSelected = ids.length > 0 && ids.every((id) => selected.has(id))
          const someSelected = ids.some((id) => selected.has(id))
          return (
            <section key={group.id} className="mb-8" aria-label={group.name}>
              <div className="sticky left-0 flex items-center gap-1.5 mb-1.5 h-8" style={{ maxWidth: '100vw' }}>
                <button type="button" onClick={() => toggle(setCollapsed, group.id)} aria-expanded={!isCollapsed} aria-label={isCollapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
                  className={`w-7 h-7 rounded flex items-center justify-center hover:bg-brand-gray-100 ${TEXT[group.color]}`}>
                  {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {renaming === group.id ? (
                  <TitleEditor autoEdit value={group.name} onDone={() => setRenaming(null)} onSave={(name) => groupHandlers.update(group.id, { name })} className={`text-[15px] font-semibold ${TEXT[group.color]}`} />
                ) : (
                  <button type="button" onClick={() => canManage && setRenaming(group.id)} className={`text-[15px] font-semibold tracking-tight ${TEXT[group.color]} ${canManage ? 'hover:ring-1 hover:ring-brand-gray-300 rounded px-1 -mx-1' : 'cursor-default'}`}>{group.name}</button>
                )}
                <span className="text-xs text-brand-gray-500 ml-1">{items.length} {items.length === 1 ? 'task' : 'tasks'}</span>
                {canManage && <GroupMenu group={group} isFirst={gi === 0} isLast={gi === groups.length - 1}
                  onRename={() => setRenaming(group.id)} onColor={(color) => groupHandlers.update(group.id, { color })}
                  onMove={(dir) => groupHandlers.move(group.id, dir)} onDelete={() => groupHandlers.remove(group)} />}
              </div>

              {isCollapsed ? (
                <button type="button" onClick={() => toggle(setCollapsed, group.id)} className={`w-full text-left card px-4 h-11 flex items-center gap-3 border-l-4 ${BORDER[group.color]}`}>
                  <span className="text-sm font-medium text-brand-black">{group.name}</span>
                  <span className="text-xs text-brand-gray-500">{items.length} tasks · {items.filter((i) => i.status === 'done').length} done</span>
                </button>
              ) : (
                <div className="card overflow-hidden rounded-xl">
                  <table className="table-fixed border-separate border-spacing-0 text-sm bg-white" style={{ width: tableWidth }}>
                    <colgroup>
                      <col style={{ width: CHECK_W }} /><col style={{ width: TITLE_W }} />
                      {cols.map((c) => <col key={c.key} style={{ width: c.width }} />)}
                      <col style={{ width: ADD_W }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-20 p-0 bg-white border-b border-brand-gray-200">
                          <div className="h-9 flex items-center">
                            <span className={`self-stretch w-1.5 ${SWATCH[group.color]}`} />
                            <span className="flex-1 flex items-center justify-center">
                              <Checkbox checked={allSelected} indeterminate={!allSelected && someSelected} label={`Select all in ${group.name}`}
                                onChange={() => setSelected((prev) => { const n = new Set(prev); ids.forEach((id) => (allSelected ? n.delete(id) : n.add(id))); return n })} />
                            </span>
                          </div>
                        </th>
                        <th className="sticky z-20 p-0 bg-white border-b border-r border-brand-gray-200 text-left" style={{ left: CHECK_W }}>
                          <div className="h-9 flex items-center pl-10 text-xs font-medium text-brand-gray-500">Task</div>
                        </th>
                        {cols.map((col, ci) => (
                          <th key={col.key} className="p-0 border-b border-r border-brand-gray-200 font-normal">
                            <ColumnHeader col={col} canManage={canManage}
                              isFirst={ci === 0 || !cols[ci - 1].column} isLast={ci === cols.length - 1}
                              onEdit={columnHandlers.edit} onMove={columnHandlers.move} onDelete={columnHandlers.remove} onHide={columnHandlers.hide} />
                          </th>
                        ))}
                        <th className="p-0 border-b border-brand-gray-200 font-normal">{canManage && <AddColumnButton onPick={onAddColumn} />}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const subs = subitemsOf(item.id)
                        const isOpen = expanded.has(item.id)
                        return [
                          <Row key={item.id} titleW={TITLE_W} item={item} cols={cols} ctx={ctx} depth={0} subCount={subs.length} expanded={isOpen} groupColor={group.color}
                            onToggleExpand={() => toggle(setExpanded, item.id)} dragProps={rowDrag(item, group.id, null)} dropIndicator={isDropAt(group.id, null, item.id)} />,
                          ...(isOpen ? [
                            ...subs.map((s) => <Row key={s.id} titleW={TITLE_W} item={s} cols={cols} ctx={ctx} depth={1} groupColor={group.color} dragProps={rowDrag(s, group.id, item.id)} dropIndicator={isDropAt(group.id, item.id, s.id)} />),
                            <AddRow key={`${item.id}-add`} depth={1} cols={cols} groupColor={group.color} placeholder="Add subitem"
                              onAdd={(title) => actions.addItem({ parent_id: item.id, title })} dropProps={endDrop(group.id, item.id)} dropIndicator={isDropAt(group.id, item.id, null)} />,
                          ] : []),
                        ]
                      })}
                      <AddRow cols={cols} groupColor={group.color} placeholder="+ Add task" onAdd={(title) => actions.addItem({ group_id: group.id, title })}
                        dropProps={endDrop(group.id, null)} dropIndicator={isDropAt(group.id, null, null)} />
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="sticky left-0 z-10 bg-white p-0" />
                        <td className="sticky z-10 bg-white p-0 border-r border-brand-gray-200" style={{ left: CHECK_W }} />
                        {cols.map((col) => (
                          <td key={col.key} className="p-0 border-r border-brand-gray-200 bg-brand-gray-50/50">
                            <SummaryCell col={col} items={items} values={ctx.values} statuses={ctx.statuses} users={ctx.users} />
                          </td>
                        ))}
                        <td className="p-0" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>
          )
        })}
        {canManage && (
          <button type="button" onClick={groupHandlers.add} className="btn-secondary btn-sm"><Plus className="w-4 h-4" />Add new group</button>
        )}
      </div>
    </div>
  )
}
