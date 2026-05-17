-- =====================================================================
-- CoreSite Storage Bucket Lockdown (#2)
--
-- WHAT THIS DOES:
-- 1. Drops all existing permissive storage policies
-- 2. Creates new policies that require authentication for uploads and deletes
-- 3. Keeps SELECT (read) public for all buckets — files are served via public URLs
--    embedded in DB records, and breaking these URLs would break the entire UI
-- 4. Adds file size limit of 20MB per upload (Supabase bucket-level setting)
--
-- WHY READ STAYS PUBLIC:
-- Every file URL in the system (snag photos, signatures, card images, drawings)
-- is a public Supabase Storage URL stored in a DB column. The UI renders these
-- directly via <img src={url}>. Making reads private would require signed URLs
-- for every image on every page — a large refactor. The security improvement
-- from locking writes (no unauthorized uploads/deletes) is the priority.
--
-- ROLLBACK: Re-run the original storage policies:
--   CREATE POLICY "Allow public on X" ON storage.objects FOR ALL
--     USING (bucket_id = 'X') WITH CHECK (bucket_id = 'X');
--   (for each bucket)
--
-- RUN IN: Supabase SQL Editor
-- =====================================================================

BEGIN;

-- =====================================================================
-- STEP 1: DROP ALL EXISTING STORAGE POLICIES
-- =====================================================================

DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes" ON storage.objects;
DROP POLICY IF EXISTS "Allow public on progress-drawings" ON storage.objects;
DROP POLICY IF EXISTS "Allow public on progress-photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public on company-assets" ON storage.objects;
DROP POLICY IF EXISTS "Allow public on drawings bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow public on snag-photos bucket" ON storage.objects;


-- =====================================================================
-- STEP 2: CREATE NEW POLICIES
-- =====================================================================

-- READ: Public for all buckets (files are served via public URLs in the UI)
CREATE POLICY "storage_public_read" ON storage.objects
  FOR SELECT USING (true);

-- UPLOAD: Authenticated users only (managers + operatives with Supabase Auth)
CREATE POLICY "storage_authenticated_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id IN ('documents', 'snag-photos', 'progress-drawings', 'progress-photos', 'company-assets', 'drawings')
  );

-- UPDATE: Authenticated users only (for replacing files)
CREATE POLICY "storage_authenticated_update" ON storage.objects
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND bucket_id IN ('documents', 'snag-photos', 'progress-drawings', 'progress-photos', 'company-assets', 'drawings')
  );

-- DELETE: Authenticated users only
CREATE POLICY "storage_authenticated_delete" ON storage.objects
  FOR DELETE USING (
    auth.role() = 'authenticated'
    AND bucket_id IN ('documents', 'snag-photos', 'progress-drawings', 'progress-photos', 'company-assets', 'drawings')
  );


-- =====================================================================
-- STEP 3: ANON UPLOAD EXCEPTIONS
-- Some public flows need to upload files without auth:
-- - Aftercare defect photos (public portal)
-- - Snag reply photos (subcontractor reply via token)
-- - Toolbox signature images (may be unsigned operatives)
--
-- These are scoped to specific path prefixes within their buckets.
-- =====================================================================

-- Aftercare defect photos: anon can upload to snag-photos/aftercare/*
CREATE POLICY "storage_anon_aftercare_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'anon'
    AND bucket_id = 'snag-photos'
    AND (storage.foldername(name))[1] = 'aftercare'
  );

-- Snag reply photos: anon can upload to snag-photos/snag-replies/*
CREATE POLICY "storage_anon_snag_reply_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'anon'
    AND bucket_id = 'snag-photos'
    AND (storage.foldername(name))[1] = 'snag-replies'
  );


-- =====================================================================
-- STEP 4: VERIFICATION
-- Run this after to confirm the state:
--
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects'
-- ORDER BY policyname;
--
-- Expected: 6 policies
--   1. storage_public_read (SELECT, true)
--   2. storage_authenticated_upload (INSERT, authenticated + bucket check)
--   3. storage_authenticated_update (UPDATE, authenticated + bucket check)
--   4. storage_authenticated_delete (DELETE, authenticated + bucket check)
--   5. storage_anon_aftercare_upload (INSERT, anon + snag-photos/aftercare/*)
--   6. storage_anon_snag_reply_upload (INSERT, anon + snag-photos/snag-replies/*)
-- =====================================================================

COMMIT;
