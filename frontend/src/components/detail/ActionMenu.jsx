// Overflow "•••" menu for detail pages, and the confirm dialog it uses.
//
// ActionMenu props:
//   items      [{ key, label, icon?, description?, title?, onSelect?, to?, href?, target?, danger?,
//                 disabled?, hidden?,
//                 confirm?: { title, message, confirmLabel?, cancelLabel?, busyLabel?, tone?: 'danger'|'primary' } },
//               { type: 'separator' },
//               { type: 'label', label }]
//              Hidden items are dropped. Leading, trailing and doubled separators collapse, and a
//              label with no item under it is dropped. No visible items → renders nothing.
//   label      trigger aria-label (default 'More actions')
//   placement  'bottom-end' (default) | 'top-end' | 'bottom-start' | 'top-start'. Flips to the other
//              side when there isn't room.
//   trigger    optional. A <button> element becomes the trigger (its props are merged); any other
//              node replaces the ••• icon inside the default trigger button.
//   triggerClassName  default 'btn-secondary w-9 h-9 p-0'
//   disabled, className (extra classes on the default trigger)
//
// Behaviour:
//   - The popover and the confirm dialog render through Portal with position: fixed computed from
//     the trigger's rect, so overflow-hidden cards, table scrollers and transformed ancestors (the
//     route fade, Stagger) can't clip or shift them.
//   - Enter / Space / ArrowDown open it and focus the first item (ArrowUp: the last). A pointer open
//     focuses the menu itself, so arrows work without a highlighted first row.
//   - ArrowUp/ArrowDown wrap, Home/End jump, a letter jumps to the next matching item.
//   - Escape closes and returns focus to the trigger; Tab closes and moves on from the trigger.
//     Outside pointerdown, window resize and any scroll also close it.
//   - An item with `confirm` opens a small dialog. An async onSelect keeps the confirm button busy
//     until it settles. Focus returns to the trigger afterwards.
//
// ConfirmDialog (internal to components/detail; not in the barrel): a thin wrapper that renders
// components/forms/ConfirmDialog, the app's one confirm dialog, through Portal.
//   open, title ('Are you sure?'), message, confirmLabel ('Confirm'), cancelLabel ('Cancel'),
//   busyLabel (default `${confirmLabel}…`), tone ('danger' (default) | 'primary'),
//   onConfirm (may return a promise), onClose(confirmed: boolean).
//   Unlike the forms dialog, it closes itself: onClose(true) runs once onConfirm settles, even when
//   it throws or rejects (callers report their own failures). Cancel, Esc and the backdrop call
//   onClose(false) and are ignored while busy. Danger focuses Cancel first, primary the confirm button.

import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ellipsis } from 'lucide-react'
import FormsConfirmDialog from '../forms/ConfirmDialog'
import { Portal, renderIcon, rovingIndex, useIsomorphicLayoutEffect } from './detailUtils'

const GAP = 6
const EDGE = 8

const isAction = (it) => !!it && it.type !== 'separator' && it.type !== 'label'

export function normalizeMenuItems(items) {
  const visible = (Array.isArray(items) ? items : []).filter(it => it && !it.hidden)
  const out = []
  visible.forEach((it, i) => {
    if (it.type === 'separator') {
      if (out.length > 0 && out[out.length - 1].type !== 'separator') out.push(it)
      return
    }
    if (it.type === 'label') {
      if (isAction(visible[i + 1])) out.push(it)
      return
    }
    out.push(it)
  })
  while (out.length > 0 && out[out.length - 1].type === 'separator') out.pop()
  return out
}

// Pure placement math (fixed coordinates). Exported for tests.
export function menuPosition({ trigger, menu, viewport, placement = 'bottom-end' }) {
  const [sidePref, alignPref] = String(placement).split('-')
  const align = alignPref === 'start' ? 'start' : 'end'
  const below = viewport.height - trigger.bottom - GAP - EDGE
  const above = trigger.top - GAP - EDGE
  let side = sidePref === 'top' ? 'top' : 'bottom'
  if (side === 'bottom' && menu.height > below && above > below) side = 'top'
  else if (side === 'top' && menu.height > above && below > above) side = 'bottom'
  const room = Math.max(0, side === 'bottom' ? below : above)
  const maxHeight = menu.height > room ? Math.max(120, room) : null
  const height = maxHeight == null ? menu.height : Math.min(menu.height, maxHeight)
  const rawTop = side === 'bottom' ? trigger.bottom + GAP : trigger.top - GAP - height
  const top = Math.max(EDGE, Math.min(rawTop, viewport.height - EDGE - height))
  const rawLeft = align === 'start' ? trigger.left : trigger.right - menu.width
  const left = Math.max(EDGE, Math.min(rawLeft, viewport.width - EDGE - menu.width))
  return { top, left, maxHeight, side, align }
}

export default function ActionMenu({
  items, label = 'More actions', placement = 'bottom-end', trigger,
  triggerClassName = 'btn-secondary w-9 h-9 p-0', disabled = false, className = '',
}) {
  const entries = normalizeMenuItems(items)
  const actions = entries.filter(isAction)
  const hasActions = actions.length > 0

  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const [confirmItem, setConfirmItem] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const itemRefs = useRef([])
  const openFocus = useRef(null) // 'first' | 'last' | 'menu' while a focus move is pending
  const uid = useId()
  const triggerId = `${uid}trigger`
  const menuId = `${uid}menu`
  itemRefs.current.length = actions.length

  const customTrigger = isValidElement(trigger) && trigger.type === 'button'
  const labelledBy = (customTrigger && trigger.props.id) || triggerId

  const focusTrigger = useCallback(() => { triggerRef.current?.focus?.({ preventScroll: true }) }, [])
  const focusItem = useCallback((index) => { itemRefs.current[index]?.focus?.({ preventScroll: true }) }, [])

  function openMenu(focus) {
    if (disabled || !hasActions) return
    openFocus.current = focus
    setPos(null)
    setOpen(true)
  }
  function closeMenu(returnFocus) {
    setOpen(false)
    if (returnFocus) focusTrigger()
  }

  // Everything disappeared while open (e.g. the status changed): close.
  useEffect(() => { if (open && !hasActions) setOpen(false) }, [open, hasActions])

  // Measure while hidden, then place before paint.
  useIsomorphicLayoutEffect(() => {
    if (!open) return
    const t = triggerRef.current
    const m = menuRef.current
    if (!t || !m) return
    const r = t.getBoundingClientRect()
    setPos(menuPosition({
      trigger: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
      menu: { width: m.offsetWidth, height: m.offsetHeight },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      placement,
    }))
  }, [open, placement])

  // Move focus once the menu is visible (hidden elements can't take focus).
  useIsomorphicLayoutEffect(() => {
    if (!open || !pos || openFocus.current == null) return
    const how = openFocus.current
    openFocus.current = null
    if (how === 'first') focusItem(0)
    else if (how === 'last') focusItem(actions.length - 1)
    else menuRef.current?.focus({ preventScroll: true })
  }, [open, pos])

  useEffect(() => {
    if (!open) return undefined
    const inside = (node) =>
      (menuRef.current && menuRef.current.contains(node)) || (triggerRef.current && triggerRef.current.contains(node))
    const onPointerDown = (e) => { if (!inside(e.target)) setOpen(false) }
    const onScroll = (e) => {
      const inMenu = menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)
      if (!inMenu) setOpen(false)
    }
    const onResize = () => setOpen(false)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  function onTriggerClick(e) {
    if (open) closeMenu(false)
    else openMenu(e.detail === 0 ? 'first' : 'menu') // detail 0 = keyboard-initiated click
  }

  function onTriggerKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const where = e.key === 'ArrowDown' ? 'first' : 'last'
      if (open) focusItem(where === 'first' ? 0 : actions.length - 1)
      else openMenu(where)
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      closeMenu(false)
    }
  }

  function onMenuKeyDown(e) {
    const current = itemRefs.current.indexOf(document.activeElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeMenu(true)
      return
    }
    if (e.key === 'Tab') {
      // Focus goes back to the trigger synchronously; the browser's Tab then moves on from there.
      closeMenu(true)
      return
    }
    const next = rovingIndex(current, e.key, actions.length, 'vertical')
    if (next != null) {
      e.preventDefault()
      focusItem(next)
      return
    }
    if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ch = e.key.toLowerCase()
      const n = actions.length
      for (let step = 1; step <= n; step++) {
        const i = (current + step + n) % n
        const text = typeof actions[i].label === 'string' ? actions[i].label : (itemRefs.current[i]?.textContent || '')
        if (text.trim().toLowerCase().startsWith(ch)) {
          focusItem(i)
          break
        }
      }
    }
  }

  function activate(item, e) {
    if (item.disabled) {
      e.preventDefault()
      return
    }
    if (item.confirm) {
      e.preventDefault()
      setOpen(false)
      setConfirmItem(item)
      return
    }
    closeMenu(true)
    item.onSelect?.(e)
  }

  if (!hasActions && !confirmItem) return null

  const triggerProps = {
    ref: triggerRef,
    type: 'button',
    disabled,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
  }
  let triggerEl = null
  if (hasActions && customTrigger) {
    const own = trigger.props
    triggerEl = cloneElement(trigger, {
      ...triggerProps,
      id: own.id || triggerId,
      onClick: (e) => { own.onClick?.(e); if (!e.defaultPrevented) onTriggerClick(e) },
      onKeyDown: (e) => { own.onKeyDown?.(e); if (!e.defaultPrevented) onTriggerKeyDown(e) },
    })
  } else if (hasActions) {
    triggerEl = (
      <button
        {...triggerProps}
        id={triggerId}
        aria-label={label}
        title={label}
        onClick={onTriggerClick}
        onKeyDown={onTriggerKeyDown}
        className={`${triggerClassName} ${className}`.trim()}
      >
        {trigger ?? <Ellipsis className="h-4 w-4" aria-hidden="true" />}
      </button>
    )
  }

  let actionIndex = -1
  const menu = open && hasActions ? (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-labelledby={labelledBy}
      aria-orientation="vertical"
      tabIndex={-1}
      onKeyDown={onMenuKeyDown}
      className="menu-pop min-w-[220px] max-w-[calc(100vw-16px)] p-1 outline-none"
      style={{
        position: 'fixed',
        top: pos ? pos.top : 0,
        left: pos ? pos.left : 0,
        maxHeight: pos?.maxHeight ?? undefined,
        overflowY: pos?.maxHeight ? 'auto' : undefined,
        visibility: pos ? 'visible' : 'hidden',
        transformOrigin: `${pos?.side === 'top' ? 'bottom' : 'top'} ${pos?.align === 'start' ? 'left' : 'right'}`,
      }}
    >
      {entries.map((it, i) => {
        if (it.type === 'separator') {
          return <div key={`separator-${i}`} role="separator" className="-mx-1 my-1 h-px bg-brand-gray-100" />
        }
        if (it.type === 'label') {
          return (
            <div key={`label-${i}`} role="presentation" className="px-3 pb-1 pt-2 text-xs font-medium text-brand-gray-400">
              {it.label}
            </div>
          )
        }
        actionIndex += 1
        const index = actionIndex
        return (
          <MenuItem
            key={it.key ?? `item-${i}`}
            item={it}
            itemRef={(el) => { itemRefs.current[index] = el }}
            onActivate={activate}
            onHover={() => { if (document.activeElement !== itemRefs.current[index]) focusItem(index) }}
            onLeave={() => menuRef.current?.focus({ preventScroll: true })}
          />
        )
      })}
    </div>
  ) : null

  const confirm = confirmItem?.confirm || {}
  return (
    <>
      {triggerEl}
      <Portal>{menu}</Portal>
      <ConfirmDialog
        open={!!confirmItem}
        title={confirm.title}
        message={confirm.message}
        confirmLabel={confirm.confirmLabel || (typeof confirmItem?.label === 'string' ? confirmItem.label : undefined)}
        cancelLabel={confirm.cancelLabel}
        busyLabel={confirm.busyLabel}
        tone={confirm.tone || (confirmItem?.danger ? 'danger' : 'primary')}
        onConfirm={() => confirmItem?.onSelect?.()}
        onClose={() => { setConfirmItem(null); focusTrigger() }}
      />
    </>
  )
}

function MenuItem({ item, itemRef, onActivate, onHover, onLeave }) {
  const danger = !!item.danger
  const disabled = !!item.disabled
  const className = [
    'flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors duration-100 focus-visible:outline-none',
    danger
      ? 'text-status-danger hover:bg-red-50 focus:bg-red-50'
      : 'text-brand-gray-700 hover:bg-brand-gray-50 hover:text-brand-black focus:bg-brand-gray-50 focus:text-brand-black',
    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
  ].join(' ')

  const content = (
    <>
      {item.icon ? (
        <span className={`mt-[3px] flex shrink-0 ${danger ? '' : 'text-brand-gray-400'}`}>
          {renderIcon(item.icon, 'h-3.5 w-3.5')}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block">{item.label}</span>
        {item.description ? (
          <span className={`mt-0.5 block text-xs ${danger ? 'text-red-500' : 'text-brand-gray-500'}`}>{item.description}</span>
        ) : null}
      </span>
    </>
  )

  const props = {
    ref: itemRef,
    role: 'menuitem',
    tabIndex: -1,
    'aria-disabled': disabled || undefined,
    title: item.title,
    className,
    onClick: (e) => onActivate(item, e),
    onPointerMove: onHover,
    onPointerLeave: onLeave,
    onKeyDown: (e) => {
      // Space activates links too (native only for buttons, and only on keyup).
      if (e.key === ' ') {
        e.preventDefault()
        e.currentTarget.click()
      }
    },
  }

  if (item.to && !disabled) return <Link to={item.to} {...props}>{content}</Link>
  if (item.href && !disabled) {
    return (
      <a href={item.href} target={item.target} rel={item.target === '_blank' ? 'noopener noreferrer' : undefined} {...props}>
        {content}
      </a>
    )
  }
  return <button type="button" {...props}>{content}</button>
}

export function ConfirmDialog({
  open, title = 'Are you sure?', message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', busyLabel,
  tone = 'danger', onConfirm, onClose,
}) {
  // The forms dialog stays busy while the returned promise is pending and leaves closing to its
  // caller, so close here once onConfirm settles, whether it worked or not.
  function handleConfirm() {
    const done = () => { onClose?.(true) }
    let result
    try {
      result = onConfirm?.()
    } catch {
      result = undefined
    }
    if (result && typeof result.then === 'function') return Promise.resolve(result).then(done, done)
    done()
    return undefined
  }

  return (
    <Portal>
      <FormsConfirmDialog
        open={!!open}
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        busyLabel={busyLabel || `${confirmLabel}…`}
        tone={tone === 'primary' ? 'default' : 'danger'}
        onConfirm={handleConfirm}
        onCancel={() => onClose?.(false)}
      />
    </Portal>
  )
}
