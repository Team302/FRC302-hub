import { useEffect, useState } from 'react'
import { get } from '../lib/api'
import { fmtFull, parseServerTime } from '../lib/format'
import { PageHeader, Spinner } from '../components/ui'

const FILTERS = [['', 'Everything'], ['vault', 'Vault'], ['user', 'People'], ['board', 'Boards'], ['item', 'Tasks'], ['meeting', 'Meetings']]

export default function Activity() {
  const [entity, setEntity] = useState('')
  const [rows, setRows] = useState(null)
  const [more, setMore] = useState(false)
  useEffect(() => {
    setRows(null)
    get(`/activity${entity ? `?entity=${entity}` : ''}`).then((d) => { setRows(d.activity); setMore(d.activity.length === 100) })
  }, [entity])
  const loadMore = async () => {
    const d = await get(`/activity?before=${rows[rows.length - 1].id}${entity ? `&entity=${entity}` : ''}`)
    setRows((r) => [...r, ...d.activity]); setMore(d.activity.length === 100)
  }
  return (
    <div className="animate-fade-up">
      <PageHeader title="Activity" subtitle="Who did what — vault reveals, roster changes and deletions. Mentors only." />
      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map(([id, label]) => <button key={id} onClick={() => setEntity(id)} className={`btn-sm ${entity === id ? 'btn-primary' : 'btn-secondary'}`}>{label}</button>)}
      </div>
      {!rows ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>IP</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-brand-gray-500">{fmtFull(parseServerTime(r.created_at))}</td>
                  <td className="whitespace-nowrap">{r.actor_name || '—'}</td>
                  <td>{r.summary}</td>
                  <td className="font-mono text-xs text-brand-gray-500">{r.ip || '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="text-center text-brand-gray-500 py-8">Nothing yet.</td></tr>}
            </tbody>
          </table>
          {more && <div className="p-3 text-center"><button className="btn-secondary btn-sm" onClick={loadMore}>Load more</button></div>}
        </div>
      )}
    </div>
  )
}
