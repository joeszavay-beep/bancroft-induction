import { test, expect } from '@playwright/test'
import { getDb } from './helpers/db.js'

/**
 * The /api/superadmin endpoint must reject anyone who isn't a super_admin.
 * The E2E account is a normal admin/manager (not super_admin), so every action
 * must come back 401 from verifySuperAdmin — proving the cross-tenant data path
 * is gated server-side (not by the client role check the lockdown removes).
 *
 * (Happy-path super-admin behaviour needs a super_admin account — see
 * RLS-REMEDIATION-PLAN.md. This spec covers the authorisation gate.)
 */
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('superadmin endpoint auth gate', () => {
  test('rejects a non-super-admin (and an anonymous) caller', async ({ request }) => {
    const db = await getDb()
    const { data: { session } } = await db.auth.getSession()
    const token = session?.access_token
    expect(token, 'need an authenticated session token for the test user').toBeTruthy()

    // Authenticated, but NOT super_admin → 401.
    const authed = await request.post('/api/superadmin', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { action: 'overview' },
    })
    expect(authed.status(), 'a non-super-admin must be rejected').toBe(401)

    // No token at all → 401.
    const anon = await request.post('/api/superadmin', {
      headers: { 'Content-Type': 'application/json' },
      data: { action: 'overview' },
    })
    expect(anon.status(), 'an unauthenticated caller must be rejected').toBe(401)
  })
})
