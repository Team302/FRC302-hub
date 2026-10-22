// Who has what across every board: spot the overloaded and the idle before build season bites.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertOctagon, Clock, Inbox, Users } from 'lucide-react'
import { get } from '../lib/api'
import { useSession } from '../context/Session'
import { ROLE, SWATCH } from '../lib/constants'
import Avatar from '../components/ui/Avatar'
import EmptyState from '../components/ui/EmptyState'
import FilterChips from '../components/ui/FilterChips'
import PageHeader from '../components/ui/PageHeader'
import StatCard from '../components/ui/StatCard'
import { SkeletonTable } from '../components/ui/Skeleton'

export default function Workload() {
  const { subteams, subteamById } = useSession()
  const [data, setData] = useState(null)
  const [subteam, setSubteam] = useState('')
  useEffect(() => { get('/reports/workload').then(setData) }, [])

  const rows = useMemo(() => (data?.people || []).filter((p) => !subteam || p.subteam_id === subteam).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name)), [data, subteam])
  const max = Math.max(1, ...rows.map((r) => r.open))
  const idle = rows.filter((r) => r.open === 0 && r.role !== 'admin').length
  const totalOverdue = rows.reduce((s, r) => s + r.overdue, 0)

  return (
    <div>
      <PageHeader title="Workload" subtitle="Open tasks and subitems per person, across every active board." />
      {!data ? <div className="card"><SkeletonTable rows={8} cols={5} /></div> : (
        <>
          <div className="grid gap-4 grid-cols-2 xl:grid-cols-4 mb-6">
            <StatCard title="Open tasks" icon={Inbox} value={rows.reduce((s, r) => s + r.open, 0) + (subteam ? 0 : data.unassigned.open)} sub={subteam ? subteamById[subteam]?.name : `${data.unassigned.open} unassigned`} />
            <StatCard title="Overdue" icon={AlertOctagon} value={totalOverdue} tone={totalOverdue ? 'danger' : undefined} />
            <StatCard title="Due in 7 days" icon={Clock} value={rows.reduce((s, r) => s + r.due_week, 0)} />
            <StatCard title="Students with nothing assigned" icon={Users} value={idle} sub="Good people to hand work to" />
          </div>
          <FilterChips className="mb-4" aria-label="Subteam" scroll value={subteam} onChange={setSubteam} options={[{ key: '', label: 'Everyone' }, ...subteams.map((s) => ({ key: s.id, label: s.name }))]} />
          {rows.length === 0 ? <div className="card"><EmptyState icon={Users} title="No one here" /></div> : (
            <div className="card overflow-x-auto">
              <table className="table min-w-[760px]">
                <thead><tr><th>Person</th><th className="w-[34%]">Open tasks</th><th className="text-right">Overdue</th><th className="text-right">Next 7 days</th><th className="text-right">Stuck</th><th>Boards</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.user_id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={r.name} seed={r.user_id} size="sm" />
                          <div className="min-w-0">
                            <p className="font-medium text-brand-black truncate">{r.name}</p>
                            <p className="text-xs text-brand-gray-500">{ROLE[r.role]?.label}{subteamById[r.subteam_id] ? ` · ${subteamById[r.subteam_id].name}` : ''}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 rounded-full bg-brand-gray-100 overflow-hidden flex">
                            <div className="h-full bg-[#d83a52]" style={{ width: `${(r.overdue / max) * 100}%` }} title={`${r.overdue} overdue`} />
                            <div className="h-full bg-accent-500" style={{ width: `${((r.open - r.overdue) / max) * 100}%` }} />
                          </div>
                          <span className="tabular-nums font-medium w-6 text-right">{r.open}</span>
                        </div>
                      </td>
                      <td className={`text-right tabular-nums ${r.overdue ? 'text-status-danger font-medium' : 'text-brand-gray-400'}`}>{r.overdue}</td>
                      <td className="text-right tabular-nums">{r.due_week || <span className="text-brand-gray-400">0</span>}</td>
                      <td className={`text-right tabular-nums ${r.stuck ? 'text-status-danger' : 'text-brand-gray-400'}`}>{r.stuck}</td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          {r.boards.slice(0, 3).map((b) => (
                            <Link key={b.board_id} to={`/boards/${b.board_id}`} className="inline-flex items-center gap-1 text-xs text-brand-gray-600 hover:text-brand-black bg-brand-gray-100 rounded px-1.5 py-0.5">
                              <span className={`w-1.5 h-1.5 rounded-sm ${SWATCH[b.color]}`} />{b.name} <span className="text-brand-gray-400">{b.open}</span>
                            </Link>
                          ))}
                          {r.boards.length > 3 && <span className="text-xs text-brand-gray-400">+{r.boards.length - 3}</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
