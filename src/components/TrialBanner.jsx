import { useState, useEffect } from 'react'
import { useCompany } from '../lib/CompanyContext'
import { Clock, X, ArrowRight } from 'lucide-react'

export default function TrialBanner() {
  const { company } = useCompany()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('trial_banner_dismissed')
    if (stored) {
      const ts = parseInt(stored, 10)
      // Dismissed for 24 hours
      if (Date.now() - ts < 24 * 60 * 60 * 1000) {
        setDismissed(true)
      } else {
        localStorage.removeItem('trial_banner_dismissed')
      }
    }
  }, [])

  if (dismissed || !company) return null
  if (company.subscription_plan !== 'trial' || !company.trial_ends_at) return null

  const now = new Date()
  const ends = new Date(company.trial_ends_at)
  const diffMs = ends - now
  const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))

  if (daysLeft <= 0) {
    // Trial expired
    return (
      <div className="bg-[#DA3633] text-white px-4 py-2.5 flex items-center justify-between rounded-lg mb-4">
        <div className="flex items-center gap-2">
          <Clock size={14} />
          <span className="text-xs font-semibold">Your free trial has expired.</span>
          <a href="mailto:joe@coresite.io" className="text-xs underline font-medium ml-1">Contact us to upgrade</a>
        </div>
      </div>
    )
  }

  const bgColor = daysLeft <= 3 ? '#DA3633' : daysLeft <= 7 ? '#D97706' : '#1B6FC8'
  const bgLight = daysLeft <= 3 ? '#FEF2F2' : daysLeft <= 7 ? '#FFFBEB' : '#EFF6FF'
  const textColor = daysLeft <= 3 ? '#991B1B' : daysLeft <= 7 ? '#92400E' : '#1E40AF'
  const borderColor = daysLeft <= 3 ? '#FECACA' : daysLeft <= 7 ? '#FDE68A' : '#BFDBFE'

  function handleDismiss() {
    setDismissed(true)
    localStorage.setItem('trial_banner_dismissed', String(Date.now()))
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5 rounded-lg mb-4 border"
      style={{ backgroundColor: bgLight, borderColor }}>
      <div className="flex items-center gap-2">
        <Clock size={14} style={{ color: bgColor }} />
        <span className="text-xs font-semibold" style={{ color: textColor }}>
          {daysLeft} day{daysLeft !== 1 ? 's' : ''} left on your free trial
        </span>
      </div>
      <div className="flex items-center gap-2">
        <a href="mailto:joe@coresite.io"
          className="flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-semibold text-white transition-colors"
          style={{ backgroundColor: bgColor }}>
          Upgrade <ArrowRight size={12} />
        </a>
        <button onClick={handleDismiss} className="p-1 rounded hover:bg-black/5 transition-colors" style={{ color: textColor }}>
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
