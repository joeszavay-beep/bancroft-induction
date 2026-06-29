import { defineConfig } from 'vitest/config'

// Unit tests live next to the API handlers (api/**/*.test.js) and the H&S report
// libraries (src/lib/hsReport/**/*.test.js). The Playwright E2E specs
// (e2e/**/*.spec.js) are run by `npm run test:e2e`, NOT vitest. (src/lib/dates and
// programmeCalc carry their own standalone test scripts — not vitest suites — so
// they are deliberately NOT globbed here.)
export default defineConfig({
  test: {
    include: ['api/**/*.test.js', 'src/lib/hsReport/**/*.test.js'],
    environment: 'node',
  },
})
