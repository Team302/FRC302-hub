// Promise-based confirm dialog for list pages. Replaces native confirm(). It renders
// forms/ConfirmDialog, the app's one confirm dialog, so it looks and behaves like
// every other confirm.
//
//   const [confirm, confirmDialog] = useConfirm()
//   if (!(await confirm({ title: 'Delete this expense?', message: "This can't be undone.", confirmLabel: 'Delete', tone: 'danger' }))) return
//   return <>{confirmDialog}{/* page */}</>
//
// confirm(options) → Promise<boolean>
//   title        - dialog title (default 'Are you sure?')
//   message      - body text or node (optional)
//   confirmLabel - confirm button text (default 'Confirm')
//   cancelLabel  - cancel button text (default 'Cancel')
//   tone         - 'default' (btn-primary) | 'danger' (btn-danger)
//
// The dialog closes itself as soon as it settles. It resolves true from the confirm
// button, or Enter while focus is not on another control. It resolves false from
// Cancel, Esc, the backdrop, a newer confirm() call, or unmount. Focus starts on
// Cancel for danger and on the confirm button otherwise (ConfirmDialog's rule), and
// returns to whatever was focused when confirm() was called (e.g. the RowMenu
// trigger). The dialog is portaled to document.body, so it can be rendered anywhere
// in the page tree.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ConfirmDialog from '../forms/ConfirmDialog'

const CONTROL = 'button, a[href], input, select, textarea, [contenteditable="true"], [role="button"], [role="menuitem"], [role="checkbox"], [role="switch"]'

function ConfirmHost({ request, onSettle }) {
  const open = !!request
  const opts = request?.options || {}

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key !== 'Enter' || e.defaultPrevented || e.repeat || e.isComposing) return
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const el = document.activeElement
      if (el && el !== document.body && el.closest?.(CONTROL)) return
      e.preventDefault()
      onSettle(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onSettle])

  const node = (
    <ConfirmDialog
      open={open}
      title={opts.title ?? 'Are you sure?'}
      message={opts.message}
      confirmLabel={opts.confirmLabel ?? 'Confirm'}
      cancelLabel={opts.cancelLabel ?? 'Cancel'}
      tone={opts.tone === 'danger' ? 'danger' : 'default'}
      onConfirm={() => onSettle(true)}
      onCancel={() => onSettle(false)}
    />
  )
  return typeof document !== 'undefined' ? createPortal(node, document.body) : node
}

export function useConfirm() {
  const [request, setRequest] = useState(null)
  const resolveRef = useRef(null)
  const returnFocusRef = useRef(null)

  const settle = useCallback((value) => {
    const resolve = resolveRef.current
    if (!resolve) return
    resolveRef.current = null
    setRequest(null)
    const el = returnFocusRef.current
    returnFocusRef.current = null
    if (el && el.isConnected && typeof el.focus === 'function') el.focus({ preventScroll: true })
    resolve(!!value)
  }, [])

  const confirm = useCallback((options = {}) => {
    const pending = resolveRef.current
    if (pending) {
      resolveRef.current = null
      pending(false) // a newer request replaces the open one; keep the original focus target
    } else if (typeof document !== 'undefined') {
      const active = document.activeElement
      returnFocusRef.current = active && active !== document.body ? active : null
    }
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setRequest({ options: options || {} })
    })
  }, [])

  useEffect(() => () => {
    const resolve = resolveRef.current
    resolveRef.current = null
    resolve?.(false)
  }, [])

  // A [function, element] pair for the caller to destructure, not a list React renders, so it needs no key.
  // eslint-disable-next-line react/jsx-key
  return [confirm, <ConfirmHost request={request} onSettle={settle} />]
}

export default useConfirm
