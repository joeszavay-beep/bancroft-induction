import { defineConfig } from 'vitest/config'

// Unit tests live next to the API handlers (api/**/*.test.js). The Playwright
// E2E specs (e2e/**/*.spec.js) are run by `npm run test:e2e`, NOT vitest —
// scope the include so vitest never tries to load a Playwright spec.
export default defineConfig({
  test: {
    include: ['api/**/*.test.js'],
    environment: 'node',
  },
})
