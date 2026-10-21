// Small shared UI pieces, in ProjectPro's visual language (glass cards, ink buttons, soft pills).
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { initials } from '../lib/format'
import { STATUS, STATUSES } from '../lib/constants'

export function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div className="page-header">
      <div className="min-w-0">
        <h1 className="page-title truncate">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

const AVATAR_TONES = ['bg-green-100 text-green-800', 'bg-blue-100 text-blue-800', 'bg-amber-100 text-amber-800', 'bg-violet-100 text-violet-800', 'bg-pink-100 text-pink-800', 'bg-teal-100 text-teal-800', 'bg-orange-100 text-orange-800']
function tone(id = '') {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length]
}

export function Avatar({ user, name, size = 24, className = '' }) {
  const label = user?.name || name || ''
  return (
    <span title={label || 'Unassigned'} style={{ width: size, height: size, fontSize: size * 0.42 }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-white ${label ? tone(user?.id || label) : 'bg-brand-gray-100 text-brand-gray-400 border border-dashed border-brand-gray-300'} ${className}`}>
      {label ? initials(label) : ''}
    </span>
  )
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="empty-state">
      {Icon && <Icon className="empty-state-icon" />}
      <p className="empty-state-title">{title}</p>
      {body && <p className="empty-state-body">{body}</p>}
      {action}
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/40 animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`glass-strong border rounded-card w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] flex flex-col animate-scale-in`}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-heading">{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 pb-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-brand-gray-200 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// A popover anchored to its trigger. Closes on outside click and Escape.
export function Popover({ trigger, children, align = 'left', className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className={`menu-pop absolute mt-1 min-w-[11rem] ${align === 'right' ? 'right-0' : 'left-0'} ${className}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ children, onClick, active, danger }) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-brand-gray-100 ${active ? 'font-medium text-brand-black' : danger ? 'text-status-danger' : 'text-brand-gray-700'}`}>
      {children}
    </button>
  )
}

// The full-width coloured status cell from Monday, as a picker.
export function StatusPicker({ value, onChange, disabled, compact }) {
  const s = STATUS[value] || STATUSES[0]
  return (
    <Popover trigger={({ toggle }) => (
      <button type="button" disabled={disabled} onClick={toggle} aria-label={`Status: ${s.label}`}
        className={`${s.cls} ${compact ? 'px-2 py-0.5 text-xs rounded-full' : 'w-full h-8 text-xs rounded-md'} font-medium whitespace-nowrap transition-[filter] hover:brightness-105 disabled:cursor-default`}>
        {s.label}
      </button>
    )}>
      {(close) => (
        <div className="p-1.5 grid gap-1 w-44">
          {STATUSES.map((opt) => (
            <button key={opt.id} type="button" onClick={() => { onChange(opt.id); close() }}
              className={`${opt.cls} h-8 rounded-md text-xs font-medium ${opt.id === value ? 'ring-2 ring-offset-1 ring-brand-black/40' : ''}`}>{opt.label}</button>
          ))}
        </div>
      )}
    </Popover>
  )
}

export function PersonPicker({ value, users, onChange, disabled, label = 'Owner' }) {
  const current = users.find((u) => u.id === value)
  const [q, setQ] = useState('')
  const shown = users.filter((u) => u.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <Popover trigger={({ toggle }) => (
      <button type="button" onClick={toggle} disabled={disabled} aria-label={`${label}: ${current?.name || 'nobody'}`}
        className="flex items-center gap-1.5 min-w-0 rounded-md px-1 py-0.5 hover:bg-brand-gray-100 disabled:hover:bg-transparent">
        <Avatar user={current} size={22} />
        <span className="truncate text-sm text-brand-gray-700">{current?.name || ''}</span>
      </button>
    )}>
      {(close) => (
        <div className="w-56">
          <div className="px-2 pt-1 pb-1.5"><input autoFocus className="input py-1.5" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="max-h-60 overflow-y-auto">
            <MenuItem onClick={() => { onChange(null); close() }}><Avatar size={20} /> Unassigned</MenuItem>
            {shown.map((u) => (
              <MenuItem key={u.id} active={u.id === value} onClick={() => { onChange(u.id); close() }}>
                <Avatar user={u} size={20} /> <span className="truncate">{u.name}</span>
              </MenuItem>
            ))}
          </div>
        </div>
      )}
    </Popover>
  )
}

export function ProgressBar({ counts, total }) {
  if (!total) return <div className="h-1.5 rounded-full bg-brand-gray-100" />
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-brand-gray-100" aria-hidden="true">
      {STATUSES.filter((s) => s.id !== 'not_started').map((s) => counts[s.id] ? <div key={s.id} className={s.dot} style={{ width: `${(counts[s.id] / total) * 100}%` }} /> : null)}
    </div>
  )
}

// ── Toasts ──
const ToastContext = createContext(() => {})
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const push = useCallback((message, kind = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3000)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="glass-strong border rounded-xl px-4 py-2.5 text-sm flex items-center gap-2 shadow-pop animate-toast-in max-w-sm">
            {t.kind === 'error' ? <AlertTriangle className="w-4 h-4 text-status-danger shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-status-success shrink-0" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// Runs an async action, toasting its error. Returns the result or undefined.
export function useAction() {
  const toast = useToast()
  return useCallback(async (fn, success) => {
    try {
      const out = await fn()
      if (success) toast(success)
      return out
    } catch (e) {
      toast(e.message || 'Something went wrong.', 'error')
      return undefined
    }
  }, [toast])
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-xs text-brand-gray-500 mt-1">{hint}</span>}
    </label>
  )
}

export function Spinner() {
  return <div className="space-y-3 animate-fade-in">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
}
