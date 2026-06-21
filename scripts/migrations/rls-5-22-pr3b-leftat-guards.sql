-- =====================================================================
-- AUDIT §5.22 — PR3b: left_at lifecycle guards (durable §5.19, step before PR4)
--
-- WHY: PR3b switches "remove operative" from hard-DELETE to mark-historical
-- (left_at = now(), auth_user_id = NULL) so compliance history is retained.
-- Because the row now PERSISTS, every identity / routing / public-list read of
-- operatives must exclude historical rows or a "removed" worker keeps RLS access
-- (Tier 1), reappears in the login picker (Tier 2), and shows as a ghost on the
-- public Portal / ToolboxSign pages. This migration adds  AND left_at IS NULL
-- to the nine functions that read operatives for ACTIVE use, and makes the GDPR
-- cascade return auth_user_id so auth cleanup can target the linked login (§4.9).
--
-- This is the ONLY behaviour-changing predicate added to each function:
--     AND left_at IS NULL          (helpers / kiosk by-id)
--     AND o.left_at IS NULL        (LATERAL / JOIN list reads)
-- Everything else in each body is reproduced verbatim from its committed source
-- (interim helpers: rls-5-19-interim-email-crosscheck.sql; public RPCs:
-- rls-deploy3b-public-rpcs.sql; toolbox/cascade: rls-lockdown.sql /
-- add-delete-operative-cascade.sql).
--
-- !!! APPLY DELIBERATELY (single live DB, no staging) — do NOT run blind:
--   1. CAPTURE canonical rollback FIRST (this is the source of truth, not the
--      reproductions in the rollback file):
--        SELECT p.proname, pg_get_functiondef(p.oid) FROM pg_proc p
--        JOIN pg_namespace n ON n.oid = p.pronamespace
--        WHERE n.nspname='public' AND p.proname IN
--          ('get_my_operative_id','get_operative_company_id','get_my_company_id',
--           'resolve_login_route','operative_exists_by_email',
--           'get_operative_public_info','get_portal_data',
--           'get_toolbox_for_signing','delete_operative_cascade');
--   2. DIFF each captured live body against the reproduction below. If a live
--      body differs from the committed source (e.g. a later patch), DO NOT
--      overwrite it wholesale — port ONLY the  left_at IS NULL  predicate onto
--      the live body and apply that instead.
--   3. Run inside  BEGIN; <this file>; <sanity SELECTs at the foot>; ROLLBACK;
--      first (dry run), inspect, then re-run with COMMIT.
--   4. Re-run the step-1 capture to confirm the new bodies are live.
--   5. Run the §5.22 E2E specs (operative-remove-historical / rejoin / gdpr-erase)
--      + the RLS_LOCKDOWN_APPLIED=1 regression suite.
-- Rollback: rls-5-22-pr3b-leftat-guards-rollback.sql (or the step-1 capture).
-- =====================================================================

-- ---------------------------------------------------------------------
-- TIER 1 — RLS identity helpers. Adding  AND left_at IS NULL  is what
-- actually revokes a marked-historical operative's access (the interim path
-- resolves by user_metadata.operative_id + email, neither of which clears on
-- "leave"; left_at is the one signal that does).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_operative_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id FROM operatives
  WHERE id = (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid
    AND lower(email) = lower(auth.jwt() ->> 'email')
    AND left_at IS NULL
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
    AND left_at IS NULL
$$;

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
         AND lower(email) = lower(auth.jwt() ->> 'email')
         AND left_at IS NULL)
  )
$$;

-- ---------------------------------------------------------------------
-- TIER 2 — pre-auth login routing (by email). Without left_at, a removed
-- worker's persisting row re-offers the worker login path / reports "exists".
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_login_route(p_email text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'has_manager', m.id IS NOT NULL,
    'manager_name', m.name,
    'manager_company', mc.name,
    'has_worker', o.id IS NOT NULL,
    'worker_name', o.name,
    'worker_company', oc.name,
    'worker_profile_complete', (o.id IS NOT NULL AND o.date_of_birth IS NOT NULL)
  )
  FROM (SELECT LOWER(TRIM(p_email)) AS email) q
  LEFT JOIN LATERAL (
    SELECT id, name, company_id FROM profiles
    WHERE LOWER(email) = q.email ORDER BY id LIMIT 1
  ) m ON true
  LEFT JOIN companies mc ON mc.id = m.company_id
  LEFT JOIN LATERAL (
    SELECT id, name, company_id, date_of_birth FROM operatives
    WHERE LOWER(email) = q.email AND left_at IS NULL ORDER BY id LIMIT 1
  ) o ON true
  LEFT JOIN companies oc ON oc.id = o.company_id
$$;

CREATE OR REPLACE FUNCTION operative_exists_by_email(p_email text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'exists', o.id IS NOT NULL,
    'profile_complete', (o.id IS NOT NULL AND o.date_of_birth IS NOT NULL)
  )
  FROM (SELECT LOWER(TRIM(p_email)) AS email) q
  LEFT JOIN LATERAL (
    SELECT id, date_of_birth FROM operatives
    WHERE LOWER(email) = q.email AND left_at IS NULL ORDER BY id LIMIT 1
  ) o ON true
$$;

-- ---------------------------------------------------------------------
-- Kiosk by-id (SiteSignIn post-blob path). A removed worker should not be able
-- to kiosk-sign-in. (Owner-approved inclusion.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_operative_public_info(p_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'id', o.id,
    'name', o.name,
    'role', o.role,
    'photo_url', o.photo_url,
    'company_id', o.company_id,
    'start_time', o.start_time,
    'end_time', o.end_time
  )
  FROM operatives o WHERE o.id = p_id AND o.left_at IS NULL
$$;

-- ---------------------------------------------------------------------
-- Anon public pages — Portal + ToolboxSign list project operatives. Without
-- left_at, removed workers appear on a public page (ghost) and as people who
-- still "need to sign".
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_portal_data(p_project_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'project', (SELECT row_to_json(p) FROM (
      SELECT pr.id, pr.name, pr.location,
             c.name AS company_name, c.logo_url, c.primary_colour, c.secondary_colour, c.settings
      FROM projects pr LEFT JOIN companies c ON c.id = pr.company_id
      WHERE pr.id = p_project_id
    ) p),
    'documents', COALESCE((
      SELECT json_agg(json_build_object('id', d.id, 'title', d.title, 'created_at', d.created_at) ORDER BY d.created_at)
      FROM documents d WHERE d.project_id = p_project_id
    ), '[]'::json),
    'signatures', COALESCE((
      SELECT json_agg(json_build_object(
        'id', s.id, 'operative_id', s.operative_id, 'operative_name', s.operative_name,
        'document_id', s.document_id, 'document_title', s.document_title,
        'signature_url', s.signature_url, 'typed_name', s.typed_name,
        'invalidated', s.invalidated, 'ip_address', s.ip_address, 'signed_at', s.signed_at
      ) ORDER BY s.signed_at DESC)
      FROM signatures s WHERE s.project_id = p_project_id
    ), '[]'::json),
    'operatives', COALESCE((
      SELECT json_agg(json_build_object('id', o.id, 'name', o.name, 'role', o.role, 'photo_url', o.photo_url) ORDER BY o.name)
      FROM operatives o
      JOIN operative_projects op ON op.operative_id = o.id
      WHERE op.project_id = p_project_id AND o.left_at IS NULL
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION get_toolbox_for_signing(p_talk_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'talk', row_to_json(t),
    'project', (SELECT row_to_json(p) FROM (
      SELECT pr.id, pr.name, c.name AS company_name, c.logo_url
      FROM projects pr LEFT JOIN companies c ON c.id = pr.company_id
      WHERE pr.id = t.project_id
    ) p),
    'operatives', COALESCE((
      SELECT json_agg(json_build_object('id', o.id, 'name', o.name, 'role', o.role, 'photo_url', o.photo_url) ORDER BY o.name)
      FROM operatives o
      JOIN operative_projects op ON op.operative_id = o.id
      WHERE op.project_id = t.project_id AND o.left_at IS NULL
    ), '[]'::json),
    'signed', COALESCE((
      SELECT json_agg(ts.operative_id)
      FROM toolbox_signatures ts WHERE ts.talk_id = p_talk_id
    ), '[]'::json)
  ) INTO result
  FROM toolbox_talks t
  WHERE t.id = p_talk_id;

  RETURN result;
END;
$$;

-- ---------------------------------------------------------------------
-- GDPR erasure cascade — return auth_user_id so api/delete-operative can delete
-- the linked login directly (replaces the broken first-page listUsers() scan,
-- §4.9). Body otherwise verbatim from add-delete-operative-cascade.sql.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_operative_cascade(op_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  op_record RECORD;
  result JSON;
BEGIN
  SELECT id, name, email, auth_user_id, card_front_url, card_back_url, photo_url
    INTO op_record
    FROM operatives
    WHERE id = op_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Operative not found');
  END IF;

  DELETE FROM site_attendance WHERE operative_id = op_id;
  DELETE FROM toolbox_signatures WHERE operative_id = op_id;
  DELETE FROM chat_messages WHERE operative_id = op_id;
  DELETE FROM notifications WHERE user_id = op_id;
  DELETE FROM job_operatives WHERE operative_id = op_id;
  DELETE FROM operative_availability WHERE operative_id = op_id;
  DELETE FROM operative_certifications WHERE operative_id = op_id;
  DELETE FROM labour_bookings WHERE operative_id = op_id;

  DELETE FROM operatives WHERE id = op_id;

  RETURN json_build_object(
    'success', true,
    'name', op_record.name,
    'email', op_record.email,
    'auth_user_id', op_record.auth_user_id,
    'card_front_url', op_record.card_front_url,
    'card_back_url', op_record.card_back_url,
    'photo_url', op_record.photo_url
  );
END;
$$;

-- preserve the lockdown grants (CREATE OR REPLACE keeps them, re-assert anyway)
REVOKE EXECUTE ON FUNCTION delete_operative_cascade(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_operative_cascade(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION delete_operative_cascade(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION delete_operative_cascade(UUID) TO service_role;

-- ---------------------------------------------------------------------
-- SANITY (run in the dry-run BEGIN…ROLLBACK; expectations against live data
-- as of the 2026-06-21 backfill: 54 active, 2 historical):
--   SELECT count(*) FROM operatives WHERE left_at IS NULL;            -- 54
--   SELECT count(*) FROM operatives WHERE left_at IS NOT NULL;        -- 2
--   -- active worker still routes:
--   SELECT resolve_login_route('joe.szavay@icloud.com') ->> 'has_worker';  -- true (active Thomas Worley record)
--   -- a fully-left email returns no worker:
--   --   pick an email whose only operative row has left_at set → 'has_worker' = false
--   -- portal list excludes a left operative on that project (compare counts):
--   --   SELECT json_array_length((get_portal_data('<project>'::uuid)) -> 'operatives');
-- get_my_operative_id / get_operative_company_id / get_my_company_id are JWT-
-- dependent — verify behaviourally via the §5.22 E2E specs, not in plain SQL.
-- ---------------------------------------------------------------------
