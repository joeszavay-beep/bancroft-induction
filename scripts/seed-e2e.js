/**
 * Provisions a dedicated, isolated E2E test account in the live Supabase project.
 *
 * Idempotent: safe to run repeatedly. Creates (if missing):
 *   - an auth user (E2E_EMAIL / E2E_PASSWORD)
 *   - a company  "E2E Test Co"
 *   - a profile  (role: admin) + managers row
 *   - a project  "E2E Site"
 *
 * SECURITY: this is a Node-only script. It uses SUPABASE_SERVICE_ROLE_KEY (no VITE_
 * prefix) to bypass RLS for the privileged profile/managers/project inserts that the
 * anon key is not permitted to make. The service-role key must NEVER be imported by the
 * app or by browser-context test code. Run with:  node scripts/seed-e2e.js
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL = (process.env.E2E_EMAIL || 'e2e@coresite.io').toLowerCase()
const PASSWORD = process.env.E2E_PASSWORD || 'E2eTest2026!'

if (!URL || !ANON) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}
if (!SERVICE) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env (Node-only, no VITE_ prefix).')
  process.exit(1)
}

// Anon client: used to verify the account can log in exactly as the app does.
const sb = createClient(URL, ANON, { auth: { persistSession: false } })
// Admin client: Node-only, bypasses RLS for provisioning. Never expose to the browser.
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

async function signInOrSignUp() {
  // 1. Try to sign in (account already provisioned) — proves UI login will work.
  const signIn = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (signIn.data?.user) {
    console.log('✓ Signed in to existing E2E account')
    return signIn.data.user
  }

  // 2. Create a pre-confirmed auth user via the admin API (no email confirmation needed).
  const created = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: 'E2E Admin', role: 'admin' },
  })
  if (created.error && !/already.+registered|already.+exists/i.test(created.error.message)) {
    console.error('admin.createUser failed:', created.error.message)
    process.exit(1)
  }

  // 3. Sign in with the anon client to confirm login works and get the user object.
  const retry = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (!retry.data?.user) {
    console.error('Could not sign in after createUser:', retry.error?.message)
    process.exit(1)
  }
  console.log('✓ Created (or confirmed) E2E account')
  return retry.data.user
}

async function ensureCompany(user) {
  // A profile links the user to a company; if present, reuse it (read via admin).
  const { data: prof } = await admin.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
  if (prof?.company_id) {
    const { data: co } = await admin.from('companies').select('id, name').eq('id', prof.company_id).maybeSingle()
    if (co) { console.log(`✓ Company exists: ${co.name} (${co.id})`); return co.id }
  }

  // Clean up any orphaned E2E companies from earlier failed runs (no profile links to them).
  const { data: orphans } = await admin.from('companies').select('id').eq('contact_email', EMAIL)
  for (const o of (orphans || [])) {
    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', o.id)
    if (!count) { await admin.from('companies').delete().eq('id', o.id); console.log(`  cleaned orphan company ${o.id}`) }
  }

  const slug = 'e2e-test-co-' + user.id.slice(0, 8)
  const { data: company, error } = await admin.from('companies').insert({
    name: 'E2E Test Co',
    slug,
    contact_name: 'E2E Admin',
    contact_email: EMAIL,
    subscription_plan: 'trial',
    trial_ends_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    company_type: 'subcontractor',
    employee_count: '1-10',
    is_active: true,
    onboarding_complete: true,
    onboarding_step: 99,
    features: {},
  }).select().single()
  if (error) { console.error('company insert failed:', error.message); process.exit(1) }
  console.log(`✓ Created company (${company.id})`)

  const { error: pErr } = await admin.from('profiles').upsert({
    id: user.id, company_id: company.id, name: 'E2E Admin', email: EMAIL, role: 'admin', is_active: true,
  })
  if (pErr) { console.error('profile insert failed:', pErr.message); process.exit(1) }

  const { data: mgr } = await admin.from('managers').select('id').eq('email', EMAIL).maybeSingle()
  if (!mgr) {
    await admin.from('managers').insert({
      name: 'E2E Admin', email: EMAIL, role: 'admin', company_id: company.id, is_active: true, project_ids: [],
    })
  }
  console.log('✓ Profile + manager linked')
  return company.id
}

async function ensureProject(companyId) {
  const { data: existing } = await admin.from('projects').select('id, name').eq('company_id', companyId).eq('name', 'E2E Site').maybeSingle()
  if (existing) { console.log(`✓ Project exists: ${existing.name} (${existing.id})`); return existing.id }

  const { data: project, error } = await admin.from('projects').insert({
    name: 'E2E Site',
    location: 'Test Location',
    company_id: companyId,
    start_time: '07:30',
    end_time: '17:00',
  }).select().single()
  if (error) { console.error('project insert failed:', error.message); process.exit(1) }
  console.log(`✓ Created project (${project.id})`)
  return project.id
}

const user = await signInOrSignUp()
const companyId = await ensureCompany(user)
const projectId = await ensureProject(companyId)

console.log('\n=== E2E account ready ===')
console.log(`email:      ${EMAIL}`)
console.log(`user_id:    ${user.id}`)
console.log(`company_id: ${companyId}`)
console.log(`project_id: ${projectId}`)
process.exit(0)
