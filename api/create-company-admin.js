import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { user, error: authErr } = await verifyAuth(req)
  if (!user) {
    return res.status(401).json({ error: authErr || 'Unauthorized' })
  }

  const { companyId, adminName, adminEmail } = req.body
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

    return res.status(200).json({ tempPassword })
  } catch (err) {
    console.error('Create company admin error:', err)
    return res.status(500).json({ error: err.message || 'Failed to create admin user' })
  }
}
