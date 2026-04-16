import toast from 'react-hot-toast'

/**
 * Check if current session is demo and block mutations.
 * Returns true if blocked (is demo), false if allowed.
 *
 * Usage: if (isDemoBlock()) return
 */
export function isDemoBlock() {
  // Only block in sandbox/demo mode — NOT based on email
  if (sessionStorage.getItem('sandbox_mode') === 'true') {
    toast('This is a demo — request your own account to save changes', {
      icon: '👁️',
      style: { background: '#EFF6FF', color: '#1E40AF', border: '1px solid #93C5FD' },
      duration: 3000,
      id: 'demo-block',
    })
    return true
  }
  return false
}
