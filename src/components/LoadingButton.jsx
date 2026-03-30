import { Loader2 } from 'lucide-react'

export default function LoadingButton({ loading, children, className = '', ...props }) {
  return (
    <button
      disabled={loading || props.disabled}
      className={`relative flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {loading && <Loader2 size={18} className="animate-spin" />}
      {children}
    </button>
  )
}
