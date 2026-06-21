-- =====================================================================
-- ROLLBACK for rls-5-22-pr3b-leftat-guards.sql
--
-- CANONICAL rollback = the pg_get_functiondef capture taken in step 1 of the
-- forward file's apply ritual. Apply THAT if you have it. The reproductions
-- below are the pre-PR3b bodies from committed source (interim helpers, deploy3b
-- RPCs, lockdown toolbox, original cascade) for convenience only — diff them
-- against your capture before trusting them.
--
-- Reverting these restores user_metadata-only operative resolution WITHOUT the
-- left_at lifecycle filter: a marked-historical operative regains RLS access and
-- reappears in login routing / public lists. Only roll back if PR3b is being
-- withdrawn wholesale.
-- =====================================================================

-- Tier 1 helpers — without  AND left_at IS NULL
CREATE OR REPLACE FUNCTION get_my_operative_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM operatives
  WHERE id = (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid
    AND lower(email) = lower(auth.jwt() ->> 'email')
$$;

CREATE OR REPLACE FUNCTION get_operative_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT company_id FROM operatives
  WHERE id = (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid
    AND lower(email) = lower(auth.jwt() ->> 'email')
$$;

CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT company_id FROM profiles WHERE id = auth.uid()),
    (SELECT company_id FROM operatives
       WHERE id = (auth.jwt() -> 'user_metadata' ->> 'operative_id')::uuid
         AND lower(email) = lower(auth.jwt() ->> 'email'))
  )
$$;

-- Tier 2 login routing — without  AND left_at IS NULL  in the worker LATERAL
CREATE OR REPLACE FUNCTION resolve_login_route(p_email text)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION operative_exists_by_email(p_email text)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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

-- Kiosk by-id — without  AND o.left_at IS NULL
CREATE OR REPLACE FUNCTION get_operative_public_info(p_id uuid)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'id', o.id, 'name', o.name, 'role', o.role, 'photo_url', o.photo_url,
    'company_id', o.company_id, 'start_time', o.start_time, 'end_time', o.end_time
  )
  FROM operatives o WHERE o.id = p_id
$$;

-- Portal — without  AND o.left_at IS NULL  in the operatives sub-agg
CREATE OR REPLACE FUNCTION get_portal_data(p_project_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

-- ToolboxSign — without  AND o.left_at IS NULL  in the operatives sub-agg
CREATE OR REPLACE FUNCTION get_toolbox_for_signing(p_talk_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
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

-- Cascade — original (no auth_user_id in SELECT INTO / return)
CREATE OR REPLACE FUNCTION delete_operative_cascade(op_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  op_record RECORD;
  result JSON;
BEGIN
  SELECT id, name, email, card_front_url, card_back_url, photo_url
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
    'card_front_url', op_record.card_front_url,
    'card_back_url', op_record.card_back_url,
    'photo_url', op_record.photo_url
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_operative_cascade(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_operative_cascade(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION delete_operative_cascade(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION delete_operative_cascade(UUID) TO service_role;
