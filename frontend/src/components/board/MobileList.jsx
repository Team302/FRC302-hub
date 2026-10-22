// The Main table on a phone: each group is a list of cards, the way Monday's mobile app shows a
// board. Tap the status to change it, tap the card to open the task. The full table is still
// one switch away for anyone who wants the columns.
import { useState } from 'react'
import { ChevronDown, ChevronRight, MessageSquare, Paperclip, Plus } from 'lucide-react'
import Avatar from '../ui/Avatar'
import { StatusCell } from './cells'
import { DueText } from '../../pages/Home'
import { SWATCH, TEXT } from '../../lib/constants'

function AddTask({ onAdd, label }) {
  const [title, setTitle] = useState('')
  return (
    <form className="flex items-center gap-2 px-3 py-2.5" onSubmit={(e) => { e.preventDefault(); if (title.trim()) { onAdd(title.trim()); setTitle('') } }}>
      <Plus className="w-4 h-4 text-brand-gray-400 shrink-0" />
      <input className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-brand-gray-400" placeholder={label} value={title} onChange={(e) => setTitle(e.target.value)} aria-label={label} />
      {title.trim() && <button className="btn-primary btn-sm">Add</button>}
    </form>
  )
}

export default function MobileList({ groups, itemsByGroup, subitemsOf, ctx, readOnly }) {
  const [collapsed, setCollapsed] = useState(() => new Set())
  const { users, statuses, actions, openItem } = ctx
  const toggle = (id) => setCollapsed((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const items = itemsByGroup[g.id] || []
        const open = !collapsed.has(g.id)
        return (
          <section key={g.id}>
            <button type="button" onClick={() => toggle(g.id)} aria-expanded={open} className={`flex items-center gap-1.5 mb-2 text-[15px] font-semibold ${TEXT[g.color]}`}>
              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}{g.name}
              <span className="text-xs font-normal text-brand-gray-500 ml-1">{items.length}</span>
            </button>
            {open && (
              <div className="card overflow-hidden divide-y divide-brand-gray-100">
                {items.map((item) => {
                  const subs = subitemsOf(item.id)
                  const owner = users.find((u) => u.id === item.assignee_id)
                  return (
                    <div key={item.id} className="flex items-stretch">
                      <span className={`w-1 shrink-0 ${SWATCH[g.color]}`} />
                      <div className="flex-1 min-w-0">
                        <button type="button" onClick={() => openItem(item.id)} className="w-full text-left px-3 pt-2.5 pb-1">
                          <span className={`block text-[15px] leading-5 ${item.status === 'done' ? 'text-brand-gray-400 line-through' : 'font-medium'}`}>{item.title}</span>
                          <span className="flex items-center gap-3 mt-1 text-xs text-brand-gray-500">
                            {owner ? <span className="flex items-center gap-1"><Avatar name={owner.name} seed={owner.id} size="xs" />{owner.name.split(' ')[0]}</span> : <span>Unassigned</span>}
                            {item.due_date && <DueText due={item.due_date} done={item.status === 'done'} />}
                            {subs.length > 0 && <span>{subs.filter((s) => s.status === 'done').length}/{subs.length} subitems</span>}
                            {item.update_count > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="w-3 h-3" />{item.update_count}</span>}
                            {item.file_count > 0 && <span className="flex items-center gap-0.5"><Paperclip className="w-3 h-3" />{item.file_count}</span>}
                          </span>
                        </button>
                        <div className="px-3 pb-2.5 pt-1 w-40"><div className="rounded-md overflow-hidden"><StatusCell value={item.status} statuses={statuses} readOnly={readOnly} onChange={(status) => actions.updateItem(item.id, { status })} /></div></div>
                      </div>
                    </div>
                  )
                })}
                {!readOnly && <AddTask label={`Add task to ${g.name}`} onAdd={(title) => actions.addItem({ group_id: g.id, title })} />}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
