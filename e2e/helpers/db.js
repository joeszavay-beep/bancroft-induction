import { createClient } from '@supabase/supabase-js'

/**
 * Node-side Supabase client for re-fetch verification in specs.
 *
 * Uses the ANON key signed in as the E2E test user — deliberately NOT the
 * service-role key — so reads see exactly what the app itself is allowed to
 * see under RLS. (Service-role usage is confined to scripts/seed-e2e.js.)
 */
let _db = null
let _ids = null

export async function getDb() {
  if (_db) return _db
  const url = process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('Supabase env vars missing — is .env loaded?')

  const db = createClient(url, anon, { auth: { persistSession: false } })
  const { data, error } = await db.auth.signInWithPassword({
    email: process.env.E2E_EMAIL,
    password: process.env.E2E_PASSWORD,
  })
  if (error || !data?.user) throw new Error(`db helper sign-in failed: ${error?.message}`)
  _db = db
  return _db
}

/** Resolve the test account's user/company/project ids at runtime (never hardcode). */
export async function getIds() {
  if (_ids) return _ids
  const db = await getDb()
  const { data: { user } } = await db.auth.getUser()
  const { data: profile, error: pErr } = await db
    .from('profiles').select('company_id').eq('id', user.id).single()
  if (pErr) throw new Error(`profile lookup failed: ${pErr.message}`)
  const { data: project, error: prErr } = await db
    .from('projects').select('id').eq('company_id', profile.company_id).eq('name', 'E2E Site').single()
  if (prErr) throw new Error(`project lookup failed: ${prErr.message}`)
  _ids = { userId: user.id, companyId: profile.company_id, projectId: project.id }
  return _ids
}

/**
 * Re-fetch a single row for persistence assertions.
 * Returns null when no row matches (so specs can assert deletion).
 */
export async function fetchRow(table, match) {
  const db = await getDb()
  let q = db.from(table).select('*')
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
  const { data, error } = await q.maybeSingle()
  if (error) throw new Error(`fetchRow(${table}) failed: ${error.message}`)
  return data
}

/** Delete rows matching a filter — for test self-cleanup (anon client, RLS applies). */
export async function deleteRows(table, match) {
  const db = await getDb()
  let q = db.from(table).delete()
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
  const { error } = await q
  if (error) throw new Error(`deleteRows(${table}) failed: ${error.message}`)
}

/** Unique per-run marker so test rows are identifiable and cleanable. */
export function runMarker(prefix = 'E2E') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}
