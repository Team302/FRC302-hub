// A popover anchored to its trigger and portaled to <body>, so it escapes the board's
// horizontally scrolling table instead of being clipped by it. Closes on outside press, Escape,
// scroll of an ancestor, and resize; focus returns to the trigger.
//
//   <Popover trigger={({ open, toggle, ref }) => <button ref={ref} onClick={toggle}>…</button>}>
//     {(close) => …panel…}
//   </Popover>
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function Popover({ trigger, children, align = 'start', width, className = '' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)

  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus?.({ preventScroll: true })
  }, [])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const panelW = panelRef.current?.offsetWidth || width || 220
    const panelH = panelRef.current?.offsetHeight || 240
    let left = align === 'end' ? r.right - panelW : align === 'center' ? r.left + r.width / 2 - panelW / 2 : r.left
    left = Math.max(8, Math.min(left, window.innerWidth - panelW - 8))
    const below = r.bottom + 4
    const top = below + panelH > window.innerHeight - 8 && r.top - panelH - 4 > 8 ? r.top - panelH - 4 : below
    setPos({ top, left })
  }, [open, align, width])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
    const onScroll = (e) => { if (!panelRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [open, close])

  return (
    <>
      {trigger({ open, toggle: () => setOpen((o) => !o), ref: triggerRef })}
      {open && createPortal(
        <div ref={panelRef} role="dialog" style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, zIndex: 60 }}
          className={`menu-pop ${className}`}>
          {children(close)}
        </div>,
        document.body,
      )}
    </>
  )
}
