import { verifySuperAdmin } from './_superAdminAuth.js'

/**
 * Hard-delete an operative and all associated data.
 * Super admin only. Sequence: DB cascade → storage cleanup → auth user deletion.
 *
 * POST /api/delete-operative
 * Body: { operativeId: UUID }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { verified, error: authErr, supabase } = await verifySuperAdmin(req)
  if (!verified) {
    return res.status(403).json({ error: authErr })
  }

  const { operativeId } = req.body
  if (!operativeId) {
    return res.status(400).json({ error: 'Missing operativeId' })
  }

  // Verify operative belongs to the caller's company
  const token = req.headers.authorization?.replace('Bearer ', '')
  const { data: { user } } = await supabase.auth.getUser(token)
  const callerCompanyId = user?.user_metadata?.company_id
  if (callerCompanyId) {
    const { data: op } = await supabase.from('operatives').select('company_id').eq('id', operativeId).single()
    if (!op) return res.status(404).json({ error: 'Operative not found' })
    if (op.company_id !== callerCompanyId) {
      return res.status(403).json({ error: 'Not authorised to delete operatives from another company' })
    }
  }

  // 1. DB cascade (irreversible step — do first)
  const { data: result, error: rpcErr } = await supabase.rpc('delete_operative_cascade', { op_id: operativeId })

  if (rpcErr) {
    return res.status(500).json({ error: `DB delete failed: ${rpcErr.message}` })
  }
  if (result?.error) {
    return res.status(404).json({ error: result.error })
  }

  const warnings = []

  // 2. Storage cleanup (best-effort — operative row is already gone)
  const storageUrls = [result.card_front_url, result.card_back_url, result.photo_url].filter(Boolean)
  if (storageUrls.length > 0) {
    const paths = storageUrls.map(url => {
      const marker = '/object/public/documents/'
      const idx = url.indexOf(marker)
      return idx !== -1 ? url.slice(idx + marker.length) : null
    }).filter(Boolean)

    if (paths.length > 0) {
      const { error: storageErr } = await supabase.storage.from('documents').remove(paths)
      if (storageErr) {
        warnings.push(`Storage cleanup failed: ${storageErr.message}`)
      }
    }
  }

  // 3. Auth user cleanup. Prefer the linked auth_user_id (PR2/PR3 populated it);
  //    the broken first-page-only listUsers() scan (§4.9) is gone. A historical
  //    operative has a NULL auth_user_id (its login may belong to an active record
  //    at another company / a future rejoin) — skip deletion then rather than
  //    risk orphan-deleting a login that is still in use elsewhere.
  if (result.auth_user_id) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(result.auth_user_id)
    if (delErr) warnings.push(`Auth user cleanup failed: ${delErr.message}`)
  } else if (result.email) {
    warnings.push('Login not deleted: operative was already detached (left). Remove the auth user manually if erasure requires it.')
  }

  return res.status(200).json({
    success: true,
    name: result.name,
    warnings: warnings.length > 0 ? warnings : undefined,
  })
}
