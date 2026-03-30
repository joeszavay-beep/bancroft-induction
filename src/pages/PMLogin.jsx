import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Lock, Eye, EyeOff } from 'lucide-react'
import LoadingButton from '../components/LoadingButton'

export default function PMLogin() {
  const navigate = useNavigate()
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

    const { data, error: dbErr } = await supabase
      .from('managers')
      .select('*')
      .ilike('email', email.trim())
      .eq('password', password.trim())
      .single()

    setLoading(false)

    if (dbErr || !data) {
      setError('Invalid email or password')
      return
    }

    if (!data.is_active) {
      setError('This account has been disabled. Contact your admin.')
      return
    }

    // Store manager data in session
    sessionStorage.setItem('pm_auth', 'true')
    sessionStorage.setItem('manager_data', JSON.stringify({
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role,
      project_ids: data.project_ids || [],
    }))

    if (data.role === 'admin') {
      navigate('/admin')
    } else {
      navigate('/pm')
    }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col">
      <header className="px-6 pt-6 flex items-center gap-4">
        <button onClick={() => navigate('/')} className="p-2 -ml-2 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100">
          <ArrowLeft size={22} />
        </button>
        <img src="/sitecore-logo.svg" alt="SiteCore" className="h-8" />
      </header>

      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-slate-700 to-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg">
              <Lock size={26} className="text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-slate-900 mb-1">Manager Login</h1>
            <p className="text-slate-400 text-sm">Sign in with your account</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="text"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="Username or email"
                className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10 transition-all"
                autoFocus
              />
            </div>
            <div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  placeholder="Password"
                  className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10 transition-all pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-slate-500 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {error && (
                <p className="mt-2 text-sm text-red-500 flex items-center gap-1.5">
                  <span className="w-1 h-1 bg-red-500 rounded-full" />
                  {error}
                </p>
              )}
            </div>
            <LoadingButton loading={loading} type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-sm shadow-blue-500/20 rounded-xl">
              Sign In
            </LoadingButton>
          </form>

          <p className="text-center text-xs text-slate-300 mt-8">
            Powered by SiteCore
          </p>
        </div>
      </div>
    </div>
  )
}
