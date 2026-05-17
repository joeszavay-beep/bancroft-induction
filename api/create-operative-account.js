import { createClient } from '@supabase/supabase-js'

/**
 * Create a Supabase Auth account for an operative (server-side with service role key).
 * This bypasses email confirmation so the operative can log in immediately.
 *
 * Security:
 * - Email must match the operative's stored email in the DB (prevents spoofing)
 * - Will NOT update the password of an existing auth account (prevents account takeover)
 * - Only creates new auth accounts for operatives completing first-time profile setup
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, password, operativeId } = req.body

  if (!email || !password || !operativeId) {
    return res.status(400).json({ error: 'Missing required fields: email, password, operativeId' })
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server config missing' })
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Verify the operative exists and the email matches their stored email
  const { data: op } = await supabase
    .from('operatives')
    .select('id, email')
    .eq('id', operativeId)
    .single()

  if (!op) {
    return res.status(404).json({ error: 'Operative not found' })
  }

  if (op.email?.toLowerCase() !== email.toLowerCase()) {
    return res.status(403).json({ error: 'Email does not match the operative record' })
  }

  // Check if an auth account already exists for this email
  // If it does, do NOT update the password — the operative should use "forgot password" instead
  const { data: { users } } = await supabase.auth.admin.listUsers()
  const existingUser = users?.find(u => u.email === email.toLowerCase())

  if (existingUser) {
    // Account already exists — don't allow password changes through this endpoint
    return res.status(200).json({ message: 'Account already exists — use your existing password to sign in' })
  }

  // Create new auth account (auto-verified, no email confirmation needed)
  const { data, error } = await supabase.auth.admin.createUser({
    email: email.toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { role: 'operative', operative_id: operativeId },
  })

  if (error) {
    return res.status(500).json({ error: `Account creation failed: ${error.message}` })
  }

  return res.status(200).json({ message: 'Account created', userId: data.user?.id })
}
