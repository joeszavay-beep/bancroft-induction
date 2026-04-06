import toast from 'react-hot-toast'

/**
 * Check if current session is demo and block mutations.
 * Returns true if blocked (is demo), false if allowed.
 *
 * Usage: if (isDemoBlock()) return
 */
export function isDemoBlock() {
  try {
    const data = JSON.parse(sessionStorage.getItem('manager_data') || '{}')
    if (data.email === 'demo@coresite.io') {
      toast('This is a demo — request your own account to save changes', {
        icon: '👁️',
        style: { background: '#EFF6FF', color: '#1E40AF', border: '1px solid #93C5FD' },
        duration: 3000,
      })
      return true
    }
  } catch {}
  return false
}
