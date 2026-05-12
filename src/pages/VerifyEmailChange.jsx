import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'

export default function VerifyEmailChange() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [status, setStatus] = useState('loading') // loading | success | error
  const [message, setMessage] = useState('')
  const [newEmail, setNewEmail] = useState('')

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('No verification token provided.'); return }

    fetch('/api/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setStatus('success')
          setNewEmail(data.newEmail || '')
          setMessage('Your email has been updated successfully.')
        } else {
          setStatus('error')
          setMessage(data.error || 'Verification failed.')
        }
      })
      .catch(() => { setStatus('error'); setMessage('Something went wrong. Please try again.') })
  }, [token])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa', padding: 20 }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        {status === 'loading' && (
          <>
            <Loader2 size={48} style={{ color: '#1B6FC8', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ color: '#64748b', fontSize: 14 }}>Verifying your email...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 size={56} style={{ color: '#2EA043', margin: '0 auto 16px' }} />
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>Email Verified</h1>
            <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 4px' }}>{message}</p>
            {newEmail && <p style={{ color: '#1e293b', fontSize: 14, fontWeight: 600 }}>You can now log in with {newEmail}</p>}
            <Link to="/worker-login" style={{ display: 'inline-block', marginTop: 20, padding: '10px 24px', background: '#1B6FC8', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
              Go to Login
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle size={56} style={{ color: '#DA3633', margin: '0 auto 16px' }} />
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>Verification Failed</h1>
            <p style={{ color: '#64748b', fontSize: 14 }}>{message}</p>
            <Link to="/" style={{ display: 'inline-block', marginTop: 20, padding: '10px 24px', background: '#e2e8f0', color: '#334155', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
              Go to Home
            </Link>
          </>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}
