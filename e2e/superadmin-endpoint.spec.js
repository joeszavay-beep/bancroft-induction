import { test, expect } from '@playwright/test'
import { getDb, getIds, getAccessToken } from './helpers/db.js'

const SA_EMAIL = (process.env.E2E_SUPERADMIN_EMAIL || 'e2e-superadmin@coresite.io').toLowerCase()
const SA_PASSWORD = process.env.E2E_SUPERADMIN_PASSWORD || 'E2eSuper2026!'

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

  test('super_admin reads the overview and toggles a company active via the endpoint', async ({ request }) => {
    const token = await getAccessToken(SA_EMAIL, SA_PASSWORD)
    expect(token, 'super_admin should sign in — run `node scripts/seed-e2e.js`').toBeTruthy()
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    // READ: cross-tenant overview works for a super_admin.
    const ov = await request.post('/api/superadmin', { headers, data: { action: 'overview' } })
    expect(ov.status(), 'overview should be 200 for super_admin').toBe(200)
    const ovJson = await ov.json()
    expect(Array.isArray(ovJson.companies), 'overview returns a companies array').toBe(true)
    expect(ovJson.companies.length, 'super_admin sees companies across tenants').toBeGreaterThan(0)
    expect(ovJson.stats, 'overview returns per-company stats').toBeTruthy()

    // WRITE: toggle the E2E company's is_active through the endpoint, verify in
    // the DB, then restore — proves the cross-tenant write path works end-to-end.
    const ids = await getIds()
    const db = await getDb()
    const { data: before } = await db.from('companies').select('is_active').eq('id', ids.companyId).single()
    const target = !before.is_active
    try {
      const w = await request.post('/api/superadmin', { headers, data: { action: 'set-company-active', companyId: ids.companyId, isActive: target } })
      expect(w.status(), 'set-company-active should be 200').toBe(200)
      const { data: after } = await db.from('companies').select('is_active').eq('id', ids.companyId).single()
      expect(after.is_active, 'the company is_active should have changed in the DB').toBe(target)
    } finally {
      // Always restore the original value so other specs aren't affected.
      await request.post('/api/superadmin', { headers, data: { action: 'set-company-active', companyId: ids.companyId, isActive: before.is_active } })
      const { data: restored } = await db.from('companies').select('is_active').eq('id', ids.companyId).single()
      expect(restored.is_active, 'is_active should be restored').toBe(before.is_active)
    }
  })
})
