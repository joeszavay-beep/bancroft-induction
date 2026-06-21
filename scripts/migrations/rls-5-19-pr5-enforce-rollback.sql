-- =====================================================================
-- ROLLBACK for rls-5-19-pr5-enforce.sql
--
-- Restores the PR4 DUAL-ACCEPT defs (auth.uid() arm first, interim
-- user_metadata+email arm second). Re-applying this file reverts enforce back to
-- dual-accept — operatives resolve via auth.uid() with the interim fallback
-- re-enabled. Still safe (auth.uid() resolves first); use only if PR5 is withdrawn.
--
-- ⚠️ CAPTURED VERBATIM from prod via pg_get_functiondef on 2026-06-21 (the §A
--    capture, immediately before PR5). This is the AUTHORITATIVE prior live state
--    — reproduced byte-for-byte (no body comments; 4-space body indent; closing
--    "  $function$" at 2-space; dollar-quote tag $function$). Only the trailing ;
--    statement terminators are added (outside the dollar-quote → prosrc unchanged)
--    so the file runs as-is.
--
--    NOTE: the live bodies are SEMANTICALLY identical to rls-5-19-pr4-dual-accept.sql
--    (verified: auth.uid()+left_at arm first, interim metadata+email arm verbatim,
--    get_my_company_id 3-arm profiles-first) but DIFFER cosmetically from that apply
--    file (it carried -- NEW (PR4) comments + 2-space indent that are NOT in the live
--    prosrc). The capture below — not the apply file — is the rollback of record.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_my_operative_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
    SELECT COALESCE(
      (SELECT id FROM operatives
         WHERE auth_user_id = auth.uid() AND left_at IS NULL),
      (SELECT id FROM operatives
         WHERE id = (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid
           AND lower(email) = lower(auth.jwt() ->> 'email')
           AND left_at IS NULL)
    )
  $function$;

CREATE OR REPLACE FUNCTION public.get_operative_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
    SELECT COALESCE(
      (SELECT company_id FROM operatives
         WHERE auth_user_id = auth.uid() AND left_at IS NULL),
      (SELECT company_id FROM operatives
         WHERE id = (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid
           AND lower(email) = lower(auth.jwt() ->> 'email')
           AND left_at IS NULL)
    )
  $function$;

CREATE OR REPLACE FUNCTION public.get_my_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
    SELECT COALESCE(
      (SELECT company_id FROM profiles WHERE id = auth.uid()),
      (SELECT company_id FROM operatives
         WHERE auth_user_id = auth.uid() AND left_at IS NULL),
      (SELECT company_id FROM operatives
         WHERE id = (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid
           AND lower(email) = lower(auth.jwt() ->> 'email')
           AND left_at IS NULL)
    )
  $function$;
