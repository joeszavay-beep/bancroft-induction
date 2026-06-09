import { test as setup, expect } from '@playwright/test'

const AUTH_FILE = 'e2e/.auth/admin.json'

/**
 * Logs in once through the real multi-step UI (/login → email → password → /app)
 * and saves the authenticated storage state for all other specs.
 */
setup('authenticate as E2E admin', async ({ page }) => {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  if (!email || !password) throw new Error('E2E_EMAIL / E2E_PASSWORD missing from .env')

  await page.goto('/login')

  // Step 1: email → Continue (app looks up the account type).
  // fill-then-verify inside toPass(): on a cold Vite start, a fill that lands
  // before React mounts is clobbered when the controlled input takes over.
  const emailInput = page.locator('input[type="email"]')
  await expect(async () => {
    await emailInput.fill(email)
    await expect(emailInput).toHaveValue(email, { timeout: 500 })
  }).toPass({ timeout: 15_000 })
  await page.getByRole('button', { name: /continue/i }).click()

  // Step 2: password (account has only a manager profile, so it goes straight there)
  const pwInput = page.locator('input[type="password"]')
  await expect(pwInput).toBeVisible()
  await pwInput.fill(password)
  await page.locator('form button[type="submit"]').click()

  // Step 3: landed in the app shell
  await page.waitForURL('**/app', { timeout: 15_000 })

  await page.context().storageState({ path: AUTH_FILE })
})
