// Team credential vault. Secrets are fetched one at a time on purpose (each fetch is logged),
// shown for a short while, then dropped from memory. Copying clears the clipboard after 30s
// if it still holds what we put there (best-effort: browsers only allow it while focused).
import { useEffect, useRef, useState } from 'react'
import { Copy, Eye, EyeOff, ExternalLink, History, KeyRound, Lock, Pencil, Plus, Search, ShieldCheck, Smartphone, Wand2 } from 'lucide-react'
import { del, get, patch, post } from '../lib/api'
import { useSession } from '../context/Session'
import { atLeast, VAULT_ACCESS } from '../lib/constants'
import { fmtFull, parseServerTime, relative } from '../lib/format'
import { useToast } from '../context/ToastContext'
import useRun from '../lib/useRun'
import { breachCount, generatePassword } from '../lib/passwords'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import PageHeader from '../components/ui/PageHeader'
import { SkeletonTable } from '../components/ui/Skeleton'
import Field from '../components/forms/Field'
import { useConfirm } from '../components/list/useConfirm'

const REVEAL_MS = 20000
const CLIPBOARD_MS = 30000
const STALE_DAYS = 365

async function copyAndClear(text, { success, error }, what) {
  try {
    await navigator.clipboard.writeText(text)
    success(`${what} copied`, 'The clipboard is cleared after 30 seconds.')
    setTimeout(async () => {
      try { if ((await navigator.clipboard.readText()) === text) await navigator.clipboard.writeText('') } catch { /* not focused or no permission */ }
    }, CLIPBOARD_MS)
  } catch {
    error('Couldn’t copy', 'The browser blocked clipboard access.')
  }
}

function SecretField({ entry }) {
  const [secret, setSecret] = useState(null)
  const timer = useRef(null)
  const run = useRun()
  const toast = useToast()
  useEffect(() => () => clearTimeout(timer.current), [])
  const fetchSecret = () => run(() => post(`/vault/${entry.id}/reveal`)).then((r) => r?.secret)
  const reveal = async () => {
    if (secret) { setSecret(null); return }
    const s = await fetchSecret()
    if (!s) return
    setSecret(s)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setSecret(null), REVEAL_MS)
  }
  const copy = async () => {
    const s = secret || (await fetchSecret())
    if (s) copyAndClear(s, toast, 'Password')
  }
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <code className="flex-1 min-w-0 truncate font-mono text-sm px-2 py-1 rounded-md bg-brand-gray-100">{secret ?? '••••••••••••'}</code>
      <button className="btn-icon" onClick={reveal} aria-label={secret ? 'Hide password' : 'Show password'} title={secret ? 'Hide' : 'Show (logged)'}>{secret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
      <button className="btn-icon" onClick={copy} aria-label="Copy password" title="Copy (logged)"><Copy className="w-4 h-4" /></button>
    </div>
  )
}

function TotpField({ entry }) {
  const [code, setCode] = useState(null)
  const [left, setLeft] = useState(0)
  const run = useRun()
  const toast = useToast()
  useEffect(() => {
    if (!code) return undefined
    const t = setInterval(() => setLeft((l) => { if (l <= 1) { setCode(null); return 0 } return l - 1 }), 1000)
    return () => clearInterval(t)
  }, [code])
  const get2fa = async () => {
    const r = await run(() => post(`/vault/${entry.id}/totp`))
    if (r) { setCode(r.code); setLeft(r.secondsLeft) }
  }
  return code ? (
    <div className="flex items-center gap-2">
      <code className="font-mono text-lg tracking-[0.2em] font-semibold">{code.slice(0, 3)} {code.slice(3)}</code>
      <span className={`text-xs tabular-nums ${left <= 5 ? 'text-status-danger' : 'text-brand-gray-500'}`}>{left}s</span>
      <button className="btn-icon" onClick={() => copyAndClear(code, toast, 'Code')} aria-label="Copy code"><Copy className="w-4 h-4" /></button>
    </div>
  ) : (
    <button className="btn-secondary btn-sm" onClick={get2fa}><Smartphone className="w-4 h-4" />Get 2FA code</button>
  )
}

function EntryForm({ entry, user, users, onSaved, onClose, onDeleted }) {
  const editing = !!entry
  const [form, setForm] = useState({
    name: entry?.name || '', url: entry?.url || '', username: entry?.username || '', notes: entry?.notes || '',
    min_role: entry?.min_role || 'lead', owner_id: entry?.owner_id || user.id, secret: '', totp: '', clearTotp: false,
    subteam_ids: entry?.subteam_ids || [],
  })
  const { subteams } = useSession()
  const mentor = atLeast(user, 'admin')
  const toggleSubteam = (id) => setForm((f) => ({ ...f, subteam_ids: f.subteam_ids.includes(id) ? f.subteam_ids.filter((x) => x !== id) : [...f.subteam_ids, id] }))
  // A non-mentor limiting it to subteams has to stay on the list (the server refuses otherwise).
  const lockedOut = !mentor && form.subteam_ids.length > 0 && !form.subteam_ids.includes(user.subteam_id)
  const run = useRun()
  const [confirm, confirmDialog] = useConfirm()
  const [showSecret, setShowSecret] = useState(false)
  const [breach, setBreach] = useState(undefined) // undefined: not checked, null: couldn't check, n: times seen
  const checkBreach = async (pw) => { if (pw) setBreach(await breachCount(pw)) }
  const submit = async (e) => {
    e.preventDefault()
    if (form.secret) {
      const seen = breach === undefined ? await breachCount(form.secret) : breach
      setBreach(seen)
      if (seen > 0 && !(await confirm({ title: 'Save a breached password?', message: `This password has appeared in ${seen.toLocaleString()} data breaches, so it’s among the first ones attackers try. Change it on the site and save the new one instead.`, confirmLabel: 'Save anyway', tone: 'danger' }))) return
    }
    const body = { name: form.name, url: form.url, username: form.username, notes: form.notes, min_role: form.min_role, subteam_ids: form.subteam_ids }
    if (atLeast(user, 'admin')) body.owner_id = form.owner_id
    if (form.secret) body.secret = form.secret
    if (form.totp) body.totp = form.totp
    if (editing && form.clearTotp) body.totp = null
    const res = await run(() => (editing ? patch(`/vault/${entry.id}`, body) : post('/vault', body)), editing ? 'Saved' : 'Added to the vault')
    if (res) onSaved(res.entry)
  }
  const remove = async () => {
    if (!(await confirm({ title: `Delete “${entry.name}”?`, message: 'The login and its access log entry stay in the audit log, but the password is gone for good.', confirmLabel: 'Delete', tone: 'danger' }))) return
    if (await run(() => del(`/vault/${entry.id}`), 'Deleted')) onDeleted(entry.id)
  }
  const access = VAULT_ACCESS.filter((a) => a.id !== 'admin' || atLeast(user, 'admin'))
  return (
    <Modal open onClose={onClose} title={editing ? `Edit ${entry.name}` : 'Add to vault'} size="lg"
      footer={<>
        {editing && atLeast(user, 'admin') && <button type="button" className="btn-danger mr-auto" onClick={remove}>Delete</button>}
        <button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="vault-form" disabled={lockedOut}>{editing ? 'Save' : 'Add'}</button>
      </>}>
      {confirmDialog}
      <form id="vault-form" onSubmit={submit} className="grid sm:grid-cols-2 gap-4" autoComplete="off">
        <Field label="Name"><input className="input" required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Onshape team account" /></Field>
        <Field label="Link"><input className="input" type="url" maxLength={500} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" /></Field>
        <Field label="Username / email"><input className="input" maxLength={200} autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
        <Field label={editing ? 'New password' : 'Password'} hint={breach > 0 ? undefined : editing && entry.has_secret ? 'Leave blank to keep the current one.' : undefined}>
          <div className="flex gap-2">
            <input className="input font-mono" type={showSecret ? 'text' : 'password'} autoComplete="new-password" maxLength={2000} value={form.secret}
              onChange={(e) => { setForm({ ...form, secret: e.target.value }); setBreach(undefined) }} onBlur={() => checkBreach(form.secret)} />
            <button type="button" className="btn-secondary btn-sm shrink-0" title="Generate a strong password" onClick={() => { const p = generatePassword(); setForm({ ...form, secret: p }); setShowSecret(true); setBreach(0) }}><Wand2 className="w-4 h-4" />Generate</button>
          </div>
          {breach > 0 && <span className="block text-xs text-status-danger mt-1">This password has shown up in {breach.toLocaleString()} data breaches. Attackers try these first; use Generate instead.</span>}
          {breach === 0 && form.secret && <span className="block text-xs text-accent-700 mt-1">Not found in known data breaches.</span>}
        </Field>
        <Field label="Authenticator setup key (optional)" hint={editing && entry.has_totp ? '2FA is set up. Paste a new key to replace it.' : 'The text key or otpauth:// link shown when you enable 2FA. Then everyone with access can get codes.'}>
          <input className="input font-mono" autoComplete="off" maxLength={500} value={form.totp} onChange={(e) => setForm({ ...form, totp: e.target.value })} />
        </Field>
        <Field label="Who can see it">
          <select className="input" value={form.min_role} onChange={(e) => setForm({ ...form, min_role: e.target.value })}>
            {access.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </Field>
        <fieldset>
          <legend className="label">Only these subteams</legend>
          <p className="text-xs text-brand-gray-500 mb-2">{form.subteam_ids.length ? 'Only people on a checked subteam (and mentors) can see or reveal it.' : 'None checked: every subteam can see it.'}</p>
          <div className="flex flex-wrap gap-2">
            {subteams.map((st) => {
              const on = form.subteam_ids.includes(st.id)
              return (
                <button key={st.id} type="button" aria-pressed={on} onClick={() => toggleSubteam(st.id)}
                  className={`h-8 px-3 rounded-full text-sm border ${on ? 'bg-accent-600 border-accent-600 text-white' : 'border-brand-gray-200 text-brand-gray-600 hover:border-brand-gray-300'}`}>{st.name}</button>
              )
            })}
          </div>
          {lockedOut && <p className="text-xs text-status-danger mt-2">Include your own subteam, or you won’t be able to see this entry.</p>}
        </fieldset>
        {atLeast(user, 'admin') && (
          <Field label="Owner" hint="Who changes the password when someone leaves.">
            <select className="input" value={form.owner_id || ''} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
              {users.filter((u) => u.role !== 'member').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
        )}
        <div className="sm:col-span-2"><Field label="Notes" hint="Visible to everyone who can see the entry. Never put a password here.">
          <textarea className="input" rows={2} maxLength={2000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field></div>
        {editing && entry.has_totp && <label className="sm:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.clearTotp} onChange={(e) => setForm({ ...form, clearTotp: e.target.checked })} />Remove the authenticator</label>}
      </form>
    </Modal>
  )
}

function AuditModal({ entry, onClose }) {
  const [rows, setRows] = useState(null)
  useEffect(() => { get(`/vault/${entry.id}/audit`).then((d) => setRows(d.audit)) }, [entry.id])
  return (
    <Modal open onClose={onClose} title={`Access log: ${entry.name}`} size="lg">
      {!rows ? <SkeletonTable rows={4} cols={3} /> : rows.length === 0 ? <p className="text-sm text-brand-gray-500">No activity yet.</p> : (
        <table className="table">
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>IP</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td className="whitespace-nowrap">{fmtFull(parseServerTime(r.created_at))}</td><td>{r.actor_name || '—'}</td><td>{r.summary}</td><td className="font-mono text-xs">{r.ip || '—'}</td></tr>
          ))}</tbody>
        </table>
      )}
    </Modal>
  )
}

export default function Vault() {
  const { user, users, subteamById } = useSession()
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)
  const [audit, setAudit] = useState(null)
  useEffect(() => { get('/vault').then(setData) }, [])

  if (!data) return <div className="card"><SkeletonTable rows={4} cols={3} /></div>
  const needle = q.trim().toLowerCase()
  const entries = data.entries.filter((e) => !needle || `${e.name} ${e.username} ${e.url}`.toLowerCase().includes(needle))
  const saved = (entry) => {
    setData((d) => ({ ...d, entries: d.entries.some((e) => e.id === entry.id) ? d.entries.map((e) => (e.id === entry.id ? entry : e)) : [...d.entries, entry].sort((a, b) => a.name.localeCompare(b.name)) }))
    setEditing(null)
  }

  return (
    <div className="animate-fade-up">
      <PageHeader title="Vault" subtitle="Shared team logins. Every password reveal is recorded."
        actions={atLeast(user, 'lead') && data.configured && <button className="btn-primary" onClick={() => setEditing('new')}><Plus className="w-4 h-4" />Add login</button>} />

      <div className="card flex items-start gap-3 px-5 py-3.5 mb-5">
        <ShieldCheck className="w-5 h-5 text-accent-600 shrink-0 mt-0.5" />
        <p className="text-sm text-brand-gray-600">
          Passwords are encrypted on the server and only sent when you press <Eye className="inline w-3.5 h-3.5" /> or <Copy className="inline w-3.5 h-3.5" />.
          <strong className="font-medium text-brand-black"> Every reveal is logged with your name</strong> and mentors can see the log. {user.role === 'admin' ? 'As a mentor you can see every entry.' : user.role === 'lead' ? 'You can see entries shared with leads or with everyone.' : 'You can see entries shared with everyone on the team.'}
        </p>
      </div>

      {!data.configured ? (
        <div className="card"><EmptyState icon={Lock} title="The vault isn’t set up" message="The server has no VAULT_KEY yet, so nothing can be stored. See README → Deploying to Cloudflare." /></div>
      ) : (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-gray-400" />
            <input className="input pl-8" placeholder="Search logins" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search vault" />
          </div>
          {entries.length === 0 ? (
            <div className="card"><EmptyState icon={KeyRound} title={data.entries.length ? 'No matches' : 'Nothing here yet'} message={!data.entries.length && atLeast(user, 'lead') ? 'Add the team’s shared logins so they aren’t kept in group chats.' : undefined} /></div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {entries.map((e) => {
                const rotated = parseServerTime(e.rotated_at)
                const stale = rotated && Date.now() - rotated.getTime() > STALE_DAYS * 86400000
                return (
                  <article key={e.id} className="card p-4 space-y-3">
                    <header className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-brand-gray-100 flex items-center justify-center shrink-0"><KeyRound className="w-4 h-4 text-brand-gray-500" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">{e.name}</h3>
                          <span className={e.min_role === 'admin' ? 'badge-danger' : e.min_role === 'lead' ? 'badge-warning' : 'badge-gray'}>{VAULT_ACCESS.find((a) => a.id === e.min_role).label}</span>
                        </div>
                        {e.subteam_ids?.length > 0 && <p className="text-xs text-brand-gray-500 truncate" title="Only these subteams (and mentors) can see it">{e.subteam_ids.map((id) => subteamById[id]?.name || 'a removed subteam').join(' + ')} only</p>}
                        {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer" className="link text-xs inline-flex items-center gap-1 truncate max-w-full">{new URL(e.url).hostname}<ExternalLink className="w-3 h-3" /></a>}
                      </div>
                      <div className="flex">
                        {atLeast(user, 'admin') && <button className="btn-icon" onClick={() => setAudit(e)} aria-label="Access log" title="Access log"><History className="w-4 h-4" /></button>}
                        {e.can_edit && <button className="btn-icon" onClick={() => setEditing(e)} aria-label="Edit" title="Edit"><Pencil className="w-4 h-4" /></button>}
                      </div>
                    </header>
                    {e.username && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-brand-gray-500 w-16 shrink-0">User</span>
                        <code className="flex-1 truncate text-sm">{e.username}</code>
                        <CopyPlain text={e.username} />
                      </div>
                    )}
                    {e.has_secret && <div className="flex items-center gap-1.5"><span className="text-xs text-brand-gray-500 w-16 shrink-0">Password</span><div className="flex-1 min-w-0"><SecretField entry={e} /></div></div>}
                    {e.has_totp && <div className="flex items-center gap-1.5"><span className="text-xs text-brand-gray-500 w-16 shrink-0">2FA</span><TotpField entry={e} /></div>}
                    {e.notes && <p className="text-sm text-brand-gray-600 whitespace-pre-wrap">{e.notes}</p>}
                    <footer className="text-xs text-brand-gray-500 flex flex-wrap gap-x-3">
                      {e.owner_name && <span>Owner: {e.owner_name}</span>}
                      {rotated && <span className={stale ? 'text-amber-700 font-medium' : ''}>Password set {relative(rotated)}{stale ? ' — consider rotating' : ''}</span>}
                    </footer>
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}
      {editing && <EntryForm entry={editing === 'new' ? null : editing} user={user} users={users} onSaved={saved} onClose={() => setEditing(null)}
        onDeleted={(entryId) => { setData((d) => ({ ...d, entries: d.entries.filter((x) => x.id !== entryId) })); setEditing(null) }} />}
      {audit && <AuditModal entry={audit} onClose={() => setAudit(null)} />}
    </div>
  )
}

function CopyPlain({ text }) {
  const toast = useToast()
  return <button className="btn-icon" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success('Username copied'), () => toast.error('Couldn’t copy'))} aria-label="Copy username"><Copy className="w-4 h-4" /></button>
}
