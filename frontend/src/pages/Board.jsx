import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BarChart3, CalendarDays, Columns3, Download, GanttChartSquare, LayoutGrid, Plus, Search, Settings2, Star, Table2, Trash2, Zap } from 'lucide-react'
import { del, downloadFile } from '../lib/api'
import { useSession } from '../context/Session'
import { useToast } from '../context/ToastContext'
import { atLeast, boardStatuses, SWATCH } from '../lib/constants'
import { todayIso } from '../lib/format'
import EmptyState from '../components/ui/EmptyState'
import SegmentedControl from '../components/ui/SegmentedControl'
import { SkeletonTable } from '../components/ui/Skeleton'
import { useConfirm } from '../components/list/useConfirm'
import useBoard from '../components/board/useBoard'
import BoardTable from '../components/board/BoardTable'
import MobileList from '../components/board/MobileList'
import ItemPanel from '../components/board/ItemPanel'
import { boardColumns, ColumnEditor } from '../components/board/columns'
import { AutomationsModal, BoardSettings, BulkBar, EMPTY_FILTER, FilterMenu, PersonFilter, SortMenu, sortItems, TrashModal } from '../components/board/controls'
import { CalendarView, ChartView, KanbanView, TimelineView } from '../components/board/views'

const VIEWS = [
  { id: 'table', label: 'Main table', icon: Table2 },
  { id: 'kanban', label: 'Kanban', icon: Columns3 },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'timeline', label: 'Timeline', icon: GanttChartSquare },
  { id: 'chart', label: 'Chart', icon: BarChart3 },
]

function readPref(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
function writePref(key, value) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* per-browser convenience only */ } }

export default function Board() {
  const { id } = useParams()
  const { user, users, boards, refreshBoards } = useSession()
  const { success, error: toastError } = useToast()
  const [confirm, confirmDialog] = useConfirm()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const board = useBoard(id)
  const { data } = board

  const [view, setView] = useState(() => readPref(`hub302.view.${id}`, 'table'))
  const [q, setQ] = useState('')
  const [person, setPerson] = useState('')
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const [sort, setSort] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [columnEditor, setColumnEditor] = useState(null) // { type } | { column }
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [automationsOpen, setAutomationsOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [favorite, setFavorite] = useState(false)
  // Phones get the card list for the Main table unless they ask for the full table.
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)
  const [phoneLayout, setPhoneLayout] = useState(() => readPref('hub302.phoneLayout', 'cards'))
  useEffect(() => {
    const m = window.matchMedia('(max-width: 767px)')
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  useEffect(() => writePref('hub302.phoneLayout', phoneLayout), [phoneLayout])

  useEffect(() => writePref(`hub302.view.${id}`, view), [id, view])
  useEffect(() => { setSelected(new Set()) }, [id])
  const boardFav = boards.find((b) => b.id === id)?.is_favorite
  useEffect(() => setFavorite(!!boardFav), [boardFav])

  const canManage = atLeast(user, 'lead')
  const openItemId = params.get('item')
  const openItem = useCallback((itemId) => setParams((p) => { const n = new URLSearchParams(p); n.set('item', itemId); return n }), [setParams])
  const closeItem = useCallback(() => setParams((p) => { const n = new URLSearchParams(p); n.delete('item'); return n }), [setParams])

  const statuses = useMemo(() => boardStatuses(data?.board), [data?.board])
  const cols = useMemo(() => (data ? boardColumns(data.board, data.columns) : []), [data])

  // Filters apply to top-level tasks; a task's subitems come along with it.
  const visible = useMemo(() => {
    if (!data) return []
    const needle = q.trim().toLowerCase()
    const today = todayIso()
    const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    const subsByParent = {}
    for (const i of data.items) if (i.parent_id) (subsByParent[i.parent_id] ||= []).push(i)
    return data.items.filter((i) => {
      if (i.parent_id) return false
      const subs = subsByParent[i.id] || []
      if (needle && !i.title.toLowerCase().includes(needle) && !subs.some((s) => s.title.toLowerCase().includes(needle))) return false
      if (person && (person === 'none' ? i.assignee_id : i.assignee_id !== person && !subs.some((s) => s.assignee_id === person))) return false
      if (filter.statuses.length && !filter.statuses.includes(i.status)) return false
      if (filter.priorities.length && !filter.priorities.includes(i.priority)) return false
      if (filter.hideDone && i.status === 'done') return false
      if (filter.due === 'overdue' && !(i.due_date && i.due_date < today && i.status !== 'done')) return false
      if (filter.due === 'week' && !(i.due_date && i.due_date >= today && i.due_date <= week)) return false
      if (filter.due === 'none' && i.due_date) return false
      return true
    })
  }, [data, q, person, filter])

  const itemsByGroup = useMemo(() => {
    const out = {}
    const ordered = sort ? sortItems(visible, sort, data?.values || {}, statuses) : [...visible].sort((a, b) => a.position - b.position)
    for (const i of ordered) (out[i.group_id] ||= []).push(i)
    return out
  }, [visible, sort, data?.values, statuses])
  const subitemsOf = useCallback((parentId) => (data?.items || []).filter((i) => i.parent_id === parentId).sort((a, b) => a.position - b.position), [data?.items])

  if (board.missing) return <EmptyState icon={LayoutGrid} title="Board not found" message="It may have been deleted, or the link is wrong." action={<Link to="/boards" className="btn-secondary">All boards</Link>} />
  if (!data) return <div className="card"><SkeletonTable rows={8} cols={5} /></div>

  const filtering = q || person || filter !== EMPTY_FILTER
  const selectedIds = [...selected].filter((sid) => data.items.some((i) => i.id === sid))
  const ctx = { values: data.values, users, statuses, selected, setSelected, toggleSelect: (sid) => setSelected((p) => { const n = new Set(p); n.has(sid) ? n.delete(sid) : n.add(sid); return n }), actions: board, openItem, canEdit: !data.board.is_archived, board: data.board, me: user }

  async function deleteSelected() {
    const ids = selectedIds
    if (await board.deleteItems(ids)) {
      setSelected(new Set())
      success(`${ids.length} ${ids.length === 1 ? 'task' : 'tasks'} moved to trash`, undefined, { action: { label: 'Undo', onClick: () => board.restoreItems(ids) } })
    }
  }

  const columnHandlers = {
    edit: (column) => setColumnEditor({ column }),
    move: (column, dir) => {
      const ids = data.columns.map((c) => c.id)
      const i = ids.indexOf(column.id)
      ;[ids[i], ids[i + dir]] = [ids[i + dir], ids[i]]
      board.reorderColumns(ids)
    },
    remove: async (column) => {
      if (await confirm({ title: `Delete the “${column.title}” column?`, message: 'Every value in it is deleted, on every task. This can’t be undone.', confirmLabel: 'Delete column', tone: 'danger' })) board.deleteColumn(column.id)
    },
    hide: (key) => board.updateBoard({ hidden_builtins: [...(data.board.hidden_builtins || []), key] }),
  }
  const groupHandlers = {
    add: () => board.addGroup('New group'),
    update: (gid, changes) => board.updateGroup(gid, changes),
    move: (gid, dir) => {
      const ids = data.groups.map((g) => g.id)
      const i = ids.indexOf(gid)
      ;[ids[i], ids[i + dir]] = [ids[i + dir], ids[i]]
      board.reorderGroups(ids)
    },
    remove: async (group) => {
      const count = data.items.filter((i) => i.group_id === group.id && !i.parent_id).length
      if (count) { await confirm({ title: `“${group.name}” isn’t empty`, message: `Move or delete its ${count} ${count === 1 ? 'task' : 'tasks'} first.`, confirmLabel: 'OK' }); return }
      if (await confirm({ title: `Delete “${group.name}”?`, message: 'Any of its tasks still in the trash are deleted for good.', confirmLabel: 'Delete group', tone: 'danger' })) board.deleteGroup(group.id)
    },
  }

  const firstGroup = data.groups[0]
  const viewProps = { items: visible, statuses, columns: data.columns, values: data.values, groups: data.groups, users, actions: board, onOpen: openItem, readOnly: !!data.board.is_archived }

  return (
    <div>
      {confirmDialog}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className={`w-3 h-3 rounded ${SWATCH[data.board.color]}`} aria-hidden="true" />
            <h1 className="page-title truncate">{data.board.name}</h1>
            <button type="button" aria-pressed={favorite} aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'} title={favorite ? 'Remove from favorites' : 'Add to favorites'}
              className="btn-icon" onClick={async () => { setFavorite(!favorite); await board.setFavorite(!favorite); refreshBoards() }}>
              <Star className={`w-4 h-4 ${favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>
            {data.board.is_archived ? <span className="badge-gray">Archived</span> : null}
          </div>
          {data.board.description && <p className="page-subtitle max-w-3xl">{data.board.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={() => setAutomationsOpen(true)}>
            <Zap className="w-4 h-4" />Automate{data.automation_count ? <span className="badge-success ml-0.5">{data.automation_count}</span> : null}
          </button>
          <button type="button" className="btn-secondary btn-sm" aria-label="Export to CSV" title="Export to CSV (Excel, Google Sheets)"
            onClick={() => downloadFile(`/api/boards/${id}/export.csv`, `${data.board.name}.csv`).catch((e) => toastError('Couldn’t export', e.message))}><Download className="w-4 h-4" /></button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setTrashOpen(true)} aria-label="Trash" title="Deleted tasks"><Trash2 className="w-4 h-4" /></button>
          {canManage && <button type="button" className="btn-secondary btn-sm" onClick={() => setSettingsOpen(true)}><Settings2 className="w-4 h-4" />Settings</button>}
        </div>
      </div>

      <div className="border-b border-brand-gray-200 mt-4 mb-4 overflow-x-auto [scrollbar-width:none]">
        <nav className="flex gap-1 min-w-max" aria-label="Board views">
          {VIEWS.map(({ id: v, label, icon: Icon }) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-current={view === v ? 'page' : undefined}
              className={`relative flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap transition-colors ${view === v ? 'text-brand-black font-medium' : 'text-brand-gray-500 hover:text-brand-black'}`}>
              <Icon className="w-4 h-4" />{label}
              {view === v && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-accent-600" aria-hidden="true" />}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-5">
        {!data.board.is_archived && firstGroup && (
          <button type="button" className="btn-primary btn-sm mr-1" onClick={async () => { const res = await board.addItem({ group_id: firstGroup.id, title: 'New task' }); if (res) openItem(res.item.id) }}>
            <Plus className="w-4 h-4" />New task
          </button>
        )}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-gray-400 pointer-events-none" />
          <input className="input pl-8 py-1.5 h-8 w-44 focus:w-60 transition-[width]" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search this board" />
        </div>
        <PersonFilter users={users} value={person} onChange={setPerson} me={user.id} />
        <FilterMenu value={filter} onChange={setFilter} statuses={statuses} />
        {(view === 'table' || view === 'kanban') && <SortMenu value={sort} onChange={setSort} cols={cols} />}
        {filtering && <button type="button" className="btn-ghost btn-sm text-brand-gray-500" onClick={() => { setQ(''); setPerson(''); setFilter(EMPTY_FILTER) }}>Clear all</button>}
        <span className="ml-auto text-xs text-brand-gray-500">{visible.length} of {data.items.filter((i) => !i.parent_id).length} tasks</span>
      </div>

      {view === 'table' && narrow && (
        <SegmentedControl className="mb-4" aria-label="Layout" value={phoneLayout} onChange={setPhoneLayout} options={[{ value: 'cards', label: 'Cards' }, { value: 'table', label: 'Full table' }]} />
      )}
      {view === 'table' && narrow && phoneLayout === 'cards' && (
        <MobileList groups={data.groups} itemsByGroup={itemsByGroup} subitemsOf={subitemsOf} ctx={ctx} readOnly={!!data.board.is_archived} />
      )}
      {view === 'table' && !(narrow && phoneLayout === 'cards') && (
        <BoardTable groups={data.groups} cols={cols} itemsByGroup={itemsByGroup} subitemsOf={subitemsOf} ctx={ctx} canManage={canManage && !data.board.is_archived}
          dragEnabled={!sort && !data.board.is_archived} onAddColumn={(type) => setColumnEditor({ type })} columnHandlers={columnHandlers} groupHandlers={groupHandlers} />
      )}
      {view === 'kanban' && <KanbanView {...viewProps} items={sort ? sortItems(visible, sort, data.values, statuses) : visible} />}
      {view === 'calendar' && <CalendarView {...viewProps} />}
      {view === 'timeline' && <TimelineView {...viewProps} />}
      {view === 'chart' && <ChartView {...viewProps} />}

      {selectedIds.length > 0 && (
        <BulkBar count={selectedIds.length} groups={data.groups} statuses={statuses} users={users}
          onStatus={(status) => board.bulkUpdate(selectedIds, { status })}
          onOwner={(assignee_id) => board.bulkUpdate(selectedIds, { assignee_id })}
          onMove={(group_id) => board.bulkUpdate(selectedIds, { group_id })}
          onDuplicate={async () => { if (await board.duplicate(selectedIds)) { setSelected(new Set()); success('Duplicated') } }}
          onDelete={deleteSelected} onClear={() => setSelected(new Set())} />
      )}

      {openItemId && data.items.some((i) => i.id === openItemId) && (
        <ItemPanel itemId={openItemId} board={data.board} data={data} statuses={statuses} actions={board} onClose={closeItem} onOpen={openItem} />
      )}
      {columnEditor && (
        <ColumnEditor type={columnEditor.type} column={columnEditor.column} onClose={() => setColumnEditor(null)}
          onSave={(fields) => (columnEditor.column ? board.updateColumn(columnEditor.column.id, fields) : board.addColumn({ type: columnEditor.type, ...fields }))} />
      )}
      {settingsOpen && (
        <BoardSettings board={data.board} canDelete={atLeast(user, 'admin')} onClose={() => setSettingsOpen(false)}
          onSave={async (changes) => { const res = await board.updateBoard(changes); if (res) refreshBoards(); return res }}
          onArchive={async () => { if (await board.updateBoard({ is_archived: !data.board.is_archived })) { refreshBoards(); setSettingsOpen(false) } }}
          onDelete={async () => {
            if (!(await confirm({ title: `Delete “${data.board.name}”?`, message: 'Every task, update and column on it is deleted for good. Archive it instead if you might need it again.', confirmLabel: 'Delete board', tone: 'danger' }))) return
            await del(`/boards/${id}`)
            refreshBoards()
            navigate('/boards')
          }} />
      )}
      {trashOpen && <TrashModal boardId={id} me={user.id} isLead={atLeast(user, 'lead')} onClose={() => setTrashOpen(false)} onRestored={board.reload} />}
      {automationsOpen && (
        <AutomationsModal boardId={id} statuses={statuses} groups={data.groups} users={users} canManage={canManage}
          onClose={() => setAutomationsOpen(false)} onChanged={board.reload} />
      )}
    </div>
  )
}
