// Lifecycle and history primitives for detail pages.
//
// StatusSteps props:
//   steps      [{ key, label, date?, done?, current?, tone?: 'default'|'danger'|'muted', hidden? }]
//   ariaLabel  list label (default 'Progress'); className
//   A horizontal <ol> at every width. Dates show from sm up (they're also in the rail Details).
//   The connector after a done step fills with accent and draws in once (scaleX via useDrawIn).
//   The current step gets aria-current="step"; each step says "completed" or "not started" to
//   screen readers. Renders nothing without visible steps.
//
// Timeline props:
//   items      [{ key, kind: 'event'|'note', tone?: 'default'|'accent'|'success'|'warning'|'danger',
//                 title, meta?, body?, time?, timeTitle?, avatar?: node | { name, seed, src }, actions? }]
//              Events: a small dot, the title sentence, meta (e.g. the actor) and a right-aligned time.
//              Notes: an Avatar, the title (author) and the body in a soft bubble.
//   limit      rows before "Show all (n)" (default 6)
//   moreLabel  ('Show all activity'), lessLabel ('Show less'), emptyText ('No activity yet.')
//   loading    3 skeleton rows
//   ariaLabel  ('Activity')
//   resetKey   resets the new-row tracking (pass the record id)
//   className
//   Rows that appear after the first loaded render (a new note) fade up once; keys must be stable.

import { isValidElement, useState } from 'react'
import { Check, X } from 'lucide-react'
import { useDrawIn, usePrefersReducedMotion } from '../ui/Motion'
import Avatar from '../ui/Avatar'
import { useFreshKeys } from './detailUtils'

// ── StatusSteps ─────────────────────────────────────────────────────────────

function StepDot({ done, current, tone }) {
  const base = 'relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full'
  if (tone === 'danger') {
    return (
      <span aria-hidden="true" className={`${base} bg-red-600 text-white`}>
        <X className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    )
  }
  if (done) {
    return (
      <span aria-hidden="true" className={`${base} ${tone === 'muted' ? 'bg-brand-gray-300' : 'bg-accent-600'} text-white`}>
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    )
  }
  if (current) {
    return <span aria-hidden="true" className={`${base} bg-white ring-2 ring-inset ${tone === 'muted' ? 'ring-brand-gray-300' : 'ring-accent-600'}`} />
  }
  return <span aria-hidden="true" className={`${base} bg-white ring-1 ring-inset ${tone === 'muted' ? 'ring-brand-gray-200' : 'ring-brand-gray-300'}`} />
}

export function StatusSteps({ steps = [], ariaLabel = 'Progress', className = '' }) {
  const drawn = useDrawIn()
  const reduced = usePrefersReducedMotion()
  const list = (Array.isArray(steps) ? steps : []).filter(s => s && !s.hidden)
  if (list.length === 0) return null

  return (
    <ol aria-label={ariaLabel} className={`flex w-full items-start ${className}`.trim()}>
      {list.map((step, i) => {
        const last = i === list.length - 1
        const tone = step.tone === 'danger' || step.tone === 'muted' ? step.tone : 'default'
        const done = !!step.done
        const current = !!step.current
        let labelTone = 'text-brand-gray-400'
        if (tone === 'danger') labelTone = 'font-medium text-status-danger'
        else if (tone === 'muted') labelTone = done ? 'text-brand-gray-500' : 'text-brand-gray-400'
        else if (done) labelTone = 'font-medium text-brand-black'
        else if (current) labelTone = 'font-medium text-brand-gray-700'

        return (
          <li
            key={step.key ?? i}
            aria-current={current ? 'step' : undefined}
            className={`min-w-0 ${last ? 'shrink-0' : 'flex-1'}`}
          >
            <div className="flex items-center">
              <StepDot done={done} current={current} tone={tone} />
              {!last ? (
                <span aria-hidden="true" className="relative mx-2 h-px min-w-[12px] flex-1 overflow-hidden bg-brand-gray-200">
                  <span
                    className={`absolute inset-0 origin-left transition-transform duration-500 ease-out ${tone === 'muted' ? 'bg-brand-gray-300' : 'bg-accent-300'}`}
                    style={{ transform: `scaleX(${done && drawn ? 1 : 0})`, transitionDelay: reduced ? undefined : `${Math.min(i, 6) * 60}ms` }}
                  />
                </span>
              ) : null}
            </div>
            <div className="mt-2 min-w-0 pr-2">
              <p className={`text-xs leading-4 ${labelTone}`}>
                {step.label}
                <span className="sr-only">{done ? ', completed' : ', not started'}</span>
              </p>
              {step.date != null && step.date !== '' ? (
                <p className="mt-0.5 hidden text-[11px] leading-4 text-brand-gray-500 tabular-nums sm:block">{step.date}</p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ── Timeline ────────────────────────────────────────────────────────────────

const EVENT_DOT = {
  default: 'bg-brand-gray-300',
  accent: 'bg-accent-500',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
}

function Marker({ item }) {
  if (item.kind === 'note') {
    if (isValidElement(item.avatar)) return item.avatar
    const a = item.avatar && typeof item.avatar === 'object' ? item.avatar : {}
    return <Avatar name={a.name} seed={a.seed} src={a.src} size="sm" className="ring-4" />
  }
  return (
    <span
      aria-hidden="true"
      className={`mt-[7px] block h-2.5 w-2.5 rounded-full ring-4 ring-white ${EVENT_DOT[item.tone] || EVENT_DOT.default}`}
    />
  )
}

function TimelineRow({ item, fresh }) {
  const note = item.kind === 'note'
  const hasBody = item.body != null && item.body !== ''
  return (
    <li className={`group relative flex gap-3 py-2 ${fresh ? 'animate-fade-up' : ''}`.trim()}>
      <div className="relative flex w-6 shrink-0 justify-center">
        <Marker item={item} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 pt-0.5">
            {item.title != null && item.title !== '' ? (
              <p className={`break-words text-sm ${note ? 'font-medium text-brand-black' : 'text-brand-gray-800'}`}>{item.title}</p>
            ) : null}
            {item.meta ? <p className="mt-0.5 text-xs text-brand-gray-500">{item.meta}</p> : null}
          </div>
          {item.time || item.actions ? (
            <div className="flex shrink-0 items-center gap-1 pt-0.5">
              {item.time ? (
                <span className="whitespace-nowrap text-xs text-brand-gray-400" title={item.timeTitle || undefined}>{item.time}</span>
              ) : null}
              {item.actions || null}
            </div>
          ) : null}
        </div>
        {hasBody ? (
          <div className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-brand-gray-50 px-3 py-2 text-sm text-brand-black">
            {item.body}
          </div>
        ) : null}
      </div>
    </li>
  )
}

const SKELETON_WIDTHS = ['w-2/3', 'w-1/2', 'w-3/5']

export function Timeline({
  items = [], limit = 6, moreLabel = 'Show all activity', lessLabel = 'Show less', emptyText = 'No activity yet.',
  loading = false, ariaLabel = 'Activity', resetKey, className = '',
}) {
  const [expanded, setExpanded] = useState(false)
  const list = (Array.isArray(items) ? items : []).filter(Boolean)
  const keyOf = (item, i) => item.key ?? i
  const isFresh = useFreshKeys(list.map(keyOf), !loading, resetKey)

  if (loading) {
    return (
      <div role="status" aria-label={`Loading ${String(ariaLabel).toLowerCase()}`} className={`space-y-4 py-2 ${className}`.trim()}>
        {SKELETON_WIDTHS.map((w, i) => (
          <div key={i} className="flex gap-3">
            <div aria-hidden="true" className="skeleton h-6 w-6 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2 pt-1">
              <div aria-hidden="true" className={`skeleton h-3 rounded-md ${w}`} />
              <div aria-hidden="true" className="skeleton h-2.5 w-24 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (list.length === 0) {
    return <p className={`py-1 text-sm text-brand-gray-500 ${className}`.trim()}>{emptyText}</p>
  }

  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : list.length
  const shown = expanded ? list : list.slice(0, max)

  return (
    <div className={className || undefined}>
      <div className="relative">
        {shown.length > 1 ? <span aria-hidden="true" className="absolute bottom-3 left-[11px] top-3 w-px bg-brand-gray-200" /> : null}
        <ul aria-label={ariaLabel} className="relative">
          {shown.map((item, i) => (
            <TimelineRow key={keyOf(item, i)} item={item} fresh={isFresh(keyOf(item, i))} />
          ))}
        </ul>
      </div>
      {list.length > max ? (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          className="btn-ghost btn-sm -ml-3 mt-1"
        >
          {expanded ? lessLabel : `${moreLabel} (${list.length})`}
        </button>
      ) : null}
    </div>
  )
}
