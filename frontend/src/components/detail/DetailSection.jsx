// Section cards for the main column, the right rail and its groups.
//
// DetailSection props:
//   id            optional root id (also seeds the title/body ids)
//   title         header title (15px card / 13px rail). Without a title only the body renders
//                 (e.g. the invoice document card); `ariaLabel` then names the region.
//   description   small line under the title (hidden while collapsed)
//   icon          lucide icon (16px, gray-400) before the title
//   count         number or short text after the title ("12 · 2 void")
//   actions       node on the right of the header row (screen-only)
//   flush         body without padding (tables); the header gets a hairline under it
//   collapsible   header becomes a button (aria-expanded/aria-controls) with a rotating chevron
//   defaultOpen   initial open state for collapsible sections (default true)
//   collapseOn    'always' | 'mobile' (mobile: always open with no toggle at lg and up)
//   summary       one line shown under the title while collapsed
//   variant       'card' (default) | 'rail' (no card chrome, px-5 py-4, for DetailRail groups)
//   printHidden   adds print:hidden
//   ariaLabel, bodyClassName, className, style (merged onto the root, so Stagger works), children
// Collapsed bodies stay mounted (state survives) and still print.
//
// SectionEmpty props: icon, text (or children), action, padded (default true: px-5 py-6;
//   false: py-2 for use inside an already padded body or a rail group), className.
//
// RailSection: DetailSection with variant="rail", collapsible, collapseOn="mobile" and
//   defaultOpen=false (pass defaultOpen for the groups that should start open on mobile).
//
// DetailRail props: label ('Details'), sticky (lg:sticky lg:top-6; short rails only),
//   printHidden, className, style, children. One card whose groups are split by hairlines;
//   the groups fade up once after the main column (Stagger 40ms from 80ms, max 8).

import { Children, useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Stagger } from '../ui/Motion'
import { flattenChildren, renderIcon, useIsDesktop } from './detailUtils'

const present = (v) => v != null && v !== '' && v !== false

export default function DetailSection({
  id, title, description, icon, count, actions, flush = false, collapsible = false, defaultOpen = true,
  collapseOn = 'always', summary, variant = 'card', printHidden = false, ariaLabel, bodyClassName = '',
  className = '', style, children,
}) {
  const uid = useId().replace(/:/g, '')
  const base = id || `detail-section-${uid}`
  const titleId = `${base}-title`
  const bodyId = `${base}-body`
  const isDesktop = useIsDesktop()
  const [open, setOpen] = useState(!!defaultOpen)
  const [toggled, setToggled] = useState(false)

  const rail = variant === 'rail'
  const hasTitle = present(title)
  const hasBody = Children.toArray(children).length > 0
  const canCollapse = !!collapsible && hasTitle && hasBody && !(collapseOn === 'mobile' && isDesktop)
  const expanded = canCollapse ? open : true

  const titleCls = rail
    ? 'text-[13px] font-semibold leading-5 text-brand-black'
    : 'text-[15px] font-semibold leading-6 tracking-[-0.01em] text-brand-black'

  const titleInner = (
    <span className="flex min-w-0 items-center gap-2">
      {icon ? renderIcon(icon, 'h-4 w-4 shrink-0 text-brand-gray-400') : null}
      <span className="min-w-0 break-words">
        {title}
        {present(count) ? <span className="ml-1.5 text-xs font-normal text-brand-gray-400 tabular-nums">{count}</span> : null}
      </span>
    </span>
  )

  const actionsEl = actions ? <div className="flex shrink-0 items-center gap-2 print:hidden">{actions}</div> : null

  let header = null
  if (hasTitle) {
    let pad = ''
    if (!rail) pad = `px-5 pt-4 ${expanded ? (flush && hasBody ? 'border-b border-brand-gray-100 pb-3' : 'pb-3') : 'pb-4'}`
    header = (
      <div className={`flex items-start justify-between gap-3 ${pad}`.trim()}>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className={titleCls}>
            {canCollapse ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={bodyId}
                onClick={() => { setOpen(o => !o); setToggled(true) }}
                className="-mx-1 flex w-[calc(100%+0.5rem)] items-start justify-between gap-2 rounded-md px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
              >
                <span className="min-w-0">
                  {titleInner}
                  {!expanded && present(summary) ? (
                    <span className="mt-0.5 block truncate text-xs font-normal text-brand-gray-500 print:hidden">{summary}</span>
                  ) : null}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`mt-0.5 h-4 w-4 shrink-0 text-brand-gray-400 transition-transform duration-200 print:hidden ${expanded ? 'rotate-180' : ''}`}
                />
              </button>
            ) : titleInner}
          </h2>
          {present(description) && expanded ? <p className="mt-0.5 text-xs text-brand-gray-500">{description}</p> : null}
        </div>
        {actionsEl}
      </div>
    )
  } else if (actionsEl) {
    header = <div className={`flex justify-end ${rail ? '' : 'px-5 pt-4'}`.trim()}>{actionsEl}</div>
  }

  let bodyPad = ''
  if (!flush) {
    if (rail) bodyPad = hasTitle || actionsEl ? 'mt-2' : ''
    else bodyPad = hasTitle ? 'px-5 pb-5' : actionsEl ? 'px-5 pb-5 pt-3' : 'p-5'
  }
  const bodyCls = [
    bodyPad,
    expanded ? (toggled ? 'animate-fade-in' : '') : 'hidden print:block',
    bodyClassName,
  ].filter(Boolean).join(' ')

  const rootCls = [rail ? 'min-w-0 px-5 py-4' : 'card min-w-0', printHidden ? 'print:hidden' : '', className]
    .filter(Boolean).join(' ')

  return (
    <section
      id={id}
      aria-labelledby={hasTitle ? titleId : undefined}
      aria-label={!hasTitle && ariaLabel ? ariaLabel : undefined}
      className={rootCls}
      style={style}
    >
      {header}
      {hasBody ? <div id={bodyId} className={bodyCls || undefined}>{children}</div> : null}
    </section>
  )
}

export function SectionEmpty({ icon, text, action, padded = true, className = '', children }) {
  return (
    <div
      className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${padded ? 'px-5 py-6' : 'py-2'} ${className}`.trim()}
    >
      <p className="flex items-start gap-2 text-sm text-brand-gray-500">
        {icon ? renderIcon(icon, 'mt-0.5 h-4 w-4 shrink-0 text-brand-gray-400') : null}
        <span>{text ?? children}</span>
      </p>
      {action ? <div className="shrink-0 print:hidden">{action}</div> : null}
    </div>
  )
}

export function RailSection({ collapsible = true, collapseOn = 'mobile', defaultOpen = false, ...props }) {
  return (
    <DetailSection variant="rail" collapsible={collapsible} collapseOn={collapseOn} defaultOpen={defaultOpen} {...props} />
  )
}

export function DetailRail({ label = 'Details', sticky = false, printHidden = false, className = '', style, children }) {
  const cls = [
    'card min-w-0 divide-y divide-brand-gray-100',
    sticky ? 'lg:sticky lg:top-6' : '',
    printHidden ? 'print:hidden' : '',
    className,
  ].filter(Boolean).join(' ')
  return (
    <div role="complementary" aria-label={label} className={cls} style={style}>
      <Stagger step={40} initialDelay={80} max={8}>{flattenChildren(children)}</Stagger>
    </div>
  )
}
