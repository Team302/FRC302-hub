// Barrel re-export for shared UI primitives.
// No module in components/ui imports this barrel (siblings import each other by
// path), so re-exporting everything here cannot create an import cycle.
export { default as StatCard } from './StatCard'
export { default as Badge } from './Badge'
export { default as Modal } from './Modal'
export { default as EmptyState } from './EmptyState'
export { default as PageHeader } from './PageHeader'
export { default as Money } from './Money'
export { default as Skeleton, SkeletonRow, SkeletonTable } from './Skeleton'
export { default as FilterChips } from './FilterChips'
export { default as SummaryStrip } from './SummaryStrip'

// Motion + charts foundation
export { default as AreaChart, niceCeil } from './AreaChart'
export { default as Sparkline } from './Sparkline'
export { default as CountUp } from './CountUp'
export {
  Stagger, FadeUp, staggerStyle, useEnterAnimation, usePrefersReducedMotion, prefersReducedMotion,
  useDrawIn, useElementWidth,
} from './Motion'

// Overview / reporting primitives
export { default as DeltaBadge } from './DeltaBadge'
export { default as SegmentedControl } from './SegmentedControl'
export { default as RangePills } from './RangePills'
export { default as HBarList } from './HBarList'
export { default as SegmentedBar } from './SegmentedBar'
export { default as Donut } from './Donut'
export { default as ColumnChart } from './ColumnChart'
export { default as ChartDataToggle, ChartDataTable } from './ChartDataToggle'
export { default as Avatar, AvatarGroup } from './Avatar'
export { CHART, ACCENT, GRAY, colorAt } from './chartColors'
export { pctChange } from '../../lib/trends'
