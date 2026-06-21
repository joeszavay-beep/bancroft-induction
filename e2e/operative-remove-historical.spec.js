import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getIds, getDb, getAnonDb, fetchRow } from './helpers/db.js'
import { createDisposableOperative, cleanupByEmail, sweepDisposable } from './helpers/operatives.js'

/**
 * §5.22 PR3b — "remove operative" is now MARK-HISTORICAL, not hard-delete.
 *
 * Proves, end-to-end against the now-guarded prod DB, that removing an operative
 * via the manager UI:
 *   - sets left_at + clears auth_user_id (does NOT delete the row),
 *   - retains the compliance signature (history survives),
 *   - revokes the operative's own RLS access (the Tier-1 left_at guard) and
 *     delists them from login routing,
 *   - drops them from the active list but keeps them in the read-only Past tab.
 *
 * Uses a throwaway operative (NOT the shared E2E Worker, which the other specs
 * still need active) and cleans it up afterward, restoring the row baseline.
 */
test.describe.serial('Operative remove → mark historical', () => {
  let ids, db, op

  test.beforeAll(async () => {
    ids = await getIds()
    db = await getDb()
    await sweepDisposable() // clear any orphans from a prior crashed run
    op = await createDisposableOperative(ids.companyId, ids.projectId, ids.documentId, {
      withAuth: true, withSignature: true,
    })
  })

  test.afterAll(async () => {
    if (op) await cleanupByEmail(op.email, op.authUserId)
  })

  test('baseline: while active, the operative can read its own record', async () => {
    const c = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    })
    const { error: sErr } = await c.auth.signInWithPassword({ email: op.email, password: op.password })
    expect(sErr, sErr?.message).toBeFalsy()
    const { data } = await c.from('operatives').select('id').eq('id', op.id)
    expect(data?.length, 'active operative should resolve its own row under RLS').toBe(1)
    await c.auth.signOut()
  })

  test('manager marks the operative as left via the workers list', async ({ page }) => {
    page.on('dialog', (d) => d.accept()) // accept the confirm()
    await page.goto('/app/workers')

    const row = page.locator('tr').filter({ hasText: op.name })
    await expect(row, 'the active disposable operative should be listed').toBeVisible({ timeout: 15_000 })
    await row.getByTitle('Remove worker').click()

    // Row is marked historical: left_at set, login detached, row NOT deleted.
    await expect(async () => {
      const row2 = await fetchRow('operatives', { id: op.id })
      expect(row2, 'row must still exist (not deleted)').not.toBeNull()
      expect(row2.left_at, 'left_at should be set').not.toBeNull()
      expect(row2.auth_user_id, 'auth_user_id should be detached').toBeNull()
    }).toPass({ timeout: 12_000 })
  })

  test('compliance signature is retained (history survives the removal)', async () => {
    const sig = await fetchRow('signatures', { id: op.signatureId })
    expect(sig, 'the operative’s signature must still exist after removal').not.toBeNull()
    expect(sig.operative_id).toBe(op.id)
  })

  test('removed operative is RLS-denied and delisted from login routing', async () => {
    // The operative can still authenticate, but resolves to a historical row →
    // the left_at guard returns zero rows.
    const c = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    })
    const { error: sErr } = await c.auth.signInWithPassword({ email: op.email, password: op.password })
    expect(sErr, sErr?.message).toBeFalsy()
    const { data } = await c.from('operatives').select('id').eq('id', op.id)
    expect(data?.length || 0, 'historical operative must read zero rows').toBe(0)
    await c.auth.signOut()

    // Pre-auth login routing no longer offers the worker path for this email.
    const anon = getAnonDb()
    const { data: route } = await anon.rpc('resolve_login_route', { p_email: op.email })
    expect(route?.has_worker, 'resolve_login_route should not offer a worker').toBe(false)
  })

  test('delisted from the active list, present in the read-only Past tab', async ({ page }) => {
    await page.goto('/app/workers')
    // Active (default): the removed operative is gone.
    await expect(page.locator('tr').filter({ hasText: op.name })).toHaveCount(0, { timeout: 15_000 })
    // Past tab: the retained record is visible.
    await page.getByRole('button', { name: /^past/i }).click()
    await expect(page.locator('tr').filter({ hasText: op.name })).toBeVisible({ timeout: 10_000 })
  })
})
