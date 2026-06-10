import { test, expect } from '@playwright/test'
import { getIds, getDb } from './helpers/db.js'

/**
 * Induction = an operative signing all required documents for their project.
 * Drives the operative documents hub: open it (incomplete), sign the document,
 * return and confirm "induction complete", then verify in the DB that every
 * project document has a valid signature.
 *
 * Serial: the projects-tab sign-off % test relies on the signature created by
 * the signing test.
 */
test.describe.serial('Induction', () => {
  let ids, db

  test.beforeAll(async () => {
    ids = await getIds()
    db = await getDb()
    if (!ids.documentId || !ids.operativeId) throw new Error('Seed missing — run `node scripts/seed-e2e.js`')
    await db.from('signatures').delete().eq('operative_id', ids.operativeId).eq('document_id', ids.documentId)
  })

  test.afterAll(async () => {
    await db.from('signatures').delete().eq('operative_id', ids.operativeId).eq('document_id', ids.documentId)
  })

  test('signing all documents completes the induction (persisted)', async ({ page }) => {
    await page.addInitScript(
      (op) => localStorage.setItem('operative_session', JSON.stringify(op)),
      { id: ids.operativeId, name: 'E2E Worker' },
    )

    // Documents hub: induction not yet complete.
    await page.goto(`/operative/${ids.operativeId}/documents`)
    await expect(page.getByText('induction complete', { exact: false })).toBeHidden()
    await page.getByRole('button', { name: /E2E RAMS/ }).click()

    // Sign the document.
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 15_000 })
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 20, box.y + 20)
    await page.mouse.down()
    await page.mouse.move(box.x + 120, box.y + 50)
    await page.mouse.move(box.x + 180, box.y + 25)
    await page.mouse.up()
    await page.locator('input[type="date"]').fill('1990-01-01')
    await page.getByRole('button', { name: /confirm & sign/i }).click()
    // Wait for the success state so the insert/upload finishes before navigating.
    await expect(page.getByText('Document Signed', { exact: false })).toBeVisible({ timeout: 15_000 })

    // Back to the hub: induction now complete.
    await page.goto(`/operative/${ids.operativeId}/documents`)
    await expect(page.getByText('induction complete', { exact: false })).toBeVisible({ timeout: 15_000 })

    // Verify in the DB: every project document has a valid signature.
    await expect(async () => {
      const { data: docs } = await db.from('documents').select('id').eq('project_id', ids.projectId)
      const { data: sigs } = await db.from('signatures')
        .select('document_id').eq('operative_id', ids.operativeId).eq('invalidated', false)
      const signed = new Set((sigs || []).map((s) => s.document_id))
      expect(docs.length, 'project should have at least one document').toBeGreaterThan(0)
      expect(docs.every((d) => signed.has(d.id)), 'all project documents should be signed').toBe(true)
    }).toPass({ timeout: 10_000 })
  })

  test('projects tab shows a non-zero sign-off % for the signed project', async ({ page }) => {
    // Regression guard for the AUDIT §2.24 companion fix at PMDashboard.jsx:710:
    // per-project operatives used to be matched on the non-existent
    // operatives.project_id, so the sign-off % was always 0. With the operative
    // signed (previous test), the E2E Site card must show a non-zero %.
    await page.goto('/app/projects')
    const card = page.locator('div.rounded-xl').filter({ has: page.getByRole('heading', { name: 'E2E Site' }) })
    const signOffStat = card.locator('div').filter({ hasText: /^\d+%Sign-off$/ })
    await expect(signOffStat).toBeVisible({ timeout: 20_000 })
    await expect(signOffStat).not.toHaveText(/^0%/)
  })
})
