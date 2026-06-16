-- =====================================================================
-- AUDIT §5.19 — INTERIM mitigation
-- Pin operative RLS identity to the VERIFIED JWT email claim so a
-- user-writable user_metadata.operative_id can no longer be forged to
-- escalate into another company.
--
-- Root cause: get_my_operative_id / get_operative_company_id / get_my_company_id
-- resolve the operative from auth.jwt()->'user_metadata'->>'operative_id', which
-- the authenticated user can set arbitrarily via supabase.auth.updateUser({data}).
-- This adds  AND lower(email) = lower(auth.jwt()->>'email')  to each operative
-- lookup: the injected operative_id only resolves if it belongs to an operative
-- whose email matches the caller's VERIFIED email. The email claim is not
-- user-forgeable (confirmed live: mailer_autoconfirm=false → email change requires
-- confirming the new mailbox). Closes arbitrary cross-tenant injection. The §5.17
-- duplicate-email residual (one person, operative rows sharing an email across
-- companies) is closed only by the durable operatives.auth_user_id fix (follow-up).
--
-- Pre-checks (2026-06-16): live mailer_autoconfirm=false; email-mismatch pre-count
-- = 0 affected (29/29 metadata-linked operatives have operatives.email == auth.email).
--
-- APPLY DELIBERATELY (single live DB, no staging) — see runbook:
--   1. CAPTURE canonical rollback FIRST (also confirms whether get_my_company_id
--      has the operative branch below):
--        SELECT p.proname, pg_get_functiondef(p.oid) FROM pg_proc p
--        JOIN pg_namespace n ON n.oid = p.pronamespace
--        WHERE n.nspname='public' AND p.proname IN
--          ('get_my_operative_id','get_operative_company_id','get_my_company_id');
--   2. Run this file inside  BEGIN; ... ; <sanity check> ; COMMIT;
--   3. Re-run the step-1 capture to confirm the new bodies are live.
--   4. Run the RLS_LOCKDOWN_APPLIED=1 E2E suite (operative-scoped reads).
-- Rollback: rls-5-19-interim-email-crosscheck-rollback.sql (or the step-1 capture).
-- =====================================================================

CREATE OR REPLACE FUNCTION get_my_operative_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id FROM operatives
  WHERE id = (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid
    AND lower(email) = lower(auth.jwt() ->> 'email')
$$;

CREATE OR REPLACE FUNCTION get_operative_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT company_id FROM operatives
  WHERE id = (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid
    AND lower(email) = lower(auth.jwt() ->> 'email')
$$;

-- Apply ONLY if the live get_my_company_id has the operative branch (the COALESCE
-- version, per fix-get-my-company-id-operatives.sql). Confirm via the step-1
-- capture. If live is profiles-only, this COALESCE form is still safe (the
-- operative branch is email-guarded), but match the live structure first to avoid
-- an unintended behaviour change.
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT company_id FROM profiles WHERE id = auth.uid()),
    (SELECT company_id FROM operatives
       WHERE id = (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid
         AND lower(email) = lower(auth.jwt() ->> 'email'))
  )
$$;
