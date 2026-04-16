import { createClient } from '@supabase/supabase-js'

/**
 * Verify the caller is a super admin.
 * Tries Supabase auth token first, falls back to checking managers table.
 * Returns { verified: true } or { verified: false, error: string }.
 */
export async function verifySuperAdmin(req) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return { verified: false, error: 'Server config missing' }
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Require a valid Supabase auth token
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return { verified: false, error: 'Not authenticated — please log out and log back in' }
  }

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) {
    return { verified: false, error: 'Invalid or expired session — please log out and log back in' }
  }

  // Verify the authenticated user is a super admin in the managers table
  const { data: mgr } = await supabase
    .from('managers')
    .select('role')
    .eq('email', user.email)
    .eq('role', 'super_admin')
    .eq('is_active', true)
    .single()

  if (!mgr) {
    return { verified: false, error: 'Not authorized as super admin' }
  }

  return { verified: true, supabase }
}
