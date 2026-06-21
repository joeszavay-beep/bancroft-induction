import { test, expect } from '@playwright/test'
import { getIds, getAccessToken } from './helpers/db.js'
import { getAdmin, createDisposableOperative, cleanupByEmail, sweepDisposable } from './helpers/operatives.js'

/**
 * §5.22 PR3b — GDPR erasure is the ONLY hard-delete, super-admin only. Unlike the
 * everyday "remove" (mark-historical), this permanently destroys the operative,
 * its compliance child data, AND the linked auth login (the §4.9 fix: delete via
 * the returned auth_user_id, not the broken first-page listUsers scan).
 *
 * Driven at the endpoint (api/delete-operative) with a real super-admin token —
 * the SuperAdminPanel UI is cross-company and out of scope here; this proves the
 * server logic + cascade + auth cleanup.
 */
test.describe.serial('Operative GDPR erase (super-admin)', () => {
  let ids, op, admin

  test.beforeAll(async () => {
    ids = await getIds()
    admin = getAdmin()
    await sweepDisposable()
    op = await createDisposableOperative(ids.companyId, ids.projectId, ids.documentId, {
      withAuth: true, withSignature: true,
    })
  })

  test.afterAll(async () => {
    if (op) await cleanupByEmail(op.email, op.authUserId) // idempotent — row should already be gone
  })

  test('super-admin erase destroys the operative, its compliance data, and the login', async ({ request }) => {
    const superEmail = (process.env.E2E_SUPERADMIN_EMAIL || 'e2e-superadmin@coresite.io').toLowerCase()
    const superPass = process.env.E2E_SUPERADMIN_PASSWORD || 'E2eSuper2026!'
    const token = await getAccessToken(superEmail, superPass)
    expect(token, 'super-admin should authenticate').toBeTruthy()

    const res = await request.post('/api/delete-operative', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { operativeId: op.id },
    })
    expect(res.ok(), `delete-operative should succeed (status ${res.status()})`).toBeTruthy()
    const body = await res.json()
    expect(body.success, JSON.stringify(body)).toBe(true)

    // Verified with the service-role client (a hard delete must be physically gone,
    // not merely RLS-hidden).
    const { data: gone } = await admin.from('operatives').select('id').eq('id', op.id).maybeSingle()
    expect(gone, 'operative row must be physically deleted').toBeNull()

    const { data: sigs } = await admin.from('signatures').select('id').eq('operative_id', op.id)
    expect(sigs?.length || 0, 'compliance child data must be erased').toBe(0)

    // The linked auth login must be deleted (§4.9 — via auth_user_id, not listUsers).
    const { data: authUser } = await admin.auth.admin.getUserById(op.authUserId)
    expect(authUser?.user ?? null, 'the auth login must be deleted').toBeNull()
  })
})
