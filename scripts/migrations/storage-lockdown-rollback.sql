-- =====================================================================
-- CoreSite Storage ROLLBACK — Captured 2026-05-17
-- Restores the original (fully public) storage policies.
-- =====================================================================

BEGIN;

-- Drop lockdown policies
DROP POLICY IF EXISTS "storage_public_read" ON storage.objects;
DROP POLICY IF EXISTS "storage_authenticated_upload" ON storage.objects;
DROP POLICY IF EXISTS "storage_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "storage_authenticated_delete" ON storage.objects;
DROP POLICY IF EXISTS "storage_anon_aftercare_upload" ON storage.objects;
DROP POLICY IF EXISTS "storage_anon_snag_reply_upload" ON storage.objects;
DROP POLICY IF EXISTS "storage_anon_card_upload" ON storage.objects;

-- Restore original policies (exact pre-lockdown state)

-- documents bucket (had 3 separate policies)
CREATE POLICY "Allow public uploads" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents');
CREATE POLICY "Allow public reads" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');
CREATE POLICY "Allow public deletes" ON storage.objects
  FOR DELETE USING (bucket_id = 'documents');

-- Other buckets (each had a single ALL policy)
CREATE POLICY "Allow public on progress-drawings" ON storage.objects
  FOR ALL USING (bucket_id = 'progress-drawings') WITH CHECK (bucket_id = 'progress-drawings');
CREATE POLICY "Allow public on progress-photos" ON storage.objects
  FOR ALL USING (bucket_id = 'progress-photos') WITH CHECK (bucket_id = 'progress-photos');
CREATE POLICY "Allow public on company-assets" ON storage.objects
  FOR ALL USING (bucket_id = 'company-assets') WITH CHECK (bucket_id = 'company-assets');
CREATE POLICY "Allow public on drawings bucket" ON storage.objects
  FOR ALL USING (bucket_id = 'drawings') WITH CHECK (bucket_id = 'drawings');
CREATE POLICY "Allow public on snag-photos bucket" ON storage.objects
  FOR ALL USING (bucket_id = 'snag-photos') WITH CHECK (bucket_id = 'snag-photos');

COMMIT;
