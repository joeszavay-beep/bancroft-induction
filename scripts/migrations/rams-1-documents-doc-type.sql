-- RAMS dedicated section — Phase 1 (SCHEMA): documents.doc_type discriminator
-- + nullable RAMS metadata columns (doc_ref / revision / review_date).
--
-- WHY: RAMS live in `documents` + `signatures` (the proven SignDocument flow:
-- canvas signature, DOB identity check, invalidate-on-reissue), but the H&S
-- report RAMS register reads the dead `document_hub` + `document_signoffs`
-- path — no app surface ever sets document_signoffs.status='signed' (AUDIT
-- §5.23). The dedicated Risk Assessment section keeps `documents` as the ONE
-- home and discriminates rows with `doc_type`; the register repoints to
-- documents+signatures. One source of truth, no second RAMS location that can
-- drift (the §2.16 lesson).
--
-- SAFETY: additive columns with a DEFAULT — instant on Postgres 11+ (metadata
-- only, no table rewrite) and invisible to deployed code (nothing selects or
-- writes doc_type until the feature PR lands). Metadata columns are nullable;
-- the Phase 2 backfill deliberately does NOT populate them (no title-parsing
-- guesswork on prod compliance records — managers fill them via the UI).
--
-- DEPLOY ORDER: this FIRST → rams-2 backfill → feature code PR.
-- RITUAL: dry-run the whole file inside BEGIN … ROLLBACK; inspect the verify
-- output; then run again with BEGIN … COMMIT; then re-run the verifies
-- standalone as the independent re-capture.

ALTER TABLE documents
  ADD COLUMN doc_type TEXT NOT NULL DEFAULT 'general'
    CONSTRAINT documents_doc_type_check CHECK (doc_type IN ('general', 'rams')),
  ADD COLUMN doc_ref TEXT,
  ADD COLUMN revision TEXT,
  ADD COLUMN review_date DATE;

-- ── Verify ──

-- V1: all four columns exist with the right shape (EXPECT 4 rows;
--     doc_type: text, NO, default 'general'::text; others nullable, no default):
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'documents'
  AND column_name IN ('doc_type', 'doc_ref', 'revision', 'review_date')
ORDER BY column_name;

-- V2: every existing row picked up the default (EXPECT total = general_count,
--     rams_count = 0 — as of 2026-07-02 introspection total = 22):
SELECT count(*)                                    AS total,
       count(*) FILTER (WHERE doc_type = 'general') AS general_count,
       count(*) FILTER (WHERE doc_type = 'rams')    AS rams_count
FROM documents;

-- V3: the CHECK constraint is enforced (EXPECT: this statement ERRORS with
--     23514 check_violation — run it ONLY in the BEGIN…ROLLBACK dry-run, as
--     the error aborts the transaction):
-- UPDATE documents SET doc_type = 'bogus' WHERE id = (SELECT id FROM documents LIMIT 1);
