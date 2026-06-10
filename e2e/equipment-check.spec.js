import { test, expect } from '@playwright/test'
import { getIds, getDb } from './helpers/db.js'

/**
 * Public equipment pre-use check (/equipment-check/:equipmentId) — runs fully
 * anonymous (with only an injected operative_session) so it proves the page
 * loads via get_equipment_public_check as the anon role under the RLS lockdown.
 *
 * Seeds a stable equipment row, then removes it.
 */
test.use({ storageState: { cookies: [], origins: [] } })

test.describe.serial('Equipment check (anon, via RPC)', () => {
  let ids, db, equipmentId

  test.beforeAll(async () => {
    ids = await getIds()
    db = await getDb()
    const { data, error } = await db.from('equipment').insert({
      company_id: ids.companyId,
      project_id: ids.projectId,
      description: 'E2E Test Equipment',
      type: 'Other',
      status: 'In Service',
      serial_number: 'E2E-EQ-001',
    }).select('id').single()
    if (error) throw new Error('equipment seed failed: ' + error.message)
    equipmentId = data.id
  })

  test.afterAll(async () => {
    if (equipmentId) await db.from('equipment').delete().eq('id', equipmentId)
  })

  test('anon equipment check page loads via RPC', async ({ page }) => {
    // Operative session present → page renders the checklist phase (no redirect).
    await page.addInitScript(
      (op) => localStorage.setItem('operative_session', JSON.stringify(op)),
      { id: ids.operativeId, name: 'E2E Worker', projects: [{ id: ids.projectId, name: 'E2E Site' }] },
    )
    await page.goto(`/equipment-check/${equipmentId}`)

    // The checklist header shows "{type} — {description}" from get_equipment_public_check.
    await expect(page.getByText(/E2E Test Equipment/).first()).toBeVisible({ timeout: 20_000 })
  })
})
