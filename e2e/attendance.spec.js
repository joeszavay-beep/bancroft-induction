import { test, expect } from '@playwright/test'
import { getIds, getDb } from './helpers/db.js'

/**
 * QR site attendance: an operative opens /site/:projectId, logs in with
 * email+password, and taps SIGN IN. Verifies a `site_attendance` row of
 * type 'sign_in' actually persists (record_attendance RPC).
 *
 * Runs logged-out (the worker authenticates inside the page).
 */
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('QR attendance', () => {
  let ids, db, operativeId
  const wEmail = (process.env.E2E_WORKER_EMAIL || 'e2e-worker@coresite.io').toLowerCase()
  const wPass = process.env.E2E_WORKER_PASSWORD

  test.beforeAll(async () => {
    ids = await getIds()
    db = await getDb()
    const { data: op } = await db.from('operatives').select('id').eq('email', wEmail).single()
    operativeId = op.id
    // Start from a clean slate so the page shows SIGN IN (not SIGN OUT).
    await db.from("site_attendance").delete().eq("operative_id", operativeId).eq("project_id", ids.projectId)
  })

  test.afterAll(async () => {
    await db.from("site_attendance").delete().eq("operative_id", operativeId).eq("project_id", ids.projectId)
  })

  test('sign-in persists a site_attendance row', async ({ page }) => {
    await page.goto(`/site/${ids.projectId}`)

    // Worker login.
    await page.getByPlaceholder('Email address').fill(wEmail)
    await page.getByPlaceholder('Password').fill(wPass)
    await page.getByRole('button', { name: /sign in to site/i }).click()

    // Tap SIGN IN.
    const signInBtn = page.getByRole('button', { name: 'SIGN IN', exact: true })
    await expect(signInBtn).toBeVisible({ timeout: 15_000 })
    await signInBtn.click()

    // Re-fetch the latest attendance row for this operative+project.
    await expect(async () => {
      const { data, error } = await db
        .from('site_attendance')
        .select('type, recorded_at')
        .eq('operative_id', operativeId)
        .eq('project_id', ids.projectId)
        .order('recorded_at', { ascending: false })
        .limit(1)
      expect(error, error?.message).toBeFalsy()
      expect(data?.length, 'an attendance row should exist after sign-in').toBeGreaterThan(0)
      expect(data[0].type).toBe('sign_in')
    }).toPass({ timeout: 10_000 })
  })
})
