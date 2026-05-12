import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'Missing token' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server config missing' })

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Look up the pending change
  const { data: pending } = await supabase
    .from('pending_email_changes')
    .select('*')
    .eq('token', token)
    .is('verified_at', null)
    .is('cancelled_at', null)
    .single()

  if (!pending) return res.status(400).json({ error: 'Invalid or expired verification link' })
  if (new Date(pending.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This verification link has expired. Please request a new email change.' })
  }

  // Update the operative's email
  const { error: updateErr } = await supabase.from('operatives')
    .update({ email: pending.new_email, pending_email: null })
    .eq('id', pending.operative_id)
  if (updateErr) return res.status(500).json({ error: 'Failed to update email' })

  // Try to update Supabase Auth email (if operative has an auth account)
  try {
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const authUser = users?.find(u => u.email?.toLowerCase() === pending.old_email.toLowerCase())
    if (authUser) {
      await supabase.auth.admin.updateUserById(authUser.id, { email: pending.new_email })
    }
  } catch (e) {
    console.error('[VerifyEmail] Auth update error (non-fatal):', e)
  }

  // Mark as verified
  await supabase.from('pending_email_changes')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', pending.id)

  // Audit
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null
  await supabase.from('profile_audit_log').insert({
    worker_id: pending.operative_id,
    edited_by: 'Email verification',
    edited_by_id: pending.requested_by,
    field_name: 'email_verified',
    old_value: pending.old_email,
    new_value: pending.new_email,
    ip_address: ip,
  })

  return res.json({ success: true, message: 'Email updated successfully', newEmail: pending.new_email })
}
