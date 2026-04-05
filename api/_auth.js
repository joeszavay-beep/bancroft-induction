import { createClient } from '@supabase/supabase-js'

/**
 * Verify the caller is an authenticated Supabase user.
 * Pass the request object — checks the Authorization header.
 * Returns { user, error }.
 */
export async function verifyAuth(req) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return { user: null, error: 'No authorization token' }
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    return { user: null, error: error?.message || 'Invalid token' }
  }

  return { user, error: null }
}
