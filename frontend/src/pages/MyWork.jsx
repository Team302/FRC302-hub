// Everything assigned to me across boards, bucketed by when it's due (Monday's "My work").
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { get, patch } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { STATUSES, SWATCH } from '../lib/constants'
import { todayIso } from '../lib/format'
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
  const { error } = useToast()
  useEffect(() => { get('/my-work').then((d) => setItems(d.items)) }, [])

  const update = async (item, changes) => {
    const before = items
    setItems((list) => (changes.status === 'done' ? list.filter((i) => i.id !== item.id) : list.map((i) => (i.id === item.id ? { ...i, ...changes } : i))))
    try { await patch(`/items/${item.id}`, changes) } catch (e) { setItems(before); error('Couldn’t save that', e.message) }
  }

  const today = todayIso()
  return (
    <div>
      <PageHeader title="My work" subtitle="Open tasks and subitems you own, on every board." />
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
