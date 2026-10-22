// Confirmation dialog built on ui/Modal (size sm). Replaces window.confirm and
// one-off "are you sure" modals.
//
// Props:
//   open          - boolean
//   title         - heading (also the dialog's accessible name)
//   message       - node under the title (the consequence copy)
//   children      - optional extra body content under the message
//   confirmLabel  - default 'Confirm'
//   cancelLabel   - default 'Cancel'
//   busyLabel     - optional confirm text while busy (e.g. 'Deleting…')
//   tone          - 'default' | 'danger' (red confirm button + red icon tile)
//   icon          - lucide component or element; defaults to AlertTriangle for
//                   danger, none for default. Pass null to hide it.
//   busy          - external busy flag
//   onConfirm()   - may return a Promise: the dialog stays busy until it settles.
//                   It does not close itself; close it from the handler (set
//                   `open` false). A rejection keeps it open (and is logged).
//   onCancel()    - Cancel button, Esc or backdrop (all ignored while busy)
//   initialFocus  - 'cancel' | 'confirm'. Default: 'cancel' for danger,
//                   'confirm' otherwise.
// Focus returns to the element that had it before opening.
//
// Also exported: useConfirmDialog() -> [confirm, dialogElement]
//   const [confirm, confirmDialog] = useConfirmDialog()
//   if (!(await confirm({ title, message, tone: 'danger', confirmLabel }))) return
//   ...render {confirmDialog} once in the component.
//   Resolves true on confirm, false on cancel/Esc/backdrop/unmount.

import { createElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import Modal from '../ui/Modal'

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function focusIfConnected(el) {
  if (!el || !el.isConnected || typeof el.focus !== 'function') return
  try { el.focus({ preventScroll: true }) } catch { /* ignore */ }
}

export default function ConfirmDialog({
  open = false,
  title,
  message,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busyLabel,
  tone = 'default',
  icon,
  busy = false,
  onConfirm,
  onCancel,
  initialFocus,
}) {
  const danger = tone === 'danger'
  const [pending, setPending] = useState(false)
  const isBusy = !!busy || pending

  const cancelRef = useRef(null)
  const confirmRef = useRef(null)
  const returnFocusRef = useRef(null)
  const wasOpen = useRef(false)
  const wasBusy = useRef(isBusy)
  const mounted = useRef(false)
  const titleId = useId()
  const messageId = useId()

  const focusTarget = (initialFocus || (danger ? 'cancel' : 'confirm')) === 'cancel' ? cancelRef : confirmRef

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  // Remember what had focus before opening. A layout effect runs before
  // Modal's (passive) focus effect moves focus into the dialog.
  useIsoLayoutEffect(() => {
    if (!open) return
    const active = document.activeElement
    const panel = cancelRef.current?.closest('[role="dialog"]')
    if (active && active !== document.body && !(panel && panel.contains(active))) returnFocusRef.current = active
  }, [open])

  // Hand focus back when the dialog closes (or unmounts while open).
  useEffect(() => {
    if (wasOpen.current && !open) {
      focusIfConnected(returnFocusRef.current)
      returnFocusRef.current = null
    }
    wasOpen.current = open
  }, [open])
  useEffect(() => () => {
    if (wasOpen.current) focusIfConnected(returnFocusRef.current)
  }, [])

  // Disabled buttons drop focus while busy; if the dialog is still open when
  // work finishes (e.g. it failed), put focus back inside it.
  useEffect(() => {
    if (wasBusy.current && !isBusy && open) {
      const active = typeof document !== 'undefined' ? document.activeElement : null
      if (!active || active === document.body) focusTarget.current?.focus()
    }
    wasBusy.current = isBusy
  }, [isBusy, open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConfirm() {
    if (isBusy || !onConfirm) return
    let result
    try {
      result = onConfirm()
    } catch (err) {
      console.error(err)
      return
    }
    if (!result || typeof result.then !== 'function') return
    setPending(true)
    try {
      await result
    } catch (err) {
      console.error(err)
    } finally {
      if (mounted.current) setPending(false)
    }
  }

  function handleCancel() {
    if (!isBusy) onCancel?.()
  }

  const iconSource = icon === undefined ? (danger ? AlertTriangle : null) : icon
  const iconNode = !iconSource
    ? null
    : isValidElement(iconSource) ? iconSource : createElement(iconSource, { className: 'w-5 h-5', 'aria-hidden': true })

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      size="sm"
      dismissible={!isBusy}
      initialFocusRef={focusTarget}
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={message ? messageId : undefined}
      footerClassName="px-6 pb-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
      footer={
        <>
          <button ref={cancelRef} type="button" onClick={handleCancel} disabled={isBusy} className="btn-secondary">
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            disabled={isBusy}
            aria-busy={isBusy || undefined}
            className={danger ? 'btn-danger' : 'btn-primary'}
          >
            {isBusy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {isBusy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex gap-4">
        {iconNode && (
          <div
            aria-hidden="true"
            className={`grid place-items-center w-10 h-10 shrink-0 rounded-full ring-8 ${
              danger ? 'bg-red-50 text-red-600 ring-red-50/60' : 'bg-accent-50 text-accent-600 ring-accent-50/60'}`}
          >
            {iconNode}
          </div>
        )}
        <div className={`min-w-0 flex-1 ${iconNode ? (message ? 'pt-0.5' : 'pt-2') : ''}`}>
          {title && <h2 id={titleId} className="text-base font-semibold tracking-[-0.01em] text-brand-black">{title}</h2>}
          {message && <div id={messageId} className="text-sm text-brand-gray-500 mt-1">{message}</div>}
          {children}
        </div>
      </div>
    </Modal>
  )
}

export function useConfirmDialog() {
  const [request, setRequest] = useState(null)
  const pendingRef = useRef(null)

  const settle = useCallback((result) => {
    const current = pendingRef.current
    if (!current) return
    pendingRef.current = null
    setRequest(null)
    current.resolve(result)
  }, [])

  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    pendingRef.current?.resolve(false)
    const next = { options, resolve }
    pendingRef.current = next
    setRequest(next)
  }), [])

  useEffect(() => () => {
    pendingRef.current?.resolve(false)
    pendingRef.current = null
  }, [])

  const dialog = (
    <ConfirmDialog
      {...(request?.options || {})}
      open={!!request}
      busy={false}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  )

  return [confirm, dialog]
}
