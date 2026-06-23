// READ-ONLY diagnostic — inspects the full persisted footprint of a signup test
// email across auth + the tenant tables, to diagnose the §5.20/onboarding state.
// NO writes of any kind. Run with:
//   node --env-file=.env scripts/diag-signup-footprint.js <email>
import { createClient } from '@supabase/supabase-js'

const email = (process.argv[2] || '').trim().toLowerCase()
if (!email) { console.error('Usage: node --env-file=.env scripts/diag-signup-footprint.js <email>'); process.exit(1) }

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env'); process.exit(1) }

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const show = (label, rows) => {
  console.log(`\n=== ${label} (${rows?.length ?? 0}) ===`)
  if (rows?.length) console.table(rows)
}

// 1. Auth users matching this email (paged — §4.9)
let authMatches = []
for (let page = 1; page <= 50; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) { console.error('listUsers error:', error.message); break }
  const users = data?.users || []
  authMatches.push(...users.filter(u => u.email?.toLowerCase() === email))
  if (users.length === 0) break
}
show('auth.users', authMatches.map(u => ({
  id: u.id, email: u.email, confirmed: !!u.email_confirmed_at,
  created_at: u.created_at, role_meta: u.user_metadata?.role, name_meta: u.user_metadata?.name,
})))
const authIds = authMatches.map(u => u.id)

// 2. profiles — by auth id AND by email (catch mismatches / orphans)
const { data: profById } = authIds.length
  ? await db.from('profiles').select('id, company_id, name, email, role, is_active').in('id', authIds)
  : { data: [] }
show('profiles WHERE id = auth user id', profById)
const { data: profByEmail } = await db.from('profiles').select('id, company_id, name, email, role, is_active').ilike('email', email)
show('profiles WHERE email = test email', profByEmail)

// 3. companies — by the profile's company_id AND by contact_email (catch dup companies)
const companyIds = [...new Set([...(profById || []), ...(profByEmail || [])].map(p => p.company_id).filter(Boolean))]
const { data: coById } = companyIds.length
  ? await db.from('companies').select('id, name, slug, company_type, contact_email, onboarding_step, onboarding_complete, created_at').in('id', companyIds)
  : { data: [] }
show('companies WHERE id = profile.company_id', coById)
const { data: coByEmail } = await db.from('companies').select('id, name, slug, company_type, contact_email, onboarding_step, onboarding_complete, created_at').ilike('contact_email', email)
show('companies WHERE contact_email = test email', coByEmail)

// 4. managers (subcontractor admin path)
const { data: mgrs } = await db.from('managers').select('id, name, email, role, company_id, is_active').ilike('email', email)
show('managers WHERE email = test email', mgrs)

// 5. agencies + agency_users (agency path)
const { data: agencies } = await db.from('agencies').select('id, company_name, primary_contact_email, status, created_at').ilike('primary_contact_email', email)
show('agencies WHERE primary_contact_email = test email', agencies)
const { data: agencyUsers } = await db.from('agency_users').select('id, agency_id, name, email, role').ilike('email', email)
show('agency_users WHERE email = test email', agencyUsers)

// 6. Consistency verdict
console.log('\n=== VERDICT ===')
const authId = authIds[0]
const prof = (profById || [])[0]
if (!authId) console.log('• No auth user for this email.')
else if (!prof) console.log(`• Auth user ${authId} exists but has NO profiles row (id=auth.uid) → get_my_company_id()=NULL → onboarding UPDATE matches 0 rows. This is the bug.`)
else {
  console.log(`• Auth user ${authId} → profile.company_id=${prof.company_id}`)
  const coExists = (coById || []).some(c => c.id === prof.company_id)
  console.log(`• profile.company_id resolves to a real company row: ${coExists}`)
  console.log(`• get_my_company_id() would return: ${prof.company_id} → onboarding UPDATE eq('id', company.id) should match IF the browser's company.id === ${prof.company_id}`)
  if ((profByEmail || []).length > 1) console.log(`• WARNING: ${profByEmail.length} profiles share this email → duplicate identity.`)
  if ((coByEmail || []).length > 1) console.log(`• WARNING: ${coByEmail.length} companies share this contact_email → duplicate company from repeated signups.`)
}
console.log('\n(read-only — no rows were modified)')
