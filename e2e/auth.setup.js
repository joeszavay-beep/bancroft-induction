import { test as setup, expect } from '@playwright/test'

const AUTH_FILE = 'e2e/.auth/admin.json'

/**
 * Logs in once through the real multi-step UI (/login → email → password → /app)
 * and saves the authenticated storage state for all other specs.
 */
setup('authenticate as E2E admin', async ({ page }) => {
  // Generous: the first /login compiles the whole heavy bundle (web-ifc, PDF
  // libs) on a cold Vite start, and the email step makes a cold Supabase lookup.
  setup.setTimeout(120_000)

  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  if (!email || !password) throw new Error('E2E_EMAIL / E2E_PASSWORD missing from .env')

  await page.goto('/login')

  const emailInput = page.locator('input[type="email"]')
  const pwInput = page.locator('input[type="password"]')

  // Wait for the SPA to actually render the email step before touching it.
  await expect(emailInput).toBeVisible({ timeout: 60_000 })

  // Step 1 → 2: fill email, submit, wait for the password step. Retry the whole
  // sequence (patiently): a fill/click can land before React wires the form, and
  // the email lookup hits Supabase cold, so the transition can take seconds.
  await expect(async () => {
    if (await pwInput.isVisible().catch(() => false)) return
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill(email)
      await expect(emailInput).toHaveValue(email, { timeout: 1000 })
      await page.getByRole('button', { name: /continue/i }).click()
    }
    await expect(pwInput).toBeVisible({ timeout: 8000 })
  }).toPass({ timeout: 60_000 })

  // Step 2: password.
  await pwInput.fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()

  // Step 3: landed in the app shell.
  await page.waitForURL('**/app', { timeout: 20_000 })

  await page.context().storageState({ path: AUTH_FILE })
})
