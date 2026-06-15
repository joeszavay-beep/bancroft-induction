import { test, expect } from '@playwright/test'
import { getIds, getDb, getAccessToken } from './helpers/db.js'

/**
 * Per-company opt-in "Shared Holiday Visibility"
 * (companies.settings.shared_holiday_visibility, gated in api/holidays.js).
 *
 * API-level test — no browser session needed, auth is via Bearer tokens:
 *   OFF: a non-admin manager sees ONLY requests assigned to them as approver, and
 *        cannot approve another approver's request (403).
 *   ON:  every manager in the company sees ALL requests (the same endpoint backs the
 *        shared calendar) and can approve any of them.
 *
 * Requires `node scripts/seed-e2e.js`, which provisions M1 (a real NON-admin manager
 * who logs in) and M2 (approver-only). The spec seeds two pending requests on the E2E
 * operative — R1 -> approver M1, R2 -> approver M2 — and drives /api/holidays as M1.
 *
 * Default is OFF, so this proves the toggle flips behaviour both ways.
 */
test.use({ storageState: { cookies: [], origins: [] } })

const M1_EMAIL = (process.env.E2E_MGR1_EMAIL || 'e2e-mgr1@coresite.io').toLowerCase()
const M1_PASS = process.env.E2E_MGR1_PASSWORD || 'E2eMgr1-2026!'
const M2_EMAIL = (process.env.E2E_MGR2_EMAIL || 'e2e-mgr2@coresite.io').toLowerCase()
const BASE = 'http://localhost:5173'

test.describe.serial('Shared holiday visibility (per-company opt-in)', () => {
  let ids, db, m1Id, m2Id, m1Token, r1Id, r2Id

  async function setFlag(on) {
    const { data: co, error } = await db.from('companies').select('settings').eq('id', ids.companyId).single()
    if (error) throw new Error('read settings failed: ' + error.message)
    const settings = { ...(co.settings || {}), shared_holiday_visibility: on }
    const { error: upErr } = await db.from('companies').update({ settings }).eq('id', ids.companyId)
    if (upErr) throw new Error('setFlag failed: ' + upErr.message)
  }

  async function holidaysGet(token, qs = '') {
    const res = await fetch(`${BASE}/api/holidays${qs}`, { headers: { Authorization: `Bearer ${token}` } })
    return { status: res.status, body: await res.json().catch(() => ({})) }
  }

  async function approve(token, requestId) {
    const res = await fetch(`${BASE}/api/holidays`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, action: 'approve' }),
    })
    return { status: res.status, body: await res.json().catch(() => ({})) }
  }

  test.beforeAll(async () => {
    ids = await getIds()
    db = await getDb()
    const { data: m1 } = await db.from('managers').select('id').eq('email', M1_EMAIL).eq('company_id', ids.companyId).maybeSingle()
    const { data: m2 } = await db.from('managers').select('id').eq('email', M2_EMAIL).eq('company_id', ids.companyId).maybeSingle()
    if (!m1 || !m2) throw new Error('Seed missing holiday managers — run `node scripts/seed-e2e.js`')
    m1Id = m1.id; m2Id = m2.id
    m1Token = await getAccessToken(M1_EMAIL, M1_PASS)
    if (!m1Token) throw new Error('M1 sign-in failed — check E2E_MGR1 creds / re-seed')

    const mk = (approver) => ({
      operative_id: ids.operativeId, company_id: ids.companyId, approver_id: approver,
      start_date: '2026-09-01', end_date: '2026-09-02', start_half_day: false, end_half_day: false,
      working_days: 2, status: 'pending', reason: 'E2E-HOLVIS',
    })
    const { data: r1, error: e1 } = await db.from('holiday_requests').insert(mk(m1Id)).select('id').single()
    if (e1) throw new Error('seed R1 failed: ' + e1.message)
    const { data: r2, error: e2 } = await db.from('holiday_requests').insert(mk(m2Id)).select('id').single()
    if (e2) throw new Error('seed R2 failed: ' + e2.message)
    r1Id = r1.id; r2Id = r2.id
  })

  test.afterAll(async () => {
    if (!db) return
    // No DELETE policy on holiday_requests — mark cancelled so they drop out of
    // future pending queries (seed-e2e service-role purge removes them on re-seed).
    try { await db.from('holiday_requests').update({ status: 'cancelled' }).in('id', [r1Id, r2Id].filter(Boolean)) } catch { /* best effort */ }
    try { await setFlag(false) } catch { /* best effort */ }
  })

  test('flag OFF: a manager sees only their own approver requests and cannot approve another\'s', async () => {
    await setFlag(false)
    const { status, body } = await holidaysGet(m1Token, '?status=pending')
    expect(status).toBe(200)
    const seen = (body.requests || []).map(r => r.id)
    expect(seen, 'M1 should see R1 (assigned to them)').toContain(r1Id)
    expect(seen, 'M1 must NOT see R2 (assigned to M2) when flag off').not.toContain(r2Id)

    const ap = await approve(m1Token, r2Id)
    expect(ap.status, 'M1 must be blocked (403) from approving R2 when flag off').toBe(403)
  })

  test('flag ON: every manager sees all company requests and can approve any of them', async () => {
    await setFlag(true)
    const { status, body } = await holidaysGet(m1Token, '?status=pending')
    expect(status).toBe(200)
    const seen = (body.requests || []).map(r => r.id)
    expect(seen, 'M1 should still see R1 with flag on').toContain(r1Id)
    expect(seen, 'M1 should now see R2 (assigned to M2) with flag on').toContain(r2Id)

    const ap = await approve(m1Token, r2Id)
    expect(ap.status, 'M1 should be allowed to approve R2 under shared visibility').toBe(200)

    const { data: r2 } = await db.from('holiday_requests').select('status').eq('id', r2Id).single()
    expect(r2.status, 'R2 should now be approved').toBe('approved')
  })
})
