// Page header (Stripe-style): large semibold title with tight tracking, an
// optional subtitle, right-aligned actions and a hairline rule beneath.
//
// Props:
//   title    - page title text
//   subtitle - optional subtitle line
//   actions  - optional node (buttons) aligned to the right
//   divider  - draw the hairline rule under the header (default true)

export default function PageHeader({ title, subtitle, actions, divider = true }) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-6 ${divider ? 'pb-5 border-b border-brand-gray-200' : ''}`}>
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
