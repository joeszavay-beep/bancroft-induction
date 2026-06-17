/**
 * READ-ONLY audit for the durable §5.19 fix (operatives.auth_user_id).
 *
 * Phase 0: report how operative identity maps to auth users so the owner can
 * settle the "one auth_user_id per ACTIVE operative record" constraint and
 * resolve the unlinkable rows MANUALLY (no guessed mappings).
 *
 * SECURITY: Node-only, uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS for a
 * cross-tenant read. Performs ZERO writes — only .select() and
 * auth.admin.listUsers() (both reads). Grep this file: no insert/update/
 * delete/upsert/createUser/updateUser/deleteUser anywhere.
 *
 * Run:  node scripts/audit-operative-auth-linkage.js
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const URL = process.env.VITE_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !SERVICE) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

const norm = (e) => (e || '').trim().toLowerCase()
const MARKER_RE = /status|active|archiv|left|end_date|deactiv|inactive|leaver|depart|terminat|employ|onboard/i

const main = async () => {
  // ---- operatives (all tenants) ----
  const { data: ops, error: opErr } = await admin.from('operatives').select('*')
  if (opErr) { console.error('operatives read failed:', opErr.message); process.exit(1) }

  // ---- companies (id -> name) ----
  const { data: companies } = await admin.from('companies').select('id, name')
  const coName = (id) => (companies?.find((c) => c.id === id)?.name) || (id ? id.slice(0, 8) : '∅NULL')

  // ---- auth users (paged) ----
  const users = []
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) { console.error('listUsers failed:', error.message); break }
    if (!data?.users?.length) break
    users.push(...data.users)
    if (data.users.length < 1000) break
  }
  const authByEmail = new Map(users.map((u) => [norm(u.email), u]))

  const cols = ops.length ? Object.keys(ops[0]) : []
  const markerCols = cols.filter((c) => MARKER_RE.test(c))

  console.log('='.repeat(72))
  console.log('OPERATIVE ↔ AUTH LINKAGE AUDIT  (read-only)')
  console.log('='.repeat(72))
  console.log(`operatives rows:        ${ops.length}`)
  console.log(`distinct companies:     ${new Set(ops.map((o) => o.company_id)).size}`)
  console.log(`auth users (total):     ${users.length}`)
  console.log(`operatives columns:     ${cols.length}`)
  console.log(`  -> ${cols.join(', ')}`)
  console.log()

  // ---- candidate active/historical markers ----
  console.log('-'.repeat(72))
  console.log('CANDIDATE active/historical MARKER COLUMNS')
  console.log('-'.repeat(72))
  if (!markerCols.length) {
    console.log('NONE — no column matching status/active/archived/left/end_date/etc.')
    console.log('=> There is currently no active-vs-historical marker on operatives.')
  } else {
    for (const c of markerCols) {
      const dist = {}
      for (const o of ops) { const v = String(o[c]); dist[v] = (dist[v] || 0) + 1 }
      console.log(`${c}:`)
      for (const [v, n] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${v.slice(0, 30).padEnd(30)} ${n}`)
      }
    }
  }
  console.log()

  // ---- group operatives by normalised email ----
  const byEmail = new Map()
  for (const o of ops) {
    const e = norm(o.email)
    if (!e) continue
    if (!byEmail.has(e)) byEmail.set(e, [])
    byEmail.get(e).push(o)
  }

  // records-per-email distribution (how many PEOPLE have multiple records)
  const distRPE = {}
  for (const [, arr] of byEmail) distRPE[arr.length] = (distRPE[arr.length] || 0) + 1
  console.log('-'.repeat(72))
  console.log('RECORDS-PER-EMAIL DISTRIBUTION (people with multiple operative records)')
  console.log('-'.repeat(72))
  for (const [n, count] of Object.entries(distRPE).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  ${n} record(s): ${count} email(s)`)
  }
  console.log()

  // ---- 2.A duplicate-email operatives ----
  const dupEmails = [...byEmail.entries()].filter(([, a]) => a.length > 1)
  console.log('='.repeat(72))
  console.log(`2.A  DUPLICATE-EMAIL operatives  (${dupEmails.length} email(s), ambiguous → MANUAL)`)
  console.log('='.repeat(72))
  for (const [email, arr] of dupEmails) {
    const sameCo = new Set(arr.map((o) => o.company_id)).size === 1
    const hasAuth = authByEmail.has(email)
    console.log(`\n  ${email}   [${arr.length} rows | ${sameCo ? 'SAME-company (likely true dupe → merge?)' : 'MULTI-company (lifecycle trail)'} | auth:${hasAuth ? 'yes' : 'NO'}]`)
    for (const o of arr.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
      const markers = markerCols.map((c) => `${c}=${o[c]}`).join(' ')
      console.log(`     - op ${o.id}  co=${coName(o.company_id).slice(0, 22).padEnd(22)} created=${String(o.created_at).slice(0, 10)} dob=${o.date_of_birth ? 'set' : 'null'}  ${markers}`)
    }
  }
  console.log()

  // ---- 2.B operatives whose email has no auth account ----
  const noAuth = ops.filter((o) => norm(o.email) && !authByEmail.has(norm(o.email)))
  console.log('='.repeat(72))
  console.log(`2.B  NO AUTH ACCOUNT yet  (${noAuth.length} rows — link at setup, not in backfill)`)
  console.log('='.repeat(72))
  for (const o of noAuth) {
    console.log(`     - op ${o.id}  ${norm(o.email).padEnd(32)} co=${coName(o.company_id)}  dob=${o.date_of_birth ? 'activated' : 'unactivated'}`)
  }
  console.log()

  // ---- 2.C null/blank email ----
  const noEmail = ops.filter((o) => !norm(o.email))
  console.log('='.repeat(72))
  console.log(`2.C  NULL / BLANK email  (${noEmail.length} rows — cannot match → MANUAL)`)
  console.log('='.repeat(72))
  for (const o of noEmail) {
    console.log(`     - op ${o.id}  name="${o.name}"  co=${coName(o.company_id)}`)
  }
  console.log()

  // ---- 2.D auth user matched by >1 operative ----
  console.log('='.repeat(72))
  console.log('2.D  AUTH USERS matched by >1 operative  (multi-record people)')
  console.log('='.repeat(72))
  let multi = 0
  for (const [email, arr] of dupEmails) {
    if (!authByEmail.has(email)) continue
    multi++
    console.log(`     - auth ${authByEmail.get(email).id}  ${email}  -> ${arr.length} operative rows`)
  }
  if (!multi) console.log('     (none)')
  console.log()

  // ---- clean auto-mappable set (1:1, unique email, has auth) ----
  const dupSet = new Set(dupEmails.map(([e]) => e))
  const clean = ops.filter((o) => norm(o.email) && !dupSet.has(norm(o.email)) && authByEmail.has(norm(o.email)))
  console.log('='.repeat(72))
  console.log('SUMMARY')
  console.log('='.repeat(72))
  console.log(`  auto-mappable (1:1 unique email w/ auth):  ${clean.length}`)
  console.log(`  duplicate-email rows (manual):             ${dupEmails.reduce((n, [, a]) => n + a.length, 0)} across ${dupEmails.length} emails`)
  console.log(`  no auth account (link at setup):           ${noAuth.length}`)
  console.log(`  null/blank email (manual):                 ${noEmail.length}`)
  console.log(`  TOTAL operatives:                          ${ops.length}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
