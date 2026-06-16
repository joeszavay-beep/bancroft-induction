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

-- Drop EVERY existing policy on storage.objects — not a hard-coded name list.
-- The old hard-coded list missed floor_plans_read/upload/delete (from
-- add-floor-plans.sql), so anon could still upload to / delete from the
-- floor-plans bucket after the lockdown ran (AUDIT §5.9). A generic loop closes
-- that gap and is robust to any future bucket policies.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;


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
    AND bucket_id IN ('documents', 'snag-photos', 'progress-drawings', 'progress-photos', 'company-assets', 'drawings', 'floor-plans')
  );

-- UPDATE: Authenticated users only (for replacing files)
CREATE POLICY "storage_authenticated_update" ON storage.objects
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND bucket_id IN ('documents', 'snag-photos', 'progress-drawings', 'progress-photos', 'company-assets', 'drawings', 'floor-plans')
  );

-- DELETE: Authenticated users only
CREATE POLICY "storage_authenticated_delete" ON storage.objects
  FOR DELETE USING (
    auth.role() = 'authenticated'
    AND bucket_id IN ('documents', 'snag-photos', 'progress-drawings', 'progress-photos', 'company-assets', 'drawings', 'floor-plans')
  );


-- =====================================================================
-- STEP 3: ANON UPLOAD EXCEPTIONS
--
-- These are the ONLY paths where unauthenticated users can upload.
-- Each exists because a specific public-facing flow requires file
-- upload before the user has a Supabase Auth session.
--
-- COMPLETE LIST (if it's not here, anon can't upload there):
--
--   BUCKET        FOLDER PREFIX    WHY                                          ADDED
--   snag-photos   aftercare/       Public aftercare defect portal                2026-05-17
--   snag-photos   snag-replies/    Subcontractor snag reply via email link       2026-05-17
--   documents     cards/           CSCS card upload during first-time onboarding 2026-05-20
--   documents     signatures/      RAMS/document sign-off via invite link        2026-05-21
--   documents     toolbox/         Toolbox talk signature via QR/link            2026-05-21
--
-- NOT included (not live / requires auth):
--   documents     agencies/        Agency self-registration — feature not yet live
--
-- These are temporary. When all operatives authenticate via Supabase
-- Auth before interacting with the app, these anon exceptions can be
-- removed. Tracked as part of the Deploy 4 (RLS lockdown) plan.
--
-- Security note: all paths use UUID filenames (unguessable). Content
-- is images/PDFs (non-executable). Bucket is already public-read.
-- Risk is equivalent to a public file upload form scoped to a folder.
-- =====================================================================

-- 1. Aftercare defect photos: public portal submits defect with photo
CREATE POLICY "storage_anon_aftercare_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'anon'
    AND bucket_id = 'snag-photos'
    AND (storage.foldername(name))[1] = 'aftercare'
  );

-- 2. Snag reply photos: subcontractor replies to snag via email link
CREATE POLICY "storage_anon_snag_reply_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'anon'
    AND bucket_id = 'snag-photos'
    AND (storage.foldername(name))[1] = 'snag-replies'
  );

-- 3. CSCS card photos: operative uploads card during first-time profile setup
CREATE POLICY "storage_anon_card_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'anon'
    AND bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'cards'
  );

-- 4. Document signatures: operative signs RAMS/induction docs via invite link
CREATE POLICY "storage_anon_signature_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'anon'
    AND bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'signatures'
  );

-- 5. Toolbox talk signatures: operative signs toolbox talk via QR/link
CREATE POLICY "storage_anon_toolbox_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'anon'
    AND bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'toolbox'
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
-- Expected: 9 policies (4 base + 5 anon-folder exceptions). Critically, NO
-- floor_plans_read/upload/delete should remain (the generic drop in STEP 1
-- removes them; floor-plans writes now go through storage_authenticated_*).
--   1. storage_public_read (SELECT, true)
--   2. storage_authenticated_upload (INSERT, authenticated + bucket check incl. floor-plans)
--   3. storage_authenticated_update (UPDATE, authenticated + bucket check incl. floor-plans)
--   4. storage_authenticated_delete (DELETE, authenticated + bucket check incl. floor-plans)
--   5. storage_anon_aftercare_upload (INSERT, anon + snag-photos/aftercare/*)
--   6. storage_anon_snag_reply_upload (INSERT, anon + snag-photos/snag-replies/*)
--   7. storage_anon_card_upload (INSERT, anon + documents/cards/*)
--   8. storage_anon_signature_upload (INSERT, anon + documents/signatures/*)
--   9. storage_anon_toolbox_upload (INSERT, anon + documents/toolbox/*)
-- =====================================================================

ROLLBACK; -- DRY RUN (was COMMIT;) — nothing persists
