// "…" actions menu for list rows, mobile cards, board cards and the phone
// header overflow. The popover is portaled to document.body with fixed
// positioning: the route/tab fades run transforms on ancestors (which would
// re-anchor `fixed`), and the table wrapper clips.
//
// Props:
//   items     - MenuItem[] = { key?, label, icon?, onSelect?, href?, external?, tone?: 'danger',
//               disabled?, hidden?, separatorBefore? }
//               href → <Link>; href + external → <a target="_blank" rel="noreferrer">; else <button>.
//               A mailto:, tel: or sms: href is always a plain same-tab <a href> (never a new tab,
//               even with external: a new tab would just open empty next to the mail/phone app).
//   label     - accessible name for the trigger, e.g. "Actions for INV-2064" (required)
//   align     - 'end' (default; menu right edge on the trigger's right edge) | 'start'
//   trigger   - optional. A DOM element (e.g. <button className="btn-secondary btn-sm px-2">…</button>)
//               is cloned with the ref, handlers and aria attributes (its own ref is replaced).
//               Any other node replaces the MoreHorizontal icon inside the default icon button.
//   reveal    - hover-reveal on pointer devices inside a `.group` ancestor (row/card). Always
//               visible on touch, while the menu is open, and while focus is inside the group.
//   className - extra classes on the trigger
// Renders nothing when every item is hidden.
//
// Keyboard: Enter/Space/↓ open and focus the first item, ↑ the last (a pointer
// click focuses the menu itself). Inside: ↑/↓ wrap, Home/End jump, Esc closes and
// returns focus to the trigger, Tab closes and moves on from the trigger. Disabled
// items are skipped. Closes on outside pointerdown, any scroll and resize.
// Selecting an item closes the menu BEFORE running onSelect, so a confirm dialog
// never stacks on the menu. Focus goes back on the trigger, except for in-app and
// new-tab links (the page they open owns focus; mail/phone links keep the page, so
// they return it). Clicks and keys inside the menu don't propagate to row/card handlers.
//
// RowMenuPanel (named export) is the popover markup alone (used for SSR tests).

import { Fragment, cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

const TRIGGER = 'btn-icon shrink-0 w-11 h-11 md:w-8 md:h-8 aria-expanded:bg-brand-gray-100 aria-expanded:text-brand-black'
const REVEAL = 'transition-opacity duration-150 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100'
const ITEM = 'flex w-full items-center gap-2.5 h-8 px-2.5 rounded-lg text-left text-sm whitespace-nowrap outline-none select-none transition-colors duration-100'
const ITEM_TONE = {
  default: 'text-brand-gray-700 hover:bg-brand-gray-50 hover:text-brand-black focus:bg-brand-gray-100 focus:text-brand-black',
  danger: 'text-status-danger hover:bg-red-50 focus:bg-red-50',
}

// Mail, phone and text links: handed to the OS as-is, in the same tab.
const PLAIN_LINK = /^(?:mailto|tel|sms):/i
const isPlainLink = (href) => typeof href === 'string' && PLAIN_LINK.test(href)

const stop = (e) => e.stopPropagation()

export function RowMenuPanel({ items = [], id, labelledBy, pos, align = 'end', menuRef, onKeyDown, onSelect }) {
  const above = pos?.placement === 'top'
  const origin = above
    ? (align === 'start' ? 'origin-bottom-left' : 'origin-bottom-right')
    : (align === 'start' ? 'origin-top-left' : 'origin-top-right')
  const style = pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }
  return (
    <div
      ref={menuRef}
      id={id}
      role="menu"
      aria-labelledby={labelledBy}
      aria-orientation="vertical"
      tabIndex={-1}
      className={`menu-pop fixed min-w-[180px] max-w-[calc(100vw-16px)] outline-none ${origin}`}
      style={style}
      onKeyDown={onKeyDown}
      onClick={stop}
      onAuxClick={stop}
    >
      <div className="px-1">
        {items.map((item, i) => {
          const Icon = item.icon
          const danger = item.tone === 'danger'
          const props = {
            role: 'menuitem',
            tabIndex: -1,
            'aria-disabled': item.disabled ? true : undefined,
            'data-menu-item': item.disabled ? undefined : '',
            className: `${ITEM} ${danger ? ITEM_TONE.danger : ITEM_TONE.default}${item.disabled ? ' opacity-50 pointer-events-none' : ''}`,
            onClick: (e) => onSelect?.(item, e),
          }
          const body = (
            <>
              {Icon && <Icon className={`w-3.5 h-3.5 shrink-0${danger ? '' : ' text-brand-gray-400'}`} aria-hidden="true" />}
              <span className="truncate">{item.label}</span>
            </>
          )
          const key = item.key ?? (typeof item.label === 'string' ? item.label : i)
          return (
            <Fragment key={key}>
              {item.separatorBefore && i > 0 && <div role="separator" className="-mx-1 my-1 border-t border-brand-gray-100" />}
              {isPlainLink(item.href) ? (
                <a href={item.href} {...props}>{body}</a>
              ) : item.href && item.external ? (
                <a href={item.href} target="_blank" rel="noreferrer" {...props}>{body}</a>
              ) : item.href ? (
                <Link to={item.href} {...props}>{body}</Link>
              ) : (
                <button type="button" {...props}>{body}</button>
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

export default function RowMenu({ items = [], label, align = 'end', trigger, reveal = false, className = '' }) {
  const [open, setOpen] = useState(false)
  const [focusTarget, setFocusTarget] = useState('menu')
  const [pos, setPos] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const baseId = useId()
  const triggerId = `rowmenu-${baseId.replace(/:/g, '')}`
  const menuId = `${triggerId}-menu`

  const visible = (items || []).filter(item => item && !item.hidden)

  const close = useCallback((returnFocus) => {
    setOpen(false)
    setPos(null)
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true })
  }, [])

  // Place the popover under (or above) the trigger before paint.
  useIsoLayoutEffect(() => {
    if (!open) return
    const t = triggerRef.current
    const m = menuRef.current
    if (!t || !m) return
    const r = t.getBoundingClientRect()
    const vw = document.documentElement.clientWidth || window.innerWidth
    const vh = window.innerHeight
    const w = m.offsetWidth
    const h = m.offsetHeight
    let left = align === 'start' ? r.left : r.right - w
    left = Math.max(8, Math.min(left, vw - w - 8))
    let top = r.bottom + 4
    let placement = 'bottom'
    if (top + h > vh - 8) {
      if (r.top - 4 - h >= 8) { top = r.top - 4 - h; placement = 'top' }
      else top = Math.max(8, vh - 8 - h)
    }
    setPos({ top: Math.round(top), left: Math.round(left), placement })
  }, [open, align])

  // Move focus in once the popover is positioned (hidden elements can't take focus).
  useIsoLayoutEffect(() => {
    if (!open || !pos) return
    const menu = menuRef.current
    if (!menu) return
    const els = Array.from(menu.querySelectorAll('[data-menu-item]'))
    const target = focusTarget === 'first' ? els[0] : focusTarget === 'last' ? els[els.length - 1] : null
    ;(target || menu).focus({ preventScroll: true })
  }, [open, pos])

  // Dismissal: outside pointerdown, any scroll (capture), resize.
  useEffect(() => {
    if (!open) return
    const focusInside = () => !!menuRef.current?.contains(document.activeElement)
    function onPointerDown(e) {
      if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      close(false)
    }
    function onScroll(e) {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return
      close(focusInside())
    }
    function onResize() { close(focusInside()) }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, close])

  if (visible.length === 0) return null

  function openMenu(target) {
    setFocusTarget(target)
    setOpen(true)
  }

  function onTriggerClick(e) {
    e.stopPropagation()
    if (open) { close(false); return }
    // detail === 0: activated from the keyboard (Enter/Space) → focus the first item.
    openMenu(e.detail === 0 ? 'first' : 'menu')
  }

  function onTriggerKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      openMenu(e.key === 'ArrowUp' ? 'last' : 'first')
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation() // keep a surrounding card's Enter handler out of it; the native click opens
    }
  }

  function onMenuKeyDown(e) {
    e.stopPropagation()
    const menu = menuRef.current
    if (!menu) return
    const els = Array.from(menu.querySelectorAll('[data-menu-item]'))
    const i = els.indexOf(document.activeElement)
    const focusAt = (j) => { if (els.length) els[(j + els.length) % els.length].focus({ preventScroll: true }) }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusAt(i < 0 ? 0 : i + 1); break
      case 'ArrowUp': e.preventDefault(); focusAt(i < 0 ? els.length - 1 : i - 1); break
      case 'Home': e.preventDefault(); focusAt(0); break
      case 'End': e.preventDefault(); focusAt(els.length - 1); break
      case 'Escape': e.preventDefault(); close(true); break
      case 'Tab':
        // Focus the trigger and let the default Tab move on from there.
        triggerRef.current?.focus({ preventScroll: true })
        close(false)
        break
      default: break
    }
  }

  function onSelect(item, e) {
    if (item.disabled) { e.preventDefault(); return }
    // The link's own default action still runs (the click isn't prevented).
    if (item.href && !isPlainLink(item.href)) { close(false); item.onSelect?.(); return }
    close(true)
    item.onSelect?.()
  }

  const triggerProps = {
    ref: triggerRef,
    id: triggerId,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
  }
  const revealClass = reveal ? REVEAL : ''

  let triggerEl
  if (isValidElement(trigger) && typeof trigger.type === 'string') {
    const own = trigger.props
    triggerEl = cloneElement(trigger, {
      ...triggerProps,
      type: trigger.type === 'button' ? (own.type || 'button') : own.type,
      'aria-label': own['aria-label'] ?? label,
      className: [own.className, revealClass, className].filter(Boolean).join(' '),
      onClick: (e) => { own.onClick?.(e); if (!e.defaultPrevented) onTriggerClick(e) },
      onKeyDown: (e) => { own.onKeyDown?.(e); if (!e.defaultPrevented) onTriggerKeyDown(e) },
    })
  } else {
    triggerEl = (
      <button
        type="button"
        {...triggerProps}
        aria-label={label}
        onClick={onTriggerClick}
        onKeyDown={onTriggerKeyDown}
        className={[TRIGGER, revealClass, className].filter(Boolean).join(' ')}
      >
        {trigger ?? <MoreHorizontal className="w-4 h-4" aria-hidden="true" />}
      </button>
    )
  }

  const panel = open ? (
    <RowMenuPanel
      items={visible}
      id={menuId}
      labelledBy={triggerId}
      pos={pos}
      align={align}
      menuRef={menuRef}
      onKeyDown={onMenuKeyDown}
      onSelect={onSelect}
    />
  ) : null

  return (
    <>
      {triggerEl}
      {panel && (typeof document !== 'undefined' ? createPortal(panel, document.body) : panel)}
    </>
  )
}
