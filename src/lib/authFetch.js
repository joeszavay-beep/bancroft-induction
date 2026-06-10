import { supabase } from './supabase'

/**
 * Fetch wrapper that automatically adds the Supabase auth token.
 * Use for authenticated API calls to /api/* routes.
 */
export async function authFetch(url, options = {}) {
  // Block API calls in sandbox demo mode. Return a non-2xx so callers that gate
  // on res.ok treat the blocked write as the failure it is, instead of toasting
  // success on a mutation that never happened (AUDIT §1.4).
  if (sessionStorage.getItem('sandbox_mode') === 'true') {
    const toast = (await import('react-hot-toast')).default
    toast('This is a demo — request your own account', { icon: '👁️', style: { background: '#EFF6FF', color: '#1E40AF', border: '1px solid #93C5FD' }, duration: 3000, id: 'demo-block' })
    return new Response(JSON.stringify({ error: 'Demo mode' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }

  let token = null

  // Try getting session token. Refresh proactively when the token is absent OR
  // already expired / about to expire — a present-but-stale token would
  // otherwise be sent and 401 (AUDIT §1.2). supabase-js serialises concurrent
  // refreshes via its navigator lock, so parallel authFetch calls are safe.
  try {
    const { data: { session } } = await supabase.auth.getSession()
    token = session?.access_token
    const expiresSoon = session?.expires_at && (session.expires_at * 1000 - Date.now() < 30_000)
    if (!token || expiresSoon) {
      const { data: { session: refreshed } } = await supabase.auth.refreshSession()
      if (refreshed?.access_token) token = refreshed.access_token
    }
  } catch { /* ignore */ }

  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  })

  // If 401, try one more time with a fresh token
  if (res.status === 401 && !options._retried) {
    try {
      const { data: { session: fresh } } = await supabase.auth.refreshSession()
      if (fresh?.access_token) {
        return authFetch(url, { ...options, _retried: true, headers: { ...options.headers, 'Authorization': `Bearer ${fresh.access_token}` } })
      }
    } catch { /* ignore */ }
  }

  return res
}
