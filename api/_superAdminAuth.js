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

  // Try Supabase auth token first
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token)
    if (user) return { verified: true, supabase }
  }

  // Fallback: verify via managers table using email from request body
  const email = req.body?.managerEmail
  if (!email) {
    return { verified: false, error: 'Not authenticated — please log out and log back in' }
  }

  const { data: mgr } = await supabase
    .from('managers')
    .select('role')
    .eq('email', email)
    .eq('role', 'super_admin')
    .eq('is_active', true)
    .single()

  if (!mgr) {
    return { verified: false, error: 'Not authorized as super admin' }
  }

  return { verified: true, supabase }
}
