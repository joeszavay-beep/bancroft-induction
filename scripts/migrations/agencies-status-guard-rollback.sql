-- =====================================================================
-- ROLLBACK for agencies-status-guard.sql (AUDIT §5.7c R1 / Part B).
-- Drops the trigger + guard function. After this, agency.status reverts to
-- being changeable by any role the agency_update policy admits (i.e. the
-- self-activation bypass is reopened) — so only roll back if Part B is being
-- intentionally reverted.
-- =====================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_agencies_block_self_status_change ON public.agencies;
DROP FUNCTION IF EXISTS public.agencies_block_self_status_change();

COMMIT;
