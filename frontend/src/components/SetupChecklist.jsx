// First-run checklist for mentors on Home: the handful of things that make the hub useful to the
// team. Each step checks itself off from real data; the whole card can be dismissed.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { get } from '../lib/api'
import { useSession } from '../context/Session'

const KEY = 'hub302.setupDismissed'

export default function SetupChecklist({ upcomingMeetings }) {
  const { users, boards, openNew } = useSession()
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })
  const [counts, setCounts] = useState(null)
  useEffect(() => {
    if (dismissed) return
    Promise.all([get('/vault').catch(() => ({ entries: [] })), get('/events?scope=all').catch(() => ({ events: [] })), get('/push/config').catch(() => ({ endpoints: [] }))])
      .then(([v, e, p]) => setCounts({ vault: v.entries.length, events: e.events.length, push: p.endpoints.length }))
  }, [dismissed])
  if (dismissed || !counts) return null

  const steps = [
    { done: users.length > 2, label: 'Add the team', hint: 'People → Add person. Students sign in with the email you enter.', to: '/team' },
    { done: boards.length > 0, label: 'Create your first board', hint: 'Start from the Robot build or Parts & purchasing template.', action: () => openNew('board') },
    { done: upcomingMeetings > 0, label: 'Schedule meetings', hint: 'A weekly series with the same agenda takes one form.', action: () => openNew('meeting') },
    { done: counts.events > 0, label: 'Add the season’s events', hint: 'Kickoff, competitions and deadlines get a countdown on everyone’s Home.', to: '/season' },
    { done: counts.vault > 0, label: 'Move shared logins into the vault', hint: 'Onshape, the FIRST dashboard, social accounts, shop Wi-Fi.', to: '/vault' },
    { done: counts.push > 0, label: 'Turn on notifications on your phone', hint: 'Inbox → Turn on. Ask students to do the same.', to: '/inbox' },
  ]
  const doneCount = steps.filter((s) => s.done).length
  if (doneCount === steps.length) return null

  return (
    <section className="card mb-6">
      <header className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-brand-gray-200">
        <div className="flex-1">
          <h2 className="text-[15px] font-semibold">Set up Team 302 Hub</h2>
          <p className="text-xs text-brand-gray-500">{doneCount} of {steps.length} done</p>
        </div>
        <div className="w-32 h-1.5 rounded-full bg-brand-gray-100 overflow-hidden"><div className="h-full bg-accent-500" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
        <button type="button" className="btn-icon" aria-label="Hide setup checklist" onClick={() => { try { localStorage.setItem(KEY, '1') } catch { /* this tab only */ } setDismissed(true) }}><X className="w-4 h-4" /></button>
      </header>
      <ol className="divide-y divide-brand-gray-100">
        {steps.map((s) => {
          const body = (
            <>
              <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${s.done ? 'bg-accent-600 border-accent-600 text-white' : 'border-brand-gray-300'}`}>{s.done && <Check className="w-3 h-3" strokeWidth={3} />}</span>
              <span className="flex-1 min-w-0">
                <span className={`block text-sm ${s.done ? 'text-brand-gray-400 line-through' : 'font-medium'}`}>{s.label}</span>
                {!s.done && <span className="block text-xs text-brand-gray-500">{s.hint}</span>}
              </span>
            </>
          )
          const cls = 'w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-brand-gray-50 transition-colors'
          return <li key={s.label}>{s.to ? <Link to={s.to} className={cls}>{body}</Link> : <button type="button" onClick={s.action} className={cls}>{body}</button>}</li>
        })}
      </ol>
    </section>
  )
}
