import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Eye, EyeOff } from 'lucide-react'
import LoadingButton from '../components/LoadingButton'
import toast from 'react-hot-toast'

const TABS = ['Subcontractor', 'Agency']

const employeeCounts = ['1-10', '11-50', '51-200', '200+']

export default function Signup() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('Subcontractor')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Shared fields
  const [companyName, setCompanyName] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')

  // Subcontractor fields
  const [employeeCount, setEmployeeCount] = useState('1-10')

  // Agency fields
  const [tradingName, setTradingName] = useState('')
  const [regNumber, setRegNumber] = useState('')

  const inputCls = "w-full px-3.5 py-2.5 border border-[#E2E6EA] rounded-lg text-[#1A1A2E] placeholder-[#B0B8C9] focus:outline-none focus:border-[#1B6FC8] focus:ring-2 focus:ring-[#1B6FC8]/10 text-sm"

  async function handleSubcontractorSubmit(e) {
    e.preventDefault()
    if (!companyName.trim() || !name.trim() || !email.trim() || !password.trim()) {
      toast.error('Please fill in all required fields')
      return
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password.trim(),
        options: { data: { name: name.trim(), role: 'admin' } },
      })
      if (authError) throw authError
      const authUser = authData.user
      if (!authUser) throw new Error('Account creation failed. Please try again.')

      // 2. Create company
      const { data: company, error: compError } = await supabase.from('companies').insert({
        name: companyName.trim(),
        contact_name: name.trim(),
        contact_email: email.trim().toLowerCase(),
        subscription_plan: 'trial',
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        company_type: 'subcontractor',
        phone: phone.trim() || null,
        employee_count: employeeCount,
        is_active: true,
        onboarding_complete: false,
        onboarding_step: 0,
        features: {},
      }).select().single()
      if (compError) throw compError

      // 3. Create profile
      const { error: profError } = await supabase.from('profiles').insert({
        id: authUser.id,
        company_id: company.id,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: 'admin',
        is_active: true,
      })
      if (profError) throw profError

      // 4. Auto sign-in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      })
      if (signInError) {
        // If email confirmation is required, still redirect
        toast.success('Account created! Check your email to confirm, then sign in.')
        navigate('/login')
        return
      }

      toast.success('Account created!')
      navigate('/onboarding')
    } catch (err) {
      console.error('Signup error:', err)
      toast.error(err.message || 'Something went wrong')
    }
    setLoading(false)
  }

  async function handleAgencySubmit(e) {
    e.preventDefault()
    if (!companyName.trim() || !name.trim() || !email.trim() || !password.trim()) {
      toast.error('Please fill in all required fields')
      return
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password.trim(),
        options: { data: { name: name.trim(), role: 'admin' } },
      })
      if (authError) throw authError
      const authUser = authData.user
      if (!authUser) throw new Error('Account creation failed. Please try again.')

      // 2. Create company
      const { data: company, error: compError } = await supabase.from('companies').insert({
        name: companyName.trim(),
        contact_name: name.trim(),
        contact_email: email.trim().toLowerCase(),
        subscription_plan: 'trial',
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        company_type: 'agency',
        phone: phone.trim() || null,
        is_active: true,
        onboarding_complete: false,
        onboarding_step: 0,
        features: {},
      }).select().single()
      if (compError) throw compError

      // 3. Create profile
      const { error: profError } = await supabase.from('profiles').insert({
        id: authUser.id,
        company_id: company.id,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: 'admin',
        is_active: true,
      })
      if (profError) throw profError

      // 4. Create agency record
      const { data: agency, error: agencyError } = await supabase.from('agencies').insert({
        company_name: companyName.trim(),
        trading_name: tradingName.trim() || null,
        primary_contact_name: name.trim(),
        primary_contact_email: email.trim().toLowerCase(),
        primary_contact_phone: phone.trim() || null,
        company_registration_number: regNumber.trim() || null,
        status: 'pending_verification',
      }).select().single()
      if (agencyError) throw agencyError

      // 5. Create agency_users link
      await supabase.from('agency_users').insert({
        agency_id: agency.id,
        email: email.trim().toLowerCase(),
        name: name.trim(),
        role: 'admin',
      })

      // 6. Auto sign-in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      })
      if (signInError) {
        toast.success('Account created! Check your email to confirm, then sign in.')
        navigate('/login')
        return
      }

      toast.success('Agency registered!')
      navigate('/onboarding')
    } catch (err) {
      console.error('Signup error:', err)
      toast.error(err.message || 'Something went wrong')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-dvh bg-[#1A2744] flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/">
            <span className="text-2xl text-white font-light tracking-[4px]">CORE<span className="font-bold tracking-normal">SITE</span></span>
          </Link>
          <p className="text-xs text-white/30 mt-2">Site Compliance Platform</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-bold text-[#1A1A2E] mb-1">Create Account</h2>
          <p className="text-sm text-[#6B7A99] mb-5">Start your free 14-day trial</p>

          {/* Tabs */}
          <div className="flex bg-[#F5F6F8] rounded-lg p-0.5 mb-6">
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${tab === t ? 'bg-white text-[#1A1A2E] shadow-sm' : 'text-[#6B7A99] hover:text-[#1A1A2E]'}`}>
                {t}
              </button>
            ))}
          </div>

          {/* Subcontractor Form */}
          {tab === 'Subcontractor' && (
            <form onSubmit={handleSubcontractorSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Company Name *</label>
                <input value={companyName} onChange={e => setCompanyName(e.target.value)} className={inputCls} placeholder="Acme M&E Ltd" required />
              </div>
              <div>
                <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Your Full Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Joe Smith" required />
              </div>
              <div>
                <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Email *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="joe@acmeme.co.uk" required />
              </div>
              <div>
                <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Password *</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    className={`${inputCls} pr-10`} placeholder="Min 8 characters" required minLength={8} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B0B8C9] hover:text-[#6B7A99]">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Phone Number</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="07..." />
              </div>
              <div>
                <label className="text-xs text-[#6B7A99] font-medium mb-1 block">How many employees?</label>
                <select value={employeeCount} onChange={e => setEmployeeCount(e.target.value)} className={inputCls}>
                  {employeeCounts.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <LoadingButton loading={loading} type="submit" className="w-full bg-[#1B6FC8] hover:bg-[#1558A0] text-white rounded-lg text-sm font-semibold mt-2">
                Start Free 14-Day Trial
              </LoadingButton>
            </form>
          )}

          {/* Agency Form */}
          {tab === 'Agency' && (
            <form onSubmit={handleAgencySubmit} className="space-y-3.5">
              <div>
                <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Company Name *</label>
                <input value={companyName} onChange={e => setCompanyName(e.target.value)} className={inputCls} placeholder="ABC Staffing Ltd" required />
              </div>
              <div>
                <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Trading Name</label>
                <input value={tradingName} onChange={e => setTradingName(e.target.value)} className={inputCls} placeholder="Optional" />
              </div>
              <div>
                <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Your Full Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Joe Smith" required />
              </div>
              <div>
                <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Email *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="joe@abcstaffing.co.uk" required />
              </div>
              <div>
                <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Password *</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    className={`${inputCls} pr-10`} placeholder="Min 8 characters" required minLength={8} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B0B8C9] hover:text-[#6B7A99]">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Phone Number</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="07..." />
              </div>
              <div>
                <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Company Registration Number</label>
                <input value={regNumber} onChange={e => setRegNumber(e.target.value)} className={inputCls} placeholder="e.g. 12345678" />
              </div>
              <LoadingButton loading={loading} type="submit" className="w-full bg-[#1B6FC8] hover:bg-[#1558A0] text-white rounded-lg text-sm font-semibold mt-2">
                Register Agency
              </LoadingButton>
            </form>
          )}
        </div>

        {/* Footer links */}
        <p className="text-center text-sm text-white/40 mt-5">
          Already have an account?{' '}
          <Link to="/login" className="text-white/70 hover:text-white underline transition-colors">Sign in</Link>
        </p>

        <div className="text-center mt-6 space-y-2">
          <p className="text-xs text-white/20">Powered by CoreSite</p>
          <div className="flex items-center justify-center gap-3 text-[10px]">
            <a href="/policies/privacy" className="text-white/15 hover:text-white/40 transition-colors">Privacy</a>
            <a href="/policies/terms" className="text-white/15 hover:text-white/40 transition-colors">Terms</a>
            <a href="/policies/cookies" className="text-white/15 hover:text-white/40 transition-colors">Cookies</a>
          </div>
        </div>
      </div>
    </div>
  )
}
