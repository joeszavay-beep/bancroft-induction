import { createClient } from '@supabase/supabase-js'

/**
 * Service-role admin client — Node-only, used ONLY to set up / tear down
 * disposable operative fixtures for the §5.22 lifecycle specs (creating
 * operatives, auth users, and compliance child rows all require bypassing RLS).
 * Assertions still use the anon-as-test-user client in db.js, so they see what
 * the app sees. Never import this into browser/app code. Mirrors seed-e2e.js.
 */
const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

let _admin = null
export function getAdmin() {
  if (_admin) return _admin
  if (!URL || !SERVICE) throw new Error('SUPABASE_SERVICE_ROLE_KEY / URL missing — is .env loaded?')
  _admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
  return _admin
}

// Marker so disposable rows are identifiable + sweepable after a crashed run.
export const DISPOSABLE_PREFIX = 'e2e-life'
const PASSWORD = 'E2eLife2026!'

function freshTag() {
  return `${DISPOSABLE_PREFIX}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Create a disposable ACTIVE operative (left_at NULL) in the given company.
 *   opts.withAuth      → also a confirmed auth user carrying operative_id in
 *                        user_metadata + auth_user_id linked (so a spec can sign
 *                        in AS the operative, and GDPR erase can delete the login).
 *   opts.withSignature → also one signatures row (proves compliance retention).
 *   opts.email         → reuse a specific email (for the rejoin "same email" case).
 * Returns { id, email, password, name, authUserId, signatureId }.
 */
export async function createDisposableOperative(companyId, projectId, documentId, opts = {}) {
  const admin = getAdmin()
  const tag = freshTag()
  const email = (opts.email || `${tag}@coresite.io`).toLowerCase()
  const name = opts.name || `E2E Lifecycle ${tag}`

  // NB: operatives has NO project_id column — the link is via operative_projects.
  const { data: op, error } = await admin.from('operatives').insert({
    name, email, company_id: companyId,
    date_of_birth: '1990-01-01', role: 'Operative',
  }).select('id').single()
  if (error) throw new Error(`createDisposableOperative insert failed: ${error.message}`)
  const id = op.id

  await admin.from('operative_projects').insert({ operative_id: id, project_id: projectId })

  let authUserId = null
  if (opts.withAuth) {
    const created = await admin.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
      user_metadata: { name, role: 'operative', operative_id: id },
    })
    if (created.error && !/already.+(registered|exists)/i.test(created.error.message)) {
      throw new Error(`disposable auth createUser failed: ${created.error.message}`)
    }
    authUserId = created.data?.user?.id || null
    if (!authUserId) {
      const list = await admin.auth.admin.listUsers({ perPage: 1000 })
      authUserId = list.data?.users?.find(u => u.email === email)?.id || null
    }
    if (authUserId) await admin.from('operatives').update({ auth_user_id: authUserId }).eq('id', id)
  }

  let signatureId = null
  if (opts.withSignature) {
    const sig = await admin.from('signatures').insert({
      operative_id: id, document_id: documentId, project_id: projectId, company_id: companyId,
      operative_name: name, document_title: 'E2E RAMS', typed_name: name,
      signed_at: new Date().toISOString(),
    }).select('id').single()
    if (sig.error) throw new Error(`disposable signature seed failed: ${sig.error.message}`)
    signatureId = sig.data.id
  }

  return { id, email, password: PASSWORD, name, authUserId, signatureId }
}

/** Set left_at = now() (and detach the login) directly — simulate a prior leaver. */
export async function markHistorical(id) {
  const admin = getAdmin()
  const { error } = await admin.from('operatives')
    .update({ left_at: new Date().toISOString(), auth_user_id: null }).eq('id', id)
  if (error) throw new Error(`markHistorical failed: ${error.message}`)
}

/** Hard-delete EVERY operative row with this email + their children + the auth user. */
export async function cleanupByEmail(email, authUserId = null) {
  const admin = getAdmin()
  const lower = (email || '').toLowerCase()
  if (!lower) return
  const { data: ops } = await admin.from('operatives').select('id').ilike('email', lower)
  for (const o of (ops || [])) {
    await admin.from('signatures').delete().eq('operative_id', o.id)
    await admin.from('site_attendance').delete().eq('operative_id', o.id)
    await admin.from('toolbox_signatures').delete().eq('operative_id', o.id)
    await admin.from('operative_projects').delete().eq('operative_id', o.id)
  }
  await admin.from('operatives').delete().ilike('email', lower)
  let uid = authUserId
  if (!uid) {
    const list = await admin.auth.admin.listUsers({ perPage: 1000 })
    uid = list.data?.users?.find(u => u.email === lower)?.id || null
  }
  if (uid) await admin.auth.admin.deleteUser(uid).catch(() => {})
}

/** Remove any orphaned disposable operatives left by a crashed run. */
export async function sweepDisposable() {
  const admin = getAdmin()
  const { data } = await admin.from('operatives').select('email').ilike('email', `${DISPOSABLE_PREFIX}-%`)
  const emails = [...new Set((data || []).map(o => o.email))]
  for (const e of emails) await cleanupByEmail(e)
}
