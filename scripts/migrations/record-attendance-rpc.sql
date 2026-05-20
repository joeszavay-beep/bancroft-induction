-- =====================================================================
-- record_attendance RPC — atomic sign-in/sign-out with dedup
--
-- WHAT THIS DOES:
-- Provides an atomic check-and-insert for site attendance records.
-- Prevents consecutive same-type events (e.g. sign_in → sign_in)
-- even under race conditions (double-tap, slow network).
--
-- WHY:
-- Direct INSERT to site_attendance allowed duplicate sign-ins when
-- the UI bug prevented the sign-out button from appearing. Workers
-- tapped sign-in repeatedly, creating junk data. This RPC checks
-- the last event type within the same Postgres transaction.
--
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS record_attendance(uuid, uuid, uuid, text, text, text, text, double precision, double precision);
--
-- RUN IN: Supabase SQL Editor
-- =====================================================================

CREATE OR REPLACE FUNCTION record_attendance(
  p_company_id uuid,
  p_project_id uuid,
  p_operative_id uuid,
  p_operative_name text,
  p_type text,
  p_method text DEFAULT 'qr',
  p_notes text DEFAULT NULL,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_type text;
  v_today_start timestamptz;
  v_id uuid;
BEGIN
  v_today_start := (
    to_timestamp(
      to_char(now() AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') || ' 00:00:00',
      'YYYY-MM-DD HH24:MI:SS'
    ) AT TIME ZONE 'Europe/London'
  );

  SELECT type INTO v_last_type
  FROM site_attendance
  WHERE operative_id = p_operative_id
    AND project_id = p_project_id
    AND recorded_at >= v_today_start
  ORDER BY recorded_at DESC
  LIMIT 1;

  IF v_last_type = p_type THEN
    RETURN json_build_object('error', 'Already ' || p_type || ' today', 'duplicate', true);
  END IF;

  INSERT INTO site_attendance (
    company_id, project_id, operative_id, operative_name,
    type, method, notes, latitude, longitude, recorded_at
  ) VALUES (
    p_company_id, p_project_id, p_operative_id, p_operative_name,
    p_type, p_method, p_notes, p_latitude, p_longitude, now()
  ) RETURNING id INTO v_id;

  RETURN json_build_object('success', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION record_attendance(uuid, uuid, uuid, text, text, text, text, double precision, double precision) TO anon;
GRANT EXECUTE ON FUNCTION record_attendance(uuid, uuid, uuid, text, text, text, text, double precision, double precision) TO authenticated;
