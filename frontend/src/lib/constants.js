// Status and priority look the way Monday's do: a solid colour block you can read across a room.
// Status fills are fixed colours, NOT the theme's mirrored hue scales: a status must mean the same
// colour in both themes, and white text must stay readable on it (each ≥ 4.5:1 except "Working",
// which uses dark text instead).
export const STATUSES = [
  { id: 'not_started', label: 'Not started', cls: 'bg-brand-gray-200 text-brand-gray-700', dot: 'bg-brand-gray-400' },
  { id: 'working', label: 'Working on it', cls: 'bg-[#fdab3d] text-[#1f1f1f]', dot: 'bg-[#fdab3d]' },
  { id: 'stuck', label: 'Stuck', cls: 'bg-[#d83a52] text-white', dot: 'bg-[#d83a52]' },
  { id: 'review', label: 'Needs review', cls: 'bg-[#0b6bcb] text-white', dot: 'bg-[#0b6bcb]' },
  { id: 'done', label: 'Done', cls: 'bg-[#037f4c] text-white', dot: 'bg-[#00b461]' },
]
export const STATUS = Object.fromEntries(STATUSES.map((s) => [s.id, s]))

export const PRIORITIES = [
  { id: 'low', label: 'Low', cls: 'text-brand-gray-500' },
  { id: 'medium', label: 'Medium', cls: 'text-blue-600' },
  { id: 'high', label: 'High', cls: 'text-orange-600' },
  { id: 'critical', label: 'Critical', cls: 'text-red-600 font-semibold' },
]
export const PRIORITY = Object.fromEntries(PRIORITIES.map((p) => [p.id, p]))

export const ROLES = [
  { id: 'admin', label: 'Mentor', hint: 'Manages the team, the vault and every setting' },
  { id: 'lead', label: 'Lead', hint: 'Runs meetings, makes boards, adds vault entries' },
  { id: 'member', label: 'Member', hint: 'Works tasks, checks in, sees member vault entries' },
]
export const ROLE = Object.fromEntries(ROLES.map((r) => [r.id, r]))
export const RANK = { member: 1, lead: 2, admin: 3 }
export const atLeast = (user, role) => (RANK[user?.role] || 0) >= RANK[role]

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
  lime: 'bg-lime-500', green: 'bg-green-500', teal: 'bg-teal-500', cyan: 'bg-cyan-500', blue: 'bg-blue-500',
  indigo: 'bg-indigo-500', violet: 'bg-violet-500', pink: 'bg-pink-500',
}
export const BORDER = {
  gray: 'border-gray-400', red: 'border-red-500', orange: 'border-orange-500', amber: 'border-amber-500', yellow: 'border-yellow-400',
  lime: 'border-lime-500', green: 'border-green-500', teal: 'border-teal-500', cyan: 'border-cyan-500', blue: 'border-blue-500',
  indigo: 'border-indigo-500', violet: 'border-violet-500', pink: 'border-pink-500',
}
export const TEXT = {
  gray: 'text-gray-600', red: 'text-red-600', orange: 'text-orange-600', amber: 'text-amber-600', yellow: 'text-yellow-600',
  lime: 'text-lime-600', green: 'text-green-600', teal: 'text-teal-600', cyan: 'text-cyan-600', blue: 'text-blue-600',
  indigo: 'text-indigo-600', violet: 'text-violet-600', pink: 'text-pink-600',
}

export const VAULT_ACCESS = [
  { id: 'member', label: 'Everyone on the team' },
  { id: 'lead', label: 'Leads and mentors' },
  { id: 'admin', label: 'Mentors only' },
]
