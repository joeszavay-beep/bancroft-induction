import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Shield, LogIn } from 'lucide-react'

/**
 * Auth guard for operative routes.
 * Checks that:
 * 1. An operative session exists (logged in via /worker-login)
 * 2. The operative ID in the URL matches the logged-in operative
 *
 * If not logged in, redirects to /worker-login with a return URL.
 * If logged in as a different operative, shows an access denied screen.
 */
export default function OperativeGuard({ children }) {
  const navigate = useNavigate()
  const { operativeId } = useParams()
  const [status, setStatus] = useState('checking') // checking | ok | denied | login

  useEffect(() => {
    const session = sessionStorage.getItem('operative_session')
    if (!session) {
      // Not logged in — redirect to worker login with return URL
      sessionStorage.setItem('operative_return_url', window.location.pathname)
      setStatus('login')
      return
    }

    try {
      const data = JSON.parse(session)
      if (operativeId && data.id !== operativeId) {
        // Logged in as a different operative
        setStatus('denied')
        return
      }
      setStatus('ok')
    } catch {
      setStatus('login')
    }
  }, [operativeId])

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
          <p className="text-sm text-slate-500 mb-6">You need to sign in to access this page. Use the email and date of birth your company registered you with.</p>
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
          <p className="text-sm text-slate-500 mb-6">You can only access your own profile and documents. You're currently signed in as a different worker.</p>
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
