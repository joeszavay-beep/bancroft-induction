import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Shield, LogIn } from 'lucide-react'

/**
 * Auth guard for operative routes.
 *
 * Special case: /operative/:id/profile is allowed WITHOUT login if
 * the operative hasn't set their DOB yet (first-time setup from
 * invite email). Once they complete their profile and have a DOB,
 * they must log in like everyone else.
 *
 * All other routes require login.
 */
export default function OperativeGuard({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { operativeId } = useParams()
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    checkAccess()
  }, [operativeId])

  async function checkAccess() {
    const session = sessionStorage.getItem('operative_session')
    const isProfilePage = location.pathname.includes('/profile')

    // If logged in, check ID matches
    if (session) {
      try {
        const data = JSON.parse(session)
        if (operativeId && data.id !== operativeId) {
          setStatus('denied')
          return
        }
        setStatus('ok')
        return
      } catch {}
    }

    // Not logged in — check if this is a first-time profile setup
    if (isProfilePage && operativeId) {
      try {
        const { data: op } = await supabase
          .from('operatives')
          .select('id, date_of_birth')
          .eq('id', operativeId)
          .single()

        if (op && !op.date_of_birth) {
          // First-time setup — no DOB yet, allow through without login
          setStatus('ok')
          return
        }
      } catch {}
    }

    // All other cases — require login
    sessionStorage.setItem('operative_return_url', window.location.pathname)
    setStatus('login')
  }

  if (status === 'checking') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (status === 'login') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50 px-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <LogIn size={28} className="text-blue-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Sign in required</h2>
          <p className="text-sm text-slate-500 mb-6">Use the email and date of birth your company registered you with.</p>
          <button
            onClick={() => navigate('/worker-login')}
            className="w-full py-3 bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  if (status === 'denied') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50 px-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield size={28} className="text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Access denied</h2>
          <p className="text-sm text-slate-500 mb-6">You can only access your own profile and documents.</p>
          <button
            onClick={() => navigate('/worker')}
            className="w-full py-3 bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Go to My Dashboard
          </button>
        </div>
      </div>
    )
  }

  return children
}
