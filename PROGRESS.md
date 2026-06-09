# E2E Test Suite — Progress

**Branch:** `e2e-tests`
**Goal:** Playwright E2E tests for every core workflow. Each test must verify data
**actually persisted** by re-fetching after the action (direct Supabase query and/or
page reload), not just asserting the success toast. Run the suite, fix every failure.
Work in small increments; commit after each test file or fix; keep this file authoritative
so any session can resume from it alone.

---

## ✅ UNBLOCKED (2026-06-09)

Service-role key added to `.env` (Node-only). `node scripts/seed-e2e.js` succeeded:
- email `e2e@coresite.io`, user_id `33919449-ae41-49f7-b461-75455e718a73`
- company_id `d2533a5c-9eb0-45aa-a068-e143db4531a1` ("E2E Test Co")
- project_id `0d02e514-ad3f-4301-ba63-6650f48d09f7` ("E2E Site")
Note: the `.env` anon key had been corrupted by manual edits — restored from the
known-good value hardcoded in scripts/seed-demo.js. If "Invalid API key" ever
reappears, diff `.env` against that script first.

<details><summary>Old blocker notes (resolved)</summary>

## ⚠️ ACTIVE BLOCKER — ONE STEP (do this first)

**Decision made:** dedicated isolated test account, provisioned via a **service-role key
used Node-side only** (never `VITE_`-prefixed, never imported by the app or browser-context
test code).

**The single remaining step:** add the key to the gitignored `.env`:

```
SUPABASE_SERVICE_ROLE_KEY=<service_role key from Supabase → Project Settings → API>
```

Then run `node scripts/seed-e2e.js` — it should print `=== E2E account ready ===` with a
`company_id` and `project_id`. The seed script is **already written to use the admin client**
for the RLS-blocked inserts and to auto-clean orphaned E2E companies, so no code change is
needed once the key lands.

Background (why this was needed): production RLS blocks anon-key INSERT into `profiles`
(verified), and no auto-create trigger fires, so the anon key alone cannot provision a
usable account. Earlier failed run left auth user `e2e@coresite.io`
(uid `33919449-ae41-49f7-b461-75455e718a73`) + an orphaned company
(`fa3af603-f539-492d-9841-bb49f720987f`); `seed-e2e.js` now deletes such orphans on re-run.

Fallback if the key can't be provided: set `E2E_EMAIL=demo@coresite.io` /
`E2E_PASSWORD=Demo2026!` in `.env` (the demo account already has a working profile). Normal
UI login does NOT trigger sandbox no-op mode, so writes persist to the demo company — tests
must self-clean with a unique per-run marker.

</details>

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
- ✅ `scripts/seed-e2e.js`: idempotent provisioner using a Node-only **admin (service-role)
  client** for the RLS-blocked profile/managers/project inserts + orphan cleanup. Ready to
  run the moment the key is in `.env`.

- ✅ Account provisioned (see above). `e2e/auth.setup.js` passes — logs in through the
  real multi-step UI and saves `e2e/.auth/admin.json`. Includes a fill-then-verify
  `toPass()` guard: on cold Vite starts a fill can land before React mounts and the
  controlled input clobbers it (this WILL bite any new spec that types into a form
  straight after `goto` — reuse the same pattern or land on a loaded page first).
- ✅ `vite-api-plugin.js`: dev-only Vite middleware that executes `/api/*` serverless
  functions in-process (Vite alone serves them as static source). REQUIRED for any
  authFetch('/api/...') flow under `npm run dev`. Runs the real handler code.
- ✅ `e2e/helpers/db.js` — anon-key client signed in as the test user (RLS-honest
  re-fetch), `getIds()` runtime id resolution, `fetchRow`/`deleteRows`/`runMarker`.

## In progress

- 🔄 Workflow specs. Done: plant, auth, snag. Next up: induction, rams-signoff,
  toolbox-talk, attendance, hs-report, pdf-export.

## Next (in order)

1. Workflow test files (one per increment, commit each). Each: do the action in the UI,
   then **re-fetch from Supabase** and assert the row exists/changed/was deleted:
   - [x] `auth.spec.js` — login success (DB session token verified), bad-password
         rejection, logged-out→/login redirect: all GREEN. Session-expiry test
         (stale pm_auth flag, no live session) is **KNOWN-RED** — reproduces
         AUDIT §1.7 (app admits a dead session instead of forcing re-login).
   - [ ] `induction.spec.js` — complete an induction → operative/induction row persisted.
   - [ ] `rams-signoff.spec.js` — sign off RAMS → signature row persisted.
   - [ ] `toolbox-talk.spec.js` — create a toolbox talk, sign it → talk + signature rows.
   - [ ] `attendance.spec.js` — QR attendance sign-in → site_attendance row persisted.
   - [x] `plant.spec.js` — create / edit / delete, each DB-re-fetched. **create + delete
         GREEN; edit is KNOWN-RED** — reproduces AUDIT.md §2.1 live (PATCH drops
         camelCase fields). Left red on purpose; do NOT fix app code without telling user.
   - [x] `snag.spec.js` — raise (pin on seeded drawing) / edit / close, each
         DB-re-fetched. All GREEN. (seed-e2e.js now also provisions an "E2E
         Drawing" with an uploaded image fixture: e2e/fixtures/drawing.png.)
   - [ ] `hs-report.spec.js` — generate weekly H&S report → assert report/output persisted.
   - [ ] `pdf-export.spec.js` — PDF exports produce a non-empty PDF (download assertion).
5. Run full suite; fix every failure; commit each fix referencing the spec.
6. Add an `npm run test:e2e` script to package.json.

## Key facts for whoever resumes

- App: Vite + React 19 SPA, Supabase backend (single LIVE project — no staging DB).
- Supabase URL/anon key live in `.env` (gitignored). Demo account: `demo@coresite.io` /
  `Demo2026!`.
- Login UI: route is **`/login`** (`/pm-login` redirects there). Component `PMLogin.jsx`.
  It is a **multi-step flow**, NOT a single form:
    1. `/login` shows an email input (`input[type=email]`, autofocus) — enter email, submit.
    2. App detects the account → shows manager/worker choice buttons (PMLogin.jsx:221 manager,
       :233 worker). Click the **manager** button.
    3. Password step: `input[type=password]` (PMLogin.jsx:283) + submit `LoadingButton`.
    4. On success manager → `navigate('/app')` (PMLogin.jsx:86); worker → `/worker` (:134).
  `auth.setup.js` must drive all steps (or assert and adapt — verify live, the exact email-
  detection branch may differ for a brand-new account). App shell is under `/app`; worker
  app under `/worker`. Worker login route: `/worker-login` (`OperativeLogin.jsx`).
  Auth = `supabase.auth.signInWithPassword` (PMLogin.jsx:102).
- Re-fetch verification = the whole point; prefer a direct Supabase query in
  `e2e/helpers/db.js` over trusting the UI (UI may show optimistic/stale state — see AUDIT.md).
- Relevant audit findings the tests should catch if regressions reappear: §2.1 (plant edit
  drops fields), §2.x (unchecked writes that toast success but don't persist), §6.x (offline
  sync loses writes).
- Run a single spec: `npx playwright test e2e/plant.spec.js`. Debug: `--headed --debug`.
