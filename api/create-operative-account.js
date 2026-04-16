import { createClient } from '@supabase/supabase-js'

/**
 * Create a Supabase Auth account for an operative (server-side with service role key).
 * This bypasses email confirmation so the operative can log in immediately.
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

  // Verify the operative exists
  const { data: op } = await supabase
    .from('operatives')
    .select('id, email')
    .eq('id', operativeId)
    .single()

  if (!op) {
    return res.status(404).json({ error: 'Operative not found' })
  }

  // Create auth account with email_confirm: true (auto-verified)
  const { data, error } = await supabase.auth.admin.createUser({
    email: email.toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { role: 'operative', operative_id: operativeId },
  })

  if (error) {
    // If user already exists, try updating their password instead
    if (error.message?.includes('already been registered') || error.message?.includes('already exists')) {
      const { data: users } = await supabase.auth.admin.listUsers()
      const existing = users?.users?.find(u => u.email === email.toLowerCase())
      if (existing) {
        const { error: updateErr } = await supabase.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
        })
        if (updateErr) {
          return res.status(500).json({ error: `Failed to update password: ${updateErr.message}` })
        }
        return res.status(200).json({ message: 'Password updated for existing account' })
      }
    }
    return res.status(500).json({ error: `Account creation failed: ${error.message}` })
  }

  return res.status(200).json({ message: 'Account created', userId: data.user?.id })
}
