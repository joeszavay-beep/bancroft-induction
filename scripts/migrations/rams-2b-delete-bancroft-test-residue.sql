-- ═══ AS APPLIED 2026-07-02 (owner-run, COMMITTED + verified) ═══
-- Applied as a single self-contained DO block (see the rams-2 AS-APPLIED
-- note for why): the signature-count guard, the company-pinned DELETE with
-- del_count=1 abort, and a row-gone re-check all inside one block. Verified
-- after: residue doc gone, Bancroft has exactly 1 doc left ("Cable Pulling
-- RAMS", doc_type='general', kept per owner decision), 0 orphaned
-- signatures globally, all tenant signature totals unchanged.
-- ═══════════════════════════════════════════════════════════════
--
-- Owner-APPROVED 2026-07-02 (delete, not migrate). Run as apply step 4,
-- AFTER rams-1 and rams-2.
--
-- Deliberate hard-delete of ONE Bancroft test-residue document: a copy of
-- David's deliveries method statement uploaded to Bancroft's "Captain Morgan"
-- test project on 2026-05-12 10:59 — 44 minutes before David's real upload of
-- the same file to Morgan Lewis (11:43). 0 valid + 0 invalidated signatures.
--
-- FULL ROW CAPTURE (live, 2026-07-02) — restore INSERT is at the bottom:
--   id:         1c709866-3daa-4a87-888b-0e571afa0826
--   company_id: 00000000-0000-0000-0000-000000000001 (Bancroft LTD)
--   project_id: 57994205-6b1e-4b93-89c4-4a9da8e26c4b (Captain Morgan)
--   title:      ML-BAN-XX-ZZ-MS-X-00005 REV - (Management of Deliveries)
--   file_url:   https://pbyxpeaeijuxkzktvwbd.supabase.co/storage/v1/object/public/documents/57994205-6b1e-4b93-89c4-4a9da8e26c4b/e8e1d097-80cc-4dae-a958-106a243044b3.pdf
--   file_name:  ML-BAN-XX-ZZ-MS-X-00005 REV - (Management of Deliveries) (1).pdf
--   created_at: 2026-05-12T10:59:36.809657+00:00
--   version:    1
--
-- SAFETY: signatures.document_id is ON DELETE CASCADE, so the guard aborts if
-- ANY signature row (valid or invalidated) is attached — the delete can never
-- take compliance evidence with it. The storage file is NOT deleted (same as
-- the app's own delete path); scripts/cleanup-orphan-storage.js sweeps
-- orphaned files separately.

BEGIN;

DO $$
DECLARE
  target    CONSTANT uuid := '1c709866-3daa-4a87-888b-0e571afa0826';
  sig_count integer;
  del_count integer;
BEGIN
  SELECT count(*) INTO sig_count FROM signatures WHERE document_id = target;
  IF sig_count <> 0 THEN
    RAISE EXCEPTION
      'ABORT (transaction rolled back): % signature rows attached — will not cascade-delete evidence',
      sig_count;
  END IF;

  WITH del AS (
    DELETE FROM documents
    WHERE id = target
      AND company_id = '00000000-0000-0000-0000-000000000001'  -- Bancroft only
    RETURNING id
  )
  SELECT count(*) INTO del_count FROM del;

  IF del_count <> 1 THEN
    RAISE EXCEPTION
      'ABORT (transaction rolled back): expected exactly 1 row deleted, got %',
      del_count;
  END IF;
END $$;

-- Verify before COMMIT — EXPECT 0 rows:
SELECT id FROM documents WHERE id = '1c709866-3daa-4a87-888b-0e571afa0826';

COMMIT;   -- ← only when the verify reads 0 rows; else ROLLBACK;

-- ── RESTORE (rollback-after-commit): re-insert the captured row verbatim ──
-- INSERT INTO documents (id, project_id, title, file_url, file_name, created_at, version, company_id)
-- VALUES (
--   '1c709866-3daa-4a87-888b-0e571afa0826',
--   '57994205-6b1e-4b93-89c4-4a9da8e26c4b',
--   'ML-BAN-XX-ZZ-MS-X-00005 REV - (Management of Deliveries)',
--   'https://pbyxpeaeijuxkzktvwbd.supabase.co/storage/v1/object/public/documents/57994205-6b1e-4b93-89c4-4a9da8e26c4b/e8e1d097-80cc-4dae-a958-106a243044b3.pdf',
--   'ML-BAN-XX-ZZ-MS-X-00005 REV - (Management of Deliveries) (1).pdf',
--   '2026-05-12T10:59:36.809657+00:00',
--   1,
--   '00000000-0000-0000-0000-000000000001'
-- );
