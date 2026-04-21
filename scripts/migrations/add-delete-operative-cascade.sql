-- Migration: Cascade delete function for operatives
-- Purpose: Hard-delete an operative and all related data in one transaction
-- Run this in the Supabase SQL editor.
--
-- Tables with ON DELETE CASCADE (handled automatically when operative row is deleted):
--   operative_projects, signatures, operative_invoices, document_signoffs
--
-- Tables without CASCADE (cleaned up manually in this function):
--   site_attendance, toolbox_signatures, chat_messages, notifications,
--   job_operatives, operative_availability, operative_certifications, labour_bookings
--
-- NOT handled here (done by the API endpoint after this function returns):
--   - Storage files (card_front_url, card_back_url, photo_url) — requires Storage API
--   - auth.users row — requires Auth Admin API
--
-- snags.assigned_to is TEXT (not FK) and left intact as historical record.

CREATE OR REPLACE FUNCTION delete_operative_cascade(op_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  op_record RECORD;
  result JSON;
BEGIN
  -- Verify operative exists and capture URLs for caller to clean up storage
  SELECT id, name, email, card_front_url, card_back_url, photo_url
    INTO op_record
    FROM operatives
    WHERE id = op_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Operative not found');
  END IF;

  -- Manual deletes for tables without ON DELETE CASCADE
  DELETE FROM site_attendance WHERE operative_id = op_id;
  DELETE FROM toolbox_signatures WHERE operative_id = op_id;
  DELETE FROM chat_messages WHERE operative_id = op_id;
  DELETE FROM notifications WHERE user_id = op_id;
  DELETE FROM job_operatives WHERE operative_id = op_id;
  DELETE FROM operative_availability WHERE operative_id = op_id;
  DELETE FROM operative_certifications WHERE operative_id = op_id;
  DELETE FROM labour_bookings WHERE operative_id = op_id;

  -- Delete the operative (CASCADE handles: operative_projects, signatures,
  -- operative_invoices, document_signoffs)
  DELETE FROM operatives WHERE id = op_id;

  -- Return info the API endpoint needs for storage/auth cleanup
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

-- Lock down: only callable via service_role (i.e. server-side API endpoints)
REVOKE EXECUTE ON FUNCTION delete_operative_cascade(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_operative_cascade(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION delete_operative_cascade(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION delete_operative_cascade(UUID) TO service_role;
