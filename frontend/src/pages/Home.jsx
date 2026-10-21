import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertOctagon, CalendarClock, CheckCircle2, Radio } from 'lucide-react'
import { get, patch } from '../lib/api'
import { useSession } from '../context/Session'
import { MEETING_KIND, PRIORITY, SWATCH } from '../lib/constants'
import { dueInfo, fmtDay, fmtTime, parseServerTime, relative } from '../lib/format'
import { EmptyState, PageHeader, ProgressBar, Spinner, StatusPicker, useAction } from '../components/ui'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function DueLabel({ due, done }) {
  const info = dueInfo(due, done)
  if (!info) return <span className="text-brand-gray-300">—</span>
  const cls = { overdue: 'text-status-danger font-medium', soon: 'text-amber-700 font-medium', muted: 'text-brand-gray-400 line-through', normal: 'text-brand-gray-600' }[info.tone]
  return <span className={`text-sm whitespace-nowrap ${cls}`}>{info.label}</span>
}

export default function Home() {
  const { user } = useSession()
  const [data, setData] = useState(null)
  const run = useAction()
  useEffect(() => { get('/home').then(setData) }, [])

  const setStatus = async (item, status) => {
    const res = await run(() => patch(`/items/${item.id}`, { status }), status === 'done' ? 'Nice — marked done.' : undefined)
    if (res) setData((d) => ({ ...d, my_items: status === 'done' ? d.my_items.filter((i) => i.id !== item.id) : d.my_items.map((i) => (i.id === item.id ? { ...i, status } : i)) }))
  }

  if (!data) return <Spinner />
  const live = data.meetings.find((m) => m.status === 'live')

  return (
    <div className="animate-fade-up">
      <PageHeader title={`${greeting()}, ${user.name.split(' ')[0]}`}
        subtitle={data.my_items.length ? `${data.my_items.length} open task${data.my_items.length === 1 ? '' : 's'} on your plate${data.overdue_count ? ` · ${data.overdue_count} overdue` : ''}.` : 'Nothing assigned to you. Grab something from a board.'} />

      {live && (
        <Link to={`/meetings/${live.id}`} className="card flex items-center gap-3 px-5 py-4 mb-6 border-accent-400/60">
          <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-500 opacity-60" /><span className="relative inline-flex rounded-full h-3 w-3 bg-accent-500" /></span>
          <div className="flex-1"><p className="font-medium">{live.title} is happening now</p><p className="text-sm text-brand-gray-500">Open it to check in and follow the agenda.</p></div>
          <Radio className="w-5 h-5 text-accent-600" />
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <section className="card lg:col-span-2">
          <header className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="section-title">My work</h2>
            <span className="text-xs text-brand-gray-500">Soonest first</span>
          </header>
          {data.my_items.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="All clear" body="When someone assigns you a task — or you take one — it shows up here." action={<Link to="/boards" className="btn-secondary btn-sm">Browse boards</Link>} />
          ) : (
            <ul className="divide-y divide-brand-gray-100">
              {data.my_items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className={`w-1 self-stretch rounded-full ${SWATCH[item.board_color] || 'bg-gray-400'}`} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/boards/${item.board_id}?item=${item.id}`} className="block truncate text-sm font-medium hover:text-accent-700">{item.title}</Link>
                    <p className="text-xs text-brand-gray-500 truncate">{item.board_name} · <span className={PRIORITY[item.priority].cls}>{PRIORITY[item.priority].label}</span></p>
                  </div>
                  <DueLabel due={item.due_date} />
                  <div className="w-28 shrink-0"><StatusPicker value={item.status} onChange={(s) => setStatus(item, s)} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="card">
            <header className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="section-title">Coming up</h2>
              <Link to="/meetings" className="link text-sm">All meetings</Link>
            </header>
            {data.meetings.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-brand-gray-500">No meetings scheduled.</p>
            ) : (
              <ul className="pb-2">
                {data.meetings.map((m) => {
                  const d = new Date(m.starts_at)
                  return (
                    <li key={m.id}>
                      <Link to={`/meetings/${m.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-brand-gray-50">
                        <div className="w-11 text-center shrink-0 rounded-lg bg-brand-gray-100 py-1">
                          <p className="text-[10px] uppercase text-brand-gray-500 leading-3">{fmtDay(d).split(',')[0]}</p>
                          <p className="text-base font-semibold leading-5">{d.getDate()}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{m.title}</p>
                          <p className="text-xs text-brand-gray-500">{m.status === 'live' ? 'Live now' : fmtTime(d)} · {MEETING_KIND[m.kind]?.label}</p>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {data.stuck.length > 0 && (
            <section className="card">
              <header className="flex items-center gap-2 px-5 pt-4 pb-2"><AlertOctagon className="w-4 h-4 text-status-danger" /><h2 className="section-title">Stuck</h2></header>
              <ul className="pb-2">
                {data.stuck.map((s) => (
                  <li key={s.id}>
                    <Link to={`/boards/${s.board_id}?item=${s.id}`} className="block px-5 py-2 hover:bg-brand-gray-50">
                      <p className="text-sm truncate">{s.title}</p>
                      <p className="text-xs text-brand-gray-500">{s.board_name} · {s.assignee_name || 'Unassigned'} · {relative(parseServerTime(s.updated_at))}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <section className="mt-6">
        <h2 className="section-title mb-3">Boards</h2>
        {data.boards.length === 0 ? (
          <div className="card"><EmptyState icon={CalendarClock} title="No boards yet" body="Leads can create a board per subteam or project." action={<Link to="/boards" className="btn-primary btn-sm">Go to boards</Link>} /></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.boards.map((b) => (
              <Link key={b.id} to={`/boards/${b.id}`} className="card p-4">
                <div className="flex items-center gap-2 mb-3"><span className={`w-2.5 h-2.5 rounded-sm ${SWATCH[b.color]}`} /><p className="font-medium truncate">{b.name}</p></div>
                <ProgressBar total={b.total} counts={{ done: b.done, stuck: b.stuck, working: b.working }} />
                <p className="text-xs text-brand-gray-500 mt-2">{b.done}/{b.total} done{b.stuck ? ` · ${b.stuck} stuck` : ''}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
