import { test, expect } from '@playwright/test'
import { getIds } from './helpers/db.js'
import fs from 'node:fs'

/**
 * PDF export: the snag drawing export (generateSnagPDF). These exports produce a
 * PDF download rather than a DB row, so we capture the download and assert it is
 * a valid, non-empty PDF.
 */
test.describe('PDF export', () => {
  let ids
  test.beforeAll(async () => {
    ids = await getIds()
    if (!ids.drawingId) throw new Error('No E2E drawing — run `node scripts/seed-e2e.js`')
  })

  test('snag drawing export produces a non-empty PDF', async ({ page }) => {
    await page.goto(`/snags/${ids.drawingId}`)
    await expect(page.locator('img[alt="E2E Drawing"]')).toBeVisible({ timeout: 20_000 })

    const exportBtn = page.locator('button:has(svg.lucide-download)')
    await expect(exportBtn).toBeVisible()

    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })
    await exportBtn.click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i)
    const path = await download.path()
    const buf = fs.readFileSync(path)
    expect(buf.length, 'PDF should be non-empty').toBeGreaterThan(1000)
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })
})
