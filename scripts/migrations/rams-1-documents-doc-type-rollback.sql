-- ROLLBACK for rams-1-documents-doc-type.sql.
--
-- ONLY safe BEFORE the feature code PR deploys — deployed code that reads
-- doc_type will error (42703 undefined_column) after the drop. Dropping the
-- columns also discards any Phase 2 backfill values and any manager-entered
-- doc_ref/revision/review_date metadata (re-runnable: rams-1 + rams-2 restore
-- the doc_type state; entered metadata is NOT recoverable — check
-- `SELECT count(*) FROM documents WHERE doc_ref IS NOT NULL OR revision IS
-- NOT NULL OR review_date IS NOT NULL;` reads 0 before dropping).

ALTER TABLE documents
  DROP COLUMN IF EXISTS doc_type,
  DROP COLUMN IF EXISTS doc_ref,
  DROP COLUMN IF EXISTS revision,
  DROP COLUMN IF EXISTS review_date;

-- Verify (EXPECT 0 rows):
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'documents'
  AND column_name IN ('doc_type', 'doc_ref', 'revision', 'review_date');
