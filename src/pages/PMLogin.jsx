import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const [showReset, setShowReset] = useState(false)
  const { resetPassword } = useCompany()

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    if (password.trim().length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    setError('')

    try {
      await login(email.trim().toLowerCase(), password.trim())
      navigate('/app')
    } catch (err) {
      setError(err.message === 'Invalid login credentials' ? 'Invalid email or password' : err.message)
    }
    setLoading(false)
  }

  const handleReset = async (e) => {
    e.preventDefault()
    if (!email.trim()) { setError('Enter your email first'); return }
    setLoading(true)
    try {
      await resetPassword(email.trim().toLowerCase())
      setError('')
      setShowReset(false)
      alert('Password reset link sent to your email')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
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

          <form onSubmit={showReset ? handleReset : handleLogin} className="space-y-4">
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                className="w-full px-3.5 py-2.5 border border-[#E2E6EA] rounded-lg text-[#1A1A2E] placeholder-[#B0B8C9] focus:outline-none focus:border-[#1B6FC8] focus:ring-2 focus:ring-[#1B6FC8]/10 text-sm"
                placeholder="your@email.com"
                autoFocus
              />
            </div>
            {!showReset && (
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
            )}

            {error && <p className="text-sm text-[#DA3633]">{error}</p>}

            <LoadingButton loading={loading} type="submit" className="w-full bg-[#1B6FC8] hover:bg-[#1558A0] text-white rounded-lg text-sm font-semibold">
              {showReset ? 'Send Reset Link' : 'Sign In'}
            </LoadingButton>
          </form>

          <button onClick={() => { setShowReset(!showReset); setError('') }} className="w-full mt-3 text-center text-xs text-[#6B7A99] hover:text-[#1B6FC8] transition-colors">
            {showReset ? 'Back to login' : 'Forgot password?'}
          </button>
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
