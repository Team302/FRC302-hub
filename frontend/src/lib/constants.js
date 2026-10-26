// Statuses and labels look the way Monday's do: a solid colour block you can read across a room.
// Fills are fixed colours, not the theme's mirrored hue scales, so a status means the same colour
// in both themes. Text is literal #fff / #1f1f1f (the theme's `white` flips in dark mode), each
// ≥ 4.5:1 on its fill.
export const STATUSES = [
  { id: 'not_started', label: 'Not started', fill: '#c4c4c4', ink: '#1f1f1f' },
  { id: 'working', label: 'Working on it', fill: '#fdab3d', ink: '#1f1f1f' },
  { id: 'stuck', label: 'Stuck', fill: '#d83a52', ink: '#ffffff' },
  { id: 'review', label: 'Needs review', fill: '#0b6bcb', ink: '#ffffff' },
  { id: 'done', label: 'Done', fill: '#037f4c', ink: '#ffffff' },
]
export const STATUS = Object.fromEntries(STATUSES.map((s) => [s.id, s]))

// A board can rename the five statuses (their meaning is fixed: "done" completes a task).
export function boardStatuses(board) {
  const custom = board?.status_labels || {}
  return STATUSES.map((s) => ({ ...s, label: custom[s.id]?.label || s.label }))
}

// Label colours for custom status/dropdown columns: same fixed-fill rule.
export const LABEL_FILL = {
  gray: ['#c4c4c4', '#1f1f1f'], red: ['#d83a52', '#ffffff'], orange: ['#e2621b', '#ffffff'], amber: ['#fdab3d', '#1f1f1f'],
  yellow: ['#ffcb00', '#1f1f1f'], lime: ['#9cd326', '#1f1f1f'], green: ['#037f4c', '#ffffff'], teal: ['#0b7a75', '#ffffff'],
  cyan: ['#66ccff', '#1f1f1f'], blue: ['#0b6bcb', '#ffffff'], indigo: ['#5559df', '#ffffff'], violet: ['#9d50dd', '#ffffff'], pink: ['#e44c9a', '#ffffff'],
}

export const PRIORITIES = [
  { id: 'critical', label: 'Critical', fill: '#333333', ink: '#ffffff' },
  { id: 'high', label: 'High', fill: '#401694', ink: '#ffffff' },
  { id: 'medium', label: 'Medium', fill: '#5559df', ink: '#ffffff' },
  { id: 'low', label: 'Low', fill: '#579bfc', ink: '#1f1f1f' },
]
export const PRIORITY = Object.fromEntries(PRIORITIES.map((p) => [p.id, p]))

export const ROLES = [
  { id: 'admin', label: 'Mentor', hint: 'Manages people, money and every setting' },
  { id: 'lead', label: 'Lead', hint: 'Runs meetings, creates boards, manages equipment' },
  { id: 'member', label: 'Member', hint: 'Works tasks, checks in, submits expenses' },
]
export const ROLE = Object.fromEntries(ROLES.map((r) => [r.id, r]))
export const RANK = { member: 1, lead: 2, admin: 3 }
export const atLeast = (user, role) => (RANK[user?.role] || 0) >= RANK[role]
// Mirrors the server (worker/src/lib/items.js): a lead or mentor, or the task's reviewer when
// they aren't also its owner. Only used to choose which buttons to show; the server decides.
// Mirrors canReview on the server: any lead or mentor, or someone on the task's subteam (the
// board's; without one, the owner's). Never the owner. Used to fill the reviewer picker.
export function reviewerOptions(users, board, ownerId) {
  const owner = users.find((u) => u.id === ownerId)
  const scope = board?.subteam_id || owner?.subteam_id || null
  return users.filter((u) => u.id !== ownerId && (u.role === 'lead' || u.role === 'admin' || (scope && u.subteam_id === scope)))
}
// Why Done is locked for this person on this task, or null when it isn't.
export const doneLock = (user, board, item) => (board?.require_approval && item.status !== 'done' && !canApprove(user, item)
  ? (item.reviewer_id ? 'Needs approval: submit for review' : 'Needs approval: pick a reviewer, then submit for review') : null)
export const canApprove = (user, item) => atLeast(user, 'lead') || (!!item.reviewer_id && item.reviewer_id === user?.id && !!item.assignee_id && item.assignee_id !== user?.id)

export const MEETING_KINDS = [
  { id: 'general', label: 'All-team' },
  { id: 'subteam', label: 'Subteam' },
  { id: 'build', label: 'Build session' },
  { id: 'leadership', label: 'Leadership', minRole: 'lead' },
  { id: 'mentor', label: 'Mentors only', minRole: 'admin' },
]
export const MEETING_KIND = Object.fromEntries(MEETING_KINDS.map((k) => [k.id, k]))

export const COLORS = ['gray', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'violet', 'pink']
// Written out in full so Tailwind's scanner keeps them.
export const SWATCH = {
  gray: 'bg-gray-400', red: 'bg-red-500', orange: 'bg-orange-500', amber: 'bg-amber-500', yellow: 'bg-yellow-400',
  lime: 'bg-lime-500', green: 'bg-green-600', teal: 'bg-teal-500', cyan: 'bg-cyan-500', blue: 'bg-blue-500',
  indigo: 'bg-indigo-500', violet: 'bg-violet-500', pink: 'bg-pink-500',
}
export const BORDER = {
  gray: 'border-gray-400', red: 'border-red-500', orange: 'border-orange-500', amber: 'border-amber-500', yellow: 'border-yellow-400',
  lime: 'border-lime-500', green: 'border-green-600', teal: 'border-teal-500', cyan: 'border-cyan-500', blue: 'border-blue-500',
  indigo: 'border-indigo-500', violet: 'border-violet-500', pink: 'border-pink-500',
}
export const TEXT = {
  gray: 'text-gray-600', red: 'text-red-600', orange: 'text-orange-600', amber: 'text-amber-600', yellow: 'text-yellow-600',
  lime: 'text-lime-600', green: 'text-green-600', teal: 'text-teal-600', cyan: 'text-cyan-600', blue: 'text-blue-600',
  indigo: 'text-indigo-600', violet: 'text-violet-600', pink: 'text-pink-600',
}


export const COLUMN_TYPES = [
  { id: 'status', label: 'Status', hint: 'Labels you define' },
  { id: 'people', label: 'People', hint: 'One or more teammates' },
  { id: 'date', label: 'Date' },
  { id: 'timeline', label: 'Timeline', hint: 'Start and end date' },
  { id: 'text', label: 'Text' },
  { id: 'number', label: 'Numbers', hint: 'Summed per group' },
  { id: 'checkbox', label: 'Checkbox' },
  { id: 'dropdown', label: 'Tags', hint: 'Pick several from a list' },
  { id: 'link', label: 'Link' },
]
export const COLUMN_TYPE = Object.fromEntries(COLUMN_TYPES.map((c) => [c.id, c]))

export const BOARD_TEMPLATES = [
  { id: 'blank', label: 'Blank', hint: 'This week, Next up, Backlog' },
  { id: 'build', label: 'Robot build', hint: 'Design → Fabrication → Assembly → Testing, with subsystem, timeline, hours, parts and CAD columns' },
  { id: 'competition', label: 'Competition prep', hint: 'Before, at and after an event, with area, helpers and a packing checkbox' },
  { id: 'purchasing', label: 'Parts & purchasing', hint: 'Requested → Approved → Ordered → Received, with vendor, link, quantity, cost (totalled per group), needed-by date and tracking' },
  { id: 'outreach', label: 'Outreach', hint: 'Events with date, volunteers and volunteer hours' },
]
