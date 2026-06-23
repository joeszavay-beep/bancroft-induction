-- =====================================================================
-- DRY RUN for agencies-status-guard.sql (AUDIT §5.7c R1 / Part B).
-- Self-contained: applies the guard inside a transaction, proves every path,
-- then ROLLS BACK so nothing persists. Run as-is in a FRESH Supabase SQL editor
-- tab (you connect as 'postgres'); read the NOTICEs in the Messages panel.
-- Expect SIX "DRYRUN OK n/6" notices and NO error. Any "DRYRUN FAILED" → do NOT apply.
--
-- Proves: admin (postgres) + service_role may change status; 'suspended' is
-- accepted; an authenticated agency CANNOT change status (UPDATE blocked) but CAN
-- still edit profile fields; an authenticated INSERT of status='active' is coerced
-- to pending_verification; a service_role INSERT keeps its chosen status.
--
-- NOTE: the authenticated simulation (SET ROLE + jwt claims) is the fiddly part;
-- the definitive proof remains the LIVE end-to-end test against the deployed app.
-- =====================================================================

BEGIN;

-- ---- apply the guard in-transaction (same DDL as the migration, no COMMIT) ----
CREATE OR REPLACE FUNCTION public.agencies_block_self_status_change()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.status := 'pending_verification';
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'agencies.status can only be changed by a super-admin (use the verify toggle)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_agencies_block_self_status_change ON public.agencies;
CREATE TRIGGER trg_agencies_block_self_status_change
  BEFORE INSERT OR UPDATE ON public.agencies
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
  v_auth_ins_status text;
  v_sr_ins_status   text;
BEGIN
  -- (1) ADMIN path (current_user = postgres) can activate:
  UPDATE public.agencies SET status = 'active' WHERE company_name = '__dryrun_guard__';
  RAISE NOTICE 'DRYRUN OK 1/6 — admin (postgres) status change allowed';

  -- (2) 'suspended' value accepted (a CHECK constraint would raise here):
  UPDATE public.agencies SET status = 'suspended' WHERE company_name = '__dryrun_guard__';
  RAISE NOTICE 'DRYRUN OK 2/6 — status=''suspended'' accepted by the column (no CHECK)';

  -- (3) service_role path (the verify endpoint) can change status:
  SET LOCAL ROLE service_role;
  UPDATE public.agencies SET status = 'active' WHERE company_name = '__dryrun_guard__';
  RESET ROLE;
  RAISE NOTICE 'DRYRUN OK 3/6 — service_role status change allowed';

  -- (4) AUTHENTICATED agency: UPDATE status BLOCKED, profile edit still allowed:
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","email":"dryrun-guard@example.com"}', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.agencies SET status = 'active' WHERE company_name = '__dryrun_guard__';
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  UPDATE public.agencies SET primary_contact_phone = '07999999999'
  WHERE company_name = '__dryrun_guard__';
  RESET ROLE;
  IF blocked THEN
    RAISE NOTICE 'DRYRUN OK 4/6 — authenticated status change blocked; profile edit allowed';
  ELSE
    RAISE EXCEPTION 'DRYRUN FAILED — authenticated WAS able to change status';
  END IF;

  -- (5) AUTHENTICATED INSERT with status='active' is coerced to pending_verification:
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","email":"dryrun-ins@example.com"}', true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.agencies (company_name, primary_contact_name, primary_contact_email, status)
  VALUES ('__dryrun_guard_ins__', 'x', 'dryrun-ins@example.com', 'active');
  RESET ROLE;
  SELECT status INTO v_auth_ins_status
  FROM public.agencies WHERE company_name = '__dryrun_guard_ins__';
  IF v_auth_ins_status = 'pending_verification' THEN
    RAISE NOTICE 'DRYRUN OK 5/6 — authenticated INSERT status=active coerced to pending_verification';
  ELSE
    RAISE EXCEPTION 'DRYRUN FAILED — authenticated INSERT landed as % (expected pending_verification)', v_auth_ins_status;
  END IF;

  -- (6) service_role INSERT keeps its chosen status (exempt):
  SET LOCAL ROLE service_role;
  INSERT INTO public.agencies (company_name, primary_contact_name, primary_contact_email, status)
  VALUES ('__dryrun_guard_ins_sr__', 'x', 'dryrun-ins-sr@example.com', 'active');
  RESET ROLE;
  SELECT status INTO v_sr_ins_status
  FROM public.agencies WHERE company_name = '__dryrun_guard_ins_sr__';
  IF v_sr_ins_status = 'active' THEN
    RAISE NOTICE 'DRYRUN OK 6/6 — service_role INSERT kept status=active (exempt)';
  ELSE
    RAISE EXCEPTION 'DRYRUN FAILED — service_role INSERT landed as % (expected active)', v_sr_ins_status;
  END IF;
END
$test$;

ROLLBACK;
