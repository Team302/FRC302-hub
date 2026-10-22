// Keyboard shortcuts, app-wide. Ignored while typing in a field. "?" lists them.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../context/Session'
import Modal from './ui/Modal'

const GO = { h: ['/', 'Home'], w: ['/my-work', 'My work'], i: ['/inbox', 'Inbox'], b: ['/boards', 'Boards'], m: ['/meetings', 'Meetings'], s: ['/season', 'Season'], v: ['/vault', 'Vault'], p: ['/team', 'People'] }

const typing = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

export default function Shortcuts() {
  const navigate = useNavigate()
  const { openNew } = useSession()
  const [help, setHelp] = useState(false)
  const pendingG = useRef(0)

  useEffect(() => {
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector('[role="dialog"][aria-modal="true"]')) return
      if (pendingG.current > Date.now() && GO[e.key]) { e.preventDefault(); pendingG.current = 0; navigate(GO[e.key][0]); return }
      pendingG.current = 0
      if (e.key === 'g') { pendingG.current = Date.now() + 1200; return }
      if (e.key === 'c') { e.preventDefault(); openNew('task') }
      else if (e.key === '/') { e.preventDefault(); document.querySelector('input[aria-label^="Search tasks"]')?.focus() }
      else if (e.key === '?') { e.preventDefault(); setHelp(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, openNew])

  if (!help) return null
  const Key = ({ children }) => <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-md border border-brand-gray-200 bg-brand-gray-50 text-xs font-medium">{children}</kbd>
  const Row = ({ keys, label }) => <li className="flex items-center justify-between py-1.5 text-sm"><span>{label}</span><span className="flex gap-1">{keys.map((k) => <Key key={k}>{k}</Key>)}</span></li>
  return (
    <Modal open onClose={() => setHelp(false)} title="Keyboard shortcuts" size="sm">
      <ul className="divide-y divide-brand-gray-100">
        <Row keys={['c']} label="New task" />
        <Row keys={['/']} label="Search" />
        <Row keys={['Ctrl', 'K']} label="Search (from anywhere)" />
        {Object.entries(GO).map(([k, [, label]]) => <Row key={k} keys={['g', k]} label={`Go to ${label}`} />)}
        <Row keys={['?']} label="This list" />
      </ul>
    </Modal>
  )
}
