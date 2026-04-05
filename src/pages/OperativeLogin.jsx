import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LoadingButton from '../components/LoadingButton'
import DateOfBirthPicker from '../components/DateOfBirthPicker'
import { HardHat, Mail } from 'lucide-react'

export default function OperativeLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [dob, setDob] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    if (!email.trim() || !dob) { setError('Enter your email and date of birth'); return }
    setLoading(true)
    setError('')

    try {
      // Look up operative by email + DOB
      const { data: ops } = await supabase
        .from('operatives')
        .select('*, projects(name), companies(name, logo_url, primary_colour)')
        .eq('email', email.trim().toLowerCase())
        .eq('date_of_birth', dob)

      if (!ops?.length) {
        setError('No account found. Check your email and date of birth match what your company registered.')
        setLoading(false)
        return
      }

      const op = ops[0]

      // Store operative session
      const sessionData = {
        id: op.id,
        name: op.name,
        email: op.email,
        role: op.role,
        photo_url: op.photo_url,
        project_id: op.project_id,
        project_name: op.projects?.name,
        company_id: op.company_id,
        company_name: op.companies?.name,
        company_logo: op.companies?.logo_url,
        primary_colour: op.companies?.primary_colour || '#1B6FC8',
      }
      sessionStorage.setItem('operative_session', JSON.stringify(sessionData))

      navigate('/worker')
    } catch (err) {
      setError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-dvh bg-[#0D1526] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <HardHat size={32} className="text-white" />
          </div>
          <h1 className="text-white text-lg font-light tracking-widest">CORE<span className="font-bold tracking-normal">SITE</span></h1>
          <p className="text-white/40 text-xs mt-1">Worker Portal</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-bold text-[#1A1A2E] mb-1">Worker Sign In</h2>
          <p className="text-sm text-[#6B7A99] mb-6">Use the email and date of birth your company registered you with</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                className="w-full px-3.5 py-2.5 border border-[#E2E6EA] rounded-lg text-[#1A1A2E] placeholder-[#B0B8C9] focus:outline-none focus:border-[#1B6FC8] focus:ring-2 focus:ring-[#1B6FC8]/10 text-sm"
                placeholder="your@email.com"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Date of Birth</label>
              <DateOfBirthPicker value={dob} onChange={v => { setDob(v); setError('') }} />
            </div>

            {error && <p className="text-sm text-[#DA3633]">{error}</p>}

            <LoadingButton loading={loading} type="submit" className="w-full bg-[#1B6FC8] hover:bg-[#1558A0] text-white rounded-lg text-sm font-semibold">
              Sign In
            </LoadingButton>
          </form>

          <div className="mt-4 pt-4 border-t border-[#E2E6EA]">
            <button onClick={() => navigate('/login')} className="w-full text-center text-xs text-[#6B7A99] hover:text-[#1B6FC8] transition-colors">
              Manager login →
            </button>
          </div>
        </div>

        <p className="text-center mt-6 text-xs text-white/30">Powered by CoreSite — Site Compliance Platform</p>
      </div>
    </div>
  )
}
