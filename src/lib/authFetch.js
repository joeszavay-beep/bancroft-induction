import { supabase } from './supabase'

/**
 * Fetch wrapper that automatically adds the Supabase auth token.
 * Use for authenticated API calls to /api/* routes.
 */
export async function authFetch(url, options = {}) {
  let token = null

  // Try getting session token
  try {
    const { data: { session } } = await supabase.auth.getSession()
    token = session?.access_token

    // If token expired, try refreshing
    if (!token) {
      const { data: { session: refreshed } } = await supabase.auth.refreshSession()
      token = refreshed?.access_token
    }
  } catch {}

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
    } catch {}
  }

  return res
}
