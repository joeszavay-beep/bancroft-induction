/**
 * Migration: Manager Plaintext Passwords → Supabase Auth
 *
 * For each manager in the `managers` table that has a plaintext password:
 * 1. Creates a Supabase Auth account (or updates existing) with their email + existing password
 * 2. Creates a `profiles` entry if one doesn't exist
 * 3. Clears the password from the managers table
 *
 * Run: node scripts/migrate-manager-passwords.js --dry-run
 * Run: node scripts/migrate-manager-passwords.js
 *
 * Environment variables required:
 *   SUPABASE_URL or VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Options:
 *   --dry-run     Show what would happen without making changes
 *
 * Safety:
 *   - Duplicate emails (same email across multiple companies) are SKIPPED, not resolved.
 *     These are flagged at the top of the output for manual handling.
 *   - Passwords shorter than 6 chars (Supabase Auth minimum) are SKIPPED.
 *   - Managers created via Signup.jsx (no password in managers table) are NOT affected.
 */

import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.argv.includes('--dry-run')

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function migrate() {
  console.log(`\n=== Manager Password Migration ===`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`)
  console.log('')

  // 1. Find all managers with a password set
  const { data: managers, error } = await supabase
    .from('managers')
    .select('id, name, email, password, role, company_id, is_active')
    .not('password', 'is', null)
    .neq('password', '')

  if (error) {
    console.error('Failed to query managers:', error.message)
    process.exit(1)
  }

  console.log(`Found ${managers.length} manager(s) with plaintext passwords.\n`)

  if (managers.length === 0) {
    console.log('Nothing to migrate.')
    return
  }

  // ─── DUPLICATE EMAIL CHECK ───
  // Group by lowercase email to find duplicates across companies
  const emailGroups = {}
  for (const mgr of managers) {
    const key = (mgr.email || '').trim().toLowerCase()
    if (!key) continue
    if (!emailGroups[key]) emailGroups[key] = []
    emailGroups[key].push(mgr)
  }

  const duplicateEmails = Object.entries(emailGroups).filter(([, group]) => group.length > 1)
  const duplicateIds = new Set()

  if (duplicateEmails.length > 0) {
    console.log(`╔══════════════════════════════════════════════════════════════╗`)
    console.log(`║  ⚠  DUPLICATE EMAILS FOUND — THESE WILL BE SKIPPED         ║`)
    console.log(`╚══════════════════════════════════════════════════════════════╝`)
    console.log(``)
    console.log(`The following emails appear on multiple manager records (different`)
    console.log(`companies). These are SKIPPED to avoid associating the auth account`)
    console.log(`with the wrong company. Handle them manually via AdminDashboard.`)
    console.log(``)

    for (const [email, group] of duplicateEmails) {
      console.log(`  Email: ${email}`)
      for (const mgr of group) {
        console.log(`    - ${mgr.name} (${mgr.role}) — company_id: ${mgr.company_id}`)
        duplicateIds.add(mgr.id)
      }
      console.log(``)
    }

    console.log(`Total duplicate records: ${duplicateIds.size} (across ${duplicateEmails.length} email(s))`)
    console.log(`─────────────────────────────────────────────────────────────────\n`)
  } else {
    console.log(`No duplicate emails found across companies.\n`)
  }

  // ─── PROCESS EACH MANAGER ───
  const results = { success: [], skipped: [], failed: [] }

  for (const mgr of managers) {
    const label = `${mgr.name} <${mgr.email}> (${mgr.role}, company ${mgr.company_id})`
    console.log(`Processing: ${label}`)

    // Skip: missing fields
    if (!mgr.email || !mgr.password) {
      console.log(`  [SKIP] Missing email or password`)
      results.skipped.push({ ...mgr, reason: 'missing email or password' })
      continue
    }

    // Skip: duplicate email
    if (duplicateIds.has(mgr.id)) {
      console.log(`  [SKIP] Duplicate email — needs manual handling`)
      results.skipped.push({ ...mgr, reason: 'duplicate email across companies' })
      continue
    }

    // Skip: password too short for Supabase Auth
    if (mgr.password.length < 6) {
      console.log(`  [SKIP] Password too short (${mgr.password.length} chars) — Supabase Auth requires 6+`)
      results.skipped.push({ ...mgr, reason: `password too short (${mgr.password.length} chars)` })
      continue
    }

    if (DRY_RUN) {
      console.log(`  [dry-run] Would create auth account + profile, clear password`)
      results.success.push(mgr)
      continue
    }

    try {
      // Check for existing auth user
      const { data: { users } } = await supabase.auth.admin.listUsers()
      const existingAuth = users?.find(u => u.email === mgr.email.trim().toLowerCase())

      let authUserId
      if (existingAuth) {
        // Update existing auth user with the plaintext password (so login continues working)
        const { error: updateErr } = await supabase.auth.admin.updateUserById(existingAuth.id, {
          password: mgr.password,
          email_confirm: true,
          user_metadata: {
            ...existingAuth.user_metadata,
            name: mgr.name,
            role: mgr.role || 'manager',
            company_id: mgr.company_id,
          },
        })
        if (updateErr) throw updateErr
        authUserId = existingAuth.id
        console.log(`  [auth] Updated existing auth user ${authUserId}`)
      } else {
        // Create new auth user
        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
          email: mgr.email.trim().toLowerCase(),
          password: mgr.password,
          email_confirm: true,
          user_metadata: {
            name: mgr.name,
            role: mgr.role || 'manager',
            company_id: mgr.company_id,
          },
        })
        if (authErr) throw authErr
        authUserId = authData.user.id
        console.log(`  [auth] Created new auth user ${authUserId}`)
      }

      // Create profile if it doesn't exist
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', authUserId)
        .single()

      if (!existingProfile) {
        const { error: profErr } = await supabase.from('profiles').insert({
          id: authUserId,
          company_id: mgr.company_id,
          name: mgr.name,
          email: mgr.email.trim().toLowerCase(),
          role: mgr.role || 'manager',
          is_active: mgr.is_active !== false,
        })
        if (profErr) {
          console.error(`  [profile] Insert failed:`, profErr.message)
        } else {
          console.log(`  [profile] Created`)
        }
      } else {
        console.log(`  [profile] Already exists`)
      }

      // Clear plaintext password from managers table
      const { error: clearErr } = await supabase
        .from('managers')
        .update({ password: null })
        .eq('id', mgr.id)

      if (clearErr) {
        console.error(`  [clear-pw] Failed:`, clearErr.message)
      } else {
        console.log(`  [clear-pw] Plaintext password cleared`)
      }

      results.success.push(mgr)
      console.log(`  [done] Migrated successfully\n`)
    } catch (err) {
      console.error(`  [error] ${err.message}\n`)
      results.failed.push({ ...mgr, error: err.message })
    }
  }

  // ─── SUMMARY ───
  console.log(`\n═══════════════════════════════════`)
  console.log(`  Migration Summary`)
  console.log(`═══════════════════════════════════`)
  console.log(`Total:       ${managers.length}`)
  console.log(`Will migrate: ${results.success.length}`)
  console.log(`Skipped:     ${results.skipped.length}`)
  console.log(`Failed:      ${results.failed.length}`)

  if (results.skipped.length > 0) {
    console.log(`\nSkipped managers (need manual attention):`)
    for (const s of results.skipped) {
      console.log(`  - ${s.name} <${s.email}> — ${s.reason}`)
    }
  }

  if (results.failed.length > 0) {
    console.log(`\nFailed managers (need manual attention):`)
    for (const f of results.failed) {
      console.log(`  - ${f.name} <${f.email}> — ${f.error}`)
    }
  }

  if (!DRY_RUN && results.success.length > 0) {
    console.log(`\nNext steps:`)
    console.log(`1. Verify migrated managers can log in at /login`)
    console.log(`2. Once confirmed, drop the password column:`)
    console.log(`   ALTER TABLE managers DROP COLUMN IF EXISTS password;`)
  }

  if (DRY_RUN) {
    console.log(`\nThis was a dry run. No changes were made.`)
    console.log(`Run without --dry-run to execute the migration.`)
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
