import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

// Load .env (Supabase creds + E2E test account credentials)
dotenv.config()

const PORT = 5173
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // E2E tests hit a shared live Supabase, so run serially to avoid cross-test
  // interference on the single dedicated test company.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // The suite runs serially against a SHARED LIVE Supabase, so individual tests
  // occasionally time out waiting for a UI element under network/DB latency
  // (a different test each run, never a logic failure — those fail on retry too).
  // One retry absorbs those latency blips without masking real regressions.
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Logs in once via the real UI and saves the authenticated storage state.
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
      // auth.setup.js is matched by the setup project; exclude it here.
      testIgnore: /auth\.setup\.js/,
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
