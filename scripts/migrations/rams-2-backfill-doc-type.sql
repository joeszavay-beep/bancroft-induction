-- ═══ AS APPLIED 2026-07-02 (owner-run, COMMITTED + verified) ═══
-- The Supabase SQL editor does NOT reliably execute multi-statement
-- BEGIN…COMMIT scripts atomically (a mid-script verify SELECT observed
-- pre-update state), so the apply was run as a SINGLE self-contained DO
-- block: the same pinned-UUID UPDATE + expected_count guard below, plus the
-- V1–V4 verifies folded INSIDE the block as RAISE EXCEPTION guards (any
-- mismatch = automatic rollback; clean completion = commit). The dry-run
-- variant ended in a deliberate RAISE EXCEPTION carrying the verify numbers
-- in the message (rollback by construction). Dry-run read
-- 14 | 14 0 13 1 | 156/156 1 0 (all as expected); apply committed clean;
-- independent AFTER re-capture (service-role, separate session): 47/47
-- checks PASS — 14 docs doc_type='rams', per-doc signature counts identical
-- to the BEFORE capture, 156/156 TW signatures, 0 orphans, Bancroft
-- untouched. Use the single-DO pattern for ALL future manual applies.
-- ═══════════════════════════════════════════════════════════════
--
-- RAMS dedicated section — Phase 2 (DATA): flip the owner-approved documents
-- to doc_type='rams'. PROD CUSTOMER DATA — full ritual, every step manual.
-- Requires rams-1-documents-doc-type.sql applied first.
--
-- SCOPE (owner-approved 2026-07-02, live-introspection-verified):
--   • Thomas Worley Electrical LTD (87fc97b3-48e1-4a1e-a923-0ac6c2a23b08):
--     ALL 14 docs — RAMS-only tenant confirmed (13 Morgan Lewis method
--     statements + 1 Formula 1 method statement; 149 + 7 = 156 valid
--     signatures, 0 invalidated, every signature has an image).
--   • Bancroft LTD (00000000-0000-0000-0000-000000000001), project "Captain
--     Morgan": "Cable Pulling RAMS" (cce4827d…, 1 valid sig by Joseph Szavay
--     2026-04-21) — owner-decided 2026-07-02: NOT migrated. The attached file
--     is "Level 08 GA.pdf" (a GA drawing, not a RAMS) — April test residue;
--     it stays doc_type='general'. Its line below stays commented, kept only
--     as a record of the decision. The Bancroft copy of David's deliveries MS
--     (1c709866…, 0 sigs) is NOT in this list — owner-approved deliberate
--     DELETE via rams-2b-delete-bancroft-test-residue.sql.
--
-- WHAT THIS TOUCHES: documents.doc_type on the pinned ids below — nothing
-- else. `signatures` (FK signatures.document_id → documents.id, ON DELETE
-- CASCADE — hence this migration NEVER deletes) is not read or written;
-- signature survival is by construction, and STEP B/C verify it anyway.
-- Metadata columns (doc_ref/revision/review_date) are deliberately left NULL.
--
-- INVISIBLE UNTIL CODE DEPLOYS: currently-deployed code never reads doc_type,
-- so David's app is pixel-identical after COMMIT. The docs move to the Risk
-- Assessments section the moment the feature PR deploys.
--
-- RITUAL:
--   STEP A  — run the BEFORE capture (read-only) standalone; owner approves
--             the exact rows + counts on screen before anything else runs.
--   STEP B  — BEGIN; guarded DO block (raises = auto-rollback on any count
--             mismatch); in-transaction verifies V1–V4; COMMIT only if every
--             EXPECT reads exactly as stated, else ROLLBACK.
--   STEP C  — re-run STEP A standalone as the independent AFTER re-capture:
--             same 14 (or 15) ids, same per-doc signature counts, now
--             doc_type='rams'.

-- ════════════════════════════════════════════════════════════════════════
-- STEP A — BEFORE capture (read-only; also the STEP C AFTER re-capture)
-- ════════════════════════════════════════════════════════════════════════
-- EXPECT 14 rows, doc_type='general' in STEP A / 'rams' in STEP C.
-- Per-doc valid sigs (creation order):
--   Morgan Lewis: 14, 12, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 13
--   Formula 1: 7
-- Column totals: valid_sigs = 156, invalidated_sigs = 0.

SELECT d.id, c.name AS company, p.name AS project, d.title, d.file_name,
       d.version, d.doc_type, d.created_at,
       count(s.id) FILTER (WHERE NOT s.invalidated) AS valid_sigs,
       count(s.id) FILTER (WHERE s.invalidated)     AS invalidated_sigs
FROM documents d
JOIN companies c  ON c.id = d.company_id
LEFT JOIN projects p ON p.id = d.project_id
LEFT JOIN signatures s ON s.document_id = d.id
WHERE d.id IN (
  '1d08119a-c864-4966-9154-5558c6dfa4a0', -- ML MS-X-00005 Management of Deliveries (14 sigs)
  '140790b0-cba2-4866-98b2-5ce9f06e5eeb', -- ML MS-X-00002 Dead Live Testing Power On (12)
  '978abd79-21e3-4763-be16-a5ee44a5f154', -- ML MS-X-00014 Submains Cable Pulls & Terminations (11)
  'f1aae325-1f7c-4d74-822c-7a8a6d25c4cd', -- ML MS-X-00007 LL Containment (11)
  '1b4208d1-ad84-4dc9-9d31-cf1b0598da60', -- ML MS-X-00008 HL Containment (11)
  'a81a948a-f0b7-46af-a8ee-f8e259431419', -- ML MS-X-00009 Wall Containment (11)
  'b3c4e00c-02ef-49c7-b294-59f73dfd74ec', -- ML MS-X-00010 LL Cabling (11)
  '3820bd52-40e4-4ca8-914e-5422752d8842', -- ML MS-X-00011 HL Cabling (11)
  '74de31e1-92b3-44f7-97bd-f6026b11f6af', -- ML MS-X-00012 Distribution Board Installation (11)
  '938ae9c9-fdd7-4b2f-8fc6-863552580409', -- ML MS-X-00013 Second Fix (11)
  'a2962dad-9d9b-4797-a09f-b8a83ecd73b0', -- ML MS-X-00004 REV A Step Ladders (11)
  'b68a7df9-f3e4-4cd4-abb3-6b8f2701f5f0', -- ML MS-X-00020 Tap Off units (11)
  '71776c17-e494-4761-a116-d4e0bacb8542', -- ML MS-X-00021 Emergency Lighting (13)
  '2f1d685f-a9d8-4fb9-9f42-26dbd21008f3'  -- F1 BAN-MS-000 Low level power (7)
  -- , 'cce4827d-0fdd-479d-a752-7c246041a97f' -- Bancroft "Cable Pulling RAMS" — NOT migrated (owner 2026-07-02: test residue, file is a GA drawing)
)
GROUP BY d.id, c.name, p.name, d.title, d.file_name, d.version, d.doc_type, d.created_at
ORDER BY c.name, p.name, d.created_at;

-- Tenant-wide signature totals — must be IDENTICAL in the STEP C re-capture.
-- EXPECT: Thomas Worley 156 total / 156 valid; Bancroft 1 / 1.
SELECT c.name, s.company_id, count(*) AS total_sigs,
       count(*) FILTER (WHERE NOT s.invalidated) AS valid_sigs
FROM signatures s JOIN companies c ON c.id = s.company_id
WHERE s.company_id IN ('87fc97b3-48e1-4a1e-a923-0ac6c2a23b08',
                       '00000000-0000-0000-0000-000000000001')
GROUP BY c.name, s.company_id;

-- ════════════════════════════════════════════════════════════════════════
-- STEP B — guarded backfill (transaction; COMMIT is the last, manual word)
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  -- 14 = David's tenant only — FINAL (owner 2026-07-02: Bancroft's
  -- "Cable Pulling RAMS" is NOT migrated; its line stays commented).
  -- ⚠ If the pinned list ever changes, edit this in lockstep.
  expected_count CONSTANT integer := 14;
  updated_count  integer;
BEGIN
  WITH approved(id) AS (
    VALUES
      -- Thomas Worley Electrical — Morgan Lewis (13 docs, 149 sigs)
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
      -- Thomas Worley Electrical — Formula 1 (1 doc, 7 sigs)
      ('2f1d685f-a9d8-4fb9-9f42-26dbd21008f3'::uuid)
      -- Bancroft "Cable Pulling RAMS" — owner-decided 2026-07-02: NOT
      -- migrated (test residue; attached file is a GA drawing, and the
      -- section's invariant is "everything here is definitely a RAMS"):
      -- , ('cce4827d-0fdd-479d-a752-7c246041a97f'::uuid)
  ),
  upd AS (
    UPDATE documents d
    SET doc_type = 'rams'
    FROM approved a
    WHERE d.id = a.id
      AND d.doc_type = 'general'  -- re-runnable: already-flipped rows no-op
    RETURNING d.id
  )
  SELECT count(*) INTO updated_count FROM upd;

  IF updated_count <> expected_count THEN
    RAISE EXCEPTION
      'ABORT (transaction rolled back): expected % rows updated, got % — reconcile the pinned list / expected_count before retrying',
      expected_count, updated_count;
  END IF;

  RAISE NOTICE 'flipped % documents to doc_type=rams', updated_count;
END $$;

-- ── In-transaction verifies — COMMIT only if EVERY expect holds ──

-- V1: rams rows globally == expected_count, and all of them are David's
--     tenant. EXPECT: rams_total = 14, outside_approved_tenants = 0.
SELECT count(*) AS rams_total,
       count(*) FILTER (WHERE company_id NOT IN
         ('87fc97b3-48e1-4a1e-a923-0ac6c2a23b08',
          '00000000-0000-0000-0000-000000000001')) AS outside_approved_tenants
FROM documents
WHERE doc_type = 'rams';

-- V2: David's per-project split is exactly 13 Morgan Lewis + 1 Formula 1.
--     EXPECT two rows: (Morgan Lewis, 13), (Formula 1, 1).
SELECT p.name AS project, count(*) AS rams_docs
FROM documents d JOIN projects p ON p.id = d.project_id
WHERE d.doc_type = 'rams'
  AND d.company_id = '87fc97b3-48e1-4a1e-a923-0ac6c2a23b08'
GROUP BY p.name ORDER BY p.name;

-- V3: signatures untouched — identical to the STEP A totals.
--     EXPECT: Thomas Worley 156/156; Bancroft 1/1.
SELECT c.name, count(*) AS total_sigs,
       count(*) FILTER (WHERE NOT s.invalidated) AS valid_sigs
FROM signatures s JOIN companies c ON c.id = s.company_id
WHERE s.company_id IN ('87fc97b3-48e1-4a1e-a923-0ac6c2a23b08',
                       '00000000-0000-0000-0000-000000000001')
GROUP BY c.name;

-- V4: no signature lost its document — every signature in both tenants still
--     joins to a live documents row. EXPECT orphaned = 0.
SELECT count(*) AS orphaned
FROM signatures s LEFT JOIN documents d ON d.id = s.document_id
WHERE s.company_id IN ('87fc97b3-48e1-4a1e-a923-0ac6c2a23b08',
                       '00000000-0000-0000-0000-000000000001')
  AND d.id IS NULL;

COMMIT;   -- ← type this only when V1–V4 all read as expected; else ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════
-- STEP C — independent AFTER re-capture: re-run STEP A in a fresh query.
-- EXPECT: same ids, same per-doc valid/invalidated counts, doc_type='rams',
-- and the tenant signature totals unchanged (156/156, 1/1).
-- ════════════════════════════════════════════════════════════════════════
