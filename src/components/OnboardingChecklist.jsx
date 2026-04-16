import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import { CheckCircle2, Circle, ChevronDown, ChevronUp, X, Rocket } from 'lucide-react'

export default function OnboardingChecklist() {
  const navigate = useNavigate()
  const { company, user } = useCompany()
  const [dismissed, setDismissed] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [checks, setChecks] = useState({
    account: true,
    logo: false,
    project: false,
    drawing: false,
    worker: false,
    snag: false,
  })

  useEffect(() => {
    const stored = localStorage.getItem('onboarding_checklist_dismissed')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === 'true') setDismissed(true)
  }, [])

  async function loadChecks() {
    const cid = company.id
    const [projects, drawings, operatives, snags] = await Promise.all([
      supabase.from('projects').select('id').eq('company_id', cid).limit(1),
      supabase.from('drawings').select('id').eq('company_id', cid).limit(1),
      supabase.from('operatives').select('id').eq('company_id', cid).limit(1),
      supabase.from('snags').select('id').eq('company_id', cid).limit(1),
    ])

    setChecks({
      account: true,
      logo: !!company.logo_url,
      project: (projects.data?.length || 0) > 0,
      drawing: (drawings.data?.length || 0) > 0,
      worker: (operatives.data?.length || 0) > 0,
      snag: (snags.data?.length || 0) > 0,
    })
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (company && user) loadChecks()
  }, [company, user])

  if (dismissed || !company || company.onboarding_complete) return null

  const items = [
    { key: 'account', label: 'Account created' },
    { key: 'logo', label: 'Logo uploaded' },
    { key: 'project', label: 'First project created' },
    { key: 'drawing', label: 'First drawing uploaded' },
    { key: 'worker', label: 'First worker invited' },
    { key: 'snag', label: 'First snag created' },
  ]

  const done = Object.values(checks).filter(Boolean).length
  const total = items.length
  const pct = Math.round((done / total) * 100)

  function handleDismiss() {
    setDismissed(true)
    localStorage.setItem('onboarding_checklist_dismissed', 'true')
  }

  return (
    <div className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
      <div className="px-4 py-3 flex items-center justify-between cursor-pointer" onClick={() => setCollapsed(!collapsed)}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#1B6FC8]/10 flex items-center justify-center">
            <Rocket size={16} className="text-[#1B6FC8]" />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Get started with CoreSite</p>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{done} of {total} complete</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={e => { e.stopPropagation(); handleDismiss() }} className="p-1 rounded hover:bg-black/5 transition-colors" style={{ color: 'var(--text-muted)' }}>
            <X size={14} />
          </button>
          {collapsed ? <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} />}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-2">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-main)' }}>
          <div className="h-full bg-[#2EA043] rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 pb-4">
          <div className="space-y-1.5 mt-2">
            {items.map(item => (
              <div key={item.key} className="flex items-center gap-2.5 py-1">
                {checks[item.key]
                  ? <CheckCircle2 size={16} className="text-[#2EA043] shrink-0" />
                  : <Circle size={16} className="text-[#D1D5DB] shrink-0" />
                }
                <span className={`text-xs ${checks[item.key] ? 'line-through' : 'font-medium'}`}
                  style={{ color: checks[item.key] ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          {done < total && (
            <button onClick={() => navigate('/onboarding')}
              className="w-full mt-3 py-2 bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-xs font-semibold rounded-lg transition-colors">
              Complete Setup
            </button>
          )}
        </div>
      )}
    </div>
  )
}
