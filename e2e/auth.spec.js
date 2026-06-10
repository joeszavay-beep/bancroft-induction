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

// Seed the storage shape of a logged-in manager whose Supabase token has
// expired: the app flag + cached manager_data + an expired sb session whose
// refresh token the server no longer accepts.
function seedExpiredLogin(page) {
  return page.addInitScript((key) => {
    localStorage.setItem('pm_auth', 'true')
    localStorage.setItem('manager_data', JSON.stringify({
      id: '00000000-0000-4000-8000-000000000000', name: 'Cached Manager',
      email: 'cached@coresite.io', role: 'manager', company_id: null, project_ids: [],
    }))
    localStorage.setItem(key, JSON.stringify({
      access_token: 'expired-access-token',
      token_type: 'bearer',
      expires_at: Math.floor(Date.now() / 1000) - 3600,
      expires_in: -3600,
      refresh_token: 'stale-refresh-token',
      user: { id: '00000000-0000-4000-8000-000000000000', email: 'cached@coresite.io' },
    }))
  }, SB_TOKEN_KEY)
}

test('auth network failure falls back to the cached login (AUDIT §1.7 refinement)', async ({ page }) => {
  // navigator.onLine can be true on a connection that can't actually reach
  // Supabase. With the auth endpoint unreachable the session check fails at
  // the network level — no verdict on the session — so the app must use the
  // offline fallback and stay in /app rather than bounce to /login.
  await page.route('**/auth/v1/**', (route) => route.abort('connectionfailed'))
  await seedExpiredLogin(page)

  const restored = page.waitForEvent('console', {
    predicate: (msg) => msg.text().includes('Restored auth from stored session'),
    timeout: 20_000,
  })
  await page.goto('/app/plant-equipment')
  await restored

  // Give any pending guard redirect time to land, then confirm none did.
  await page.waitForTimeout(2_000)
  await expect(page).toHaveURL(/\/app\/plant-equipment/)
})

test('definitively rejected session (server says invalid) forces re-login', async ({ page }) => {
  // Same stored state, but the auth server IS reachable and rejects the stale
  // refresh token — a real "session expired" verdict, so the cached fallback
  // must NOT be used and the user lands on /login.
  await seedExpiredLogin(page)
  await page.goto('/app/plant-equipment')

  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
})

test('stale pm_auth flag without a live session forces re-login', async ({ page }) => {
  // Real-world expiry case: the Supabase session is gone (token expired / refresh
  // failed) but the app's own pm_auth flag is still in storage. After the AUDIT
  // §1.7 fix the guards no longer trust that flag while online, so the user is
  // sent to /login instead of into /app with no usable token.
  await page.addInitScript(() => {
    localStorage.setItem('pm_auth', 'true')
    sessionStorage.setItem('pm_auth', 'true')
  })
  await page.goto('/app/plant-equipment')

  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
})
