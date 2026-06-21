-- =====================================================================
-- AUDIT §5.19 — PR5: ENFORCE auth.uid() operative RLS identity (CUTOVER)
--
-- Redefines the three operative RLS helpers to resolve identity via
-- the NON-FORGEABLE  auth_user_id = auth.uid() AND left_at IS NULL  path ONLY,
-- DROPPING the interim user_metadata.operative_id + email COALESCE arm that PR4
-- kept as a transitional fallback. After this, a forged user_metadata.operative_id
-- is completely inert (the metadata path no longer exists in any helper), closing
-- §5.19 durably and removing the §5.19 dependency on the verified `email` claim.
--
-- This is the ONLY feels-irreversible step. Rollback = re-apply the captured
-- dual-accept defs (rls-5-19-pr5-enforce-rollback.sql).
--
-- WHAT CHANGES (bodies only — names / zero-arg signatures / LANGUAGE sql / STABLE /
-- SECURITY DEFINER unchanged; NONE carries SET search_path, matching live — do NOT
-- add one => the ~40 co_* policies that call these helpers are UNTOUCHED):
--   get_my_operative_id     : interim arm REMOVED → auth.uid()+left_at only.
--   get_operative_company_id: interim arm REMOVED → auth.uid()+left_at only.
--   get_my_company_id       : interim OPERATIVE arm REMOVED. The profiles (manager)
--                             arm STAYS FIRST and the auth.uid() operative arm STAYS
--                             second → managers are entirely unaffected; only the
--                             forgeable metadata fallback is dropped.
--
-- SAFETY — proven NOBODY is locked out (re-prove FRESH before applying; see ritual):
--   • 28 active+linked operatives already resolve via the auth.uid() arm today
--     (PR4 COALESCE first arm) → unchanged. Dropping the interim arm only removes
--     the forge path, not their legitimate resolution.
--   • 26 active+unlinked rows = ALL ABC Construction demo, NO auth accounts → they
--     cannot authenticate, so the interim arm never fired for them. Unchanged.
--   • 2 historical rows (left_at set) excluded by every arm already. Unchanged.
--   • Managers (incl. Joe) resolve via profiles/managers, never the dropped arm.
--   • The interim arm is therefore load-bearing for NOBODY: every authenticated
--     operative is the 28 active+linked, all on auth.uid(). The decisive check is
--     the PART B PROOF below — it MUST return 0 rows before this is applied.
--
-- !!! APPLY DELIBERATELY (single live DB, no staging). HARD ORDERING:
--   0. CAPTURE: pg_get_functiondef the 3 live helpers (rls-5-19-pr5-enforce-rollback.sql
--      is the rollback artifact). Re-confirm the live bodies EQUAL the PR4 dual-accept
--      COALESCE defs — if they differ by anything, STOP and re-baseline.
--   1. PART B PROOF (gate — MUST be 0 rows; run against live, FRESH, not a snapshot):
--        SELECT o.id, o.email, o.company_id, u.id AS auth_user_id
--        FROM operatives o
--        JOIN auth.users u ON lower(u.email) = lower(o.email)
--        WHERE o.left_at IS NULL AND o.auth_user_id IS NULL;
--      If ANY row → a real login resolving via the interim arm that enforce would
--      break. STOP, link those rows (set auth_user_id), re-run until 0. DO NOT apply.
--   2. DRY-RUN:  BEGIN; <this file>; <sanity SELECTs at foot>; ROLLBACK;
--   3. APPLY:    BEGIN; <this file>; COMMIT;
--   4. VERIFY:   re-run pg_get_functiondef → confirm all three bodies are auth.uid()+
--      left_at ONLY (NO 'user_metadata' / NO 'email' substring anywhere). Then run the
--      §5.19 E2E (operative-enforce.spec: escalation→ZERO via dead metadata path;
--      linked resolves; unlinked-authenticated→ZERO) + the regression suite under
--      RLS_LOCKDOWN_APPLIED=1. Deploy the binding-site code (drops the email fallback)
--      + create-operative-account (stops writing user_metadata.operative_id) on merge.
-- Rollback: rls-5-19-pr5-enforce-rollback.sql (captured dual-accept defs verbatim).
-- =====================================================================

-- ---------------------------------------------------------------------
-- TIER 1 — operative RLS identity helpers (ENFORCE: auth.uid() + left_at ONLY).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_operative_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id FROM operatives
  WHERE auth_user_id = auth.uid() AND left_at IS NULL
$$;

CREATE OR REPLACE FUNCTION get_operative_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT company_id FROM operatives
  WHERE auth_user_id = auth.uid() AND left_at IS NULL
$$;

-- get_my_company_id: 2-arm COALESCE. Manager (profiles) arm STAYS FIRST so managers
-- (incl. Joe) are unaffected; the auth.uid() operative arm stays second. The interim
-- user_metadata+email operative arm is DROPPED.
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    -- manager arm — UNCHANGED, still first
    (SELECT company_id FROM profiles WHERE id = auth.uid()),
    -- auth.uid() operative arm — UNCHANGED (the interim arm below it is removed)
    (SELECT company_id FROM operatives
       WHERE auth_user_id = auth.uid() AND left_at IS NULL)
  )
$$;

-- ---------------------------------------------------------------------
-- SANITY (run inside the dry-run BEGIN…ROLLBACK). These helpers read
-- auth.uid()/auth.jwt(), NULL as service_role in the SQL editor, so they cannot be
-- behaviourally tested in plain SQL — that is the E2E's job. Structural checks:
--
--   -- (a) all three defs now auth.uid()-only: must return 0 (no metadata/email left)
--   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public'
--      AND proname IN ('get_my_operative_id','get_operative_company_id','get_my_company_id')
--      AND (pg_get_functiondef(p.oid) ILIKE '%user_metadata%'
--           OR pg_get_functiondef(p.oid) ILIKE '%auth.jwt() ->> ''email''%');   -- expect 0 rows
--
--   -- (b) partial-unique still guarantees <=1 active linked row per login (= 0):
--   SELECT count(*) FROM (
--     SELECT auth_user_id FROM operatives
--      WHERE left_at IS NULL AND auth_user_id IS NOT NULL
--      GROUP BY auth_user_id HAVING count(*) > 1) x;        -- expect 0
--
--   -- (c) RE-PROVE Part B inside the dry-run too (belt-and-braces): must be 0
--   SELECT count(*) FROM operatives o
--     JOIN auth.users u ON lower(u.email) = lower(o.email)
--    WHERE o.left_at IS NULL AND o.auth_user_id IS NULL;    -- expect 0
-- ---------------------------------------------------------------------
