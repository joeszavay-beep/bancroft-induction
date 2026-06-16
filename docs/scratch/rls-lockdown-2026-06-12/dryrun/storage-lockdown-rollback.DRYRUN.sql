-- =====================================================================
-- CoreSite Storage ROLLBACK — restores the LIVE pre-lockdown state
-- captured 2026-06-12 via pg_policies (§1 query C baseline, see
-- docs/scratch/rls-lockdown-2026-06-12/baseline-queryC-storage.md).
--
-- NOTE: the live pre-lockdown state is NOT the 2026-05-17 fully-public
-- set this file previously restored — an earlier storage-lockdown had
-- already been applied to prod. The live state = old lockdown policies
-- (6-bucket lists, no floor-plans) + the 5 anon-folder exceptions + the
-- 3 floor_plans_* policies from add-floor-plans.sql (2026-06-08).
-- Restoring that exact 12-policy set is what makes this an
-- outage-stopper: the app behaves exactly as it did before the window.
-- =====================================================================

BEGIN;

-- Drop the (patched) lockdown's 9 policies. 7 names are reused below with
-- the old bucket lists, so drop everything first.
DROP POLICY IF EXISTS "storage_public_read" ON storage.objects;
DROP POLICY IF EXISTS "storage_authenticated_upload" ON storage.objects;
DROP POLICY IF EXISTS "storage_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "storage_authenticated_delete" ON storage.objects;
DROP POLICY IF EXISTS "storage_anon_aftercare_upload" ON storage.objects;
DROP POLICY IF EXISTS "storage_anon_snag_reply_upload" ON storage.objects;
DROP POLICY IF EXISTS "storage_anon_card_upload" ON storage.objects;
DROP POLICY IF EXISTS "storage_anon_signature_upload" ON storage.objects;
DROP POLICY IF EXISTS "storage_anon_toolbox_upload" ON storage.objects;
DROP POLICY IF EXISTS "floor_plans_read" ON storage.objects;
DROP POLICY IF EXISTS "floor_plans_upload" ON storage.objects;
DROP POLICY IF EXISTS "floor_plans_delete" ON storage.objects;

-- Restore the captured live state (12 policies, verbatim 2026-06-12)

CREATE POLICY "storage_public_read" ON storage.objects
  FOR SELECT USING (true);

CREATE POLICY "storage_authenticated_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id IN ('documents', 'snag-photos', 'progress-drawings', 'progress-photos', 'company-assets', 'drawings')
  );

CREATE POLICY "storage_authenticated_update" ON storage.objects
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND bucket_id IN ('documents', 'snag-photos', 'progress-drawings', 'progress-photos', 'company-assets', 'drawings')
  );

CREATE POLICY "storage_authenticated_delete" ON storage.objects
  FOR DELETE USING (
    auth.role() = 'authenticated'
    AND bucket_id IN ('documents', 'snag-photos', 'progress-drawings', 'progress-photos', 'company-assets', 'drawings')
  );

CREATE POLICY "storage_anon_aftercare_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'anon'
    AND bucket_id = 'snag-photos'
    AND (storage.foldername(name))[1] = 'aftercare'
  );

CREATE POLICY "storage_anon_snag_reply_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'anon'
    AND bucket_id = 'snag-photos'
    AND (storage.foldername(name))[1] = 'snag-replies'
  );

CREATE POLICY "storage_anon_card_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'anon'
    AND bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'cards'
  );

CREATE POLICY "storage_anon_signature_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'anon'
    AND bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'signatures'
  );

CREATE POLICY "storage_anon_toolbox_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'anon'
    AND bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'toolbox'
  );

-- floor-plans (add-floor-plans.sql, 2026-06-08 — the §5.9 anon gap, but it
-- is part of the live pre-lockdown state and floor-plan uploads depend on it
-- until the patched lockdown adds floor-plans to the authenticated lists)
CREATE POLICY "floor_plans_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'floor-plans');
CREATE POLICY "floor_plans_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'floor-plans');
CREATE POLICY "floor_plans_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'floor-plans');

ROLLBACK; -- DRY RUN (was COMMIT;) — nothing persists
