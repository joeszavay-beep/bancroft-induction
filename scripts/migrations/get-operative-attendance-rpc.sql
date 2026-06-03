-- =====================================================================
-- get_operative_attendance RPC — fetch today's attendance for an operative
--
-- WHAT THIS DOES:
-- Returns today's attendance records for a given operative on a project.
-- Uses SECURITY DEFINER to bypass RLS (operatives may not have an active
-- Supabase Auth session when returning via saved session/QR rescan).
--
-- WHY:
-- When an operative rescans the QR code after closing their browser, the
-- page restores from localStorage but has no Supabase Auth JWT. Direct
-- SELECTs on site_attendance fail RLS. This RPC provides a safe read path.
--
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS get_operative_attendance(uuid, uuid);
--
-- RUN IN: Supabase SQL Editor
-- =====================================================================

CREATE OR REPLACE FUNCTION get_operative_attendance(
  p_operative_id uuid,
  p_project_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today_start timestamptz;
  v_records json;
BEGIN
  v_today_start := (
    to_timestamp(
      to_char(now() AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') || ' 00:00:00',
      'YYYY-MM-DD HH24:MI:SS'
    ) AT TIME ZONE 'Europe/London'
  );

  SELECT json_agg(row_to_json(r) ORDER BY r.recorded_at DESC)
  INTO v_records
  FROM (
    SELECT id, company_id, project_id, operative_id, operative_name,
           type, method, notes, latitude, longitude, recorded_at
    FROM site_attendance
    WHERE operative_id = p_operative_id
      AND project_id = p_project_id
      AND recorded_at >= v_today_start
    ORDER BY recorded_at DESC
  ) r;

  RETURN COALESCE(v_records, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION get_operative_attendance(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_operative_attendance(uuid, uuid) TO authenticated;
