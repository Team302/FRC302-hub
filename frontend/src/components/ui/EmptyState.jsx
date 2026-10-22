// Empty-state block. Wraps the `.empty-state*` utilities from globals.css.
// The icon sits in a soft white tile with a hairline border and halo.
//
// Props:
//   icon    - lucide icon component
//   title   - primary line (`.empty-state-title`)
//   message - secondary line (`.empty-state-body`)
//   action  - optional node (e.g. a button/link) shown below the message

export default function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="empty-state animate-fade-in">
      {Icon && (
        <div className="mb-4 w-12 h-12 rounded-xl bg-white border border-brand-gray-200 shadow-card ring-4 ring-brand-gray-100/80 flex items-center justify-center" aria-hidden="true">
          <Icon className="w-5 h-5 text-brand-gray-500" />
        </div>
      )}
      {title && <p className="empty-state-title">{title}</p>}
      {message && <p className="empty-state-body">{message}</p>}
      {action}
    </div>
  )
}
