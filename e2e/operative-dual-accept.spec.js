import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getIds } from './helpers/db.js'
import {
  getAdmin, createDisposableOperative, createDisposableCompany,
  deleteDisposableCompany, cleanupByEmail, sweepDisposable,
} from './helpers/operatives.js'

/**
 * §5.19 PR4 — DUAL-ACCEPT proof (this is the operative-escalation coverage).
 *
 * The three operative RLS helpers now resolve identity via
 *   COALESCE( auth_user_id = auth.uid() AND left_at IS NULL,   -- non-forgeable, first
 *             interim user_metadata.operative_id + verified email + left_at )  -- fallback
 *
 * Two properties must hold SIMULTANEOUSLY during the transition:
 *
 *   A. LINKED operative resolves via the auth.uid() arm, so a forged
 *      user_metadata.operative_id is INERT — no cross-tenant escalation, and the
 *      operative still reads its own company. The forge target deliberately
 *      SHARES the attacker's email (the §5.17 same-email residual that the interim
 *      email-guard does NOT close) → escalation is prevented ONLY by auth.uid()
 *      resolving first. This is exactly what PR4 adds over the interim fix.
 *
 *   B. UNLINKED operative (auth_user_id NULL, not yet backfilled) still resolves
 *      via the interim fallback arm → nobody is locked out mid-transition.
 *
 * RLS-resolution probe (same as the lifecycle specs): sign in AS the operative
 * with a fresh anon client, then `operatives.select(id).eq(id, …)` — 1 row means
 * RLS resolved them into that company; 0 means it did not.
 */

const newClient = () =>
  createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })

test.describe.serial('§5.19 PR4 dual-accept — Path A: linked resolves via auth.uid() (forge inert)', () => {
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
    // cleanupByEmail removes BOTH operative rows sharing the email + the auth user.
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

  test('forging user_metadata.operative_id to the victim is INERT — auth.uid() wins', async () => {
    // Forge the self-writable claim to point at the victim (same email, other co).
    const upd = await admin.auth.admin.updateUserById(attacker.authUserId, {
      user_metadata: { name: attacker.name, role: 'operative', operative_id: victim.id },
    })
    expect(upd.error, upd.error?.message).toBeFalsy()

    // Fresh sign-in → fresh JWT carrying the forged metadata.
    const c = newClient()
    const { error } = await c.auth.signInWithPassword({ email: attacker.email, password: attacker.password })
    expect(error, error?.message).toBeFalsy()

    // Despite the forged metadata + MATCHING email (which would satisfy the
    // interim arm), the victim company stays unreadable…
    const cross = await c.from('operatives').select('id').eq('id', victim.id)
    expect(cross.data?.length || 0, 'forged victim must remain invisible (auth.uid() resolves first)').toBe(0)

    // …and the attacker still resolves to its OWN record (not locked out).
    const own = await c.from('operatives').select('id').eq('id', attacker.id)
    expect(own.data?.length, 'own record still resolves via auth.uid()').toBe(1)
    await c.auth.signOut()
  })
})

test.describe('§5.19 PR4 dual-accept — Path B: unlinked resolves via the interim fallback', () => {
  let ids, admin, op

  test.beforeAll(async () => {
    ids = await getIds()
    admin = getAdmin()
    await sweepDisposable()
    // Create an operative WITH an auth user + user_metadata.operative_id, then
    // DETACH auth_user_id → the exact "not yet backfilled" state in transition.
    op = await createDisposableOperative(ids.companyId, ids.projectId, ids.documentId, { withAuth: true })
    const { error } = await admin.from('operatives').update({ auth_user_id: null }).eq('id', op.id)
    if (error) throw new Error(`detach auth_user_id failed: ${error.message}`)
  })

  test.afterAll(async () => {
    if (op) await cleanupByEmail(op.email, op.authUserId)
  })

  test('unlinked operative (auth_user_id NULL) still resolves via the interim arm', async () => {
    const c = newClient()
    const { error } = await c.auth.signInWithPassword({ email: op.email, password: op.password })
    expect(error, error?.message).toBeFalsy()

    const own = await c.from('operatives').select('id').eq('id', op.id)
    expect(own.data?.length, 'interim fallback resolves the unlinked operative — nobody locked out').toBe(1)
    await c.auth.signOut()
  })
})
