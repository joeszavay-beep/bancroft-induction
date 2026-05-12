import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const operativeId = req.query.operativeId
  if (!operativeId) return res.status(400).json({ error: 'Missing operativeId' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server config missing' })

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Get operative's company and email
  const { data: op } = await supabase.from('operatives').select('company_id, email').eq('id', operativeId).single()
  if (!op) return res.status(404).json({ error: 'Operative not found' })

  // Get operative's project IDs
  const { data: opProjects } = await supabase.from('operative_projects').select('project_id, projects(id, name)').eq('operative_id', operativeId)
  const projectIds = (opProjects || []).map(r => r.project_id)

  if (projectIds.length === 0) {
    // No projects, but still offer admins as fallback
    const { data: allManagers } = await supabase.from('managers').select('id, name, email').eq('company_id', op.company_id).eq('is_active', true)
    const opEmail = (op.email || '').toLowerCase()
    const adminApprovers = []
    for (const mgr of (allManagers || [])) {
      if (mgr.email?.toLowerCase() === opEmail) continue
      const { data: prof } = await supabase.from('profiles').select('role').eq('email', mgr.email).limit(1)
      if (prof?.[0]?.role === 'admin' || prof?.[0]?.role === 'super_admin') {
        adminApprovers.push({ id: mgr.id, name: mgr.name, email: mgr.email, shared_projects: [{ id: null, name: 'Admin' }] })
      }
    }
    return res.json({ approvers: adminApprovers })
  }

  // Get all active managers for the same company
  const { data: managers } = await supabase
    .from('managers')
    .select('id, name, email, project_ids')
    .eq('company_id', op.company_id)
    .eq('is_active', true)

  if (!managers?.length) {
    return res.json({ approvers: [], message: 'No active managers found' })
  }

  // Filter to managers whose project_ids overlap with operative's projects
  // Exclude the operative themselves (by email match)
  const opEmail = (op.email || '').toLowerCase()
  const projectMap = {}
  for (const r of (opProjects || [])) {
    if (r.projects) projectMap[r.projects.id] = r.projects.name
  }

  const approvers = []
  const seen = new Set()

  for (const mgr of managers) {
    if (mgr.email?.toLowerCase() === opEmail) continue // exclude self
    const mgrProjects = mgr.project_ids || []
    const shared = mgrProjects.filter(pid => projectIds.includes(pid))
    if (shared.length === 0) continue
    if (seen.has(mgr.id)) continue
    seen.add(mgr.id)

    approvers.push({
      id: mgr.id,
      name: mgr.name,
      email: mgr.email,
      shared_projects: shared.map(pid => ({ id: pid, name: projectMap[pid] || 'Unknown' })),
    })
  }

  // If no project-based approvers found, fall back to admins
  if (approvers.length === 0) {
    for (const mgr of managers) {
      if (mgr.email?.toLowerCase() === opEmail) continue
      if (seen.has(mgr.id)) continue
      // Check if this manager is an admin via profiles table
      const { data: prof } = await supabase.from('profiles').select('role').eq('email', mgr.email).limit(1)
      if (prof?.[0]?.role === 'admin' || prof?.[0]?.role === 'super_admin') {
        seen.add(mgr.id)
        approvers.push({
          id: mgr.id,
          name: mgr.name,
          email: mgr.email,
          shared_projects: [{ id: null, name: 'Admin' }],
        })
      }
    }
  }

  return res.json({ approvers })
}
