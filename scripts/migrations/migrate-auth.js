import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { migrationKey } = req.body
  if (migrationKey !== 'CORESITE_MIGRATE_2026') {
    return res.status(403).json({ error: 'Invalid migration key' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing Supabase config' })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  // Get all existing managers
  const { data: managers, error: fetchErr } = await supabase.from('managers').select('*')
  if (fetchErr) return res.status(500).json({ error: 'Failed to fetch managers', details: fetchErr })

  const results = []

  for (const mgr of managers) {
    // Need a valid email for Supabase Auth
    let authEmail = mgr.email
    if (!authEmail || !authEmail.includes('@')) {
      // Generate a placeholder email for non-email usernames
      authEmail = `${mgr.email || mgr.name}@coresite.io`.toLowerCase().replace(/\s+/g, '.')
    }

    // Check if auth user already exists
    const { data: existing } = await supabase.auth.admin.listUsers()
    const alreadyExists = existing?.users?.find(u => u.email === authEmail.toLowerCase())

    if (alreadyExists) {
      // Create profile if it doesn't exist
      await supabase.from('profiles').upsert({
        id: alreadyExists.id,
        company_id: mgr.company_id,
        name: mgr.name,
        email: authEmail.toLowerCase(),
        role: mgr.role || 'manager',
        is_active: mgr.is_active !== false,
      }, { onConflict: 'id' })

      results.push({ name: mgr.name, email: authEmail, status: 'already_exists', authId: alreadyExists.id })
      continue
    }

    // Create Supabase Auth user
    const password = mgr.password || 'CoreSite2026!'
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: authEmail.toLowerCase(),
      password: password,
      email_confirm: true, // Auto-confirm since we disabled email confirmation
      user_metadata: { name: mgr.name, role: mgr.role, company_id: mgr.company_id },
    })

    if (authErr) {
      results.push({ name: mgr.name, email: authEmail, status: 'error', error: authErr.message })
      continue
    }

    // Create profile
    const { error: profileErr } = await supabase.from('profiles').insert({
      id: authUser.user.id,
      company_id: mgr.company_id,
      name: mgr.name,
      email: authEmail.toLowerCase(),
      role: mgr.role || 'manager',
      is_active: mgr.is_active !== false,
    })

    results.push({
      name: mgr.name,
      email: authEmail,
      password: password,
      status: profileErr ? 'auth_created_profile_failed' : 'success',
      authId: authUser.user.id,
    })
  }

  return res.status(200).json({ message: 'Migration complete', results })
}
