// Expenses: what the team spends against its season budget, and paying people back. Members see
// and submit their own; leads and mentors see everything; mentors approve, reject and mark paid
// back, and set the budget (worker/src/routes/expenses.js has the rules).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, Download, FileText, HandCoins, Paperclip, PiggyBank, Plus, Receipt, Trash2, Wallet, X } from 'lucide-react'
import { apiFetch, del, downloadFile, get, patch, post } from '../lib/api'
import { useSession } from '../context/Session'
import { useToast } from '../context/ToastContext'
import { atLeast } from '../lib/constants'
import { formatMoney, parseServerTime, relative, todayIso } from '../lib/format'
import useRun from '../lib/useRun'
import Avatar from '../components/ui/Avatar'
import EmptyState from '../components/ui/EmptyState'
import FilterChips from '../components/ui/FilterChips'
import Modal from '../components/ui/Modal'
import PageHeader from '../components/ui/PageHeader'
import StatCard from '../components/ui/StatCard'
import { SkeletonTable } from '../components/ui/Skeleton'
import Field from '../components/forms/Field'
import { useConfirm } from '../components/list/useConfirm'

const usd = (cents) => formatMoney((cents || 0) / 100)
const shortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const MAX_RECEIPT = 15 * 1024 * 1024
const RECEIPT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/pdf']

// "45.2", "$1,200", "12" → cents; anything else → null.
export function toCents(text) {
  const clean = String(text).replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null
  const [whole, frac = ''] = clean.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}

const STATUS = {
  submitted: { label: 'Needs review', cls: 'badge-warning' },
  approved: { label: 'Approved', cls: 'badge-success' },
  rejected: { label: 'Not approved', cls: 'badge-danger' },
  reimbursed: { label: 'Paid back', cls: 'badge-gray' },
}
const statusOf = (e) => (e.status === 'approved' && e.payment === 'personal' ? { label: 'To pay back', cls: 'badge-info' } : STATUS[e.status])

async function uploadReceipt(expenseId, file) {
  if (file.size > MAX_RECEIPT) throw new Error('Receipts can be up to 15 MB.')
  const res = await apiFetch(`/api/expenses/${expenseId}/receipt`, { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status}).`)
  return data.expense
}

function ExpenseForm({ expense, categories, onClose, onSaved }) {
  const [form, setForm] = useState({
    amount: expense ? (expense.amount_cents / 100).toFixed(2) : '',
    description: expense?.description || '', vendor: expense?.vendor || '',
    spent_on: expense?.spent_on || todayIso(), payment: expense?.payment || 'personal', category_id: expense?.category_id || '',
  })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const { success, error } = useToast()
  const cents = toCents(form.amount)
  const submit = async (e) => {
    e.preventDefault()
    if (!cents) return
    setBusy(true)
    try {
      const body = { amount_cents: cents, description: form.description.trim(), vendor: form.vendor.trim(), spent_on: form.spent_on, payment: form.payment, category_id: form.category_id || null }
      let saved = (expense ? await patch(`/expenses/${expense.id}`, body) : await post('/expenses', body)).expense
      if (file) saved = await uploadReceipt(saved.id, file)
      success(expense ? 'Saved' : 'Submitted', expense ? undefined : 'A mentor will review it.')
      onSaved(saved)
    } catch (err) { error('Couldn’t save that', err.message) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={expense ? 'Edit expense' : 'New expense'} size="md"
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="expense-form" disabled={busy || !cents}>{busy ? 'Saving…' : expense ? 'Save' : 'Submit'}</button></>}>
      <form id="expense-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount" hint={form.amount && !cents ? 'Like 45.20' : undefined}>
            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray-400">$</span>
              <input className="input pl-7 tabular-nums" inputMode="decimal" required autoFocus value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" aria-label="Amount in dollars" /></div>
          </Field>
          <Field label="Date"><input type="date" className="input" required max={todayIso()} value={form.spent_on} onChange={(e) => setForm({ ...form, spent_on: e.target.value })} /></Field>
        </div>
        <Field label="What it was for"><input className="input" required maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Bearings for the intake" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vendor"><input className="input" maxLength={120} value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="WCP, AndyMark, Home Depot…" /></Field>
          <Field label="Category">
            <select className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">No category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <fieldset>
          <legend className="label">Paid with</legend>
          <div className="grid grid-cols-2 gap-2">
            {[['personal', 'My own money', 'Pay me back'], ['team', 'Team card or check', 'Nothing to pay back']].map(([k, l, h]) => (
              <label key={k} className={`rounded-xl border px-3 py-2.5 cursor-pointer ${form.payment === k ? 'border-accent-500 bg-accent-500/[0.06]' : 'border-brand-gray-200'}`}>
                <input type="radio" name="payment" className="sr-only" checked={form.payment === k} onChange={() => setForm({ ...form, payment: k })} />
                <span className="block text-sm font-medium">{l}</span><span className="block text-xs text-brand-gray-500">{h}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={expense?.has_receipt ? 'Replace the receipt' : 'Receipt'} hint="A photo or PDF. Needed to be paid back.">
          <input type="file" className="block w-full text-sm" accept={RECEIPT_TYPES.join(',')} onChange={(e) => setFile(e.target.files[0] || null)} />
        </Field>
      </form>
    </Modal>
  )
}

function ReceiptPreview({ expense }) {
  const [src, setSrc] = useState(null)
  const image = ['image/png', 'image/jpeg', 'image/webp'].includes(expense.receipt_type)
  useEffect(() => {
    if (!expense.has_receipt || !image) return undefined
    let url
    apiFetch(`/api/expenses/${expense.id}/receipt`).then((r) => (r.ok ? r.blob() : null)).then((b) => { if (b) { url = URL.createObjectURL(b); setSrc(url) } }).catch(() => {})
    return () => url && URL.revokeObjectURL(url)
  }, [expense.id, expense.receipt_filename]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!expense.has_receipt) return <p className="text-sm text-status-danger flex items-center gap-1.5"><Receipt className="w-4 h-4" />No receipt yet</p>
  return (
    <div>
      {image && src && <img src={src} alt="Receipt" className="max-h-72 rounded-xl border border-brand-gray-200 object-contain bg-brand-gray-50" />}
      <button type="button" className="link text-sm mt-2 inline-flex items-center gap-1" onClick={() => downloadFile(`/api/expenses/${expense.id}/receipt`, expense.receipt_filename)}><FileText className="w-3.5 h-3.5" />{expense.receipt_filename}</button>
    </div>
  )
}

function ExpenseDetail({ expense, onClose, onChanged, onEdit }) {
  const { user } = useSession()
  const run = useRun()
  const [confirm, confirmDialog] = useConfirm()
  const [note, setNote] = useState(null)
  const mentor = atLeast(user, 'admin')
  const mine = expense.submitted_by === user.id
  const s = statusOf(expense)
  const act = async (fn, msg) => { const res = await run(fn, msg); if (res) onChanged(res.expense) }
  return (
    <Modal open onClose={onClose} title={expense.description} size="md">
      {confirmDialog}
      <div className="space-y-5">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-3xl font-semibold tabular-nums">{usd(expense.amount_cents)}</span>
          <span className={s.cls}>{s.label}</span>
        </div>
        <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
          <dt className="text-brand-gray-500">Vendor</dt><dd>{expense.vendor || '—'}</dd>
          <dt className="text-brand-gray-500">Date</dt><dd>{expense.spent_on}</dd>
          <dt className="text-brand-gray-500">Category</dt><dd>{expense.category_name || 'None'}</dd>
          <dt className="text-brand-gray-500">Paid with</dt><dd>{expense.payment === 'personal' ? `${expense.submitted_by_name || 'Their'}’s own money` : 'Team card or check'}</dd>
          <dt className="text-brand-gray-500">Submitted by</dt><dd>{expense.submitted_by_name || 'Former member'} · {relative(parseServerTime(expense.created_at))}</dd>
          {expense.decided_by_name && <><dt className="text-brand-gray-500">{expense.status === 'rejected' ? 'Not approved by' : 'Approved by'}</dt><dd>{expense.decided_by_name}{expense.decision_note ? ` — “${expense.decision_note}”` : ''}</dd></>}
          {expense.reimbursed_at && <><dt className="text-brand-gray-500">Paid back</dt><dd>{relative(parseServerTime(expense.reimbursed_at))} by {expense.reimbursed_by_name}</dd></>}
          {expense.item_title && <><dt className="text-brand-gray-500">Task</dt><dd><Link className="link" to={`/boards/${expense.item_board_id}?item=${expense.item_id}`}>{expense.item_title}</Link></dd></>}
        </dl>
        <ReceiptPreview expense={expense} />

        {note !== null && (
          <form onSubmit={async (e) => { e.preventDefault(); await act(() => post(`/expenses/${expense.id}/decision`, { decision: 'rejected', note: note.trim() }), 'Marked not approved'); setNote(null) }}>
            <textarea autoFocus className="input" rows={2} maxLength={500} required value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why not? They’ll see this." aria-label="Reason" />
            <div className="flex justify-end gap-2 mt-2"><button type="button" className="btn-ghost btn-sm" onClick={() => setNote(null)}>Cancel</button><button className="btn-danger btn-sm" disabled={!note.trim()}>Don’t approve</button></div>
          </form>
        )}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-brand-gray-200">
          {mentor && expense.status === 'submitted' && note === null && (
            <>
              <button type="button" className="btn-primary btn-sm" onClick={async () => {
                if (!expense.has_receipt && expense.payment === 'personal' && !(await confirm({ title: 'Approve without a receipt?', message: 'There’s nothing to show the booster club or an auditor what this was. You can ask for the receipt instead.', confirmLabel: 'Approve anyway' }))) return
                act(() => post(`/expenses/${expense.id}/decision`, { decision: 'approved' }), 'Approved')
              }}><BadgeCheck className="w-3.5 h-3.5" />Approve</button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setNote('')}><X className="w-3.5 h-3.5" />Don’t approve</button>
            </>
          )}
          {mentor && expense.status === 'approved' && expense.payment === 'personal' && (
            <button type="button" className="btn-primary btn-sm" onClick={async () => { if (await confirm({ title: `Paid ${expense.submitted_by_name || 'them'} ${usd(expense.amount_cents)}?`, message: 'Only mark this once the money has actually been sent.', confirmLabel: 'Mark paid back' })) act(() => post(`/expenses/${expense.id}/reimbursed`), 'Marked paid back') }}><HandCoins className="w-3.5 h-3.5" />Mark paid back</button>
          )}
          {(mentor || (mine && expense.status === 'submitted')) && <button type="button" className="btn-secondary btn-sm" onClick={onEdit}>Edit</button>}
          {(mentor || (mine && expense.status === 'submitted')) && (
            <button type="button" className="btn-ghost btn-sm text-status-danger ml-auto" onClick={async () => { if (await confirm({ title: 'Delete this expense?', message: 'The receipt is deleted too.', confirmLabel: 'Delete', tone: 'danger' }) && (await run(() => del(`/expenses/${expense.id}`), 'Deleted'))) onChanged(null) }}><Trash2 className="w-3.5 h-3.5" />Delete</button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function BudgetEditor({ season, categories, onClose, onChanged }) {
  const run = useRun()
  const [rows, setRows] = useState(categories.map((c) => ({ ...c, amount: (c.budget_cents / 100).toFixed(0) })))
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const add = async (e) => {
    e.preventDefault()
    const res = await run(() => post('/budget-categories', { season, name: name.trim(), budget_cents: toCents(amount || '0') ?? 0 }))
    if (res) { setRows((r) => [...r, { ...res.category, amount: (res.category.budget_cents / 100).toFixed(0) }]); setName(''); setAmount(''); onChanged() }
  }
  const save = async (row) => {
    const cents = toCents(row.amount || '0')
    if (cents === null || cents === row.budget_cents) return
    if (await run(() => patch(`/budget-categories/${row.id}`, { budget_cents: cents }), 'Budget saved')) { setRows((r) => r.map((x) => (x.id === row.id ? { ...x, budget_cents: cents } : x))); onChanged() }
  }
  return (
    <Modal open onClose={onClose} title={`${season} season budget`} size="md">
      <p className="text-sm text-brand-gray-600 -mt-1 mb-4">Categories expenses are filed under, with how much the team plans to spend on each.</p>
      <ul className="divide-y divide-brand-gray-100 rounded-xl border border-brand-gray-200 mb-4">
        {rows.length === 0 && <li className="px-4 py-3 text-sm text-brand-gray-500">No categories yet. Common ones: Robot parts, Tools, Registration, Travel, Outreach, Team gear.</li>}
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2">
            <span className="flex-1 text-sm">{r.name}</span>
            <div className="relative w-32"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray-400 text-sm">$</span>
              <input className="input py-1.5 pl-6 text-right tabular-nums" inputMode="decimal" value={r.amount} aria-label={`${r.name} budget`} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, amount: e.target.value } : x)))} onBlur={() => save(r)} /></div>
            <button type="button" className="btn-icon" aria-label={`Remove ${r.name}`} onClick={async () => { if (await run(() => del(`/budget-categories/${r.id}`), 'Removed')) { setRows((rs) => rs.filter((x) => x.id !== r.id)); onChanged() } }}><Trash2 className="w-4 h-4" /></button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <input className="input" required maxLength={60} placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} aria-label="Category name" />
        <div className="relative w-32 shrink-0"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray-400 text-sm">$</span><input className="input pl-6 text-right tabular-nums" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Budget" /></div>
        <button className="btn-secondary shrink-0" disabled={!name.trim()}><Plus className="w-4 h-4" />Add</button>
      </form>
    </Modal>
  )
}

function Bar({ budget, spent, pending }) {
  const max = Math.max(budget, spent + pending, 1)
  const over = budget > 0 && spent > budget
  return (
    <div className="h-2 rounded-full bg-brand-gray-100 overflow-hidden flex" aria-hidden="true">
      <div className={over ? 'bg-status-danger' : 'bg-accent-500'} style={{ width: `${(spent / max) * 100}%` }} />
      <div className="bg-[#fdab3d]/70" style={{ width: `${(pending / max) * 100}%` }} />
    </div>
  )
}

export default function Expenses() {
  const { user } = useSession()
  const lead = atLeast(user, 'lead')
  const mentor = atLeast(user, 'admin')
  const [season, setSeason] = useState(null)
  const [data, setData] = useState(null)
  const [summary, setSummary] = useState(null)
  const [filter, setFilter] = useState(mentor ? 'submitted' : '')
  const [editing, setEditing] = useState(null) // 'new' | expense
  const [open, setOpen] = useState(null)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const { error } = useToast()
  const first = useRef(true)

  const load = useCallback(async () => {
    const q = season ? `?season=${season}` : ''
    const [d, s] = await Promise.all([get(`/expenses${q}`), lead ? get(`/expenses/summary${q}`) : Promise.resolve(null)])
    setData(d); setSummary(s)
    if (first.current) { first.current = false; if (mentor && !d.expenses.some((e) => e.status === 'submitted')) setFilter('') }
  }, [season, lead, mentor])
  useEffect(() => { load().catch((e) => error('Couldn’t load expenses', e.message)) }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => (data?.expenses || []).filter((e) =>
    filter === '' ? true : filter === 'mine' ? e.submitted_by === user.id : filter === 'owed' ? e.status === 'approved' && e.payment === 'personal' : e.status === filter), [data, filter, user.id])
  const count = (f) => (data?.expenses || []).filter((e) => (f === 'owed' ? e.status === 'approved' && e.payment === 'personal' : e.status === f)).length
  const seasons = data ? [data.current_season + 1, data.current_season, data.current_season - 1, data.current_season - 2] : []
  const shown = data?.season

  const changed = (e) => { setOpen(e); load() }

  return (
    <div>
      <PageHeader title="Expenses" subtitle={lead ? 'Spending against the season budget, and paying people back.' : 'Submit what you spent for the team, and see where it is.'}
        actions={
          <div className="flex flex-wrap gap-2">
            {data && <select className="input py-2 w-auto" value={shown} onChange={(e) => setSeason(Number(e.target.value))} aria-label="Season">{seasons.map((y) => <option key={y} value={y}>{y} season</option>)}</select>}
            {mentor && <button type="button" className="btn-secondary" onClick={() => setBudgetOpen(true)}><PiggyBank className="w-4 h-4" />Budget</button>}
            {lead && <button type="button" className="btn-secondary" aria-label="Export to CSV" onClick={() => downloadFile(`/api/expenses/export.csv?season=${shown}`, `expenses-${shown}.csv`).catch((e) => error('Couldn’t export', e.message))}><Download className="w-4 h-4" /></button>}
            <button type="button" className="btn-primary" onClick={() => setEditing('new')}><Plus className="w-4 h-4" />New expense</button>
          </div>
        } />

      {!data ? <div className="card"><SkeletonTable rows={6} cols={5} /></div> : (
        <>
          {summary && (
            <>
              <div className="grid gap-4 grid-cols-2 xl:grid-cols-4 mb-6">
                <StatCard title="Budget" icon={PiggyBank} value={usd(summary.totals.budget_cents)} sub={`${shown} season`} />
                <StatCard title="Spent" icon={Wallet} value={usd(summary.totals.spent_cents)} tone={summary.totals.budget_cents && summary.totals.spent_cents > summary.totals.budget_cents ? 'danger' : undefined}
                  sub={summary.totals.budget_cents ? `${usd(Math.max(0, summary.totals.budget_cents - summary.totals.spent_cents))} left` : 'No budget set'} />
                <StatCard title="Waiting for review" icon={Receipt} value={usd(summary.totals.pending_cents)} sub={`${count('submitted')} ${count('submitted') === 1 ? 'expense' : 'expenses'}`} onClick={() => setFilter('submitted')} />
                <StatCard title="Owed to people" icon={HandCoins} value={usd(summary.totals.owed_cents)} sub={summary.owed.map((o) => o.name?.split(' ')[0]).filter(Boolean).slice(0, 3).join(', ') || 'Nobody'} onClick={() => setFilter('owed')} />
              </div>
              {summary.categories.length > 0 && (
                <section className="card p-5 mb-6">
                  <h2 className="text-[15px] font-semibold mb-4">By category</h2>
                  <ul className="grid gap-4 sm:grid-cols-2">
                    {[...summary.categories, ...(summary.uncategorized.spent_cents || summary.uncategorized.pending_cents ? [{ id: '_', name: 'No category', budget_cents: 0, ...summary.uncategorized }] : [])].map((c) => (
                      <li key={c.id}>
                        <div className="flex items-baseline justify-between gap-3 text-sm mb-1.5">
                          <span className="font-medium truncate">{c.name}</span>
                          <span className="tabular-nums text-brand-gray-600 shrink-0">{usd(c.spent_cents)}{c.budget_cents ? <span className="text-brand-gray-400"> of {usd(c.budget_cents)}</span> : null}{c.pending_cents ? <span className="text-[#c27c0e]"> · {usd(c.pending_cents)} pending</span> : null}</span>
                        </div>
                        <Bar budget={c.budget_cents} spent={c.spent_cents} pending={c.pending_cents} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {mentor && summary.categories.length === 0 && (
                <div className="card p-5 mb-6 flex flex-wrap items-center gap-3"><p className="flex-1 text-sm text-brand-gray-600">No budget for the {shown} season yet. Add categories so spending can be tracked against them.</p><button type="button" className="btn-secondary btn-sm" onClick={() => setBudgetOpen(true)}><PiggyBank className="w-4 h-4" />Set the budget</button></div>
              )}
            </>
          )}

          <FilterChips className="mb-4" aria-label="Show" scroll value={filter} onChange={setFilter} options={[
            { key: '', label: 'All' },
            { key: 'submitted', label: `Needs review${count('submitted') ? ` · ${count('submitted')}` : ''}` },
            { key: 'owed', label: `To pay back${count('owed') ? ` · ${count('owed')}` : ''}` },
            { key: 'reimbursed', label: 'Paid back' },
            { key: 'rejected', label: 'Not approved' },
            ...(lead ? [{ key: 'mine', label: 'Mine' }] : []),
          ]} />

          {list.length === 0 ? (
            <div className="card"><EmptyState icon={Receipt} title={data.expenses.length ? 'Nothing here' : 'No expenses yet'} message={data.expenses.length ? undefined : 'Bought something for the team? Submit it with the receipt to get paid back.'} /></div>
          ) : (
            <>
            {/* Phones: cards, so the amount and status are always in view. */}
            <ul className="card divide-y divide-brand-gray-100 sm:hidden">
              {list.map((e) => {
                const s = statusOf(e)
                return (
                  <li key={e.id}>
                    <button type="button" className="w-full text-left px-4 py-3 flex items-start gap-3" onClick={() => setOpen(e)}>
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium truncate">{e.description}</span>
                        <span className="block text-xs text-brand-gray-500 truncate">{shortDate(e.spent_on)}{e.vendor ? ` · ${e.vendor}` : ''}{lead && e.submitted_by_name ? ` · ${e.submitted_by_name.split(' ')[0]}` : ''}{e.has_receipt ? '' : ' · no receipt'}</span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block font-medium tabular-nums">{usd(e.amount_cents)}</span>
                        <span className={`${s.cls} mt-1`}>{s.label}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="card overflow-x-auto hidden sm:block">
              <table className="table min-w-[720px]">
                <thead><tr><th className="w-28">Date</th><th>What</th>{lead && <th>Who</th>}<th>Category</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {list.map((e) => {
                    const s = statusOf(e)
                    return (
                      <tr key={e.id} className="cursor-pointer hover:bg-brand-gray-50" onClick={() => setOpen(e)}>
                        <td className="tabular-nums text-brand-gray-600 whitespace-nowrap">{shortDate(e.spent_on)}</td>
                        <td>
                          <button type="button" className="font-medium text-brand-black hover:text-accent-700 text-left" onClick={(ev) => { ev.stopPropagation(); setOpen(e) }}>{e.description}</button>
                          <span className="text-xs text-brand-gray-500 flex items-center gap-1.5">{e.vendor}{e.payment === 'personal' && <span>{e.vendor ? '· ' : ''}out of pocket</span>}{e.has_receipt ? <Paperclip className="w-3 h-3" aria-label="Has a receipt" /> : <span className="text-status-danger">· no receipt</span>}</span>
                        </td>
                        {lead && <td><span className="flex items-center gap-2"><Avatar name={e.submitted_by_name || '?'} seed={e.submitted_by} size="xs" />{e.submitted_by_name?.split(' ')[0] || 'Former member'}</span></td>}
                        <td className="text-brand-gray-600">{e.category_name || '—'}</td>
                        <td className="text-right tabular-nums font-medium">{usd(e.amount_cents)}</td>
                        <td><span className={s.cls}>{s.label}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </>
      )}

      {editing && <ExpenseForm expense={editing === 'new' ? null : editing} categories={data?.categories || []} onClose={() => setEditing(null)} onSaved={(e) => { setEditing(null); changed(editing === 'new' ? null : e) }} />}
      {open && !editing && <ExpenseDetail expense={open} onClose={() => setOpen(null)} onChanged={changed} onEdit={() => setEditing(open)} />}
      {budgetOpen && data && <BudgetEditor season={shown} categories={data.categories} onClose={() => setBudgetOpen(false)} onChanged={load} />}
    </div>
  )
}
