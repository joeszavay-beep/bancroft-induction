import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'

async function sendWelcomeEmail(companyName, contactName, email, tempPassword) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.log(`[Welcome] ${contactName} at ${companyName} — email: ${email} (no RESEND_API_KEY)`)
    return
  }
  const loginUrl = 'https://coresite.io/login'
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'CoreSite <noreply@coresite.io>',
        to: [email],
        subject: `Welcome to CoreSite — ${companyName} account created`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 540px; margin: 0 auto;">
            <div style="background: #1A2744; border-radius: 12px 12px 0 0; padding: 28px 24px;">
              <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 200; letter-spacing: 4px;">CORE<span style="font-weight: 700; letter-spacing: 1px;">SITE</span></h1>
              <p style="color: #6B7A99; margin: 4px 0 0; font-size: 12px;">Site Compliance Platform</p>
            </div>
            <div style="background: #ffffff; padding: 28px 24px; border: 1px solid #E2E6EA; border-top: none;">
              <p style="color: #1A1A2E; font-size: 16px; margin: 0 0 8px;">Hi ${contactName || 'there'},</p>
              <p style="color: #6B7A99; font-size: 14px; margin: 0 0 24px; line-height: 1.6;">
                Your company <strong style="color: #1A1A2E;">${companyName}</strong> has been set up on CoreSite.
                Here are your login details:
              </p>
              <div style="background: #F5F6F8; border: 1px solid #E2E6EA; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr><td style="padding: 6px 0; color: #6B7A99; font-size: 13px; width: 120px;">Login URL</td><td style="padding: 6px 0; font-size: 13px; font-weight: 600;"><a href="${loginUrl}" style="color: #1B6FC8; text-decoration: none;">${loginUrl}</a></td></tr>
                  <tr><td style="padding: 6px 0; color: #6B7A99; font-size: 13px;">Email</td><td style="padding: 6px 0; color: #1A1A2E; font-size: 13px; font-weight: 600;">${email}</td></tr>
                  <tr><td style="padding: 6px 0; color: #6B7A99; font-size: 13px;">Temporary Password</td><td style="padding: 6px 0; color: #1A1A2E; font-size: 13px; font-weight: 600; font-family: monospace; letter-spacing: 1px;">${tempPassword}</td></tr>
                </table>
              </div>
              <a href="${loginUrl}" style="display: block; background: #1B6FC8; color: white; text-align: center; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin-bottom: 20px;">Sign In to CoreSite</a>
              <p style="color: #6B7A99; font-size: 13px; line-height: 1.6; margin: 0 0 8px;"><strong style="color: #1A1A2E;">What to do next:</strong></p>
              <ol style="color: #6B7A99; font-size: 13px; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li>Sign in with the credentials above</li><li>Change your password</li><li>Upload your company logo</li><li>Start adding projects, workers and documents</li>
              </ol>
            </div>
            <div style="background: #F5F6F8; border-radius: 0 0 12px 12px; padding: 16px 24px; border: 1px solid #E2E6EA; border-top: none;">
              <p style="color: #B0B8C9; font-size: 11px; margin: 0; text-align: center;">CoreSite — Site Compliance Platform<br>This is an automated message. Please do not reply.</p>
            </div>
          </div>`,
      }),
    })
  } catch (err) {
    console.error('Welcome email error:', err)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { user, error: authErr } = await verifyAuth(req)
  if (!user) {
    return res.status(401).json({ error: authErr || 'Unauthorized' })
  }

  const { companyId, companyName, adminName, adminEmail } = req.body
  if (!companyId || !adminEmail) {
    return res.status(400).json({ error: 'Missing companyId or adminEmail' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: `Missing env: URL=${!!supabaseUrl} KEY=${!!serviceKey}` })
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    // Clean up any orphaned records from a previous deletion
    await supabase.from('profiles').delete().eq('email', adminEmail)
    await supabase.from('managers').delete().eq('email', adminEmail)

    // Create Supabase auth user (service role — won't affect caller's session)
    const tempPassword = `Welcome${Math.random().toString(36).slice(2, 8)}!A1`
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name: adminName, role: 'admin' },
    })

    if (authError) {
      // If user already exists in auth, try to reuse them
      if (authError.message?.includes('already been registered')) {
        const { data: existing } = await supabase.auth.admin.listUsers()
        const existingUser = existing?.users?.find(u => u.email === adminEmail)
        if (existingUser) {
          // Update their password and metadata
          await supabase.auth.admin.updateUserById(existingUser.id, {
            password: tempPassword,
            user_metadata: { name: adminName, role: 'admin' },
          })

          // Create profile with existing auth user's ID
          await supabase.from('profiles').insert({
            id: existingUser.id,
            company_id: companyId,
            name: adminName,
            email: adminEmail,
            role: 'admin',
            is_active: true,
          })

          // Create managers record
          await supabase.from('managers').insert({
            name: adminName,
            email: adminEmail,
            password: tempPassword,
            role: 'admin',
            company_id: companyId,
            is_active: true,
            must_change_password: true,
          })

          await sendWelcomeEmail(companyName, adminName, adminEmail, tempPassword)
          return res.status(200).json({ tempPassword })
        }
      }
      return res.status(400).json({ error: authError.message })
    }

    const authUserId = authData.user.id

    // Create profile linked to the auth user
    const { error: profileErr } = await supabase.from('profiles').insert({
      id: authUserId,
      company_id: companyId,
      name: adminName,
      email: adminEmail,
      role: 'admin',
      is_active: true,
    })
    if (profileErr) console.error('Profile insert error:', profileErr)

    // Create legacy managers record
    const { error: mgrErr } = await supabase.from('managers').insert({
      name: adminName,
      email: adminEmail,
      password: tempPassword,
      role: 'admin',
      company_id: companyId,
      is_active: true,
      must_change_password: true,
    })
    if (mgrErr) console.error('Manager insert error:', mgrErr)

    await sendWelcomeEmail(companyName, adminName, adminEmail, tempPassword)
    return res.status(200).json({ tempPassword })
  } catch (err) {
    console.error('Create company admin error:', err)
    return res.status(500).json({ error: err.message || 'Failed to create admin user' })
  }
}
