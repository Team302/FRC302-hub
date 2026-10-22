// Attendance and hours per person, for lettering, travel eligibility and grant reports.
import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Clock, Download, Percent, UserCheck, Users } from 'lucide-react'
import { downloadFile, get } from '../lib/api'
import { useSession } from '../context/Session'
import { useToast } from '../context/ToastContext'
import { ROLE, SWATCH } from '../lib/constants'
import Avatar from '../components/ui/Avatar'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import StatCard from '../components/ui/StatCard'
import { SkeletonTable } from '../components/ui/Skeleton'

function seasonStart() {
  const now = new Date()
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-08-01`
}
const today = () => new Date().toISOString().slice(0, 10)

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'hours', label: 'Hours', num: true },
  { key: 'attended', label: 'Attended', num: true },
  { key: 'expected', label: 'Expected', num: true },
  { key: 'excused', label: 'Excused', num: true },
  { key: 'late', label: 'Late', num: true },
  { key: 'rate', label: 'Attendance', num: true },
]

export default function Attendance() {
  const { subteams, subteamById } = useSession()
  const { error } = useToast()
  const [from, setFrom] = useState(seasonStart)
  const [to, setTo] = useState(today)
  const [subteam, setSubteam] = useState('')
  const [data, setData] = useState(null)
  const [sort, setSort] = useState({ key: 'hours', dir: 'desc' })

  useEffect(() => {
    setData(null)
    get(`/reports/attendance?from=${from}&to=${to}`).then(setData).catch((e) => { error('Couldn’t load the report', e.message); setData({ people: [], meeting_count: 0 }) })
  }, [from, to]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const list = (data?.people || []).filter((p) => !subteam || p.subteam_id === subteam)
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      const x = a[sort.key]; const y = b[sort.key]
      if (x === y) return a.name.localeCompare(b.name)
      if (x === null) return 1
      if (y === null) return -1
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir
    })
  }, [data, subteam, sort])

  const totalHours = rows.reduce((s, r) => s + r.hours, 0)
  const rated = rows.filter((r) => r.rate !== null)
  const avgRate = rated.length ? rated.reduce((s, r) => s + r.rate, 0) / rated.length : null
  const below = rated.filter((r) => r.rate < 75).length

  const download = async () => {
    try { await downloadFile(`/api/reports/attendance.csv?from=${from}&to=${to}`, `attendance-${from}-to-${to}.csv`) } catch (e) { error('Couldn’t download', e.message) }
  }
  const header = (c) => (
    <th key={c.key} className={c.num ? 'text-right' : ''}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-brand-black" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === 'desc' ? 'asc' : 'desc' }))}>
        {c.label}{sort.key === c.key && (sort.dir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
      </button>
    </th>
  )

  return (
    <div>
      <PageHeader title="Attendance" subtitle="Hours and attendance from meetings run in the app. Excused absences don’t count against anyone."
        actions={<button type="button" className="btn-secondary" onClick={download}><Download className="w-4 h-4" />Export CSV</button>} />
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <label><span className="label">From</span><input type="date" className="input py-1.5" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
        <label><span className="label">To</span><input type="date" className="input py-1.5" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
        <label><span className="label">Subteam</span>
          <select className="input py-1.5" value={subteam} onChange={(e) => setSubteam(e.target.value)}>
            <option value="">Everyone</option>
            {subteams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <button type="button" className="btn-ghost btn-sm" onClick={() => { setFrom(seasonStart()); setTo(today()) }}>This season</button>
      </div>

      {!data ? <div className="card"><SkeletonTable rows={8} cols={6} /></div> : (
        <>
          <div className="grid gap-4 grid-cols-2 xl:grid-cols-4 mb-6">
            <StatCard title="Meetings held" icon={Users} value={data.meeting_count} sub="Ended in this range" />
            <StatCard title="Total hours" icon={Clock} value={Math.round(totalHours)} sub={subteam ? subteamById[subteam]?.name : 'Whole team'} />
            <StatCard title="Average attendance" icon={Percent} value={avgRate === null ? '—' : `${Math.round(avgRate)}%`} />
            <StatCard title="Below 75%" icon={UserCheck} value={below} tone={below ? 'warning' : undefined} sub="People to check in with" />
          </div>
          {rows.length === 0 ? <div className="card"><EmptyState icon={Users} title="No one to show" /></div> : (
            <div className="card overflow-x-auto">
              <table className="table min-w-[760px]">
                <thead><tr>{COLUMNS.map(header)}</tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.user_id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={r.name} seed={r.user_id} size="sm" />
                          <div className="min-w-0">
                            <p className="font-medium text-brand-black truncate">{r.name}</p>
                            <p className="text-xs text-brand-gray-500 flex items-center gap-1.5">{ROLE[r.role]?.label}{subteamById[r.subteam_id] && <><span className={`w-1.5 h-1.5 rounded-sm ${SWATCH[subteamById[r.subteam_id].color]}`} />{subteamById[r.subteam_id].name}</>}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-right tabular-nums font-medium">{r.hours}</td>
                      <td className="text-right tabular-nums">{r.attended}</td>
                      <td className="text-right tabular-nums text-brand-gray-500">{r.expected}</td>
                      <td className="text-right tabular-nums text-brand-gray-500">{r.excused || '—'}</td>
                      <td className="text-right tabular-nums text-brand-gray-500">{r.late || '—'}</td>
                      <td className="text-right">
                        {r.rate === null ? <span className="text-brand-gray-400">—</span> : (
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 h-1.5 rounded-full bg-brand-gray-100 overflow-hidden"><div className={`h-full ${r.rate >= 90 ? 'bg-[#037f4c]' : r.rate >= 75 ? 'bg-[#fdab3d]' : 'bg-[#d83a52]'}`} style={{ width: `${r.rate}%` }} /></div>
                            <span className={`tabular-nums w-12 ${r.rate < 75 ? 'text-status-danger font-medium' : ''}`}>{r.rate}%</span>
                          </div>
                        )}
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
