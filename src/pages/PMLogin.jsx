import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Lock } from 'lucide-react'
import LoadingButton from '../components/LoadingButton'

export default function PMLogin() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = (e) => {
    e.preventDefault()
    if (password === 'TEST') {
      sessionStorage.setItem('pm_auth', 'true')
      navigate('/pm')
    } else {
      setError('Incorrect password')
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-6 bg-navy-950">
      <button onClick={() => navigate('/')} className="absolute top-4 left-4 p-2 text-gray-400 hover:text-white transition-colors">
        <ArrowLeft size={24} />
      </button>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/bancroft-logo.png" alt="Bancroft" className="h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-1">Project Manager Login</h1>
          <p className="text-gray-400 text-sm">Enter your password to continue</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder="Password"
              className="w-full px-4 py-3 bg-navy-800 border border-navy-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent transition-colors"
              autoFocus
            />
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          </div>
          <LoadingButton type="submit" className="w-full bg-accent hover:bg-accent-dark text-white">
            Sign In
          </LoadingButton>
        </form>
      </div>
    </div>
  )
}
