# RLS Remediation Plan — CoreSite (anon-key lockdown)

> **PRE-LOCKDOWN HARDENING (2026-06-10) — owner-requested, NOT applied to prod:**
> 1. **agencies discovery** moved to a minimal-projection RPC: `search_agencies()` (deploy3b) returns only `id, company_name, primary_contact_name, primary_contact_email, status` — never insurance docs / VAT-reg / address / rates. `agencies` SELECT is now scoped to own + connected agencies (deploy4-patches); `AgencyConnections.searchAgencies` calls the RPC. ⚠️ Requires re-running deploy3b (now includes `search_agencies`) before this client ships.
> 2. **`get_user_company_id()` confirmed:** it exists live and returns the identical value to `get_my_company_id()` for the test user, so the rollback's reconstructed body is behaviourally correct (capture the canonical body via `pg_get_functiondef` for full certainty).
> 3. **SuperAdminPanel** cross-tenant reads AND writes moved to a new service-role endpoint `api/superadmin.js` (overview / company-detail / create-company / set-company-active / set-company-features / set-manager-active / reset-manager-password), gated by `verifySuperAdmin`. The client no longer reads other tenants directly, so the lockdown won't break it. Auth gate covered by `e2e/superadmin-endpoint.spec.js`; **happy-path super-admin behaviour is NOT E2E-covered (no super_admin test account) — smoke-test manually or provision one before the lockdown.** (`reset-manager-password` preserves the existing `managers.password` behaviour; the proper §5.4 auth.admin fix is still separate.)
> 4. **DocumentHub bug fixed:** `document_signoffs` has no `company_id` (the `.eq('company_id')` read silently errored) — now scoped by the company's `document_hub` ids; the `document_audit_log` insert wrote non-existent `company_id`/`performed_by` columns — now uses `actor_name`.
> 5. **Schema validation (read-only) PASSED:** every table, scoping column, helper function and storage bucket referenced by storage-lockdown / deploy4 / deploy4-patches exists live. The transactional `BEGIN;…ROLLBACK;` parse still needs the SQL editor — to dry-run, temporarily change each file's final `COMMIT;` to `ROLLBACK;`, run it (surfaces any parse/constraint error), confirm clean, then restore `COMMIT;`.
>
> **PROGRESS (2026-06-10) — Steps 1–4 substantially done; lockdown (Step 5) NOT applied (awaiting owner approval):**
> - **Step 1 (RPCs):** the missing RPCs are written in `scripts/migrations/rls-deploy3b-public-rpcs.sql` (resolve_login_route, submit_snag_comment, get_operative_public_info, operative_exists_by_email, get_equipment_public_check, get_operative_for_setup, complete_operative_setup; + shape-fixed get_portal_data / submit_aftercare_defect / submit_snag_reply / submit_toolbox_signature). The deploy4/storage/rollback SQL **patches** in §4 are NOT yet applied to the files — do those at lockdown time.
> - **Step 2 (deploy RPCs):** owner ran `rls-deploy3` + `rls-deploy3b` in the Supabase SQL editor; verified all 15 RPCs live and anon-callable (read RPCs return correct shapes, no column errors).
> - **Step 3 (migrate client):** ALL 8 public pages migrated to the RPCs — ToolboxSign, Portal, SnagReply, AftercarePage, PMLogin (email routing), EquipmentCheck, OperativeProfile (+ OperativeGuard), SiteSignIn. SuperAdminPanel still uses a client-side role check + cross-tenant reads (its `adminApi` server path) — handle separately.
> - **Step 4 (E2E gate):** new logged-out anon specs added for portal, snag-reply, aftercare, equipment-check, operative-profile; toolbox sign now runs in a pure anon context; attendance.spec already anon (SiteSignIn); PMLogin gated by the anon auth.spec. Full suite green (retries:1 absorbs live-DB latency flakes). `getAnonDb` "raw anon reads must FAIL post-lockdown" assertions are NOT yet added — add at Step 5.
> - **Step 5 (lockdown) — PREPARED for review, NOT applied:** the §4 SQL patches are written: `scripts/migrations/rls-deploy4-patches.sql` (operatives UPDATE WITH CHECK §5.10; the 11 Pattern-C tables tenant-scoped via FK + a recursion-safe `get_my_agency_ids()` helper §5.7; site_attendance UPDATE §5.5); `storage-lockdown.sql` patched (generic policy-drop that also removes the surviving `floor_plans_*` anon policies §5.9, floor-plans added to the authenticated bucket lists, stale verify-comment fixed); `rls-lockdown-rollback.sql` patched (10-arg `submit_aftercare_defect`, self-contained `get_user_company_id()`). Post-lockdown anon-denied assertions are in `e2e/rls-lockdown-verification.spec.js` (skipped until `RLS_LOCKDOWN_APPLIED=1`). **NONE applied to production — owner approves and runs the lockdown as its own step.** SuperAdminPanel cross-tenant reads (AUDIT §5.7b) are DEFERRED and must be handled before/with the lockdown. **Apply order:** (1) storage-lockdown, (2) rls-deploy4-lockdown, (3) rls-deploy4-patches; then `RLS_LOCKDOWN_APPLIED=1 npm run test:e2e` + re-run the §1 probe. Rollback = patched rls-lockdown-rollback + storage-lockdown-rollback + re-apply deploy3/3b.
> - **Step 5 batch was adversarially reviewed (2026-06-10) and corrected.** The review caught two would-be breakages in the patch itself: `get_my_agency_ids()` keyed on `agency_users.user_id` (the app links by **email** — re-keyed to `lower(email)=lower(auth.jwt()->>'email')`), and `document_audit_log`/`document_signoffs` scoped via the legacy `documents` table when their `document_id` references **`document_hub`** (re-scoped; confirmed by tracing a live row). The operatives `WITH CHECK`, site_attendance UPDATE, storage drop-loop, and rollback fixes passed review. **Two items left for owner judgement, not bugs:** (a) `agencies` SELECT kept `USING(true)` (marketplace discoverability — confirm or move to a minimal-projection RPC); (b) the rollback's reconstructed `get_user_company_id()` body is flagged ⚠️ CONFIRM against the live definition. **Recommended before applying:** dry-run each SQL file in a `BEGIN; … ROLLBACK;` transaction in the SQL editor to confirm it parses against the live schema, since there's no staging DB. Separately noted: `DocumentHub.jsx:224` filters `document_signoffs` by a non-existent `company_id` column — a pre-existing client bug to fix alongside.
>
> **Status:** ANALYSIS / PROPOSAL ONLY for the lockdown (Step 5). Steps 1–4 are implemented as above. This is the owner's review-and-approve runbook.
> **Verification (2026-06-10):** the three load-bearing footguns below were independently checked against the actual SQL files: (1) `rls-lockdown-rollback.sql:34` drops `submit_aftercare_defect(uuid, uuid, text×9)` but `rls-deploy3-rpc-functions.sql:144` defines it as `(uuid, text×9)` — the DROP silently no-ops (CONFIRMED); (2) the rollback's `Company isolation` policies reference `get_user_company_id()` which **no migration file defines** (CONFIRMED — it lives only in the live-DB snapshot, so a rollback applied after deploy4 drops/renames it could abort); (3) every `deploy4` read policy gates on `get_my_company_id() OR get_operative_company_id()`, both NULL for a signed-out anon caller, so all currently-anon public pages return zero rows unless first migrated to SECURITY DEFINER RPCs (CONFIRMED). §5.3 (anon write/delete) is confirmed read-only by `rls-lockdown-rollback.sql` being a captured snapshot of the live policy set showing anon insert/delete on signatures, snag_comments, chat_messages, notifications, site_attendance and operatives update — no production write was performed.
> **Environment reality:** Vite+React SPA, single **LIVE** Supabase project (no staging DB). The **anon key ships in the JS bundle**. Verified live 2026-06-10: production runs the **permissive** RLS set — the anon key reads across **all tenants** and lists the `documents`/`floor-plans` storage buckets.
> **Goal:** lock anon down to a minimal, intentional surface **without breaking any public (unauthenticated) page**, all of which currently query tables directly with the anon key.

---

## 1. Summary & blast radius

### What is exposed (verified)
The live probe on 2026-06-10 confirmed the anon key (the one in the public JS bundle) can:
- **Read across ALL tenants** on at least: `operatives`, `signatures`, `projects`, `attendance`/`site_attendance`, plus ~13 other business tables (documents, snags, snag_comments, drawings, toolbox_talks/signatures, aftercare_defects, notifications, chat_messages, and the wider feed/audit/financial set).
- **List** the `documents` and `floor-plans` storage buckets.

This is a cross-tenant PII + commercial-data disclosure with a publicly distributed key. It is the headline risk this plan closes.

### §5.3 — anon write/delete status
The captured pre-lockdown snapshot (`rls-lockdown-rollback.sql`, which *is* the current live state captured 2026-05-17) shows **anon is not read-only** — it has live **write/delete** vectors:
- `signatures` — `select` / `insert` / `delete` `USING(true)` (rollback lines ~362-364)
- `snag_comments` — `delete USING(true)` plus a duplicate `_company` delete `USING(true)` (~383-384)
- `chat_messages`, `notifications` — writes `USING(true)` (~87-90, 219-222)
- `site_attendance` — `insert WITH CHECK(true)` (~369)
- `operatives` — `update` reachable by anon (~245)
- legacy `Allow all on X` `FOR ALL` policies on multiple tables

So §5.3 is **CONFIRMED**: anon can currently insert/update/delete on several tables, not merely read. This widens blast radius from disclosure to tampering/forgery (e.g. fabricated signatures, deleted snag comments).

### Authoritative confirmation query (READ-ONLY — paste into Supabase Dashboard → SQL Editor)
There is **no read-only SQL channel from this environment** to query `pg_policies`. The owner must run the following in the dashboard. Both queries are pure `SELECT` against the catalog — they **mutate nothing** and **expose no row data / no PII** (policy definitions only).

**A. Full policy dump (the source of truth):**
```sql
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
```

**B. Narrowed: permissive / anon-exposed WRITE & DELETE policies (the dangerous set):**
```sql
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  AND ( qual = 'true'
        OR with_check = 'true'
        OR with_check IS NULL
        OR 'anon'   = ANY(roles)
        OR 'public' = ANY(roles) )
ORDER BY tablename, cmd;
```

**C. Storage bucket policies (covers the floor-plans gap):**
```sql
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY cmd, policyname;
```

**How to read the output:**
- `roles` — `{public}` or `{anon}` means the policy applies to unauthenticated callers. CoreSite's policies mostly omit a `TO` clause, so they default to `public` (which **includes anon**). A policy only fails to grant anon access when its `qual`/`with_check` evaluates false for anon (e.g. it calls a helper that returns `NULL` for anon).
- `cmd` — the operation (`SELECT`/`INSERT`/`UPDATE`/`DELETE`/`ALL`).
- `qual` — the `USING` expression (gates which rows are visible/affected for read/update/delete). `qual = true` on a `public`/`anon` row = **wide open**.
- `with_check` — the `WITH CHECK` expression (gates what new/updated rows are allowed for insert/update). **`with_check IS NULL` on an UPDATE policy is a footgun**: Postgres falls back to the `USING` clause for the post-update row, which can permit tenant-hopping (see §4, the `operatives` UPDATE bug).
- **Interpretation:** any row in query **B** with `roles` containing `public`/`anon` and a `true`/`NULL` guard is a live anon write/delete vector. Expect to see `signatures`, `snag_comments`, `chat_messages`, `notifications`, `site_attendance`, `operatives` there today. Query **A** with broad `SELECT … USING(true)` for `public`/`anon` confirms the cross-tenant read disclosure. After lockdown (§6 step 5), B should return **only** the four intentional anon writes: `demo_requests` INSERT, `postcode_cache` INSERT, and the storage anon-folder exceptions; and A's `SELECT USING(true)` set should shrink to `companies`, `uk_bank_holidays`, `postcode_cache`.

---

## 2. (a) Public/anon page → table map

"Reached-anon?" = the page issues Supabase table/storage/RPC calls **while signed-out** (pure anon key). Pages that call `signInWithPassword`/`signUp` *before* any table call are NOT anon (they run under a fresh authenticated session) and are listed separately.

### Genuinely anon — lockdown WILL break these unless a path is preserved

| Page (route) | Reached anon? | Tables read directly | Tables written directly | Storage |
|---|---|---|---|---|
| WhyCoreSite `/`, `/why` + LandingPage `/old-landing` | **Yes** | — | `demo_requests` (insert) | — |
| **PMLogin `/login`** (email-routing step) | **Yes** | `profiles`, `operatives` (by email, joins `companies`) | — | — |
| **ToolboxSign `/toolbox/:talkId`** | **Yes** | `toolbox_talks`, `projects`, `operatives`, `toolbox_signatures`, `profiles` | `toolbox_signatures` (insert), `notifications` (insert) | `documents` upload (`toolbox/`) + getPublicUrl |
| **Portal `/portal/:projectId`** | **Yes** | `projects`, `signatures`, `documents`, `operatives` | — | — |
| **SnagReply `/snag-reply/:token`** | **Yes** | `snags` (by reply_token), `snag_comments` | `snag_comments` (insert), `snags` (update status/photo) | `snag-photos` upload (`snag-replies/`) + getPublicUrl |
| **AftercarePage `/aftercare/:projectId`** | **Yes** | `projects`, `aftercare_defects` (by project_id+email) | `aftercare_defects` (insert) | `snag-photos` upload (`aftercare/`) + getPublicUrl |
| SiteSignIn `/site/:projectId` | **Mixed** | `projects` (pre-login, anon); operatives/upsert/RPCs are post-auth | — (pre-login) | — |
| EquipmentCheck `/equipment-check/:equipmentId` | **Mixed/anon-leaning** | `equipment`, `project_floors`, `projects` (fire before session check) | — (writes go via `/api/plant-equipment`) | — |
| OperativeProfile `/operative/:id/profile` (first-time bypass) | **Yes (special case)** | `operatives` (by id) | `operatives` (update) | `documents` upload (`cards/`) + getPublicUrl |

**Every "directly" cell above is removed by `rls-deploy4-lockdown.sql`** for anon: all reads gate on `get_my_company_id()` / `get_operative_company_id()`, both of which return `NULL` for anon → zero rows. `aftercare_defects` gets **SELECT-only** (no anon insert at all — by design, insert must go via RPC). `notifications`, `snags`, `snag_comments`, `toolbox_signatures` writes all deny anon.

**Storage:** `documents/toolbox/`, `documents/cards/`, `snag-photos/snag-replies/`, `snag-photos/aftercare/` anon uploads are required by these pages and must be preserved by `storage-lockdown.sql` anon-folder exceptions.

### NOT anon (sign-in/sign-up runs before any table call) — informational, lower risk
| Page | Note |
|---|---|
| Signup `/signup` | `signUp`+`signIn` first; then inserts `companies`/`profiles`/`managers`/`agencies`/`agency_users` under the brand-new authenticated user (self-provisioning). Lockdown must allow a just-signed-up user to bootstrap their tenant. |
| Onboarding `/onboarding` | Auth-guarded; updates `companies`, inserts `projects`/`drawings`/`profiles`; `documents` bucket. |
| SandboxEntry `/try` | Signs in as shared `demo@coresite.io` first (**a real anon-usable demo password is shipped in the bundle** — flag for rotation). Then `demo_requests` insert + `profiles` select as demo user. |
| OperativeLogin `/worker-login` | `signIn` first, then `operatives` select. |
| OperativeDocuments, SignDocument (OperativeGuard) | `operative_session` implies a prior `signInWithPassword` → authenticated. |

### Not anon by intent, but NO hard auth guard — RLS is the only control
| Page | Note |
|---|---|
| AgencyRegister `/agency/register` | Uses `manager_data` local storage; inserts `agencies`/`agency_users`; `documents` bucket. No `signInWithPassword` in page. |
| **SuperAdminPanel `/superadmin`** | Only a client-side `manager_data` role check. Reads **ALL** `companies` + per-tenant `operatives`/`projects`/`signatures`/`snags`/`managers`; `company-assets` bucket. **This cross-tenant SELECT is exactly the exposure the lockdown targets.** Must move behind server/service-role (its `adminApi` helper already sends a Bearer token to server endpoints). |

### DB-irrelevant (cannot be broken by RLS)
Policies `/policies/:policyId` (static), VerifyEmailChange `/verify-email` (server `/api/verify-email` only), ResetPassword `/reset-password` (`supabase.auth.*` only).

---

## 3. (b) RPC inventory & gaps

### deploy3 RPCs that exist (all `SECURITY DEFINER`, survive lockdown)
| RPC | Covers public need | Granted |
|---|---|---|
| `get_my_operative_id()` | helper (JWT → operative id); used by RLS, not client | none (internal) |
| `get_operative_company_id()` | helper (JWT → company_id); used by RLS | none (internal) |
| `get_project_public_info(p_id uuid)` | project name + branding + geofence + times for QR/sign-in/aftercare branding | anon + auth |
| `get_snag_for_reply(p_token text)` | SnagReply read: snag + drawing + comments by reply_token | anon + auth |
| `submit_snag_reply(p_token, p_comment, p_author_name, p_photo_url)` | SnagReply write: comment + snag → `pending_review` | anon + auth |
| `get_aftercare_defects(p_project_id uuid, p_email text)` | Aftercare prior-defects read | anon + auth |
| `submit_aftercare_defect(p_project_id uuid, p_reported_by text, p_email text, p_phone, p_unit_ref, p_location, p_description, p_photo_url, p_priority, p_status)` **(10 args: uuid + 9 text)** | Aftercare insert (looks up company_id) | anon + auth |
| `get_portal_data(p_project_id uuid)` | Portal: project+branding, documents, signatures, operatives | anon + auth |
| `get_toolbox_for_signing(p_talk_id uuid)` | ToolboxSign read: talk + project/branding + operatives + signed ids | anon + auth |
| `submit_toolbox_signature(p_talk_id uuid, p_operative_id uuid, p_operative_name text, p_signature_url text)` | ToolboxSign insert (dedupe + assignment check) | anon + auth |

### RPCs the client already calls
- `get_operative_attendance` (SiteSignIn:88) — **not** a deploy3 RPC; from `get-operative-attendance-rpc.sql`. Post-auth.
- `record_attendance` (SiteSignIn:225) — **not** a deploy3 RPC; from `record-attendance-rpc.sql`. Post-auth.

These two are the only RPCs wired into the client today.

### THE CRITICAL GAP
**No public page has been migrated to the deploy3 RPCs.** A grep of `src/` finds only `get_operative_attendance` and `record_attendance`. None of the 8 deploy3 public RPCs is ever called — every public page still uses raw `supabase.from()`. **Applying deploy4 today breaks all of them immediately.** Wiring the existing RPCs into the client is the single largest pre-lockdown work item.

Beyond wiring, these are **functional gaps where an existing RPC does not fully match the page**, or **no RPC exists at all**. Each must be closed before lockdown:

1. **SnagReply — comment-only path missing.** `submit_snag_reply` always sets status `pending_review`; the page's `handleCommentOnly()` posts a comment without changing status, and the page adds an automatic "Completion photo submitted for review" comment that the RPC does not insert.
   - **Add:** `submit_snag_comment(p_token text, p_comment text, p_author_name text) RETURNS json` — token-validated comment insert, no status change.
   - **And/or extend** `submit_snag_reply` to accept the system comment, or insert it server-side.

2. **Portal — shape mismatch.** `get_portal_data` returns operatives via `operative_projects` and signatures as only `operative_name/document_title/signed_at`. The page derives operatives from `signatures.operative_id` and needs `signature_url`, `invalidated`, `document_id`, `typed_name`, `ip_address`, and operative `photo_url`/`role` for the signature-detail modal, per-doc download (`generateSignOffSheet`), and photos.
   - **Action:** extend `get_portal_data` to return the full signature detail + operative photo/role the UI consumes, **or** adapt the Portal UI to the RPC's shape. Decide before migration.

3. **AftercarePage — status default + project read.** Page uses status `'open'` but `submit_aftercare_defect` defaults to `'reported'`; deploy4 gives `aftercare_defects` **no anon insert** so insert MUST go via the RPC. Project branding read must move to `get_project_public_info`.
   - **Action:** call `submit_aftercare_defect(..., p_status => 'open')` explicitly (or align both to one value), and route the project read through `get_project_public_info`. Reconcile `get_aftercare_defects` field set with the page.

4. **ToolboxSign — manager-notify gap.** `get_toolbox_for_signing` + `submit_toolbox_signature` cover read/sign, but the page also reads `profiles` and inserts `notifications` post-sign — neither is in any RPC and both deny anon under deploy4 (silent failure).
   - **Add:** fold the manager notification into `submit_toolbox_signature` (server-side `notifications` insert), **or** add `notify_toolbox_signed(p_talk_id uuid)`.

5. **SiteSignIn — operatives anon reads uncovered.** `get_project_public_info` covers the branding read, but the single-operative read (`id,name,role,photo_url,company_id,start_time,end_time`) and the operatives-by-email lookup on the failed-login branch have no covering RPC and deny anon.
   - **Add:** `get_operative_public_info(p_id uuid)` (single-row, minimal fields) and a narrow `operative_exists_by_email(p_email text) RETURNS boolean` for the friendly error path.

6. **PMLogin email-routing — HIGH RISK, no RPC.** Pre-login SELECT of `profiles` + `operatives` by email exposes those tables to anon today and breaks under deploy4.
   - **Add:** `resolve_login_route(p_email text) RETURNS json` returning only `{ has_manager, has_worker, name, company_name }` — never raw rows. This both fixes the lockdown break and **removes a current anon disclosure**.

7. **EquipmentCheck — no RPC.** `equipment` + `project_floors` + `projects` reads fire before the session check.
   - **Add:** `get_equipment_public_check(p_equipment_id uuid) RETURNS json` (equipment row + its `project_floors` + `projects.floor_plans_enabled`), **or** gate the page so reads only run after a live Supabase session.

8. **OperativeProfile first-time bypass — no RPC.** Anon `operatives` select + update + `documents/cards` upload for a not-yet-activated operative.
   - **Add:** `get_operative_for_setup(p_id uuid) RETURNS json` (returns only when `date_of_birth IS NULL`) and `complete_operative_setup(p_id uuid, …) RETURNS json` (update gated on still-unactivated). Keep the `cards/` storage anon exception.

9. **Storage uploads — no RPC handles files.** None of the RPCs upload. Anon photo/signature uploads (`documents/toolbox/`, `documents/cards/`, `snag-photos/snag-replies/`, `snag-photos/aftercare/`) must remain via the `storage-lockdown.sql` anon-folder policies, which therefore must be applied and verified as a hard prerequisite.

---

## 4. (c) Migration + rollback

### Files
- `scripts/migrations/rls-deploy3-rpc-functions.sql` — helper + 8 public `SECURITY DEFINER` RPCs.
- `scripts/migrations/rls-deploy4-lockdown.sql` — clean-slate drop of all `public.*` policies, then ~70 scoped tables.
- `scripts/migrations/storage-lockdown.sql` + `scripts/migrations/storage-lockdown-rollback.sql` — storage.objects.
- `scripts/migrations/rls-lockdown-rollback.sql` — restores the captured 2026-05-17 permissive state.
- Dependency: `scripts/migrations/fix-get-my-company-id-operatives.sql` / `sql/rls-policies.sql` define `get_user_company_id()` (the rollback needs this).

### deploy4 — is it safe to apply as-is? **NO. Patch first.**
deploy4 is structurally sound where the analysis feared it wasn't, but has three real defects.

- ✅ **`LIKE '%_all'` drop gap does NOT apply to deploy4.** Its Part 3 (lines 25-36) is an *unfiltered* `pg_policies` loop — it drops **every** policy per public table (a true clean slate). The buggy `LIKE '%_all'` loop lives in `sql/rls-policies.sql`, not here. **Do not "fix" deploy4's drop loop.**

- ❌ **§5.10 — `operatives` UPDATE has no `WITH CHECK` (tenant-hop).** Line ~269: `USING (company_id = get_my_company_id() OR id = get_my_operative_id())` with no `WITH CHECK`. Postgres falls back to `USING` for the post-update row; the `id = get_my_operative_id()` branch is self-satisfiable and does **not** pin `company_id`, so an operative can update their own row and set `company_id`/`role`/`rates` to another tenant.
  - **Correction (required before deploy):** add a `WITH CHECK` that pins company:
    ```sql
    WITH CHECK (
      company_id = get_my_company_id()
      OR (id = get_my_operative_id() AND company_id = get_operative_company_id())
    )
    ```

- ❌ **§5.7 — ~11 Pattern-C tables scoped only by `auth.role() = 'authenticated'` (no tenant filter).** `agencies` (SELECT `USING(true)`), `agency_operatives`, `agency_users`, `agency_connections`, `document_audit_log`, `document_signoffs`, `holiday_audit_log`, `profile_audit_log`, `permit_signatures`, `job_variations`, `labour_proposals`. Any logged-in user of any company reads/writes all of these (agency operative PII, financial variations/proposals, all sign-offs). This is **cross-tenant leakage among authenticated users** — narrower than the anon hole, but still a multi-tenant breach.
  - **Correction (required):** add tenant scoping. For company-bearing tables, gate on `company_id = get_my_company_id()`. For FK-only tables, scope via the parent (`agency_id IN (SELECT id FROM agencies WHERE …)`, `project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())`, `document_id IN (...)`, etc.). `agencies` SELECT `USING(true)` must become company/connection-scoped.

- ⚠️ **Missing UPDATE/DELETE policies that the client uses (functional breakage, not security).** deploy4 omits some operations the app performs:
  - `site_attendance` has **no UPDATE** (lines ~290-293) → SiteAttendance manager sign-out correction silently 0-rows. Add a company-scoped UPDATE.
  - Several Pattern-A tables omit UPDATE/DELETE the UI attempts. Audit each against the client before deploy and add the missing scoped policies.
  - `aftercare_defects` is **SELECT-only by design** (insert via RPC) — correct, but only if the client is migrated to the RPC first (§3 gap 3).

- ⚠️ **Prerequisite ordering.** deploy4 does **not** create the helper functions or the RPCs — it assumes deploy3 already ran. **deploy3 must be applied (and RPCs wired into the client) before deploy4.**

- ℹ️ **Policy-name collisions** (`co_select` reused 51×) are legal (unique per table) but make name-based rollback/verification impossible. Acceptable; verify by table, not by name.

### storage-lockdown.sql — patch the floor-plans gap
- ❌ **§5.9 CONFIRMED — `floor-plans` bucket entirely uncovered.** The drop step (lines 32-39) drops only **8 hard-coded policy names**; `floor_plans_read/upload/delete` (from `add-floor-plans.sql` 78-80) are not in that list and **survive**. `floor_plans_upload` is `FOR INSERT WITH CHECK (bucket_id='floor-plans')` and `floor_plans_delete` is `FOR DELETE USING (bucket_id='floor-plans')` — **no auth check**. Result: **anon can still upload to and delete from `floor-plans` after the lockdown runs.** floor-plans is also absent from the authenticated-write bucket lists (lines 54/61/68).
  - **Correction (required):** either (a) replace the hard-coded 8-name drop with a generic `pg_policies` loop over `storage.objects` (matching deploy4's robust pattern), or (b) explicitly `DROP POLICY floor_plans_upload/floor_plans_delete/floor_plans_read` and add `floor-plans` to the authenticated write bucket lists. Recommend (a) for robustness.
- ❌ **Stale verification comment.** The STEP-4 comment (lines 150-156) says "Expected: 6 policies" but the script creates **9** (1 public read + 3 authenticated + 5 anon-folder: cards/signatures/toolbox/snag-replies/aftercare). Update the comment so the operator doesn't think the migration half-failed.

### Rollback assessment — NOT a true single-script restore; fix before relying on it
`rls-lockdown-rollback.sql` is a captured snapshot of the 2026-05-17 permissive state, not the literal inverse of deploy4. Its drop loop is the same robust unfiltered loop, so it *will* cleanly remove deploy4's policies. But:

- ❌ **`get_user_company_id()` dependency can abort the whole rollback.** The recreated "Company isolation" policies (documents/operatives/projects/drawings/managers/progress_*/snags …) reference `get_user_company_id()`, which is defined **only** in `fix-get-my-company-id-operatives.sql` / `sql/rls-policies.sql` — **neither deploy3 nor the rollback creates it.** If absent at rollback time, every such `CREATE POLICY` throws and **aborts the rollback transaction mid-incident**. **Fix:** prepend `fix-get-my-company-id-operatives.sql` (or inline the `get_user_company_id()` definition) into the rollback, and verify the function exists *before* you ever need to roll back.
- ❌ **Wrong DROP signature → silent no-op.** Rollback line 34 drops `submit_aftercare_defect(uuid, uuid, text ×9)` = **11 args**, but the real function is `(uuid, text ×9)` = **10 args** (verified in deploy3 lines 144-155). `DROP FUNCTION IF EXISTS` no-ops on signature mismatch, so the function would **survive** a "rollback". **Fix:** correct to the 10-arg signature. (`submit_toolbox_signature(uuid, uuid, text, text)` at line 37 **is** correct — verified.)
- ⚠️ **Over-reach:** the rollback also `DROP`s the deploy3 helper + RPC functions (lines 28-37) even though deploy4 never created them — rolling back deploy4 alone tears down deploy3's still-needed public-page RPCs and breaks the migrated client. If you roll back deploy4 you must **also revert the client** to direct-table access (or re-apply deploy3 afterward).
- ⚠️ **It restores the *vulnerable* state**, including all anon write/delete holes from §5.3. Treat it as "reopen the breach to stop an outage", not "safe baseline".
- ℹ️ **Storage rollback is a separate script** — `storage-lockdown-rollback.sql` exists (drops the lockdown storage policies and recreates the open `documents`/progress/company-assets/drawings/snag-photos policies). It does **not** recreate floor-plans (correct — they were never dropped). So a full rollback = `rls-lockdown-rollback.sql` (patched) **plus** `storage-lockdown-rollback.sql`. The analysis claim that "full rollback is not a single script" stands.

**Verdict:** deploy4 and storage-lockdown each need patching; the rollback needs two fixes (the missing `get_user_company_id()` dependency and the 10-arg signature) before it can be trusted in an incident.

---

## 5. (d) E2E regression gate

**Rule:** every public route in `App.jsx` must have a **green, logged-out** spec **before** `rls-deploy4-lockdown.sql` touches prod. The current suite mostly runs under `admin.json` (authenticated) storageState, so it would **pass even if the lockdown broke the anon path** — it does not gate the lockdown.

### Covered today
| Route | Spec | Gates the lockdown? |
|---|---|---|
| `/site/:projectId` (SiteSignIn) | `e2e/attendance.spec.js` | **YES** — true anon (`storageState {cookies:[],origins:[]}`); the only spec that genuinely exercises a public page as anon. |
| `/toolbox/:talkId` | `e2e/toolbox.spec.js` | **No** — runs under `admin.json`; anon path untested. |
| `/operative/:id/sign/:docId` | `e2e/rams.spec.js` | **No** — `admin.json`. |
| `/operative/:id/documents` + sign | `e2e/induction.spec.js` | **No** — `admin.json`. |
| `/snags/:drawingId` (PM viewer, NOT the public `/snag-reply` page) | `e2e/snag.spec.js`, `e2e/pdf-export.spec.js` | **No** — wrong page; `admin.json`. |

### NOT covered (must add before lockdown)
`/snag-reply/:token`, `/portal/:projectId`, `/aftercare/:projectId`, `/equipment-check/:equipmentId`, `/agency/register`, `/signup`, `/why` + `/old-landing` + `/try` (demo_requests), and **anon variants** of toolbox/sign/induction. (`/policies` is static — not RLS-relevant.)

### New specs to add (with seed data)
1. **`snag-reply.spec.js` (anon) — CRITICAL.** Seed a `reply_token` on the E2E snag in `scripts/seed-e2e.js`, expose `ids.snagReplyToken`. Logged-out: goto `/snag-reply/${token}`, assert the snag heading renders (anon read works), post a comment, submit, re-fetch `snag_comments`/`snags` status to assert persistence.
2. **`aftercare.spec.js` (anon) — CRITICAL.** Seed aftercare enabled + an `aftercare_defects` row + the allowed reporter email on the E2E project. Logged-out: goto `/aftercare/${projectId}`, assert project name + existing defects render, submit a new defect (with photo via file input), re-fetch `aftercare_defects`. Directly guards the §5.5 "insert removed in favour of RPC" trap.
3. **`portal.spec.js` (anon) — CRITICAL.** Seed a persisted signature so the portal has data independent of test ordering. Logged-out: goto `/portal/${projectId}`, assert company/project name, document list, operative roster + signature counts.
4. **`toolbox-sign-anon.spec.js` + `sign-document-anon.spec.js` (anon) — HIGH.** Same flows as today but with `storageState {cookies:[],origins:[]}` and only the injected `operative_session` (no admin JWT). Reuse existing seed (toolbox_talks, documents, operatives).
5. **`signup.spec.js` (anon) — HIGH.** Self-serve onboarding insert path (`companies`+`profiles`+`managers`, and the agency branch). Throwaway unique email per run; service-role cleanup. High blast radius, currently zero coverage.
6. **`equipment-check.spec.js` (anon) — MEDIUM.** Seed a stable `equipment` row, expose `ids.equipmentId`. Goto `/equipment-check/${id}` anon, assert equipment + checklist render.
7. **`demo-request.spec.js` (anon) — MEDIUM.** Goto `/why` (and `/try`, `/old-landing`), submit the form, re-fetch `demo_requests`.
8. **`agency-register.spec.js` (anon) — MEDIUM.** Complete the form (logo/insurance upload to `documents` + `agencies`/`agency_users` inserts); unique per-run ids + cleanup.

### Infrastructure
- **`getAnonDb` helper in `e2e/helpers/db.js`** — `createClient` with the anon key and **no sign-in**. Pair every public-page spec with anon-client assertions: page works (via RPC/scoped policy) **and** raw cross-tenant anon reads **fail** post-lockdown. This proves *both halves* of the lockdown.
- **Extend `scripts/seed-e2e.js`** to provision: a snag with a known `reply_token`; an aftercare_defect (+ enabled flag + allowed reporter email); a persisted signature for the portal; a stable equipment row — all exposed via `getIds()`.

---

## 6. (e) Deploy sequence (no public page ever broken)

> Single live DB — apply DB migrations in a low-traffic window with the patched rollback scripts staged and tested. Each step has an explicit gate; do not advance until the gate is green.

**Step 0 — Confirm reality (READ-ONLY).**
Run §1 queries A, B, C in the Supabase SQL editor. Snapshot the output. Confirm anon read across tenants and the §5.3 anon write/delete vectors. This is the authoritative baseline and the post-lockdown comparison.
*Gate:* baseline captured and saved.

**Step 1 — Patch the SQL (NO prod apply yet).**
Apply the corrections from §4 to the migration files (review-only edits, owner-approved):
- deploy4: add `WITH CHECK` to `operatives` UPDATE; tenant-scope the ~11 §5.7 Pattern-C tables; add the missing `site_attendance` UPDATE (+ any other client-used UPDATE/DELETE).
- storage-lockdown: replace the 8-name drop with a generic `storage.objects` `pg_policies` loop (kills the floor-plans anon upload/delete); fix the stale "6 policies" comment.
- rollback: correct `submit_aftercare_defect` to the **10-arg** signature; prepend/inline `get_user_company_id()` so the rollback can't abort.
- Write the **missing RPCs** from §3 (`resolve_login_route`, `submit_snag_comment`, `get_operative_public_info`, `operative_exists_by_email`, `get_equipment_public_check`, `get_operative_for_setup`, `complete_operative_setup`, toolbox manager-notify) and reconcile `get_portal_data`/`get_aftercare_defects` shapes; `GRANT … TO anon, authenticated`.
*Gate:* SQL reviewed; RPC signatures match client call sites.

**Step 2 — Apply deploy3 + new RPCs to prod (additive, non-breaking).**
deploy3 only **creates** helper + RPC functions; it does not change policies. Applying it cannot break anything (existing direct-table anon access still works).
*Gate:* all RPCs exist (`SELECT proname FROM pg_proc WHERE proname IN (...)`); each is callable by anon in the SQL editor with a test arg.

**Step 3 — Migrate the client to call the RPCs; ship & verify.**
Rewrite every public page to use the RPCs instead of `supabase.from()`: PMLogin → `resolve_login_route`; ToolboxSign → `get_toolbox_for_signing`/`submit_toolbox_signature` (+ notify); Portal → `get_portal_data`; SnagReply → `get_snag_for_reply`/`submit_snag_reply`/`submit_snag_comment`; AftercarePage → `get_project_public_info`/`get_aftercare_defects`/`submit_aftercare_defect`; SiteSignIn → `get_project_public_info`/`get_operative_public_info`/`operative_exists_by_email`; EquipmentCheck → `get_equipment_public_check`; OperativeProfile → `get_operative_for_setup`/`complete_operative_setup`; SuperAdminPanel → server/service-role endpoints. Keep direct-table fallback removed only after RPCs proven.
*This is the most important step: the RPCs are live (Step 2), so the migrated client works against the still-permissive DB — the app behaves identically, proving the RPC path before any policy changes.*
*Gate:* deploy client; manually walk every public page in prod; confirm identical behaviour via RPCs.

**Step 4 — Add E2E coverage; confirm green.**
Land all §5 specs (anon storageState) + `getAnonDb` + extended seed. Run the full suite against the migrated client / still-permissive DB.
*Gate:* every public route has a green logged-out spec. (Anon raw-read assertions will still *succeed* here — they only flip to "must fail" after Step 5.)

**Step 5 — Apply the lockdown in a window.**
In order, in the window: (1) `storage-lockdown.sql` (patched), (2) `rls-deploy4-lockdown.sql` (patched). Immediately re-run the full E2E anon suite against prod.
*Gate:* full suite green **and** the `getAnonDb` raw cross-tenant reads now **fail** (the regression gate: pages work via RPC, raw anon table access denied).

**Step 6 — Re-run the probe to confirm anon is denied.**
Re-run §1 queries A/B/C and compare to the Step-0 baseline:
- A: `SELECT … USING(true)` for public/anon shrinks to `companies`, `uk_bank_holidays`, `postcode_cache` only.
- B: returns only `demo_requests` INSERT, `postcode_cache` INSERT, storage anon-folder exceptions.
- C: no auth-less `floor-plans` upload/delete remains.
Independently, run the original anon-key probe (the JS-bundle key) and confirm cross-tenant reads now return zero rows and writes/deletes are denied. Spot-check that no `operative` can tenant-hop via UPDATE (the §5.10 fix).
*Gate:* probe shows anon denied across all business tables and all storage buckets; the only anon surface is the four intentional paths.

**Rollback trigger & criteria.**
- **Trigger if:** any public page errors for real users post-lockdown that the E2E suite missed, OR a legitimate authenticated tenant loses access to their own data, OR an RPC throws for anon.
- **Action:** run `rls-lockdown-rollback.sql` (patched — `get_user_company_id()` present, 10-arg `submit_aftercare_defect`) **and** `storage-lockdown-rollback.sql`. Because the rollback drops deploy3's RPCs, **also redeploy the pre-RPC client** (or immediately re-apply deploy3 after rollback) so the restored permissive DB and the client agree. Accept that rollback **reopens the §5.3 anon holes** — it is an outage-stopper, not a safe state; re-attempt the lockdown from Step 1 after root-causing.
- **Pre-stage:** before Step 5, dry-run both rollback scripts in the SQL editor against a transaction you `ROLLBACK` (so nothing commits) to confirm they parse and that `get_user_company_id()` resolves — never discover the abort bug during a live incident.

---

### One-line bottom line
deploy4's clean-slate drop is correct, but **do not apply it yet**: the client calls **zero** of the public RPCs, so lockdown breaks every public page today. Wire the RPCs (and write the ~8 missing ones), patch the `operatives`-UPDATE `WITH CHECK`, the ~11 cross-tenant Pattern-C tables, the missing `site_attendance` UPDATE, the floor-plans storage gap, and the two rollback bugs — gate the whole thing behind logged-out E2E specs for every public route — then lock down in a window and re-run the §1 probe to prove anon is denied.

---

## PRE-APPLY CHECKLIST — the lockdown session (owner-run)

> Everything below is staged on branch `rls-lockdown-prep` (PR #4). Nothing here
> has been applied. Run in a low-traffic window with the rollback scripts open.

**0. Prerequisites**
- [ ] PRs #2 → #3 → #4 merged to `main` and the client **deployed** (so the app already calls the RPCs/endpoints).
- [ ] You have the Supabase SQL editor open and a few minutes of low traffic.

**1. Baseline (read-only)**
- [ ] Run §1 queries A, B, C; save the output as the "before" snapshot.
- [ ] Run the original anon-key probe; note anon currently reads across tenants.

**2. Dry-run every SQL file (no commit)** — for each of `storage-lockdown.sql`, `rls-deploy4-lockdown.sql`, `rls-deploy4-patches.sql`, and both rollback scripts: temporarily change the final `COMMIT;` to `ROLLBACK;`, run it, confirm **no parse/constraint error**, then restore `COMMIT;`. (Schema validation already confirmed every referenced table/column/function/bucket exists live — this catches anything static checks can't.)

**3. RPCs present**
- [ ] Re-run `rls-deploy3-rpc-functions.sql` then `rls-deploy3b-public-rpcs.sql` (idempotent) so `search_agencies` and all others are live.
- [ ] Confirm: `SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE '%agenc%' OR proname IN ('search_agencies','get_my_agency_ids');` — `search_agencies` present (`get_my_agency_ids` is created by deploy4-patches in step 4).

**4. Apply the lockdown — IN THIS ORDER**
1. [ ] `storage-lockdown.sql`
2. [ ] `rls-deploy4-lockdown.sql`
3. [ ] `rls-deploy4-patches.sql`

**5. Verify (gates — do not skip)**
- [ ] `RLS_LOCKDOWN_APPLIED=1 npm run test:e2e` → full suite green **including** `rls-lockdown-verification.spec.js` (anon denied; RPCs still work) and the super-admin happy path.
- [ ] Re-run §1 queries A/B/C; compare to the step-1 baseline: anon `SELECT … USING(true)` shrinks to `companies/uk_bank_holidays/postcode_cache`; query B returns only the intended anon writes; no `floor_plans_*` anon storage policies remain.
- [ ] Manual smoke (2 min): one public page (toolbox sign via QR), agency search+connect, DocumentHub loads sign-offs, and the **super-admin panel** (overview loads + toggle a company active).

**6. Rollback trigger & procedure**
- Trigger if any public page errors for real users, a tenant loses access to their own data, or an RPC throws for anon.
- Run (dry-run-confirmed in step 2): `rls-lockdown-rollback.sql` (patched) **+** `storage-lockdown-rollback.sql`. Because rollback drops the deploy3/3b RPCs, **also redeploy the pre-RPC client OR immediately re-apply deploy3 + deploy3b**, or the public pages break against the restored permissive DB. Rollback reopens the §5.3 anon holes — it's an outage-stopper, not a safe state.

**7. After**
- [ ] Remove the temporary anon storage-folder exceptions once all operatives authenticate via Supabase Auth (tracked in storage-lockdown STEP 3).
- [ ] Schedule the deferred §5.4 manager-password fix (auth.admin.updateUserById) and the §5.7b SuperAdminPanel already done.
