// Task detail, Monday's side panel: fields, description, and an updates thread.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { CalendarClock, Trash2, X } from 'lucide-react'
import { del, get, patch, post } from '../lib/api'
import { useSession } from '../context/Session'
import { atLeast, PRIORITIES } from '../lib/constants'
import { fmtFull, parseServerTime, relative } from '../lib/format'
import { Avatar, Field, PersonPicker, StatusPicker, useAction } from './ui'

export default function ItemDrawer({ itemId, groups, onClose, onChanged, onDeleted }) {
  const { user, users } = useSession()
  const [data, setData] = useState(null)
  const [desc, setDesc] = useState('')
  const [title, setTitle] = useState('')
  const [update, setUpdate] = useState('')
  const run = useAction()

  useEffect(() => {
    setData(null)
    get(`/items/${itemId}`).then((d) => { setData(d); setDesc(d.item.description); setTitle(d.item.title) }).catch(onClose)
  }, [itemId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async (fields) => {
    const res = await run(() => patch(`/items/${itemId}`, fields))
    if (res) { setData((d) => ({ ...d, item: res.item })); onChanged(res.item) }
  }
  const postUpdate = async (e) => {
    e.preventDefault()
    if (!update.trim()) return
    const res = await run(() => post(`/items/${itemId}/updates`, { body: update.trim() }))
    if (res) {
      setUpdate('')
      setData((d) => ({ ...d, updates: [...d.updates, res.update] }))
      onChanged({ ...data.item, update_count: data.updates.length + 1 })
    }
  }
  const remove = async () => {
    if (!window.confirm('Delete this task?')) return
    if (await run(() => del(`/items/${itemId}`), 'Task deleted.')) onDeleted(itemId)
  }

  const item = data?.item
  const canDelete = item && (atLeast(user, 'lead') || item.created_by === user.id)

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-label="Task" className="glass-strong border-l w-full max-w-xl h-full flex flex-col animate-slide-in">
        <div className="flex items-center justify-between px-5 h-14 border-b border-brand-gray-200">
          <span className="text-xs text-brand-gray-500">{item ? `Created ${relative(parseServerTime(item.created_at))}` : ''}</span>
          <div className="flex items-center gap-1">
            {canDelete && <button className="btn-icon" onClick={remove} aria-label="Delete task"><Trash2 className="w-4 h-4" /></button>}
            <button className="btn-icon" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
          </div>
        </div>
        {!item ? <div className="p-5"><div className="skeleton h-8 rounded-lg" /></div> : (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <input className="w-full bg-transparent text-xl font-semibold tracking-tight outline-none rounded focus:ring-2 focus:ring-accent-500/30 px-1 -mx-1" value={title} aria-label="Title"
              onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== item.title && save({ title: title.trim() })} />
            {data.meeting && (
              <Link to={`/meetings/${data.meeting.id}`} className="inline-flex items-center gap-1.5 badge-info"><CalendarClock className="w-3.5 h-3.5" />From {data.meeting.title}</Link>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Status"><StatusPicker value={item.status} onChange={(status) => save({ status })} /></Field>
              <Field label="Owner"><div className="input py-1"><PersonPicker value={item.assignee_id} users={users} onChange={(assignee_id) => save({ assignee_id })} /></div></Field>
              <Field label="Priority">
                <select className="input" value={item.priority} onChange={(e) => save({ priority: e.target.value })}>
                  {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </Field>
              <Field label="Due"><input type="date" className="input" value={item.due_date || ''} onChange={(e) => save({ due_date: e.target.value || null })} /></Field>
              <Field label="Group">
                <select className="input" value={item.group_id} onChange={(e) => save({ group_id: e.target.value })}>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </Field>
              {item.completed_at && <Field label="Completed"><p className="text-sm py-2">{fmtFull(parseServerTime(item.completed_at))}</p></Field>}
            </div>
            <Field label="Description">
              <textarea className="input min-h-[96px]" value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== item.description && save({ description: desc })}
                placeholder="What does done look like? Links to CAD, parts, docs…" />
            </Field>
            <div>
              <h3 className="label">Updates</h3>
              <form onSubmit={postUpdate} className="mb-4">
                <textarea className="input min-h-[64px]" placeholder="Post an update — progress, a blocker, a photo link…" value={update} onChange={(e) => setUpdate(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postUpdate(e) }} />
                <div className="flex justify-end mt-2"><button className="btn-primary btn-sm" disabled={!update.trim()}>Post update</button></div>
              </form>
              <ul className="space-y-3">
                {[...data.updates].reverse().map((u) => (
                  <li key={u.id} className="flex gap-3">
                    <Avatar name={u.author_name} user={{ id: u.author_id, name: u.author_name }} size={28} />
                    <div className="min-w-0 flex-1 card px-3 py-2">
                      <p className="text-xs text-brand-gray-500"><span className="font-medium text-brand-gray-800">{u.author_name || 'Former member'}</span> · {relative(parseServerTime(u.created_at))}</p>
                      <p className="text-sm whitespace-pre-wrap break-words mt-0.5">{u.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  )
}
