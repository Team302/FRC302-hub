// Notifications: assignments, @mentions, updates and status changes on your tasks, due-date
// reminders and automation alerts. Opening one marks it read.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AtSign, Bell, CheckCheck, Clock, MessageSquare, RefreshCw, UserPlus, Wrench, Zap } from 'lucide-react'
import { get, post } from '../lib/api'
import { useSession } from '../context/Session'
import { fmtFull, parseServerTime, relative } from '../lib/format'
import PageHeader from '../components/ui/PageHeader'
import EmptyState from '../components/ui/EmptyState'
import FilterChips from '../components/ui/FilterChips'
import { SkeletonTable } from '../components/ui/Skeleton'
import PushToggle from '../components/PushToggle'

const ICON = { assigned: UserPlus, mentioned: AtSign, update: MessageSquare, status: RefreshCw, due: Clock, automation: Zap, equipment: Wrench }

export default function Inbox() {
  const { setUnread } = useSession()
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('all')
  const navigate = useNavigate()
  const load = () => get('/notifications').then((d) => { setData(d); setUnread(d.unread) })
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const open = async (n) => {
    if (!n.read_at) {
      setData((d) => ({ ...d, unread: d.unread - 1, notifications: d.notifications.map((x) => (x.id === n.id ? { ...x, read_at: 'now' } : x)) }))
      setUnread((u) => Math.max(0, u - 1))
      post('/notifications/read', { ids: [n.id] }).catch(() => {})
    }
    if (n.item_id && n.board_id) navigate(`/boards/${n.board_id}?item=${n.item_id}`)
    else if (n.kind === 'equipment') navigate('/equipment')
  }
  const readAll = async () => { await post('/notifications/read', { all: true }); load() }

  const list = data ? data.notifications.filter((n) => filter === 'all' || (filter === 'unread' ? !n.read_at : n.kind === 'mentioned')) : []
  return (
    <div className="max-w-3xl">
      <PageHeader title="Inbox" subtitle="Assignments, mentions and changes to your tasks."
        actions={data?.unread > 0 && <button type="button" className="btn-secondary btn-sm" onClick={readAll}><CheckCheck className="w-4 h-4" />Mark all read</button>} />
      <div className="mb-5"><PushToggle /></div>
      <FilterChips className="mb-4" aria-label="Show" value={filter} onChange={setFilter} options={[
        { key: 'all', label: 'All' }, { key: 'unread', label: 'Unread', count: data?.unread ?? null }, { key: 'mentioned', label: 'Mentions' },
      ]} />
      {!data ? <div className="card"><SkeletonTable rows={5} cols={2} /></div> : list.length === 0 ? (
        <div className="card"><EmptyState icon={Bell} title={filter === 'unread' ? 'You’re all caught up' : 'No notifications'} message="You’ll hear about tasks assigned to you, @mentions, and changes to tasks you own." /></div>
      ) : (
        <ul className="card divide-y divide-brand-gray-100">
          {list.map((n) => {
            const Icon = ICON[n.kind] || Bell
            const when = parseServerTime(n.created_at)
            return (
              <li key={n.id}>
                <button type="button" onClick={() => open(n)} className={`w-full flex items-start gap-3 px-5 py-3.5 text-left hover:bg-brand-gray-50 transition-colors ${n.read_at ? '' : 'bg-accent-50/40'}`}>
                  <span className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${n.read_at ? 'bg-brand-gray-100 text-brand-gray-500' : 'bg-accent-100 text-accent-700'}`}><Icon className="w-4 h-4" /></span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm ${n.read_at ? 'text-brand-gray-700' : 'text-brand-black font-medium'}`}>{n.body}</span>
                    <time className="block text-xs text-brand-gray-500 mt-0.5" title={fmtFull(when)}>{relative(when)}</time>
                  </span>
                  {!n.read_at && <span className="mt-2 w-2 h-2 rounded-full bg-accent-500 shrink-0" aria-label="Unread" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
