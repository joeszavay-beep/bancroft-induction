import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'

/**
 * Reactivate a worker who has returned — the inverse of api/operative-leave.
 *
 * Clears left_at (the same record becomes active again, keeping its history) and
 * re-links the auth login so they can sign in. Per owner decision, their existing
 * document signatures are INVALIDATED so they must re-sign their inductions/RAMS
 * before working again (card credentials + past toolbox-talk records are left
 * intact — those carry their own expiry / are historical fact).
 *
 * Safety: one login can only be ACTIVE at one company (the partial-unique index
 * operatives_active_auth_user_id_key). If the worker's login is already active
 * elsewhere, the re-link fails and we surface a 409 rather than create a second
 * active identity.
 *
 * POST /api/operative-reactivate   Body: { operativeId: UUID }
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

  const { user } = await verifyAuth(req)
  if (!user) return res.status(401).json({ error: 'Not authenticated — please log out and log back in' })
  const meta = user.user_metadata || {}
  if (!['manager', 'admin', 'super_admin'].includes(meta.role || 'manager')) {
    return res.status(403).json({ error: 'Not authorised' })
  }

  const { data: op } = await supabase.from('operatives')
    .select('id, company_id, name, email, left_at').eq('id', operativeId).single()
  if (!op) return res.status(404).json({ error: 'Operative not found' })
  if (op.company_id !== meta.company_id) {
    return res.status(403).json({ error: 'Not authorised to reactivate operatives from another company' })
  }
  if (!op.left_at) return res.status(200).json({ success: true, name: op.name, alreadyActive: true })

  // Re-link the worker's auth login by email (paged so it survives >50 users — §4.9).
  let authUserId = null
  if (op.email) {
    try {
      const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      authUserId = list?.users?.find(u => u.email === op.email.toLowerCase())?.id || null
    } catch { /* no auth account yet — leave unlinked, they can set one up later */ }
  }

  // Atomic: clearing left_at while setting auth_user_id triggers the active-login
  // partial-unique. A 23505 here means the login is active at another company.
  const { error } = await supabase.from('operatives')
    .update({ left_at: null, auth_user_id: authUserId }).eq('id', operativeId)
  if (error) {
    if (error.code === '23505' || /duplicate|unique/i.test(error.message)) {
      return res.status(409).json({
        error: 'This worker’s login is already active at another company. Remove them there first, or add them as a new worker.',
      })
    }
    return res.status(500).json({ error: `Failed to reactivate: ${error.message}` })
  }

  // Require re-induction: invalidate prior document signatures so they re-sign.
  // Best-effort — the worker is already reactivated above.
  const { error: sigErr } = await supabase.from('signatures')
    .update({ invalidated: true }).eq('operative_id', operativeId).eq('invalidated', false)
  const warnings = sigErr ? [`Could not reset inductions: ${sigErr.message}`] : undefined

  return res.status(200).json({ success: true, name: op.name, warnings })
}
