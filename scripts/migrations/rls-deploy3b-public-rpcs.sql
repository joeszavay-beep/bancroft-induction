-- =====================================================================
-- CoreSite Deploy 3b: Additional public RPCs + shape fixes
--
-- RUN THIS IN: Supabase SQL Editor, AFTER rls-deploy3-rpc-functions.sql
-- WHEN: before the RLS lockdown (Step 2 of RLS-REMEDIATION-PLAN.md)
--
-- ADDITIVE — creates/replaces SECURITY DEFINER functions only; changes NO
-- policies. Every public page keeps working via direct table access under the
-- current permissive RLS until Deploy 4 removes it. These functions are what
-- the migrated client calls so that the pages keep working AFTER lockdown.
--
-- Covers the gaps in RLS-REMEDIATION-PLAN.md §3 that rls-deploy3 left open:
--   - PMLogin email routing            -> resolve_login_route
--   - SnagReply comment-only path      -> submit_snag_comment
--   - SiteSignIn operative reads       -> get_operative_public_info, operative_exists_by_email
--   - EquipmentCheck pre-session read  -> get_equipment_public_check
--   - OperativeProfile first-time      -> get_operative_for_setup, complete_operative_setup
--   - Portal signature/operative shape -> get_portal_data (replaced, fuller shape)
--   - Aftercare status default         -> submit_aftercare_defect (replaced, default 'open')
--   - Toolbox manager notification     -> submit_toolbox_signature (replaced, notifies managers)
--
-- ROLLBACK: DROP FUNCTION IF EXISTS for each (old client still works on the
-- permissive RLS). See tail of file.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- PMLogin email routing.
-- Replaces the pre-login anon SELECT of profiles + operatives by email.
-- Returns ONLY display-safe fields for the email the caller already typed —
-- never raw table rows, ids, or other people's data.
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
    WHERE LOWER(email) = q.email ORDER BY id LIMIT 1
  ) o ON true
  LEFT JOIN companies oc ON oc.id = o.company_id
$$;

-- ---------------------------------------------------------------------
-- SnagReply comment-only path (no status change, no photo).
-- Mirrors handleCommentOnly(): author_role 'Operative', token-validated.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_snag_comment(
  p_token text,
  p_comment text,
  p_author_name text DEFAULT 'Operative'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snag_id uuid;
BEGIN
  IF p_comment IS NULL OR TRIM(p_comment) = '' THEN
    RETURN json_build_object('error', 'Comment is required');
  END IF;
  SELECT id INTO v_snag_id FROM snags WHERE reply_token = p_token;
  IF v_snag_id IS NULL THEN
    RETURN json_build_object('error', 'Invalid reply token');
  END IF;
  INSERT INTO snag_comments (snag_id, comment, author_name, author_role)
  VALUES (v_snag_id, TRIM(p_comment), COALESCE(p_author_name, 'Operative'), 'Operative');
  RETURN json_build_object('success', true, 'snag_id', v_snag_id);
END;
$$;

-- ---------------------------------------------------------------------
-- SnagReply full reply (photo submitted). Replaces deploy3's version so it
-- also inserts the "Completion photo submitted for review" system comment the
-- page adds, and stamps review_submitted_by with the author name. Status ->
-- pending_review. author_role kept 'Operative' to match the page.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_snag_reply(
  p_token text,
  p_comment text DEFAULT NULL,
  p_author_name text DEFAULT 'Operative',
  p_photo_url text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snag_id uuid;
BEGIN
  SELECT id INTO v_snag_id FROM snags WHERE reply_token = p_token;
  IF v_snag_id IS NULL THEN
    RETURN json_build_object('error', 'Invalid reply token');
  END IF;
  -- Optional free-text comment (rare on the photo path; kept for parity).
  IF p_comment IS NOT NULL AND TRIM(p_comment) <> '' THEN
    INSERT INTO snag_comments (snag_id, comment, author_name, author_role)
    VALUES (v_snag_id, TRIM(p_comment), COALESCE(p_author_name, 'Operative'), 'Operative');
  END IF;
  UPDATE snags SET
    status = 'pending_review',
    review_photo_url = COALESCE(p_photo_url, review_photo_url),
    review_submitted_at = now(),
    review_submitted_by = COALESCE(p_author_name, 'Operative'),
    updated_at = now()
  WHERE id = v_snag_id;
  -- The page records a system comment marking the completion submission.
  IF p_photo_url IS NOT NULL THEN
    INSERT INTO snag_comments (snag_id, comment, author_name, author_role)
    VALUES (v_snag_id, 'Completion photo submitted for review', COALESCE(p_author_name, 'Operative'), 'Operative');
  END IF;
  RETURN json_build_object('success', true, 'snag_id', v_snag_id);
END;
$$;

-- ---------------------------------------------------------------------
-- SiteSignIn: minimal single-operative info for the kiosk (post session-blob,
-- which may not be a live Supabase session, so callable anon). Id-scoped.
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
  FROM operatives o WHERE o.id = p_id
$$;

-- ---------------------------------------------------------------------
-- SiteSignIn failed-login friendly error: does this email have a worker
-- account and is its profile complete? Booleans only — no rows leaked.
-- ---------------------------------------------------------------------
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
    WHERE LOWER(email) = q.email ORDER BY id LIMIT 1
  ) o ON true
$$;

-- ---------------------------------------------------------------------
-- EquipmentCheck: equipment + its project/floors + company branding, by id.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_equipment_public_check(p_equipment_id uuid)
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
    'equipment', json_build_object(
      'id', e.id, 'description', e.description, 'type', e.type,
      'serial_number', e.serial_number, 'status', e.status,
      'inspection_interval_days', e.inspection_interval_days,
      'company_id', e.company_id, 'project_id', e.project_id
    ),
    'project', (SELECT row_to_json(p) FROM (
      SELECT pr.id, pr.name, pr.location, pr.floor_plans_enabled
      FROM projects pr WHERE pr.id = e.project_id
    ) p),
    'company', (SELECT row_to_json(c) FROM (
      SELECT co.name, co.logo_url, co.primary_colour
      FROM companies co WHERE co.id = e.company_id
    ) c),
    'floors', COALESCE((
      SELECT json_agg(row_to_json(f) ORDER BY f.sort_order)
      FROM project_floors f WHERE f.project_id = e.project_id
    ), '[]'::json)
  ) INTO result
  FROM equipment e WHERE e.id = p_equipment_id;
  RETURN result;
END;
$$;

-- ---------------------------------------------------------------------
-- OperativeProfile first-time setup: read full operative ONLY when the
-- profile is not yet activated (date_of_birth IS NULL). Returns null-ish for
-- already-activated operatives (those edit via the authenticated path).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_operative_for_setup(p_id uuid)
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
    'operative', row_to_json(o),
    'projects', COALESCE((
      SELECT json_agg(json_build_object('id', op.project_id, 'name', pr.name))
      FROM operative_projects op LEFT JOIN projects pr ON pr.id = op.project_id
      WHERE op.operative_id = o.id
    ), '[]'::json),
    'company', (SELECT row_to_json(c) FROM (
      SELECT co.name, co.logo_url, co.primary_colour FROM companies co WHERE co.id = o.company_id
    ) c)
  ) INTO result
  FROM operatives o
  WHERE o.id = p_id AND o.date_of_birth IS NULL;  -- first-time only
  RETURN result;  -- null if not found / already activated
END;
$$;

-- ---------------------------------------------------------------------
-- OperativeProfile first-time setup: write the profile fields. Gated on the
-- row still being unactivated (date_of_birth IS NULL) so it can't be used to
-- overwrite an active operative's details anonymously.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION complete_operative_setup(
  p_id uuid,
  p_role text,
  p_date_of_birth date,
  p_ni_number text,
  p_address text,
  p_mobile text,
  p_email text,
  p_next_of_kin text,
  p_next_of_kin_phone text,
  p_card_type text,
  p_card_number text,
  p_card_expiry date,
  p_card_front_url text,
  p_card_back_url text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated uuid;
BEGIN
  UPDATE operatives SET
    role = p_role,
    date_of_birth = p_date_of_birth,
    ni_number = p_ni_number,
    address = p_address,
    mobile = p_mobile,
    email = p_email,
    next_of_kin = p_next_of_kin,
    next_of_kin_phone = p_next_of_kin_phone,
    card_type = p_card_type,
    card_number = p_card_number,
    card_expiry = p_card_expiry,
    card_front_url = p_card_front_url,
    card_back_url = p_card_back_url,
    card_verified = null,
    card_verified_by = null,
    card_verified_at = null
  WHERE id = p_id AND date_of_birth IS NULL  -- still unactivated
  RETURNING id INTO v_updated;
  IF v_updated IS NULL THEN
    RETURN json_build_object('error', 'Profile already set up or not found');
  END IF;
  RETURN json_build_object('success', true, 'id', v_updated);
END;
$$;

-- ---------------------------------------------------------------------
-- Portal: replace get_portal_data with the fuller signature + operative shape
-- the UI consumes (detail modal, per-doc sign-off sheet, operative photos).
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
      WHERE op.project_id = p_project_id
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

-- ---------------------------------------------------------------------
-- Aftercare: replace so the default status matches the page ('open').
-- (Body identical to deploy3 otherwise.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_aftercare_defect(
  p_project_id uuid,
  p_reported_by text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_unit_ref text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_photo_url text DEFAULT NULL,
  p_priority text DEFAULT 'medium',
  p_status text DEFAULT 'open'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_company_id uuid;
BEGIN
  SELECT company_id INTO v_company_id FROM projects WHERE id = p_project_id;
  IF v_company_id IS NULL THEN
    RETURN json_build_object('error', 'Project not found');
  END IF;
  INSERT INTO aftercare_defects (
    company_id, project_id, reported_by, email, phone,
    unit_ref, location, description, photo_url, priority, status
  ) VALUES (
    v_company_id, p_project_id, p_reported_by, NULLIF(p_email, ''), NULLIF(p_phone, ''),
    NULLIF(p_unit_ref, ''), NULLIF(p_location, ''), p_description, p_photo_url, p_priority, p_status
  ) RETURNING id INTO v_id;
  RETURN json_build_object('success', true, 'id', v_id);
END;
$$;

-- ---------------------------------------------------------------------
-- Toolbox: replace submit_toolbox_signature so it also notifies the company's
-- managers (the page's profiles read + notifications insert, which deny anon
-- under lockdown). Dedup + project-assignment check unchanged.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_toolbox_signature(
  p_talk_id uuid,
  p_operative_id uuid,
  p_operative_name text,
  p_signature_url text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
  v_talk record;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM toolbox_signatures WHERE talk_id = p_talk_id AND operative_id = p_operative_id
  ) INTO v_exists;
  IF v_exists THEN
    RETURN json_build_object('error', 'Already signed');
  END IF;
  SELECT * INTO v_talk FROM toolbox_talks WHERE id = p_talk_id;
  IF v_talk IS NULL THEN
    RETURN json_build_object('error', 'Talk not found');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM operative_projects
    WHERE operative_id = p_operative_id AND project_id = v_talk.project_id
  ) THEN
    RETURN json_build_object('error', 'Operative is not assigned to this project');
  END IF;
  INSERT INTO toolbox_signatures (talk_id, operative_id, operative_name, signature_url, company_id)
  VALUES (p_talk_id, p_operative_id, p_operative_name, p_signature_url, v_talk.company_id);
  -- Notify the company's managers (was a client-side profiles read + insert).
  INSERT INTO notifications (company_id, user_id, type, title, body, link)
  SELECT v_talk.company_id, pr.id, 'info', 'Toolbox Talk Signed',
         COALESCE(p_operative_name, 'An operative') || ' signed "' || v_talk.title || '"',
         '/app/toolbox-live/' || p_talk_id
  FROM profiles pr
  WHERE pr.company_id = v_talk.company_id AND pr.role IN ('manager', 'admin', 'super_admin');
  RETURN json_build_object('success', true);
END;
$$;

-- =====================================================================
-- GRANTS (anon + authenticated)
-- =====================================================================
GRANT EXECUTE ON FUNCTION resolve_login_route(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION submit_snag_comment(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_operative_public_info(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION operative_exists_by_email(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_equipment_public_check(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_operative_for_setup(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_operative_setup(uuid, text, date, text, text, text, text, text, text, text, text, date, text, text) TO anon, authenticated;
-- Replaced functions keep their existing grants, but re-assert for safety:
GRANT EXECUTE ON FUNCTION submit_snag_reply(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_portal_data(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION submit_aftercare_defect(uuid, text, text, text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION submit_toolbox_signature(uuid, uuid, text, text) TO anon, authenticated;

COMMIT;

-- =====================================================================
-- ROLLBACK (additive functions — safe to drop; old client keeps working)
-- =====================================================================
-- DROP FUNCTION IF EXISTS resolve_login_route(text);
-- DROP FUNCTION IF EXISTS submit_snag_comment(text, text, text);
-- DROP FUNCTION IF EXISTS get_operative_public_info(uuid);
-- DROP FUNCTION IF EXISTS operative_exists_by_email(text);
-- DROP FUNCTION IF EXISTS get_equipment_public_check(uuid);
-- DROP FUNCTION IF EXISTS get_operative_for_setup(uuid);
-- DROP FUNCTION IF EXISTS complete_operative_setup(uuid, text, date, text, text, text, text, text, text, text, text, date, text, text);
-- (submit_snag_reply / get_portal_data / submit_aftercare_defect / submit_toolbox_signature
--  are REPLACEMENTS — to revert, re-run rls-deploy3-rpc-functions.sql.)
