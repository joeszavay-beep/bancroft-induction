import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LoadingButton from '../components/LoadingButton'
import { HardHat, Mail, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { getSession, setSession, removeSession } from '../lib/storage'

export default function OperativeLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetDob, setResetDob] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError('Enter your email and password')
      return
    }
    setLoading(true)
    setError('')

    try {
      // First try Supabase Auth login
      const { data: authData } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      })

      let operative = null

      if (authData?.user) {
        // Auth succeeded — find the operative record
        const { data: ops } = await supabase
          .from('operatives')
          .select('*, projects(name), companies(name, logo_url, primary_colour)')
          .eq('email', email.trim().toLowerCase())

        if (ops?.length) {
          operative = ops[0]
        }
      }

      // Fallback: try email + password as DOB for legacy operatives without auth accounts
      if (!operative) {
        const { data: ops } = await supabase
          .from('operatives')
          .select('*, projects(name), companies(name, logo_url, primary_colour)')
          .eq('email', email.trim().toLowerCase())

        if (ops?.length) {
          // Check if password matches DOB (legacy support)
          const op = ops[0]
          if (op.date_of_birth === password.trim()) {
            operative = op
          }
        }
      }

      if (!operative) {
        setError('Invalid email or password. If you\'ve just been invited, check your email for login details.')
        setLoading(false)
        return
      }

      // Store operative session
      const sessionData = {
        id: operative.id,
        name: operative.name,
        email: operative.email,
        role: operative.role,
        photo_url: operative.photo_url,
        project_id: operative.project_id,
        project_name: operative.projects?.name,
        company_id: operative.company_id,
        company_name: operative.companies?.name,
        company_logo: operative.companies?.logo_url,
        primary_colour: operative.companies?.primary_colour || '#1B6FC8',
      }
      setSession('operative_session', JSON.stringify(sessionData))

      const returnUrl = getSession('operative_return_url')
      if (returnUrl) {
        removeSession('operative_return_url')
        navigate(returnUrl)
      } else {
        navigate('/worker')
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    if (!resetEmail.trim() || !resetDob || !newPassword) {
      setError('All fields are required')
      return
    }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
    if (newPassword !== confirmNewPassword) { setError('Passwords do not match'); return }
    setLoading(true)
    setError('')
    try {
      const resp = await fetch('/api/reset-operative-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetEmail.trim().toLowerCase(),
          dateOfBirth: resetDob,
          newPassword: newPassword.trim(),
        }),
      })
      const result = await resp.json()
      if (!resp.ok) {
        setError(result.error || 'Reset failed')
      } else {
        setResetDone(true)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: '#1A2744' }}>
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between">
        <Link to="/">
          <span className="text-lg text-white font-light tracking-[3px]">CORE<span className="font-bold tracking-normal">SITE</span></span>
        </Link>
        <Link to="/login" className="text-xs text-white/40 hover:text-white/70 transition-colors">
          Manager login
        </Link>
      </header>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          {/* Icon */}
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <HardHat size={32} className="text-white/70" />
          </div>

          <h1 className="text-xl font-bold text-white text-center mb-1">Worker Login</h1>
          <p className="text-sm text-white/40 text-center mb-8">Sign in to your operative portal</p>

          {showReset ? (
            // Password reset form
            resetDone ? (
              <div className="text-center">
                <div className="w-14 h-14 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lock size={24} className="text-green-400" />
                </div>
                <p className="text-white font-medium mb-2">Password updated</p>
                <p className="text-white/40 text-sm mb-6">You can now sign in with your new password.</p>
                <button onClick={() => { setShowReset(false); setResetDone(false); setPassword('') }}
                  className="w-full py-3 bg-[#1B6FC8] hover:bg-[#155ba3] text-white font-semibold rounded-xl text-sm transition-colors">
                  Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <p className="text-sm text-white/50 text-center mb-4">Verify your identity with your date of birth, then set a new password.</p>
                <div>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={e => { setResetEmail(e.target.value); setError('') }}
                      placeholder="Your email address"
                      className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-[#1B6FC8] text-sm"
                      autoFocus
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1 block">Date of Birth (to verify your identity)</label>
                  <input
                    type="date"
                    value={resetDob}
                    onChange={e => { setResetDob(e.target.value); setError('') }}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-[#1B6FC8] text-sm"
                  />
                </div>
                <div>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => { setNewPassword(e.target.value); setError('') }}
                      placeholder="New password (min 8 characters)"
                      className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-[#1B6FC8] text-sm"
                    />
                  </div>
                </div>
                <div>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      type="password"
                      value={confirmNewPassword}
                      onChange={e => { setConfirmNewPassword(e.target.value); setError('') }}
                      placeholder="Confirm new password"
                      className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-[#1B6FC8] text-sm"
                    />
                  </div>
                </div>
                {error && <p className="text-red-400 text-xs text-center">{error}</p>}
                <LoadingButton loading={loading} className="w-full py-3 bg-[#1B6FC8] hover:bg-[#155ba3] text-white font-semibold rounded-xl text-sm transition-colors">
                  Reset Password
                </LoadingButton>
                <button type="button" onClick={() => { setShowReset(false); setError('') }}
                  className="w-full flex items-center justify-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors">
                  <ArrowLeft size={14} /> Back to login
                </button>
              </form>
            )
          ) : (
            // Login form
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError('') }}
                    placeholder="Email address"
                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-[#1B6FC8] text-sm"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    placeholder="Password"
                    className="w-full pl-10 pr-12 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-[#1B6FC8] text-sm"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && <p className="text-red-400 text-xs text-center">{error}</p>}

              <LoadingButton loading={loading} className="w-full py-3 bg-[#1B6FC8] hover:bg-[#155ba3] text-white font-semibold rounded-xl text-sm transition-colors">
                Sign In
              </LoadingButton>

              <button type="button" onClick={() => { setShowReset(true); setResetEmail(email); setError('') }}
                className="w-full text-center text-sm text-white/40 hover:text-white/70 transition-colors">
                Forgot your password?
              </button>
            </form>
          )}

          <p className="text-center mt-8 text-xs text-white/20">
            Powered by CoreSite — Site Compliance Platform
          </p>
        </div>
      </div>
    </div>
  )
}
