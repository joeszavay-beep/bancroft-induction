import { test, expect } from '@playwright/test'
import { getIds, getDb, fetchRow, runMarker } from './helpers/db.js'

/**
 * Public aftercare defect portal (/aftercare/:projectId) — runs fully anonymous
 * so it proves the project read (get_project_public_info) and the defect insert
 * (submit_aftercare_defect) work as the anon role under the RLS lockdown.
 */
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Aftercare (anon, via RPC)', () => {
  let ids, db
  const marker = runMarker('E2E-AFTERCARE')

  test.beforeAll(async () => {
    ids = await getIds()
    db = await getDb()
  })

  test.afterAll(async () => {
    await db.from('aftercare_defects').delete().eq('project_id', ids.projectId).eq('description', marker)
  })

  test('anon defect submission persists via RPC', async ({ page }) => {
    await page.goto(`/aftercare/${ids.projectId}`)
    // Project name (from get_project_public_info) — proves the anon read works.
    await expect(page.getByRole('heading', { name: 'E2E Site' })).toBeVisible({ timeout: 20_000 })

    await page.locator('input[name="reported_by"]').fill('E2E Reporter')
    await page.locator('textarea[name="description"]').fill(marker)
    await page.getByRole('button', { name: /submit defect/i }).click()

    await expect(page.getByRole('heading', { name: /Defect Reported Successfully/i })).toBeVisible({ timeout: 15_000 })

    await expect(async () => {
      const row = await fetchRow('aftercare_defects', { project_id: ids.projectId, description: marker })
      expect(row, 'aftercare defect should persist via submit_aftercare_defect').not.toBeNull()
      expect(row.status).toBe('open')
    }).toPass({ timeout: 10_000 })
  })
})
