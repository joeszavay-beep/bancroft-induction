import { verifySuperAdmin } from './_superAdminAuth.js'

/**
 * Super-admin data + mutations, server-side with the service-role key.
 *
 * The SuperAdminPanel reads/writes ACROSS all tenants (every company's stats,
 * operatives, managers, projects). The RLS lockdown scopes those tables to the
 * caller's own company, which would break the panel — so all its cross-tenant
 * access moves here, behind verifySuperAdmin() (checks managers.role =
 * 'super_admin' for the authenticated user) and the service-role client (which
 * bypasses RLS by design). Action-routed POST.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { verified, supabase, error: authErr } = await verifySuperAdmin(req)
  if (!verified) return res.status(401).json({ error: authErr })

  const { action } = req.body || {}
  try {
    switch (action) {
      case 'overview': {
        const { data: companies, error } = await supabase
          .from('companies').select('*').order('created_at', { ascending: false })
        if (error) throw error
        const stats = {}
        for (const co of companies || []) {
          const [ops, projs, sigs, snags] = await Promise.all([
            supabase.from('operatives').select('id', { count: 'exact', head: true }).eq('company_id', co.id),
            supabase.from('projects').select('id', { count: 'exact', head: true }).eq('company_id', co.id),
            supabase.from('signatures').select('id', { count: 'exact', head: true }).eq('company_id', co.id),
            supabase.from('snags').select('id', { count: 'exact', head: true }).eq('company_id', co.id),
          ])
          stats[co.id] = {
            operatives: ops.count || 0, projects: projs.count || 0,
            signatures: sigs.count || 0, snags: snags.count || 0,
          }
        }
        return res.status(200).json({ companies: companies || [], stats })
      }

      case 'company-detail': {
        const { companyId } = req.body
        if (!companyId) return res.status(400).json({ error: 'Missing companyId' })
        const [u, w, p] = await Promise.all([
          supabase.from('managers').select('*').eq('company_id', companyId).order('name'),
          supabase.from('operatives').select('*, operative_projects(project_id, projects(name))').eq('company_id', companyId).order('name'),
          supabase.from('projects').select('*').eq('company_id', companyId).order('name'),
        ])
        return res.status(200).json({ managers: u.data || [], operatives: w.data || [], projects: p.data || [] })
      }

      case 'create-company': {
        const { company } = req.body
        if (!company?.name) return res.status(400).json({ error: 'Missing company name' })
        const { data, error } = await supabase.from('companies').insert(company).select().single()
        if (error) throw error
        return res.status(200).json({ company: data })
      }

      case 'set-company-active': {
        const { companyId, isActive } = req.body
        if (!companyId) return res.status(400).json({ error: 'Missing companyId' })
        const { error } = await supabase.from('companies').update({ is_active: isActive }).eq('id', companyId)
        if (error) throw error
        return res.status(200).json({ success: true })
      }

      case 'set-company-features': {
        const { companyId, features } = req.body
        if (!companyId) return res.status(400).json({ error: 'Missing companyId' })
        const { error } = await supabase.from('companies').update({ features }).eq('id', companyId)
        if (error) throw error
        return res.status(200).json({ success: true })
      }

      case 'set-manager-active': {
        const { managerId, isActive } = req.body
        if (!managerId) return res.status(400).json({ error: 'Missing managerId' })
        const { error } = await supabase.from('managers').update({ is_active: isActive }).eq('id', managerId)
        if (error) throw error
        return res.status(200).json({ success: true })
      }

      case 'reset-manager-password': {
        // NOTE: this preserves the existing managers.password behaviour so the
        // panel keeps working post-lockdown. The proper fix (AUDIT §5.4 / §2.14)
        // is to reset via supabase.auth.admin.updateUserById and drop the
        // plaintext column — tracked separately, not part of this batch.
        const { managerId } = req.body
        if (!managerId) return res.status(400).json({ error: 'Missing managerId' })
        const newPassword = `Reset${crypto.randomUUID().slice(0, 8)}`
        const { error } = await supabase
          .from('managers').update({ password: newPassword, must_change_password: true }).eq('id', managerId)
        if (error) throw error
        return res.status(200).json({ success: true, newPassword })
      }

      default:
        return res.status(400).json({ error: 'Unknown action' })
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' })
  }
}
