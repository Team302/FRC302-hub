// Label/value list for rail groups and document details, plus a copy-to-clipboard button.
//
// KeyValueList props:
//   items      [{ key, label, value, to?, href?, external?, copy?, copyLabel?, mono?, multiline?,
//                 tone?: 'danger'|'warning'|'success'|'muted', hidden?, hint? }]
//              value: any node; null/''/false shows "—" (or is skipped with hideEmpty).
//              to → Link, href → <a> (external adds target=_blank), both styled `.link`.
//              copy: true copies a string/number value; a string/number copies that instead.
//              multiline keeps line breaks (whitespace-pre-line).
//   layout     'stacked' (default; label above value, for the rail) | 'inline' (140px label column)
//   hideEmpty  skip rows whose value is empty
//   dense      py-1.5 rows instead of py-2
//   className
// Renders nothing when no rows are visible.
//
// CopyButton props: value, label ('Copy'; also the tooltip), className.
//   Writes to navigator.clipboard (falls back to execCommand), swaps to a check for 1.5s and
//   announces "Copied" through a polite live region. No toast dependency.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy } from 'lucide-react'

const TONES = {
  danger: 'text-status-danger',
  warning: 'text-amber-600',
  success: 'text-green-600',
  muted: 'text-brand-gray-500',
}

const isEmptyValue = (v) => v == null || v === '' || v === false

function copyTextOf(item) {
  if (item.copy == null || item.copy === false) return null
  if (item.copy === true) {
    return typeof item.value === 'string' || typeof item.value === 'number' ? String(item.value) : null
  }
  return typeof item.copy === 'string' || typeof item.copy === 'number' ? String(item.copy) : null
}

export default function KeyValueList({ items = [], layout = 'stacked', hideEmpty = false, dense = false, className = '' }) {
  const rows = (Array.isArray(items) ? items : []).filter(it => it && !it.hidden && !(hideEmpty && isEmptyValue(it.value)))
  if (rows.length === 0) return null
  const inline = layout === 'inline'

  return (
    <dl className={className || undefined}>
      {rows.map((it, i) => {
        const empty = isEmptyValue(it.value)
        let value = empty ? <span className="text-brand-gray-400">—</span> : it.value
        if (!empty && it.to) {
          value = <Link to={it.to} className="link">{value}</Link>
        } else if (!empty && it.href) {
          value = (
            <a
              href={it.href}
              className="link print:no-underline"
              target={it.external ? '_blank' : undefined}
              rel={it.external ? 'noopener noreferrer' : undefined}
            >
              {value}
            </a>
          )
        }
        const copyText = empty ? null : copyTextOf(it)
        const copyLabel = it.copyLabel || (typeof it.label === 'string' ? `Copy ${it.label.toLowerCase()}` : 'Copy')
        const valueCls = [
          'min-w-0 [overflow-wrap:anywhere]',
          it.mono ? 'font-mono text-[13px]' : '',
          it.multiline ? 'whitespace-pre-line' : '',
          TONES[it.tone] || '',
        ].filter(Boolean).join(' ')

        return (
          <div
            key={it.key ?? (typeof it.label === 'string' ? it.label : i)}
            className={`${dense ? 'py-1.5' : 'py-2'} ${inline ? 'grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] items-baseline gap-x-4' : ''}`.trim()}
          >
            <dt className="text-xs text-brand-gray-500">{it.label}</dt>
            <dd className={`${inline ? '' : 'mt-0.5'} min-w-0 text-sm text-brand-gray-800`.trim()}>
              <div className="flex min-w-0 items-center gap-1">
                <span className={valueCls}>{value}</span>
                {copyText != null ? <CopyButton value={copyText} label={copyLabel} /> : null}
              </div>
              {it.hint ? <p className="mt-0.5 text-xs text-brand-gray-500">{it.hint}</p> : null}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

function legacyCopy(text) {
  if (typeof document === 'undefined') return false
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export function CopyButton({ value, label = 'Copy', className = '' }) {
  const [state, setState] = useState('idle') // 'idle' | 'copied' | 'failed'
  const timer = useRef(null)
  const btnRef = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    const text = value == null ? '' : String(value)
    let ok = false
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        ok = true
      }
    } catch {
      ok = false
    }
    if (!ok) {
      ok = legacyCopy(text)
      btnRef.current?.focus({ preventScroll: true })
    }
    setState(ok ? 'copied' : 'failed')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 1500)
  }

  const copied = state === 'copied'
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={copy}
        aria-label={label}
        title={copied ? 'Copied' : label}
        className={`btn-ghost -my-1 shrink-0 p-1.5 text-brand-gray-400 hover:text-brand-black print:hidden ${className}`.trim()}
      >
        {copied
          ? <Check key="copied" className="h-3.5 w-3.5 text-green-600 animate-scale-in" aria-hidden="true" />
          : <Copy key="copy" className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
      <span className="sr-only" aria-live="polite">{copied ? 'Copied' : state === 'failed' ? 'Copy failed' : ''}</span>
    </>
  )
}
