// Chart palette: the single source for every raw color a chart primitive draws
// with. SVG fill/stroke and inline styles can't use Tailwind classes, so the
// primitives (AreaChart, Sparkline, ColumnChart, HBarList, SegmentedBar, Donut)
// take hex values from here. Never scatter chart hex codes through page JSX.
//
// Accent-led: one indigo ramp for quantities, gray for "previous" and money out,
// green/amber/red only where the data itself is a signal (overdue, errors).
// Light fills (amber-300, accent-200) are for non-text marks only; always put a
// dark text label next to them.
//
// Maps keyed by data use the API's keys:
//   aging     - /api/reports/ar-aging and ap-aging `buckets[].key`
//   forecast  - /api/reports/maintenance-forecast `buckets[].key`
//   recurring - /api/reports/recurring source objects
//   stages    - client stage values
//   jobStatus - job status values

export const ACCENT = {
  50: 'rgb(var(--accent-50))', 100: 'rgb(var(--accent-100))', 200: 'rgb(var(--accent-200))', 300: 'rgb(var(--accent-300))', 400: 'rgb(var(--accent-400))',
  500: 'rgb(var(--accent-500))', 600: 'rgb(var(--accent-600))', 700: 'rgb(var(--accent-700))', 800: 'rgb(var(--accent-800))', 900: 'rgb(var(--accent-900))',
}

export const GRAY = {
  50: 'rgb(var(--brand-gray-50))', 100: 'rgb(var(--brand-gray-100))', 200: 'rgb(var(--brand-gray-200))', 300: 'rgb(var(--brand-gray-300))', 400: 'rgb(var(--brand-gray-400))',
  500: 'rgb(var(--brand-gray-500))', 600: 'rgb(var(--brand-gray-600))', 700: 'rgb(var(--brand-gray-700))',
}

export const CHART = {
  // Structure
  primary: ACCENT[600],       // main series
  primarySoft: ACCENT[300],   // secondary emphasis (e.g. below-median bars)
  muted: GRAY[400],           // previous period, "other"
  grid: 'rgb(var(--brand-gray-200) / 0.7)',            // gridlines, empty donut ring
  track: GRAY[100],           // bar tracks
  axis: GRAY[400],            // axis text
  surface: 'rgb(var(--white))', // card surface: label halos, hover-dot fill (dark in dark mode)

  // Semantic
  in: ACCENT[600],            // money in / collected
  out: GRAY[500],             // money out / spent (neutral, not red)
  net: ACCENT[700],
  positive: 'rgb(var(--green-600))',
  negative: 'rgb(var(--red-500))',
  warning: 'rgb(var(--amber-500))',
  danger: 'rgb(var(--red-600))',
  neutral: GRAY[400],
  expense: 'rgb(var(--red-300))',         // P&L expense columns (soft red)

  // Monochrome accent ramp for 2–4 categorical items, darkest first
  ramp: [ACCENT[700], ACCENT[400], ACCENT[200], ACCENT[100]],
  // More than 4 categories (same hues as Avatar tints)
  categorical: [ACCENT[600], 'rgb(var(--sky-500))', 'rgb(var(--emerald-500))', 'rgb(var(--amber-500))', 'rgb(var(--rose-500))', 'rgb(var(--violet-500))', GRAY[400]],

  // Receivables / payables age: calm sequential ramp (current is not a risk)
  aging: { current: ACCENT[300], '1_30': 'rgb(var(--amber-300))', '31_60': 'rgb(var(--amber-500))', '61_90': 'rgb(var(--orange-500))', '90_plus': 'rgb(var(--red-600))' },
  // Maintenance forecast: overdue is a risk, future windows are load (accent)
  forecast: { overdue: 'rgb(var(--red-500))', d30: ACCENT[500], d60: ACCENT[400], d90: ACCENT[200] },
  // Recurring revenue sources (Money composition bar and Reports donut)
  recurring: { subscriptions: ACCENT[600], contracts: ACCENT[400], recurring_invoices: ACCENT[200] },
  // Client pipeline stages
  stages: { lead: ACCENT[200], prospect: ACCENT[400], customer: ACCENT[600], inactive: 'rgb(var(--amber-300))' },
  // Job status (week strip, workload)
  jobStatus: { scheduled: ACCENT[500], in_progress: 'rgb(var(--amber-400))', on_hold: GRAY[400], completed: 'rgb(var(--emerald-500))' },
  // Automation run outcomes
  status: { success: 'rgb(var(--green-500))', error: 'rgb(var(--red-500))', skipped: GRAY[300] },
}

// Color for the i-th item of a palette, wrapping around.
export function colorAt(i, palette = CHART.categorical) {
  const n = palette.length
  return palette[((i % n) + n) % n]
}

export default CHART
