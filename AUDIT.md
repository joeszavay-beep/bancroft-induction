# Codebase Audit — bancroft-induction (CoreSite)

**Date:** 2026-06-09
**Scope:** Full audit — auth lifecycle, data mutations, forms, API routes, database/RLS, async/race conditions.
**Method:** Systematic sweep by focus area; all CRITICAL findings were independently re-verified against source. Nothing has been fixed yet — report only.

**Severity key:** CRITICAL = auth bypass / silent data loss / cross-tenant exposure · HIGH = frequent user-facing breakage · MEDIUM = edge-case breakage · LOW = minor.

---

## Headline answers to the two reported symptoms

**"Editing plant appears to save but doesn't update"** → confirmed root cause: **Issue 2.1**. The client sends camelCase keys (`serialNumber`, `hireCompany`, `onHireDate`, `hireRate`, …) but the PATCH handler in `api/plant-equipment.js` only copies snake_case keys from the body. The only keys both sides agree on are `description` and `type` — every other field is silently dropped, the API returns `{ success: true }`, and the UI toasts "Updated" then refetches the old values.

**"Authorisation token errors"** → most likely **Issue 1.1** (concurrent `refreshSession()` calls — Supabase rotates refresh tokens, so parallel refreshes invalidate each other and produce "Invalid Refresh Token" errors / forced logouts), compounded by **1.7** (guards trust a storage flag with no live session, so the app keeps firing tokenless requests instead of returning to login), 1.2–1.3, 1.13, and the service worker caching `/auth/` responses (6.10).

A second silent-save path worth checking with affected users: **1.6** — anyone who has ever opened the sandbox demo in a tab and then logged in normally has every write in that tab faked as successful.

---

## 1. AUTH — token lifecycle

### 1.1 [CRITICAL] Concurrent `refreshSession()` calls with no single-flight lock
- **File:** `src/lib/authFetch.js:24` and `src/lib/authFetch.js:40`
- **Issue:** Every `authFetch` call independently calls `supabase.auth.refreshSession()` when it sees no token (line 24) or a 401 (line 40). Pages that fire several `authFetch` calls in parallel (e.g. dashboard loads using `Promise.all`) each trigger their own refresh. Supabase rotates refresh tokens on every refresh, so the second concurrent refresh presents an already-consumed refresh token → "Invalid Refresh Token: Already Used" → session destroyed and the user is logged out / sees token errors. This is the classic cause of intermittent "authorisation token errors".
- **Fix:** Add a module-level single-flight: store the in-progress refresh promise (`let refreshPromise = null; refreshPromise ??= supabase.auth.refreshSession().finally(() => refreshPromise = null)`) and have all callers await the same promise. Better still, rely on supabase-js's built-in `autoRefreshToken` and only call `refreshSession()` from this one wrapper.
- **RE-ASSESSED (2026-06-10) — LIBRARY-MITIGATED on the installed version:** verified against `@supabase/supabase-js` **v2.101.0** (`node_modules/@supabase/auth-js/dist/module/GoTrueClient.js`): in a browser with `persistSession` (default) and `navigator.locks` available, `createClient` installs `navigatorLock` (constructor `:136`) which **serialises** `getSession`/`refreshSession` under `lock:sb-<ref>-auth-token`, and `_callRefreshToken` (`:3861`) dedupes any genuinely concurrent refresh via `refreshingDeferred`. So parallel `authFetch` refreshes don't each consume a different rotated token — each acquires the lock, re-reads the latest session, and refreshes with the current refresh token. The "Invalid Refresh Token: Already Used" race this describes is prevented at the library level here; no app-level single-flight added. (Re-check if supabase-js is ever downgraded or a custom no-op `lock` is configured.) The real residual was §1.2 (refresh only when token absent), now fixed.

### 1.2 [HIGH] Expired-but-present token treated as valid; refresh only attempted when token is absent
- **File:** `src/lib/authFetch.js:19-26`
- **Issue:** The refresh branch only runs when `!token`. `getSession()` can return a session whose `access_token` is expired or about to expire (clock skew, app resumed from background on iOS); that stale token is sent, the API returns 401, and the request relies entirely on the single retry. On the retry path any failure is silently swallowed (`catch { /* ignore */ }`) and the original 401 is returned to the caller.
- **Fix:** Check `session.expires_at` against `Date.now()` (with ~30s margin) and refresh proactively when close to expiry, with the single-flight from 1.1.
- **FIXED (2026-06-10):** `authFetch` now refreshes when the token is absent **or** within 30s of `expires_at`, so a present-but-stale token is no longer sent blind. (The §1.1 single-flight is unnecessary on this version — see §1.1 note: supabase-js v2.101 already serialises concurrent refreshes via its navigator lock + `refreshingDeferred`.)

### 1.3 [HIGH] 401 retry: fresh token can be overridden by a stale one
- **File:** `src/lib/authFetch.js:29-35` vs `:42`
- **Issue:** The 401 retry recursively calls `authFetch` passing the fresh token in `options.headers.Authorization` — but the recursive call re-reads `getSession()` and spreads its token **after** `options.headers` (`headers: { ...options.headers, ...(token ? { Authorization } : {}) }`). Whatever `getSession()` returns at that moment wins. If session storage hasn't been updated yet (or another tab wrote an older session), the explicitly-passed fresh token is overwritten and the retry 401s again — and `_retried` prevents any further attempt.
- **Fix:** In the retry, skip the token lookup when an Authorization header was explicitly provided, or invert the spread order so a caller-supplied header wins.

### 1.4 [CRITICAL] Demo-mode `authFetch` returns HTTP 200 for blocked writes — callers see success
- **File:** `src/lib/authFetch.js:12`
- **Issue:** In sandbox mode, blocked API calls return `new Response(JSON.stringify({ error: 'Demo mode' }), { status: 200 })`. Any caller that checks `res.ok` (rather than `data.error`) treats the blocked write as a success — the mutation silently never happened. If `sessionStorage.sandbox_mode` ever leaks into a real user's tab (see 1.5), every API write in that tab silently no-ops with success semantics.
- **Fix:** Return a non-2xx status (e.g. 403) so `res.ok` checks fail, and have UI handle it explicitly.
- **FIXED (2026-06-10):** the demo block now returns `status: 403`, so callers gating on `res.ok` treat a blocked write as the failure it is rather than toasting success. (Belt-and-suspenders: the leak that made this dangerous for real users is closed at root by §1.6.)

### 1.5 [CRITICAL] Demo-mode Supabase proxy fakes successful writes (`{ data: null, error: null }`)
- **File:** `src/lib/supabase.js:35-48` and `:63-66`
- **Issue:** When `sessionStorage.sandbox_mode === 'true'`, all `insert/update/delete/upsert` and storage `upload/remove` calls resolve `{ data: null, error: null }` — indistinguishable from a successful write for the many call sites that only check `error`. The fake chain also lacks most builder methods (`order`, `match`, `neq`, `maybeSingle`, `limit`, …), so code paths that chain those will throw `... is not a function` at runtime in demo mode. Any failure to clear `sandbox_mode` when a real user logs in turns the entire app into a silent no-op — "edits appear to save but don't".
- **Fix:** Have the fake chain resolve `{ data: null, error: { message: 'Demo mode' } }` so existing error checks fire; clear `sandbox_mode` on every real sign-in (`onAuthStateChange` SIGNED_IN) and on app boot when a real session exists; extend the fake chain to cover all builder methods.
- **PARTIALLY FIXED (2026-06-10):** the fake chain now covers the full builder surface (`select/eq/neq/in/is/not/or/filter/match/order/limit/range/gt/gte/lt/lte/like/ilike/contains/overlaps/returns` + terminals `single/maybeSingle/csv/then/catch/finally`), so demo paths no longer crash with "x is not a function". **Deliberately NOT changed:** the result stays success-shaped (`{ data: null, error: null }`). Resolving an error would surface failure toasts throughout a *genuine* demo (which is meant to look like it works); the actual danger — a real user faking writes — is eliminated at root by §1.6 (demo status is keyed off the demo identity, so a real session is never in demo mode). Document divergence kept intentional.

### 1.6 [CRITICAL] `sandbox_mode` survives demo exit — real users' writes silently no-op afterwards
- **File:** `src/pages/SandboxEntry.jsx:69` (set); `src/lib/CompanyContext.jsx:177-209` (`clearState`/`logout` never clear it); only cleared in `src/components/DemoBanner.jsx:11`
- **Issue:** The flag is set on demo entry and removed in exactly one place (`DemoBanner.exitDemo`). A demo user who logs out via the sidebar keeps the flag in the tab; signing in with a real account (PMLogin/`login()` never clear it either) then hits 1.4/1.5 — every write in that tab fakes success and saves nothing. This is the second plausible contributor to "edits appear to save but don't".
- **Fix:** Clear `sandbox_mode` in `CompanyContext.clearState()` and on every successful sign-in; longer term, derive demo status from the authenticated user (demo email/id) instead of a free-floating per-tab flag.
- **FIXED (2026-06-10):** `setupFromAuth` now clears `sandbox_mode` for any session whose email is not the demo account (`DEMO_EMAIL = 'demo@coresite.io'`), and `clearState()` clears it on logout. This runs on every login (the manager path goes through `CompanyContext.login → setupFromAuth`) and on every session restore, so a stray flag cannot survive into a real session — effectively keying demo status off the demo identity as the long-term fix suggests. Demo entry sets the flag *after* `setupFromAuth` runs and re-establishes it as `demo@coresite.io`, so the genuine demo is unaffected. Covered by `e2e/auth.spec.js`: "a leaked sandbox_mode flag is cleared by a real login".

### 1.7 [HIGH] Route guards accept the `pm_auth` storage flag with no live session; no global `onAuthStateChange`
- **File:** `src/App.jsx:97`, `:113`, `:121-123`; `src/lib/CompanyContext.jsx:46-76` (the only `onAuthStateChange` in src/ is `ResetPassword.jsx:42`)
- **Issue:** `AppLayout`/`NativeEntry`/`LoginGuard` treat `pm_auth === 'true'` (a plain storage flag, persisted indefinitely on native) as authenticated. When the Supabase session is expired and refresh fails, `checkSession()` falls through to IndexedDB/localStorage fallbacks and restores a "logged-in" user with no token — even while online. Every `authFetch` then 401s, and since nothing subscribes to `SIGNED_OUT`/`TOKEN_REFRESHED`, the app never reacts when supabase-js drops the session mid-use. Users see persistent token errors instead of a login screen.
- **Fix:** Subscribe to `onAuthStateChange` in `CompanyProvider`: on `SIGNED_OUT` (while online) clear state and redirect to login; sync state on `TOKEN_REFRESHED`. Use the offline fallbacks only when `navigator.onLine === false`.
- **CONFIRMED BY E2E (2026-06-09):** `e2e/auth.spec.js` sets only the `pm_auth` flag (no Supabase session) and navigates to `/app/plant-equipment`; the app stayed on that URL instead of redirecting to `/login`, proving the guard admitted a dead session.
- **FIXED (2026-06-09):** (1) the three route guards (`App.jsx` NativeEntry/LoginGuard/AppLayout) now go through `hasManagerSession(isAuthenticated)`, which trusts `pm_auth` only when `navigator.onLine === false`; online they require a verified Supabase session. (2) `CompanyContext.checkSession` now restores from the IndexedDB cache / stored `manager_data` (steps 3 & 4) only when offline, so online an absent/expired session yields `user = null` (`isAuthenticated` false). The only other `pm_auth` consumer, `storage.js hasStoredSession()`, is used solely by `BiometricGate` to decide whether to prompt biometrics (a UI gate, not a data-access authority) and was left unchanged. E2E now green.
- **REFINED (2026-06-10):** `navigator.onLine === true` doesn't guarantee Supabase is reachable (captive portals, dead WiFi, flaky cellular). `checkSession` now distinguishes the *kind* of failure: a network-level failure (supabase-js `AuthRetryableFetchError` — fetch failed, no server verdict — or our 5s race timeout) sets `networkFailed`, and the cache fallbacks run when `!navigator.onLine || networkFailed`. A definitive server verdict (invalid/expired refresh token = `AuthApiError` with a real HTTP status, or `AuthSessionMissingError` when no session exists) still lands on /login. Classification is in `isAuthNetworkError()` (`src/lib/CompanyContext.jsx`); note supabase-js keeps the stored session on retryable failures (so it can recover when the network returns) and removes it on definitive rejection — matching this split exactly. Because supabase-js internally retries a failing refresh for up to ~25s, an expired-session check on a garbage connection usually loses our 5s race rather than returning `AuthRetryableFetchError` directly — the race timeout (`SessionCheckTimeout`) is therefore an explicit network-failure signal, and a definitive verdict that arrives *after* the race (slow but reachable server) revokes the optimistic cache restore via a continuation on the original `getSession()` promise (`lateVerdict`), so a server-rejected session can't survive the session on cached credentials. Covered by two new tests in `e2e/auth.spec.js`: auth endpoint unreachable → cached fallback admits; server rejects stale refresh token (stubbed 400, deterministic) → /login.

### 1.8 [HIGH] BiometricGate "Sign out instead" doesn't sign out, and the lock is bypassable into a live session
- **File:** `src/components/BiometricGate.jsx:78-86`
- **Issue:** The button removes `pm_auth`/`manager_data`/`operative_session` keys but never calls `supabase.auth.signOut()` or clears the IndexedDB authCache. `CompanyProvider` mounts above the gate and has already restored the user (re-writing `pm_auth`), so tapping "Sign out instead" after a cancelled Face ID drops straight into `/app`; next launch the untouched Supabase session restores everything. The gate also only runs at mount — no re-lock on resume.
- **Fix:** Call the real `CompanyContext.logout()` (signOut + clearState + clear authCache) and hard-navigate to login; add an `appStateChange`/`visibilitychange` re-lock.

### 1.9 [MEDIUM] Exiting the demo leaves a live `demo@coresite.io` session with full write access
- **File:** `src/components/DemoBanner.jsx:10-15`; `src/pages/SandboxEntry.jsx:24-26`, `:69`
- **Issue:** `exitDemo()` clears the sessionStorage flag but never signs out, so on next load `checkSession()` restores the demo account as a normal manager login with the sandbox guard gone — writes really hit the shared demo company. Opening a second tab during a demo does the same (the flag is per-tab sessionStorage; the session is shared localStorage).
- **Fix:** `await supabase.auth.signOut()` + clear authCache in `exitDemo()`; key demo detection off the signed-in user, not per-tab storage.
- **§5.18 FOLLOW-UP (2026-06-22):** the demo password is `VITE_DEMO_PASSWORD` → baked into the public bundle, so it is **inherently public**; §5.18's rotation only retires the burned `Demo2026!` string and cannot make it secret. **This §1.9 lockdown is the real fix** — sign out on exit, key demo off the signed-in user, and restrict the demo account's write privileges so a public demo password is harmless. Tracked as the dedicated follow-up to §5.18's demo-password rotation.

### 1.10 [MEDIUM] Operative "session" is a never-expiring localStorage blob not tied to any auth
- **File:** `src/components/OperativeGuard.jsx:24-37`; `src/lib/storage.js:42-54`; `src/pages/OperativeLogin.jsx:68`; `src/pages/PMLogin.jsx:125`
- **Issue:** Worker pages are gated only on parsing the `operative_session` JSON blob (id/name/projects) — no expiry, no link to the Supabase session. Once the real token dies, the guard still passes but RLS-backed reads return empty: blank screens and "missing data" on shared site devices.
- **Fix:** Verify `getSession()` in `OperativeGuard.checkAccess()` and redirect to worker login when absent; stamp the blob with issued-at and expire it.

### 1.11 [MEDIUM] Operative pages call /api with raw `fetch` — no Authorization header at all
- **File:** `src/pages/HolidayRequests.jsx:72,83,94,120,147,160,172,185`; `src/pages/OperativeDashboard.jsx:850,868`; `src/pages/EquipmentCheck.jsx:78,94`
- **Issue:** These bypass `authFetch`; identity is the spoofable `operativeId`/`operativeSessionId` param (the server side of this is Issue 4.1). They keep "working" even when the user's real session is dead — masking expiry — and will all become token errors the moment the server starts requiring tokens.
- **Fix:** Route them through `authFetch` (operatives do sign in via Supabase); keep the operative id as a parameter, never as the credential. Must be done together with the 4.1 server fix.

### 1.12 [MEDIUM] SuperAdminPanel role gate races profile load — admins bounced on hard refresh
- **File:** `src/pages/SuperAdminPanel.jsx:76-83`; `src/lib/CompanyContext.jsx:81-96`
- **Issue:** The page reads `manager_data` once at mount; during startup `setupFromAuth` writes it with `role: meta.role || 'manager'` before the real role loads from `profiles`. A super admin without role metadata is read as 'manager' and redirected to /app, with no recovery (one-shot `[]`-dep effect).
- **Fix:** Gate reactively via `useCompany()` — wait for `isLoading === false` before evaluating the role.

### 1.13 [MEDIUM] Startup restore: 5s timeout skips the refresh path and wipes `project_ids`
- **File:** `src/lib/CompanyContext.jsx:19-21`, `:52`
- **Issue:** The `Promise.race` timeout rejection jumps to the outer catch, skipping the `refreshSession` step — a slow-but-recoverable session (typical on iOS app resume) is treated as absent and the user is restored from cache without a token. That cache path also writes `manager_data` as `{ ...cachedUser, project_ids: [] }`, discarding the manager's project restrictions until the next full profile load. (See also 6.11.)
- **Fix:** On timeout, retry/fall through to the refresh attempt before using cached auth; don't override `project_ids`.

### 1.14 [LOW] Refresh tokens cached unencrypted in IndexedDB and never read back
- **File:** `src/lib/CompanyContext.jsx:25`, `:36`, `:198`
- **Issue:** `cacheAuth('session', { access_token, refresh_token, ... })` is written on every login/restore but `getCachedAuth('session')` is never called — a long-lived refresh token sits readable in IndexedDB for nothing, going stale on every rotation.
- **Fix:** Stop caching the session object; cache only user/profile/company.

### 1.15 [LOW] Failed worker-account match leaves a ghost Supabase session
- **File:** `src/pages/OperativeLogin.jsx:49-53`; `src/pages/PMLogin.jsx:118-122`
- **Issue:** `signInWithPassword` succeeds, then the "No worker account found" branch errors without signing out — next load, `checkSession()` restores the session as a manager-style login.
- **Fix:** `supabase.auth.signOut()` in those early-return branches.

### 1.16 [LOW] Logout leaves cross-account residue on shared devices
- **File:** `src/lib/CompanyContext.jsx:204-209`; `src/lib/ProjectContext.jsx:7`, `:40`
- **Issue:** `logout()` clears only the authCache — `last_role`, `coresite_selected_project`, and cached IndexedDB table stores survive, so the next user on a shared site device inherits the previous user's role-routing and cached company data.
- **Fix:** Clear `last_role` and the selected project on logout; clear or namespace the offline data stores by user/company.

---

## 2. DATA MUTATIONS — "saves that don't save"

### 2.1 [CRITICAL] Plant edit PATCH drops almost every field: camelCase body vs snake_case whitelist
- **File:** `api/plant-equipment.js:357-363` (server) and `src/pages/PlantEquipment.jsx:144-156` (client)
- **Issue:** `handleSave` sends `serialNumber`, `hireCompany`, `onHireDate`, `offHireDate`, `hireRate`, `hireRatePeriod`, `inspectionIntervalDays`, `projectId` (camelCase). The PATCH handler copies only the snake_case whitelist `['description','type','serial_number','hire_company','on_hire_date','off_hire_date','daily_hire_rate','hire_rate','hire_rate_period','status','project_id','inspection_interval_days']` via `if (b[f] !== undefined)`. Intersection: `description` and `type` only. Every other edit is silently discarded; the UPDATE succeeds (writing just `updated_at` + description/type), returns `{ success: true }`, the client toasts "Updated" and refetches unchanged data. **This is the reported plant-edit bug.** The POST handler (`:281-295`) maps camelCase→snake_case correctly — PATCH was never given the same mapping.
- **Fix:** Mirror POST's mapping in PATCH (`serialNumber → serial_number`, etc., including `hireRate` → both `hire_rate` and `daily_hire_rate`).
- **CONFIRMED BY E2E (2026-06-09):** `e2e/plant.spec.js` reproduced this live — editing serial `SN-001 → SN-999` (plus hire company + rate) through the real UI then re-fetching showed the DB still held `SN-001`.
- **FIXED (2026-06-09):** the PATCH `item` handler now maps the camelCase body keys to columns (mirroring POST), so `serialNumber`, `hireCompany`, `onHireDate`, `offHireDate`, `hireRate` (→ both `hire_rate` and `daily_hire_rate`), `hireRatePeriod`, `inspectionIntervalDays` persist. `projectId` is deliberately NOT applied on edit (the client sends the page's current project context, which would clobber/move the item — AUDIT §2.2), so project assignment stays a create-time concern. E2E edit test now green.

### 2.2 [HIGH] Once 2.1 is fixed, PATCH will clobber/move `project_id`, and project reassignment skips access checks
- **File:** `src/pages/PlantEquipment.jsx:146`, `api/plant-equipment.js:358`
- **Issue:** The client always sends `projectId: projectId || null` from the page's project context, not the item's own `project_id`. Today the field-name bug drops it; once fixed, editing an item while "All Projects" is selected nulls its project (item vanishes from project views), and editing under a different project silently moves it. PATCH also never calls `verifyProjectAccess` on a new `project_id` (POST does at `:279`), so a snake_case PATCH can already assign equipment to another company's project.
- **Fix:** Omit `projectId` from the PATCH body (or send `editItem.project_id`); in the API, run `verifyProjectAccess` before accepting a `project_id` change.

### 2.3 [HIGH] Plant PATCH returns success even when 0 rows updated; defect-flow writes unchecked
- **File:** `api/plant-equipment.js:363-365`, `:324`, `:332-340`, `:377-392`
- **Issue:** The equipment UPDATE has no `.select()`, so 0-rows-affected is indistinguishable from success. The status flip to `Defective` (:324), defect resolution update, flip back to `In Service`, and notification inserts all `await` but never check `error` — a failed defect-resolution still returns `{ success: true }` ("Defect resolved" toast) while the defect stays open and the equipment stays locked.
- **Fix:** Append `.select('id').single()` and 404/500 on no row; check `{ error }` on every secondary write.

### 2.4 [CRITICAL] Chat messages: insert result discarded, optimistic bubble masks lost messages
- **File:** `src/pages/Chat.jsx:169` (manager side); `src/pages/OperativeDashboard.jsx:199-211` (worker side)
- **Issue:** Both `sendMessage` implementations append an optimistic temp message then `await supabase.from('chat_messages').insert(...)` with the result discarded — no error check, no toast, no rollback. Failed inserts (RLS, network) look sent and vanish on reload; the other party never receives them. Photo-upload failure on Chat.jsx:140 silently sends with `photo_url: null` while the bubble shows the local preview.
- **Fix:** Destructure `{ data, error }`; on error remove the temp bubble, restore the input, toast; on success replace the temp message with the returned row.

### 2.5 [CRITICAL] Procurement schedule autosave fails silently — wholesale data loss possible
- **File:** `src/pages/ProcurementScheduler.jsx:185-196`
- **Issue:** The debounced `procurement_schedules` upsert only `console.error`s on failure. No toast, no dirty flag, no retry. A user can edit a schedule for an hour with every autosave failing (RLS, network) and lose everything on navigation with zero indication.
- **Fix:** On failure set a visible "unsaved changes" state, toast on first failure, and block navigation (`beforeunload`) while the last save failed.
- **FIXED (2026-06-28, batch 3):** Added a `saveStatus` state (`idle|saving|saved|error`) that drives all three protections: **(1)** a persistent header indicator ("Saving…" / "All changes saved" / "⚠ Couldn't save — changes unsaved") plus a single `toast.error` with a fixed id (`procurement-save`) so repeated debounced failures refresh one toast instead of stacking; **(2)** a `dirty` flag derived from `saveStatus` (so it can't drift) — `'saving' || 'error'`; **(3)** a `beforeunload` guard registered while `dirty`. A `justLoadedRef` skips the autosave that loading/switching a project triggers, preventing a false "unsaved" and the pre-existing redundant save-on-mount. The silent hour-of-loss scenario is closed: the user now sees failures immediately and is warned before browser-level exits.
- **IN-APP NAV GUARD — DONE (2026-06-28, follow-up PR):** `beforeunload` only fires for browser-level exits, not in-app React-Router nav (sidebar clicks — the most common mid-edit exit). Added as **Guard 2**: migrated the router root from `<BrowserRouter>` to `createBrowserRouter([{ path:'*', element:<App/> }])` + `<RouterProvider>` (minimal — App's route tree kept as the splat element; app-global providers are router-hook-free so they keep wrapping), which makes `useBlocker` available. `ProcurementScheduler` now calls `useBlocker(() => dirty)` and renders an on-brand confirm modal ("Unsaved changes — Stay / Leave anyway") when a navigation is blocked. Only blocks while `dirty`, so a clean page navigates freely (verified — no false prompt). Scope was empirically confirmed SMALL first via a throwaway probe (useBlocker fires under App's doubly-nested descendant `<Routes>`). **Hardened the dirty detection while here:** the 2.5 `justLoadedRef` one-shot flag could leak a *false* dirty (StrictMode double-invoke, or `cid` arriving async from `useCompany` so `loaded` flips true before the baseline is set) — which `useBlocker` exposed as a phantom "unsaved changes" modal on a freshly-loaded page. Replaced it with a **content snapshot compare** (`scheduleSnapshot`: dirty = current persisted-shape JSON ≠ last loaded/saved) plus a `lastSavedRef == null` baseline guard, so dirtiness is content-derived and StrictMode/async-safe (also removes a redundant save-on-mount and the pre-existing `_leadWeeks` lint error). Regression: full E2E suite + an explicit nav smoke spec (`e2e/nav-smoke.spec.js` — public / `/app/*` authed / `/worker` / legacy `<Navigate>` redirect / deep-link cold load + clean-no-block + dirty-blocks-then-Stay). The pattern is reusable for any future autosave page.

### 2.6 [CRITICAL] Drawing cascade delete: four unchecked deletes, unconditional success toast
- **File:** `src/pages/ProgressDrawingsList.jsx:139-143`
- **Issue:** `deleteDrawing` deletes `progress_item_history` → `progress_items` → `progress_zones` → `progress_drawings` without checking any `error`, then always toasts "Drawing deleted". A failure at the final step leaves a drawing stripped of all markup/history; an earlier failure shows success while nothing was deleted.
- **Fix:** Check each `error`, abort on first failure; move the cascade into an RPC/transaction or FK `ON DELETE CASCADE`.
- **FIXED (2026-06-25, batch 3):** Live-DB introspection showed all three children (`progress_item_history`, `progress_items`, `progress_zones`) are already FK'd to `progress_drawings` with **`ON DELETE CASCADE`** (and `progress_item_history.item_id → progress_items` CASCADE), so the manual client cascade was redundant **and** was the source of the partial-destruction window. `deleteDrawing` now deletes only the parent (`progress_drawings`) — the FK cascade removes the children atomically in one statement — with a `.select('id')` 0-row guard (honest "not found / no permission") and a real error check. No RPC/SQL needed (the cascade already exists). The other `drawing_id` tables (`bim_drawing_calibration`, `drawing_layers`, `snags`) reference different drawing tables, not `progress_drawings`, so nothing is orphaned. E2E coverage logged as TH-3.

### 2.7 [CRITICAL] Agency availability toggles: write-and-forget with dead try/catch
- **File:** `src/pages/AgencyOperativeDetail.jsx:228-244`, `:266-272`
- **Issue:** `toggleDay` discards delete/update results and updates state optimistically; the surrounding try/catch is dead code (supabase never throws). `bulkSetWeekdays` always toasts "Marked N weekdays as available" regardless. Wrong availability feeds directly into labour matching/booking.
- **Fix:** Check `{ error }` on every call; only mutate state when error is null; toast failures.

### 2.8 [HIGH] Destructive client-side cascades destroy child data before the parent delete is verified
- **Files:** `src/pages/AllWorkers.jsx:33-41` (signatures/attendance/toolbox/chat deleted via `Promise.all`, results ignored, before the checked `operatives` delete); `src/pages/PMDashboard.jsx:511-587` (`deleteProject`: ~20 child tables, `.catch(() => {})` is dead code, only final delete checked); `src/pages/PMDashboard.jsx:1233-1243` (`removeOperative`: signatures deleted unchecked first); `src/components/SnagDetail.jsx:227-234` and `PMDashboard.jsx:1567-1582` (comments/snags deleted unchecked before parent)
- **Issue:** If the final (checked) delete fails, irreplaceable compliance history (signatures, attendance, comments) has already been irreversibly destroyed while the parent record remains. Intermediate failures also leave orphaned cross-tenant rows with success reported.
- **Fix:** Check every step and abort on first failure; preferably replace all client-side cascades with server-side RPCs in one transaction or FK `ON DELETE CASCADE`.

### 2.9 [HIGH] Invite flows: success toasts regardless of outcome; bulk counter double-counts
- **Files:** `src/pages/InviteNewWorkers.jsx:58-72`, `:140-156`; `src/pages/InviteExistingWorkers.jsx:40-58`; `src/pages/Onboarding.jsx:222-237`
- **Issue:** `/api/invite` responses are never inspected (`.catch(() => {})` only), so HTTP 4xx/5xx still yields "Invitation sent". In the bulk loop a failed row increments `failCount` in `.catch()` but execution continues and `successCount++` also runs. `operative_projects` inserts/upserts (`:53`, `:137`, InviteExisting `:40`) are unchecked — workers silently not assigned to projects. (`AddNewWorker.jsx:163-170` does this correctly — copy that pattern.)
- **Fix:** Check `res.ok` and the response's `results.email` before counting success; `continue` after a failure in the bulk loop; check the project-link write errors.

### 2.10 [HIGH] Signup: unchecked inserts and no rollback across the multi-step flow
- **File:** `src/pages/Signup.jsx:102-109`, `:198-203` (rollback gaps: `:73-99`, `:158-195`)
- **Issue:** The `managers` insert (needed for holiday approvals) and `agency_users` link insert ignore errors — accounts get created that are silently broken for those features. If `profiles`/`agencies` fails mid-flow, the auth user and company row are orphaned and retrying fails with "email already registered". Same orphan pattern in `src/pages/AgencyRegister.jsx:81-86` (agency created, user-link insert unchecked → "No Agency Linked" lockout).
- **Fix:** Check every insert; move signup to a server-side endpoint that creates all rows transactionally (or clean up on downstream failure).

### 2.11 [HIGH] PMDashboard fire-and-forget writes with success toasts
- **File:** `src/pages/PMDashboard.jsx:1611-1622` (snag assignment + emailed reply links that may point at never-saved tokens), `:624-626` (signature invalidation on document re-issue — compliance gap reported as success), `:850/:863/:874` (geofence pin/radius/clear), `:423/:441` (floor delete, floor-plan `image_url`), `:1205-1207` (`operative_projects` on add)
- **Issue:** All discard the Supabase result and toast success. Failed snag assignments send subcontractors dead `snag-reply` links; failed signature invalidation leaves operatives "signed" against a superseded document; failed geofence saves mean workers are/aren't geofenced contrary to what the PM was told.
- **Fix:** Destructure `{ error }` on each (the toggle handlers at `:830`/`:905` already do it right); for snag assignment use one `.in('id', ids).update().select()` and exclude failed rows from the email.

### 2.12 [HIGH] Public snag reply: dead try/catch — subcontractor comments silently dropped
- **File:** `src/pages/SnagReply.jsx:69-85`
- **Issue:** `handleCommentOnly` wraps the insert in try/catch but never reads `error` (supabase doesn't throw) — "Comment added" always shows. This is the tokenized public page subcontractors use; their replies can vanish.
- **Fix:** `const { error } = await ...insert(...)`; on error keep the text in the textarea and toast.

### 2.13 [HIGH] QR timesheet generation: unchecked delete before insert can double-count paid hours
- **File:** `src/pages/SubcontractorJobDetail.jsx:685-693`
- **Issue:** "Generate from QR" deletes the week's auto entries (result discarded) then inserts fresh ones. A failed delete (returns error object, doesn't throw) still inserts — duplicate timesheet entries double-count hours and labour cost.
- **Fix:** Check `{ error }` from the delete and abort before inserting.
- **FIXED (2026-06-28, batch 3 — client part):** `generateFromQR` now checks the delete error and `throw`s before the insert, so a failed clear can no longer be followed by an insert (no double-count). Live-DB introspection confirmed `timesheet_entries` has **no UNIQUE** on the natural key (only PK on `id` + FKs), and the dup-check returned **zero existing duplicates** in prod (the bug had not yet fired). Both QR-auto (`is_manual_entry:false`) and manual (`is_manual_entry:true`) inserts key on `(job_id, operative_id, date, is_manual_entry)`.
- **CLOSED — LIVE-VERIFIED 2026-06-28:** structural fix applied. `UNIQUE(job_id, operative_id, date, is_manual_entry)` (`timesheet_entries_natural_key_uniq`) added to `timesheet_entries` and verified live, so a double-count is now **structurally impossible** (a second auto insert for the same operative/day errors instead of duplicating). Business rule confirmed by owner: **one manual + one auto entry per operative per day** (full constraint, not the partial-on-auto alternative). Data was pre-verified clean (dup-check = 0 rows). Migration version-controlled at `scripts/migrations/2-13-timesheet-natural-key-unique.sql` (+ rollback) — applied-then-committed pattern. The `.upsert` swap was correctly **not** taken (pure upsert drops the "operative no longer in this week's QR" removal the delete handles). 2.13 fully closed: client checked-delete-and-abort (PR #37) **+** the DB constraint.

### 2.14 [HIGH] SuperAdmin: password reset and company suspension unchecked
- **File:** `src/pages/SuperAdminPanel.jsx:405-412`, `:158-163`, `:414-418`
- **Issue:** `resetPassword` updates `managers.password` without checking `error`, then shows the new password — if the write failed the user is locked out with a password that doesn't work. `toggleActive`/`toggleUserActive` toast success on unchecked writes — a "suspended" company can remain active. (See also 5.4: this path writes plaintext passwords.)
- **Fix:** Check `error` before toasting; move password reset server-side (see 5.4).

### 2.15 [HIGH] BIM: element batches and model deletes unchecked
- **File:** `src/pages/BIMModels.jsx:129` (batch inserts — failed batches silently missing while `element_count` claims all), `:148-156` (three unchecked deletes + unconditional "Model deleted"); `src/components/BIMUpload.jsx:111-112`, `src/components/DWGAutoDetect.jsx:267-270` (batch failures only console-logged; DWGAutoDetect even counts failed batches as `inserted`)
- **Fix:** Check `{ error }` per batch, throw into the existing catch, report true counts; check each delete and stop on first failure.

### 2.16 [LOW — reclassified after live-DB trace 2026-06-28] Global `settings.pm_email` row is not company-scoped — but the row is INERT (no consumer)
- **File:** `src/pages/CompanySettings.jsx:245`, `:345-348`; `src/pages/PMDashboard.jsx:1437`, `:1451-1454`
- **Issue (original):** `upsert({ key: 'pm_email', value }, { onConflict: 'key' })` writes one **global** row; every company's save overwrites every other's. **CONFIRMED at the schema level** by live introspection: `settings` has `UNIQUE(key)` on `key` alone (`settings_key_key`), so only one `pm_email` row can exist globally → cross-tenant clobber is real.
- **Reclassified to LOW — the audit's "worker sign-off notifications go to the wrong company" is WRONG:** `pm_email` has **zero consumers** (`grep pm_email src/ api/` → only the 4 settings-UI sites above; no send path reads it). The cross-tenant effect is limited to a stale shared value shown in two settings screens — inert, no misdelivery. The live `settings` table DOES have a (nullable, FK) `company_id` column, unused by this code; per-entity settings elsewhere work around `UNIQUE(key)` by embedding ids in the key (`notification_<uuid>_<uuid>`).
- **Fix:** retire the dead `pm_email` path (remove the 4 read/write sites). Coupled to §2.16b: PMDashboard's email widget uses `pm_email` as its *only* store, so its removal rides inside the §2.16b repointing to the canonical field. Done as **one PR** with §2.16b.

### 2.16b [HIGH — NEW, found via the §2.16 trace 2026-06-28] Company sign-off email notifications are non-functional end-to-end
- **Files:** send path `src/pages/SignDocument.jsx:105-122`, `api/notify.js:55-63`; settings UI `src/pages/CompanySettings.jsx:200/:338`, `src/pages/PMDashboard.jsx:1437/:1451`.
- **Issue:** Three **disconnected** notification-email locations, none wired together, so a document-completion email reaches **no one** for any company (live-confirmed):
  1. `settings` table `key='pm_email'` — written/read by the settings screens; **no send consumer** (the §2.16 dead path).
  2. `companies.settings.notification_email` (JSONB) — written + read **only** by `CompanySettings`; **null for all 6 companies** in prod.
  3. `companies.notification_email` (**column**) — what the send path reads (`SignDocument:107`, `api/notify:57` both `.select('notification_email')`) — but **the column does not exist** (introspection confirmed). The query errors (`42703`) → `data: null`; both sites **swallow the error** (`const { data: company }`, no `error` check), so `company` is `null` → `SignDocument` silently skips the `/api/notify` call (`if (notifyEmail)` false), and `api/notify` returns 403 ("recipient does not match"). The silent swallow is **why this stayed invisible** — a missing-column error looked identical to "no email configured."
- **Severity:** real, customer-affecting — operatives complete inductions/RAMS and the company is never emailed. Distinct from §2.16 (which is inert).
- **Fix (chosen — Option A, one PR with §2.16):** add the real `companies.notification_email` **column** (additive nullable migration; the send path already expects it, so the security-gated `api/notify` open-relay check stays UNTOUCHED); point both settings screens (`CompanySettings`, `PMDashboard`) at the column; retire the §2.16 `pm_email` sites. **Error-swallow fix (non-negotiable, both sites):** destructure `{ data, error }` — `api/notify` returns **500** on a real query error (distinct from the legit "no email configured"/recipient-mismatch 403); `SignDocument` `console.error`s it so a future broken recipient fails loudly.
- **Second dependency — `RESEND_API_KEY`:** `api/notify` only sends when `RESEND_API_KEY` is set (`:81-84`), else it logs and returns 200 without sending. The whole app shares this one key (invite/welcome/chase/etc.). If it's unset in prod, that's a *second* reason notifications never delivered — must be confirmed so verification tests real delivery, not just wiring.
- **Verification:** real end-to-end — set the email on a test company, complete a sign-off, confirm an email **arrives** in a real inbox; plus the open-relay gate still 403s on a mismatched recipient. (This feature has never worked, so "looks right" is not the bar.)

### 2.17 [HIGH] Toolbox talk close: unchecked update — QR keeps accepting signatures
- **File:** `src/pages/ToolboxTalkLive.jsx:69-76`
- **Issue:** `closeTalk` discards the `is_open=false` update result, toasts "closed", sets local state closed. If it failed, the sign page stays live.
- **Fix:** Check `error`; only update state/toast on success.
- **FIXED (2026-06-25, batch 2):** `closeTalk` checks the update error and only reports "closed" once `is_open` actually flips; on failure it toasts that the talk may still be accepting signatures. Signing is gated client-side by `ToolboxSign.jsx:121` (`if (!talk.is_open)`). Server-side enforcement is logged as §2.17b (server-side hardening cluster).

### 2.18 [MEDIUM] LabourRequestDetail accept-proposal: five writes, no rollback, last two unchecked
- **File:** `src/pages/LabourRequestDetail.jsx:78-134`
- **Issue:** Booking insert / proposal update / request status are checked but not transactional (orphaned confirmed booking → duplicate accept → double booking); `agency_operatives` status (`:114`) and `operative_availability` upsert (`:133`) are discarded — a booked operative can stay "available" in searches.
- **Fix:** Check steps 4–5; move the sequence into a Postgres RPC. Related: `src/pages/Bookings.jsx:129-135` — cancel succeeds but the availability delete is unchecked, leaving dates blocked.

### 2.19 [MEDIUM] DocumentHub versioning/signoff writes unchecked — compliance state can silently diverge
- **File:** `src/pages/DocumentHub.jsx:389`, `:393-406`, `:318`, `:590`, `:515-527`
- **Issue:** Archiving the old version, invalidating its signoffs, and inserting replacement pending signoffs all discard results — failures leave both versions live and operatives "signed off" against superseded documents. Read-flag updates use `.then(() => ...)` without reading `error` (same in `Chat.jsx:85-100`).
- **Fix:** Destructure `{ error }` and throw into the existing catch/toast path.
- **FIXED (2026-06-25, batch 2):** `handleUploadVersion` reordered so the new version is created first, then (guarded) new pending sign-offs are created and the old version is archived **last**; any failure in that block rolls back the new version (deletes new sign-offs + new doc) and re-throws, so a broken re-issue leaves the OLD version as the single live current doc — never "both versions live". Old sign-off invalidation is moved **after** archiving and made best-effort (the old doc is already superseded, and per-row signed/pending status can't be cleanly un-invalidated on rollback); a failure there warns rather than blocks. Stale `:230` comment ("NO company_id column") corrected — it conflicted with the error-checked `company_id` inserts at `:453`/`:597`. Full atomicity logged as §2.19b.

### 2.20 [MEDIUM] Permit audit-trail signatures inserted without checks
- **File:** `src/pages/PermitToWork.jsx:418`, `:489`, `:511`, `:537`, `:574`
- **Issue:** Every `permit_signatures` insert (submit/approve/reject/extend/close) ignores its result — the permit status changes but the safety audit-trail entry can silently be missing, defeating the point of permits in incident review.
- **Fix:** Check `error` on each; warn "Permit approved but signature log failed" so it can be retried.
- **FIXED (2026-06-25, batch 2):** Signature is now the anchor. For approve/reject/extend/close the audit signature is inserted **first** (checked) and the permit state change only follows; if the state change fails the signature is rolled back, so state + audit stay in lockstep. Submit can't go signature-first (needs `permit.id`), so a failed submission signature rolls back the just-created permit. Worst residual is a rare detectable orphaned signature (over-records, never under-records). Full DB-atomic version logged as §2.20b.

### 2.21 [MEDIUM] Snag notifications insert an operative *name* into `user_id`
- **File:** `src/components/SnagDetail.jsx:213-220`, `:324-331`
- **Issue:** `user_id: assigneeOp?.id || newAssignee` falls back to a name string (SnagForm stores `assigned_to` as a name); `updateStatus` uses `snag.assigned_to` directly. These inserts either fail on a uuid column or write undeliverable rows — both swallowed by `.then(() => {})`. Assignment/status notifications never reach workers.
- **Fix:** Resolve the operative record and use its `id`; skip + log when unresolvable; check the insert error.

### 2.22 [MEDIUM] Further unchecked writes with user-facing consequences
- **Files:** `src/pages/ProgressViewer.jsx:473-488` (status change toasts success unchecked — contrast the correct `batchUpdateStatus` below it); `src/pages/ProgrammeSetup.jsx:139-150` (layers deleted then re-inserted unchecked — failed batch loses baselines); `src/pages/SnagDrawingView.jsx:242-248` (`file_url` pointer update unchecked after replacement upload); `src/pages/HSObservations.jsx:225-236` (photos moved, then DB pointer update unchecked → 404s); `src/pages/OperativeInvoices.jsx:159-163,227,301` + `SubcontractorJobDetail.jsx:210-274` (failed attachment uploads silently dropped); `src/pages/ToolboxSign.jsx:83-98` (signature row inserted with `signature_url: null` when upload fails); `src/pages/WorkerProfile.jsx:68-75` + `OperativeDashboard.jsx:885-892` (cancel-email-change: both writes unchecked, verification link stays live); `src/pages/SubcontractorDashboard.jsx:248-258`, `src/components/NotificationBell.jsx:104-114`, `src/pages/OperativeDashboard.jsx:247-257` (snag comment), `src/pages/BIMViewer3D.jsx:811-843`
- **Fix:** In all cases: destructure `{ error }`, surface failures, and stop treating optimistic state as confirmation. Consider a lint rule or wrapper (`mustWrite()`) that throws on `error`.

### 2.23 [LOW] Misc fire-and-forget writes
- **Files:** `src/pages/Onboarding.jsx:89`; `src/pages/SiteSignIn.jsx:136-139`; `src/components/IncidentForm.jsx:131-140` (activity feed); `src/pages/ProgrammeCalculator.jsx:413-424` (reorder PATCH — `res.ok` never inspected); `src/pages/AddNewWorker.jsx:111-116`, `:147`
- **Fix:** Check `error`/`res.ok`; at minimum log and refetch.

### 2.24 [HIGH] Toolbox talk signing is broken — queries a non-existent `operatives.project_id` column
- **File:** `src/pages/ToolboxSign.jsx:33`
- **Issue:** The sign page loads the operatives who may sign with `supabase.from('operatives').select('*').eq('project_id', t.project_id)`. The `operatives` table has **no `project_id` column** (verified against the live DB: `column operatives.project_id does not exist`); operatives are linked to projects through the `operative_projects` junction, as `SiteSignIn.jsx:129` correctly does. The PostgREST query therefore errors, `setOperatives([])` runs, and `availableOps` is always empty — so the page renders "All operatives have signed" and the signature canvas never appears. **No operative can sign any toolbox talk.** (PM creation of talks works fine; only signing is broken.)
- **Fix:** Load signees via the junction, e.g. `from('operatives').select('*, operative_projects!inner(project_id)').eq('operative_projects.project_id', t.project_id)` (mirror `SiteSignIn.jsx:129`), or query `operative_projects` for the project and join operatives.
- **CONFIRMED BY E2E (2026-06-09):** `e2e/toolbox.spec.js` — create persists (green); the sign test navigated to `/toolbox/:id` as a seeded operative on the project and found "All operatives have signed" with no canvas.
- **FIXED (2026-06-09):** both `ToolboxSign.jsx:33` and `ToolboxTalkLive.jsx:33` now load operatives via the `operative_projects!inner` junction (`.eq('operative_projects.project_id', t.project_id)`). The same wrong-relationship assumption in `PMDashboard.jsx:710` (`operatives.filter(o => o.project_id === p.id)`, which zeroed the per-project sign-off %) was also fixed to use the junction. The toolbox sign E2E is now green.

### 2.25 [BACKLOG — server-side compliance hardening cluster] (logged 2026-06-25)
The §2.17 / §2.19 / §2.20 **client** fixes close the live gaps now (each fails in the safe direction). These are the **server-side belt-and-braces** follow-ups — all SQL/RPC changes needing the careful manual treatment, separate from the client batch. Real but **not urgent**.
- **2.17b** — `submit_toolbox_signature` RPC should re-check `is_open` server-side. The client page-gate (`ToolboxSign.jsx:121`) closes the common path, but the RPC could be hit directly. (RPC source is not in `sql/` — current server-side behaviour unconfirmed; verify when implementing.)
- **2.19b** — fully-atomic document re-issue (new version + archive old + invalidate old sign-offs + create new pending) in a single Postgres RPC/transaction. The client compensating-rollback is sound; the RPC removes the residual non-atomic edge (e.g. compensating delete itself failing).
- **2.20b** — fully-atomic permit state-change + `permit_signatures` insert in one RPC. The client signature-first + compensating-rollback is sound; the RPC removes the rare orphaned-signature residual.

---

## 3. FORMS

### 3.1 [MEDIUM] Demo-request modal: success screen on failure, and a stuck-spinner trap
- **File:** `src/pages/LandingPage.jsx:17-46`; same pattern `src/pages/WhyCoreSite.jsx:118-126`
- **Issue:** The `demo_requests` insert error is never read and the `/api/demo-request` POST has `res.ok` unchecked with `.catch(() => {})` — `setSubmitted(true)` always runs, so failed lead capture shows "Thanks!" (silently lost sales leads). If the insert *throws* (network), `setSending(false)` is skipped and the backdrop close is gated on `!sending` — the user is trapped in a spinning modal.
- **Fix:** try/catch/finally with `setSending(false)` in `finally`; require at least one channel to succeed before showing success.

### 3.2 [LOW] AddNewWorker duplicate-email warning doesn't block submit
- **File:** `src/pages/AddNewWorker.jsx:272-282`, `:100-138`
- **Issue:** `emailDuplicate` is shown as an amber warning but `handleSave` never checks it — duplicate workers are inserted anyway.
- **Fix:** Require explicit confirmation when `emailDuplicate` is set.

### 3.3 [LOW] Holiday "Reassign" has no in-flight guard
- **File:** `src/pages/HolidayRequests.jsx:182-203`, `:484-490`
- **Issue:** Unlike `handleCancel` (tracks `cancellingId`), `handleReassign` sets no loading state — rapid double-clicks fire duplicate PATCHes.
- **Fix:** Track a reassigning flag and disable Confirm while in flight.

### 3.4 [LOW] Form autosave drafts shared across users on the same device
- **File:** `src/hooks/useFormAutoSave.js:3-7`; consumer `src/pages/AddNewWorker.jsx:79`
- **Issue:** Drafts keyed only by `coresite_autosave_add_worker` — a second manager (different login/company) on a shared device is offered the first user's draft (names, DOB, NI) via the recovery banner.
- **Fix:** Namespace the key with user/company id.

*(Checked OK: 25+ other forms — PMLogin, OperativeLogin, ResetPassword, SiteSignIn, SignDocument, ToolboxSign, PermitToWork, DailySiteDiary, SnagForm, IncidentForm, CompanySettings, etc. — guard re-entry via LoadingButton/disabled, reset loading in finally, and surface errors. `validators.js` is genuinely used client-side and mirrored in `update-operative.js`.)*

---

## 4. API ROUTES

### 4.1 [CRITICAL] "Operative session" is the operative's own UUID echoed back — effectively no auth
- **Files:** `api/holidays.js:33-35`, `api/holiday-allowance.js:20-24`, `api/eligible-approvers.js:12-16`, `api/update-operative.js:89-97`, `api/request-email-change.js:31-33`, `api/plant-equipment.js:55`
- **Issue:** The operative auth pattern is `operativeSessionId === operativeId`, both supplied by the caller. Operative UUIDs appear in invite emails, QR links, and URLs (`/operative/:id/...`). Anyone with a UUID can pass it as both fields and: read holiday allowances, enumerate the company's manager/admin names+emails, edit the operative's DOB/NI/address, submit/cancel holidays, and trigger email changes. All these routes use the service-role key, bypassing RLS.
- **Fix:** Issue a real session credential at worker login (Supabase JWT for operatives, or a random server-stored token) and derive identity from it. Never accept an ID as its own proof.

### 4.2 [CRITICAL] Operative account takeover via email-change + verify chain
- **Files:** `api/request-email-change.js:27`, `:31-33`; `api/verify-email.js:32-43`
- **Issue:** Building on 4.1: POST `{operativeId, operativeSessionId: operativeId, newEmail: attacker@…}` sends the verification link to the **attacker's** address; verify-email then rewrites both `operatives.email` and the Supabase Auth email — full takeover (worker login + password reset now go to the attacker). Additionally, at `:27` an authenticated user whose `user_metadata.role` isn't in `['manager','admin','super_admin']` skips the company tenancy check entirely.
- **Fix:** Require real authentication; notify the old address with a cancellation link; fail closed when role/company metadata is absent.

### 4.3 [CRITICAL] Holiday self-approval by unauthenticated caller
- **File:** `api/holidays.js:220-224`, `:242-247`
- **Issue:** In PATCH, with no JWT, `callerId = operativeSessionId` (any value, never verified). `isAssignedApprover = callerId === request.approver_id` — and an operative can read their own request's `approver_id` from the GET. So `PATCH {requestId, action:'approve', operativeSessionId: <approver_id>}` approves their own holiday with zero credentials.
- **Fix:** Allow approve/reject only via the authenticated JWT path.

### 4.4 [CRITICAL] Cron endpoints authenticated by spoofable headers
- **Files:** `api/auto-signout.js:16-18`, `api/chase-overdue.js:22`
- **Issue:** `isCron = req.headers['x-vercel-cron'] === '1' || user-agent.includes('vercel-cron')` — both fully attacker-controlled. Anyone can invoke these: forge `site_attendance` sign-out rows for every company, or spam every operative with overdue emails and mutate snag priorities. `CRON_SECRET` is only an *alternative* path, not a requirement.
- **Fix:** Require `Authorization: Bearer ${CRON_SECRET}` (Vercel sends this automatically to cron paths when `CRON_SECRET` is set) and delete the header/UA shortcut.

### 4.5 [HIGH] `create-operative-account.js` has no authentication — pre-registration takeover
- **File:** `api/create-operative-account.js:12-21`
- **Issue:** No auth check at all. Anyone with an operative's UUID + email (both in invite links) can create that operative's auth account first and choose the password.
- **Fix:** Require an invite token or DOB proof; rate-limit.

### 4.6 [HIGH] `invite.js` / `welcome.js`: authenticated open phishing relay
- **Files:** `api/invite.js:21-33`, `:57-58`; `api/welcome.js:8-16`
- **Issue:** Any authenticated user (including operatives) can send arbitrary `customHtml` to any address from `CoreSite <noreply@coresite.io>`. The tenancy check only runs `if (callerCompanyId && isUUID)` — pass a non-UUID `operativeId` and it's skipped while the email still sends. `welcome.js` lets any user send credential-style emails with arbitrary content.
- **Fix:** Restrict to verified admin/manager roles (profiles lookup); drop or template-whitelist `customHtml`; fail closed when the operative lookup fails; require recipient to match the operative record.

### 4.7 [HIGH] Tenancy checks fail open when JWT metadata lacks `company_id`
- **Files:** `api/delete-company.js:21-24`, `api/delete-operative.js:28-35`, `api/holidays.js:216-219`, `api/holiday-allowance.js:37-41`, `api/update-operative.js:83-88`
- **Issue:** Pattern `if (callerCompanyId && callerCompanyId !== target) deny` — when `user_metadata.company_id` is absent (true for admins created via `create-company-admin`, whose metadata is only `{name, role}`), the cross-company check is skipped entirely.
- **Fix:** Resolve company from the `profiles` table (as `plant-equipment.js:85-89` does) and **deny** when unresolvable.

### 4.8 [HIGH] Plant `defect`/`check` actions missing tenancy checks
- **File:** `api/plant-equipment.js:301-343`, `:49-79`
- **Issue:** `action === 'defect'` never compares the equipment's `company_id` to the caller's — company A can flip company B's equipment to `Defective` (blocking its use) and spam B's managers with notifications. The public `check` POST inserts checks against any equipment ID using the fake-session pattern (4.1).
- **Fix:** Call `verifyEquipmentAccess` in the defect branch; validate the operative belongs to the equipment's company for checks.

### 4.9 [HIGH] `auth.admin.listUsers()` only reads the first page (50 users)
- **Files:** `api/create-manager.js:72,120`; `api/create-company-admin.js:75`; `api/create-operative-account.js:54`; `api/delete-operative.js:69`; `api/verify-email.js:39`
- **Issue:** Once the platform exceeds 50 auth users, email lookups silently miss accounts: deleted operatives keep live logins, create-manager 400s confusingly, verify-email leaves split identities, and the create-operative-account takeover guard stops detecting existing accounts.
- **Fix:** Page through `listUsers({ page, perPage })`, or store `auth_user_id` on rows and use `getUserById`.

### 4.10 [MEDIUM] `delete-company.js`: 50-table cascade with ignored per-table errors, no confirmation
- **File:** `api/delete-company.js:60-78`
- **Issue:** Per-table delete errors are collected but never surfaced on the success path (200 with rows left behind); if the final `companies` delete fails, all child data is already gone; auth-user deletion failures are `.catch(() => {})`'d, leaving live logins for a deleted company; no confirmation/idempotency token.
- **Fix:** Move the cascade to a Postgres function; always return `tableErrors`; require a confirmation field (typed company name).

### 4.11 [MEDIUM] `create-company-admin.js`: weak temp password, global email cleanup, 200 on partial failure
- **File:** `api/create-company-admin.js:71-72`, `:78`, `:104-123`
- **Issue:** Temp password from `Math.random()` (predictable format); pre-cleanup deletes `profiles`/`managers` rows matching the email **globally** (can destroy another company's active admin); profile/manager insert failures only `console.error` while the route returns 200 + password (half-created admin).
- **Fix:** `crypto.randomUUID()`-based password; scope cleanup; rollback (delete auth user) and 500 on partial failure.

### 4.12 [MEDIUM] Unescaped user data interpolated into outbound email HTML
- **Files:** `api/chase-overdue.js:85`; `api/create-manager.js:209-228`; `api/invite.js:65-67`; `api/welcome.js:45-65`; `api/request-email-change.js:102`
- **Issue:** Only `demo-request.js` and `notify.js` escape HTML. Elsewhere snag descriptions, names, and project names are interpolated raw — HTML/link injection into emails from the trusted sender.
- **Fix:** Extract the existing `escapeHtml` helper into a shared module and apply it to every interpolated value.

### 4.13 [MEDIUM] `programme-calc` PATCH `reorder` has no tenancy check
- **File:** `api/programme-calc.js:306-313`
- **Issue:** Unlike every other action in the file, `reorder` updates `programme_tasks.sort_order` for arbitrary IDs — any authenticated user can scramble another company's programme.
- **Fix:** `.in('id', ids)` lookup of `project_id`s + `verifyProjectAccess` before updating.

### 4.14 [MEDIUM] `demo-request.js` / `help-chat.js`: unauthenticated, abusable endpoints
- **Files:** `api/demo-request.js:9`, `:68-131`; `api/help-chat.js:136-153`
- **Issue:** demo-request throws a TypeError on a missing body (opaque 500) and lets anyone trigger branded emails to arbitrary addresses with attacker-chosen text, unthrottled. help-chat's rate limit is an in-memory Map (per serverless instance — ineffective), it's unauthenticated (burns Anthropic spend), `ANTHROPIC_API_KEY` existence is never checked, and `messages[].role` is unvalidated.
- **Fix:** Guard `req.body || {}`; add shared-store rate limiting/captcha; validate roles and cap content length.

### 4.15 [MEDIUM] `procurement.js`: spoofable audit actor, missing profiles fallback
- **File:** `api/procurement.js:20-21`, `:169-181`, `:246-252`
- **Issue:** Audit rows record `b.userName`/`b.userId`/`b.userRole` straight from the request body (spoofable audit trail); `callerCompanyId` comes only from metadata, so admins without `company_id` metadata get blanket 403s.
- **Fix:** Derive actor fields from the verified `user`; reuse the profiles fallback.

### 4.16 [LOW] Response-shape drift, ignored query errors, dead notification targeting
- **Files:** `api/eligible-approvers.js:27-131`, `api/holidays.js:196`, `:279-283`, `api/bank-holidays.js:14-40`, `api/holiday-allowance.js:62-68`, `api/demo-request.js:136`
- **Issue:** Dozens of `const { data } = ...` destructures silently turn DB errors into empty lists ("no requests", allowance shows 0). Holiday approval notifications insert `operatives.id` into `notifications.user_id`, which elsewhere holds `profiles.id` — they likely never appear in the bell feed. Shape drift: `{error}` vs `{message}` vs 200-with-error-text; holidays.js POST ignores `allowance_year_start` while holiday-allowance.js honours it (the two can disagree on remaining days).
- **Fix:** Standardise `{error}` + non-2xx; check `error` on result-driving queries; insert the resolved profile id; share the allowance-year calculation.

### 4.17 [LOW] `auto-signout` cron timing wrong during BST
- **File:** `api/auto-signout.js:26`, `:71`; `vercel.json` schedule `59 23 * * *`
- **Issue:** 23:59 UTC = 00:59 UK in summer, so `todayStr` is the *next* UK day and the previous day's open sign-ins are never found — auto-signout silently does nothing for half the year. `recorded_at` is also built from UTC components.
- **Fix:** Schedule `59 22 * * *` (or compute the target UK day explicitly) and derive `recorded_at` from the processed day.

### 4.18 [LOW] Missing env-var guards in shared auth helpers and cron modules
- **Files:** `api/_auth.js:14-17`, `api/auto-signout.js:3-6`, `api/chase-overdue.js:4-8`
- **Issue:** Service-role clients are created without checking env vars exist — a missing key throws inside `verifyAuth`, which most routes call outside try/catch → opaque 500s.
- **Fix:** Existence-check and return a clean `{ error: 'Server config missing' }`.

---

## 5. DATABASE / RLS

> **Context:** the repo contains three generations of policy sets — `supabase-schema.sql` ("Allow all"), `sql/rls-policies.sql` (company-scoped **plus broad anon access**), and `scripts/migrations/rls-deploy4-lockdown.sql` (zero-anon). The client still queries tables directly from public pages and calls only 2 of the 10 lockdown RPCs, which strongly suggests production is on the permissive set. Findings below flag where the policy files may not reflect production — verify against live `pg_policies` before acting.

> **⚠️ VERIFIED LIVE (2026-06-10, owner-authorized read-only anon-key probe):** production **is** on the permissive set. With only the public anon key (signed out), a browser can read across tenants: `operatives` 57 rows / **4 companies**, `signatures` 172 / **3**, `projects` 13 / **5**, `site_attendance` 500 / **3**. Also anon-readable: `companies, profiles, documents, snags, snag_comments, toolbox_talks, toolbox_signatures, holiday_requests, notifications, pending_email_changes, agency_operatives, sub_invoices`. **§5.1 and §5.2 are CONFIRMED exploitable today.** Storage buckets `documents` and `floor-plans` are anon-LISTable (§5.9 confirmed). Anon writes (§5.3) were NOT tested (read-only authorization) but are highly likely given the read posture matches `sql/rls-policies.sql`, which also grants anon write/delete. Tables NOT exposed in this probe: `managers` returned 0 rows to anon, and **`managers.password` column does not exist in the live schema** (error 42703) → **§5.4 plaintext-password exposure is already gone**. `chat_messages` returned a single company in the sample (possible tighter policy — re-check). `plant_equipment` and `invoices` tables are absent from the live schema cache under those names (PGRST205). Probe was read-only; nothing was modified.

### 5.1 [CRITICAL] Policy-cleanup `LIKE '%_all'` never drops the legacy "Allow all" FOR ALL policies
- **File:** `sql/rls-policies.sql:29-41` vs `supabase-schema.sql:62-66`; also `scripts/migrations/add-holiday-requests.sql:33,51`, `add-profile-edit-tables.sql:22,43`, `add-operative-projects.sql:21`
- **Issue:** The drop loop matches `policyname LIKE '%_all'`, but the originals are named `"Allow all on projects"` etc. — they don't end in `all`, so they were never dropped. RLS policies are permissive (OR'd), so any surviving `FOR ALL USING (true) WITH CHECK (true)` policy on `projects`, `documents`, `operatives`, `operative_projects`, `signatures`, `holiday_requests`, `pending_email_changes`, … overrides every scoped policy → full anon read/write/delete on those tables.
- **Fix:** Drop **all** policies per table (iterate `pg_policies` with no name filter, as deploy4 Part 3 does) before re-creating. Verify live with `SELECT * FROM pg_policies WHERE qual = 'true'`.

### 5.2 [CRITICAL] `sql/rls-policies.sql` grants anon read of every tenant's data
- **File:** `sql/rls-policies.sql:46-305` (profiles, projects, operatives, documents, signatures, drawings, snags, progress_*, toolbox_talks, notifications, aftercare_defects, site_attendance, chat_messages); `scripts/migrations/add-plant-equipment.sql:87,94,99`
- **Issue:** Nearly every SELECT policy includes `OR auth.role() = 'anon'`. The anon key ships in the JS bundle — anyone can curl out all operatives' PII (DOB, CSCS cards), signatures, chat, and attendance across **all companies**. The deploy4 lockdown fixes this but the client was never migrated to the RPCs it requires, so it likely isn't applied.
- **Fix:** Migrate the public pages (SnagReply, ToolboxSign, Portal, AftercarePage) to the existing deploy3 RPCs, then apply `rls-deploy4-lockdown.sql`.
- **CONFIRMED LIVE (2026-06-10):** anon-key probe read 57 operatives across 4 companies, 172 signatures across 3, 13 projects across 5, 500 attendance rows across 3 (+ 13 other tenant tables readable). This is live cross-tenant data exposure, not a may-be.

### 5.3 [CRITICAL] Anon can also write/delete: `USING (true)` on signatures, snag_comments (DELETE!), notifications, chat, attendance, settings, operatives UPDATE
- **File:** `sql/rls-policies.sql:122-123`, `:166-171`, `:267-270`, `:291-292`, `:302-305`, `:310-315`, `:86-95`; `scripts/migrations/add-plant-equipment.sql:95,100`
- **Issue:** With the anon key alone: forge document signatures for any company, **delete every snag comment in the database**, rewrite any chat message/notification, insert fake attendance, and update any operative record in any company. These are legally meaningful H&S records.
- **Fix:** Apply deploy4. At minimum immediately: drop `snag_comments_delete`, scope `notifications_update`/`chat_messages_update`, remove anon from `operatives_update`.

### 5.4 [CRITICAL] Plaintext manager passwords written from the client
- **File:** `src/pages/SuperAdminPanel.jsx:409`; `scripts/migrate-manager-passwords.js` (confirms `managers.password` held plaintext)
- **Issue:** Password reset writes plaintext into `managers.password` via the client. `managers` has no policies in `sql/rls-policies.sql` at all, so depending on what's live, colleagues (or anon) can read plaintext passwords. A migration script exists to clear these — this code path re-introduces them.
- **Fix:** Server-side endpoint using `auth.admin.updateUserById()`; drop the `password` column.
- **VERIFIED LIVE (2026-06-10):** the `managers.password` column **does not exist** in the live schema (anon probe errored 42703 undefined_column), and anon SELECT on `managers` returned 0 rows. So there is no live plaintext-password exposure via this column today. Still confirm the `SuperAdminPanel.jsx:409` write path doesn't recreate it before re-enabling that feature, and remove the dead client write.

### 5.5 [HIGH] Client-side writes with no matching policy → silent 0-row "successes" (the RLS flavour of "saves that don't save")
- **Files/tables:** `site_attendance` UPDATE (`src/pages/SiteAttendance.jsx:114` — no UPDATE policy in **any** SQL file; the manager sign-out correction toasts success while changing nothing); `bim_elements` UPDATE (`BIMViewer3D.jsx:836`, `SnagDrawingView.jsx:623`); `inspections`/`inspection_results`/`aftercare_defects` DELETE (`PMDashboard.jsx:565-567` — project deletion silently leaves them); `job_documents` DELETE (`SubcontractorJobDetail.jsx:488`); `permit_templates` UPDATE (`PermitToWork.jsx:616`); `progress_item_history` DELETE (`ProgressViewer.jsx:601,621`, `ProgressDrawingsList.jsx:139`); `operative_certifications` DELETE (`AgencyOperativeDetail.jsx:193`); `aftercare_defects` direct INSERT (`AftercarePage.jsx:148` — deploy4 removed the policy in favour of an RPC the client never calls)
- **Issue:** RLS filters rows silently: `error` is null, 0 rows change, success toasts show. Works today only where a leftover allow-all policy exists (5.1) — meaning these break the moment RLS is tightened, or are already broken if it was.
- **Fix:** Add the missing company-scoped policies (or move these writes server-side); as a code guard, use `.update(...).select()` and verify rows came back before toasting.

### 5.6 [HIGH] `invoices` table has no schema or policies anywhere in the repo
- **File:** `src/pages/SubcontractorJobDetail.jsx:780`, `:837`, `:841`
- **Issue:** `invoices` (distinct from `operative_invoices`/`sub_invoices`) appears in no SQL file — it's either RLS-off (financial data open to anon) or policy-less (all writes silently fail). Possibly a rename mismatch with deploy4's `sub_invoices`.
- **Fix:** Determine the live table; add scoped CRUD policies or rename the code.

### 5.7 [HIGH] Deploy4's agency/marketplace policies are authenticated-but-unscoped
- **File:** `scripts/migrations/rls-deploy4-lockdown.sql:351-369`, `:522-554`
- **Issue:** Any logged-in user of any company can read/update all agency operatives' PII, agency user accounts, every job variation and labour proposal (financial terms), and every document sign-off — the same tenant-isolation hole, just behind a login.
- **Fix:** Scope via parent FK (e.g. `agency_id IN (SELECT agency_id FROM agency_users WHERE user_id = auth.uid())`).

### 5.8 [HIGH] `record_attendance` RPC: anon-callable, trusts client-supplied company/operative IDs
- **File:** `scripts/migrations/record-attendance-rpc.sql:21-73` (`SECURITY DEFINER`, `GRANT TO anon`)
- **Issue:** Even after lockdown, anyone with the anon key can insert forged H&S attendance for any operative in any company.
- **Fix:** Derive identity from the JWT where authenticated; look up `company_id` from the project row; revoke anon if QR sign-in is authenticated.

### 5.9 [HIGH] Storage: public/deletable buckets
- **Files:** `supabase-storage.sql:7-12` (documents bucket public, anon INSERT **and DELETE** — anyone could wipe all RAMS/signature files; mitigated only if `scripts/migrations/storage-lockdown.sql` was applied); `scripts/migrations/add-floor-plans.sql:78-80` (`floor-plans` upload/delete with no auth check, and the bucket is absent from storage-lockdown's lists, so the open policies survive lockdown)
- **Fix:** Confirm storage-lockdown is applied; add `floor-plans` to it and drop its permissive policies; move card photos/signatures to a private bucket with signed URLs.

### 5.10 [MEDIUM] Deploy4 `operatives` UPDATE lacks `WITH CHECK` — operative can move themselves between tenants
- **File:** `scripts/migrations/rls-deploy4-lockdown.sql:269`
- **Issue:** `USING (... OR id = get_my_operative_id())` with no `WITH CHECK` lets an operative set their own `company_id` to any company (gaining read access to its projects/documents/chat) and self-edit role/rates.
- **Fix:** Add a `WITH CHECK` that pins `company_id`, or restrict self-updates to a column-limited RPC.
- **PATCH PREPARED (2026-06-10):** `scripts/migrations/rls-deploy4-patches.sql` re-creates the operatives `co_update` policy with a `WITH CHECK` pinning company (and adds the missing `site_attendance` UPDATE, §5.5). Not yet applied — part of the owner-approved lockdown batch.

### 5.7b [HIGH] SuperAdminPanel reads every company's data with only a client-side role check — DEFERRED
- **File:** `src/pages/SuperAdminPanel.jsx` (role gated by `manager_data` in storage; reads ALL `companies` + per-tenant `operatives`/`projects`/`signatures`/`snags`/`managers`; `company-assets` bucket).
- **Issue:** This is a deliberate cross-tenant SELECT (it's the super-admin console) but it's authorised only by a client-side role flag, and it relies on the permissive RLS to actually return other tenants' rows. After the lockdown, `get_my_company_id()`-scoped policies will (correctly) stop it reading other companies — so the page will break unless it moves to a server/service-role endpoint that verifies super-admin server-side. It is the one remaining client path doing cross-tenant reads after the public-page migration.
- **Fix:** Move SuperAdminPanel's data access to authenticated server endpoints (its `adminApi` helper already sends a Bearer token) that verify `role = 'super_admin'` from `profiles` server-side and use the service-role key. **DEFERRED to a later session — do NOT lose this; it must be handled before/with the lockdown or the super-admin console breaks.** Not part of the current public-page migration or the Step-5 SQL batch.

### 5.7c [CLOSED 2026-06-23] Agency search+connect — security/onboarding gate closed (verified + verify toggle + self-activation bypass shut + signup fixed)
- **Files:** `scripts/migrations/rls-deploy4-patches.sql:31-43` (`get_my_agency_ids()`), `:77-135` (scoped `agencies`/`agency_operatives`/`agency_users`/`agency_connections` policies); `scripts/migrations/rls-deploy3b-public-rpcs.sql:449` (`search_agencies`).
- **Issue:** The lockdown (applied 2026-06-15) re-scopes `agencies` from `USING(true)` to own+connected (via `get_my_agency_ids()`), with marketplace discovery moved to the `search_agencies` RPC. This is the flow the lockdown changed most, but it has **zero E2E coverage** (`seed-e2e.js` provisions no agency data; `rls-lockdown-verification.spec.js` only asserts anon is *denied* `agency_operatives`) and **could not be manually tested** (no agency exists in prod). So neither the apply-time E2E gate nor the manual smoke exercised it.
- **Why it shipped anyway:** zero agency users in prod (zero current blast radius) and the failure mode is fail-closed (too-tight scoping → breakage, not a leak) — verifying it should not block the live anon data-exposure fix for a flow nobody can use yet.
- **Hard gate (MUST do before onboarding the first agency):** either (a) seed a throwaway agency + 2nd company + `agency_connections` row and walk search+connect in the **locked** state (a company finds an unconnected agency via the RPC, connects, then sees it via the connections branch of `agency_select`), or (b) add a self-seeding agency E2E spec to the `RLS_LOCKDOWN_APPLIED=1` suite. **Top of the deferred backlog.** See PROGRESS.md blocking-gate header.
- **VERIFIED 2026-06-23 (option b) — RLS/RPC layer is SOUND; gate cleared except the R1 product gap below.** Added `e2e/agency-connect.spec.js` + `e2e/helpers/agencies.js` (self-seeding disposable agency, `e2e-agency-` markers, full teardown — mirrors the §5.22 lifecycle harness). Ran `RLS_LOCKDOWN_APPLIED=1` against the **live locked prod DB**, signed in as the E2E Test Co admin (the connecting company): **6/6 green**, then a service-role probe confirmed **zero residue** (agencies/agency_users/agency_operatives/agency_connections all back to baseline; no leftover connection on E2E Test Co — same cleanup discipline as §5.20).
  - **R2 PASS** — the connect upsert's `onConflict:'company_id,agency_id'` succeeded → the `UNIQUE(company_id, agency_id)` constraint **does exist in prod** (it was simply never in a committed schema, the §5.14 gap). No missing-constraint break.
  - **R3 PASS** — the written `agency_connections` row reads back to its own creator under `ac_select` → **no §5.16-style "saved but invisible" regression**.
  - **R4 PASS** — prod == repo SQL: anon **denied** `search_agencies`; `pending_verification` agency **hidden**; `active` agency **discoverable**; connecting opens the agency row (`agency_select` connections branch) **and** its roster (`ao_select` connections branch).
  - Untested-by-spec (low risk, unchanged by the lockdown): the React UI wiring (`AgencyConnections.jsx` session→`companyId`→upsert/render). Recommended ~5-min manual UI smoke before the first agency, but the lockdown touched only the RLS/RPC layer the spec covers.
- **R1 [WAS OPEN — product/process gap, NOT an RLS bug]: nothing promotes an agency from `pending_verification` → `active`.** Confirmed by grep across `src/`, `api/`, `scripts/`: agencies register as `pending_verification` (`Signup.jsx`, `AgencyRegister.jsx`) and `search_agencies` returns only `status='active'`, but no UI/endpoint/cron/RPC flipped the status — a real agency was undiscoverable until manual SQL. Owner chose option (ii): build the verify toggle.
- **R1 CLOSED 2026-06-23 — option (ii) built + bypass shut + signup fixed; full agency onboarding live-verified.**
  - **Part A (PR #30):** super-admin verify toggle — `api/superadmin.js` `agencies-overview` (service-role read incl. pending, for review) + `set-agency-status` (status allowlist), both behind `verifySuperAdmin`; SuperAdminPanel **Agencies** tab with Activate/Suspend.
  - **Part B (PR #31, applied to prod via the §5.19-grade ritual + live-proven with a real agency JWT):** `BEFORE INSERT OR UPDATE` trigger `agencies_block_self_status_change` (**SECURITY INVOKER**) — blocks an authenticated agency self-activating via UPDATE **and** coerces app-role INSERTs to `pending_verification`, closing **both** doors (`agency_update` had no `WITH CHECK`; `agency_insert` had no status restriction). Capture surfaced the INSERT door; dry-run BEGIN…ROLLBACK 6/6 → COMMIT → verify (trigger enabled, security_definer=false).
  - **Signup regression (PR #32):** agency signup hit `new row violates row-level security policy for table "agencies"` (42501) — pre-existing since the 2026-06-15 lockdown: `agencies.insert(...).select().single()` RETURNING-reads under scoped `agency_select` before the `agency_users` link `get_my_agency_ids()` keys on exists. Fixed in **both** paths (client-gen `crypto.randomUUID()` id, drop `.select()`); live-verified end-to-end. Reproduced with a control (insert without `.select()` succeeds) — NOT the Part B trigger, NOT #30.
  - **Owner ran the full live UI walk:** register agency → invisible in company search → Activate via the toggle → discoverable → connect — **passed**. Walk test data deleted (service-role, re-verified 0 remaining); the 5 demo agencies **suspended** (out of prospect search).
  - **Scope note:** R1 = the **SECURITY/onboarding gate** is closed (agencies can be registered, reviewed, activated, discovered, connected — safely). The agency **product** is NOT finished — see the *Agency platform redesign* epic in PROGRESS.md FEATURE BACKLOG (agency-scoped UX / role-based feature gating / labour-request flow rework).

### 5.11 [MEDIUM] Missing UNIQUE constraints under check-then-insert flows — double-submit duplicates
- **Files:** `supabase-schema.sql:42-52` (signatures — no `UNIQUE(operative_id, document_id)`; client pre-checks then inserts, `SignDocument.jsx:31,164`); toolbox_signatures (`ToolboxSign.jsx:67,93` + RPC also check-then-insert); site_attendance (`record-attendance-rpc.sql:48-66` SELECT-then-INSERT, no lock)
- **Issue:** "One row per (X,Y)" enforced only by racy app checks. The duplicate-attendance cleanup scripts already in `scripts/` (`cleanup-attendance.js`, `nuke-today-attendance.js`, archive JSONs) are evidence this is happening in production.
- **Fix:** Partial unique index on signatures (`WHERE NOT invalidated`), `UNIQUE(talk_id, operative_id)` on toolbox_signatures, advisory lock or exclusion constraint in `record_attendance`.

### 5.12 [MEDIUM] Upserts whose conflict path needs an UPDATE policy that doesn't exist
- **Files:** `src/pages/SiteSignIn.jsx:136`, `src/pages/InviteExistingWorkers.jsx:40` (`operative_projects`); `src/lib/marketplace.js:189` (`postcode_cache`)
- **Issue:** `upsert` runs `ON CONFLICT DO UPDATE`; with no UPDATE policy the conflict path throws an RLS violation — re-assigning an already-assigned operative can break QR sign-in mid-flow.
- **Fix:** Add UPDATE policies or use `{ ignoreDuplicates: true }` since neither call changes data on conflict.

### 5.13 [MEDIUM] `.single()` where 0 rows is normal (97 `.single()` vs 2 `maybeSingle()` codebase-wide)
- **Files:** `src/lib/marketplace.js:170` (postcode cache miss = the common path); `src/pages/CompanySettings.jsx:243`, `PMDashboard.jsx:1415` (`settings` row — errors on 0 rows for new installs **and on >1 rows** once two companies write under `USING (true)`); `src/pages/SnagReply.jsx:33` (token lookup)
- **Fix:** Switch lookup-style queries to `.maybeSingle()` and handle `data === null`.

### 5.14 [LOW] Schema source-of-truth gaps
- **File:** `supabase-schema.sql` (5 tables) vs ~80 tables referenced in code
- **Issue:** Most tables have no committed CREATE TABLE, so constraints and even whether RLS is enabled cannot be audited or rebuilt. `hire_rate`/`hire_rate_period` columns were added via ALTERs noted in a commit message, not a migration file — if not applied, fixing 2.1 turns hire-rate edits into hard 500s.
- **Fix:** `supabase db dump --schema public` and commit it; commit the equipment ALTERs as a migration; CI check that `relrowsecurity` is true for all public tables.

### 5.15 [LOW] Anon-callable read RPCs expose rosters by project UUID alone
- **File:** `scripts/migrations/rls-lockdown.sql:196-228` (`get_portal_data`), `:58-79`
- **Issue:** Anyone with a project UUID (leaks via QR codes/URLs/emails) gets the full operative roster, document list and signature log.
- **Fix:** Gate behind a per-project share token (like `reply_token` on snags).

### 5.16 [HIGH] Snag-reply comments invisible to the company post-lockdown — FOUND + FIXED 2026-06-15
- **File:** `scripts/migrations/rls-deploy3b-public-rpcs.sql` (`submit_snag_comment`, `submit_snag_reply`).
- **Issue:** **Lockdown regression.** Both anon RPCs INSERT `snag_comments` without `company_id`. `SECURITY DEFINER` makes the INSERT succeed (bypasses RLS), but deploy4's `snag_comments` SELECT policy is company-scoped (`co_select USING (company_id = get_my_company_id() OR get_operative_company_id())`), so a `company_id = NULL` row is **invisible to the PM** — a subcontractor's reply is saved but never seen. Worked pre-lockdown only because RLS was permissive. Caught by `e2e/snag-reply.spec.js` in the Step-5 gate.
- **Fix (applied 2026-06-15, SQL-only — no client redeploy):** both RPCs now read `company_id` from the looked-up snag row (server-side, NEVER caller input — they're anon-callable) and stamp it on every `snag_comments` insert. Re-ran `rls-deploy3b-public-rpcs.sql`. Blast radius ~0 rows (lockdown was <1h old; no real subcontractor replies in the window).

### 5.17 [MEDIUM] Duplicate operative identities + ToolboxSign session-id matching — PRE-EXISTING (not a lockdown bug)
- **Files:** data (`operatives` table); `src/pages/ToolboxSign.jsx:46` (`operatives.find(o => o.id === opSession.id)`).
- **Issue:** Surfaced during the 2026-06-15 lockdown smoke (Joe scanned a Thomas Worley "Morgan Lewis" toolbox QR and wasn't recognised), but **not caused by the lockdown** — `get_toolbox_for_signing` is `SECURITY DEFINER` and bypasses RLS, and Joe IS linked to that project in `operative_projects`, so the RPC returns him regardless. Root cause: Joe has **3 operative records across companies** (`507c6d52` company NULL, `0b5775d7` Thomas Worley, `269e5905` Bancroft), **two sharing `joe.szavay@icloud.com`**. His active `operative_session` resolved to the wrong-company identity (Bancroft), which isn't on the Thomas Worley project → "not assigned". ToolboxSign matches the signer only by `opSession.id`, with no fallback to email-across-the-project-roster, so a stale/cross-company session blocks signing.
- **Fix (deferred, separate from lockdown):** (a) de-duplicate operatives / forbid one email across multiple operative records, or key identity to the auth user; (b) harden ToolboxSign to resolve the signer by email against the returned roster, not just session id. Rolling back the lockdown would NOT fix this.
- **RESOLUTION (2026-06-17) — root cause confirmed, folded into the durable §5.19 fix:** the "wrong-company `operative_session`" is the login picker binding the worker identity via `ops[0]` (unordered/arbitrary among email-matched rows — `PMLogin.jsx:122`, `OperativeLogin.jsx:47`), while RLS resolves the operative independently via `user_metadata.operative_id`; for an email with >1 operative record the two disagree, so the worker app shows a company the RLS session cannot read. The picker itself is Manager(`profiles`)-vs-Worker(`operatives`) and is **client-side routing only** (no JWT write). The durable `auth_user_id` + `left_at` model (§5.19) makes the picker, `operative_session`, **and** RLS all resolve the single ACTIVE record. Historical records are RETAINED per the confirmed lifecycle rule (old company-bound compliance artifacts do NOT follow the person), so no row-level dedupe is needed. Live audit 2026-06-17: only one person (Joe) has >1 record. See `docs/durable-519-auth-user-id-plan.md`.

### 5.18 [RESOLVED 2026-06-23] Rotate service-role key + shared demo password — legacy keys migrated to new API keys + DISABLED
- **Scope:** `SUPABASE_SERVICE_ROLE_KEY` (used Node-only: `scripts/seed-e2e.js`, the `api/*` serverless functions via env) and the shared `demo@coresite.io` password shipped in the JS bundle (`SandboxEntry`/demo flow).
- **Action:** Rotate `SUPABASE_SERVICE_ROLE_KEY` in Supabase, then update local `.env` **and** the Vercel project env (Production + Preview); also rotate/flag the shared `demo@coresite.io` password. **MUST be done before onboarding any customer beyond the current trial.** Same tier as §5.7c.
- **Why deferred:** owner-decided — handled later, before the next customer. No evidence of exposure; the key has never been committed (gitignored `.env` only). *(2026-06-22: owner now describes the key as "exposed earlier" — exposure history to be confirmed; does not change the plan, only urgency framing.)*
- **APPROACH DECIDED + APPROVED (2026-06-22) — migrate to new API keys (legacy rotation is impossible):** Investigation confirmed both keys are **legacy JWT keys** (`eyJh…`, one shared JWT secret), and Supabase has **removed legacy anon/service_role/JWT-secret rotation**. The only way to kill the exposed `service_role` key is to migrate to the new API-key system (`sb_publishable_`/`sb_secret_`) and **deactivate the legacy keys**. Because legacy anon + service_role share one JWT secret, deactivation is a **pair** operation → the anon key is **forced into scope** (anon → publishable). Legacy + new keys **coexist**, so the migration is **zero-downtime**.
- **SAFE SEQUENCE (invariant: legacy stays valid throughout; deactivate ONLY after every consumer is verified green on new keys; deactivation is reversible):** (1) create `sb_secret_` + note `sb_publishable_`; (2) stage new values in all 3 stores — local `.env`, **Vercel Prod+Preview**, **GitHub Actions secret**; (3) redeploy Vercel; (4) verify every consumer green (prod app, an api/function call, a CI run, local scripts/dev); (5) **only then** deactivate legacy (kills the exposed key). The one forbidden move: deactivating legacy before (4) is green.
- **Consumer inventory:** `SUPABASE_SERVICE_ROLE_KEY` → local `.env` + Vercel(Prod+Preview) + GitHub secret; read by 20 `api/*` fns (incl. 2 crons) + 5 `scripts/*` + `e2e/helpers/operatives.js` (all `process.env`, **no code change** — var names kept). `VITE_SUPABASE_ANON_KEY` → local `.env` + Vercel(Prod+Preview) + GitHub secret; read by `src/lib/supabase.js` (no code change). `VITE_DEMO_PASSWORD` → local `.env` + Vercel(Prod+Preview) only (**not in CI** — `auth.spec.js` uses the isolated e2e account, never the demo flow, so the `'Demo2026!'` fallback removal is CI-safe).
- **Demo password:** reset `demo@coresite.io` in Supabase Auth + update `VITE_DEMO_PASSWORD` (local + Vercel) + redeploy; hardcoded `'Demo2026!'` fallback removed from `SandboxEntry.jsx` (this branch). `VITE_DEMO_PASSWORD` is public-bundle → rotation only retires the burned string; the real fix is §1.9.
- **RESOLVED 2026-06-23 — legacy keys DISABLED; all consumers live on the new API-key pair; exposed `service_role` is DEAD.** Ran the full D1–D5 sequence with the invariant held (legacy stayed Active until every consumer verified green, then disabled): **D1** created the new `sb_secret_`/`sb_publishable_` pair; **D2** local verified (BYPASSRLS audit read + publishable `200`); **D3** CI green on the new keys (PR #25 e2e, GitHub secrets swapped first); **D4** Vercel Prod+Preview (all 3 vars) + demo-password reset + redeploy + prod app/functions/`/try` demo all green; **D5** disabled the legacy pair in Supabase (kills old anon + service_role together — shared JWT secret) and confirmed the live app fully working post-cutover on the new keys. Demo password rotated (retires `Demo2026!`; reset via `auth.admin.updateUserById` because the dashboard only offered an unreceivable recovery email — one-off `scripts/set-demo-password.mjs`, deleted after use). `SandboxEntry` `'Demo2026!'` fallback removed (PR #25). Docs: [migrating-to-new-api-keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys), [api-keys](https://supabase.com/docs/guides/getting-started/api-keys).
- **CLEANUP (later — do NOT touch now):** (a) an **unused auto-created "default" new-key pair** (dashboard key-ID suffixes `kwy0` / `bCmI3r`) sits alongside the live pair (suffixes `dC62s` / `JorGl2q`). Before ever deleting the default pair, **confirm GitHub Actions / no consumer is on it** (the new keys are interchangeable as long as the right one is wired everywhere). (b) **§1.9 demo-privilege lockdown** remains the real fix for the public (`VITE_`-bundled) demo password — separate follow-up.

### 5.19 [CRITICAL] Operative RLS scoping forgeable via user-writable `user_metadata` — LIVE in the applied lockdown (found 2026-06-16)
- **Files:** `scripts/migrations/rls-lockdown.sql:36` (`get_my_operative_id()`), `:47` (`get_operative_company_id()`), `scripts/migrations/fix-get-my-company-id-operatives.sql:32` (`get_my_company_id()` operative branch), `scripts/migrations/rls-deploy3-rpc-functions.sql:33`. Policy dependency: in the **applied** `scripts/migrations/rls-deploy4-lockdown.sql`, `get_my_company_id` is referenced **235×** and `get_operative_company_id` **49×** (+12 in `rls-deploy4-patches.sql`) — deploy4 does **not** redefine the helpers, so these `user_metadata` versions are live.
- **Issue:** All three operative helpers resolve identity from `auth.jwt() -> 'user_metadata' ->> 'operative_id'`. `user_metadata` (= `raw_user_meta_data`) is **freely writable by the authenticated user** via `supabase.auth.updateUser({ data: { operative_id } })` (Supabase applies no validation; it surfaces in `auth.jwt()` on the next token refresh). So any **authenticated** user who knows a **real operative UUID in a victim company** can set `operative_id` to it, refresh, and `get_operative_company_id()` / `get_my_company_id()` (operatives have no `profiles` row, so the COALESCE falls through) resolve to the victim company. Every `co_select` / `co_insert` / `co_update` policy scoped `USING (company_id = get_my_company_id() OR company_id = get_operative_company_id())` then grants **cross-tenant read, and write where `co_insert`/`co_update` exist** (e.g. `holiday_requests`, `audit_logs`). This **defeats the tenant isolation the 2026-06-15 lockdown enforces** — a live hole in what was shipped, same root cause as §4.1/§4.2 (trusting a user-controlled identity claim).
- **Severity / bounds:** CRITICAL, but **narrower than the closed anon hole**: requires (a) any authenticated account (anon has no `user` and cannot `updateUser` → `get_operative_company_id()` returns NULL), and (b) a **genuine** operative UUID from the target tenant (a random/guessed id returns NULL). Operative UUIDs leak via QR codes, invite emails and `/operative/:id/...` URLs (see §4.1). Managers can also escalate via the `… OR get_operative_company_id()` branch (gains the victim company *in addition* to their own — their `profiles` row doesn't block the OR).
- **Confidence:** confirmed by the static function definitions + policy dependency + well-established Supabase `user_metadata`-is-writable-and-in-the-JWT semantics. No empirical injection PoC was run (it would require a write to mutate account metadata; owner declined — known behaviour).
- **Fix (owner-approved 2026-06-16, sequenced AHEAD of the §4.1 API routes — the helpers are the isolation backbone):**
  - **Interim (SQL-only, close arbitrary injection fast):** cross-check the injected `operative_id` against a *server-controlled, non-user-writable* JWT claim. Candidate is the top-level `email` claim (verified email; not in the user-writable `user_metadata` bag) — **contingent on**: the project having email-confirmation / secure-email-change enabled (else `email` is itself forgeable), and a pre-check that legitimate operatives' `operatives.email` matches their auth email (else fail-closed breakage; see §5.17 duplicate/mismatched emails).
  - **Durable:** add `operatives.auth_user_id uuid UNIQUE` (FK → `auth.users`), populate at account creation + one-time backfill (duplicate-email operatives resolved manually — §5.17), then redefine the helpers to resolve via `auth.uid()` (`WHERE auth_user_id = auth.uid()`) — no metadata trust at all. This is the **same `auth_user_id` link** that underlies the §4.1/§4.2 API rework.
  - Prod RLS change → apply deliberately (dry-run / verify), not on momentum.
- **Status (2026-06-16):** **INTERIM mitigation APPLIED + VERIFIED in prod.** Deliberate apply (live-capture of canonical rollback → dry-run/`ROLLBACK` → `BEGIN`/`COMMIT` → re-capture confirmed all three helpers carry `AND lower(email) = lower(auth.jwt() ->> 'email')` → `RLS_LOCKDOWN_APPLIED=1` E2E suite **35/35 green**: operatives still resolve, anon still denied). Migration: `scripts/migrations/rls-5-19-interim-email-crosscheck.sql` (rollback: `…-rollback.sql`). Pre-req confirmed live: `mailer_autoconfirm=false` (email claim non-forgeable). **DURABLE fix still PENDING (tracked follow-up): add `operatives.auth_user_id` FK + redefine helpers via `auth.uid()`, dropping `user_metadata` trust entirely — also closes the §5.17 duplicate-email residual and is the same link underlying §4.1/§4.2.**
- **DURABLE FIX — PLANNED IN DETAIL (owner-approved 2026-06-17, plan-first; NOT yet applied):** refines the above with an **active/historical lifecycle**: add `operatives.auth_user_id uuid REFERENCES auth.users(id)` **and** `operatives.left_at timestamptz` (NULL = active; the operatives table currently has **no** active/historical marker — live audit 2026-06-17), with `UNIQUE(auth_user_id) WHERE auth_user_id IS NOT NULL AND left_at IS NULL` (one live identity per login, plus a retained historical trail per the lifecycle rule). Redefine the three helper **bodies** (names/signatures unchanged → **no table policy touched**) to `WHERE auth_user_id = auth.uid() AND left_at IS NULL`; phased **dual-accept** (`COALESCE(auth.uid path, interim email path)`) → **enforce** (auth.uid only, retiring the interim email check). Also closes §5.17 (the picker `ops[0]` sites + `resolve_login_route` resolve the ACTIVE record by `auth_user_id`) and **removes §5.19's dependency on the `email` claim** → post-enforce, unblocks §5.20. Verified read-only 2026-06-17 that super-admin/manager logins resolve via `profiles`/`managers`, never operatives, so marking operative records historical cannot affect them. Live audit: 58 operatives / 5 companies / 51 auth users, only one person (Joe) multi-record. Full plan (schema, backfill + manual-resolution list, phased PRs, E2E): **`docs/durable-519-auth-user-id-plan.md`**.
- **DURABLE FIX — PROGRESS:** **PR2 (schema)** applied + proven live (a real signup linked `auth_user_id` correctly). **PR3 (backfill) APPLIED + VERIFIED 2026-06-21** (`scripts/migrations/rls-5-19-pr3-backfill.sql`): on the live 56 operatives — auto-linked 27 unambiguous 1:1 rows (explicit verified VALUES), linked Joe's active Thomas Worley record to `87eccb3f`, marked his Bancroft + Szavay-PG records historical (`left_at` set), skipped the 26 ABC demo rows. Deliberate apply (dry-run `ROLLBACK` → `COMMIT` → independent read-only re-verify) all read `collisions=0 active_linked=28 active_unlinked=26 historical=2 total=56`. **Gotcha caught at re-audit:** `507c6d52` (Szavay-PG) has a *different* email (`szavaypropertygroup.co.uk`) with its own auth account, so the generic 1:1 rule swept it into the auto-set — it was explicitly excluded from auto-link and marked historical instead. **Helpers still read `user_metadata` (interim email cross-check live) — PR4 dual-accept / PR5 enforce NOT yet applied.** Remaining: **PR3b** remove-flow → mark-historical (§5.22, must precede PR4), then PR4 dual-accept, PR5 enforce.
- **DURABLE FIX — COMPLETE 2026-06-21 (PR5 ENFORCE MERGED + DEPLOYED + smoke-verified, PR #19 → main `718f2c8`):** the three helpers now resolve operative identity via `auth_user_id = auth.uid() AND left_at IS NULL` **only** — the interim `user_metadata.operative_id` + email COALESCE arm is DROPPED (`get_my_company_id` keeps the profiles/manager arm first + the auth.uid operative arm). `user_metadata` is no longer trusted anywhere for RLS; the §5.19 interim email cross-check is **RETIRED** and the §5.19 dependency on the verified `email` claim is gone. Binding sites (`PMLogin`/`OperativeLogin`/`SiteSignIn`) resolve by `auth_user_id` only (PR4 email fallback removed); `create-operative-account.js` stops writing `user_metadata.operative_id`. **Capture-first discipline caught a stale-repo drift:** the live `pg_get_functiondef` was *semantically* identical to the PR4 dual-accept defs but *cosmetically* different from the committed apply file (no body comments, 4-space indent), so the rollback artifact = the **verbatim live capture** (`scripts/migrations/rls-5-19-pr5-enforce-rollback.sql`), not the repo text. **Safety re-proven FRESH before apply (Part B = 0):** no active+unlinked operative shares an email with any auth account, so dropping the interim arm locked nobody out (the 26 active+unlinked are all ABC demo with no login; the 28 active+linked already resolved via auth.uid). Deliberate apply: dry-run `BEGIN…ROLLBACK` (no-metadata/email check 0, collisions 0, Part B 0) → `BEGIN…COMMIT` → re-capture verified all three bodies are auth.uid()+`left_at` only. **E2E `operative-enforce.spec` 3/3** (forged `user_metadata.operative_id` → ZERO via the now-dead metadata path; linked operative still resolves; unlinked-authenticated → ZERO) + full `RLS_LOCKDOWN_APPLIED=1` regression **52 passed**. **Smoke-verified live post-deploy:** icloud worker login → active Thomas Worley record via the deployed `auth_user_id`-only binding (`87eccb3f` → `0b5775d7`), no email fallback — deployed code agrees with the enforced SQL. SQL: `scripts/migrations/rls-5-19-pr5-enforce.sql`. **Decoupled (owner decision, NOT in PR5):** the `UNIQUE(lower(email))` forward-guard (only ever as active-only `WHERE left_at IS NULL`, a non-load-bearing hygiene index → optional PR5b, gated on a dup-check + invite/cross-company/reactivate ordering audit) and closing §5.20 (separate follow-up; its constraint is now lifted — see §5.20).

### 5.20 [BLOCKING GATE — RESOLVED + LIVE-VERIFIED 2026-06-23] Self-service signup broken by Confirm-email (required for §5.19)
- **Files:** `src/pages/Signup.jsx:48`, `:135` (client `supabase.auth.signUp`); the no-session fallback at `:58-68` (`signUp` → immediate `signInWithPassword`).
- **Issue:** The §5.19 interim fix requires Supabase **"Confirm email" ON** (`mailer_autoconfirm=false`) so the JWT `email` claim is non-forgeable. With it on, `signUp` returns a user but **no session**, and the `:58-68` fallback's immediate `signInWithPassword` fails with *"Email not confirmed"* → self-service company signup throws and leaves an **orphaned unconfirmed auth user**. (Confirmed live 2026-06-16: `mailer_autoconfirm=false`.) All **admin-created** paths are unaffected — `create-operative-account.js:66`, `create-company-admin.js:85,94`, `create-manager.js:127,141` set `email_confirm: true`.
- **⚠️ Constraint:** Do **NOT** disable "Confirm email" to fix this — that reopens §5.19 (the `email` claim becomes user-forgeable again).
- **Fix (before onboarding any new company):** route self-service signup through an **admin-confirmed server endpoint** (`email_confirm: true`, like `create-company-admin`), **or** implement a proper confirm-your-email UX (the `emailRedirectTo: …/onboarding` hook at `Signup.jsx:53` suggests this was partly intended) and handle the no-session state instead of force-signing-in. Also clean up the orphaned auth user on failure (§2.10).
- **Status (2026-06-16):** tracked, NOT fixed. No imminent onboarding (owner: ≥1 month out). **Hard gate before the next company onboards.**
- **NOTE (2026-06-17):** the durable §5.19 fix keys operative RLS on `auth.uid()` (not the `email` claim), so once it is **enforced**, Confirm-email is no longer load-bearing for tenant isolation — this gate can then be cleared by either re-enabling immediate signup (safe post-enforce) **or** the admin-confirm endpoint above. Until enforce, the ⚠️ constraint stands. See `docs/durable-519-auth-user-id-plan.md`.
- **CONSTRAINT LIFTED (2026-06-21) — §5.19 PR5 enforce is LIVE:** operative RLS now resolves via `auth.uid()` only, so the verified `email` claim is **no longer load-bearing** for tenant isolation. The ⚠️ "do NOT disable Confirm-email" constraint is therefore **lifted**. §5.20 remains an OPEN gate (self-service signup still throws under Confirm-email), but it is now **decoupled from the §5.19 work** and may be closed by either path — **recommended: the admin-confirm signup endpoint** (`email_confirm:true`, keeps Confirm-email ON as defense-in-depth) — as its own follow-up **before onboarding the next company.** Not a live hole.
- **RESOLVED IN CODE (2026-06-23, PR #26 → main `ae5c802`) — admin-confirm endpoint shipped; awaiting owner live smoke-test to fully close.** New **public** `api/signup-company.js` creates the auth user server-side with `email_confirm:true` (mirrors `create-operative-account.js`/`create-company-admin.js`); `Signup.jsx` Subcontractor **and** Agency handlers route through it, then `signInWithPassword` (now succeeds) and run the **existing** company/profile/managers/agency inserts under the new admin's RLS session — downstream insert code unchanged. **Confirm-email stays ON** as defense-in-depth (NOT disabled → §5.19 untouched). **Public-path guardrails:** paged existing-account lookup (§4.9) → **409 if the email already has an account, never modifies an existing auth user** (no password reset / re-confirm / metadata change → no takeover); creates only the auth user with `role:'admin'` metadata and **no** profiles/managers row — post-§5.19-enforce RLS keys on `auth.uid()`→profiles/managers (not the email claim), so a bare confirmed user with no profile maps to a **NULL company** → no cross-tenant read/write; service-role key server-side only. Verified pre-merge: `npm run build` clean; the only ESLint finding is the pre-existing `process` `no-undef` shared by every `api/*.js`. **Out of scope (logged, NOT in this PR):** §2.10 orphan-on-partial-failure (not worsened; closed only by a later all-server-side variant if needed); rate-limit/captcha on public service-role endpoints (shared gap with `create-operative-account.js`/`demo-request.js`). **Full close pending:** owner runs the real signup flow on coresite.io post-deploy (no "Email not confirmed", lands in app, company/profile created).
- **CLOSED — LIVE-VERIFIED 2026-06-23 (owner).** Clean-session self-service signup on coresite.io/signup completed **end to end** (no "Email not confirmed"; account → onboarding). A read-only service-role diagnostic confirmed the signup produced a **complete, correctly-linked** account (1 auth user `email_confirm:true`, 1 profile, 1 company, 1 manager, all on one `company_id`, no duplicates). The one snag during testing — *"Cannot coerce the result to a single JSON object"* on Onboarding step 1 — was diagnosed (diagnostic showed clean data) as **stale/mixed browser-session drift from repeated test signups, NOT a bug**, and was confirmed gone on the clean-session retest. Option B (server-side inserts) was **considered and correctly NOT built** once the diagnostic proved there was no data inconsistency to fix. Hardening shipped alongside: `Onboarding.jsx`'s three company `UPDATE`s now use `.maybeSingle()` + a 0-row guard that surfaces a clear "session expired — sign in again" + `/login` redirect instead of the cryptic PostgREST error (**PR #27 → main `a971f5d`**), so a working signup no longer *looks* broken on session drift. **Still logged, NOT in these PRs:** §2.10 orphan-on-partial-failure; rate-limit/captcha on public service-role endpoints.

### 5.21 [LOW] Dangling auth accounts with admin/manager role metadata but no profiles/managers row — CLEANUP
- **Files:** Supabase Auth users (no corresponding DB rows).
- **Issue:** The 2026-06-17 read-only audit surfaced ~5 stray auth users with typo emails (`joe.szavay@icloud.come` / `…comee` / `…comeee`, `joe.szavay@bancroft.uk.commm`) and `szavayltd@gmail.com`, all carrying `user_metadata.role` of `admin`/`manager` but with **no** `profiles` or `managers` row. Harmless under company-scoped RLS (they resolve to a NULL company via `get_my_company_id()`), but they are exactly the dangling-metadata accounts the §4.2/§4.7 fail-open API paths can mishandle (role-in-metadata trusted when company metadata is absent).
- **Fix (cleanup backlog, owner-decided — do NOT touch as part of the §5.19 work):** delete the stray auth users; longer term, resolve role from `profiles`/`managers` and fail closed when absent (§4.7).
- **Also noted (data, not a finding):** the 26 "ABC Construction Ltd" operatives with no auth account are confirmed DEMO/seed data — out of scope for the §5.19 backfill (which skips no-auth rows).
- **UPDATE (2026-06-17) — 6 orphaned OPERATIVE logins too:** the durable-§5.19 testing + missing-2 forensic surfaced six **operative-role** auth accounts whose operative row was hard-deleted (§5.22) but the login was left behind — all disposable temp-mail, all test/junk (no real operative): `wayib54525@dyleris.com`, `tejij69686@preparmy.com`, `iecdnkcpyqlvcpmmbz@vtmpj.net`, `ozfhvuehfzkkygnwre@onldm.net`, `cfqxhvytqlfwlnjunf@jbsze.ne`, `rhmbeuqtfbqnntkfnr@vtmpj.net`. Add to the same cleanup sweep. Root cause of the orphaning = §5.22 (remove-operative leaves the auth user) compounded by the §4.9 first-page `listUsers()` bug in `api/delete-operative.js:69`.

### 5.22 [HIGH — RESOLVED PR3b 2026-06-21] "Remove operative" hard-deletes the row + destroys compliance history — contradicts the durable-§5.19 lifecycle rule
- **Files:** `src/pages/PMDashboard.jsx:1233` (`removeOperative` → `supabase.from('operatives').delete()`), `src/pages/AllWorkers.jsx:33-41` (deletes signatures/attendance/toolbox/chat — §2.8 — then `operatives.delete()`), `api/delete-operative.js:38` (`delete_operative_cascade` RPC hard-deletes the operative + child data), `:66-80` (auth cleanup).
- **Issue:** All three "remove operative" paths **hard-DELETE** the operatives row and its child compliance data (signatures, attendance, toolbox signatures — legally meaningful H&S records, via the §2.8 client cascades / the cascade RPC). Confirmed live 2026-06-17: removing the PR2 test operative left **no row and no orphaned child records** (the missing-2 forensic found zero orphans in signatures/attendance/toolbox/projects/holidays — the cascade wiped them). This **directly contradicts the durable-§5.19 lifecycle rule** (compliance history stays company-bound and does NOT follow the person) and makes the new `operatives.left_at` marker dead weight — no operative ever *becomes* historical through the app, they vanish with their history. So the "retained historical trail" the durable fix promises is defeated by the app's own remove button.
- **Orphaned auth user (via §4.9):** the super-admin path (`delete-operative.js:69`) finds the auth user to delete with a **first-page-only `listUsers()`** (§4.9) — with >50 auth users it misses the account and never calls `deleteUser`, leaving an orphaned, login-capable operative account (confirmed: 6 orphaned temp-mail operative logins, §5.21). The PM/AllWorkers client paths never touch the auth user at all. So a removed operative routinely leaves a live login with no operative row.
- **Fix (own PR, slotted BETWEEN PR3 backfill and PR4 helpers — see `docs/durable-519-auth-user-id-plan.md`):** make "remove operative" **mark historical** — `left_at = now()`, `auth_user_id = NULL` (detach the login; the person keeps it for an active record elsewhere / a future rejoin) — across all three paths, preserving the compliance record. Reserve genuine hard-DELETE for true erasure (GDPR), **admin-only**, with the §2.8 cascade fixed (check each child delete, or one transactional RPC) so erasure is deliberate; page `listUsers` / use `getUserById` (§4.9) so auth cleanup fires when erasure IS intended.
- **Status (2026-06-17):** logged; remove-flow change scheduled as its own PR between PR3 and PR4 of the durable §5.19 sequence.
- **RESOLVED (2026-06-21, branch `fix/operative-leave-mark-historical`, draft PR open):** new `api/operative-leave` (verifyAuth, same-company) marks historical (`left_at = now()`, `auth_user_id = NULL`, no child deletes); `PMDashboard.removeOperative` + `AllWorkers.removeWorker` call it via authFetch (the §2.8 unchecked client cascades are gone); AllWorkers gains an Active/Past toggle so retained leavers stay reachable read-only. GDPR hard-DELETE is now super-admin-only (`api/delete-operative`) with the §4.9 auth cleanup fixed — `delete_operative_cascade` returns `auth_user_id` and the endpoint deletes the login by id (no more first-page `listUsers()` scan). **Read-side guards (so "removed = gone" actually holds) shipped WITH this PR, not deferred:** `left_at IS NULL` on 27 client/API active-use reads (incl. the worker-login/kiosk session-binding reads `PMLogin`/`OperativeLogin`/`SiteSignIn`) + the 3 RLS helpers + `resolve_login_route`/`operative_exists_by_email`/`get_operative_public_info`/`get_portal_data`/`get_toolbox_for_signing`. SQL `rls-5-22-pr3b-leftat-guards.sql` **APPLIED+VERIFIED in prod 2026-06-21** (capture→dry-run→COMMIT→independent re-verify). E2E green (`operative-remove-historical`/`-rejoin`/`-gdpr-erase` + full regression). The 6 orphaned temp-mail operative logins remain on the §5.21 cleanup sweep.

---

## 6. RACE CONDITIONS / ASYNC / OFFLINE SYNC

### 6.1 [CRITICAL] Failed or interrupted offline mutations are stranded forever
- **File:** `src/lib/syncEngine.js:51-64`; `src/lib/offlineDb.js:112-115`
- **Issue:** `getPendingMutations()` only reads `status === 'pending'`. On error a mutation is set to `'failed'` and nothing ever resets it; the 3-retry drop logic is unreachable because `retryCount` can never accumulate (failed records are never re-fetched). Records are also set to `'syncing'` *before* the network call — kill the app mid-flush (common on iOS) and they're stuck in `'syncing'` forever. One transient blip = the user's offline edit is permanently lost while the badge says synced.
- **Fix:** On startup and at the top of `processQueue()`, reset `'failed'` (retryCount < N) and stale `'syncing'` records to `'pending'`; surface permanently-failed mutations instead of dropping them.

### 6.2 [CRITICAL] No optimistic-ID remapping — offline edits to offline-created records can never sync
- **File:** `src/lib/syncQueue.js:16-19`; `src/lib/syncEngine.js:108-118`, `:154`
- **Issue:** `offlineInsert` assigns a client UUID; on flush the ID is deleted and Supabase generates a new one. Any queued mutation referencing the optimistic id (edit, comment with `snag_id`, delete) targets an id that never exists server-side → `'failed'` → stranded (6.1). Create a snag offline, edit it offline, lose the edit.
- **Fix:** Keep the client UUID as the real primary key on insert (simplest), or remap ids across the remaining queue after each insert flush.

### 6.3 [HIGH] Sync badge unconditionally reports "all synced"
- **File:** `src/lib/syncEngine.js:48`, `:70`
- **Issue:** After the loop, `notifyListeners({ syncing: false, pendingCount: 0 })` runs even when mutations failed or the loop broke on connectivity loss — the badge hides while unsynced writes remain.
- **Fix:** Re-query pending/failed counts after the loop and report real numbers plus an error state.

### 6.4 [HIGH] `offlineInsert/Update/Delete` queue doomed mutations as "saved offline"
- **File:** `src/lib/syncQueue.js:47-51`, `:100-103`, `:132-135`
- **Issue:** The online path's catch treats *every* error as a network failure and queues it ("Changes saved offline"). RLS denials and constraint violations get queued, then fail identically on every flush — a rejected write presented as a successful one, forever.
- **Fix:** Distinguish network errors (TypeError/offline) from server rejections; only queue the former.

### 6.5 [HIGH] Stale-fetch race in `useOfflineData` — wrong project's data can win
- **File:** `src/hooks/useOfflineData.js:26-32`, `:53`, `:97`
- **Issue:** `mountedRef` is reset to `true` on every effect run, so when `table`/`filter` changes quickly, the previous in-flight load's `setData` can land after the new one — displaying the wrong project's data.
- **Fix:** Effect-scoped `let ignore = false` (set in cleanup) or a request-sequence counter checked before every `setData`.

### 6.6 [HIGH] Per-tab sync lock — two tabs duplicate inserts on connectivity flap
- **File:** `src/lib/syncEngine.js:11`, `:31-33`
- **Issue:** The `syncing` lock is module-level (per tab) but the queue is shared IndexedDB. Two tabs both receive `online`, both read the same pending rows before either marks them `'syncing'`, both insert → duplicate rows. No idempotency key (the client id is deleted on flush), so lost-response retries also duplicate.
- **Fix:** Wrap `processQueue` in `navigator.locks.request('coresite-sync', …)`; insert with the client UUID as PK so replays conflict instead of duplicating.

### 6.7 [HIGH] Queued offline updates blind-overwrite newer server edits
- **File:** `src/lib/syncQueue.js:90-119`; `src/lib/syncEngine.js:127-155`
- **Issue:** Flushes apply the full stale payload with no `updated_at` precondition — a colleague's online edits made while the device was offline are silently clobbered.
- **Fix:** Send only changed fields with an optimistic-concurrency guard (`.eq('updated_at', original)`); flag conflicts instead of overwriting.

### 6.8 [MEDIUM] Offline fallback returns the entire table cache, ignoring filters
- **File:** `src/hooks/useOfflineData.js:126-131`, `:145-152`
- **Issue:** `fetchAndCache`'s offline path is `getAllRecords(table)` — every cached row across all projects ever viewed on the device; pages show cross-project data offline.
- **Fix:** Pass the index filter into the fallback (`getByIndex`), mirroring `useOfflineData`'s own offline path.

### 6.9 [MEDIUM] Mutations queued during an active flush wait for the next online event
- **File:** `src/lib/syncEngine.js:31-36`, `:175-186`
- **Issue:** `processQueue` snapshots the queue once; anything queued mid-flush (or while the lock rejects a second call) sits unsynced — with the badge hidden (6.3) — until the next offline→online transition or restart.
- **Fix:** Loop until a post-flush re-query returns empty, or set a rerun flag when called while locked.

### 6.10 [MEDIUM] Service worker caches Supabase `/auth/` responses
- **File:** `src/sw/service-worker.js:41-50`
- **Issue:** `NetworkFirst` (5s timeout, statuses `[0, 200]`) on `/auth/` can serve a cached `GET /auth/v1/user` after sign-out or token revocation — masking revocation and producing confusing identity/token errors. Contributes to the reported auth symptoms.
- **Fix:** `NetworkOnly` for `/auth/`; offline auth restore already lives in the IndexedDB authCache.

### 6.11 [LOW] Assorted async gaps
- **Files:** `src/lib/ProjectContext.jsx:21-45` (no `.catch`, no offline fallback, no stale-company guard — saved project selection vanishes offline); `src/pages/HolidayRequests.jsx:148-149`, `:173-174` (post-mutation allowance refresh without `.catch` → unhandled rejection + stale figure); `src/main.jsx:34-37` (update banner reloads before SKIP_WAITING activates — "tapped update, nothing changed"); `src/lib/CompanyContext.jsx:19-27`, `:46-61` (5s `Promise.race` timeout discards the eventually-resolved real session in favour of stale cached auth)
- **Fix:** Add catches/fallbacks; reload on `controllerchange`; on race timeout still apply the late-resolving session when it arrives.

---

## Test hygiene backlog (logged 2026-06-25)
Non-urgent E2E/test-infra follow-ups surfaced while shipping the §2.x reliability/compliance batches.
- **TH-1 — Permit E2E coverage (guards §2.20).** No `e2e/permit.spec.js` exists, so the permit audit-trail fixes rest on diff review + the mechanical shape. Add: create permit → approve → assert a `permit_signatures` row exists (and ideally reject/extend/close each log a row). Gives the compliance audit-trail real regression coverage.
- **TH-2 — Operative-lifecycle shared-fixture pollution.** The `operative-remove-historical` / `-reactivate` / `-rejoin` specs mutate a single shared test operative serially against live Supabase, so `left_at` state races in a full run (batch-1 run: `operative-remove-historical:88` hard-failed in the full suite but passed 6/6 in isolation; `operative-reactivate` saw `left_at` still set). Give each lifecycle spec its own freshly-seeded operative (or a per-spec beforeAll seed) so a full-suite run is deterministic.
- **TH-3 — Progress-drawing delete E2E coverage (guards §2.6).** No spec covers drawing deletion. Add: create a throwaway `progress_drawings` row + a few `progress_items` (which generate `progress_item_history`) + a `progress_zones` row → delete the drawing via the UI → assert the drawing row **and** all three child sets are 0 for that `drawing_id` (proves the FK `ON DELETE CASCADE` fired atomically); plus a bad-id delete that hits the "not found / no permission" path and removes nothing.

---

## Suggested fix order

1. **4.1–4.4** (unauthenticated operative impersonation / self-approval / account takeover / spoofable cron) — these are exploitable remotely today.
2. **5.1–5.4** — verify live `pg_policies`; if the permissive set is live, all tenant data is anon-readable/writable. Run the deploy4 lockdown after migrating the public pages to RPCs — but fix **5.5** first or the lockdown will convert dozens of working writes into silent no-ops.
3. **2.1–2.3** — the reported plant-edit bug (one small PATCH mapping fix, plus the project_id guard).
4. **1.1, 1.6, 1.7** — single-flight refresh, clear `sandbox_mode` on logout/login, and a global `onAuthStateChange` (the reported token errors and the second silent-save path), then the rest of section 1.
5. **6.1–6.7** — the offline queue currently loses or duplicates writes; consider disabling "saved offline" messaging until fixed.
6. Sweep the unchecked-mutation list (section 2) with a shared `mustWrite()` helper that throws on `error`, then the form/API polish items.
