import { test, expect } from '@playwright/test'
import { getIds, getDb, fetchRow } from './helpers/db.js'

/**
 * RAMS sign-off: an operative opens /operative/:id/sign/:docId, verifies DOB,
 * draws a signature and submits. Verifies a `signatures` row persists.
 *
 * Uses the admin storage state (so the Supabase client can upload the signature
 * image) plus an injected operative_session (so OperativeGuard lets us through).
 */
test.describe('RAMS sign-off', () => {
  let ids, db

  test.beforeAll(async () => {
    ids = await getIds()
    db = await getDb()
    if (!ids.documentId || !ids.operativeId) throw new Error('Seed missing — run `node scripts/seed-e2e.js`')
    // Clean prior signatures so the sign UI (not "Already Signed") shows.
    await db.from('signatures').delete().eq('operative_id', ids.operativeId).eq('document_id', ids.documentId)
  })

  test.afterAll(async () => {
    await db.from('signatures').delete().eq('operative_id', ids.operativeId).eq('document_id', ids.documentId)
  })

  test('operative signature persists to the DB', async ({ page }) => {
    await page.addInitScript(
      (op) => localStorage.setItem('operative_session', JSON.stringify(op)),
      { id: ids.operativeId, name: 'E2E Worker' },
    )
    await page.goto(`/operative/${ids.operativeId}/sign/${ids.documentId}`)

    // Draw a signature.
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 15_000 })
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 20, box.y + 20)
    await page.mouse.down()
    await page.mouse.move(box.x + 120, box.y + 50)
    await page.mouse.move(box.x + 180, box.y + 25)
    await page.mouse.up()

    // Verify DOB (seeded as 1990-01-01).
    await page.locator('input[type="date"]').fill('1990-01-01')

    await page.getByRole('button', { name: /confirm & sign/i }).click()

    await expect(async () => {
      const row = await fetchRow('signatures', { operative_id: ids.operativeId, document_id: ids.documentId })
      expect(row, 'a signature row should persist after signing').not.toBeNull()
      expect(row.invalidated).toBeFalsy()
    }).toPass({ timeout: 10_000 })
  })
})
