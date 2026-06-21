-- =====================================================================
-- ROLLBACK for rls-5-19-pr4-dual-accept.sql
--
-- CANONICAL: these are the pre-PR4 (post-PR3b) bodies captured VERBATIM from
-- prod via pg_get_functiondef on 2026-06-21 (interim user_metadata+email path
-- with the PR3b  left_at IS NULL  guard, no auth.uid() arm). Re-applying this
-- file restores dual-accept back to interim-only resolution.
--
-- Only roll back if PR4 is being withdrawn. Reverting removes the non-forgeable
-- auth.uid() resolution arm; operatives fall back to user_metadata+email only.
-- (Still safe — the interim email guard remains — but loses the §5.17
-- same-email deterministic resolution that the auth.uid() arm provided.)
--
-- Reproduced exactly as captured (dollar-quote tag $function$, 4-space body
-- indent) so re-apply restores the precise prior live state.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_my_operative_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
    SELECT id FROM operatives
    WHERE id = (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid
      AND lower(email) = lower(auth.jwt() ->> 'email')
      AND left_at IS NULL
  $function$;

CREATE OR REPLACE FUNCTION public.get_operative_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
    SELECT company_id FROM operatives
    WHERE id = (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid
      AND lower(email) = lower(auth.jwt() ->> 'email')
      AND left_at IS NULL
  $function$;

CREATE OR REPLACE FUNCTION public.get_my_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
    SELECT COALESCE(
      (SELECT company_id FROM profiles WHERE id = auth.uid()),
      (SELECT company_id FROM operatives
         WHERE id = (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid
           AND lower(email) = lower(auth.jwt() ->> 'email')
           AND left_at IS NULL)
    )
  $function$;
