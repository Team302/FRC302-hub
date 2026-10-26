// Everything assigned to me across boards, bucketed by when it's due (Monday's "My work").
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, CheckCircle2, Eye } from 'lucide-react'
import { get, patch, post } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { STATUSES, SWATCH } from '../lib/constants'
import { parseServerTime, relative, todayIso } from '../lib/format'
import Avatar from '../components/ui/Avatar'
import PageHeader from '../components/ui/PageHeader'
import EmptyState from '../components/ui/EmptyState'
import { SkeletonTable } from '../components/ui/Skeleton'
import { PriorityCell, StatusCell } from '../components/board/cells'
import { DueText } from './Home'

function bucket(due, today) {
  if (!due) return 'none'
  if (due < today) return 'overdue'
  if (due === today) return 'today'
  const days = Math.round((new Date(`${due}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000)
  if (days <= 7) return 'week'
  if (days <= 14) return 'next'
  return 'later'
}
const BUCKETS = [['overdue', 'Overdue'], ['today', 'Today'], ['week', 'Next 7 days'], ['next', 'The week after'], ['later', 'Later'], ['none', 'No due date']]

export default function MyWork() {
  const [items, setItems] = useState(null)
  const [toReview, setToReview] = useState([])
  const { error, success } = useToast()
  useEffect(() => { get('/my-work').then((d) => { setItems(d.items); setToReview(d.to_review || []) }) }, [])

  // Approving from here; sending back needs a note, so that opens the task.
  const approve = async (item) => {
    try {
      await post(`/items/${item.id}/approve`)
      setToReview((list) => list.filter((i) => i.id !== item.id))
      success('Approved', `“${item.title}” is Done.`)
    } catch (e) { error('Couldn’t approve', e.message) }
  }

  const update = async (item, changes) => {
    const before = items
    setItems((list) => (changes.status === 'done' ? list.filter((i) => i.id !== item.id) : list.map((i) => (i.id === item.id ? { ...i, ...changes } : i))))
    try { await patch(`/items/${item.id}`, changes) } catch (e) { setItems(before); error('Couldn’t save that', e.message) }
  }

  const today = todayIso()
  return (
    <div>
      <PageHeader title="My work" subtitle="Open tasks and subitems you own, and what’s waiting for your review, on every board." />
      {toReview.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Eye className="w-4 h-4 text-[#0b6bcb]" />Waiting for your review <span className="font-normal text-brand-gray-500">{toReview.length}</span></h2>
          <ul className="card divide-y divide-brand-gray-100">
            {toReview.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={i.assignee_name || '?'} seed={i.assignee_id} size="sm" />
                <div className="flex-1 min-w-0">
                  <Link to={`/boards/${i.board_id}?item=${i.id}`} className="font-medium text-brand-black hover:text-accent-700">{i.title}</Link>
                  <p className="text-xs text-brand-gray-500 truncate">{i.assignee_name || 'No owner'} · {i.board_name}{i.parent_title ? ` · subitem of ${i.parent_title}` : ''} · submitted {relative(parseServerTime(i.updated_at))}</p>
                </div>
                <Link to={`/boards/${i.board_id}?item=${i.id}`} className="btn-secondary btn-sm">Open</Link>
                <button type="button" className="btn-primary btn-sm" onClick={() => approve(i)}><BadgeCheck className="w-3.5 h-3.5" />Approve</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!items ? <div className="card"><SkeletonTable rows={6} cols={4} /></div> : items.length === 0 ? (
        <div className="card"><EmptyState icon={CheckCircle2} title="Nothing assigned to you" message="When you own a task, it shows up here." /></div>
      ) : (
        <div className="space-y-6">
          {BUCKETS.map(([key, label]) => {
            const list = items.filter((i) => bucket(i.due_date, today) === key)
            if (!list.length) return null
            return (
              <section key={key}>
                <h2 className={`text-sm font-semibold mb-2 ${key === 'overdue' ? 'text-status-danger' : 'text-brand-black'}`}>{label} <span className="font-normal text-brand-gray-500">{list.length}</span></h2>
                <div className="card overflow-x-auto">
                  <table className="table table-fixed min-w-[720px]">
                    <colgroup><col /><col className="w-48" /><col className="w-36" /><col className="w-28" /><col className="w-28" /></colgroup>
                    <thead><tr><th>Task</th><th>Board</th><th className="text-center">Status</th><th className="text-center">Priority</th><th className="text-right">Due</th></tr></thead>
                    <tbody>
                      {list.map((i) => (
                        <tr key={i.id}>
                          <td className="truncate">
                            <Link to={`/boards/${i.board_id}?item=${i.id}`} className="font-medium text-brand-black hover:text-accent-700">{i.title}</Link>
                            {i.parent_title && <span className="text-xs text-brand-gray-500"> · subitem of {i.parent_title}</span>}
                          </td>
                          <td className="truncate"><span className="inline-flex items-center gap-1.5 text-brand-gray-600"><span className={`w-2 h-2 rounded-sm ${SWATCH[i.board_color]}`} />{i.board_name}</span></td>
                          <td className="p-0"><StatusCell value={i.status} statuses={STATUSES} onChange={(status) => update(i, { status })} /></td>
                          <td className="p-0"><PriorityCell value={i.priority} onChange={(priority) => update(i, { priority })} /></td>
                          <td className="text-right"><DueText due={i.due_date} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
