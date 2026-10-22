// Object-page header: crumbs, identity, actions, facts row, lifecycle steps.
// Crumbs, action buttons and the mobile bar are screen-only; the title, badges, facts and steps print.
//
// Props:
//   crumbs            [{ label, to?, href?, key? }] ancestors; the last linked one is the mobile back link
//   current           optional current crumb (aria-current="page"); mono when it looks like an id
//   currentMono       force the mono style on or off for `current`
//   leading           media before the title block (e.g. a client Avatar)
//   eyebrow           small line above the title
//   title             rendered in the <h1>
//   badges, subtitle, meta, steps, note   nodes (steps: usually <StatusSteps/>; note: small helper line)
//   facts             [{ key, label, value, to?, href?, onClick?, tone?: 'danger'|'warning'|'success',
//                        hidden?, title? }]   An empty value shows "—".
//   primaryAction     action
//   secondaryActions  [action]
//   menuItems         ActionMenu items (see ActionMenu.jsx)
//   menuLabel         overflow trigger label (default 'More actions')
//   mobileBar         default true. Below md the header buttons hide and a fixed bottom bar (portal)
//                     shows the primary action (or the first secondary) plus a ••• menu holding the
//                     other secondaries and menuItems. With no primary/secondary, or mobileBar={false},
//                     the header buttons stay visible at every width.
//   className
//
// action = { key, label, icon?, onClick?, to?, href?, target?, disabled?, busy?, busyLabel?, title?,
//            ariaLabel?, hidden?, variant?: 'primary'|'secondary'|'danger', description? (mobile menu) }
// `to` renders a Link, `href` an <a>, otherwise a button. `busy` shows busyLabel and disables it.

import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import ActionMenu, { normalizeMenuItems } from './ActionMenu'
import { Portal, renderIcon } from './detailUtils'

const VARIANTS = { primary: 'btn-primary', secondary: 'btn-secondary', danger: 'btn-danger' }
const FACT_TONES = { danger: 'text-status-danger', warning: 'text-amber-600', success: 'text-green-600' }

const hasValue = (v) => v != null && v !== '' && v !== false
const looksLikeId = (v) => typeof v === 'string' && /\d/.test(v) && /^[A-Za-z0-9#][\w#.-]*$/.test(v.trim())

export default function DetailHeader({
  crumbs = [], current, currentMono, leading, eyebrow, title, badges, subtitle, meta,
  facts = [], steps, note, primaryAction, secondaryActions = [], menuItems = [],
  menuLabel = 'More actions', mobileBar = true, className = '',
}) {
  const crumbList = (Array.isArray(crumbs) ? crumbs : []).filter(c => c && hasValue(c.label))
  const primary = primaryAction && !primaryAction.hidden ? primaryAction : null
  const secondaries = (Array.isArray(secondaryActions) ? secondaryActions : []).filter(a => a && !a.hidden)
  const menu = Array.isArray(menuItems) ? menuItems : []
  const hasMenu = normalizeMenuItems(menu).some(it => it.type !== 'separator' && it.type !== 'label')
  const visibleFacts = (Array.isArray(facts) ? facts : []).filter(f => f && !f.hidden)

  const barMain = primary || secondaries[0] || null
  const showBar = !!mobileBar && !!barMain
  const barRest = primary ? secondaries : secondaries.slice(1)
  const barMenu = barRest.length > 0 ? [...barRest.map(actionToMenuItem), { type: 'separator' }, ...menu] : menu
  const hasActions = !!primary || secondaries.length > 0 || hasMenu

  return (
    <div className={`border-b border-brand-gray-200 pb-5 ${className}`.trim()}>
      {crumbList.length > 0 || hasValue(current) ? (
        <Crumbs crumbs={crumbList} current={current} mono={currentMono ?? looksLikeId(current)} />
      ) : null}

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {leading ? <div className="shrink-0">{leading}</div> : null}
          <div className="min-w-0">
            {eyebrow ? <p className="text-[13px] font-medium text-brand-gray-500">{eyebrow}</p> : null}
            <div className={`flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 ${eyebrow ? 'mt-1' : ''}`.trim()}>
              <h1 className="min-w-0 break-words text-2xl font-semibold tracking-[-0.02em] text-brand-black sm:text-display">
                {title}
              </h1>
              {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
            </div>
            {subtitle ? <p className="mt-1 text-sm text-brand-gray-500">{subtitle}</p> : null}
            {meta ? <div className="mt-3">{meta}</div> : null}
          </div>
        </div>

        {hasActions ? (
          <div className={`${showBar ? 'hidden md:flex' : 'flex'} shrink-0 flex-wrap items-center gap-2 print:hidden`}>
            {primary ? <ActionButton action={primary} fallback="primary" /> : null}
            {secondaries.map((a, i) => <ActionButton key={a.key ?? i} action={a} fallback="secondary" />)}
            {hasMenu ? <ActionMenu items={menu} label={menuLabel} /> : null}
          </div>
        ) : null}
      </div>

      {visibleFacts.length > 0 ? (
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-0 sm:gap-y-3">
          {visibleFacts.map((fact, i) => (
            <div
              key={fact.key ?? i}
              className="min-w-0 sm:mr-6 sm:border-r sm:border-brand-gray-200 sm:pr-6 last:mr-0 last:border-0 last:pr-0"
            >
              <dt className="text-xs text-brand-gray-500">{fact.label}</dt>
              <dd
                title={typeof fact.title === 'string' ? fact.title : undefined}
                className={`mt-0.5 flex min-w-0 items-center gap-1.5 text-sm font-medium tabular-nums ${FACT_TONES[fact.tone] || 'text-brand-black'}`}
              >
                <FactValue fact={fact} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {steps ? <div className="mt-5">{steps}</div> : null}
      {note ? <p className="mt-3 text-xs text-brand-gray-500 md:text-right">{note}</p> : null}

      {showBar ? (
        <Portal>
          <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-brand-gray-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur animate-fade-in md:hidden print:hidden">
            <ActionButton action={barMain} fallback={primary ? 'primary' : 'secondary'} className="min-w-0 flex-1" />
            <ActionMenu items={barMenu} label={menuLabel} placement="top-end" />
          </div>
        </Portal>
      ) : null}
    </div>
  )
}

function Crumbs({ crumbs, current, mono }) {
  const back = [...crumbs].reverse().find(c => c.to || c.href)
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-xs text-brand-gray-500 print:hidden">
      {back ? (
        <CrumbLink crumb={back} className="inline-flex items-center gap-1 rounded hover:text-brand-black sm:hidden">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {back.label}
        </CrumbLink>
      ) : null}
      <ol className="hidden flex-wrap items-center gap-1 sm:flex">
        {crumbs.map((crumb, i) => (
          <li key={crumb.key ?? `${i}-${typeof crumb.label === 'string' ? crumb.label : ''}`} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight className="h-3 w-3 text-brand-gray-300" aria-hidden="true" /> : null}
            {crumb.to || crumb.href ? (
              <CrumbLink crumb={crumb} className="rounded hover:text-brand-black hover:underline">{crumb.label}</CrumbLink>
            ) : (
              <span>{crumb.label}</span>
            )}
          </li>
        ))}
        {hasValue(current) ? (
          <li className="flex min-w-0 items-center gap-1">
            {crumbs.length > 0 ? <ChevronRight className="h-3 w-3 text-brand-gray-300" aria-hidden="true" /> : null}
            <span
              aria-current="page"
              className={`max-w-[18rem] truncate font-medium text-brand-gray-700 ${mono ? 'font-mono text-[12px]' : ''}`.trim()}
            >
              {current}
            </span>
          </li>
        ) : null}
      </ol>
    </nav>
  )
}

function CrumbLink({ crumb, className, children }) {
  if (crumb.to) return <Link to={crumb.to} className={className}>{children}</Link>
  return <a href={crumb.href} className={className}>{children}</a>
}

function FactValue({ fact }) {
  if (!hasValue(fact.value)) return <span className="font-normal text-brand-gray-400">—</span>
  const interactive =
    'inline-flex min-w-0 max-w-full items-center gap-1.5 rounded text-left [overflow-wrap:anywhere] hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40'
  if (fact.to) return <Link to={fact.to} onClick={fact.onClick} className={interactive}>{fact.value}</Link>
  if (fact.href) return <a href={fact.href} onClick={fact.onClick} className={interactive}>{fact.value}</a>
  if (fact.onClick) return <button type="button" onClick={fact.onClick} className={interactive}>{fact.value}</button>
  return <span className="inline-flex min-w-0 items-center gap-1.5 [overflow-wrap:anywhere]">{fact.value}</span>
}

function ActionButton({ action, fallback = 'secondary', className = '' }) {
  const variant = VARIANTS[action.variant] ? action.variant : fallback
  const cls = `${VARIANTS[variant]} whitespace-nowrap ${className}`.trim()
  const busy = !!action.busy
  const inactive = busy || !!action.disabled
  const text = busy && action.busyLabel ? action.busyLabel : action.label
  const inner = (
    <>
      {action.icon ? renderIcon(action.icon, 'h-4 w-4 shrink-0') : null}
      <span className="truncate">{text}</span>
    </>
  )
  const common = { className: cls, title: action.title, 'aria-label': action.ariaLabel }
  if (!inactive && action.to) return <Link to={action.to} onClick={action.onClick} {...common}>{inner}</Link>
  if (!inactive && action.href) {
    return (
      <a
        href={action.href}
        target={action.target}
        rel={action.target === '_blank' ? 'noopener noreferrer' : undefined}
        onClick={action.onClick}
        {...common}
      >
        {inner}
      </a>
    )
  }
  return (
    <button type="button" onClick={action.onClick} disabled={inactive} aria-busy={busy || undefined} {...common}>
      {inner}
    </button>
  )
}

function actionToMenuItem(action, i) {
  return {
    key: action.key ?? `action-${i}`,
    label: action.busy && action.busyLabel ? action.busyLabel : action.label,
    icon: action.icon,
    description: action.description,
    title: action.title,
    onSelect: action.onClick,
    to: action.to,
    href: action.href,
    target: action.target,
    disabled: !!(action.disabled || action.busy),
    danger: action.variant === 'danger',
  }
}
