import { test, expect } from '@playwright/test'
import { getIds, fetchRow, deleteRows, runMarker } from './helpers/db.js'

/**
 * Plant & Equipment CRUD. Every step re-fetches the `equipment` row directly
 * from Supabase to prove the write actually persisted — not just that a toast
 * appeared.
 *
 * NOTE: the "edit" test is EXPECTED TO FAIL — it reproduces AUDIT.md §2.1 live
 * (the PATCH handler only applies snake_case keys, so the camelCase fields the
 * client sends — serial_number, hire_company, hire_rate, etc. — are silently
 * dropped). It is intentionally left red as a regression marker until the app
 * bug is fixed. Delete is a standalone test (creates its own row) so it stays
 * verified regardless of the edit bug.
 */
let ids
test.beforeAll(async () => { ids = await getIds() })

// Fill a modal input that has no placeholder, by its preceding <label>.
const byLabel = (page, label) => page.locator(`label:text-is("${label}") + input`)

// The equipment table filters by the selected project; a freshly-created row
// can land with project_id=null (submitted before ProjectContext finishes its
// async load). Viewing "All Projects" removes the filter so rows are always
// findable regardless of that race.
async function selectAllProjects(page) {
  const sel = page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'All Projects' }) })
  await expect(sel).toBeVisible()
  await sel.selectOption({ label: 'All Projects' })
}

async function gotoPlant(page) {
  await page.goto('/app/plant-equipment')
  await selectAllProjects(page)
}

/** Create an equipment item via the UI; returns once the modal has closed. */
async function createViaUI(page, marker) {
  await gotoPlant(page)
  await expect(async () => {
    await page.getByRole('button', { name: 'Add Equipment' }).first().click()
    await expect(page.getByRole('heading', { name: 'Add Equipment' })).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })

  await page.getByPlaceholder('e.g. Scissor Lift, Podium, Site Box...').fill('Scissor Lift')
  await page.getByPlaceholder('e.g. Red podium - 1.2m platform height').fill(marker)
  await byLabel(page, 'Serial Number').fill('SN-001')
  await byLabel(page, 'Hire Company').fill('Acme Hire')
  await page.getByPlaceholder('0.00').fill('125.50')
  await page.locator('select:has(option[value="weekly"])').selectOption('weekly')

  await page.getByRole('button', { name: 'Add Equipment' }).last().click()
  await expect(page.getByRole('heading', { name: 'Add Equipment' })).toBeHidden()
}

test.describe.serial('Plant & Equipment — create & edit', () => {
  const marker = runMarker('E2E-PLANT')

  test.afterAll(async () => {
    await deleteRows('equipment', { company_id: ids.companyId, description: marker }).catch(() => {})
  })

  test('create persists to the DB', async ({ page }) => {
    await createViaUI(page, marker)

    await expect(async () => {
      const row = await fetchRow('equipment', { company_id: ids.companyId, description: marker })
      expect(row, 'equipment row should exist after create').not.toBeNull()
      expect(row).toMatchObject({
        description: marker,
        type: 'Scissor Lift',
        serial_number: 'SN-001',
        hire_company: 'Acme Hire',
      })
      expect(Number(row.hire_rate)).toBe(125.5)
      expect(row.hire_rate_period).toBe('weekly')
    }).toPass({ timeout: 10_000 })
  })

  test('edit persists changed fields to the DB [KNOWN-RED: AUDIT §2.1]', async ({ page }) => {
    await gotoPlant(page)
    await page.getByPlaceholder('Search equipment...').fill(marker)
    const row = page.locator('tr', { hasText: marker })
    await expect(row).toBeVisible()

    // Row action buttons in order: QR(0), Check History(1), Defects(2), Edit(3), Delete(4).
    await row.locator('button').nth(3).click()
    await expect(page.getByRole('heading', { name: 'Edit Equipment' })).toBeVisible()

    await byLabel(page, 'Serial Number').fill('SN-999')
    await byLabel(page, 'Hire Company').fill('Beta Plant')
    await page.getByPlaceholder('0.00').fill('300')

    await page.getByRole('button', { name: 'Update' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Equipment' })).toBeHidden()

    // Re-fetch: the edited fields must actually be in the DB. FAILS today — the
    // PATCH drops these fields (AUDIT.md §2.1). Left red on purpose.
    await expect(async () => {
      const updated = await fetchRow('equipment', { company_id: ids.companyId, description: marker })
      expect(updated, 'equipment row should still exist after edit').not.toBeNull()
      expect(updated.serial_number).toBe('SN-999')
      expect(updated.hire_company).toBe('Beta Plant')
      expect(Number(updated.hire_rate)).toBe(300)
    }).toPass({ timeout: 10_000 })
  })
})

test('delete removes the row from the DB', async ({ page }) => {
  const marker = runMarker('E2E-PLANT-DEL')
  page.on('dialog', (d) => d.accept()) // window.confirm in handleDelete

  await createViaUI(page, marker)
  // Confirm it exists before deleting.
  await expect(async () => {
    expect(await fetchRow('equipment', { company_id: ids.companyId, description: marker })).not.toBeNull()
  }).toPass({ timeout: 10_000 })

  await gotoPlant(page)
  await page.getByPlaceholder('Search equipment...').fill(marker)
  const row = page.locator('tr', { hasText: marker })
  await expect(row).toBeVisible()
  await row.locator('button').nth(4).click() // Delete

  await expect(async () => {
    const gone = await fetchRow('equipment', { company_id: ids.companyId, description: marker })
    expect(gone, 'equipment row should be deleted').toBeNull()
  }).toPass({ timeout: 10_000 })
})
