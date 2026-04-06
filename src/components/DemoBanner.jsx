import { useCompany } from '../lib/CompanyContext'
import { Eye } from 'lucide-react'

export default function DemoBanner() {
  const { isDemo } = useCompany()

  if (!isDemo) return null

  return (
    <div className="bg-[#1B6FC8] text-white text-center px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 shrink-0 z-50">
      <Eye size={13} />
      <span>You're viewing a demo account</span>
      <span className="text-white/50">·</span>
      <a href="/" className="underline hover:text-white/80 transition-colors">Request your own account</a>
    </div>
  )
}
