import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getIds, getDb, getAnonDb, getAccessToken, fetchRow } from './helpers/db.js'
import { getAdmin, createDisposableOperative, markHistorical, cleanupByEmail, sweepDisposable } from './helpers/operatives.js'

/**
 * Reactivate a worker who returned (inverse of mark-as-left). The same record
 * goes active again (continuous history), the login is re-linked, and prior
 * document signatures are invalidated so they must re-induct.
 */
test.describe.serial('Operative reactivate', () => {
  let ids, db, op

  test.beforeAll(async () => {
    ids = await getIds()
    db = await getDb()
    await sweepDisposable()
    op = await createDisposableOperative(ids.companyId, ids.projectId, ids.documentId, {
      withAuth: true, withSignature: true,
    })
    await markHistorical(op.id) // a past leaver, ready to return
  })

  test.afterAll(async () => {
    if (op) await cleanupByEmail(op.email, op.authUserId)
  })

  test('manager reactivates the worker from the Past tab', async ({ page }) => {
    page.on('dialog', (d) => d.accept())
    await page.goto('/app/workers')
    await page.getByRole('button', { name: /^past/i }).click()

    const row = page.locator('tr').filter({ hasText: op.name })
    await expect(row, 'the past worker should be listed').toBeVisible({ timeout: 15_000 })
    await row.getByTitle('Reactivate worker').click()

    // left_at cleared + login re-linked; same row, not a new one.
    await expect(async () => {
      const row2 = await fetchRow('operatives', { id: op.id })
      expect(row2, 'same record reactivated').not.toBeNull()
      expect(row2.left_at, 'left_at cleared').toBeNull()
      expect(row2.auth_user_id, 'login re-linked').toBe(op.authUserId)
    }).toPass({ timeout: 12_000 })
  })

  test('reactivated worker is back in the active list', async ({ page }) => {
    await page.goto('/app/workers')
    await expect(page.locator('tr').filter({ hasText: op.name })).toBeVisible({ timeout: 15_000 })
  })

  test('prior inductions are invalidated (must re-sign)', async () => {
    const sig = await fetchRow('signatures', { id: op.signatureId })
    expect(sig, 'signature row retained').not.toBeNull()
    expect(sig.invalidated, 'prior signature invalidated → re-induction required').toBe(true)
  })

  test('reactivated worker can read again, and login routing offers the worker path', async () => {
    const c = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    })
    const { error: sErr } = await c.auth.signInWithPassword({ email: op.email, password: op.password })
    expect(sErr, sErr?.message).toBeFalsy()
    const { data } = await c.from('operatives').select('id').eq('id', op.id)
    expect(data?.length, 'active again → resolves under RLS').toBe(1)
    await c.auth.signOut()

    const { data: route } = await getAnonDb().rpc('resolve_login_route', { p_email: op.email })
    expect(route?.has_worker, 'reactivated worker routes').toBe(true)
  })
})

test.describe('Operative reactivate — blocked when the login is active elsewhere', () => {
  let ids, admin, leaver, elsewhere

  test.beforeAll(async () => {
    ids = await getIds()
    admin = getAdmin()
    await sweepDisposable()
    // A returner whose login is already active on another record.
    leaver = await createDisposableOperative(ids.companyId, ids.projectId, ids.documentId, { withAuth: true })
    await markHistorical(leaver.id)
    // Simulate the same login being active elsewhere by linking it to a second active record.
    elsewhere = await createDisposableOperative(ids.companyId, ids.projectId, ids.documentId, {})
    await admin.from('operatives').update({ auth_user_id: leaver.authUserId }).eq('id', elsewhere.id)
  })

  test.afterAll(async () => {
    if (leaver) await cleanupByEmail(leaver.email, leaver.authUserId)
    if (elsewhere) await cleanupByEmail(elsewhere.email)
  })

  test('reactivation is refused with 409 (one active login per person)', async ({ request }) => {
    const token = await getAccessToken(process.env.E2E_EMAIL, process.env.E2E_PASSWORD)
    const res = await request.post('/api/operative-reactivate', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { operativeId: leaver.id },
    })
    expect(res.status(), 'should be refused').toBe(409)

    // And the leaver stays historical (no partial reactivation).
    const row = await fetchRow('operatives', { id: leaver.id })
    expect(row.left_at, 'still historical').not.toBeNull()
  })
})
