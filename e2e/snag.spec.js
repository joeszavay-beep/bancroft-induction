import { test, expect } from '@playwright/test'
import { getIds, fetchRow, deleteRows, runMarker } from './helpers/db.js'

/**
 * Snag lifecycle on a drawing: raise (pin + SnagForm) → edit (SnagDetail) →
 * close (status change). Every step re-fetches the `snags` row from Supabase to
 * prove persistence. Snags are placed on the "E2E Drawing" provisioned by
 * scripts/seed-e2e.js.
 *
 * Serial: the three steps share one snag, resolved by its unique description.
 */
test.describe.serial('Snags', () => {
  const marker = runMarker('E2E-SNAG')
  const editedMarker = `${marker}-EDITED`
  let ids

  test.beforeAll(async () => {
    ids = await getIds()
    if (!ids.drawingId) throw new Error('No E2E drawing — run `node scripts/seed-e2e.js`')
  })

  test.afterAll(async () => {
    for (const d of [marker, editedMarker]) {
      await deleteRows('snags', { drawing_id: ids.drawingId, description: d }).catch(() => {})
    }
  })

  // Open a snag (by description) in the SnagDetail panel via the list view.
  async function openSnagDetail(page, desc) {
    await page.goto(`/snags/${ids.drawingId}`)
    await expect(page.locator('img[alt="E2E Drawing"]')).toBeVisible({ timeout: 20_000 })
    const listToggle = page.locator('button:has(svg.lucide-list)')
    if (await listToggle.isVisible().catch(() => false)) await listToggle.click()
    const item = page.locator(`button:has-text("${desc}")`).first()
    await item.click()
    await expect(page.getByRole('button', { name: /save changes/i })).toBeVisible({ timeout: 10_000 })
  }

  test('raise persists a snag to the DB', async ({ page }) => {
    await page.goto(`/snags/${ids.drawingId}?add=true`)
    const img = page.locator('img[alt="E2E Drawing"]')
    await expect(img).toBeVisible({ timeout: 20_000 })

    // Tap the drawing wrapper to drop a pin (it carries the pointer handlers;
    // placingPin is on via ?add=true). Clicking the img is intercepted by it.
    await page.locator('div.relative.inline-block').click({ position: { x: 400, y: 300 } })

    const dialog = page.getByRole('heading', { name: /New Snag #/ })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await page.getByPlaceholder('Describe the snag...').fill(marker)
    await page.getByRole('button', { name: /Raise Snag/ }).click()
    await expect(dialog).toBeHidden()

    await expect(async () => {
      const row = await fetchRow('snags', { drawing_id: ids.drawingId, description: marker })
      expect(row, 'snag row should exist after raise').not.toBeNull()
      expect(row.status).toBe('open')
      expect(row.project_id).toBe(ids.projectId)
    }).toPass({ timeout: 10_000 })
  })

  test('edit persists the updated description to the DB', async ({ page }) => {
    await openSnagDetail(page, marker)

    await page.locator('textarea').first().fill(editedMarker)
    await page.getByRole('button', { name: /save changes/i }).click()

    await expect(async () => {
      const row = await fetchRow('snags', { drawing_id: ids.drawingId, description: editedMarker })
      expect(row, 'snag should be found by its edited description').not.toBeNull()
      expect(row.description).toBe(editedMarker)
    }).toPass({ timeout: 10_000 })
  })

  test('close persists status=closed to the DB', async ({ page }) => {
    await openSnagDetail(page, editedMarker)

    // Status select is the first select in the PM detail form.
    await page.locator('select').first().selectOption('closed')
    await page.getByRole('button', { name: /save changes/i }).click()

    await expect(async () => {
      const row = await fetchRow('snags', { drawing_id: ids.drawingId, description: editedMarker })
      expect(row, 'snag should still exist after close').not.toBeNull()
      expect(row.status).toBe('closed')
    }).toPass({ timeout: 10_000 })
  })
})
