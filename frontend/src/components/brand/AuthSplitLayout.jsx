// Split layout for pages outside the app shell (sign-in, onboarding):
// a dark brand panel on the left (lg+ only) and the form column on the right.
// Below lg it is a single canvas column with a soft accent glow at the top.
//
// Props:
//   aside        - brand panel content (lg+ only). Rendered inside a
//                  `flex flex-1 flex-col justify-between` wrapper, so pass
//                  top / middle / bottom blocks (a fragment works).
//   children     - the form column body (inside <main>)
//   footer       - small print under the form column (text-xs, centered)
//   mobileHeader - node shown above the body below lg (e.g. mark + wordmark),
//                  in a `lg:hidden mb-8` wrapper
//   width        - form column max width: 'sm' (default) | 'md' | 'lg'
//
// The aside is sticky on lg+, so a long form column scrolls while the brand
// panel stays in view.

const WIDTHS = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' }

const ASIDE_GLOW = {
  backgroundImage:
    'radial-gradient(60% 50% at 15% 10%, rgb(43 125 76 / 0.45), transparent 70%), ' +
    'radial-gradient(50% 45% at 90% 85%, rgb(184 50 26 / 0.28), transparent 70%)',
}

const GRID_MASK = 'radial-gradient(ellipse at center, #000 40%, transparent 75%)'
const ASIDE_GRID = {
  backgroundImage:
    'linear-gradient(to right, rgb(255 255 255 / 0.04) 1px, transparent 1px), ' +
    'linear-gradient(to bottom, rgb(255 255 255 / 0.04) 1px, transparent 1px)',
  backgroundSize: '24px 24px',
  maskImage: GRID_MASK,
  WebkitMaskImage: GRID_MASK,
}

const MOBILE_GLOW = { backgroundImage: 'radial-gradient(80% 45% at 50% 0%, rgb(43 125 76 / 0.12), transparent)' }

export default function AuthSplitLayout({ aside, children, footer, mobileHeader, width = 'sm' }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="relative hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start flex-col overflow-hidden theme-light bg-brand-gray-900 text-white p-10 xl:p-14">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={ASIDE_GLOW} />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={ASIDE_GRID} />
        <div className="relative flex flex-1 flex-col justify-between gap-10 min-h-0">{aside}</div>
      </div>

      <div className="relative flex min-h-screen min-w-0 flex-col">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 lg:hidden" style={MOBILE_GLOW} />
        <main className={`relative flex-1 flex flex-col justify-center w-full ${WIDTHS[width] || WIDTHS.sm} mx-auto px-6 py-10 sm:py-16`}>
          {mobileHeader && <div className="lg:hidden mb-8">{mobileHeader}</div>}
          {children}
        </main>
        {footer && <footer className="relative px-6 pb-6 text-center text-xs text-brand-gray-500">{footer}</footer>}
      </div>
    </div>
  )
}
