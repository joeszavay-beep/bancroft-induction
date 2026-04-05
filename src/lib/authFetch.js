import { supabase } from './supabase'

/**
 * Fetch wrapper that automatically adds the Supabase auth token.
 * Use for authenticated API calls to /api/* routes.
 */
export async function authFetch(url, options = {}) {
  let token = null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    token = session?.access_token
  } catch {}

  if (!token) {
    console.warn('authFetch: no auth token available for', url)
  }

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  })
}
