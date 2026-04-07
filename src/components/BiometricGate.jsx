import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { hasStoredSession } from '../lib/storage'

export default function BiometricGate({ children }) {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    checkBiometric()
  }, [])

  async function checkBiometric() {
    // Only require biometric on native (mobile) apps
    if (!Capacitor.isNativePlatform()) {
      setStatus('unlocked')
      return
    }

    // No stored session — skip biometric, user will see login screen
    if (!hasStoredSession()) {
      setStatus('unlocked')
      return
    }

    // Has a stored session on mobile — verify with biometric
    await authenticate()
  }

  async function authenticate() {
    try {
      const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')

      // Check if biometrics are available on this device
      const result = await BiometricAuth.checkBiometry()
      if (!result.isAvailable) {
        // No biometric hardware or not enrolled — allow through
        setStatus('unlocked')
        return
      }

      await BiometricAuth.authenticate({
        reason: 'Verify your identity to open CoreSite',
        allowDeviceCredential: true,
      })

      setStatus('unlocked')
    } catch (err) {
      console.warn('Biometric auth failed:', err)
      setStatus('locked')
    }
  }

  if (status === 'checking') {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ backgroundColor: '#1A2744' }}>
        <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full" />
      </div>
    )
  }

  if (status === 'locked') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6" style={{ backgroundColor: '#1A2744' }}>
        <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center mb-6">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Authentication Required</h2>
        <p className="text-sm text-white/50 mb-8 text-center">Verify your identity to access CoreSite</p>
        <button
          onClick={authenticate}
          className="w-full max-w-xs py-3 bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm font-semibold rounded-lg transition-colors mb-4"
        >
          Try Again
        </button>
        <button
          onClick={() => {
            // Clear all sessions and let user through to login screen
            localStorage.removeItem('pm_auth')
            localStorage.removeItem('manager_data')
            localStorage.removeItem('operative_session')
            setStatus('unlocked')
          }}
          className="text-sm text-white/30 hover:text-white/50 transition-colors"
        >
          Sign out instead
        </button>
      </div>
    )
  }

  return children
}
