-- =====================================================================
-- AUDIT §5.19 INTERIM — ROLLBACK
-- Reverts the three helpers to their pre-5.19 bodies (the user_metadata-only
-- versions). NOTE: the CANONICAL rollback is the live capture taken at apply
-- step 1 (pg_get_functiondef) — use that if it differs from the below. This
-- file is the repo-based fallback, reconstructed from rls-lockdown.sql,
-- rls-deploy3-rpc-functions.sql and fix-get-my-company-id-operatives.sql.
-- =====================================================================

CREATE OR REPLACE FUNCTION get_my_operative_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid
$$;

CREATE OR REPLACE FUNCTION get_operative_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT company_id FROM operatives
  WHERE id = (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid
$$;

CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT company_id FROM profiles WHERE id = auth.uid()),
    (SELECT company_id FROM operatives WHERE id = (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid)
  )
$$;
