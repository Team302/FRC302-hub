// The colour theme: 'dark' (the default), 'light' or 'system'. public/theme-init.js applies the
// saved choice before first paint; this keeps it applied and lets the app change it.
import { useEffect, useState } from 'react'

const KEY = 'hub302.theme'
export const THEMES = ['dark', 'light', 'system']
const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null)

export function readTheme() {
  try {
    const saved = localStorage.getItem(KEY)
    return THEMES.includes(saved) ? saved : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(choice) {
  const dark = choice === 'dark' || (choice === 'system' && !!media()?.matches)
  document.documentElement.classList.toggle('dark', dark)
}

// [theme, setTheme]. Saving is best-effort (a private window may refuse); the theme still changes.
export function useTheme() {
  const [theme, setThemeState] = useState(readTheme)
  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return undefined
    const m = media()
    const follow = () => applyTheme('system')
    m?.addEventListener?.('change', follow)
    return () => m?.removeEventListener?.('change', follow)
  }, [theme])
  const setTheme = (next) => {
    if (!THEMES.includes(next)) return
    try { localStorage.setItem(KEY, next) } catch { /* keep it for this page only */ }
    setThemeState(next)
  }
  return [theme, setTheme]
}
