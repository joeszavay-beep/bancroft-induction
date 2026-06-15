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
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

async function ensureDrawing(companyId, projectId) {
  const { data: existing } = await admin.from('drawings')
    .select('id, file_url').eq('project_id', projectId).eq('name', 'E2E Drawing').maybeSingle()
  if (existing?.file_url) { console.log(`✓ Drawing exists: (${existing.id})`); return existing.id }

  // Upload the fixture image to the drawings bucket (service-role bypasses storage RLS).
  const png = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../e2e/fixtures/drawing.png'))
  const filePath = `${projectId}/e2e-drawing.png`
  const up = await admin.storage.from('drawings').upload(filePath, png, { contentType: 'image/png', upsert: true })
  if (up.error) { console.error('drawing upload failed:', up.error.message); process.exit(1) }
  const { data: urlData } = admin.storage.from('drawings').getPublicUrl(filePath)

  const { data: drawing, error } = await admin.from('drawings').insert({
    project_id: projectId,
    company_id: companyId,
    name: 'E2E Drawing',
    file_url: urlData.publicUrl,
    uploaded_by: 'E2E Admin',
  }).select().single()
  if (error) { console.error('drawing insert failed:', error.message); process.exit(1) }
  console.log(`✓ Created drawing (${drawing.id})`)
  return drawing.id
}

async function ensureOperative(companyId, projectId) {
  const wEmail = (process.env.E2E_WORKER_EMAIL || 'e2e-worker@coresite.io').toLowerCase()
  const wPass = process.env.E2E_WORKER_PASSWORD || 'E2eWorker2026!'

  // Ensure the operative row FIRST so we can stamp its id into the auth user's
  // JWT. get_operative_company_id() reads user_metadata.operative_id; without it,
  // post-lockdown operative-scoped reads (e.g. SiteSignIn's operatives lookup)
  // return zero rows. Mirrors prod api/create-operative-account.js, which sets
  // operative_id at creation — the seed previously omitted it (worked only under
  // the pre-lockdown permissive RLS).
  let { data: op } = await admin.from('operatives').select('id').eq('email', wEmail).maybeSingle()
  if (!op) {
    const ins = await admin.from('operatives').insert({
      name: 'E2E Worker', email: wEmail, company_id: companyId,
      date_of_birth: '1990-01-01', role: 'Operative', project_id: projectId,
    }).select().single()
    if (ins.error) { console.error('operative insert failed:', ins.error.message); process.exit(1) }
    op = ins.data
  } else {
    // Ensure project_id is set (ToolboxSign/induction filter operatives by it).
    await admin.from('operatives').update({ project_id: projectId }).eq('id', op.id)
  }

  // Pre-confirmed auth user carrying operative_id in user_metadata.
  const wMeta = { name: 'E2E Worker', role: 'operative', operative_id: op.id }
  const created = await admin.auth.admin.createUser({
    email: wEmail, password: wPass, email_confirm: true, user_metadata: wMeta,
  })
  if (created.error && !/already.+(registered|exists)/i.test(created.error.message)) {
    console.error('worker createUser failed:', created.error.message); process.exit(1)
  }
  // Whether just-created or pre-existing (an earlier run created it WITHOUT
  // operative_id), force operative_id onto the JWT metadata. Resolve the user id
  // via a throwaway anon sign-in so the admin/anon shared sessions are untouched.
  const wsb = createClient(URL, ANON, { auth: { persistSession: false } })
  const wSignIn = await wsb.auth.signInWithPassword({ email: wEmail, password: wPass })
  if (!wSignIn.data?.user) {
    console.error('worker sign-in failed:', wSignIn.error?.message); process.exit(1)
  }
  await admin.auth.admin.updateUserById(wSignIn.data.user.id, {
    user_metadata: { ...wSignIn.data.user.user_metadata, ...wMeta },
  })

  // Link to project (idempotent).
  const { data: link } = await admin.from('operative_projects')
    .select('operative_id').eq('operative_id', op.id).eq('project_id', projectId).maybeSingle()
  if (!link) await admin.from('operative_projects').insert({ operative_id: op.id, project_id: projectId })
  console.log(`✓ Operative ready (${op.id})`)
  return op.id
}

async function ensureDocument(companyId, projectId) {
  const { data: existing } = await admin.from('documents')
    .select('id').eq('project_id', projectId).eq('title', 'E2E RAMS').maybeSingle()
  if (existing) { console.log(`✓ Document exists: (${existing.id})`); return existing.id }
  // file_url null → SignDocument lets the operative sign immediately (no "read" gate).
  const { data: doc, error } = await admin.from('documents').insert({
    project_id: projectId, company_id: companyId, title: 'E2E RAMS', file_url: null, file_name: null,
  }).select().single()
  if (error) { console.error('document insert failed:', error.message); process.exit(1) }
  console.log(`✓ Created document (${doc.id})`)
  return doc.id
}

async function ensureSuperAdmin(companyId) {
  // A dedicated super_admin so the SuperAdminPanel / api/superadmin endpoint
  // happy path is E2E-testable. verifySuperAdmin matches on the managers table:
  // email + role='super_admin' + is_active=true.
  const saEmail = (process.env.E2E_SUPERADMIN_EMAIL || 'e2e-superadmin@coresite.io').toLowerCase()
  const saPass = process.env.E2E_SUPERADMIN_PASSWORD || 'E2eSuper2026!'

  const created = await admin.auth.admin.createUser({
    email: saEmail, password: saPass, email_confirm: true,
    user_metadata: { name: 'E2E Super Admin', role: 'super_admin' },
  })
  if (created.error && !/already.+(registered|exists)/i.test(created.error.message)) {
    console.error('superadmin createUser failed:', created.error.message); process.exit(1)
  }

  const { data: mgr } = await admin.from('managers').select('id, role, is_active').eq('email', saEmail).maybeSingle()
  if (!mgr) {
    const ins = await admin.from('managers').insert({
      name: 'E2E Super Admin', email: saEmail, role: 'super_admin', company_id: companyId, is_active: true, project_ids: [],
    })
    if (ins.error) { console.error('superadmin manager insert failed:', ins.error.message); process.exit(1) }
  } else if (mgr.role !== 'super_admin' || !mgr.is_active) {
    await admin.from('managers').update({ role: 'super_admin', is_active: true }).eq('id', mgr.id)
  }
  console.log(`✓ Super admin ready (${saEmail})`)
  return saEmail
}

const user = await signInOrSignUp()
const companyId = await ensureCompany(user)
const superAdminEmail = await ensureSuperAdmin(companyId)
// Put company_id in the auth user's metadata so the app's setupFromAuth writes a
// complete manager_data (company_id) immediately on login — many pages need it.
await admin.auth.admin.updateUserById(user.id, {
  user_metadata: { name: 'E2E Admin', role: 'admin', company_id: companyId },
})
const projectId = await ensureProject(companyId)
// Give the manager access to the project (empty project_ids = no access in the UI).
await admin.from('managers').update({ project_ids: [projectId] }).eq('email', EMAIL)
const drawingId = await ensureDrawing(companyId, projectId)
const operativeId = await ensureOperative(companyId, projectId)
const documentId = await ensureDocument(companyId, projectId)

console.log('\n=== E2E account ready ===')
console.log(`email:        ${EMAIL}`)
console.log(`superadmin:   ${superAdminEmail}`)
console.log(`user_id:      ${user.id}`)
console.log(`company_id:   ${companyId}`)
console.log(`project_id:   ${projectId}`)
console.log(`drawing_id:   ${drawingId}`)
console.log(`operative_id: ${operativeId}`)
console.log(`document_id:  ${documentId}`)
process.exit(0)
