/** @type {import('tailwindcss').Config} */
import defaultColors from 'tailwindcss/colors.js'
import plugin from 'tailwindcss/plugin.js'

// ─── Theme ────────────────────────────────────────────────────────────────────
// Every colour the app uses is a CSS variable, so one class (`bg-white`, `text-brand-gray-500`,
// `bg-red-50`) reads right in both themes and no component needs `dark:` variants. The values
// are set below for :root (light) and .dark, and the .dark class goes on <html> before first
// paint (public/theme-init.js). Dark is the default.
//
//   light  warm paper neutrals, ink-on-paper primary buttons
//   dark   near-black canvas, hairline borders, white primary buttons, 302 green accent
// (Carried over from ProjectPro's design system, with the accent swapped for 302's.)
//
// Tailwind's hue scales (red, amber, green…) keep their light values and are mirrored in dark
// (50↔950, 100↔900…), so a soft tinted badge (bg-red-50 text-red-700) becomes a deep tint with
// light text instead of a glaring pastel.
const rgb = (hex) => { const h = hex.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ') }
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
const HUES = ['red', 'amber', 'green', 'blue', 'emerald', 'yellow', 'sky', 'violet', 'rose', 'indigo', 'gray', 'orange', 'purple', 'teal', 'cyan', 'lime', 'pink', 'fuchsia', 'slate', 'zinc', 'neutral', 'stone']
const MIRROR = { 50: '950', 100: '900', 200: '800', 300: '700', 400: '400', 500: '400', 600: '400', 700: '300', 800: '200', 900: '100', 950: '50' }

// Contrast floor (WCAG AA): gray-400 and darker are text colours, at least 4.5:1 on white, canvas
// and gray-100 in both themes (light 400 ≈ 4.6-5.0:1, dark 400 ≈ 4.7-5.5:1); gray-300 and lighter
// are for borders, tracks and decorative marks only.
const NEUTRAL = {
  light: {
    white: '#fdfdfc', canvas: '#f4f4f2', ink: '#0b0b0b',
    gray: { 50: '#fafaf9', 100: '#f2f2f0', 200: '#e4e3df', 300: '#d3d2cd', 400: '#6f6e69', 500: '#605f5b', 600: '#52514e', 700: '#3d3c3a', 800: '#282826', 900: '#1a1a19' },
  },
  dark: {
    white: '#0b0b0b', canvas: '#000000', ink: '#f5f5f5',
    gray: { 50: '#111111', 100: '#181818', 200: '#262626', 300: '#333333', 400: '#838383', 500: '#8f8f8f', 600: '#a3a3a3', 700: '#c4c4c4', 800: '#e0e0e0', 900: '#ededed' },
  },
}
// 302 green: links, the active nav item, focus rings, progress. Used sparingly; primary buttons
// are ink (.btn-primary). 600 is the text shade and clears 4.5:1 on white and canvas in light
// (5.3:1 / 4.9:1) and dark (≈10:1). Gold (below) is the team's second colour, for highlights only.
// TODO(302): confirm against the team's official brand colours and swap these two scales.
const ACCENT = {
  light: { 50: '#ecfbf2', 100: '#d2f6e0', 200: '#a6ecc4', 300: '#6edaa1', 400: '#2fbf7c', 500: '#12a464', 600: '#087a48', 700: '#0a6640', 800: '#0c5034', 900: '#0b412c' },
  dark:  { 50: '#03140c', 100: '#062214', 200: '#0b3a23', 300: '#0f5634', 400: '#138a52', 500: '#1fb36d', 600: '#3fd189', 700: '#76e3ab', 800: '#b0f0cd', 900: '#e3fbee' },
}
const GOLD = {
  light: { 400: '#f5b301', 500: '#d99a00', 600: '#a16207' },
  dark:  { 400: '#f5b301', 500: '#fbbf24', 600: '#fcd34d' },
}
const STATUS = {
  light: { success: '#16a34a', warning: '#d97706', danger: '#dc2626', info: '#2563eb' },
  dark:  { success: '#4ade80', warning: '#fbbf24', danger: '#f87171', info: '#60a5fa' },
}


function themeVars(mode) {
  const n = NEUTRAL[mode]
  const out = { '--white': rgb(n.white), '--canvas': rgb(n.canvas), '--ink': rgb(n.ink) }
  for (const [k, hex] of Object.entries(n.gray)) out[`--brand-gray-${k}`] = rgb(hex)
  for (const [k, hex] of Object.entries(ACCENT[mode])) out[`--accent-${k}`] = rgb(hex)
  for (const [k, hex] of Object.entries(GOLD[mode])) out[`--gold-${k}`] = rgb(hex)
  for (const [k, hex] of Object.entries(STATUS[mode])) out[`--status-${k}`] = rgb(hex)
  for (const hue of HUES) for (const s of SHADES) out[`--${hue}-${s}`] = rgb(defaultColors[hue][mode === 'dark' ? MIRROR[s] : s])
  return out
}
const scale = (prefix, keys) => Object.fromEntries(keys.map((k) => [k, v(`${prefix}-${k}`)]))

export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        white: v('white'),
        brand: {
          black: v('ink'),
          white: v('white'),
          gray: scale('brand-gray', ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']),
        },
        // The one accent: links, the active nav item, focus rings, chart strokes. Primary buttons
        // are ink (.btn-primary), not accent.
        accent: scale('accent', ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']),
        gold: scale('gold', ['400', '500', '600']),
        canvas: v('canvas'),
        status: { success: v('status-success'), warning: v('status-warning'), danger: v('status-danger'), info: v('status-info') },
        ...Object.fromEntries(HUES.map((hue) => [hue, scale(hue, SHADES)])),
      },
      fontFamily: {
        // Nothing is downloaded from Google on any page.
        // Inter (bundled, src/main.jsx), with the system face while it loads.
        sans: ['"Inter Variable"', 'Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        'display': ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.02em', fontWeight: '600' }],
        'heading': ['1.125rem', { lineHeight: '1.625rem', letterSpacing: '-0.01em', fontWeight: '600' }],
        'metric':  ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.02em', fontWeight: '600' }],
      },
      borderRadius: {
        none: '0',
        sm:   '0.125rem',
        DEFAULT: '0.25rem',
        md:   '0.375rem',
        lg:   '0.5rem',
        xl:   '0.75rem',
        control: '0.625rem',
        card: '1rem',
      },
      boxShadow: {
        sm:  '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
        md:  '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        lg:  '0 10px 15px -3px rgb(0 0 0 / 0.1)',
        // Layered, very soft elevation.
        card: '0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.03)',
        'card-hover': '0 2px 4px -1px rgb(16 24 40 / 0.06), 0 6px 16px -4px rgb(16 24 40 / 0.08)',
        pop: '0 4px 8px -2px rgb(16 24 40 / 0.08), 0 16px 32px -8px rgb(16 24 40 / 0.14)',
        // A solid 2px accent ring (≥3:1 on every surface in both themes, WCAG 1.4.11), for controls
        // that draw their own focus instead of the global :focus-visible outline.
        focus: '0 0 0 2px rgb(var(--accent-600))',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      animation: {
        'fade-in':    'fadeIn 0.18s cubic-bezier(0.22, 1, 0.36, 1) backwards',
        'fade-up':    'fadeUp 0.22s cubic-bezier(0.22, 1, 0.36, 1) backwards',
        'scale-in':   'scaleIn 0.18s cubic-bezier(0.22, 1, 0.36, 1) backwards',
        'slide-down': 'slideDown 0.16s cubic-bezier(0.22, 1, 0.36, 1) backwards',
        'slide-in':   'slideIn 0.2s ease-out',
        'toast-in':   'toastIn 0.3s ease-out',
        'shimmer':    'shimmer 1.4s linear infinite',
        'draw':       'draw 0.7s cubic-bezier(0.22, 1, 0.36, 1) backwards',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%':   { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideDown: {
          '0%':   { opacity: '0', transform: 'translateY(-4px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        slideIn: {
          '0%':   { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        toastIn: {
          '0%':   { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)',     opacity: '1' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        // Line "draws in" — pair with pathLength="1" strokeDasharray="1".
        draw: {
          '0%':   { strokeDashoffset: '1' },
          '100%': { strokeDashoffset: '0' },
        },
      }
    },
  },
  plugins: [
    // Paper is always light (meeting recaps print), and .theme-light pins a subtree to light.
    plugin(({ addBase }) => addBase({ ':root': themeVars('light'), '.dark': themeVars('dark'), '.theme-light': themeVars('light'), '@media print': { '.dark': themeVars('light') } })),
  ],
}
