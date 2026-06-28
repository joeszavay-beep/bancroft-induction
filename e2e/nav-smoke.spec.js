import { test, expect } from '@playwright/test'

/**
 * Nav smoke for the data-router migration (<BrowserRouter> -> createBrowserRouter
 * splat + <RouterProvider>, AUDIT §2.5 Guard 2). A ~10-line routing-entry-point
 * change has app-wide blast radius, so this asserts every route group still
 * resolves, plus the in-app unsaved-changes guard (no false block on a clean
 * page; blocks + "Stay" on a dirty page).
 */

test('route groups cold-load under the data router', async ({ page }) => {
  // Public route
  await page.goto('/why')
  await expect(page).toHaveURL(/\/why/)

  // /app/* authed pages — deep-link cold loads (the migration's main risk:
  // does the splat data route + descendant <Routes> still resolve each path?)
  await page.goto('/app/dashboard')
  await expect(page).toHaveURL(/\/app\/dashboard/)

  await page.goto('/app/workers')
  await expect(page).toHaveURL(/\/app\/workers/)

  await page.goto('/app/procurement-scheduler')
  await expect(page.getByRole('heading', { name: 'Procurement Schedule' })).toBeVisible({ timeout: 15_000 })

  // Worker route group (loads, or redirects within the /worker* group)
  await page.goto('/worker')
  await expect(page).toHaveURL(/worker/)

  // Legacy <Navigate> redirect still works under the data router
  await page.goto('/pm')
  await expect(page).toHaveURL(/\/app\/dashboard/)
})

test('clean page: in-app nav proceeds with no unsaved-changes prompt', async ({ page }) => {
  await page.goto('/app/procurement-scheduler')
  await expect(page.getByRole('heading', { name: 'Procurement Schedule' })).toBeVisible({ timeout: 15_000 })

  // Sidebar navigation on a clean page must NOT show the guard modal (useBlocker
  // returns false when not dirty — no false "unsaved changes" prompt).
  const navBtn = page.getByRole('button', { name: 'Document Hub' })
  await expect(navBtn).toBeVisible({ timeout: 10_000 })
  // Retry the click until it registers (guards against an early click landing
  // before React attaches the handler post-hydration). If the page were wrongly
  // dirty, this would loop+time out instead of passing — so it also proves the
  // clean page is NOT blocked.
  await expect(async () => {
    await navBtn.click()
    await expect(page).toHaveURL(/\/app\/document-hub/, { timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
  await expect(page.getByTestId('nav-block-stay')).toHaveCount(0)
})

test('dirty page: in-app nav is blocked, "Stay" keeps you on the page', async ({ page }) => {
  await page.goto('/app/procurement-scheduler')
  await expect(page.getByRole('heading', { name: 'Procurement Schedule' })).toBeVisible({ timeout: 15_000 })

  // Autosave (and the dirty flag) only runs with a project selected.
  const projSel = page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'All Projects' }) })
  const optionCount = await projSel.locator('option').count()
  test.skip(optionCount < 2, 'no projects in the test company to exercise the dirty path')
  await projSel.selectOption({ index: 1 })
  await page.waitForTimeout(1500) // let the schedule load + its skipped initial autosave settle

  // Edit a header field -> dirty, then navigate within the debounce window.
  await page.locator('label:text-is("Project") + input').first().fill('NAV-GUARD-DIRTY')
  await page.getByText('Document Hub', { exact: true }).first().click()

  const stay = page.getByTestId('nav-block-stay')
  await expect(stay).toBeVisible({ timeout: 5_000 })
  await stay.click()
  await expect(page).toHaveURL(/\/app\/procurement-scheduler/)
})
