import { Loader2 } from 'lucide-react'
import BrandMark from './BrandMark'

export default function FullPageMessage({ title, body, action, loading, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card-padded w-full max-w-md flex flex-col items-center text-center gap-4 animate-fade-up">
        {loading ? <Loader2 className="w-6 h-6 animate-spin text-brand-gray-400" /> : <BrandMark size={40} />}
        <div>
          <h1 className="text-heading">{title}</h1>
          {body && <p className="text-sm text-brand-gray-500 mt-1.5">{body}</p>}
        </div>
        {children}
        {action}
      </div>
    </div>
  )
}
