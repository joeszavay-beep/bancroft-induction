# E2E Test Suite — Progress

**Branch:** `e2e-tests`
**Goal:** Playwright E2E tests for every core workflow. Each test must verify data
**actually persisted** by re-fetching after the action (direct Supabase query and/or
page reload), not just asserting the success toast. Run the suite, fix every failure.
Work in small increments; commit after each test file or fix; keep this file authoritative
so any session can resume from it alone.

---

## 🟠 §5.19 — INTERIM FIX APPLIED + VERIFIED (2026-06-16); DURABLE FOLLOW-UP PENDING

**Operative RLS scoping is forgeable via user-writable `user_metadata`.** The applied 2026-06-15
lockdown scopes nearly every table via `get_my_company_id()` / `get_operative_company_id()`, which
resolve identity from `auth.jwt() -> 'user_metadata' ->> 'operative_id'`. `user_metadata` is
user-writable (`supabase.auth.updateUser({ data })`), so any **authenticated** user who knows a real
operative UUID in a victim company can inject it, refresh their token, and gain cross-tenant read
(and write where `co_insert`/`co_update` exist) — defeating the tenant isolation the lockdown enforces.
Authenticated-only and needs a genuine operative UUID (anon cannot), but still CRITICAL.
**Interim mitigation APPLIED + VERIFIED in prod (2026-06-16)** via
`scripts/migrations/rls-5-19-interim-email-crosscheck.sql`: the three helpers now cross-check the
injected `operative_id` against the verified, non-forgeable JWT `email` claim (`mailer_autoconfirm=false`
confirmed live). Deliberate apply: live-capture → dry-run/ROLLBACK → `BEGIN`/`COMMIT` → re-capture
confirmed → `RLS_LOCKDOWN_APPLIED=1` E2E **35/35 green** (operatives still resolve, anon still denied).
**DURABLE fix still PENDING: add `operatives.auth_user_id` FK + redefine helpers via `auth.uid()`,
dropping `user_metadata` trust entirely — also closes the §5.17 duplicate-email residual and underlies
§4.1/§4.2.** See AUDIT.md §5.19.

---

## 🔧 §4.x SECURITY REMEDIATION — IN FLIGHT (2026-06-16)

**Three PRs pushed, NOT yet opened/merged** (open on GitHub; the PR triggers the Playwright CI gate):
- `fix/cron-auth-4-4` — §4.4: cron endpoints require `CRON_SECRET`; spoofable `x-vercel-cron`/UA shortcut removed. vitest 8/8. **Merge FIRST** (carries `vitest.config.js` + the `test:unit` script).
- `fix/holiday-approval-4-3` — §4.3: approve/reject requires a verified JWT (cancel/reassign untouched). vitest 7/7. Merge after PR 1.
- `docs/audit-5-19-operative-rls-forgeable` — §5.19 finding + interim migration/rollback + §5.20 gate + verified status. **Record-only: the §5.19 SQL is already LIVE in prod.**

**§5.19 interim = APPLIED + VERIFIED live** (see the §5.19 block above; 35/35 E2E).

**NEXT MAJOR PIECE — durable `auth_user_id` fix (PLAN-FIRST at xhigh; owner walkthrough before any apply):**
Add `operatives.auth_user_id` FK + redefine `get_my_operative_id` / `get_operative_company_id` /
`get_my_company_id` to resolve via `auth.uid()`, dropping `user_metadata` trust entirely. Retires the
§5.19 interim, closes the §5.17 duplicate-email residual, and is the SAME foundation as **§4.1/§4.2**
(operative-session-is-own-UUID + email-change account takeover) and client **§1.11** (route operative
pages through `authFetch`). Also fold in **§1.10** (operative session never expires) as a separate PR.
Requires a prod migration + a backfill with duplicate-email/unlinkable operatives resolved MANUALLY by
the owner. **Not started.**

---

## 🚨 BLOCKING GATES (2026-06-15) — clear BEFORE onboarding any customer beyond the current trial

**Gate 1 — Agency search+connect UNVERIFIED in the locked state.** The 2026-06-15 RLS lockdown
re-scopes `agencies` from `USING(true)` to own+connected (via `get_my_agency_ids()`), moving
marketplace discovery to the `search_agencies` RPC. This flow has **zero E2E coverage**
(`seed-e2e.js` seeds no agency data; `rls-lockdown-verification.spec.js` only checks anon is
*denied* `agency_operatives`) and **could not be manually tested** (no agency exists in prod).
**MUST verify before onboarding the first agency** — either (a) seed a throwaway agency + 2nd
company + connection and walk search+connect in the locked state, or (b) add a self-seeding agency
E2E spec to the `RLS_LOCKDOWN_APPLIED=1` suite. Shipped without it because there are zero agency
users in prod (zero blast radius) and the failure mode is fail-closed (breakage, not a leak).
See AUDIT.md §5.7c.

**Gate 2 — Rotate secrets.** Rotate `SUPABASE_SERVICE_ROLE_KEY` + update local `.env` and the
Vercel env; also rotate/flag the shared `demo@coresite.io` password shipped in the JS bundle.
**BEFORE onboarding any new customer beyond the current trial.** See AUDIT.md §5.18.

**Gate 3 — Self-service signup broken by Confirm-email (§5.20).** The §5.19 fix requires Supabase
"Confirm email" ON (`mailer_autoconfirm=false`, set 2026-06-16). With it on, `Signup.jsx`'s
`signUp → immediate signInWithPassword` fails with "Email not confirmed", so self-service company
signup throws + orphans an auth user. Admin-created accounts (`email_confirm:true`) are unaffected.
**Do NOT disable Confirm-email to fix it — that reopens §5.19.** Move signup to an admin-confirmed
endpoint or a confirm-your-email UX **before onboarding any new company.** See AUDIT.md §5.20.

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

## Status: COMPLETE — all bugs fixed, suite fully green

All 9 workflow specs written. `npm run test:e2e` runs the suite.
**22/22 passing** (was 18/18; +2 auth tests for the §1.7 refinement, +1 induction
test for the PMDashboard.jsx:710 sign-off %, +1 sandbox-leak test §1.6).

### Branches
- `e2e-tests` → **PR #1** (https://github.com/joeszavay-beep/bancroft-induction/pull/1):
  the E2E suite + the 3 caught bugs (§2.24/§1.7/§2.1) + §1.7 refinement. Awaiting merge.
- `audit-fixes-2` (off e2e-tests, **not pushed**): the 2026-06-10 audit-fix batch below
  + the verified RLS findings + RLS-REMEDIATION-PLAN.md.
- `rls-public-page-rpcs` (off audit-fixes-2, **not pushed**): RLS Steps 1–3 — the
  public-page RPCs (`rls-deploy3b-public-rpcs.sql`, deployed to prod by owner) +
  all 8 public pages migrated to them + anon E2E gates. `retries:1` added for
  live-DB latency. Suite green (now ~27 tests). NO policy change / lockdown yet.

### RLS public-page migration (rls-public-page-rpcs branch)
All 8 public pages now read/write via SECURITY DEFINER RPCs instead of direct
anon table access, so they keep working after the lockdown removes anon table
access. Committed per page, full suite green each time:
1. ToolboxSign → get_toolbox_for_signing / submit_toolbox_signature
2. Portal → get_portal_data
3. SnagReply → get_snag_for_reply / submit_snag_comment / submit_snag_reply
4. AftercarePage → get_project_public_info / get_aftercare_defects / submit_aftercare_defect
5. PMLogin email routing → resolve_login_route (also removes an anon profiles/operatives disclosure)
6. EquipmentCheck → get_equipment_public_check
7. OperativeProfile + OperativeGuard → get_operative_for_setup / complete_operative_setup
8. SiteSignIn → get_project_public_info / get_operative_public_info / operative_exists_by_email
**NEXT = Step 5 (lockdown), owner-approved separately.** See RLS-REMEDIATION-PLAN.md
"PROGRESS" header for what Step 5 still needs (SQL patches + post-lockdown anon-denied
E2E assertions + apply in a window).

### 2026-06-10 session — audit-fixes-2 batch
- **RLS exposure CONFIRMED LIVE** (owner-authorized read-only probe): production runs the
  permissive policy set — the public anon key reads across ALL tenants (operatives 57/4 cos,
  signatures 172/3, projects 13/5, attendance 500/3, +13 tables) and lists documents/
  floor-plans buckets. §5.1/5.2/5.9 confirmed; §5.3 (anon write/delete) confirmed read-only
  via the captured live snapshot in rls-lockdown-rollback.sql. §5.4 already gone
  (managers.password column absent). Full remediation runbook: **RLS-REMEDIATION-PLAN.md**
  (analysis only — NO prod change until owner approves; deploy4 breaks every public page
  today because the client calls ZERO of the public RPCs). AUDIT.md §5 updated.
- **§1.2** authFetch: refresh when token absent OR within 30s of expiry (was: only when
  absent). §1.1 single-flight NOT added — supabase-js v2.101 serialises refreshes via its
  navigator lock + refreshingDeferred (documented in AUDIT §1.1 RE-ASSESSED).
- **§1.4** demo authFetch returns 403 (was 200) so res.ok gating sees the block.
- **§1.5** demo supabase proxy fake chain now covers the full builder surface (no more
  "x is not a function" mid-demo); success-shaped result kept on purpose.
- **§1.6** (the real "edits don't save" leak): setupFromAuth clears sandbox_mode for any
  non-demo session; clearState clears it on logout. Keyed off DEMO_EMAIL. New E2E test.

### 2026-06-10 session
- **§1.7 REFINED** (see AUDIT.md §1.7 "REFINED"): `checkSession` now distinguishes
  network-level failures (AuthRetryableFetchError / 5s race timeout → treat as
  offline, use cache fallback even when navigator.onLine is true) from definitive
  server verdicts (AuthApiError invalid/expired refresh token, AuthSessionMissingError
  → /login). New `isAuthNetworkError()` in CompanyContext.jsx; step-2 refreshSession
  is skipped after a network failure (would only re-fail after backoff). Two new
  e2e/auth.spec.js tests: auth endpoint aborted → cached fallback admits;
  server-rejected stale refresh token → /login.
- **PMDashboard.jsx:710 now covered**: induction.spec.js (now serial) asserts the
  projects-tab E2E Site card shows a non-zero sign-off % after the operative signs.
- **Flake note**: one full-suite run had toolbox sign's 10s DB poll expire while the
  submit (dup-check + storage upload + insert against live Supabase) was still in
  flight; green in isolation and on re-run. If it recurs, bump that toPass timeout.
- **§2.24 compliance investigation** (no code change): bug introduced 2026-03-30
  21:46 +0100 (commit 4094e5b, both ToolboxSign/ToolboxTalkLive created broken,
  pushed to main same minute). Production still broken until this branch deploys.
  Since that date: 15 talks; the only signatures are demo-company rows inserted by
  seed scripts; the single organic real-customer talk ("TEST", Thomas Worley
  Electrical LTD, 2026-05-22, talk a00a5bee-27c7-4ab6-9b52-467a72d523a6) has zero
  signatures despite 18 eligible operatives — corroborates the bug.

The 3 bugs the E2E suite caught are now FIXED (all documented in AUDIT.md):
- §2.24 toolbox signing — ToolboxSign/ToolboxTalkLive queried non-existent
  operatives.project_id; now use the operative_projects junction. (Same mistake
  also fixed in PMDashboard.jsx:710 per-project sign-off %.)
- §1.7 session expiry — guards trusted the pm_auth flag; now require a verified
  Supabase session online (pm_auth trusted only offline), and CompanyContext only
  falls back to cached/stored auth when offline.
- §2.1 plant edit — PATCH read snake_case keys the client never sends; now maps
  camelCase->columns (projectId deliberately excluded to avoid the §2.2 clobber).

Also fixed test-infra flakiness: vite-api-plugin caches the handler import instead
of re-importing @supabase-js per request.

NOT YET PUSHED — awaiting user review.

### Suite status: fully green — no KNOWN-RED remain
- The former KNOWN-RED trio — plant edit (§2.1), auth session-expiry (§1.7),
  toolbox sign (§2.24) — are all fixed in app code and their tests now assert the
  fixed behaviour.

### Important test-infra notes for whoever resumes
- Playwright storageState persists localStorage but NOT sessionStorage. On web the
  app stores pm_auth/manager_data in sessionStorage, so auth.setup.js copies all
  sessionStorage→localStorage before saving state (getSession reads localStorage
  first). Without this, manager_data is null on reused contexts and project-scoped
  pages break.
- seed-e2e.js sets the admin auth user's user_metadata.company_id and managers.project_ids
  so setupFromAuth writes a complete manager_data on login.
- operatives has NO project_id column (use operative_projects junction). The seeded
  operative is linked via operative_projects; the operatives.project_id update in
  seed-e2e.js is a harmless no-op kept only for older schemas.

## Next (in order)

1. Workflow test files (one per increment, commit each). Each: do the action in the UI,
   then **re-fetch from Supabase** and assert the row exists/changed/was deleted:
   - [x] `auth.spec.js` — login success (DB session token verified), bad-password
         rejection, logged-out→/login redirect: all GREEN. Session-expiry test
         (stale pm_auth flag, no live session) is **KNOWN-RED** — reproduces
         AUDIT §1.7 (app admits a dead session instead of forcing re-login).
   - [x] `induction.spec.js` — operative signs all project docs via the documents
         hub → "induction complete" shown; DB verifies every project doc has a
         valid signature. GREEN. (induction = all required docs signed; derived,
         no separate table.)
   - [x] `rams.spec.js` — operative signs a RAMS document (DOB + signature canvas);
         re-fetches the signatures row. GREEN. (seed provisions an 'E2E RAMS'
         document with null file_url so the read-gate is skipped.)
   - [x] `toolbox.spec.js` — PM create persists (GREEN); operative sign is
         **KNOWN-RED** (AUDIT §2.24: ToolboxSign queries non-existent
         operatives.project_id → operatives never load → "All operatives have
         signed" → nobody can sign).
   - [x] `attendance.spec.js` — worker logs in at /site/:projectId and taps SIGN IN;
         re-fetches the latest site_attendance row (type=sign_in). GREEN.
         (seed-e2e.js now provisions an operative: E2E_WORKER_EMAIL/PASSWORD in .env,
         operatives row + auth user + project link.)
   - [x] `plant.spec.js` — create / edit / delete, each DB-re-fetched. **create + delete
         GREEN; edit is KNOWN-RED** — reproduces AUDIT.md §2.1 live (PATCH drops
         camelCase fields). Left red on purpose; do NOT fix app code without telling user.
   - [x] `snag.spec.js` — raise (pin on seeded drawing) / edit / close, each
         DB-re-fetched. All GREEN. (seed-e2e.js now also provisions an "E2E
         Drawing" with an uploaded image fixture: e2e/fixtures/drawing.png.)
   - [x] `hs-report.spec.js` — Generate PDF; captures the download and asserts a
         valid non-empty PDF (%PDF header). GREEN. (HS report has no DB row — it's
         a generated PDF, so persistence = a real PDF is produced.)
   - [x] `pdf-export.spec.js` — snag drawing export (generateSnagPDF); captures the
         download and asserts a valid non-empty PDF. GREEN.
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
