# E2E Test Suite — Progress

**Branch:** `e2e-tests`
**Goal:** Playwright E2E tests for every core workflow. Each test must verify data
**actually persisted** by re-fetching after the action (direct Supabase query and/or
page reload), not just asserting the success toast. Run the suite, fix every failure.
Work in small increments; commit after each test file or fix; keep this file authoritative
so any session can resume from it alone.

---

## ⚠️ ACTIVE BLOCKER (resolve first)

Provisioning the **dedicated isolated test account** (user's chosen approach) is blocked:

- `.env` contains only the Supabase **anon key** — no `SUPABASE_SERVICE_ROLE_KEY`.
- Production RLS **blocks client-side INSERT into `profiles`** (verified: anon-key insert
  returns "new row violates row-level security policy"; no auto-create trigger fires —
  the user row has no profile). Without a `profiles` row, the app can't resolve the
  account's company/role, so the account can't drive the app.
- `scripts/seed-e2e.js` therefore got as far as creating the auth user
  (`e2e@coresite.io`, uid `33919449-ae41-49f7-b461-75455e718a73`) and an **orphaned
  company** (`fa3af603-f539-492d-9841-bb49f720987f`) before failing on the profile insert.

**Decision needed (asked to user):** provide a `SUPABASE_SERVICE_ROLE_KEY` in `.env` so
the seed script can provision profile/managers/project cleanly and tests can set
up/tear down isolated data — OR fall back to the existing `demo@coresite.io` account.

**When unblocked:**
- If service-role key provided → add `SUPABASE_SERVICE_ROLE_KEY=...` to `.env`, then
  update `scripts/seed-e2e.js` to use a service-role client for the profile/managers/
  project inserts (bypasses RLS), and clean up the orphaned company above. Re-run
  `node scripts/seed-e2e.js`.
- If falling back to demo → set `E2E_EMAIL=demo@coresite.io` / `E2E_PASSWORD=Demo2026!`
  in `.env`. NOTE: normal UI login does NOT trigger sandbox no-op mode (that needs the
  `sandbox_mode` sessionStorage flag set by SandboxEntry), so writes WILL persist to the
  demo company. Tests must self-clean with a unique marker per run.

---

## Done

- ✅ Branched `e2e-tests` off `main`.
- ✅ Installed `@playwright/test` + Chromium (headless shell v1223) + `dotenv` (dev deps).
- ✅ `playwright.config.js`: serial (workers:1) against `http://localhost:5173`, auto-starts
  `npm run dev`, `setup` project logs in once and saves storage state, `chromium` project
  reuses it. HTML + list reporters.
- ✅ `.gitignore`: ignores `test-results/`, `playwright-report/`, `e2e/.auth/` (auth state
  holds a live token), playwright caches.
- ✅ `.env`: added `E2E_EMAIL` / `E2E_PASSWORD` (gitignored).
- ✅ `scripts/seed-e2e.js`: idempotent provisioner (currently blocked — see above).

## In progress

- 🔄 Provisioning the dedicated test account (blocked — awaiting service-role key decision).

## Next (in order)

1. Unblock account provisioning (see blocker). Verify `node scripts/seed-e2e.js` prints
   `=== E2E account ready ===` with company_id + project_id.
2. `e2e/auth.setup.js` — UI login as test account, save `e2e/.auth/admin.json`.
3. `e2e/helpers/db.js` — node Supabase client (signs in as test account) for re-fetch
   verification + per-test cleanup helpers; `e2e/helpers/ids.js` to resolve company/project
   IDs at runtime (don't hardcode).
4. Workflow test files (one per increment, commit each). Each: do the action in the UI,
   then **re-fetch from Supabase** and assert the row exists/changed/was deleted:
   - [ ] `auth.spec.js` — login success, bad-password failure, **session expiry** (clear/age
         the token, assert app forces re-login rather than firing tokenless requests).
   - [ ] `induction.spec.js` — complete an induction → operative/induction row persisted.
   - [ ] `rams-signoff.spec.js` — sign off RAMS → signature row persisted.
   - [ ] `toolbox-talk.spec.js` — create a toolbox talk, sign it → talk + signature rows.
   - [ ] `attendance.spec.js` — QR attendance sign-in → site_attendance row persisted.
   - [ ] `plant.spec.js` — create / **edit** / delete plant → re-fetch each step.
         (Edit MUST assert changed fields persist — directly covers AUDIT.md §2.1.)
   - [ ] `snag.spec.js` — raise / edit / close a snag → re-fetch each step.
   - [ ] `hs-report.spec.js` — generate weekly H&S report → assert report/output persisted.
   - [ ] `pdf-export.spec.js` — PDF exports produce a non-empty PDF (download assertion).
5. Run full suite; fix every failure; commit each fix referencing the spec.
6. Add an `npm run test:e2e` script to package.json.

## Key facts for whoever resumes

- App: Vite + React 19 SPA, Supabase backend (single LIVE project — no staging DB).
- Supabase URL/anon key live in `.env` (gitignored). Demo account: `demo@coresite.io` /
  `Demo2026!`.
- Login UI: PM/manager login is `/pm-login` (component `src/pages/PMLogin.jsx`); operative
  login `src/pages/OperativeLogin.jsx`. App shell lives under `/app`.
- Re-fetch verification = the whole point; prefer a direct Supabase query in
  `e2e/helpers/db.js` over trusting the UI (UI may show optimistic/stale state — see AUDIT.md).
- Relevant audit findings the tests should catch if regressions reappear: §2.1 (plant edit
  drops fields), §2.x (unchecked writes that toast success but don't persist), §6.x (offline
  sync loses writes).
- Run a single spec: `npx playwright test e2e/plant.spec.js`. Debug: `--headed --debug`.
