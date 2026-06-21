import { test, expect } from '@playwright/test'
import { getIds, getDb, getAnonDb } from './helpers/db.js'
import { createDisposableOperative, markHistorical, cleanupByEmail, sweepDisposable } from './helpers/operatives.js'

/**
 * §5.22 PR3b — rejoin. A worker who left (historical record) can be re-added to
 * the company as a NEW, separate active record sharing the same email; the
 * historical record is retained and must not block the re-add, and login routing
 * resolves the ACTIVE record.
 */
test.describe.serial('Operative rejoin after leaving', () => {
  let ids, db, left, rejoined

  test.beforeAll(async () => {
    ids = await getIds()
    db = await getDb()
    await sweepDisposable()
    // A prior leaver: created then marked historical.
    left = await createDisposableOperative(ids.companyId, ids.projectId, ids.documentId, { withAuth: true })
    await markHistorical(left.id)
  })

  test.afterAll(async () => {
    if (left) await cleanupByEmail(left.email, left.authUserId)
  })

  test('the active-email guard ignores the historical record (re-add not blocked)', async () => {
    // Mirrors the app's duplicate-email guard (AddNewWorker.jsx:275), which now
    // filters left_at IS NULL — so a left worker no longer blocks their own rejoin.
    const { data } = await db.from('operatives')
      .select('name').ilike('email', left.email).is('left_at', null).limit(1)
    expect(data?.length || 0, 'no ACTIVE operative with this email → re-add allowed').toBe(0)
  })

  test('re-adding the same email creates a new active record alongside the historical one', async () => {
    rejoined = await createDisposableOperative(ids.companyId, ids.projectId, ids.documentId, {
      email: left.email, name: `E2E Rejoined ${Date.now().toString(36)}`,
    })

    // Both records coexist: exactly one historical + one active, same email.
    const { data: rows } = await db.from('operatives')
      .select('id, left_at').ilike('email', left.email)
    expect(rows?.length, 'historical + active records coexist').toBe(2)
    expect(rows.filter(r => r.left_at === null).length, 'exactly one active').toBe(1)
    expect(rows.filter(r => r.left_at !== null).length, 'exactly one historical').toBe(1)
  })

  test('login routing resolves the active record, not the historical one', async () => {
    const anon = getAnonDb()
    const { data: route } = await anon.rpc('resolve_login_route', { p_email: left.email })
    expect(route?.has_worker, 'rejoined worker routes').toBe(true)
    expect(route?.worker_name, 'routing resolves the ACTIVE record').toBe(rejoined.name)
  })
})
