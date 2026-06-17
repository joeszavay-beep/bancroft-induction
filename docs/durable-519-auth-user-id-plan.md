# Durable §5.19 Fix — `operatives.auth_user_id` + `left_at` lifecycle

**Status:** APPROVED (plan-first, owner-reviewed 2026-06-17). PR1 (this doc + AUDIT annotations) only — **nothing applied to prod, no app code changed.** PR2 onward gated on explicit owner go-ahead.
**Branch:** `fix/operative-auth-user-id`, based on `origin/main` (`38d4581`, which includes PR #9 = the §5.19 interim migration + §5.19/§5.20 docs, and PR #10).
**Closes/affects:** §5.19 (durable), §5.17 (duplicate-identity + picker/RLS mismatch), §5.20 (removes its Confirm-email dependency post-enforce); foundation for §4.1/§4.2 API-auth rework.

---

## 1. Problem recap

Operative RLS identity is derived from `auth.jwt() -> 'user_metadata' ->> 'operative_id'` in three helpers — `get_my_operative_id()`, `get_operative_company_id()`, and the operative arm of `get_my_company_id()`. `user_metadata` is **self-writable** (`supabase.auth.updateUser({ data: { operative_id } })`), so an authenticated operative can point it at any operative row in any company and read/write that tenant (§5.19). The **interim fix** (applied + verified in prod 2026-06-16, `rls-5-19-interim-email-crosscheck.sql`) adds `AND lower(email) = lower(auth.jwt() ->> 'email')` to each lookup — closing the escalation for distinct emails, but **not** for two records sharing one email, and it makes the verified `email` claim load-bearing (hence the §5.20 Confirm-email gate).

Managers/admins are unaffected — they resolve via `profiles WHERE id = auth.uid()` (COALESCE first arg) / `managers`, neither user-mutable. **Verified read-only 2026-06-17.**

## 2. Confirmed lifecycle rule (owner)

An operative's signatures/inductions/attendance **stay with the company where they happened — they do NOT follow the person.** Each operative record is a permanent, company-bound compliance artifact. When someone leaves and later joins another company, that's a **new, separate** operative record with fresh history; the old record is **retained intact**, attached to the old company.

So: the **person** = one auth login (`auth_user_id`); they accumulate **one ACTIVE** operative record + a **retained historical trail** (one per company they've left). RLS resolves the person to their single active record; historical records remain readable only by their company's managers (via `get_my_company_id`), never followed by the person.

## 3. Live audit (2026-06-17, read-only — `scripts/audit-operative-auth-linkage.js`)

- 58 operatives / 5 companies / 51 auth users / 35 columns. **No active/historical marker column exists** → `left_at` must be added.
- Records-per-email: 56 emails → 1 record; **1 email → 2 records.** Only **one** human (Joe) is multi-record.
- 30 rows auto-map 1:1 (unique email + one auth user); 26 are demo (ABC Construction Ltd, no auth account); 0 null-email.
- `UNIQUE(auth_user_id) WHERE left_at IS NULL` is **satisfiable** once Joe is resolved to one active record.

**The login picker** (`PMLogin.jsx` `step==='choose'`) is **Manager(`profiles`) vs Worker(`operatives`)**, shown when `resolve_login_route` finds both for an email. It is **client-side routing only** — neither path writes the JWT. The worker path binds `operative_session` via `ops[0]` (unordered, arbitrary among email-matched rows; same in `OperativeLogin.jsx:47`), while RLS resolves via `user_metadata` — the mismatch is the live §5.17 "scanned QR, not recognised" symptom. The session is always the **union** of manager-scope + (single) active-operative-scope; the picker cannot gate RLS (owner accepts this — one login carrying both identities is fine).

## 4. Design keystone

Keep the three helper **names and signatures identical** (scalar `uuid`) and change only their **bodies** → **no table policy changes** (the ~40 `co_*` policies that call them are untouched). The scalar form stays safe because `UNIQUE(auth_user_id) WHERE left_at IS NULL` guarantees ≤1 active row per login. That partial-unique is what forces the duplicate/multi-company operatives to be resolved manually first.

## 5. Plan

### 5.1 Schema + going-forward population
```sql
ALTER TABLE operatives
  ADD COLUMN auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN left_at      timestamptz;            -- NULL = active; set = historical
CREATE UNIQUE INDEX CONCURRENTLY operatives_active_auth_user_id_key
  ON operatives (auth_user_id) WHERE auth_user_id IS NOT NULL AND left_at IS NULL;
```
- `api/create-operative-account.js`: after `createUser`, `UPDATE operatives SET auth_user_id = data.user.id WHERE id = operativeId`; the **"account already exists"** branch must also look up the existing user and link it; move the `listUsers()` first-page lookup to `getUserById`/paged (§4.9).
- "Leaving" a company = `left_at = now()`, `auth_user_id = NULL` on the old record; new company = new record. Manager "remove operative" should become "mark historical," not delete (retain compliance history) — UI follow-on.

### 5.2 Backfill + manual-resolution list
1. Default all existing rows `left_at = NULL` (active) — no data to mark otherwise; future leavers set it.
2. Auto-link the 30 unambiguous 1:1 rows (unique email + one auth user); partial-unique is the collision backstop.
3. 26 ABC Construction rows: no auth user → backfill **skips** them (confirmed demo).
4. **Joe — applied explicitly per owner resolution (no guessed mappings):**

| op id | company | role there | action |
|---|---|---|---|
| `0b5775d7` | Thomas Worley Electrical | **active operative** | `auth_user_id = 87eccb3f` (icloud), `left_at = NULL` |
| `269e5905` | Bancroft LTD | manager (via `profiles`, not operative) | `left_at = now()`, `auth_user_id = NULL` |
| `507c6d52` | ∅ (Szavay Property Group) | super-admin (via `profiles`/`managers`, not operative) | `left_at = now()`, `auth_user_id = NULL` |

Verify post-backfill: `SELECT count(*) FROM (SELECT auth_user_id FROM operatives WHERE left_at IS NULL AND auth_user_id IS NOT NULL GROUP BY auth_user_id HAVING count(*)>1) x;` must be **0**.

### 5.3 Helper redefinition (bodies only) + picker fix
`pg_get_functiondef` the live interim bodies first (rollback artifact — `rls-5-19-interim-email-crosscheck.sql` already captures them).

- **Dual-accept** (transition; nobody loses access): `COALESCE((auth_user_id = auth.uid() AND left_at IS NULL), (interim metadata+email path AND left_at IS NULL))` for all three helpers.
- **Enforce** (cutover; retires the interim email check): `SELECT … FROM operatives WHERE auth_user_id = auth.uid() AND left_at IS NULL`.
- **Picker fix (closes §5.17):** `resolve_login_route` worker LATERAL gains `AND left_at IS NULL` (pre-auth, by email → offers only the active worker); both worker-login sites (`PMLogin.jsx handleWorkerLogin`, `OperativeLogin.jsx`) bind `operative_session` via `operatives WHERE auth_user_id = auth.uid() AND left_at IS NULL` instead of `ops[0]` (post-auth → blob matches RLS). After enforce, stop writing `user_metadata.operative_id`.

### 5.4 Apply sequence (small phased PRs; each prod step = capture-rollback → dry-run `BEGIN…ROLLBACK` → apply → verify)

| PR | Content | Prod? | Rollback |
|---|---|---|---|
| **PR1 docs** ✅ merged (#11) | AUDIT §5.17/§5.19/§5.20/§5.21; this plan doc; read-only audit script | no | revert commit |
| **PR2 schema** ✅ applied + merged (#12), proven live | `auth_user_id` + `left_at` + partial-unique; `create-operative-account.js` link (both branches); `getUserById` | **yes** (additive) | `DROP INDEX; ALTER … DROP COLUMN ×2` |
| **§5.22 docs** (this) | AUDIT §5.22 + §5.21 orphan-login update + this PR-slot | no | revert commit |
| **PR3 backfill** (next) | **re-audit first** (now 56, not 58 — two junk test rows removed 2026-06-17, no real loss); default-active; auto-link the unambiguous 1:1 set; resolve Joe's 3 (`0b5775d7` active+link `87eccb3f`; `269e5905`+`507c6d52` historical); skip ABC demo; count-=0 verify | **yes** (writes 2 cols) | set `auth_user_id`/`left_at` back to NULL |
| **PR3b remove-flow → mark-historical** (§5.22) | `PMDashboard.removeOperative` / `AllWorkers` / `api/delete-operative` "remove" sets `left_at = now()`, `auth_user_id = NULL` instead of hard-DELETE (preserves compliance history per the lifecycle rule); reserve hard-DELETE for **admin-only GDPR erasure** with the §2.8 cascade fixed + paged `listUsers`/`getUserById` (§4.9) so auth cleanup actually fires | **yes** (code + RPC) | revert to prior remove behaviour |
| **PR4 dual-accept** | 3 helpers → COALESCE(auth.uid, interim); `resolve_login_route` + worker-login sites → active record | **yes** (fn bodies + code) | re-apply captured interim defs |
| **PR5 enforce** | 3 helpers → auth.uid()+`left_at` only; stop writing `user_metadata.operative_id`; `UNIQUE(lower(email))` forward-guard; close §5.20 path | **yes** (fn bodies) | re-apply PR4 (dual-accept) defs |

**PR3b must land before PR4** — once `left_at`-aware helpers go live, the remove flow has to *set* `left_at` (not delete) or the lifecycle/retention guarantee is contradicted by the app's own remove button (§5.22). Gate PR4→PR5 on backfill 100% + count-=0 + green E2E (dual-accept bake window). PR5 is the only feels-irreversible cutover.

### 5.5 E2E coverage (before enforce cutover)
- Seed sets `auth_user_id` + `left_at = NULL` on the seeded operative.
- Regression green through every phase: `attendance`, `induction`, `rams`, `toolbox` sign.
- **`operative-escalation.spec`** (§5.19 proof): `updateUser({data:{operative_id: <other company row>}})` → refresh → read that company → **zero rows** at enforce; own company still reads.
- **`operative-account-link.spec`**: `create-operative-account` (create + existing-account) → `auth_user_id` set.
- **Active-vs-historical**: active record (co A, linked) + historical (co B, `left_at` set) → operative resolves only co A; co B managers still read the historical row; it does not follow the person.
- **Picker↔RLS consistency** (§5.17 proof): worker pick binds the active record and RLS scopes to the same company; `resolve_login_route` returns only the active worker.
- Add raw-anon-denied operative-table assertions to `rls-lockdown-verification.spec.js` (`RLS_LOCKDOWN_APPLIED=1`); re-run after enforce.

## 6. Settled decisions
- **One login, both identities (Flag 1):** accepted — Joe's icloud login is both Bancroft manager (`profiles`) and active Thomas Worley operative (`auth_user_id`); RLS is the union; picker does not gate RLS. If gating ever becomes a requirement → separate request-time-claim change, **flag don't build.**
- **ABC Construction (26 rows):** demo data — skipped by backfill.
- **Junk `szavay*` admin-metadata accounts (~5):** cleanup backlog (§5.21), untouched by this work.
- **Super-admin/manager safety:** verified they resolve via `profiles`/`managers`, never operatives, so marking the two operative records historical cannot affect those logins.

## 7. What this unblocks
Post-enforce, `api/*` operative routes can resolve identity as `verifyAuth → auth.uid() → operatives WHERE auth_user_id = auth.uid() AND left_at IS NULL`, retiring the `operativeSessionId === operativeId` self-auth (§4.1/§4.2).
