-- =====================================================================
-- AUDIT §5.19 — PR4: DUAL-ACCEPT operative RLS identity
--
-- Adds the non-forgeable  auth_user_id = auth.uid()  resolution path to the
-- three operative RLS helpers, tried FIRST, while RETAINING the interim
-- user_metadata+email path as a COALESCE fallback. Nobody loses access:
--   - 28 active+linked operatives resolve via the NEW auth.uid() arm.
--   - 26 active+unlinked rows (ALL ABC Construction demo, no auth login) fall
--     through to the interim arm = unchanged behaviour (no login exists for
--     them anyway).
--   - 2 historical rows (left_at set) are excluded by every arm (unchanged).
--
-- BASE: built on the LIVE bodies captured 2026-06-21 via pg_get_functiondef
-- (verified identical to the post-PR3b committed source). The ONLY change per
-- helper is prepending the auth.uid() COALESCE arm; the interim arm is
-- reproduced verbatim. Names / signatures (zero-arg) / LANGUAGE sql / STABLE /
-- SECURITY DEFINER unchanged => the ~40 co_* policies that call these helpers
-- are untouched. NONE of these three has  SET search_path  (matches live —
-- do NOT add one).
--
-- SAFETY (proven against live data 2026-06-21):
--   - 27/28 linked: user_metadata.operative_id == auth-linked row => both arms
--     resolve the SAME row => identical company. COALESCE result unchanged.
--   - 1/28 (Joe 0b5775d7): metadata points at a now-historical row (interim
--     returns NULL today); auth.uid() returns his own ACTIVE Thomas Worley
--     record. Same person, own record, same-company-or-none — a correct grant,
--     never a cross-tenant redirect. get_my_company_id is profiles-first for
--     Joe (a manager), so his company there is unchanged.
--   - Operatives where interim resolves a real, active, email-matching row in a
--     DIFFERENT company than auth.uid() = 0  => NO tenant redirect.
--   - Security: dual-accept >= interim. auth.uid() is non-forgeable and resolves
--     first; the interim arm stays email-guarded (still blocks §5.19
--     distinct-email forgery); §5.17 same-email duplicate now resolves
--     deterministically to the auth-linked active row. No new attack surface.
--
-- !!! APPLY DELIBERATELY (single live DB, no staging):
--   1. ROLLBACK captured FIRST = rls-5-19-pr4-dual-accept-rollback.sql
--      (verbatim pre-PR4 defs). Re-confirm it equals the live pg_get_functiondef
--      immediately before applying.
--   2. DRY-RUN:  BEGIN; <this file>; <sanity SELECTs at foot>; ROLLBACK;
--   3. APPLY:    BEGIN; <this file>; COMMIT;
--   4. VERIFY:   re-run the pg_get_functiondef capture -> confirm the COALESCE
--      bodies are live; then run the §5.19 E2E (linked auth.uid path + unlinked
--      interim fallback) under RLS_LOCKDOWN_APPLIED=1 + the regression suite;
--      THEN deploy the binding-site code (SQL is additive, safe to land first).
-- Rollback: rls-5-19-pr4-dual-accept-rollback.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- TIER 1 — operative RLS identity helpers (dual-accept).
-- COALESCE: auth.uid() arm first (non-forgeable), interim arm second (verbatim).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_operative_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    -- NEW (PR4): non-forgeable auth.uid() path, tried first
    (SELECT id FROM operatives
       WHERE auth_user_id = auth.uid() AND left_at IS NULL),
    -- interim fallback (verbatim from captured live body), retained for dual-accept
    (SELECT id FROM operatives
       WHERE id = (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid
         AND lower(email) = lower(auth.jwt() ->> 'email')
         AND left_at IS NULL)
  )
$$;

CREATE OR REPLACE FUNCTION get_operative_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    -- NEW (PR4): auth.uid() path first
    (SELECT company_id FROM operatives
       WHERE auth_user_id = auth.uid() AND left_at IS NULL),
    -- interim fallback (verbatim)
    (SELECT company_id FROM operatives
       WHERE id = (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid
         AND lower(email) = lower(auth.jwt() ->> 'email')
         AND left_at IS NULL)
  )
$$;

-- get_my_company_id: 3-arm COALESCE. The manager (profiles) arm STAYS FIRST so
-- managers (incl. Joe) are entirely unaffected; the NEW auth.uid() operative arm
-- sits second; the interim operative arm (verbatim) stays last as the fallback.
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    -- manager arm — UNCHANGED, still first
    (SELECT company_id FROM profiles WHERE id = auth.uid()),
    -- NEW (PR4): auth.uid() operative arm
    (SELECT company_id FROM operatives
       WHERE auth_user_id = auth.uid() AND left_at IS NULL),
    -- interim operative fallback — UNCHANGED (verbatim)
    (SELECT company_id FROM operatives
       WHERE id = (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid
         AND lower(email) = lower(auth.jwt() ->> 'email')
         AND left_at IS NULL)
  )
$$;

-- ---------------------------------------------------------------------
-- SANITY (run inside the dry-run BEGIN…ROLLBACK).
-- These helpers read auth.jwt()/auth.uid(), which are NULL when run as
-- service_role in the SQL editor — they CANNOT be meaningfully tested in plain
-- SQL. Two checks you CAN run here to confirm structure + data shape:
--
--   -- (a) exactly one zero-arg def of each, now COALESCE-shaped with the
--   --     auth_user_id = auth.uid() arm present:
--   SELECT proname, pg_get_functiondef(p.oid)
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public'
--      AND proname IN ('get_my_operative_id','get_operative_company_id','get_my_company_id');
--
--   -- (b) partial-unique still guarantees <=1 active linked row per login (= 0):
--   SELECT count(*) FROM (
--     SELECT auth_user_id FROM operatives
--      WHERE left_at IS NULL AND auth_user_id IS NOT NULL
--      GROUP BY auth_user_id HAVING count(*) > 1) x;     -- expect 0
--
-- Behavioural proof of the auth.uid() arm vs the interim fallback is the §5.19
-- E2E specs (linked operative via auth.uid; unlinked operative via interim
-- fallback), NOT plain SQL.
-- ---------------------------------------------------------------------
