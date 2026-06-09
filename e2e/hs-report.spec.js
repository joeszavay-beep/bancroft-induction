import { test, expect } from '@playwright/test'
import { getIds } from './helpers/db.js'
import fs from 'node:fs'

/**
 * Weekly H&S report generation. The report aggregates project data and produces
 * a PDF download (no DB row), so "persistence" here = a valid, non-empty PDF is
 * actually produced. We capture the download and assert it is a real PDF.
 */
test.describe('Weekly H&S report', () => {
  let ids
  test.beforeAll(async () => { ids = await getIds() })

  test('Generate PDF produces a non-empty PDF', async ({ page }) => {
    // The generator reads the selected project from ProjectContext — pin it.
    await page.addInitScript(
      (id) => localStorage.setItem('coresite_selected_project', id),
      ids.projectId,
    )
    await page.goto('/app/hs-reports')

    const generate = page.getByRole('button', { name: /generate pdf/i })
    await expect(generate).toBeVisible({ timeout: 20_000 })

    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })
    await generate.click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i)
    const path = await download.path()
    const buf = fs.readFileSync(path)
    expect(buf.length, 'PDF should be non-empty').toBeGreaterThan(1000)
    expect(buf.subarray(0, 5).toString('latin1'), 'file should start with the PDF magic header').toBe('%PDF-')
  })
})
