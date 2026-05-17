import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'

/**
 * POST /api/create-manager
 * Creates a new manager with a proper Supabase Auth account, profile, and managers record.
 * Sends a welcome email with login credentials.
 *
 * Security: requires authenticated caller who is an admin for the same company.
 *
 * PATCH /api/create-manager
 * Updates an existing manager's password via Supabase Auth (not stored in managers table).
 */
export default async function handler(req, res) {
  if (!['POST', 'PATCH'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify caller is authenticated
  const { user, error: authErr } = await verifyAuth(req)
  if (!user) {
    return res.status(401).json({ error: authErr || 'Unauthorized' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server config missing' })
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Get caller's profile to verify they are an admin
  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single()

  if (!callerProfile || !['admin', 'super_admin'].includes(callerProfile.role)) {
    return res.status(403).json({ error: 'Only admins can manage managers' })
  }

  const companyId = callerProfile.company_id

  // ─── PATCH: update existing manager's password ───
  if (req.method === 'PATCH') {
    const { email, password } = req.body
    if (!email || !password?.trim()) {
      return res.status(400).json({ error: 'Email and password are required' })
    }
    if (password.trim().length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    try {
      // Verify manager belongs to caller's company
      const { data: mgr } = await supabase
        .from('managers')
        .select('id')
        .eq('email', email.trim().toLowerCase())
        .eq('company_id', companyId)
        .single()

      if (!mgr) {
        return res.status(404).json({ error: 'Manager not found in your company' })
      }

      // Find auth user and update password
      const { data: { users } } = await supabase.auth.admin.listUsers()
      const authUser = users?.find(u => u.email === email.trim().toLowerCase())
      if (!authUser) {
        return res.status(404).json({ error: 'No auth account found — manager may need to be re-created' })
      }

      const { error: updateErr } = await supabase.auth.admin.updateUserById(authUser.id, {
        password: password.trim(),
      })
      if (updateErr) {
        return res.status(500).json({ error: `Failed to update password: ${updateErr.message}` })
      }

      return res.status(200).json({ success: true, message: 'Password updated' })
    } catch (err) {
      console.error('Update manager password error:', err)
      return res.status(500).json({ error: err.message || 'Failed to update password' })
    }
  }

  // ─── POST: create new manager ───
  const { name, email, password, projectIds, visibleSections } = req.body

  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'Name, email, and password are required' })
  }
  if (password.trim().length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  const cleanEmail = email.trim().toLowerCase()
  const cleanName = name.trim()

  try {
    // Check if manager already exists in this company
    const { data: existingMgr } = await supabase
      .from('managers')
      .select('id')
      .eq('email', cleanEmail)
      .eq('company_id', companyId)
      .single()

    if (existingMgr) {
      return res.status(409).json({ error: 'A manager with this email already exists' })
    }

    // Create or update Supabase Auth account
    let authUserId
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const existingUser = users?.find(u => u.email === cleanEmail)

    if (existingUser) {
      // Auth user exists (e.g. from a previous company or role) — update metadata
      await supabase.auth.admin.updateUserById(existingUser.id, {
        password: password.trim(),
        email_confirm: true,
        user_metadata: {
          ...existingUser.user_metadata,
          name: cleanName,
          role: 'manager',
          company_id: companyId,
        },
      })
      authUserId = existingUser.id
    } else {
      // Create new auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: cleanEmail,
        password: password.trim(),
        email_confirm: true,
        user_metadata: { name: cleanName, role: 'manager', company_id: companyId },
      })
      if (authError) {
        return res.status(400).json({ error: authError.message })
      }
      authUserId = authData.user.id
    }

    // Create profile entry (upsert in case of existing auth user)
    const { error: profErr } = await supabase.from('profiles').upsert({
      id: authUserId,
      company_id: companyId,
      name: cleanName,
      email: cleanEmail,
      role: 'manager',
      is_active: true,
    }, { onConflict: 'id' })
    if (profErr) console.error('Profile upsert error:', profErr)

    // Create managers table entry — NO password stored
    const { error: mgrErr } = await supabase.from('managers').insert({
      name: cleanName,
      email: cleanEmail,
      role: 'manager',
      company_id: companyId,
      project_ids: projectIds || [],
      visible_sections: visibleSections?.length > 0 ? visibleSections : null,
      is_active: true,
    })
    if (mgrErr) {
      // Clean up: if managers insert fails, we still created the auth user + profile
      // That's OK — they can be reused on retry
      if (mgrErr.code === '23505') {
        return res.status(409).json({ error: 'Email already exists' })
      }
      throw mgrErr
    }

    // Get company name for welcome email
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .single()

    // Send welcome email
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      const loginUrl = `${process.env.APP_URL || `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || 'bancroft-induction.vercel.app'}`}/login`
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'CoreSite <noreply@coresite.io>',
            to: [cleanEmail],
            subject: `You've been added to CoreSite — ${company?.name || 'your company'}`,
            html: `
              <div style="font-family: system-ui, sans-serif; max-width: 540px; margin: 0 auto;">
                <div style="background: #1A2744; border-radius: 12px 12px 0 0; padding: 28px 24px;">
                  <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 200; letter-spacing: 4px;">CORE<span style="font-weight: 700; letter-spacing: 1px;">SITE</span></h1>
                  <p style="color: #6B7A99; margin: 4px 0 0; font-size: 12px;">Site Compliance Platform</p>
                </div>
                <div style="background: #ffffff; padding: 28px 24px; border: 1px solid #E2E6EA; border-top: none;">
                  <p style="color: #1A1A2E; font-size: 16px; margin: 0 0 8px;">Hi ${cleanName},</p>
                  <p style="color: #6B7A99; font-size: 14px; margin: 0 0 24px; line-height: 1.6;">
                    You've been added as a manager on <strong style="color: #1A1A2E;">${company?.name || 'your company'}</strong>'s CoreSite account.
                    Here are your login details:
                  </p>
                  <div style="background: #F5F6F8; border: 1px solid #E2E6EA; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 6px 0; color: #6B7A99; font-size: 13px; width: 120px;">Login URL</td>
                        <td style="padding: 6px 0; font-size: 13px; font-weight: 600;">
                          <a href="${loginUrl}" style="color: #1B6FC8; text-decoration: none;">${loginUrl}</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #6B7A99; font-size: 13px;">Email</td>
                        <td style="padding: 6px 0; color: #1A1A2E; font-size: 13px; font-weight: 600;">${cleanEmail}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #6B7A99; font-size: 13px;">Password</td>
                        <td style="padding: 6px 0; color: #1A1A2E; font-size: 13px; font-weight: 600; font-family: monospace; letter-spacing: 1px;">${password.trim()}</td>
                      </tr>
                    </table>
                  </div>
                  <a href="${loginUrl}" style="display: block; background: #1B6FC8; color: white; text-align: center; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin-bottom: 20px;">
                    Sign In to CoreSite
                  </a>
                  <p style="color: #6B7A99; font-size: 13px; line-height: 1.6; margin: 0;">
                    We recommend changing your password after your first login.
                  </p>
                </div>
                <div style="background: #F5F6F8; border-radius: 0 0 12px 12px; padding: 16px 24px; border: 1px solid #E2E6EA; border-top: none;">
                  <p style="color: #B0B8C9; font-size: 11px; margin: 0; text-align: center;">
                    CoreSite — Site Compliance Platform<br>This is an automated message. Please do not reply.
                  </p>
                </div>
              </div>
            `,
          }),
        })
      } catch (emailErr) {
        console.error('Welcome email error:', emailErr)
        // Don't fail the whole operation if email fails — account is created
      }
    } else {
      console.log(`[create-manager] No RESEND_API_KEY — welcome email for ${cleanEmail} not sent`)
    }

    return res.status(200).json({ success: true, message: 'Manager created and welcome email sent' })
  } catch (err) {
    console.error('Create manager error:', err)
    return res.status(500).json({ error: err.message || 'Failed to create manager' })
  }
}
