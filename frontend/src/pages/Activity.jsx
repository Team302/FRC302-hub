import { useEffect, useState } from 'react'
import { Download, ScrollText } from 'lucide-react'
import { downloadFile, get } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { fmtFull, parseServerTime } from '../lib/format'
import EmptyState from '../components/ui/EmptyState'
import FilterChips from '../components/ui/FilterChips'
import PageHeader from '../components/ui/PageHeader'
import { SkeletonTable } from '../components/ui/Skeleton'

const FILTERS = [{ key: '', label: 'All' }, { key: 'vault', label: 'Vault' }, { key: 'user', label: 'People' }, { key: 'board', label: 'Boards' }, { key: 'item', label: 'Tasks' }, { key: 'meeting', label: 'Meetings' }, { key: 'team', label: 'Backups' }]

export default function Activity() {
  const [entity, setEntity] = useState('')
  const [rows, setRows] = useState(null)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const { error } = useToast()
  useEffect(() => {
    setRows(null)
    get(`/activity${entity ? `?entity=${entity}` : ''}`).then((d) => { setRows(d.activity); setMore(d.activity.length === 100) })
  }, [entity])
  const loadMore = async () => {
    const d = await get(`/activity?before=${rows.at(-1).id}${entity ? `&entity=${entity}` : ''}`)
    setRows((r) => [...r, ...d.activity])
    setMore(d.activity.length === 100)
  }
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Password reveals, roster changes, deletions and automations. Visible to mentors only."
        actions={
          <button type="button" className="btn-secondary" disabled={busy} title="Boards, tasks, meetings, attendance, events and this log as JSON. Vault passwords, 2FA keys and notes are not included."
            onClick={async () => { setBusy(true); try { await downloadFile('/api/admin/backup', 'backup.json') } catch (e) { error('Couldn’t download the backup', e.message) } finally { setBusy(false) } }}>
            <Download className="w-4 h-4" />{busy ? 'Preparing…' : 'Download backup'}
          </button>
        } />
      <FilterChips className="mb-4" aria-label="Show" value={entity} onChange={setEntity} options={FILTERS} />
      {!rows ? <div className="card"><SkeletonTable rows={8} cols={4} /></div> : rows.length === 0 ? (
        <div className="card"><EmptyState icon={ScrollText} title="Nothing recorded yet" /></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[640px]">
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>IP address</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-brand-gray-500 tabular-nums">{fmtFull(parseServerTime(r.created_at))}</td>
                  <td className="whitespace-nowrap font-medium">{r.actor_name || '—'}</td>
                  <td>{r.summary}</td>
                  <td className="font-mono text-xs text-brand-gray-500">{r.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {more && <div className="p-3 text-center border-t border-brand-gray-200"><button className="btn-secondary btn-sm" onClick={loadMore}>Load more</button></div>}
        </div>
      )}
    </div>
  )
}
