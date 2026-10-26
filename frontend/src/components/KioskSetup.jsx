// Leads set up shop kiosks here: a link to open on the tablet by the shop door. The link is shown
// once (the server keeps only a hash), lasts a season by default, and can be turned off any time.
import { useEffect, useState } from 'react'
import { Copy, MonitorSmartphone, Power } from 'lucide-react'
import { del, get, post } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { fmtDay, parseServerTime, relative } from '../lib/format'
import Modal from './ui/Modal'

export default function KioskSetup({ onClose }) {
  const [kiosks, setKiosks] = useState(null)
  const [name, setName] = useState('Shop door')
  const [created, setCreated] = useState(null) // { name, url } just made, shown once
  const { success, error } = useToast()
  const load = () => get('/kiosks').then((d) => setKiosks(d.kiosks)).catch((e) => error('Couldn’t load kiosks', e.message))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const create = async (e) => {
    e.preventDefault()
    try {
      const res = await post('/kiosks', { name: name.trim() })
      setCreated({ name: res.kiosk.name, url: `${window.location.origin}/kiosk/${res.token}` })
      load()
    } catch (err) { error('Couldn’t set up the kiosk', err.message) }
  }
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); success('Link copied') } catch { error('Couldn’t copy', 'Select the link and copy it by hand.') } }

  return (
    <Modal open onClose={onClose} title="Shop kiosk" size="md">
      <div className="space-y-5">
        <p className="text-sm text-brand-gray-600">
          Open a kiosk link on a tablet by the shop door. While a meeting is running, students tap their name to check in.
          The tablet doesn’t sign in as anyone: the link can only show first names and record check-ins. Check-ins say which
          kiosk they came from, and you can correct any of them on the meeting page.
        </p>

        {created ? (
          <div className="rounded-xl border border-accent-500/40 bg-accent-500/[0.07] p-4">
            <p className="text-sm font-medium">“{created.name}” is ready. Open this link on the tablet:</p>
            <div className="flex gap-2 mt-2">
              <input readOnly className="input font-mono text-xs" value={created.url} onFocus={(e) => e.target.select()} aria-label="Kiosk link" />
              <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => copy(created.url)}><Copy className="w-3.5 h-3.5" />Copy</button>
            </div>
            <p className="text-xs text-brand-gray-500 mt-2">This is the only time the link is shown. Anyone with it can check people in, so don’t post it anywhere. Lost it? Turn this kiosk off and make a new one.</p>
          </div>
        ) : (
          <form onSubmit={create} className="flex gap-2">
            <input className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Shop door" aria-label="Kiosk name" required />
            <button className="btn-primary shrink-0" disabled={!name.trim()}><MonitorSmartphone className="w-4 h-4" />Set up kiosk</button>
          </form>
        )}

        <div>
          <p className="label">Active kiosks</p>
          {!kiosks ? <p className="text-sm text-brand-gray-500">Loading…</p> : kiosks.length === 0 ? <p className="text-sm text-brand-gray-500">None yet.</p> : (
            <ul className="divide-y divide-brand-gray-100 rounded-xl border border-brand-gray-200">
              {kiosks.map((k) => (
                <li key={k.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{k.name}</p>
                    <p className="text-xs text-brand-gray-500 truncate">
                      {k.last_used_at ? `Last used ${relative(parseServerTime(k.last_used_at))}` : 'Never opened'} · until {fmtDay(parseServerTime(k.expires_at))}{k.created_by_name ? ` · set up by ${k.created_by_name}` : ''}
                    </p>
                  </div>
                  <button type="button" className="btn-secondary btn-sm" onClick={async () => { try { await del(`/kiosks/${k.id}`); success(`“${k.name}” turned off`); if (created?.name === k.name) setCreated(null); load() } catch (e) { error('Couldn’t turn it off', e.message) } }}>
                    <Power className="w-3.5 h-3.5" />Turn off
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
