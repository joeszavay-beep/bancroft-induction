// READ-ONLY — list every auth user created since a cutoff (default: start of
// 2026-06-23 UTC) with its linked profile/company/manager, so we can eyeball which
// accounts are signup test junk vs real data before any cleanup. NO writes.
//   node --env-file=.env scripts/diag-todays-signups.js [sinceISO]
import { createClient } from '@supabase/supabase-js'

const since = process.argv[2] || '2026-06-23T00:00:00Z'
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing env'); process.exit(1) }
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

// All auth users created since cutoff (paged)
let recent = []
for (let page = 1; page <= 50; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) { console.error('listUsers:', error.message); break }
  const users = data?.users || []
  recent.push(...users.filter(u => u.created_at >= since))
  if (users.length === 0) break
}
recent.sort((a, b) => a.created_at.localeCompare(b.created_at))

const rows = []
for (const u of recent) {
  const { data: profs } = await db.from('profiles').select('company_id, role').eq('id', u.id)
  const companyId = profs?.[0]?.company_id
  const { data: cos } = companyId ? await db.from('companies').select('name, company_type, contact_email').eq('id', companyId) : { data: [] }
  const { count: mgrCount } = await db.from('managers').select('*', { count: 'exact', head: true }).ilike('email', u.email || '')
  rows.push({
    email: u.email,
    authId: u.id,
    confirmed: !!u.email_confirmed_at,
    name_meta: u.user_metadata?.name,
    role: profs?.[0]?.role || u.user_metadata?.role,
    company_id: companyId || '(no profile)',
    company_name: cos?.[0]?.name || '—',
    company_type: cos?.[0]?.company_type || '—',
    managers: mgrCount ?? 0,
    created_at: u.created_at,
  })
}

console.log(`\n=== auth users created since ${since} (${rows.length}) ===`)
console.table(rows)
console.log('\n(read-only — no rows were modified)')
