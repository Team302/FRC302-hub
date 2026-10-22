// Calendar subscription: one private URL per person for Google Calendar, Apple Calendar or Outlook.
import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { del, get, post } from '../lib/api'
import useRun from '../lib/useRun'
import Modal from './ui/Modal'

export default function CalendarFeed({ onClose }) {
  const [enabled, setEnabled] = useState(null)
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const run = useRun()
  useEffect(() => { get('/me/calendar').then((d) => setEnabled(d.enabled)) }, [])

  const create = async () => {
    const res = await run(() => post('/me/calendar'))
    if (res) { setUrl(res.url); setEnabled(true) }
  }
  const off = async () => {
    if (await run(() => del('/me/calendar'), 'Calendar feed turned off')) { setUrl(''); setEnabled(false) }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* the field is selectable */ }
  }

  return (
    <Modal open onClose={onClose} title="Calendar feed" size="md"
      description="Team meetings you can see and your tasks with due dates, in your own calendar app. It updates on its own (usually within a few hours).">
      <div className="space-y-4">
        {url ? (
          <>
            <div className="flex gap-2">
              <input readOnly className="input font-mono text-xs" value={url} onFocus={(e) => e.target.select()} aria-label="Calendar feed URL" />
              <button type="button" className="btn-primary shrink-0" onClick={copy}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <p className="text-xs text-amber-700">Treat this link like a password: anyone with it can see your meetings and tasks. It’s only shown now; make a new one if you lose it.</p>
            <div className="card p-4 text-sm space-y-2">
              <p><span className="font-medium">Google Calendar:</span> Other calendars → + → From URL → paste.</p>
              <p><span className="font-medium">Apple Calendar:</span> File → New Calendar Subscription → paste.</p>
              <p><span className="font-medium">Outlook:</span> Add calendar → Subscribe from web → paste.</p>
            </div>
          </>
        ) : enabled === null ? <div className="skeleton h-10 rounded-lg" /> : enabled ? (
          <p className="text-sm text-brand-gray-600">You have a calendar feed. Make a new link if you lost it, or turn it off. Making a new link stops the old one.</p>
        ) : (
          <p className="text-sm text-brand-gray-600">You don’t have a calendar feed yet.</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {!url && <button type="button" className="btn-primary" onClick={create}>{enabled ? 'Make a new link' : 'Create my calendar link'}</button>}
          {enabled && <button type="button" className="btn-ghost" onClick={off}>Turn off</button>}
        </div>
      </div>
    </Modal>
  )
}
