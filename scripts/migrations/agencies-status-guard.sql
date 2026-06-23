-- =====================================================================
-- AUDIT §5.7c R1 / Part B — block agency self-activation via RLS.
--
-- PROBLEM: the applied agency_update policy is
--     CREATE POLICY "agency_update" ON agencies FOR UPDATE
--       USING (id IN (SELECT get_my_agency_ids()));
-- with NO WITH CHECK and NO column restriction, so an AUTHENTICATED agency
-- user can run `update agencies set status='active' where id=<own>` directly
-- from the client and self-activate — making themselves discoverable in
-- search_agencies WITHOUT the super-admin review the Part A verify toggle exists
-- to enforce. (RLS WITH CHECK can't pin status: it can't compare OLD vs NEW.)
--
-- FIX: a BEFORE UPDATE OF status trigger that rejects a status change made by a
-- normal app role ('authenticated'/'anon'). The super-admin endpoint runs as
-- 'service_role' (which bypasses RLS but NOT triggers) and a DB admin via the
-- SQL editor runs as 'postgres' — neither is in the blocked set, so the
-- sanctioned paths still work. Agencies keep full control of their OWN profile
-- fields (name, contact, insurance docs): the trigger is scoped `OF status` and
-- the inner IS DISTINCT FROM guard means a non-status update never trips it.
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
  -- Only service_role (the verify endpoint) or a DB admin (postgres, SQL editor)
  -- may change status. A logged-in app user — incl. an agency editing its OWN
  -- row via the agency_update policy — must not be able to self-activate.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND current_user IN ('authenticated', 'anon')
  THEN
    RAISE EXCEPTION
      'agencies.status can only be changed by a super-admin (use the verify toggle)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agencies_block_self_status_change ON public.agencies;
CREATE TRIGGER trg_agencies_block_self_status_change
  BEFORE UPDATE OF status ON public.agencies
  FOR EACH ROW
  EXECUTE FUNCTION public.agencies_block_self_status_change();

COMMIT;

-- =====================================================================
-- VERIFY (read-only, after COMMIT):
--   SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgrelid = 'public.agencies'::regclass AND NOT tgisinternal;
-- Expect: trg_agencies_block_self_status_change, tgenabled = 'O'.
-- =====================================================================
