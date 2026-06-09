import { test, expect } from '@playwright/test'

/**
 * Auth lifecycle: login success, bad-password rejection, logged-out guard, and
 * session expiry. Runs logged-out (overrides the shared admin storage state).
 *
 * The "stale flag" test reproduces AUDIT.md §1.7 live and is intentionally RED.
 */
test.use({ storageState: { cookies: [], origins: [] } })

const SB_TOKEN_KEY = 'sb-pbyxpeaeijuxkzktvwbd-auth-token'

// Drive the multi-step /login UI up to the password step (patient on cold start).
async function gotoPasswordStep(page, email) {
  await page.goto('/login')
  const emailInput = page.locator('input[type="email"]')
  const pwInput = page.locator('input[type="password"]')
  await expect(emailInput).toBeVisible({ timeout: 60_000 })
  await expect(async () => {
    if (await pwInput.isVisible().catch(() => false)) return
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill(email)
      await expect(emailInput).toHaveValue(email, { timeout: 1000 })
      await page.getByRole('button', { name: /continue/i }).click()
    }
    await expect(pwInput).toBeVisible({ timeout: 8000 })
  }).toPass({ timeout: 60_000 })
}

test('valid login creates a Supabase session and lands in /app', async ({ page }) => {
  await gotoPasswordStep(page, process.env.E2E_EMAIL)
  await page.locator('input[type="password"]').fill(process.env.E2E_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL('**/app', { timeout: 20_000 })

  // Verify a real session was actually persisted (not just a UI transition):
  // supabase-js stores the session under sb-<ref>-auth-token.
  const token = await page.evaluate(
    (k) => localStorage.getItem(k) || sessionStorage.getItem(k),
    SB_TOKEN_KEY,
  )
  expect(token, 'a Supabase auth token should be stored after login').toBeTruthy()
  expect(JSON.parse(token).access_token, 'session should hold an access_token').toBeTruthy()
})

test('wrong password is rejected and creates no session', async ({ page }) => {
  await gotoPasswordStep(page, process.env.E2E_EMAIL)
  await page.locator('input[type="password"]').fill('WrongPassword123')
  await page.getByRole('button', { name: /sign in/i }).click()

  await expect(page.getByText(/invalid password/i)).toBeVisible({ timeout: 10_000 })
  await expect(page).toHaveURL(/\/login/)
  const token = await page.evaluate(
    (k) => localStorage.getItem(k) || sessionStorage.getItem(k),
    SB_TOKEN_KEY,
  )
  expect(token, 'no session should exist after a failed login').toBeFalsy()
})

test('logged-out user is redirected from /app to /login', async ({ page }) => {
  await page.goto('/app/plant-equipment')
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
})

test('stale pm_auth flag without a live session forces re-login [KNOWN-RED: AUDIT §1.7]', async ({ page }) => {
  // Simulate the real-world expiry case: the Supabase session is gone (token
  // expired / refresh failed) but the app's own pm_auth flag is still in
  // storage. The route guards trust that flag, so the user is let into /app
  // with no usable token and every request 401s, instead of being sent to login.
  await page.addInitScript(() => {
    localStorage.setItem('pm_auth', 'true')
    sessionStorage.setItem('pm_auth', 'true')
  })
  await page.goto('/app/plant-equipment')

  // Correct behaviour: a dead session should bounce the user to /login.
  // Today it does not (AUDIT §1.7) — this assertion is expected to fail.
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
})
