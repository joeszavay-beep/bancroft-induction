import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCompany } from '../lib/CompanyContext'
import { supabase } from '../lib/supabase'
import { Eye, EyeOff, ArrowLeft, Loader2, ChevronRight } from 'lucide-react'
import LoadingButton from '../components/LoadingButton'
import DateOfBirthPicker from '../components/DateOfBirthPicker'
import { setSession } from '../lib/storage'

export default function PMLogin() {
  const navigate = useNavigate()
  const { login, resetPassword } = useCompany()

  // Step: 'email' → 'choose' → 'manager' or 'worker'
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dob, setDob] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [accountName, setAccountName] = useState('')
  const [, setHasManager] = useState(false)
  const [, setHasWorker] = useState(false)
  const [managerName, setManagerName] = useState('')
  const [workerName, setWorkerName] = useState('')
  const [workerCompany, setWorkerCompany] = useState('')
  const [managerCompany, setManagerCompany] = useState('')

  async function handleEmailNext(e) {
    e.preventDefault()
    if (!email.trim()) return
    setChecking(true)
    setError('')

    const trimmed = email.trim().toLowerCase()

    // Check both tables in parallel
    const [{ data: profiles }, { data: operatives }] = await Promise.all([
      supabase.from('profiles').select('id, name, company_id, companies(name)').eq('email', trimmed).limit(1),
      supabase.from('operatives').select('id, name, date_of_birth, company_id, companies(name)').eq('email', trimmed).limit(1),
    ])

    const foundManager = profiles?.length > 0
    const foundWorker = operatives?.length > 0 && operatives[0].date_of_birth

    setHasManager(foundManager)
    setHasWorker(foundWorker)
    if (foundManager) { setManagerName(profiles[0].name); setManagerCompany(profiles[0].companies?.name || '') }
    if (foundWorker) { setWorkerName(operatives[0].name); setWorkerCompany(operatives[0].companies?.name || '') }

    if (foundManager && foundWorker) {
      // Both exist — let user choose
      setStep('choose')
      setChecking(false)
      return
    }

    if (foundManager) {
      setAccountName(profiles[0].name)
      setStep('manager')
      setChecking(false)
      return
    }

    if (operatives?.length > 0) {
      if (!operatives[0].date_of_birth) {
        setError('You need to complete your profile first. Check your invite email for the link.')
        setChecking(false)
        return
      }
      setAccountName(operatives[0].name)
      setStep('worker')
      setChecking(false)
      return
    }

    setError('No account found with this email')
    setChecking(false)
  }

  async function handleManagerLogin(e) {
    e.preventDefault()
    if (!password.trim()) return
    if (password.trim().length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    setError('')

    try {
      await login(email.trim().toLowerCase(), password.trim())
      navigate('/app')
    } catch (err) {
      setError(err.message === 'Invalid login credentials' ? 'Invalid password' : err.message)
      setLoading(false)
    }
  }

  async function handleWorkerLogin(e) {
    e.preventDefault()
    if (!dob) { setError('Please select your date of birth'); return }
    setLoading(true)
    setError('')

    try {
      const { data: ops } = await supabase
        .from('operatives')
        .select('*, projects(name), companies(name, logo_url, primary_colour)')
        .eq('email', email.trim().toLowerCase())
        .eq('date_of_birth', dob)

      if (!ops?.length) {
        setError('Date of birth doesn\'t match our records')
        setLoading(false)
        return
      }

      const op = ops[0]
      setSession('operative_session', JSON.stringify({
        id: op.id, name: op.name, email: op.email, role: op.role,
        photo_url: op.photo_url, project_id: op.project_id,
        project_name: op.projects?.name, company_id: op.company_id,
        company_name: op.companies?.name, company_logo: op.companies?.logo_url,
        primary_colour: op.companies?.primary_colour || '#1B6FC8',
      }))
      navigate('/worker')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  async function handleReset(e) {
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

  function goBack() {
    setStep('email')
    setPassword('')
    setDob('')
    setError('')
    setShowReset(false)
  }

  const inputCls = "w-full px-3.5 py-2.5 border border-[#E2E6EA] rounded-lg text-[#1A1A2E] placeholder-[#B0B8C9] focus:outline-none focus:border-[#1B6FC8] focus:ring-2 focus:ring-[#1B6FC8]/10 text-sm"

  return (
    <div className="min-h-dvh bg-[#1A2744] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-2xl text-white font-light tracking-[4px]">CORE<span className="font-bold tracking-normal">SITE</span></span>
          <p className="text-xs text-white/30 mt-2">Site Compliance Platform</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-xl">
          {/* ── STEP 1: Email ── */}
          {step === 'email' && (
            <>
              <h2 className="text-xl font-bold text-[#1A1A2E] mb-1">Sign In</h2>
              <p className="text-sm text-[#6B7A99] mb-6">Enter your email to continue</p>

              {showReset ? (
                <form onSubmit={handleReset} className="space-y-4">
                  <div>
                    <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Email</label>
                    <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError('') }}
                      className={inputCls} placeholder="your@email.com" autoFocus />
                  </div>
                  {error && <p className="text-sm text-[#DA3633]">{error}</p>}
                  <LoadingButton loading={loading} type="submit" className="w-full bg-[#1B6FC8] hover:bg-[#1558A0] text-white rounded-lg text-sm font-semibold">
                    Send Reset Link
                  </LoadingButton>
                  <button type="button" onClick={() => { setShowReset(false); setError('') }} className="w-full text-center text-xs text-[#6B7A99] hover:text-[#1B6FC8] transition-colors">
                    Back to login
                  </button>
                </form>
              ) : (
                <form onSubmit={handleEmailNext} className="space-y-4">
                  <div>
                    <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Email</label>
                    <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError('') }}
                      className={inputCls} placeholder="your@email.com" autoFocus />
                  </div>
                  {error && <p className="text-sm text-[#DA3633]">{error}</p>}
                  <LoadingButton loading={checking} type="submit" className="w-full bg-[#1B6FC8] hover:bg-[#1558A0] text-white rounded-lg text-sm font-semibold">
                    {checking ? 'Checking...' : 'Continue'}
                  </LoadingButton>
                </form>
              )}
            </>
          )}

          {/* ── STEP 1B: Choose account type ── */}
          {step === 'choose' && (
            <>
              <button onClick={goBack} className="flex items-center gap-1 text-xs text-[#6B7A99] hover:text-[#1B6FC8] mb-4 transition-colors">
                <ArrowLeft size={14} /> Change email
              </button>
              <h2 className="text-lg font-bold text-[#1A1A2E] mb-1">Choose Account</h2>
              <p className="text-sm text-[#6B7A99] mb-5">This email has multiple accounts</p>

              <div className="space-y-2.5">
                <button onClick={() => { setAccountName(managerName); setStep('manager') }}
                  className="w-full flex items-center gap-3 p-3.5 border border-[#E2E6EA] rounded-xl text-left hover:border-[#1B6FC8] hover:bg-[#F5F8FF] transition-all">
                  <div className="w-10 h-10 rounded-full bg-[#1B6FC8] flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {managerName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1A1A2E]">{managerName}</p>
                    <p className="text-xs text-[#6B7A99]">Manager · {managerCompany}</p>
                  </div>
                  <ChevronRight size={16} className="text-[#B0B8C9]" />
                </button>

                <button onClick={() => { setAccountName(workerName); setStep('worker') }}
                  className="w-full flex items-center gap-3 p-3.5 border border-[#E2E6EA] rounded-xl text-left hover:border-[#2EA043] hover:bg-[#F0FDF4] transition-all">
                  <div className="w-10 h-10 rounded-full bg-[#2EA043] flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {workerName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1A1A2E]">{workerName}</p>
                    <p className="text-xs text-[#6B7A99]">Worker · {workerCompany}</p>
                  </div>
                  <ChevronRight size={16} className="text-[#B0B8C9]" />
                </button>
              </div>
            </>
          )}

          {/* ── STEP 2A: Manager — password ── */}
          {step === 'manager' && (
            <>
              <button onClick={goBack} className="flex items-center gap-1 text-xs text-[#6B7A99] hover:text-[#1B6FC8] mb-4 transition-colors">
                <ArrowLeft size={14} /> Change email
              </button>

              <div className="bg-[#F5F6F8] rounded-lg p-3 mb-5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#1B6FC8] flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {accountName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#1A1A2E] truncate">{accountName}</p>
                  <p className="text-xs text-[#6B7A99] truncate">{email}</p>
                </div>
              </div>

              {showReset ? (
                <form onSubmit={handleReset} className="space-y-4">
                  <p className="text-sm text-[#6B7A99]">We'll send a password reset link to your email.</p>
                  {error && <p className="text-sm text-[#DA3633]">{error}</p>}
                  <LoadingButton loading={loading} type="submit" className="w-full bg-[#1B6FC8] hover:bg-[#1558A0] text-white rounded-lg text-sm font-semibold">
                    Send Reset Link
                  </LoadingButton>
                  <button type="button" onClick={() => { setShowReset(false); setError('') }} className="w-full text-center text-xs text-[#6B7A99] hover:text-[#1B6FC8]">
                    Back
                  </button>
                </form>
              ) : (
                <form onSubmit={handleManagerLogin} className="space-y-4">
                  <div>
                    <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Password</label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} value={password}
                        onChange={e => { setPassword(e.target.value); setError('') }}
                        className={`${inputCls} pr-10`} placeholder="Enter your password" autoFocus />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B0B8C9] hover:text-[#6B7A99]">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  {error && <p className="text-sm text-[#DA3633]">{error}</p>}
                  <LoadingButton loading={loading} type="submit" className="w-full bg-[#1B6FC8] hover:bg-[#1558A0] text-white rounded-lg text-sm font-semibold">
                    Sign In
                  </LoadingButton>
                  <button type="button" onClick={() => { setShowReset(true); setError('') }} className="w-full text-center text-xs text-[#6B7A99] hover:text-[#1B6FC8] transition-colors">
                    Forgot password?
                  </button>
                </form>
              )}
            </>
          )}

          {/* ── STEP 2B: Worker — DOB ── */}
          {step === 'worker' && (
            <>
              <button onClick={goBack} className="flex items-center gap-1 text-xs text-[#6B7A99] hover:text-[#1B6FC8] mb-4 transition-colors">
                <ArrowLeft size={14} /> Change email
              </button>

              <div className="bg-[#F5F6F8] rounded-lg p-3 mb-5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#2EA043] flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {accountName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#1A1A2E] truncate">{accountName}</p>
                  <p className="text-xs text-[#6B7A99] truncate">{email} · Worker Account</p>
                </div>
              </div>

              <form onSubmit={handleWorkerLogin} className="space-y-4">
                <div>
                  <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Date of Birth</label>
                  <DateOfBirthPicker value={dob} onChange={v => { setDob(v); setError('') }} />
                </div>
                {error && <p className="text-sm text-[#DA3633]">{error}</p>}
                <LoadingButton loading={loading} type="submit" className="w-full bg-[#2EA043] hover:bg-[#27903A] text-white rounded-lg text-sm font-semibold">
                  Sign In
                </LoadingButton>
              </form>
            </>
          )}
        </div>

        {step === 'email' && !showReset && (
          <button onClick={() => { setShowReset(true); setError('') }} className="w-full mt-3 text-center text-xs text-white/30 hover:text-white/60 transition-colors">
            Forgot password?
          </button>
        )}

        <p className="text-center text-sm text-white/40 mt-5">
          Don't have an account?{' '}
          <a href="/signup" className="text-white/70 hover:text-white underline transition-colors">Sign up free</a>
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
