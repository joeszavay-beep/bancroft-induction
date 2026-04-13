import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Eye, ArrowRight, Loader2 } from 'lucide-react'
import { setSession } from '../lib/storage'

export default function SandboxEntry() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) { setError('Name and email are required'); return }
    setLoading(true)
    setError('')

    try {
      // Sign in as demo account (needed for RLS)
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: 'demo@coresite.io', password: import.meta.env.VITE_DEMO_PASSWORD || 'Demo2026!',
      })

      if (authErr || !data?.user) {
        setError(`Login failed: ${authErr?.message || 'Unknown error'}`)
        setLoading(false)
        return
      }

      // Save lead and send email — fire and forget
      try { supabase.from('demo_requests').insert({
        name: name.trim(), email: email.trim(),
        company: company.trim() || null, phone: mobile.trim() || null,
        message: 'Entered via Try Demo button',
      }) } catch {}

      fetch('/api/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), email: email.trim(),
          company: company.trim(), phone: mobile.trim(),
          message: 'Try Demo',
        }),
      }).catch(() => {})

      // Load profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*, companies(id, name, logo_url, primary_colour, secondary_colour, features)')
        .eq('id', data.user.id)
        .single()

      const co = profile?.companies
      const userData = {
        id: profile?.id || data.user.id,
        name: profile?.name || 'Demo User',
        email: 'demo@coresite.io',
        role: 'manager', // Always manager in sandbox — no admin/superadmin access
        company_id: profile?.company_id,
      }

      setSession('pm_auth', 'true')
      setSession('manager_data', JSON.stringify({ ...userData, project_ids: [] }))
      sessionStorage.setItem('sandbox_mode', 'true')

      if (co) {
        document.documentElement.style.setProperty('--primary-color', co.primary_colour || '#1B6FC8')
        document.documentElement.style.setProperty('--sidebar-color', co.secondary_colour || '#1A2744')
        document.title = `${co.name} | CoreSite (Demo)`
      }

      window.location.href = '/app'
    } catch (err) {
      setError(`Error: ${err.message}`)
      setLoading(false)
    }
  }

  const inputCls = "w-full px-3.5 py-2.5 border border-[#E2E6EA] rounded-lg text-[#1A1A2E] placeholder-[#B0B8C9] focus:outline-none focus:border-[#1B6FC8] focus:ring-2 focus:ring-[#1B6FC8]/10 text-sm"

  return (
    <div className="min-h-dvh bg-[#1A2744] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Eye size={28} className="text-white" />
          </div>
          <h1 className="text-xl text-white font-light tracking-[3px]">CORE<span className="font-bold tracking-normal">SITE</span></h1>
          <p className="text-white/40 text-xs mt-2">Try the full platform — no commitment</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-xl">
          <h2 className="text-lg font-bold text-[#1A1A2E] mb-1">Try CoreSite</h2>
          <p className="text-sm text-[#6B7A99] mb-5">Enter your details to explore the demo</p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-[11px] text-[#6B7A99] font-medium mb-1 block">Full Name *</label>
              <input value={name} onChange={e => { setName(e.target.value); setError('') }} className={inputCls} placeholder="Your name" autoFocus />
            </div>
            <div>
              <label className="text-[11px] text-[#6B7A99] font-medium mb-1 block">Company</label>
              <input value={company} onChange={e => setCompany(e.target.value)} className={inputCls} placeholder="Your company name" />
            </div>
            <div>
              <label className="text-[11px] text-[#6B7A99] font-medium mb-1 block">Email *</label>
              <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError('') }} className={inputCls} placeholder="you@company.com" />
            </div>
            <div>
              <label className="text-[11px] text-[#6B7A99] font-medium mb-1 block">Mobile</label>
              <input type="tel" value={mobile} onChange={e => setMobile(e.target.value)} className={inputCls} placeholder="07..." />
            </div>

            {error && <p className="text-sm text-[#DA3633]">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full py-3 bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Loading demo...</> : <>Explore Demo <ArrowRight size={16} /></>}
            </button>
          </form>

          <p className="text-[10px] text-[#B0B8C9] text-center mt-4">
            Your details are only used to follow up if you'd like to learn more.
          </p>
        </div>

        <div className="text-center mt-5">
          <button onClick={() => navigate('/login')} className="text-xs text-white/30 hover:text-white/60 transition-colors">
            Already have an account? Sign in
          </button>
        </div>
      </div>
    </div>
  )
}
