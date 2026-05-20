-- =====================================================================
-- Fix get_my_company_id() to support authenticated operatives
--
-- WHAT THIS DOES:
-- Adds a fallback to check the operatives table when the profiles
-- table has no entry for the authenticated user. This allows
-- operatives with Supabase Auth sessions to pass RLS policies
-- that use get_my_company_id().
--
-- WHY:
-- After Round 1 (#26), operatives keep their Supabase Auth session
-- active after QR sign-in. But get_my_company_id() only checked
-- the profiles table (where managers live). Operatives live in the
-- operatives table, so the function returned NULL for them, causing
-- all company-scoped RLS SELECT policies to return zero rows.
--
-- ROLLBACK:
-- CREATE OR REPLACE FUNCTION get_my_company_id()
-- RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
--   SELECT company_id FROM profiles WHERE id = auth.uid()
-- $$;
--
-- RUN IN: Supabase SQL Editor
-- =====================================================================

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
