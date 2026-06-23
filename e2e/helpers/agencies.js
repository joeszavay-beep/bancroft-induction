import { getAdmin } from './operatives.js'

/**
 * Service-role helpers to set up / tear down disposable AGENCY fixtures for the
 * §5.7c locked-state search+connect spec. Mirrors operatives.js: creation uses
 * the service-role admin client (RLS-bypass) so a spec can stage data the
 * connecting company will then reach ONLY through the locked policies; the spec's
 * assertions still run as the anon-as-test-user client (db.js), so they see what
 * the app sees. Never import this into browser/app code.
 *
 * There is no app path that promotes an agency to status='active' (§5.7c R1) —
 * search_agencies only returns active rows — so the seed sets status directly,
 * which is exactly what a manual super-admin verification does today.
 */

// Marker embedded in company_name so disposable agencies are sweepable after a
// crashed run (no separate prefix column on the agencies table).
export const DISPOSABLE_AGENCY_PREFIX = 'e2e-agency'

function freshTag() {
  return `${DISPOSABLE_AGENCY_PREFIX}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Create a disposable agency (+ its agency_users link + optional operatives).
 *   opts.status     → 'active' (default, discoverable via search_agencies) or
 *                     'pending_verification' (the as-registered state).
 *   opts.userEmail  → agency_users.email, so an agency-side login could resolve
 *                     via get_my_agency_ids() email keying. Default: fresh address.
 *   opts.operatives → number of agency_operatives to seed (default 0).
 * Returns { id, companyName, userEmail, tag, operativeIds }.
 */
export async function createDisposableAgency(opts = {}) {
  const admin = getAdmin()
  const tag = freshTag()
  const status = opts.status || 'active'
  const companyName = `E2E Agency ${tag}`
  const userEmail = (opts.userEmail || `${tag}@coresite.io`).toLowerCase()

  const { data: agency, error } = await admin.from('agencies').insert({
    company_name: companyName,
    primary_contact_name: 'E2E Agency Contact',
    primary_contact_email: userEmail,
    primary_contact_phone: '00000000000',
    status,
  }).select('id').single()
  if (error) throw new Error(`createDisposableAgency insert failed: ${error.message}`)
  const id = agency.id

  // agency_users is keyed by EMAIL in the app (get_my_agency_ids() matches it).
  const { error: uErr } = await admin.from('agency_users').insert({
    agency_id: id, email: userEmail, name: 'E2E Agency Admin', role: 'admin',
  })
  if (uErr) throw new Error(`createDisposableAgency agency_users failed: ${uErr.message}`)

  const operativeIds = []
  for (let i = 0; i < (opts.operatives || 0); i++) {
    const { data: op, error: oErr } = await admin.from('agency_operatives').insert({
      agency_id: id,
      first_name: 'E2E',
      last_name: `Op${i}-${tag}`,
      email: `${tag}-op${i}@coresite.io`,
      primary_trade: 'general_labourer',
      skill_level: 'skilled',
    }).select('id').single()
    if (oErr) throw new Error(`disposable agency_operative seed failed: ${oErr.message}`)
    operativeIds.push(op.id)
  }

  return { id, companyName, userEmail, tag, operativeIds }
}

/** Tear down a disposable agency: its connections, operatives, users, then itself. */
export async function deleteDisposableAgency(agencyId) {
  const admin = getAdmin()
  if (!agencyId) return
  await admin.from('agency_connections').delete().eq('agency_id', agencyId)
  await admin.from('agency_operatives').delete().eq('agency_id', agencyId)
  await admin.from('agency_users').delete().eq('agency_id', agencyId)
  await admin.from('agencies').delete().eq('id', agencyId)
}

/** Remove any orphaned disposable agencies left by a crashed run. */
export async function sweepDisposableAgencies() {
  const admin = getAdmin()
  const { data } = await admin.from('agencies').select('id').ilike('company_name', `%${DISPOSABLE_AGENCY_PREFIX}-%`)
  for (const a of (data || [])) await deleteDisposableAgency(a.id)
}
