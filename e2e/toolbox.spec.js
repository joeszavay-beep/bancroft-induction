import { test, expect } from '@playwright/test'
import { getIds, getDb, fetchRow, runMarker } from './helpers/db.js'

/**
 * Toolbox talk: PM creates a talk, then an operative signs it via the QR page.
 * Each step re-fetches from Supabase (toolbox_talks, toolbox_signatures) to
 * prove persistence.
 *
 * Serial: create then sign share one talk.
 */
test.describe.serial('Toolbox talks', () => {
  const marker = runMarker('E2E-TBT')
  let ids, db, operativeId, talkId

  test.beforeAll(async () => {
    ids = await getIds()
    db = await getDb()
    const { data: op } = await db.from('operatives').select('id')
      .eq('email', (process.env.E2E_WORKER_EMAIL || 'e2e-worker@coresite.io').toLowerCase()).single()
    operativeId = op.id
  })

  test.afterAll(async () => {
    const { data: talk } = await db.from('toolbox_talks').select('id').eq('company_id', ids.companyId).eq('title', marker).maybeSingle()
    if (talk) {
      await db.from('toolbox_signatures').delete().eq('talk_id', talk.id)
      await db.from('toolbox_talks').delete().eq('id', talk.id)
    }
  })

  test('PM create persists a toolbox talk', async ({ page }) => {
    await page.goto('/app/toolbox')
    await page.getByRole('button', { name: /new talk/i }).click()
    await expect(page.getByRole('heading', { name: 'New Toolbox Talk' })).toBeVisible()

    // Scope to the modal — the sidebar has its own project <select> that would
    // otherwise be matched and re-render/close the modal.
    const modal = page.locator('.shadow-xl')
    await modal.getByPlaceholder('Talk title (e.g. Working at Height)').fill(marker)
    const projectSelect = modal.locator('select')
    // Project options load async — wait for ours before selecting.
    await expect(projectSelect.locator('option', { hasText: 'E2E Site' })).toHaveCount(1, { timeout: 15_000 })
    await projectSelect.selectOption({ label: 'E2E Site' })
    await modal.getByRole('button', { name: /create & show qr/i }).click()

    // It navigates to the live page; the talk must be in the DB.
    await expect(async () => {
      const row = await fetchRow('toolbox_talks', { company_id: ids.companyId, title: marker })
      expect(row, 'toolbox talk should persist after create').not.toBeNull()
      talkId = row.id
    }).toPass({ timeout: 10_000 })
  })

  test('operative sign (anon, via RPC) persists a toolbox_signature', async ({ browser }) => {
    if (!talkId) {
      const row = await fetchRow('toolbox_talks', { company_id: ids.companyId, title: marker })
      talkId = row?.id
    }
    expect(talkId, 'need a talk id from the create step').toBeTruthy()

    // Pure anon context (no manager JWT in storage) so the page's
    // get_toolbox_for_signing / submit_toolbox_signature RPCs run as the anon
    // role — the public path that must keep working after the RLS lockdown.
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await ctx.newPage()
    try {
      // ToolboxSign auto-selects the logged-in operative from operative_session.
      await page.addInitScript(
        (op) => localStorage.setItem('operative_session', JSON.stringify(op)),
        { id: operativeId, name: 'E2E Worker' },
      )
      await page.goto(`/toolbox/${talkId}`)

      // Operatives load via the RPC (operative_projects junction), so the signing
      // UI must render rather than "All operatives have signed".
      await expect(page.getByText('All operatives have signed')).toBeHidden({ timeout: 5_000 })

      // Draw on the signature canvas to enable the submit button.
      const canvas = page.locator('canvas')
      await expect(canvas).toBeVisible({ timeout: 15_000 })
      const box = await canvas.boundingBox()
      await page.mouse.move(box.x + 20, box.y + 20)
      await page.mouse.down()
      await page.mouse.move(box.x + 100, box.y + 60)
      await page.mouse.move(box.x + 160, box.y + 30)
      await page.mouse.up()

      const submit = page.getByRole('button', { name: /confirm attendance/i })
      await expect(submit).toBeEnabled({ timeout: 5_000 })
      await submit.click()

      await expect(async () => {
        const sig = await fetchRow('toolbox_signatures', { talk_id: talkId, operative_id: operativeId })
        expect(sig, 'a toolbox signature should persist after signing').not.toBeNull()
      }).toPass({ timeout: 10_000 })
    } finally {
      await ctx.close()
    }
  })
})
