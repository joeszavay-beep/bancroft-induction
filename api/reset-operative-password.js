import { createClient } from '@supabase/supabase-js'

/**
 * Reset an operative's password using DOB as identity verification.
 * No email redirect needed — works entirely server-side.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, dateOfBirth, newPassword } = req.body

  if (!email || !dateOfBirth || !newPassword) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  if (newPassword.length < 8) {
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

  // Find the operative and verify DOB
  const { data: op } = await supabase
    .from('operatives')
    .select('id, date_of_birth, email')
    .eq('email', email.toLowerCase())
    .single()

  if (!op) {
    return res.status(404).json({ error: 'No account found with that email' })
  }

  if (!op.date_of_birth || op.date_of_birth !== dateOfBirth) {
    return res.status(403).json({ error: 'Date of birth does not match our records' })
  }

  // Find auth user and update password
  const { data: { users } } = await supabase.auth.admin.listUsers()
  const authUser = users?.find(u => u.email === email.toLowerCase())

  if (!authUser) {
    // No auth account — create one
    const { error: createErr } = await supabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password: newPassword,
      email_confirm: true,
      user_metadata: { role: 'operative', operative_id: op.id },
    })
    if (createErr) {
      return res.status(500).json({ error: createErr.message })
    }
    return res.status(200).json({ message: 'Account created with new password' })
  }

  // Update existing auth account
  const { error: updateErr } = await supabase.auth.admin.updateUserById(authUser.id, {
    password: newPassword,
    email_confirm: true,
  })

  if (updateErr) {
    return res.status(500).json({ error: updateErr.message })
  }

  return res.status(200).json({ message: 'Password updated successfully' })
}
