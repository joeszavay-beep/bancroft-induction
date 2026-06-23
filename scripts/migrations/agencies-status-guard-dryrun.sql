-- =====================================================================
-- DRY RUN for agencies-status-guard.sql (AUDIT §5.7c R1 / Part B).
-- Self-contained: applies the guard inside a transaction, proves every path,
-- then ROLLS BACK so nothing persists. Run as-is in the Supabase SQL editor
-- (you connect as 'postgres'); read the NOTICEs in the output. Expect FOUR
-- "DRYRUN OK" notices and NO error. If you see "DRYRUN FAILED", do NOT apply.
--
-- NOTE: the authenticated-path simulation (SET ROLE + jwt claims) is the fiddly
-- part; the definitive proof of the authenticated block is the LIVE end-to-end
-- test (register an agency, try to self-activate via the client → must fail).
-- =====================================================================

BEGIN;

-- ---- apply the guard in-transaction (same DDL as the migration, no COMMIT) ----
CREATE OR REPLACE FUNCTION public.agencies_block_self_status_change()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND current_user IN ('authenticated', 'anon')
  THEN
    RAISE EXCEPTION 'agencies.status can only be changed by a super-admin (use the verify toggle)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_agencies_block_self_status_change ON public.agencies;
CREATE TRIGGER trg_agencies_block_self_status_change
  BEFORE UPDATE OF status ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.agencies_block_self_status_change();

-- ---- seed a throwaway agency + its agency_users link (as postgres) ----
INSERT INTO public.agencies (company_name, primary_contact_name, primary_contact_email, status)
VALUES ('__dryrun_guard__', 'x', 'dryrun-guard@example.com', 'pending_verification');
INSERT INTO public.agency_users (agency_id, email, name, role)
SELECT id, 'dryrun-guard@example.com', 'x', 'admin'
FROM public.agencies WHERE company_name = '__dryrun_guard__';

DO $test$
DECLARE
  blocked boolean := false;
BEGIN
  -- (1) ADMIN path (current_user = postgres) can activate:
  UPDATE public.agencies SET status = 'active' WHERE company_name = '__dryrun_guard__';
  RAISE NOTICE 'DRYRUN OK — admin (postgres) status change allowed';

  -- (2) 'suspended' value accepted? (a CHECK constraint would raise here):
  UPDATE public.agencies SET status = 'suspended' WHERE company_name = '__dryrun_guard__';
  RAISE NOTICE 'DRYRUN OK — status=''suspended'' accepted by the column (no CHECK rejects it)';

  -- (3) service_role path (the verify endpoint) can change status:
  SET LOCAL ROLE service_role;
  UPDATE public.agencies SET status = 'active' WHERE company_name = '__dryrun_guard__';
  RESET ROLE;
  RAISE NOTICE 'DRYRUN OK — service_role status change allowed';

  -- (4) AUTHENTICATED agency self-activation is BLOCKED:
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","email":"dryrun-guard@example.com"}', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.agencies SET status = 'active' WHERE company_name = '__dryrun_guard__';
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  -- non-status profile edit by the same authenticated agency must still work:
  UPDATE public.agencies SET primary_contact_phone = '07999999999'
  WHERE company_name = '__dryrun_guard__';
  RESET ROLE;

  IF blocked THEN
    RAISE NOTICE 'DRYRUN OK — authenticated status change blocked; profile edit still allowed';
  ELSE
    RAISE EXCEPTION 'DRYRUN FAILED — authenticated WAS able to change status';
  END IF;
END
$test$;

ROLLBACK;
