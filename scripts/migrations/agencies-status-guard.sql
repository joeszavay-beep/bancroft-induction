-- =====================================================================
-- AUDIT §5.7c R1 / Part B — block agency self-activation (both doors).
--
-- The Part A verify toggle is the only sanctioned way to make an agency
-- discoverable (status='active'). But TWO RLS policies let an authenticated
-- agency self-activate, bypassing review:
--
--   DOOR 1 (UPDATE): agency_update is
--       USING (id IN (SELECT get_my_agency_ids()))   -- no WITH CHECK, no col limit
--     → an agency can `update agencies set status='active' where id=<own>`.
--     (RLS WITH CHECK can't pin status: it can't compare OLD vs NEW.)
--
--   DOOR 2 (INSERT): agency_insert is
--       WITH CHECK (auth.role() = 'authenticated')    -- no status restriction
--     → any authenticated user can `insert into agencies (...status) values (...'active')`
--       and self-list a pre-activated agency without ever updating.
--
-- FIX: one BEFORE INSERT OR UPDATE trigger that, for a normal app role
-- ('authenticated'/'anon'):
--   • on INSERT — PINS status to 'pending_verification' (coerce, not reject), so a
--     new agency from the app is always unverified regardless of what was sent.
--     No-op for real registration (Signup/AgencyRegister already insert pending).
--   • on UPDATE — REJECTS any status change.
-- The super-admin endpoint runs as 'service_role' (bypasses RLS but NOT triggers)
-- and a DB admin via the SQL editor runs as 'postgres' — neither is in the app-role
-- set, so the sanctioned paths (and the e2e service-role seed) keep working, with
-- any status they choose. Agencies keep full control of their OWN profile fields
-- (name, contact, insurance docs): a non-status UPDATE never trips the guard.
--
-- SECURITY INVOKER (the default — do NOT make this SECURITY DEFINER): the guard
-- reads current_user to identify the CALLER's role; under SECURITY DEFINER
-- current_user would resolve to the function owner and the check would never fire.
--
-- ⚠️ REVIEW DRAFT — NOT YET APPLIED. Apply with the §5.19-grade deliberate ritual
--    (capture → dry-run BEGIN…ROLLBACK → BEGIN…COMMIT → verify). SQL stays manual.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.agencies_block_self_status_change()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (default): current_user must be the caller's role.
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      -- A new agency created by an app user is ALWAYS unverified; discovery is a
      -- deliberate super-admin step. Pin status regardless of what the client sent,
      -- so the open agency_insert policy can't be used to self-list an 'active' row.
      NEW.status := 'pending_verification';
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      -- An app user (incl. an agency editing its OWN row via agency_update) must
      -- not be able to change status — only the super-admin verify toggle may.
      RAISE EXCEPTION
        'agencies.status can only be changed by a super-admin (use the verify toggle)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agencies_block_self_status_change ON public.agencies;
CREATE TRIGGER trg_agencies_block_self_status_change
  -- OF status can't be used with INSERT, so this fires on every insert/update;
  -- the function returns immediately for non-status updates (cheap on this table).
  BEFORE INSERT OR UPDATE ON public.agencies
  FOR EACH ROW
  EXECUTE FUNCTION public.agencies_block_self_status_change();

COMMIT;

-- =====================================================================
-- VERIFY (read-only, after COMMIT):
--   SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgrelid = 'public.agencies'::regclass AND NOT tgisinternal;
-- Expect: trg_agencies_block_self_status_change, tgenabled = 'O'.
-- =====================================================================
