// Accessible dialog shell. Matches the existing `fixed inset-0` centered-panel
// pattern used across pages (e.g. Money.RecordModal), unified into one reusable
// component with backdrop-click + Esc to close, a focused dialog, and
// role/aria attributes. Backdrop fades in; the panel scales in (both disabled
// under prefers-reduced-motion via globals.css).
//
// Props:
//   open     - when false, renders nothing
//   onClose  - called on backdrop click, Esc, or the header close button
//   title    - optional header title; header (with close button) is omitted if absent
//   children - dialog body
//   footer   - optional footer node (buttons); rendered in a padded footer row
//   size     - 'sm' | 'md' | 'lg' | 'xl' — panel max width (default 'md')
//
// Additive props (all optional; omitting them keeps the original behavior):
//   description      - node under the title (text-sm muted); wired to aria-describedby
//   icon             - lucide component (or element) shown in an accent tile left of the title
//   initialFocusRef  - ref to focus on open instead of the panel
//   dismissible      - default true; false ignores Esc and backdrop clicks and
//                      disables the header close button (e.g. while saving)
//   footerClassName  - replaces the default footer classes 'px-6 pb-6 flex gap-2'
//   aria-labelledby / aria-describedby - pass-through for dialogs that render
//                      their own heading in the body (e.g. ConfirmDialog)
//
// Esc only closes the topmost open Modal, so a dialog opened over another one
// closes alone. A backdrop click only closes when the press also started on the
// backdrop (dragging a text selection out of the panel no longer closes it).
//
// Focus: Tab and Shift+Tab wrap inside the topmost open Modal (disabled, inert and
// hidden controls are skipped; a radio group is one stop). When the dialog closes,
// or unmounts while open, focus goes back to the element that had it when the
// dialog opened. That return is only a fallback. It is skipped when something else
// has already taken focus (a caller's own return, e.g. QuickCreate, ConfirmDialog,
// ActionMenu), when the opener is gone, when the page navigated to another path
// while the dialog was open, and when it would pull focus out of another dialog
// that is still open.

import { createElement, isValidElement, useEffect, useId, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

// Open modals, topmost last. Each entry is { panel }.
const openStack = []

// Candidates for the Tab order; tabStops() filters them the way the browser does.
const TABBABLE = [
  'a[href]', 'area[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea', 'iframe',
  'summary', 'audio[controls]', 'video[controls]', '[contenteditable]', '[tabindex]',
].join(',')

const FOLLOWING = 4 // Node.DOCUMENT_POSITION_FOLLOWING

const currentPath = () => (typeof window !== 'undefined' && window.location ? window.location.pathname : '')

function inTabOrder(el) {
  const attr = el.getAttribute('tabindex')
  const explicit = attr == null ? NaN : parseInt(attr, 10)
  if (!Number.isNaN(explicit)) return explicit >= 0
  if (el.isContentEditable) return true
  return el.tabIndex >= 0
}

function isDisabled(el) {
  try { return el.matches(':disabled') } catch { return !!el.disabled }
}

// Tab stops inside `root` in DOM order, each an array of elements (a radio group is
// one stop). display:none is detected through layout, so it is only checked when
// the root has layout.
function tabStops(root) {
  const view = root.ownerDocument.defaultView
  const hasLayout = root.getClientRects().length > 0
  const stops = []
  const radioGroups = new Map()
  root.querySelectorAll(TABBABLE).forEach((el) => {
    if (!inTabOrder(el) || isDisabled(el) || el.closest('[inert]')) return
    if (hasLayout && el.getClientRects().length === 0) return
    if (view && view.getComputedStyle(el).visibility === 'hidden') return
    if (el.type === 'radio' && el.name) {
      const owner = el.form || root
      let byName = radioGroups.get(owner)
      if (!byName) { byName = new Map(); radioGroups.set(owner, byName) }
      let group = byName.get(el.name)
      if (!group) { group = []; byName.set(el.name, group); stops.push(group) }
      group.push(el)
      return
    }
    stops.push([el])
  })
  return stops
}

function focusStop(stop, forward) {
  const target = stop.find(el => el.type === 'radio' && el.checked) || (forward ? stop[0] : stop[stop.length - 1])
  target.focus()
}

// Wraps Tab at the last stop and Shift+Tab at the first. Anything in between is left
// to the browser. Focus outside the panel is brought back in.
function trapTab(e, panel) {
  const active = panel.ownerDocument.activeElement
  const inside = !!active && panel.contains(active)
  const stops = tabStops(panel)
  if (stops.length === 0) {
    e.preventDefault()
    if (active !== panel) panel.focus()
    return
  }
  const first = stops[0]
  const last = stops[stops.length - 1]
  if (e.shiftKey) {
    const atStart = !inside || first.includes(active) || !!(active.compareDocumentPosition(first[0]) & FOLLOWING)
    if (!atStart) return
    e.preventDefault()
    focusStop(last, false)
  } else {
    const atEnd = !inside || last.includes(active) || !!(last[last.length - 1].compareDocumentPosition(active) & FOLLOWING)
    if (!atEnd) return
    e.preventDefault()
    focusStop(first, true)
  }
}

function topOpenPanel() {
  for (let i = openStack.length - 1; i >= 0; i--) {
    const { panel } = openStack[i]
    if (panel && panel.isConnected) return panel
  }
  return null
}

function returnFocus(saved) {
  if (!saved) return
  const { el, path } = saved
  if (!el || !el.isConnected || typeof el.focus !== 'function') return
  if (path !== currentPath()) return
  const active = document.activeElement
  if (active && active !== document.body && active.isConnected) return
  const top = topOpenPanel()
  if (top && !top.contains(el)) return
  try { el.focus({ preventScroll: true }) } catch { /* ignore */ }
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  description,
  icon,
  initialFocusRef,
  dismissible = true,
  footerClassName,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
}) {
  const panelRef = useRef(null)
  const pressOnBackdrop = useRef(false)
  const returnFocusRef = useRef(null) // { el, path } of whatever had focus when the dialog opened
  const titleId = useId()
  const descriptionId = useId()

  // Latest values for the Esc listener. Callers often pass inline arrows, so
  // re-subscribing on every render would reorder the open stack.
  const onCloseRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)
  onCloseRef.current = onClose
  dismissibleRef.current = dismissible

  // Remember what had focus before the dialog takes it. This layout effect runs
  // before the focus effect below. Focus already inside the panel means StrictMode
  // re-ran the effects of a dialog that mounted open, so keep the opener we have.
  useIsoLayoutEffect(() => {
    if (!open) return
    const active = document.activeElement
    if (active && panelRef.current?.contains(active)) return
    returnFocusRef.current = active && active !== document.body ? { el: active, path: currentPath() } : null
  }, [open])

  // Esc to close and the Tab trap (topmost Modal only), and focus return on close.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const entry = { panel }
    openStack.push(entry)
    function onKey(e) {
      if (openStack[openStack.length - 1] !== entry) return
      if (e.key === 'Escape') {
        if (!dismissibleRef.current) return
        onCloseRef.current?.()
      } else if (e.key === 'Tab' && !e.defaultPrevented && !e.altKey && !e.ctrlKey && !e.metaKey && !e.isComposing) {
        if (panelRef.current) trapTab(e, panelRef.current)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = openStack.indexOf(entry)
      if (i !== -1) openStack.splice(i, 1)
      // Passive cleanups run after the DOM update, so a panel that is still in the
      // document was not closed (StrictMode's simulated unmount).
      if (panel && panel.isConnected) return
      const saved = returnFocusRef.current
      returnFocusRef.current = null
      returnFocus(saved)
    }
  }, [open])

  // Focus the dialog (or initialFocusRef) when it opens.
  useEffect(() => {
    if (!open) return
    const target = initialFocusRef?.current
    if (target && typeof target.focus === 'function') target.focus()
    else panelRef.current?.focus()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  const iconNode = icon
    ? (isValidElement(icon) ? icon : createElement(icon, { className: 'w-[18px] h-[18px]', 'aria-hidden': true }))
    : null
  const richHeader = !!(description || iconNode)
  const hasHeader = !!(title || richHeader)

  function onBackdropMouseDown(e) {
    pressOnBackdrop.current = e.target === e.currentTarget
  }

  function onBackdropClick(e) {
    const startedOnBackdrop = pressOnBackdrop.current
    pressOnBackdrop.current = false
    if (!dismissible || !startedOnBackdrop || e.target !== e.currentTarget) return
    onClose?.(e)
  }

  const closeButton = (extra = '') => (
    <button type="button" onClick={onClose} disabled={!dismissible} className={extra ? `btn-ghost p-1.5 -mr-1.5 ${extra}` : 'btn-ghost p-1.5 -mr-1.5'} aria-label="Close">
      <X className="w-4 h-4" />
    </button>
  )

  // Rendered into document.body: an ancestor with backdrop-filter or transform (the .glass topbar,
  // cards) becomes the containing block for a fixed child, which would size this overlay to that
  // ancestor instead of the viewport and push the dialog off-screen.
  const overlay = (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 animate-fade-in"
      onMouseDown={onBackdropMouseDown}
      onClick={onBackdropClick}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : (typeof title === 'string' ? title : undefined)}
        aria-labelledby={labelledBy || (title && typeof title !== 'string' ? titleId : undefined)}
        aria-describedby={describedBy || (description ? descriptionId : undefined)}
        className={`glass-strong rounded-2xl border w-full ${SIZES[size] || SIZES.md} max-h-[90vh] overflow-y-auto outline-none animate-scale-in`}
        onClick={(e) => e.stopPropagation()}
      >
        {hasHeader && (richHeader ? (
          <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-brand-gray-100">
            <div className="flex min-w-0 items-start gap-3">
              {iconNode && (
                <span aria-hidden="true" className="grid place-items-center w-9 h-9 shrink-0 rounded-lg bg-accent-50 text-accent-600 ring-1 ring-accent-100">
                  {iconNode}
                </span>
              )}
              <div className={`min-w-0 ${iconNode && !description ? 'pt-1.5' : ''}`}>
                {title && <h2 id={titleId} className="text-base font-semibold tracking-[-0.01em] text-brand-black">{title}</h2>}
                {description && <p id={descriptionId} className="text-sm text-brand-gray-500 mt-0.5">{description}</p>}
              </div>
            </div>
            {closeButton(`shrink-0 ${iconNode ? 'mt-1' : '-mt-0.5'}`)}
          </div>
        ) : (
          <div className="flex items-center justify-between px-6 py-4 border-b border-brand-gray-100">
            <h2 id={titleId} className="text-base font-semibold tracking-[-0.01em] text-brand-black">{title}</h2>
            {closeButton()}
          </div>
        ))}
        <div className="p-6">{children}</div>
        {footer && (
          <div className={footerClassName || 'px-6 pb-6 flex gap-2'}>{footer}</div>
        )}
      </div>
    </div>
  )
  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay
}
