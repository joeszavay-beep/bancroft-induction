import { createClient } from '@supabase/supabase-js'

import { verifyAuth } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const operativeId = req.query.operativeId
  if (!operativeId) return res.status(400).json({ error: 'Missing operativeId' })

  // Auth: either an authenticated manager or the operative themselves
  const operativeSessionId = req.query.operativeSessionId
  const { user } = await verifyAuth(req)
  if (!user && operativeSessionId !== operativeId) {
    return res.status(401).json({ error: 'Authentication required' })
  }

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
    const opEmail = (op.email || '').toLowerCase()
    const adminApprovers = []
    const seenEmails = new Set()

    // Check managers table first
    const { data: allManagers } = await supabase.from('managers').select('id, name, email').eq('company_id', op.company_id).eq('is_active', true)
    for (const mgr of (allManagers || [])) {
      if (mgr.email?.toLowerCase() === opEmail) continue
      const { data: prof } = await supabase.from('profiles').select('role').eq('email', mgr.email).limit(1)
      if (prof?.[0]?.role === 'admin' || prof?.[0]?.role === 'super_admin') {
        adminApprovers.push({ id: mgr.id, name: mgr.name, email: mgr.email, shared_projects: [{ id: null, name: 'Admin' }] })
        seenEmails.add(mgr.email.toLowerCase())
      }
    }

    // Also check profiles table for admins not in managers
    if (adminApprovers.length === 0) {
      const { data: adminProfiles } = await supabase.from('profiles').select('id, name, email, role').eq('company_id', op.company_id).in('role', ['admin', 'super_admin'])
      for (const prof of (adminProfiles || [])) {
        if (prof.email?.toLowerCase() === opEmail) continue
        if (seenEmails.has(prof.email?.toLowerCase())) continue
        adminApprovers.push({ id: prof.id, name: prof.name, email: prof.email, shared_projects: [{ id: null, name: 'Admin' }], is_profile: true })
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
    // No managers table rows — fall back to profiles admins
    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('id, name, email, role')
      .eq('company_id', op.company_id)
      .in('role', ['admin', 'super_admin'])
    const opEmail = (op.email || '').toLowerCase()
    const fallbackApprovers = (adminProfiles || [])
      .filter(p => p.email?.toLowerCase() !== opEmail)
      .map(p => ({ id: p.id, name: p.name, email: p.email, shared_projects: [{ id: null, name: 'Admin' }], is_profile: true }))
    return res.json({ approvers: fallbackApprovers })
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

  // If no project-based approvers found, fall back to admins from managers table
  if (approvers.length === 0) {
    for (const mgr of managers) {
      if (mgr.email?.toLowerCase() === opEmail) continue
      if (seen.has(mgr.id)) continue
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

  // Final fallback: check profiles table for admins not in managers table
  // (company owners created during signup may only exist in profiles)
  if (approvers.length === 0) {
    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('id, name, email, role')
      .eq('company_id', op.company_id)
      .in('role', ['admin', 'super_admin'])
    for (const prof of (adminProfiles || [])) {
      if (prof.email?.toLowerCase() === opEmail) continue
      const seenEmail = [...approvers].some(a => a.email?.toLowerCase() === prof.email?.toLowerCase())
      if (seenEmail) continue
      approvers.push({
        id: prof.id,
        name: prof.name,
        email: prof.email,
        shared_projects: [{ id: null, name: 'Admin' }],
        is_profile: true,
      })
    }
  }

  return res.json({ approvers })
}
