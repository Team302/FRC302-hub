// Labelled form field: label, control, optional hint underneath.
export default function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-xs text-brand-gray-500 mt-1">{hint}</span>}
    </label>
  )
}
