import { useCompany } from '../lib/CompanyContext'
import { Eye, X } from 'lucide-react'
import { removeSession } from '../lib/storage'

export default function DemoBanner() {
  const { isDemo } = useCompany()

  if (!isDemo) return null

  function exitDemo() {
    sessionStorage.removeItem('sandbox_mode')
    removeSession('pm_auth')
    removeSession('manager_data')
    window.location.href = '/'
  }

  return (
    <div className="bg-[#1B6FC8] text-white text-center px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 shrink-0 z-50">
      <Eye size={13} />
      <span>You're exploring CoreSite in demo mode</span>
      <span className="text-white/40">·</span>
      <a href="/" onClick={(e) => { e.preventDefault(); exitDemo() }} className="underline hover:text-white/80 transition-colors">
        Request your own account
      </a>
      <button onClick={exitDemo} className="ml-2 p-0.5 hover:bg-white/20 rounded transition-colors">
        <X size={12} />
      </button>
    </div>
  )
}
