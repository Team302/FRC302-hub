// The shop kiosk: a tablet by the door where students tap their name to check in to the meeting
// that's live. No sign-in; the URL is the credential (see worker/src/routes/kiosk.js). It can list
// names and record check-ins, nothing else. Tapping a name asks once more, so a stray tap doesn't
// check in the wrong person.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, Maximize, Search } from 'lucide-react'
import BrandMark, { TeamLogo } from '../components/brand/BrandMark'
import { initials } from '../lib/format'

const REFRESH_MS = 20000
const CONFIRM_MS = 8000 // the "check in as …?" prompt closes itself
const WELCOME_MS = 2500

async function call(path, body) {
  const res = await fetch(`/api/kiosk/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || `The server answered ${res.status}.`), { status: res.status })
  return data
}

// Keep the tablet's screen on while the kiosk is open, where the browser allows it.
function useWakeLock() {
  useEffect(() => {
    let lock = null
    const take = async () => { try { if (document.visibilityState === 'visible') lock = await navigator.wakeLock?.request('screen') } catch { /* not allowed */ } }
    take()
    document.addEventListener('visibilitychange', take)
    return () => { document.removeEventListener('visibilitychange', take); lock?.release?.().catch(() => {}) }
  }, [])
}

function Screen({ children }) {
  return <div className="dark min-h-screen bg-brand-gray-50 text-brand-black flex flex-col select-none">{children}</div>
}

export default function Kiosk() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [meetingId, setMeetingId] = useState(null)
  const [q, setQ] = useState('')
  const [subteam, setSubteam] = useState('')
  const [confirming, setConfirming] = useState(null)
  const [welcome, setWelcome] = useState(null)
  const [busy, setBusy] = useState(false)
  useWakeLock()

  const load = useCallback(() => call(token).then((d) => { setData(d); setError(null) }).catch((e) => setError(e)), [token])
  useEffect(() => {
    load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])
  useEffect(() => { if (!confirming) return undefined; const t = setTimeout(() => setConfirming(null), CONFIRM_MS); return () => clearTimeout(t) }, [confirming])
  useEffect(() => { if (!welcome) return undefined; const t = setTimeout(() => setWelcome(null), WELCOME_MS); return () => clearTimeout(t) }, [welcome])

  const meetings = data?.meetings || []
  const meeting = meetings.find((m) => m.id === meetingId) || meetings[0]
  const people = useMemo(() => {
    const list = (data?.people || []).filter((p) => (!subteam || p.subteam_id === subteam) && p.name.toLowerCase().includes(q.trim().toLowerCase()))
    // A subteam meeting puts that subteam first.
    return meeting?.subteam_id ? [...list.filter((p) => p.subteam_id === meeting.subteam_id), ...list.filter((p) => p.subteam_id !== meeting.subteam_id)] : list
  }, [data, q, subteam, meeting])

  async function checkIn(person) {
    setBusy(true)
    try {
      const res = await call(`${token}/checkin`, { meeting_id: meeting.id, user_id: person.id })
      setData((d) => ({ ...d, people: d.people.map((p) => (p.id === person.id ? { ...p, checked_in: { ...p.checked_in, [meeting.id]: res.status } } : p)) }))
      setWelcome({ name: person.name.split(' ')[0], late: res.status === 'late' })
      setQ('')
    } catch (e) {
      setWelcome({ error: e.message })
      load()
    } finally { setBusy(false); setConfirming(null) }
  }

  if (error && !data) {
    return (
      <Screen>
        <div className="flex-1 grid place-items-center p-8 text-center">
          <div><BrandMark size="lg" className="mx-auto" /><h1 className="text-2xl font-semibold mt-6">{error.status === 404 ? 'This kiosk is turned off' : 'Can’t reach the hub'}</h1><p className="text-brand-gray-500 mt-2 max-w-md">{error.message}</p></div>
        </div>
      </Screen>
    )
  }
  if (!data) return <Screen><div className="flex-1 grid place-items-center"><BrandMark size="lg" className="animate-pulse" /></div></Screen>

  const here = meeting ? data.people.filter((p) => p.checked_in[meeting.id] === 'present' || p.checked_in[meeting.id] === 'late').length : 0
  return (
    <Screen>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 px-6 sm:px-10 pt-6 pb-4 border-b border-brand-gray-200">
        <TeamLogo height={56} tone="dark" />
        <div className="flex-1 min-w-0">
          {meeting ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-accent-600">Checking in to</p>
              {meetings.length > 1 ? (
                <select className="bg-transparent text-2xl font-semibold outline-none -ml-1" value={meeting.id} onChange={(e) => setMeetingId(e.target.value)} aria-label="Meeting">
                  {meetings.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
              ) : <h1 className="text-2xl font-semibold truncate">{meeting.title}</h1>}
            </>
          ) : <h1 className="text-2xl font-semibold">No meeting is running</h1>}
        </div>
        {meeting && <p className="text-right"><span className="text-4xl font-semibold tabular-nums">{here}</span><span className="block text-xs text-brand-gray-500">checked in</span></p>}
        {document.fullscreenEnabled && !document.fullscreenElement && (
          <button type="button" className="btn-icon" aria-label="Full screen" onClick={() => document.documentElement.requestFullscreen().catch(() => {})}><Maximize className="w-5 h-5" /></button>
        )}
      </header>

      {!meeting ? (
        <div className="flex-1 grid place-items-center p-8 text-center">
          <p className="text-lg text-brand-gray-500 max-w-md">Check-in opens when whoever runs the meeting presses <b className="text-brand-black">Start</b>. This screen updates by itself.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 px-6 sm:px-10 py-4">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-gray-400 pointer-events-none" />
              <input className="input h-12 pl-11 text-lg" placeholder="Find your name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find your name" />
            </div>
            <div className="flex flex-wrap gap-2">
              {[{ id: '', name: 'Everyone' }, ...data.subteams.filter((s) => data.people.some((p) => p.subteam_id === s.id))].map((s) => (
                <button key={s.id} type="button" onClick={() => setSubteam(s.id)} className={`h-10 px-4 rounded-full text-sm font-medium border ${subteam === s.id ? 'bg-accent-600 border-accent-600 text-white' : 'border-brand-gray-200 text-brand-gray-600'}`}>{s.name}</button>
              ))}
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto px-6 sm:px-10 pb-10 grid gap-3 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] content-start">
            {people.map((p) => {
              const status = p.checked_in[meeting.id]
              const done = status === 'present' || status === 'late'
              return (
                <li key={p.id}>
                  <button type="button" disabled={done || busy || !!status} onClick={() => setConfirming(p)}
                    className={`w-full h-full min-h-[120px] rounded-2xl border p-4 flex flex-col items-center justify-center gap-2.5 text-center transition-transform active:scale-[0.97] ${done ? 'border-accent-500/40 bg-accent-500/10' : status ? 'border-brand-gray-200 opacity-50' : 'border-brand-gray-200 bg-white hover:border-accent-500/60'}`}>
                    <span className={`w-12 h-12 rounded-full grid place-items-center text-base font-semibold ${done ? 'bg-accent-600 text-white' : 'bg-brand-gray-100 text-brand-gray-600'}`}>{done ? <Check className="w-6 h-6" strokeWidth={3} /> : initials(p.name)}</span>
                    <span className="text-base font-medium leading-tight">{p.name}</span>
                    {status && <span className="text-xs text-brand-gray-500">{status === 'late' ? 'Here (late)' : status === 'present' ? 'Here' : status === 'excused' ? 'Excused' : 'Marked absent'}</span>}
                  </button>
                </li>
              )
            })}
            {people.length === 0 && <li className="col-span-full text-center text-brand-gray-500 py-10">No one matches “{q}”.</li>}
          </ul>
        </>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" onClick={() => setConfirming(null)}>
          <div role="dialog" aria-modal="true" aria-label={`Check in ${confirming.name}`} className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-pop" onClick={(e) => e.stopPropagation()}>
            <span className="w-20 h-20 mx-auto rounded-full grid place-items-center text-2xl font-semibold bg-brand-gray-100">{initials(confirming.name)}</span>
            <p className="text-2xl font-semibold mt-4">{confirming.name}</p>
            <p className="text-brand-gray-500 mt-1">Is this you?</p>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <button type="button" className="btn-secondary h-14 text-base" onClick={() => setConfirming(null)}>No</button>
              <button type="button" autoFocus className="btn-primary h-14 text-base" disabled={busy} onClick={() => checkIn(confirming)}>Check in</button>
            </div>
          </div>
        </div>
      )}
      {welcome && (
        <div className="fixed inset-x-0 bottom-8 z-50 flex justify-center px-6 pointer-events-none" role="status" aria-live="polite">
          <div className={`rounded-2xl px-8 py-5 text-xl font-semibold shadow-pop ${welcome.error ? 'bg-status-danger text-white' : 'bg-accent-600 text-white'}`}>
            {welcome.error || `Welcome, ${welcome.name}!${welcome.late ? ' (marked late)' : ''}`}
          </div>
        </div>
      )}
    </Screen>
  )
}
