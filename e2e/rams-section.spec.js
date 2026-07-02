import { test, expect } from '@playwright/test'
import { getIds, getDb, runMarker } from './helpers/db.js'

/**
 * Risk Assessments section, end to end: a manager uploads a RAMS on
 * /app/rams (persisted as a `documents` row with doc_type='rams'), an
 * operative signs it through the standard SignDocument flow (read-gate →
 * canvas → DOB), and the exact query the H&S report RAMS register runs
 * (documents doc_type='rams' + valid signatures) returns the sign-off.
 *
 * Serial: the signing test consumes the document created by the upload test.
 */
test.describe.serial('Risk Assessments section', () => {
  let ids, db, marker, docId

  test.beforeAll(async () => {
    ids = await getIds()
    db = await getDb()
    marker = runMarker('E2E RAMS SECTION')
    if (!ids.operativeId || !ids.projectId) throw new Error('Seed missing — run `node scripts/seed-e2e.js`')
  })

  test.afterAll(async () => {
    // Cleanup: signatures first, then the uploaded document
    const { data: docs } = await db.from('documents').select('id').eq('title', marker)
    for (const d of docs || []) {
      await db.from('signatures').delete().eq('document_id', d.id)
      await db.from('documents').delete().eq('id', d.id)
    }
  })

  test('manager upload persists as a doc_type=rams documents row', async ({ page }) => {
    await page.goto('/app/rams')

    // Expand the E2E Site project card and open the upload modal
    await page.getByRole('heading', { name: 'E2E Site' }).click()
    await page.getByRole('button', { name: 'Upload', exact: true }).click()
    await page.getByPlaceholder('Risk assessment title').fill(marker)
    await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/drawing.png')
    await page.locator('form button[type="submit"]').click()

    // Re-fetch from the DB: correct type + tenant + project scoping persisted
    await expect(async () => {
      const { data } = await db.from('documents').select('*').eq('title', marker).maybeSingle()
      expect(data, 'uploaded RAMS row should exist').toBeTruthy()
      expect(data.doc_type).toBe('rams')
      expect(data.project_id).toBe(ids.projectId)
      expect(data.company_id).toBe(ids.companyId)
      expect(data.file_url, 'file stored').toBeTruthy()
      docId = data.id
    }).toPass({ timeout: 20_000 })
  })

  test('operative signs it and the H&S RAMS register source returns the sign-off', async ({ page }) => {
    expect(docId, 'depends on the upload test').toBeTruthy()
    await page.addInitScript(
      (op) => localStorage.setItem('operative_session', JSON.stringify(op)),
      { id: ids.operativeId, name: 'E2E Worker' },
    )
    await page.goto(`/operative/${ids.operativeId}/sign/${docId}`)

    // Read-gate: the doc has a file, so confirm-read must unlock signing
    const checkbox = page.getByRole('checkbox')
    await expect(checkbox).toBeVisible({ timeout: 15_000 })
    await checkbox.check()

    // Draw a signature. The sign section mounts BELOW the document viewer, so
    // scroll the canvas on-screen first — mouse events use viewport coords and
    // silently miss an off-screen canvas.
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
    await canvas.scrollIntoViewIfNeeded()
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 20, box.y + 20)
    await page.mouse.down()
    await page.mouse.move(box.x + 120, box.y + 50)
    await page.mouse.move(box.x + 180, box.y + 25)
    await page.mouse.up()

    await page.locator('input[type="date"]').fill('1990-01-01')
    const signButton = page.getByRole('button', { name: /confirm & sign/i })
    await expect(signButton).toBeEnabled()
    await signButton.click()
    await expect(page.getByText(/document signed/i)).toBeVisible({ timeout: 20_000 })

    // Re-fetch through the exact H&S RAMS register source query:
    // documents(doc_type='rams', project) + valid signatures on those ids.
    await expect(async () => {
      const { data: docs } = await db.from('documents').select('id')
        .eq('project_id', ids.projectId).eq('doc_type', 'rams')
      const docIds = (docs || []).map(d => d.id)
      expect(docIds, 'register lists the uploaded RAMS').toContain(docId)
      const { data: sigs } = await db.from('signatures').select('*')
        .in('document_id', docIds).eq('invalidated', false)
      const mine = (sigs || []).find(s => s.document_id === docId && s.operative_id === ids.operativeId)
      expect(mine, 'register sees the operative sign-off').toBeTruthy()
      expect(mine.signature_url, 'signature image captured').toBeTruthy()
    }).toPass({ timeout: 15_000 })
  })
})
