// "Notifications on this device": Web Push for the current browser. Each device is turned on
// separately. iPhone/iPad only support it once the app is added to the Home Screen (iOS 16.4+).
import { useEffect, useState } from 'react'
import { BellOff, BellRing, Send } from 'lucide-react'
import { api, get, post } from '../lib/api'
import { b64ToUint8 } from '../lib/push'
import useRun from '../lib/useRun'

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

export default function PushToggle() {
  const run = useRun()
  const [state, setState] = useState('loading') // loading | unsupported | ios-install | not-configured | denied | off | on
  const [busy, setBusy] = useState(false)
  const [config, setConfig] = useState(null)

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setState(isIOS() && !isStandalone() ? 'ios-install' : 'unsupported')
        return
      }
      const cfg = await get('/push/config').catch(() => null)
      setConfig(cfg)
      if (!cfg?.enabled) { setState('not-configured'); return }
      if (Notification.permission === 'denied') { setState('denied'); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setState(sub && cfg.endpoints.includes(sub.endpoint) ? 'on' : 'off')
    })()
  }, [])

  const turnOn = async () => {
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setState(permission === 'denied' ? 'denied' : 'off'); return }
      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(config.public_key) })
      if (await run(() => post('/push/subscriptions', sub.toJSON()), 'Notifications are on for this device')) setState('on')
    } catch (e) {
      run(() => Promise.reject(e))
    } finally { setBusy(false) }
  }
  const turnOff = async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await api('/push/subscriptions', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => {})
        await sub.unsubscribe()
      }
      setState('off')
    } finally { setBusy(false) }
  }

  const hint = {
    'ios-install': 'On iPhone and iPad, add this app to your Home Screen first (Share → Add to Home Screen), then open it from there to turn on notifications.',
    unsupported: 'This browser can’t receive notifications. Try Chrome, Edge, Firefox or Safari.',
    'not-configured': 'Push notifications aren’t set up on the server yet (VAPID keys, see README).',
    denied: 'Notifications are blocked for this site. Allow them in your browser’s site settings, then reload.',
  }[state]

  return (
    <div className="card px-5 py-4 flex flex-wrap items-center gap-3">
      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${state === 'on' ? 'bg-accent-100 text-accent-700' : 'bg-brand-gray-100 text-brand-gray-500'}`}>
        {state === 'on' ? <BellRing className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
      </span>
      <div className="flex-1 min-w-[12rem]">
        <p className="text-sm font-medium">{state === 'on' ? 'Notifications are on for this device' : 'Get notifications on this device'}</p>
        <p className="text-xs text-brand-gray-500">{hint || 'Assignments, @mentions, updates on your tasks and due-date reminders, even when the app is closed.'}</p>
      </div>
      {state === 'off' && <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={turnOn}>Turn on</button>}
      {state === 'on' && (
        <>
          <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => run(() => post('/push/test'), 'Test notification sent')}><Send className="w-3.5 h-3.5" />Send a test</button>
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={turnOff}>Turn off</button>
        </>
      )}
    </div>
  )
}
