import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertOctagon, CalendarDays, CheckCircle2, Clock, LayoutGrid, ListChecks, Radio } from 'lucide-react'
import { get } from '../lib/api'
import { useSession } from '../context/Session'
import { MEETING_KIND, STATUS, SWATCH } from '../lib/constants'
import { dueInfo, fmtTime, parseServerTime, relative, todayIso } from '../lib/format'
import PageHeader from '../components/ui/PageHeader'
import StatCard from '../components/ui/StatCard'
import EmptyState from '../components/ui/EmptyState'
import SegmentedBar from '../components/ui/SegmentedBar'
import { Stagger } from '../components/ui/Motion'
import { SkeletonTable } from '../components/ui/Skeleton'
import { StatusPill } from '../components/board/cells'

export function DueText({ due, done }) {
  const info = dueInfo(due, done)
  if (!info) return <span className="text-brand-gray-400">—</span>
  const cls = { overdue: 'text-status-danger font-medium', soon: 'text-amber-700 font-medium', muted: 'text-brand-gray-400', normal: 'text-brand-gray-600' }[info.tone]
  return <span className={`whitespace-nowrap tabular-nums ${cls}`}>{info.label}</span>
}

export default function Home() {
  const { user, openNew } = useSession()
  const [data, setData] = useState(null)
  useEffect(() => { get('/home').then(setData) }, [])

  const today = todayIso()
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const dueThisWeek = data ? data.my_items.filter((i) => i.due_date && i.due_date >= today && i.due_date <= weekEnd).length : 0
  const live = data?.meetings.find((m) => m.status === 'live')
  const next = data?.meetings.find((m) => m.status !== 'live')

  return (
    <div>
      <PageHeader title="Home" subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        actions={<button type="button" className="btn-primary" onClick={() => openNew('task')}>New task</button>} />

      {live && (
        <Link to={`/meetings/${live.id}`} className="card flex items-center gap-3 px-5 py-3.5 mb-6 border-accent-300">
          <span className="relative flex h-2.5 w-2.5"><span className="absolute inset-0 rounded-full bg-accent-500 opacity-60 motion-safe:animate-ping" /><span className="relative h-2.5 w-2.5 rounded-full bg-accent-500" /></span>
          <span className="flex-1 text-sm"><span className="font-medium">{live.title}</span> <span className="text-brand-gray-500">is in progress.</span></span>
          <span className="btn-secondary btn-sm"><Radio className="w-4 h-4" />Join</span>
        </Link>
      )}

      {!data ? <div className="card"><SkeletonTable rows={6} cols={4} /></div> : (
        <>
          <div className="grid gap-4 grid-cols-2 xl:grid-cols-4 mb-6">
            <Stagger>
              <StatCard title="My open tasks" icon={ListChecks} value={data.my_items.length} sub="Assigned to you" />
              <StatCard title="Due in 7 days" icon={Clock} value={dueThisWeek} sub="Yours" />
              <StatCard title="Overdue" icon={AlertOctagon} value={data.overdue_count} tone={data.overdue_count ? 'danger' : undefined} sub="Yours" />
              <StatCard title="Next meeting" icon={CalendarDays} value={next ? new Date(next.starts_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '—'} sub={next ? `${fmtTime(new Date(next.starts_at))} · ${next.title}` : 'Nothing scheduled'} />
            </Stagger>
          </div>

          <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
            <section className="card lg:col-span-2">
              <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-brand-gray-200">
                <h2 className="text-[15px] font-semibold">My work</h2>
                <Link to="/my-work" className="link text-sm">View all</Link>
              </header>
              {data.my_items.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="Nothing assigned to you" message="Tasks you own show up here, soonest due first." />
              ) : (
                <table className="table">
                  <thead><tr><th>Task</th><th className="hidden sm:table-cell">Board</th><th>Status</th><th className="text-right">Due</th></tr></thead>
                  <tbody>
                    {data.my_items.slice(0, 8).map((i) => (
                      <tr key={i.id}>
                        <td className="max-w-0 w-full"><Link to={`/boards/${i.board_id}?item=${i.id}`} className="block truncate font-medium text-brand-black hover:text-accent-700">{i.title}</Link></td>
                        <td className="hidden sm:table-cell whitespace-nowrap"><span className="inline-flex items-center gap-1.5 text-brand-gray-600"><span className={`w-2 h-2 rounded-sm ${SWATCH[i.board_color]}`} />{i.board_name}</span></td>
                        <td><StatusPill status={i.status} small /></td>
                        <td className="text-right"><DueText due={i.due_date} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <div className="space-y-6">
              <section className="card">
                <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-brand-gray-200">
                  <h2 className="text-[15px] font-semibold">Upcoming meetings</h2>
                  <Link to="/meetings" className="link text-sm">All</Link>
                </header>
                {data.meetings.length === 0 ? <p className="px-5 py-6 text-sm text-brand-gray-500">Nothing scheduled.</p> : (
                  <ul className="divide-y divide-brand-gray-100">
                    {data.meetings.map((m) => {
                      const d = new Date(m.starts_at)
                      return (
                        <li key={m.id}>
                          <Link to={`/meetings/${m.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-brand-gray-50 transition-colors">
                            <div className="w-10 text-center shrink-0">
                              <p className="text-[10px] uppercase tracking-wide text-brand-gray-500">{d.toLocaleDateString(undefined, { month: 'short' })}</p>
                              <p className="text-lg font-semibold leading-6 tabular-nums">{d.getDate()}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{m.title}</p>
                              <p className="text-xs text-brand-gray-500">{m.status === 'live' ? 'In progress' : fmtTime(d)} · {MEETING_KIND[m.kind]?.label}</p>
                            </div>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <section className="card">
                <header className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-brand-gray-200">
                  <h2 className="text-[15px] font-semibold">Stuck</h2>
                  <span className="text-xs text-brand-gray-500">across the team</span>
                </header>
                {data.stuck.length === 0 ? <p className="px-5 py-6 text-sm text-brand-gray-500">Nothing is marked stuck.</p> : (
                  <ul className="divide-y divide-brand-gray-100">
                    {data.stuck.map((s) => (
                      <li key={s.id}>
                        <Link to={`/boards/${s.board_id}?item=${s.id}`} className="block px-5 py-2.5 hover:bg-brand-gray-50 transition-colors">
                          <p className="text-sm truncate">{s.title}</p>
                          <p className="text-xs text-brand-gray-500 truncate">{s.board_name} · {s.assignee_name || 'Unassigned'} · {relative(parseServerTime(s.updated_at))}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>

          <section className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="section-title">Boards</h2>
              <Link to="/boards" className="link text-sm">All boards</Link>
            </div>
            {data.boards.length === 0 ? (
              <div className="card"><EmptyState icon={LayoutGrid} title="No boards yet" message="Leads create boards from a template: robot build, competition prep or outreach." /></div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stagger>
                  {data.boards.map((b) => (
                    <Link key={b.id} to={`/boards/${b.id}`} className="card p-4 block">
                      <div className="flex items-center gap-2 mb-3"><span className={`w-2.5 h-2.5 rounded-sm ${SWATCH[b.color]}`} /><p className="font-medium truncate">{b.name}</p></div>
                      <SegmentedBar interactive={false} ariaLabel={`${b.name} progress`} segments={[
                        { key: 'done', label: 'Done', value: b.done, color: STATUS.done.fill },
                        { key: 'working', label: 'Working on it', value: b.working, color: STATUS.working.fill },
                        { key: 'stuck', label: 'Stuck', value: b.stuck, color: STATUS.stuck.fill },
                        { key: 'other', label: 'Other', value: Math.max(0, b.total - b.done - b.working - b.stuck), color: 'rgb(var(--brand-gray-200))' },
                      ]} />
                      <p className="text-xs text-brand-gray-500 mt-2 tabular-nums">{b.done} of {b.total} done{b.stuck ? ` · ${b.stuck} stuck` : ''}</p>
                    </Link>
                  ))}
                </Stagger>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
