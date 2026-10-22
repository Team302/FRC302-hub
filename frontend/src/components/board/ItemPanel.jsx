// The task panel (Monday's item view): every column as a field, then Updates with @mentions,
// Subitems and History tabs. Opens over the board from the right; ?item=<id> keeps it linkable.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { CalendarDays, Copy, History, ListTree, MessageSquare, Trash2, X } from 'lucide-react'
import { get, post } from '../../lib/api'
import { useSession } from '../../context/Session'
import { useToast } from '../../context/ToastContext'
import { atLeast } from '../../lib/constants'
import { parseServerTime, relative, fmtFull } from '../../lib/format'
import Avatar from '../ui/Avatar'
import SegmentedControl from '../ui/SegmentedControl'
import { useConfirm } from '../list/useConfirm'
import { ColumnCell, DateCell, PeopleCell, PriorityCell, StatusCell, StatusPill } from './cells'
import { TYPE_ICON } from './columns'
import Files from './Files'

// Text box with "@name" autocomplete. Tracks which people were picked, so the server can notify them.
function MentionBox({ users, value, onChange, onMention, onSubmit }) {
  const ref = useRef(null)
  const [query, setQuery] = useState(null)
  const [active, setActive] = useState(0)
  const matches = query === null ? [] : users.filter((u) => u.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)

  const onInput = (e) => {
    onChange(e.target.value)
    const before = e.target.value.slice(0, e.target.selectionStart)
    const m = /(^|\s)@([\w.'-]{0,30})$/.exec(before)
    setQuery(m ? m[2] : null)
    setActive(0)
  }
  const pick = (u) => {
    const el = ref.current
    const before = value.slice(0, el.selectionStart).replace(/@[\w.'-]{0,30}$/, `@${u.name} `)
    const next = before + value.slice(el.selectionStart)
    onChange(next)
    onMention(u.id)
    setQuery(null)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(before.length, before.length) })
  }
  return (
    <div className="relative">
      <textarea ref={ref} className="input min-h-[84px]" value={value} onChange={onInput} placeholder="Write an update. Type @ to mention someone."
        onKeyDown={(e) => {
          if (matches.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % matches.length); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); return }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[active]); return }
            if (e.key === 'Escape') { e.stopPropagation(); setQuery(null); return }
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit()
        }} aria-label="Update" />
      {matches.length > 0 && (
        <ul className="menu-pop absolute left-2 top-full mt-1 w-56 p-1" role="listbox">
          {matches.map((u, i) => (
            <li key={u.id} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(u) }} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm ${i === active ? 'bg-brand-gray-100' : ''}`}>
                <Avatar name={u.name} seed={u.id} size="xs" />{u.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Bold the @mentions of people on the team when showing an update.
function UpdateBody({ text, users }) {
  const names = users.map((u) => u.name).sort((a, b) => b.length - a.length)
  if (!names.length) return text
  const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g')
  return text.split(re).map((part, i) => (i % 2 ? <span key={i} className="font-medium text-accent-700">{part}</span> : part))
}

function Field({ label, icon: Icon, children }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-center min-h-9 border-b border-brand-gray-100 last:border-b-0">
      <span className="flex items-center gap-1.5 text-xs text-brand-gray-500 pr-2">{Icon && <Icon className="w-3.5 h-3.5" />}{label}</span>
      <div className="border-l border-brand-gray-100">{children}</div>
    </div>
  )
}

export default function ItemPanel({ itemId, board, data, statuses, actions, onClose, onOpen }) {
  const { user, users } = useSession()
  const { success } = useToast()
  const [confirm, confirmDialog] = useConfirm()
  const [detail, setDetail] = useState(null)
  const [tab, setTab] = useState('updates')
  const [draft, setDraft] = useState('')
  const [mentions, setMentions] = useState([])
  const [posting, setPosting] = useState(false)

  const item = data.items.find((i) => i.id === itemId)
  const values = data.values[itemId] || {}
  const subitems = useMemo(() => data.items.filter((i) => i.parent_id === itemId).sort((a, b) => a.position - b.position), [data.items, itemId])

  // Details (updates, history) are fetched; the fields come from the board so edits stay in sync.
  const updatedAt = item?.updated_at
  useEffect(() => { get(`/items/${itemId}`).then(setDetail).catch(() => onClose()) }, [itemId, updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!item) return null
  const canDelete = atLeast(user, 'lead') || item.created_by === user.id
  const group = data.groups.find((g) => g.id === item.group_id)
  const hidden = board.hidden_builtins || []

  async function postUpdate() {
    if (!draft.trim() || posting) return
    setPosting(true)
    try {
      const res = await post(`/items/${itemId}/updates`, { body: draft.trim(), mentions })
      setDetail((d) => ({ ...d, updates: [...d.updates, res.update] }))
      setDraft('')
      setMentions([])
      actions.reload()
    } finally { setPosting(false) }
  }
  async function remove() {
    // No confirm: deletes go to the board's trash, and the toast offers Undo.
    if (await actions.deleteItems([itemId])) {
      success('Moved to trash', `“${item.title}”${subitems.length ? ` and its ${subitems.length} subitems` : ''}`, { action: { label: 'Undo', onClick: () => actions.restoreItems([itemId]) } })
      onClose()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {confirmDialog}
      <aside role="dialog" aria-label={item.title} className="bg-white border-l border-brand-gray-200 shadow-pop w-full max-w-2xl h-full flex flex-col animate-slide-in">
        <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-brand-gray-200">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-brand-gray-500 truncate">
              {board.name} · {group?.name}
              {detail?.parent && <> · subitem of <button type="button" className="link" onClick={() => onOpen(detail.parent.id)}>{detail.parent.title}</button></>}
            </p>
            <input key={item.id + item.title} defaultValue={item.title} aria-label="Task name"
              className="w-full mt-1 bg-transparent text-xl font-semibold tracking-[-0.01em] outline-none rounded focus:ring-2 focus:ring-accent-500/30 px-1 -mx-1"
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== item.title) actions.updateItem(item.id, { title: v }) }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
            {detail?.meeting && (
              <Link to={`/meetings/${detail.meeting.id}`} className="badge-info mt-2"><CalendarDays className="w-3 h-3" />From {detail.meeting.title}</Link>
            )}
          </div>
          <button type="button" className="btn-icon" title="Duplicate" aria-label="Duplicate task" onClick={async () => { if (await actions.duplicate([item.id])) success('Task duplicated') }}><Copy className="w-4 h-4" /></button>
          {canDelete && <button type="button" className="btn-icon" title="Move to trash" aria-label="Move task to trash" onClick={remove}><Trash2 className="w-4 h-4" /></button>}
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-4">
            <div className="card px-3">
              <Field label="Status"><StatusCell value={item.status} statuses={statuses} onChange={(status) => actions.updateItem(item.id, { status })} /></Field>
              {!hidden.includes('owner') && <Field label="Owner"><PeopleCell value={item.assignee_id} users={users} onChange={(assignee_id) => actions.updateItem(item.id, { assignee_id })} /></Field>}
              {!hidden.includes('priority') && <Field label="Priority"><PriorityCell value={item.priority} onChange={(priority) => actions.updateItem(item.id, { priority })} /></Field>}
              {!hidden.includes('due') && <Field label="Due date"><DateCell due label="Due date" value={item.due_date} done={item.status === 'done'} onChange={(due_date) => actions.updateItem(item.id, { due_date })} /></Field>}
              {!item.parent_id && (
                <Field label="Group">
                  <select className="w-full h-9 px-2 text-sm bg-transparent outline-none hover:bg-brand-gray-100/70" value={item.group_id} onChange={(e) => actions.updateItem(item.id, { group_id: e.target.value })} aria-label="Group">
                    {data.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </Field>
              )}
              {data.columns.map((c) => (
                <Field key={c.id} label={c.title} icon={TYPE_ICON[c.type]}>
                  <ColumnCell column={c} value={values[c.id] ?? null} users={users} onChange={(v) => actions.setValue(item.id, c.id, v)} />
                </Field>
              ))}
            </div>
            {item.completed_at && <p className="mt-2 text-xs text-brand-gray-500">Completed {fmtFull(parseServerTime(item.completed_at))}</p>}
          </div>

          <div className="px-6">
            <SegmentedControl aria-label="Task sections" size="md" value={tab} onChange={setTab} options={[
              { value: 'updates', label: `Updates${detail?.updates.length ? ` · ${detail.updates.length}` : ''}` },
              ...(!item.parent_id ? [{ value: 'subitems', label: `Subitems${subitems.length ? ` · ${subitems.length}` : ''}` }] : []),
              { value: 'files', label: `Files${item.file_count ? ` · ${item.file_count}` : ''}` },
              { value: 'history', label: 'History' },
            ]} />
          </div>

          <div className="px-6 py-4">
            {tab === 'updates' && (
              <div className="space-y-4">
                <div>
                  <MentionBox users={users} value={draft} onChange={setDraft} onMention={(id) => setMentions((m) => [...new Set([...m, id])])} onSubmit={postUpdate} />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-brand-gray-400">⌘/Ctrl + Enter to post</span>
                    <button type="button" className="btn-primary btn-sm" disabled={!draft.trim() || posting} onClick={postUpdate}>Post update</button>
                  </div>
                </div>
                {!detail ? <div className="skeleton h-16 rounded-xl" /> : detail.updates.length === 0 ? (
                  <p className="text-sm text-brand-gray-500 py-6 text-center"><MessageSquare className="w-5 h-5 mx-auto mb-2 text-brand-gray-300" />No updates yet.</p>
                ) : [...detail.updates].reverse().map((u) => (
                  <article key={u.id} className="card p-4">
                    <header className="flex items-center gap-2 mb-2">
                      <Avatar name={u.author_name || '?'} seed={u.author_id} size="sm" />
                      <span className="text-sm font-medium">{u.author_name || 'Former member'}</span>
                      <span className="text-xs text-brand-gray-400" title={fmtFull(parseServerTime(u.created_at))}>{relative(parseServerTime(u.created_at))}</span>
                    </header>
                    <p className="text-sm whitespace-pre-wrap break-words leading-6"><UpdateBody text={u.body} users={users} /></p>
                  </article>
                ))}
              </div>
            )}

            {tab === 'subitems' && (
              <div className="card divide-y divide-brand-gray-100">
                {subitems.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-3 h-11">
                    <button type="button" className="flex-1 min-w-0 text-left text-sm truncate hover:text-accent-700" onClick={() => onOpen(s.id)}>{s.title}</button>
                    <Avatar name={users.find((u) => u.id === s.assignee_id)?.name} seed={s.assignee_id} size="sm" />
                    <StatusPill status={s.status} statuses={statuses} small />
                  </div>
                ))}
                <form className="flex items-center gap-2 px-3 h-11" onSubmit={(e) => { e.preventDefault(); const t = e.currentTarget.title.value.trim(); if (t) { actions.addItem({ parent_id: item.id, title: t }); e.currentTarget.reset() } }}>
                  <ListTree className="w-4 h-4 text-brand-gray-400" />
                  <input name="title" className="flex-1 bg-transparent outline-none text-sm placeholder:text-brand-gray-400" placeholder="Add subitem" aria-label="Add subitem" />
                </form>
              </div>
            )}

            {tab === 'files' && <Files itemId={item.id} onChanged={actions.reload} />}

            {tab === 'history' && (
              !detail ? <div className="skeleton h-16 rounded-xl" /> : (
                <ol className="space-y-0">
                  {detail.events.map((e) => (
                    <li key={e.id} className="flex items-start gap-3 py-2 border-b border-brand-gray-100 last:border-b-0 text-sm">
                      <History className="w-4 h-4 text-brand-gray-300 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{e.actor_name || 'Someone'}</span>{' '}
                        {e.field === 'created' ? 'created this task' : (
                          <>changed <span className="font-medium">{e.field}</span>{e.old_value !== null && e.new_value !== 'edited' ? <> from <span className="text-brand-gray-500">{e.old_value || '—'}</span></> : null}{e.new_value !== 'edited' ? <> to <span className="text-brand-black">{e.new_value || '—'}</span></> : null}</>
                        )}
                      </div>
                      <time className="text-xs text-brand-gray-400 shrink-0" title={fmtFull(parseServerTime(e.created_at))}>{relative(parseServerTime(e.created_at))}</time>
                    </li>
                  ))}
                </ol>
              )
            )}
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  )
}
