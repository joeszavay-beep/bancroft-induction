import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { operativeId, newEmail, operativeSessionId, managerCompanyId, managerName: reqManagerName } = req.body
  if (!operativeId || !newEmail) return res.status(400).json({ error: 'Missing operativeId or newEmail' })

  const email = newEmail.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server config missing' })

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Permission check
  let requestedBy = null
  const { user } = await verifyAuth(req)
  if (user) {
    requestedBy = user.id
    const meta = user.user_metadata || {}
    if (['manager', 'admin', 'super_admin'].includes(meta.role)) {
      const { data: op } = await supabase.from('operatives').select('company_id').eq('id', operativeId).single()
      if (!op || op.company_id !== meta.company_id) return res.status(403).json({ error: 'Not authorised' })
    }
  } else if (managerCompanyId) {
    const { data: op } = await supabase.from('operatives').select('company_id').eq('id', operativeId).single()
    if (!op || op.company_id !== managerCompanyId) return res.status(403).json({ error: 'Not authorised' })
    requestedBy = null
  } else if (operativeSessionId) {
    if (operativeSessionId !== operativeId) return res.status(403).json({ error: 'Not authorised' })
    requestedBy = operativeId
  } else {
    return res.status(401).json({ error: 'Authentication required' })
  }

  // Check new email not already in use by another operative
  const { data: existing } = await supabase.from('operatives').select('id').ilike('email', email)
  if (existing?.some(o => o.id !== operativeId)) {
    return res.status(400).json({ error: 'This email is already in use by another worker' })
  }

  // Get current operative email
  const { data: op } = await supabase.from('operatives').select('email, name').eq('id', operativeId).single()
  if (!op) return res.status(404).json({ error: 'Operative not found' })
  if (op.email?.toLowerCase() === email) return res.status(400).json({ error: 'New email is the same as current email' })

  // Cancel any existing pending changes
  await supabase.from('pending_email_changes')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('operative_id', operativeId)
    .is('verified_at', null)
    .is('cancelled_at', null)

  // Generate token and create pending change
  const token = crypto.randomUUID()
  await supabase.from('pending_email_changes').insert({
    operative_id: operativeId,
    old_email: op.email || '',
    new_email: email,
    token,
    requested_by: requestedBy,
  })

  // Set pending_email on operative for UI display
  await supabase.from('operatives').update({ pending_email: email }).eq('id', operativeId)

  // Audit
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null
  await supabase.from('profile_audit_log').insert({
    worker_id: operativeId,
    edited_by: user?.user_metadata?.name || op.name || 'Unknown',
    edited_by_id: requestedBy,
    editor_role: user?.user_metadata?.role || 'operative',
    field_name: 'email_change_requested',
    old_value: op.email,
    new_value: email,
    ip_address: ip,
  })

  // Send verification email
  const baseUrl = req.headers.origin || process.env.VITE_APP_URL || 'https://bancroft-induction.vercel.app'
  const verifyLink = `${baseUrl}/verify-email?token=${token}`

  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'CoreSite <noreply@coresite.io>',
          to: [email],
          subject: 'CoreSite — Verify your new email address',
          html: `
            <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto;">
              <div style="background: #0a0e1a; border-radius: 12px 12px 0 0; padding: 24px;">
                <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 200; letter-spacing: 4px;">CORE<span style="font-weight: 700; letter-spacing: 1px;">SITE</span></h1>
              </div>
              <div style="background: #0f1529; padding: 24px; border-radius: 0 0 12px 12px;">
                <p style="color: white; font-size: 16px; margin: 0 0 8px;">Hi ${op.name || 'there'},</p>
                <p style="color: #9ca3af; font-size: 14px; margin: 0 0 20px;">
                  A request was made to change your CoreSite email to <strong style="color: white;">${email}</strong>.
                  Click the button below to verify this new email address.
                </p>
                <a href="${verifyLink}" style="display: block; background: #3b82f6; color: white; text-align: center; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin-bottom: 12px;">
                  Verify Email Address
                </a>
                <p style="color: #6b7280; font-size: 11px; margin: 20px 0 0; text-align: center;">
                  This link expires in 24 hours. If you didn't request this, you can ignore this email.
                </p>
              </div>
            </div>
          `,
        }),
      })
    } catch (e) {
      console.error('[EmailChange] Resend error:', e)
    }
  } else {
    console.log(`[EmailChange] Would send verification to ${email}: ${verifyLink}`)
  }

  return res.json({ success: true, message: `Verification email sent to ${email}` })
}
