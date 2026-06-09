/**
 * Provisions a dedicated, isolated E2E test account in the live Supabase project.
 *
 * Idempotent: safe to run repeatedly. Creates (if missing):
 *   - an auth user (E2E_EMAIL / E2E_PASSWORD)
 *   - a company  "E2E Test Co"
 *   - a profile  (role: admin) + managers row
 *   - a project  "E2E Site"
 *
 * Uses the anon key + signUp (no service-role key is available in this repo),
 * mirroring the app's own Signup.jsx flow. Run with:  node scripts/seed-e2e.js
 *
 * If the project requires email confirmation, signUp will not return a usable
 * session — the script detects this and tells you to confirm the user once in
 * the Supabase dashboard (or disable confirmation for this project).
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const EMAIL = (process.env.E2E_EMAIL || 'e2e@coresite.io').toLowerCase()
const PASSWORD = process.env.E2E_PASSWORD || 'E2eTest2026!'

if (!URL || !ANON) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const sb = createClient(URL, ANON, { auth: { persistSession: false } })

async function signInOrSignUp() {
  // 1. Try to sign in (account already provisioned).
  const signIn = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (signIn.data?.user) {
    console.log('✓ Signed in to existing E2E account')
    return signIn.data.user
  }

  // 2. Create the auth user.
  const signUp = await sb.auth.signUp({
    email: EMAIL,
    password: PASSWORD,
    options: { data: { name: 'E2E Admin', role: 'admin' } },
  })
  if (signUp.error) {
    console.error('signUp failed:', signUp.error.message)
    process.exit(1)
  }
  if (!signUp.data.session) {
    // Email confirmation is on — try signing in (works if auto-confirm), else bail.
    const retry = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
    if (!retry.data?.user) {
      console.error(
        '\n⚠ Account created but no session (email confirmation is enabled).\n' +
        `  Confirm ${EMAIL} once in the Supabase dashboard (Authentication → Users),\n` +
        '  or disable "Confirm email" for this project, then re-run this script.\n'
      )
      process.exit(2)
    }
    console.log('✓ Created and signed in to E2E account')
    return retry.data.user
  }
  console.log('✓ Created E2E account')
  return signUp.data.user
}

async function ensureCompany(user) {
  // A profile links the user to a company; if present, reuse it.
  const { data: prof } = await sb.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
  if (prof?.company_id) {
    const { data: co } = await sb.from('companies').select('id, name').eq('id', prof.company_id).maybeSingle()
    if (co) { console.log(`✓ Company exists: ${co.name} (${co.id})`); return co.id }
  }

  const slug = 'e2e-test-co-' + user.id.slice(0, 8)
  const { data: company, error } = await sb.from('companies').insert({
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

  const { error: pErr } = await sb.from('profiles').upsert({
    id: user.id, company_id: company.id, name: 'E2E Admin', email: EMAIL, role: 'admin', is_active: true,
  })
  if (pErr) { console.error('profile insert failed:', pErr.message); process.exit(1) }

  const { data: mgr } = await sb.from('managers').select('id').eq('email', EMAIL).maybeSingle()
  if (!mgr) {
    await sb.from('managers').insert({
      name: 'E2E Admin', email: EMAIL, role: 'admin', company_id: company.id, is_active: true, project_ids: [],
    })
  }
  console.log('✓ Profile + manager linked')
  return company.id
}

async function ensureProject(companyId) {
  const { data: existing } = await sb.from('projects')
    .select('id, name').eq('company_id', companyId).eq('name', 'E2E Site').maybeSingle()
  if (existing) { console.log(`✓ Project exists: ${existing.name} (${existing.id})`); return existing.id }

  const { data: project, error } = await sb.from('projects').insert({
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
