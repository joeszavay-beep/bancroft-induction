-- =====================================================================
-- CoreSite Deploy 3: Helper Functions + RPC Functions
--
-- RUN THIS IN: Supabase SQL Editor
-- WHEN: Deploy 3 (after bake period, before RLS lockdown)
--
-- This creates:
-- 1. Helper functions for operative auth (get_my_operative_id, get_operative_company_id)
-- 2. 8 RPC functions for public flows
-- 3. GRANT statements for anon + authenticated roles
--
-- These functions are ADDITIVE — they don't change any existing policies.
-- The old RLS policies remain in place. These functions just provide an
-- alternative way for public flows to access data (via RPC instead of
-- direct table queries). Both paths work until Deploy 4 removes the old.
--
-- ROLLBACK: DROP FUNCTION IF EXISTS for each function (harmless — old
-- client code still works with direct table access under old RLS).
-- =====================================================================

BEGIN;

-- =====================================================================
-- PART 1: HELPER FUNCTIONS
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

-- =====================================================================
-- PART 2: RPC FUNCTIONS
-- =====================================================================

-- 2a. QR Sign-In: load project branding
CREATE OR REPLACE FUNCTION get_project_public_info(p_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'id', p.id,
    'name', p.name,
    'company_name', c.name,
    'logo_url', c.logo_url,
    'primary_colour', c.primary_colour,
    'geofence_enabled', p.geofence_enabled,
    'site_latitude', p.site_latitude,
    'site_longitude', p.site_longitude,
    'geofence_radius', p.geofence_radius,
    'start_time', p.start_time,
    'end_time', p.end_time
  )
  FROM projects p
  LEFT JOIN companies c ON c.id = p.company_id
  WHERE p.id = p_id
$$;

-- 2b. Snag Reply: load snag by reply token
CREATE OR REPLACE FUNCTION get_snag_for_reply(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'snag', row_to_json(s),
    'drawing', json_build_object('name', d.name, 'level_ref', d.level_ref, 'drawing_number', d.drawing_number),
    'comments', COALESCE((
      SELECT json_agg(row_to_json(sc) ORDER BY sc.created_at)
      FROM snag_comments sc WHERE sc.snag_id = s.id
    ), '[]'::json)
  ) INTO result
  FROM snags s
  LEFT JOIN drawings d ON d.id = s.drawing_id
  WHERE s.reply_token = p_token;
  RETURN result;
END;
$$;

-- 2c. Snag Reply: submit reply
CREATE OR REPLACE FUNCTION submit_snag_reply(
  p_token text,
  p_comment text DEFAULT NULL,
  p_author_name text DEFAULT 'Subcontractor',
  p_photo_url text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_snag_id uuid;
BEGIN
  SELECT id INTO v_snag_id FROM snags WHERE reply_token = p_token;
  IF v_snag_id IS NULL THEN
    RETURN json_build_object('error', 'Invalid reply token');
  END IF;
  IF p_comment IS NOT NULL AND p_comment != '' THEN
    INSERT INTO snag_comments (snag_id, comment, author_name, author_role)
    VALUES (v_snag_id, p_comment, p_author_name, 'subcontractor');
  END IF;
  UPDATE snags SET
    status = 'pending_review',
    review_photo_url = COALESCE(p_photo_url, review_photo_url),
    review_submitted_at = now(),
    review_submitted_by = p_author_name,
    updated_at = now()
  WHERE id = v_snag_id;
  RETURN json_build_object('success', true, 'snag_id', v_snag_id);
END;
$$;

-- 2d. Aftercare: get defects by project + email
CREATE OR REPLACE FUNCTION get_aftercare_defects(p_project_id uuid, p_email text)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(json_agg(row_to_json(d) ORDER BY d.created_at DESC), '[]'::json)
  FROM aftercare_defects d
  WHERE d.project_id = p_project_id
    AND LOWER(d.email) = LOWER(p_email)
$$;

-- 2e. Aftercare: submit defect
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
  p_status text DEFAULT 'reported'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
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
    v_company_id, p_project_id, p_reported_by, p_email, p_phone,
    p_unit_ref, p_location, p_description, p_photo_url, p_priority, p_status
  ) RETURNING id INTO v_id;
  RETURN json_build_object('success', true, 'id', v_id);
END;
$$;

-- 2f. Portal: get project completion data
CREATE OR REPLACE FUNCTION get_portal_data(p_project_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'project', (SELECT row_to_json(p) FROM (
      SELECT pr.id, pr.name, pr.location, c.name AS company_name, c.logo_url
      FROM projects pr LEFT JOIN companies c ON c.id = pr.company_id
      WHERE pr.id = p_project_id
    ) p),
    'documents', COALESCE((
      SELECT json_agg(json_build_object('id', d.id, 'title', d.title, 'created_at', d.created_at) ORDER BY d.created_at)
      FROM documents d WHERE d.project_id = p_project_id
    ), '[]'::json),
    'signatures', COALESCE((
      SELECT json_agg(json_build_object('operative_name', s.operative_name, 'document_title', s.document_title, 'signed_at', s.signed_at) ORDER BY s.signed_at)
      FROM signatures s WHERE s.project_id = p_project_id
    ), '[]'::json),
    'operatives', COALESCE((
      SELECT json_agg(json_build_object('id', o.id, 'name', o.name, 'role', o.role) ORDER BY o.name)
      FROM operatives o
      JOIN operative_projects op ON op.operative_id = o.id
      WHERE op.project_id = p_project_id
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

-- 2g. Toolbox: load talk for signing
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
      WHERE op.project_id = t.project_id
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

-- 2h. Toolbox: submit signature
CREATE OR REPLACE FUNCTION submit_toolbox_signature(
  p_talk_id uuid,
  p_operative_id uuid,
  p_operative_name text,
  p_signature_url text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
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
  RETURN json_build_object('success', true);
END;
$$;

-- =====================================================================
-- GRANTS
-- =====================================================================

GRANT EXECUTE ON FUNCTION get_project_public_info(uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_snag_for_reply(text) TO anon;
GRANT EXECUTE ON FUNCTION submit_snag_reply(text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION get_aftercare_defects(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION submit_aftercare_defect(uuid, text, text, text, text, text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION get_portal_data(uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_toolbox_for_signing(uuid) TO anon;
GRANT EXECUTE ON FUNCTION submit_toolbox_signature(uuid, uuid, text, text) TO anon;

GRANT EXECUTE ON FUNCTION get_project_public_info(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_snag_for_reply(text) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_snag_reply(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_aftercare_defects(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_aftercare_defect(uuid, text, text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_portal_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_toolbox_for_signing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_toolbox_signature(uuid, uuid, text, text) TO authenticated;

COMMIT;
