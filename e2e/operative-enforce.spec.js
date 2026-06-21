import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getIds } from './helpers/db.js'
import {
  getAdmin, createDisposableOperative, createDisposableCompany,
  deleteDisposableCompany, cleanupByEmail, sweepDisposable,
} from './helpers/operatives.js'

/**
 * §5.19 PR5 — ENFORCE proof (replaces operative-dual-accept.spec.js).
 *
 * The three operative RLS helpers now resolve identity via the NON-FORGEABLE
 *   auth_user_id = auth.uid() AND left_at IS NULL
 * ONLY — the interim user_metadata.operative_id + email COALESCE arm is GONE.
 *
 * Three properties must hold AFTER enforce:
 *
 *   A. LINKED operative resolves via auth.uid() and still reads its OWN company —
 *      nobody locked out.
 *
 *   B. A forged user_metadata.operative_id is INERT — even when the forge target
 *      SHARES the attacker's email (the §5.17 same-email residual). Under PR4 this
 *      was prevented by auth.uid() resolving *first*; under PR5 the metadata path
 *      does not exist at all, so it is dead regardless of ordering.
 *
 *   C. (INVERTS dual-accept Path B.) An UNLINKED-but-authenticated operative
 *      (auth_user_id NULL, user_metadata.operative_id still pointing at its own
 *      row + email matching) now resolves to ZERO rows. The interim fallback that
 *      previously carried such logins is gone. This is the behavioural twin of the
 *      Part B proof: it MUST be 0 in prod before enforce is applied, so post-enforce
 *      the only such rows are no-login demo data.
 *
 * RLS-resolution probe (same as the lifecycle specs): sign in AS the operative with
 * a fresh anon client, then `operatives.select(id).eq(id, …)` — 1 row = RLS resolved
 * them into that company; 0 = it did not.
 */

const newClient = () =>
  createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })

test.describe.serial('§5.19 PR5 enforce — Path A/B: linked resolves via auth.uid(); forged metadata is dead', () => {
  let ids, admin, attacker, victimCo, victim

  test.beforeAll(async () => {
    ids = await getIds()
    admin = getAdmin()
    await sweepDisposable()
    // Attacker: an ACTIVE, auth-LINKED operative in the E2E Test Co.
    attacker = await createDisposableOperative(ids.companyId, ids.projectId, ids.documentId, { withAuth: true })
    // Victim tenant: a SEPARATE company with an operative that SHARES the
    // attacker's email (no auth user of its own).
    victimCo = await createDisposableCompany()
    victim = await createDisposableOperative(victimCo.companyId, victimCo.projectId, ids.documentId, {
      email: attacker.email,
    })
  })

  test.afterAll(async () => {
    if (attacker) await cleanupByEmail(attacker.email, attacker.authUserId)
    if (victimCo) await deleteDisposableCompany(victimCo.companyId)
  })

  test('baseline: linked operative reads its own company, not the victim company', async () => {
    const c = newClient()
    const { error } = await c.auth.signInWithPassword({ email: attacker.email, password: attacker.password })
    expect(error, error?.message).toBeFalsy()

    const own = await c.from('operatives').select('id').eq('id', attacker.id)
    expect(own.data?.length, 'own record resolves under RLS').toBe(1)

    const cross = await c.from('operatives').select('id').eq('id', victim.id)
    expect(cross.data?.length || 0, 'victim company operative is invisible').toBe(0)
    await c.auth.signOut()
  })

  test('forging user_metadata.operative_id to the victim is INERT — metadata path is gone', async () => {
    // Forge the self-writable claim to point at the victim (same email, other co).
    const upd = await admin.auth.admin.updateUserById(attacker.authUserId, {
      user_metadata: { name: attacker.name, role: 'operative', operative_id: victim.id },
    })
    expect(upd.error, upd.error?.message).toBeFalsy()

    // Fresh sign-in → fresh JWT carrying the forged metadata.
    const c = newClient()
    const { error } = await c.auth.signInWithPassword({ email: attacker.email, password: attacker.password })
    expect(error, error?.message).toBeFalsy()

    // The forged victim stays unreadable (no metadata arm exists to resolve it)…
    const cross = await c.from('operatives').select('id').eq('id', victim.id)
    expect(cross.data?.length || 0, 'forged victim must remain invisible (no metadata arm)').toBe(0)

    // …and the attacker still resolves to its OWN record via auth.uid() (not locked out).
    const own = await c.from('operatives').select('id').eq('id', attacker.id)
    expect(own.data?.length, 'own record still resolves via auth.uid()').toBe(1)
    await c.auth.signOut()
  })
})

test.describe('§5.19 PR5 enforce — Path C: unlinked-authenticated now resolves to ZERO (interim arm gone)', () => {
  let ids, admin, op

  test.beforeAll(async () => {
    ids = await getIds()
    admin = getAdmin()
    await sweepDisposable()
    // Operative WITH an auth user + user_metadata.operative_id (pointing at its own
    // row) + email matching — i.e. the interim arm WOULD have resolved it under PR4.
    // Then DETACH auth_user_id → the "not yet linked" state.
    op = await createDisposableOperative(ids.companyId, ids.projectId, ids.documentId, { withAuth: true })
    const { error } = await admin.from('operatives').update({ auth_user_id: null }).eq('id', op.id)
    if (error) throw new Error(`detach auth_user_id failed: ${error.message}`)
  })

  test.afterAll(async () => {
    if (op) await cleanupByEmail(op.email, op.authUserId)
  })

  test('unlinked operative (auth_user_id NULL) resolves to ZERO — interim fallback removed', async () => {
    const c = newClient()
    const { error } = await c.auth.signInWithPassword({ email: op.email, password: op.password })
    expect(error, error?.message).toBeFalsy()

    // Even though metadata.operative_id points at its OWN row and the email matches
    // (the interim arm's exact precondition), enforce no longer has that arm → 0 rows.
    const own = await c.from('operatives').select('id').eq('id', op.id)
    expect(own.data?.length || 0, 'no interim fallback — unlinked login resolves nothing').toBe(0)
    await c.auth.signOut()
  })
})
