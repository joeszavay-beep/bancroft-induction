import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import { Eye, EyeOff } from 'lucide-react'
import LoadingButton from '../components/LoadingButton'

export default function PMLogin() {
  const navigate = useNavigate()
  const { login } = useCompany()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    setError('')

    const { data: manager, error: dbErr } = await supabase
      .from('managers')
      .select('*')
      .ilike('email', email.trim())
      .eq('password', password.trim())
      .single()

    if (dbErr || !manager) {
      setLoading(false)
      setError('Invalid email or password')
      return
    }

    if (!manager.is_active) {
      setLoading(false)
      setError('This account has been disabled. Contact your admin.')
      return
    }

    // Fetch company
    let companyData = null
    if (manager.company_id) {
      const { data: co } = await supabase
        .from('companies')
        .select('*')
        .eq('id', manager.company_id)
        .single()
      companyData = co

      if (companyData && !companyData.is_active) {
        setLoading(false)
        setError('Your account has been suspended. Please contact CoreSite support.')
        return
      }
    }

    const userData = {
      id: manager.id,
      name: manager.name,
      email: manager.email,
      role: manager.role,
      company_id: manager.company_id,
      project_ids: manager.project_ids || [],
    }

    login(userData, companyData)
    setLoading(false)

    if (manager.must_change_password) {
      navigate('/app/change-password')
    } else if (manager.role === 'super_admin') {
      navigate('/superadmin')
    } else {
      navigate('/app')
    }
  }

  return (
    <div className="min-h-dvh bg-[#0D1526] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/coresite-logo.svg" alt="CoreSite" className="h-12 mx-auto mb-6 brightness-0 invert" />
        </div>

        <div className="bg-white rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-bold text-[#1A1A2E] mb-1">Sign In</h2>
          <p className="text-sm text-[#6B7A99] mb-6">Enter your credentials to continue</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Username or Email</label>
              <input
                type="text"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                className="w-full px-3.5 py-2.5 border border-[#E2E6EA] rounded-lg text-[#1A1A2E] placeholder-[#B0B8C9] focus:outline-none focus:border-[#1B6FC8] focus:ring-2 focus:ring-[#1B6FC8]/10 text-sm"
                placeholder="Enter your email"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  className="w-full px-3.5 py-2.5 border border-[#E2E6EA] rounded-lg text-[#1A1A2E] placeholder-[#B0B8C9] focus:outline-none focus:border-[#1B6FC8] focus:ring-2 focus:ring-[#1B6FC8]/10 text-sm pr-10"
                  placeholder="Enter your password"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B0B8C9] hover:text-[#6B7A99]">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-[#DA3633]">{error}</p>}

            <LoadingButton loading={loading} type="submit" className="w-full bg-[#1B6FC8] hover:bg-[#1558A0] text-white rounded-lg text-sm font-semibold">
              Sign In
            </LoadingButton>
          </form>
        </div>

        <div className="text-center mt-6 space-y-2">
          <p className="text-xs text-white/30">Powered by CoreSite &mdash; Site Compliance Platform</p>
          <div className="flex items-center justify-center gap-3 text-[10px]">
            <a href="/policies/privacy" className="text-white/20 hover:text-white/50 transition-colors">Privacy</a>
            <a href="/policies/terms" className="text-white/20 hover:text-white/50 transition-colors">Terms</a>
            <a href="/policies/cookies" className="text-white/20 hover:text-white/50 transition-colors">Cookies</a>
          </div>
        </div>
      </div>
    </div>
  )
}
