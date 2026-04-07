import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import LoadingButton from '../components/LoadingButton'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    // Supabase puts the token in the URL hash — listen for the auth event
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User arrived via password reset link — ready to set new password
      }
    })
  }, [])

  async function handleReset(e) {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) { setError('Password must contain at least one uppercase letter and one number'); return }
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    setLoading(true)
    setError('')

    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (err) {
      setError(err.message)
      return
    }
    setSuccess(true)
  }

  if (success) {
    return (
      <div className="min-h-dvh bg-[#1A2744] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 size={32} className="text-[#2EA043]" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Password Updated</h2>
          <p className="text-sm text-white/50 mb-6">Your password has been changed successfully.</p>
          <button onClick={() => navigate('/login')} className="w-full py-3 bg-[#1B6FC8] hover:bg-[#1558A0] text-white font-semibold rounded-lg transition-colors">
            Sign In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#1A2744] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/coresite-logo.svg" alt="CoreSite" className="h-12 mx-auto mb-6 brightness-0 invert" />
        </div>

        <div className="bg-white rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-bold text-[#1A1A2E] mb-1">Set New Password</h2>
          <p className="text-sm text-[#6B7A99] mb-6">Enter your new password below</p>

          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  className="w-full px-3.5 py-2.5 border border-[#E2E6EA] rounded-lg text-[#1A1A2E] placeholder-[#B0B8C9] focus:outline-none focus:border-[#1B6FC8] focus:ring-2 focus:ring-[#1B6FC8]/10 text-sm pr-10"
                  placeholder="Minimum 6 characters"
                  autoFocus
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B0B8C9] hover:text-[#6B7A99]">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); setError('') }}
                className="w-full px-3.5 py-2.5 border border-[#E2E6EA] rounded-lg text-[#1A1A2E] placeholder-[#B0B8C9] focus:outline-none focus:border-[#1B6FC8] focus:ring-2 focus:ring-[#1B6FC8]/10 text-sm"
                placeholder="Re-enter your password"
              />
            </div>

            {error && <p className="text-sm text-[#DA3633]">{error}</p>}

            <LoadingButton loading={loading} type="submit" className="w-full bg-[#1B6FC8] hover:bg-[#1558A0] text-white rounded-lg text-sm font-semibold">
              Update Password
            </LoadingButton>
          </form>
        </div>

        <p className="text-center text-xs text-white/30 mt-6">CoreSite &mdash; Site Compliance Platform</p>
      </div>
    </div>
  )
}
