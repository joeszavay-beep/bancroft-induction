import { supabase } from './supabase'

/**
 * Fetch wrapper that automatically adds the Supabase auth token.
 * Use for authenticated API calls to /api/* routes.
 */
export async function authFetch(url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  })
}
