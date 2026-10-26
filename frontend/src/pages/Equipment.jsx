// Equipment: what the team owns, where it lives and who has it. Everyone can look and borrow for
// themselves; leads and mentors keep the inventory, lend to anyone and record returns.
import { useEffect, useMemo, useState } from 'react'
import { Download, HandHelping, Pencil, Plus, Search, Undo2, Wrench } from 'lucide-react'
import { del, downloadFile, get, patch, post } from '../lib/api'
import { useSession } from '../context/Session'
import { useToast } from '../context/ToastContext'
import { atLeast } from '../lib/constants'
import { formatServerDate, todayIso } from '../lib/format'
import useRun from '../lib/useRun'
import Avatar from '../components/ui/Avatar'
import EmptyState from '../components/ui/EmptyState'
import FilterChips from '../components/ui/FilterChips'
import Modal from '../components/ui/Modal'
import PageHeader from '../components/ui/PageHeader'
import { SkeletonTable } from '../components/ui/Skeleton'
import Field from '../components/forms/Field'
import { useConfirm } from '../components/list/useConfirm'

export const CATEGORY = {
  tool: 'Hand tool', power_tool: 'Power tool', electronics: 'Electronics', computer: 'Computer',
  robot_spare: 'Robot spare', safety: 'Safety', other: 'Other',
}
export const CONDITION = {
  good: { label: 'Good', cls: 'badge-success' },
  needs_repair: { label: 'Needs repair', cls: 'badge-warning' },
  broken: { label: 'Broken', cls: 'badge-danger' },
  lost: { label: 'Lost', cls: 'badge-danger' },
  retired: { label: 'Retired', cls: 'badge-gray' },
}
const RETURN_CONDITIONS = ['good', 'needs_repair', 'broken', 'lost']

const fmtDue = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const lendable = (item) => item.condition !== 'retired' && item.condition !== 'lost' && item.available > 0

function Availability({ item }) {
  if (item.condition === 'retired' || item.condition === 'lost') return <span className="text-brand-gray-400">—</span>
  return (
    <div className="min-w-0">
      <p className={`tabular-nums ${item.available ? 'text-brand-black' : 'text-brand-gray-500'}`}>
        {item.quantity === 1 ? (item.available ? 'Available' : 'Lent out') : `${item.available} of ${item.quantity} available`}
      </p>
      {item.holders.length > 0 && (
        <p className="text-xs text-brand-gray-500 mt-0.5">
          {item.holders.map((h, i) => (
            <span key={h.id} className={h.overdue ? 'text-status-danger font-medium' : ''}>
              {i > 0 && ', '}{h.borrower_name}{h.quantity > 1 ? ` ×${h.quantity}` : ''}{h.due_on ? ` (${h.overdue ? 'overdue, ' : ''}due ${fmtDue(h.due_on)})` : ''}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

function ItemForm({ item, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: item?.name || '', asset_tag: item?.asset_tag || '', category: item?.category || 'tool', location: item?.location || '',
    condition: item?.condition || 'good', quantity: item?.quantity || 1, notes: item?.notes || '',
  })
  const run = useRun()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form, quantity: Number(form.quantity) }
    const res = await run(() => (item ? patch(`/equipment/${item.id}`, body) : post('/equipment', body)), item ? 'Saved' : 'Item added')
    if (res) onSaved(res.item)
  }
  return (
    <Modal open onClose={onClose} title={item ? `Edit ${item.name}` : 'Add equipment'} size="md"
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="equipment-form">{item ? 'Save' : 'Add item'}</button></>}>
      <form id="equipment-form" onSubmit={submit} className="space-y-4">
        <Field label="Name"><input className="input" required autoFocus maxLength={120} value={form.name} onChange={set('name')} placeholder="Cordless drill (DeWalt 20V)" /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Category"><select className="input" value={form.category} onChange={set('category')}>{Object.entries(CATEGORY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Asset tag" hint="Optional. The number on the sticker."><input className="input" maxLength={40} value={form.asset_tag} onChange={set('asset_tag')} placeholder="302-T-014" /></Field>
          <Field label="Location"><input className="input" maxLength={120} value={form.location} onChange={set('location')} placeholder="Tool wall, cabinet B" /></Field>
          <Field label="Quantity" hint="More than 1 for a bin of identical items."><input className="input" type="number" min={1} max={10000} required value={form.quantity} onChange={set('quantity')} /></Field>
          <Field label="Condition"><select className="input" value={form.condition} onChange={set('condition')}>{Object.entries(CONDITION).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</select></Field>
        </div>
        <Field label="Notes"><textarea className="input" rows={3} maxLength={2000} value={form.notes} onChange={set('notes')} placeholder="Batteries charge in the cabinet. Ask Mr. K before using." /></Field>
      </form>
    </Modal>
  )
}

// Lend (leads: to anyone) or borrow (members: for themselves).
function LendForm({ item, onClose, onDone }) {
  const { user, users } = useSession()
  const canLend = atLeast(user, 'lead')
  const [form, setForm] = useState({ borrower_id: user.id, quantity: 1, due_on: '', notes: '' })
  const run = useRun()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const res = await run(() => post(`/equipment/${item.id}/lend`, { ...form, quantity: Number(form.quantity), due_on: form.due_on || null }),
      form.borrower_id === user.id ? 'Borrowed' : 'Lent')
    if (res) onDone()
  }
  const label = canLend ? 'Lend' : 'Borrow'
  return (
    <Modal open onClose={onClose} title={`${label} ${item.name}`} size="sm"
      description={item.quantity > 1 ? `${item.available} of ${item.quantity} available` : item.location || undefined}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="lend-form">{label}</button></>}>
      <form id="lend-form" onSubmit={submit} className="space-y-4">
        {item.condition !== 'good' && <p className="text-sm text-status-warning">This item is marked {CONDITION[item.condition].label.toLowerCase()}.</p>}
        {canLend && (
          <Field label="To">
            <select className="input" value={form.borrower_id} onChange={set('borrower_id')}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.id === user.id ? `${u.name} (you)` : u.name}</option>)}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          {item.quantity > 1 && <Field label="How many"><input className="input" type="number" min={1} max={item.available} required value={form.quantity} onChange={set('quantity')} /></Field>}
          <Field label="Due back" hint="Optional"><input className="input" type="date" min={todayIso()} value={form.due_on} onChange={set('due_on')} /></Field>
        </div>
        <Field label="Notes"><input className="input" maxLength={500} value={form.notes} onChange={set('notes')} placeholder="For the swerve module rebuild" /></Field>
      </form>
    </Modal>
  )
}

function ReturnForm({ loan, itemName, onClose, onDone }) {
  const { user } = useSession()
  const [form, setForm] = useState({ condition: 'good', notes: '' })
  const run = useRun()
  const submit = async (e) => {
    e.preventDefault()
    const res = await run(() => post(`/equipment/loans/${loan.id}/return`, form), 'Returned')
    if (res) onDone()
  }
  const whose = loan.borrower_id && loan.borrower_id !== user.id ? `${loan.borrower_name}’s ` : ''
  return (
    <Modal open onClose={onClose} title={`Return ${whose}${loan.quantity > 1 ? `${loan.quantity} × ` : ''}${itemName}`} size="sm"
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="return-form">Return</button></>}>
      <form id="return-form" onSubmit={submit} className="space-y-4">
        <Field label="Condition" hint="Anything other than Good is flagged to leads and mentors.">
          <select className="input" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
            {RETURN_CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION[c].label}</option>)}
          </select>
        </Field>
        <Field label="Notes"><input className="input" maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={form.condition === 'good' ? '' : 'What happened?'} /></Field>
      </form>
    </Modal>
  )
}

function Detail({ id, onClose, onLend, onReturn, onEdit, onChanged }) {
  const { user } = useSession()
  const canManage = atLeast(user, 'lead')
  const [data, setData] = useState(null)
  const run = useRun()
  const [confirm, confirmDialog] = useConfirm()
  useEffect(() => { get(`/equipment/${id}`).then(setData).catch(onClose) }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const item = data?.item
  const remove = async () => {
    if (item.on_loan > 0) {
      if (await confirm({ title: `Retire ${item.name}?`, message: 'Someone still has this, so it can’t be deleted. Retiring hides it from the list and stops new loans; open loans can still be returned.', confirmLabel: 'Retire' })
        && await run(() => patch(`/equipment/${item.id}`, { condition: 'retired' }), 'Retired')) { onChanged(); onClose() }
      return
    }
    if (await confirm({ title: `Delete ${item.name}?`, message: 'Its loan history goes with it. To keep the history, mark it retired instead.', confirmLabel: 'Delete', tone: 'danger' })
      && await run(() => del(`/equipment/${item.id}`), 'Deleted')) { onChanged(); onClose() }
  }
  return (
    <Modal open onClose={onClose} title={item?.name || 'Equipment'} size="lg"
      description={item ? [CATEGORY[item.category], item.asset_tag, item.location].filter(Boolean).join(' · ') : undefined}
      footerClassName="px-6 pb-6 flex flex-wrap gap-2"
      footer={item && (
        <>
          {lendable(item) && <button type="button" className="btn-primary" onClick={() => onLend(item)}><HandHelping className="w-4 h-4" />{canManage ? 'Lend' : 'Borrow'}</button>}
          {canManage && <button type="button" className="btn-secondary" onClick={() => onEdit(item)}><Pencil className="w-4 h-4" />Edit</button>}
          {canManage && <button type="button" className="btn-ghost sm:ml-auto text-status-danger" onClick={remove}>{item.on_loan > 0 ? 'Retire' : 'Delete'}</button>}
        </>
      )}>
      {confirmDialog}
      {!data ? <SkeletonTable rows={3} cols={2} /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className={CONDITION[item.condition].cls}>{CONDITION[item.condition].label}</span>
            <Availability item={{ ...item, holders: [] }} />
          </div>
          {item.notes && <p className="text-sm text-brand-gray-600 whitespace-pre-wrap">{item.notes}</p>}
          {item.holders.length > 0 && (
            <section>
              <h3 className="text-xs font-medium text-brand-gray-500 mb-2">Out right now</h3>
              <ul className="divide-y divide-brand-gray-100 rounded-xl border border-brand-gray-200">
                {item.holders.map((h) => (
                  <li key={h.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar name={h.borrower_name} seed={h.borrower_id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-brand-black truncate">{h.borrower_name}{h.quantity > 1 ? ` ×${h.quantity}` : ''}</p>
                      <p className={`text-xs ${h.overdue ? 'text-status-danger font-medium' : 'text-brand-gray-500'}`}>
                        Since {formatServerDate(h.lent_at)}{h.due_on ? ` · ${h.overdue ? 'overdue, was ' : ''}due ${fmtDue(h.due_on)}` : ''}
                      </p>
                    </div>
                    {(canManage || h.borrower_id === user.id) && <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => onReturn(h, item.name)}><Undo2 className="w-3.5 h-3.5" />Return</button>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3 className="text-xs font-medium text-brand-gray-500 mb-2">History</h3>
            {data.loans.filter((l) => l.returned_at).length === 0 ? <p className="text-sm text-brand-gray-500">No returns yet.</p> : (
              <ul className="space-y-2 text-sm">
                {data.loans.filter((l) => l.returned_at).map((l) => (
                  <li key={l.id} className="flex flex-wrap gap-x-2 gap-y-0.5">
                    <span className="font-medium text-brand-black">{l.borrower_name}{l.quantity > 1 ? ` ×${l.quantity}` : ''}</span>
                    <span className="text-brand-gray-500">{formatServerDate(l.lent_at)} – {formatServerDate(l.returned_at)}</span>
                    {l.return_condition && l.return_condition !== 'good' && <span className={CONDITION[l.return_condition].cls}>{CONDITION[l.return_condition].label}</span>}
                    {l.lent_by_name && l.lent_by !== l.borrower_id && <span className="text-brand-gray-500">lent by {l.lent_by_name}</span>}
                    {l.returned_to_name && l.returned_to !== l.borrower_id && <span className="text-brand-gray-500">checked in by {l.returned_to_name}</span>}
                    {(l.notes || l.return_notes) && <span className="basis-full text-brand-gray-600">{[l.notes, l.return_notes].filter(Boolean).join(' · ')}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  )
}

export default function Equipment() {
  const { user } = useSession()
  const canManage = atLeast(user, 'lead')
  const { error } = useToast()
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [condition, setCondition] = useState('')
  const [editing, setEditing] = useState(null)
  const [lending, setLending] = useState(null)
  const [returning, setReturning] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (category) params.set('category', category)
    if (condition) params.set('condition', condition)
    let stale = false
    const t = setTimeout(() => get(`/equipment?${params}`).then((d) => { if (!stale) setData(d) }).catch((e) => error('Couldn’t load equipment', e.message)), q ? 200 : 0)
    return () => { stale = true; clearTimeout(t) }
  }, [q, category, condition, reload]) // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => setReload((n) => n + 1)

  const items = data?.items || []
  const mine = data?.mine || []
  const filtered = !!(q || category || condition)
  const counts = useMemo(() => ({ out: items.reduce((s, i) => s + i.on_loan, 0), overdue: items.reduce((s, i) => s + i.holders.filter((h) => h.overdue).length, 0) }), [items])

  const actions = (item) => (
    <div className="flex items-center justify-end gap-1">
      {lendable(item) && <button type="button" className="btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setLending(item) }}>{canManage ? 'Lend' : 'Borrow'}</button>}
      {canManage && <button type="button" className="btn-icon" aria-label={`Edit ${item.name}`} onClick={(e) => { e.stopPropagation(); setEditing(item) }}><Pencil className="w-4 h-4" /></button>}
    </div>
  )

  return (
    <div>
      <PageHeader title="Equipment" subtitle="Tools, laptops, spares and safety gear: where they live and who has them."
        actions={canManage && (
          <>
            <button type="button" className="btn-secondary" onClick={() => downloadFile('/api/equipment/export.csv', 'equipment.csv').catch((e) => error('Couldn’t export', e.message))}><Download className="w-4 h-4" />Export CSV</button>
            <button type="button" className="btn-primary" onClick={() => setEditing('new')}><Plus className="w-4 h-4" />Add item</button>
          </>
        )} />

      {mine.length > 0 && (
        <section className="card mb-6" aria-label="Items you’re holding">
          <h2 className="px-5 pt-4 pb-2 text-sm font-semibold text-brand-black">You’re holding</h2>
          <ul className="divide-y divide-brand-gray-100">
            {mine.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <button type="button" className="font-medium text-brand-black hover:underline text-left truncate max-w-full" onClick={() => setViewing(l.equipment_id)}>
                    {l.quantity > 1 ? `${l.quantity} × ` : ''}{l.equipment_name}
                  </button>
                  <p className={`text-xs ${l.overdue ? 'text-status-danger font-medium' : 'text-brand-gray-500'}`}>
                    {l.due_on ? `${l.overdue ? 'Overdue: was due' : 'Due back'} ${fmtDue(l.due_on)}` : `Since ${formatServerDate(l.lent_at)}`}
                  </p>
                </div>
                <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => setReturning({ loan: l, itemName: l.equipment_name })}><Undo2 className="w-3.5 h-3.5" />Return</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <label className="relative flex-1 min-w-0">
          <span className="sr-only">Search equipment</span>
          <Search className="w-4 h-4 text-brand-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input className="input pl-9" type="search" placeholder="Search name, tag, location" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="input sm:w-48" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {Object.entries(CATEGORY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <FilterChips className="mb-4" aria-label="Condition" scroll value={condition} onChange={setCondition} options={[
        { key: '', label: 'In use' },
        ...Object.entries(CONDITION).map(([k, c]) => ({ key: k, label: c.label })),
        { key: 'all', label: 'Everything' },
      ]} />

      {!data ? <div className="card"><SkeletonTable rows={6} cols={4} /></div> : items.length === 0 ? (
        <div className="card">
          <EmptyState icon={Wrench} title={filtered ? 'Nothing matches' : 'No equipment yet'}
            message={filtered ? 'Try another search or filter.' : canManage ? 'Add the tools, laptops and spares people borrow, so everyone can see what’s on the shelf and who has the rest.' : 'Leads add the team’s tools and spares here.'} />
        </div>
      ) : (
        <>
          <p className="text-xs text-brand-gray-500 mb-2">
            {items.length} {items.length === 1 ? 'item' : 'items'} · {counts.out} out
            {counts.overdue > 0 && <span className="text-status-danger font-medium"> · {counts.overdue} overdue</span>}
          </p>
          {/* Phones: cards. */}
          <ul className="md:hidden space-y-2">
            {items.map((item) => (
              <li key={item.id} className="card p-4 cursor-pointer" onClick={() => setViewing(item.id)}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-brand-black break-words">{item.name}</p>
                    <p className="text-xs text-brand-gray-500 break-words">{[CATEGORY[item.category], item.asset_tag, item.location].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className={`${CONDITION[item.condition].cls} shrink-0`}>{CONDITION[item.condition].label}</span>
                </div>
                <div className="flex items-end gap-3 mt-3 text-sm">
                  <div className="min-w-0 flex-1"><Availability item={item} /></div>
                  {actions(item)}
                </div>
              </li>
            ))}
          </ul>
          {/* Wider screens: a table. */}
          <div className="hidden md:block card overflow-x-auto">
            <table className="table min-w-[760px]">
              <thead><tr><th>Item</th><th>Location</th><th>Condition</th><th className="w-[32%]">Availability</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="cursor-pointer" onClick={() => setViewing(item.id)}>
                    <td>
                      <button type="button" className="font-medium text-brand-black hover:underline text-left" onClick={(e) => { e.stopPropagation(); setViewing(item.id) }}>{item.name}</button>
                      <p className="text-xs text-brand-gray-500">{CATEGORY[item.category]}{item.asset_tag ? ` · ${item.asset_tag}` : ''}</p>
                    </td>
                    <td className="text-brand-gray-600">{item.location || <span className="text-brand-gray-400">—</span>}</td>
                    <td><span className={CONDITION[item.condition].cls}>{CONDITION[item.condition].label}</span></td>
                    <td><Availability item={item} /></td>
                    <td>{actions(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {viewing && !editing && !lending && !returning && (
        <Detail id={viewing} onClose={() => setViewing(null)} onChanged={refresh}
          onLend={(item) => setLending(item)} onEdit={(item) => setEditing(item)} onReturn={(loan, itemName) => setReturning({ loan, itemName })} />
      )}
      {editing && <ItemForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />}
      {lending && <LendForm item={lending} onClose={() => setLending(null)} onDone={() => { setLending(null); refresh() }} />}
      {returning && <ReturnForm loan={returning.loan} itemName={returning.itemName} onClose={() => setReturning(null)} onDone={() => { setReturning(null); refresh() }} />}
    </div>
  )
}
