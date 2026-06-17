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

/**
 * Find an auth user by email, paging through listUsers (§4.9 — a bare listUsers()
 * returns only the first 50, and we already have >50 auth users). Returns
 * { user } | { user: null } | { error }.
 */
async function findAuthUserByEmail(supabase, email) {
  const target = (email || '').toLowerCase()
  for (let page = 1; page <= 50; page++) {   // safety cap (~50k users)
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return { error }
    const users = data?.users || []
    const found = users.find(u => u.email?.toLowerCase() === target)
    if (found) return { user: found }
    if (users.length === 0) break
  }
  return { user: null }
}

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

  // Check if an auth account already exists for this email (paged — §4.9).
  // If it does, do NOT update the password — the operative should use "forgot password" instead.
  const { user: existingUser, error: lookupErr } = await findAuthUserByEmail(supabase, email)
  if (lookupErr) {
    return res.status(500).json({ error: `Account lookup failed: ${lookupErr.message}` })
  }

  if (existingUser) {
    // Account already exists — don't change the password here, but DO link the
    // operative to the auth user (durable §5.19), idempotently and without clobbering
    // an existing link. The partial-unique index rejects linking a 2nd ACTIVE record
    // to the same auth user (fail-closed — surfaces a duplicate-identity conflict).
    const { error: linkErr } = await supabase
      .from('operatives')
      .update({ auth_user_id: existingUser.id })
      .eq('id', operativeId)
      .is('auth_user_id', null)
    if (linkErr) {
      return res.status(500).json({ error: `Account exists but linking failed: ${linkErr.message}` })
    }
    return res.status(200).json({ message: 'Account already exists — use your existing password to sign in' })
  }

  // Create new auth account (auto-verified, no email confirmation needed).
  // user_metadata.operative_id is still written for the §5.19 dual-accept phase; it
  // stops being authoritative for RLS at enforce (PR5), which keys on auth_user_id.
  const { data, error } = await supabase.auth.admin.createUser({
    email: email.toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { role: 'operative', operative_id: operativeId },
  })

  if (error) {
    return res.status(500).json({ error: `Account creation failed: ${error.message}` })
  }

  // Link the new auth user to the operative record (durable §5.19). Surface a failure
  // rather than silently leaving it unlinked — it must be linked before enforce.
  const { error: linkErr } = await supabase
    .from('operatives')
    .update({ auth_user_id: data.user.id })
    .eq('id', operativeId)
    .is('auth_user_id', null)
  if (linkErr) {
    return res.status(500).json({ error: `Account created but linking failed: ${linkErr.message}`, userId: data.user?.id })
  }

  return res.status(200).json({ message: 'Account created', userId: data.user?.id })
}
