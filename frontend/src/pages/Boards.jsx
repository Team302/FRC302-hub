import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutGrid, Plus, Star } from 'lucide-react'
import { get } from '../lib/api'
import { useSession } from '../context/Session'
import { atLeast, STATUS, SWATCH } from '../lib/constants'
import PageHeader from '../components/ui/PageHeader'
import EmptyState from '../components/ui/EmptyState'
import FilterChips from '../components/ui/FilterChips'
import SegmentedBar from '../components/ui/SegmentedBar'
import { SkeletonTable } from '../components/ui/Skeleton'

export default function Boards() {
  const { user, subteamById, openNew } = useSession()
  const [scope, setScope] = useState('active')
  const [boards, setBoards] = useState(null)
  useEffect(() => { setBoards(null); get(`/boards${scope === 'archived' ? '?archived=1' : ''}`).then((d) => setBoards(d.boards)) }, [scope])

  return (
    <div>
      <PageHeader title="Boards" subtitle="One board per subteam or project."
        actions={atLeast(user, 'lead') && <button type="button" className="btn-primary" onClick={() => openNew('board')}><Plus className="w-4 h-4" />New board</button>} />
      <FilterChips className="mb-4" aria-label="Show" value={scope} onChange={setScope} options={[{ key: 'active', label: 'Active' }, { key: 'archived', label: 'Archived' }]} />
      {!boards ? <div className="card"><SkeletonTable rows={4} cols={4} /></div> : boards.length === 0 ? (
        <div className="card"><EmptyState icon={LayoutGrid} title={scope === 'archived' ? 'No archived boards' : 'No boards yet'} message={scope === 'archived' ? undefined : 'Leads create boards from a template: robot build, competition prep or outreach.'} /></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[720px]">
            <thead><tr><th>Board</th><th>Subteam</th><th className="w-[30%]">Progress</th><th className="text-right">Open</th><th className="text-right">Overdue</th></tr></thead>
            <tbody>
              {boards.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link to={`/boards/${b.id}`} className="flex items-center gap-2.5 font-medium text-brand-black hover:text-accent-700">
                      <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${SWATCH[b.color]}`} />{b.name}
                      {b.is_favorite && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" aria-label="Favorite" />}
                    </Link>
                    {b.description && <p className="text-xs text-brand-gray-500 truncate max-w-md mt-0.5 ml-5">{b.description}</p>}
                  </td>
                  <td className="text-brand-gray-600">{subteamById[b.subteam_id]?.name || '—'}</td>
                  <td>
                    <div className="flex items-center gap-3">
                      <SegmentedBar className="flex-1" interactive={false} ariaLabel={`${b.name} progress`} segments={[
                        { key: 'done', label: 'Done', value: b.done_count, color: STATUS.done.fill },
                        { key: 'working', label: 'Working on it', value: b.working_count, color: STATUS.working.fill },
                        { key: 'stuck', label: 'Stuck', value: b.stuck_count, color: STATUS.stuck.fill },
                        { key: 'other', label: 'Other', value: Math.max(0, b.item_count - b.done_count - b.working_count - b.stuck_count), color: 'rgb(var(--brand-gray-200))' },
                      ]} />
                      <span className="text-xs text-brand-gray-500 tabular-nums w-14 text-right">{b.item_count ? Math.round((b.done_count / b.item_count) * 100) : 0}%</span>
                    </div>
                  </td>
                  <td className="text-right tabular-nums">{b.item_count - b.done_count}</td>
                  <td className={`text-right tabular-nums ${b.overdue_count ? 'text-status-danger font-medium' : 'text-brand-gray-400'}`}>{b.overdue_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
