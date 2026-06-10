import { test, expect } from '@playwright/test'
import { getIds, getDb } from './helpers/db.js'

/**
 * Public sign-off portal (/portal/:projectId) — runs fully anonymous (no
 * manager JWT) so it proves the page renders via get_portal_data as the anon
 * role, the path that must survive the RLS lockdown.
 *
 * Seeds one persisted signature so the portal has data independent of other
 * specs, then removes it.
 */
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Portal (anon, via RPC)', () => {
  let ids, db, sigId

  test.beforeAll(async () => {
    ids = await getIds()
    db = await getDb()
    if (!ids.documentId || !ids.operativeId) throw new Error('Seed missing — run `node scripts/seed-e2e.js`')
    const { data, error } = await db.from('signatures').insert({
      operative_id: ids.operativeId,
      document_id: ids.documentId,
      project_id: ids.projectId,
      company_id: ids.companyId,
      operative_name: 'E2E Worker',
      document_title: 'E2E RAMS',
      typed_name: 'E2E Worker',
    }).select('id').single()
    if (error) throw new Error('portal signature seed failed: ' + error.message)
    sigId = data.id
  })

  test.afterAll(async () => {
    if (sigId) await db.from('signatures').delete().eq('id', sigId)
  })

  test('public portal renders the project sign-off record via RPC', async ({ page }) => {
    await page.goto(`/portal/${ids.projectId}`)
    // Project name (from get_portal_data.project) — proves the anon RPC returned data.
    await expect(page.getByRole('heading', { name: 'E2E Site' })).toBeVisible({ timeout: 20_000 })
    // The seeded signature surfaces its document + operative in the breakdown.
    await expect(page.getByText('E2E RAMS').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('E2E Worker').first()).toBeVisible()
  })
})
