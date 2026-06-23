import { createClient } from '@supabase/supabase-js'

/**
 * Create a confirmed Supabase Auth account for a self-service company signup
 * (server-side, service-role). Closes §5.20.
 *
 * Why: "Confirm email" is ON (mailer_autoconfirm=false, defense-in-depth retained
 * after §5.19 PR5 enforce). With it on, the client `supabase.auth.signUp()` returns
 * a user but NO session, and an immediate `signInWithPassword` fails with
 * "Email not confirmed" — self-service signup throws and orphans an unconfirmed
 * auth user. This endpoint sets `email_confirm:true` so the new admin can sign in
 * immediately, while Confirm-email stays ON.
 *
 * Public path — security guardrails:
 * - NEVER modifies an EXISTING auth user (no password reset / re-confirm / metadata
 *   change). Returns 409 instead, so this cannot be used for account takeover.
 *   (Contrast create-company-admin.js, which DOES reset existing users — but that is
 *   super-admin-gated; a public path must not.)
 * - Creates ONLY the auth user, with role:'admin' metadata (parity with the prior
 *   client signUp). It does NOT write any profiles/managers row — the client creates
 *   the company + profile + managers under its own RLS session after signing in.
 *   Post-§5.19-enforce, RLS resolves the tenant via auth.uid()→profiles/managers
 *   (NOT the email claim), so a bare confirmed user with no profile maps to a NULL
 *   company and can read/write nothing cross-tenant — bypassing email-ownership proof
 *   grants no tenant data. The role:'admin' metadata is not trusted by RLS.
 *
 * Known residual (out of scope, logged): no rate-limit/captcha on this public
 * service-role path (shared gap with create-operative-account.js / demo-request.js).
 */

/**
 * Find an auth user by email, paging through listUsers (§4.9 — a bare listUsers()
 * returns only the first page, and we already have >50 auth users).
 * Returns { user } | { user: null } | { error }.
 */
async function findAuthUserByEmail(supabase, email) {
  const target = (email || '').toLowerCase()
  for (let page = 1; page <= 50; page++) {   // safety cap (~50k users)
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return { error }
    const users = data?.users || []
    const found = users.find(u => u.email?.toLowerCase() === target)
    if (found) return { user: found }
    if (users.length === 0) break
  }
  return { user: null }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, password, name } = req.body || {}

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing required fields: email, password' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  const cleanEmail = email.trim().toLowerCase()

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server config missing' })
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Never touch an existing account on this public path (no takeover) — §5.20.
  const { user: existingUser, error: lookupErr } = await findAuthUserByEmail(supabase, cleanEmail)
  if (lookupErr) {
    return res.status(500).json({ error: `Account lookup failed: ${lookupErr.message}` })
  }
  if (existingUser) {
    return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' })
  }

  // Create the confirmed auth user. email_confirm:true keeps Confirm-email ON as
  // defense-in-depth while letting the new admin sign in immediately. role:'admin'
  // metadata matches the prior client signUp; it is NOT trusted by RLS (auth.uid only).
  const { data, error } = await supabase.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
    user_metadata: { name: (name || '').trim(), role: 'admin' },
  })
  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.status(200).json({ userId: data.user?.id })
}
