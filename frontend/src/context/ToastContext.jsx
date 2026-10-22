// Toasts. API (unchanged, plus additive options):
//   const { toast, success, error, warning, info, dismiss } = useToast()
//   toast({ type = 'info', title, message, duration, action }) -> id
//     duration - ms; default 4000 (6000 when an action is given); 0 = stays until dismissed
//     action   - optional { label, onClick } rendered as a link under the message;
//                clicking it runs onClick and dismisses the toast
//   success(title, message, options?) / error / warning / info - shorthands;
//     `options` (optional) accepts { duration, action }
//   dismiss(id) - dismiss a toast early
//
// Error/warning toasts live in an assertive live region, success/info in a
// polite one. Auto-dismiss pauses while a toast is hovered or focused. Toasts
// fade up on enter and fade/scale out on exit (instant under reduced motion).
// z-[60] keeps them above Modal (z-50).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { prefersReducedMotion } from '../components/ui/Motion'

const ToastContext = createContext(null)
let toastId = 0

const EXIT_MS = 150
const DEFAULT_DURATION = 4000
const ACTION_DURATION = 6000
const RESUME_MIN_MS = 1000

const ICONS = { success: CheckCircle2, error: AlertCircle, warning: AlertTriangle, info: Info }
const TINTS = {
  success: 'bg-green-50 text-green-600',
  error:   'bg-red-50 text-red-600',
  warning: 'bg-amber-50 text-amber-600',
  info:    'bg-blue-50 text-blue-600',
}
const ASSERTIVE_TYPES = new Set(['error', 'warning'])

function Toast({ toast, onDismiss }) {
  const { id, type, title, message, action, duration, leaving } = toast
  const Icon = ICONS[type] || Info
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss
  const timer = useRef(null)
  const hovered = useRef(false)
  const focused = useRef(false)

  // Auto-dismiss with pause/resume.
  useEffect(() => {
    if (!(duration > 0)) return
    let handle = null
    let remaining = duration
    let startedAt = 0
    const run = () => {
      if (handle != null) return
      startedAt = Date.now()
      handle = setTimeout(() => { handle = null; onDismissRef.current(id) }, remaining)
    }
    const halt = () => {
      if (handle == null) return
      clearTimeout(handle)
      handle = null
      remaining = Math.max(RESUME_MIN_MS, remaining - (Date.now() - startedAt))
    }
    timer.current = { run, halt }
    if (!hovered.current && !focused.current) run()
    return () => {
      clearTimeout(handle)
      handle = null
      timer.current = null
    }
  }, [id, duration])

  const pause = () => timer.current?.halt()
  const resume = () => { if (!hovered.current && !focused.current) timer.current?.run() }

  return (
    <div
      className={`pointer-events-auto relative flex w-full gap-3 rounded-card border border-brand-gray-200 bg-white p-3.5 pr-10 shadow-pop sm:w-[22rem] ${
        leaving ? 'opacity-0 translate-y-1 scale-[0.98] transition duration-150' : 'animate-fade-up'}`}
      onMouseEnter={() => { hovered.current = true; pause() }}
      onMouseLeave={() => { hovered.current = false; resume() }}
      onFocus={() => { focused.current = true; pause() }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return
        focused.current = false
        resume()
      }}
    >
      <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${TINTS[type] || TINTS.info}`}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        {title && <p className="text-sm font-medium text-brand-black">{title}</p>}
        {message && <p className="text-sm text-brand-gray-500 mt-0.5 break-words">{message}</p>}
        {action?.label && (
          <button
            type="button"
            className="link text-sm mt-1.5"
            onClick={() => {
              try { action.onClick?.() } finally { onDismiss(id) }
            }}
          >
            {action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        className="btn-icon absolute right-2.5 top-2.5 h-6 w-6"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const exitTimers = useRef(new Set())

  useEffect(() => {
    const timers = exitTimers.current
    return () => {
      timers.forEach(clearTimeout)
      timers.clear()
    }
  }, [])

  const dismiss = useCallback((id) => {
    setToasts(prev => (prev.some(t => t.id === id && !t.leaving)
      ? prev.map(t => (t.id === id ? { ...t, leaving: true } : t))
      : prev))
    const handle = setTimeout(() => {
      exitTimers.current.delete(handle)
      setToasts(prev => prev.filter(t => t.id !== id))
    }, prefersReducedMotion() ? 0 : EXIT_MS)
    exitTimers.current.add(handle)
  }, [])

  const toast = useCallback(({ type = 'info', title, message, duration, action } = {}) => {
    const id = ++toastId
    const ms = duration === undefined ? (action ? ACTION_DURATION : DEFAULT_DURATION) : duration
    setToasts(prev => [...prev, { id, type, title, message, action, duration: ms, leaving: false }])
    return id
  }, [])

  const success = useCallback((title, message, options) => toast({ ...options, type: 'success', title, message }), [toast])
  const error   = useCallback((title, message, options) => toast({ ...options, type: 'error',   title, message }), [toast])
  const warning = useCallback((title, message, options) => toast({ ...options, type: 'warning', title, message }), [toast])
  const info    = useCallback((title, message, options) => toast({ ...options, type: 'info',    title, message }), [toast])

  const value = useMemo(
    () => ({ toast, success, error, warning, info, dismiss }),
    [toast, success, error, warning, info, dismiss],
  )

  const assertive = toasts.filter(t => ASSERTIVE_TYPES.has(t.type))
  const polite = toasts.filter(t => !ASSERTIVE_TYPES.has(t.type))

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[60] flex flex-col items-stretch sm:items-end pointer-events-none">
        <div aria-live="assertive" aria-atomic="false" className="flex flex-col items-stretch sm:items-end gap-2">
          {assertive.map(t => <Toast key={t.id} toast={t} onDismiss={dismiss} />)}
        </div>
        <div
          aria-live="polite"
          aria-atomic="false"
          className={`flex flex-col items-stretch sm:items-end gap-2 ${assertive.length && polite.length ? 'mt-2' : ''}`}
        >
          {polite.map(t => <Toast key={t.id} toast={t} onDismiss={dismiss} />)}
        </div>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
