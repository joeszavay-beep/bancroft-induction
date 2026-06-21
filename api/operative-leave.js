import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'

/**
 * Mark an operative as "left the company" (historical) — NOT a delete.
 *
 * Sets left_at = now() and detaches auth_user_id, preserving ALL compliance
 * history (signatures, attendance, toolbox signatures) per the §5.19 lifecycle
 * rule: a worker's records stay company-bound and do not follow the person.
 *
 * The RLS helpers filter `left_at IS NULL` (see rls-5-22-pr3b-leftat-guards.sql),
 * so marking historical revokes the leaver's access on their next request —
 * their existing JWT still authenticates but resolves to a historical row, which
 * returns zero rows. We deliberately do NOT delete the auth login: it may belong
 * to an active record at another company, or be reused on a future rejoin.
 *
 * Genuine erasure (GDPR) is a separate, super-admin-only path: api/delete-operative.
 *
 * POST /api/operative-leave   Body: { operativeId: UUID }
 * Manager / admin / super_admin of the operative's OWN company only.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { operativeId } = req.body
  if (!operativeId) return res.status(400).json({ error: 'Missing operativeId' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server config missing' })

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Caller must be an authenticated manager/admin.
  const { user } = await verifyAuth(req)
  if (!user) return res.status(401).json({ error: 'Not authenticated — please log out and log back in' })
  const meta = user.user_metadata || {}
  if (!['manager', 'admin', 'super_admin'].includes(meta.role || 'manager')) {
    return res.status(403).json({ error: 'Not authorised' })
  }

  // Operative must belong to the caller's company.
  const { data: op } = await supabase.from('operatives')
    .select('id, company_id, name, left_at').eq('id', operativeId).single()
  if (!op) return res.status(404).json({ error: 'Operative not found' })
  if (op.company_id !== meta.company_id) {
    return res.status(403).json({ error: 'Not authorised to remove operatives from another company' })
  }
  if (op.left_at) return res.status(200).json({ success: true, name: op.name, alreadyLeft: true })

  // Mark historical — retain every child compliance row (no cascade deletes).
  // Detaching auth_user_id is inert under today's interim helpers; the left_at
  // guard is what actually denies the leaver's reads going forward.
  const { error } = await supabase.from('operatives')
    .update({ left_at: new Date().toISOString(), auth_user_id: null })
    .eq('id', operativeId)
  if (error) return res.status(500).json({ error: `Failed to mark operative as left: ${error.message}` })

  return res.status(200).json({ success: true, name: op.name })
}
