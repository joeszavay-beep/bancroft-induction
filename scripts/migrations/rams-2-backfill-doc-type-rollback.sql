-- ROLLBACK for rams-2-backfill-doc-type.sql: flip the pinned ids back to
-- doc_type='general'. Safe to run any time, pre- or post-code-deploy —
-- post-deploy the docs simply reappear in the project Documents tab and
-- vanish from the Risk Assessments section / H&S RAMS register. Signatures
-- are untouched either way.
--
-- Keep the VALUES list + expected_count in lockstep with whatever was
-- actually applied (14, or 15 if the Bancroft line was included).

BEGIN;

DO $$
DECLARE
  expected_count CONSTANT integer := 14;  -- ⚠ match the applied backfill
  updated_count  integer;
BEGIN
  WITH approved(id) AS (
    VALUES
      ('1d08119a-c864-4966-9154-5558c6dfa4a0'::uuid),
      ('140790b0-cba2-4866-98b2-5ce9f06e5eeb'::uuid),
      ('978abd79-21e3-4763-be16-a5ee44a5f154'::uuid),
      ('f1aae325-1f7c-4d74-822c-7a8a6d25c4cd'::uuid),
      ('1b4208d1-ad84-4dc9-9d31-cf1b0598da60'::uuid),
      ('a81a948a-f0b7-46af-a8ee-f8e259431419'::uuid),
      ('b3c4e00c-02ef-49c7-b294-59f73dfd74ec'::uuid),
      ('3820bd52-40e4-4ca8-914e-5422752d8842'::uuid),
      ('74de31e1-92b3-44f7-97bd-f6026b11f6af'::uuid),
      ('938ae9c9-fdd7-4b2f-8fc6-863552580409'::uuid),
      ('a2962dad-9d9b-4797-a09f-b8a83ecd73b0'::uuid),
      ('b68a7df9-f3e4-4cd4-abb3-6b8f2701f5f0'::uuid),
      ('71776c17-e494-4761-a116-d4e0bacb8542'::uuid),
      ('2f1d685f-a9d8-4fb9-9f42-26dbd21008f3'::uuid)
      -- , ('cce4827d-0fdd-479d-a752-7c246041a97f'::uuid) -- only if it was flipped
  ),
  upd AS (
    UPDATE documents d
    SET doc_type = 'general'
    FROM approved a
    WHERE d.id = a.id
      AND d.doc_type = 'rams'
    RETURNING d.id
  )
  SELECT count(*) INTO updated_count FROM upd;

  IF updated_count <> expected_count THEN
    RAISE EXCEPTION
      'ABORT (transaction rolled back): expected % rows reverted, got %',
      expected_count, updated_count;
  END IF;
END $$;

-- Verify before COMMIT — EXPECT 0 if run before the feature PR deploys.
-- If run AFTER the feature is live, any remainder must be genuinely new
-- uploads made through the Risk Assessments section (inspect them before
-- committing — this rollback must only revert the migrated rows):
SELECT d.id, d.title, d.created_at, c.name AS company
FROM documents d JOIN companies c ON c.id = d.company_id
WHERE d.doc_type = 'rams';

COMMIT;   -- ← only when the remainder is explainable (0 pre-feature); else ROLLBACK;
