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

  // 3. Auth user cleanup (best-effort — match by email)
  if (result.email) {
    try {
      const { data: users } = await supabase.auth.admin.listUsers()
      const authUser = users?.users?.find(u => u.email === result.email.toLowerCase())
      if (authUser) {
        const { error: delErr } = await supabase.auth.admin.deleteUser(authUser.id)
        if (delErr) {
          warnings.push(`Auth user cleanup failed: ${delErr.message}`)
        }
      }
    } catch (e) {
      warnings.push(`Auth user lookup failed: ${e.message}`)
    }
  }

  return res.status(200).json({
    success: true,
    name: result.name,
    warnings: warnings.length > 0 ? warnings : undefined,
  })
}
