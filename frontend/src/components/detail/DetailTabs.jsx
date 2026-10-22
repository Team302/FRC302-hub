// In-page tab strip (same look as SectionLayout's strip) and a matching tab panel.
//
// DetailTabs props:
//   tabs       [{ id, label, count?, hidden? }]
//   value      active tab id; onChange(id)
//   ariaLabel  tablist label (default 'Sections'), e.g. `${t('client')} sections`
//   idPrefix   prefix for tab/panel ids (default 'detail'): tab `${idPrefix}-tab-${id}`,
//              panel `${idPrefix}-panel-${id}` (also exported as tabDomId / panelDomId)
//   className
//   Sliding accent underline, horizontal scrolling on narrow screens (the active tab is kept in
//   view), roving tabIndex; ArrowLeft/ArrowRight/Home/End move and select.
//
// DetailTabPanel props: tabId, idPrefix ('detail'), animate (true: fade-up on tab switch, skipping
//   the first render), className, style, children. Renders div role="tabpanel". Keep page modals
//   outside panels: the switch animation uses a transform.

import { useCallback, useRef, useState } from 'react'
import { useEnterAnimation } from '../ui/Motion'
import { rovingIndex, useIsomorphicLayoutEffect } from './detailUtils'

export const tabDomId = (prefix, id) => `${prefix}-tab-${id}`
export const panelDomId = (prefix, id) => `${prefix}-panel-${id}`

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

export default function DetailTabs({ tabs = [], value, onChange, ariaLabel = 'Sections', idPrefix = 'detail', className = '' }) {
  const list = (Array.isArray(tabs) ? tabs : []).filter(tab => tab && !tab.hidden && tab.id != null)
  const scrollRef = useRef(null)
  const listRef = useRef(null)
  const tabRefs = useRef({})
  const [indicator, setIndicator] = useState(null) // { left, width, animate }
  const activeIndex = list.findIndex(tab => tab.id === value)
  const tabKey = list.map(tab => `${tab.id}:${typeof tab.label === 'string' ? tab.label : ''}:${tab.count ?? ''}`).join('|')

  const measure = useCallback((animate) => {
    const el = listRef.current?.querySelector('[data-active-tab="true"]')
    if (!el) {
      setIndicator(null)
      return
    }
    setIndicator(prev => {
      if (prev && prev.left === el.offsetLeft && prev.width === el.offsetWidth) return prev
      return { left: el.offsetLeft, width: el.offsetWidth, animate: animate && !!prev }
    })
  }, [])

  // Slide on tab or tab-set changes; snap on resize and web-font load.
  useIsomorphicLayoutEffect(() => { measure(true) }, [activeIndex, tabKey, measure])
  useIsomorphicLayoutEffect(() => {
    const node = listRef.current
    if (!node) return undefined
    let ro
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure(false))
      ro.observe(node)
    }
    if (typeof document !== 'undefined') document.fonts?.ready?.then(() => measure(false)).catch(() => {})
    return () => ro?.disconnect()
  }, [measure])

  // Keep the active tab visible inside the horizontal scroller.
  useIsomorphicLayoutEffect(() => {
    const scroller = scrollRef.current
    const el = listRef.current?.querySelector('[data-active-tab="true"]')
    if (!scroller || !el || scroller.scrollWidth <= scroller.clientWidth) return
    const left = el.offsetLeft
    const right = left + el.offsetWidth
    if (left < scroller.scrollLeft) scroller.scrollLeft = Math.max(0, left - 16)
    else if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth + 16
  }, [activeIndex])

  function onKeyDown(e, index) {
    const next = rovingIndex(index, e.key, list.length, 'horizontal')
    if (next == null) return
    e.preventDefault()
    const tab = list[next]
    tabRefs.current[tab.id]?.focus()
    if (tab.id !== value) onChange?.(tab.id)
  }

  if (list.length === 0) return null

  return (
    <div ref={scrollRef} className={`overflow-x-auto border-b border-brand-gray-200 ${className}`.trim()}>
      <div ref={listRef} role="tablist" aria-label={ariaLabel} aria-orientation="horizontal" className="relative flex min-w-max gap-1">
        {list.map((tab, i) => {
          const active = i === activeIndex
          const focusable = active || (activeIndex < 0 && i === 0)
          return (
            <button
              key={tab.id}
              ref={(el) => { tabRefs.current[tab.id] = el }}
              type="button"
              role="tab"
              id={tabDomId(idPrefix, tab.id)}
              aria-selected={active}
              aria-controls={active ? panelDomId(idPrefix, tab.id) : undefined}
              tabIndex={focusable ? 0 : -1}
              data-active-tab={active ? 'true' : undefined}
              onClick={() => { if (!active) onChange?.(tab.id) }}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`relative whitespace-nowrap rounded-t-md px-3 py-3 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 ${
                active ? 'font-medium text-brand-black' : 'text-brand-gray-500 hover:text-brand-black'}`}
            >
              {tab.label}
              {tab.count != null && tab.count !== '' ? (
                <span className="ml-1.5 text-xs font-normal text-brand-gray-400 tabular-nums">{tab.count}</span>
              ) : null}
            </button>
          )
        })}
        {indicator ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-accent-600 motion-reduce:transition-none"
            style={{
              width: indicator.width,
              transform: `translateX(${indicator.left}px)`,
              transition: indicator.animate ? `transform 240ms ${EASE}, width 240ms ${EASE}` : 'none',
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

export function DetailTabPanel({ tabId, idPrefix = 'detail', animate = true, className = '', style, children }) {
  const ref = useRef(null)
  useEnterAnimation(ref, animate ? tabId : null, { skipInitial: true })
  return (
    <div
      ref={ref}
      role="tabpanel"
      id={panelDomId(idPrefix, tabId)}
      aria-labelledby={tabDomId(idPrefix, tabId)}
      tabIndex={0}
      className={className || undefined}
      style={style}
    >
      {children}
    </div>
  )
}
