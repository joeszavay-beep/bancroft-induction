-- =====================================================================
-- Durable §5.19 (PR3) — one-time backfill of operatives.auth_user_id + left_at
--
-- WHAT: links existing operative records to their auth login and marks the two
-- non-active Joe records historical, so the §5.19 helpers (PR4 onward) can resolve
-- operative identity via auth.uid() instead of the forgeable user_metadata.
--
-- DERIVED FROM the read-only audit (scripts/audit-operative-auth-linkage.js +
-- focused checks, 2026-06-21) against the live 56 operatives / 52 auth users:
--   • 27 rows  — unique email matching exactly one auth user → AUTO-LINK (Write 1).
--                26 Thomas Worley workers + 1 E2E Test Co worker. Mapping is an
--                EXPLICIT (op_id → auth_user_id) VALUES list, not a live email-JOIN,
--                so the rows written are exactly the ones the read-only audit verified
--                — no apply-time matching that could behave differently.
--   • 26 rows  — ABC Construction Ltd, NO auth account → SKIPPED (link at setup;
--                confirmed demo/seed data). Stay active (left_at NULL), auth_user_id NULL.
--   •  3 rows  — Joe (manual resolution, owner-confirmed; Write 2 + Write 3):
--        0b5775d7  Thomas Worley Electrical  joe.szavay@icloud.com               → ACTIVE,
--                  auth_user_id = 87eccb3f (icloud login), left_at NULL.
--        269e5905  Bancroft LTD              joe.szavay@icloud.com               → HISTORICAL,
--                  left_at = now(), auth_user_id NULL (manager identity resolves via profiles).
--        507c6d52  ∅ (Szavay Property Group) joe.szavay@szavaypropertygroup.co.uk → HISTORICAL,
--                  left_at = now(), auth_user_id NULL (super-admin resolves via profiles/managers).
--
-- ⚠️  507c6d52 GOTCHA: its email (szavaypropertygroup.co.uk) differs from Joe's icloud
--     address and HAS its own confirmed auth account (d15cd22c), so the generic
--     "unique email + has auth" rule sweeps it into the auto-mappable set. It is
--     DELIBERATELY EXCLUDED from Write 1 and handled as historical in Write 3 — linking
--     it active would contradict the owner's resolution and give Joe a 2nd active identity.
--
-- LIFECYCLE RULE (owner-confirmed): compliance history is company-bound and does NOT
-- follow the person. The two historical rows are RETAINED intact, readable by their
-- company's managers; they are never followed by Joe's login. See
-- docs/durable-519-auth-user-id-plan.md §2 and AUDIT §5.22.
--
-- SAFE / ATOMIC: single transaction, all-or-nothing, one rollback point. Every UPDATE
-- is guarded (auth_user_id IS NULL / left_at IS NULL) so a re-run cannot overwrite an
-- existing link or re-stamp an already-historical row. The partial-unique index
-- operatives_active_auth_user_id_key (PR2) is the collision backstop — the in-txn
-- verify must read collisions=0 before COMMIT.
--
-- APPLY DELIBERATELY (single live DB, no staging) — same as PR2 / the lockdown:
--   1. DRY-RUN: run this file with COMMIT swapped to ROLLBACK. Read the verify grid.
--      Proceed ONLY if it reads EXACTLY:
--        collisions=0  active_linked=28  active_unlinked=26  historical=2  total=56
--      (active_linked = 27 auto + Joe's 0b5775d7; active_unlinked = the 26 ABC rows.)
--   2. APPLY: restore COMMIT and run. The verify grid must read the SAME numbers.
--   3. Post-commit verify (below, run separately).
-- ROLLBACK: scripts/migrations/rls-5-19-pr3-backfill-rollback.sql
-- =====================================================================

BEGIN;

-- ---- Write 1: AUTO-LINK the 27 unambiguous 1:1 rows (explicit verified mapping) ----
UPDATE operatives o
SET    auth_user_id = m.auth_user_id::uuid
FROM (VALUES
  ('1cd8a101-916a-4f91-8b44-f16469184938','7dd74945-3559-4fe9-9ff1-1b0e72f29cba'), -- e2e-worker@coresite.io
  ('41145098-8c89-4ead-bc9e-a6148046df4e','ee8f952e-625a-443f-8017-c7a62c8ef275'), -- donnyalfredfletcher@icloud.com
  ('825fa8cd-2d0d-47a1-8c20-ec03fb05bf86','7e95095d-e430-428f-99c4-1c61fdd5c73d'), -- colincameron25573colin@gmail.com
  ('7df47ac8-4007-4798-b12b-94291b4d3c54','ae14c50b-2152-4ef4-8341-1354aa6736c7'), -- lucaschiste14.afo@gmail.com
  ('4cb4d655-a494-45df-a899-929abc540f09','449f2763-9e01-44b6-ba42-d125590eb173'), -- alinionutserban@yahoo.com
  ('2acc211a-04c6-4dc0-954a-c12af4693979','8f2f018e-4994-47cc-af15-6b8024ad508e'), -- dragoshhel@gmail.com
  ('70fb8237-f688-425c-8cb2-09de5a8876a0','f0567644-cde9-491d-938d-78a91190cf18'), -- frankie.newman26@icloud.com
  ('6e1bd65b-b6ea-4e8b-9cc0-cd8f330651ea','28734c56-3fb5-4d03-b8b0-79fa7530cac3'), -- benharrington82@gmail.com
  ('bd4bfc8a-d66e-41d1-ad1e-53276bf7e3d0','7a44fe84-ee84-44af-9955-f36a39bd77cf'), -- bradleyrowlinson04@gmail.com
  ('31cf91de-514f-4877-803d-94d87314f5be','cbe24567-8f93-4ca8-bb75-42437c214606'), -- a.thomas642@btinternet.com
  ('d9b3b3be-1cff-498b-a99f-04446e566b28','ac9e32b3-fc82-45bd-a764-b1327f516496'), -- lutamihai6@gmail.com
  ('2a5f0575-8d5d-478c-a31e-2850ed556aac','af37758c-df79-4cf9-956b-f930778dbcf3'), -- digo.r.r@outlook.com
  ('fc7e6109-a94a-4018-b022-976e13a8c0a6','2f6e1f8e-a0c6-421c-a58f-41377a5338ae'), -- lewiswretham@gmail.com
  ('61f1dd10-5369-4509-84e9-a889bd94f384','629b9e0e-a7c7-4c9d-bd36-2d4680988ed2'), -- lukejtaylor95@hotmail.co.uk
  ('0e222037-cbc1-4991-8968-083e331b9f72','f1d4bffc-904a-4c68-bb1e-3c8234563a39'), -- florinstefania83@gmail.com
  ('c98f9ad6-8f4e-4a8c-b387-38dc6cc68266','e9b1f918-6b14-4a74-b5a3-08d5b67430c1'), -- rkrgreatorex@hotmail.com
  ('d76a1fd3-cdc2-4821-aa14-0b229999453a','f58f2462-8c74-4c18-8f9c-e1339996e1b6'), -- harry25755@gmail.com
  ('f7cbdd65-6ae5-491d-9733-7f5407870fa8','92ed4f42-0988-4d27-8d6b-413f48373338'), -- andreiraduly1989@yahoo.com
  ('57fbd17f-e528-4455-a1aa-874f203055b4','35af1005-9a8b-4535-9ad0-fd5c064021ad'), -- stephen.pendry@thomasworleyltd.co.uk
  ('571fde92-24f1-46c1-bab5-d2e3c508f48d','eaf2a03c-6249-40ee-bb1b-69f9cc9c4641'), -- j.sellek@outlook.com
  ('5a4bfd91-1be9-4cf5-a078-b3b173ccab51','e6157b03-b9d9-4d20-a101-8186ca661426'), -- joshuapacey@hotmail.com
  ('e77ad1aa-f1c7-4514-b000-649d26b9fa08','bd98d12e-ec50-4f14-8f78-83bbf2fdbf7e'), -- heshamelsawify@hotmail.com
  ('e08c4abc-f381-4407-9a6c-086187d2d7f6','c243aa6b-529e-4e67-9e82-d2feb3c94556'), -- cristian_purcarea@yahoo.co.uk
  ('4ef8022a-f06e-4dfd-af51-0a05bc2b1731','7f56479e-7f55-49fd-950f-54eac24738da'), -- francine_cullen@live.co.uk
  ('b0cc9065-b75b-434a-b0ab-68c27bc5ae45','440e60cf-e39f-4e60-9c35-071357cecb3a'), -- sean68mcdonagh@hotmail.com
  ('c1b05823-91bb-4aab-a198-b65957b451c3','fc6d6f4e-8ebf-4260-8e15-3ccfe19b7729'), -- gr.rowlinson7@gmail.com
  ('7a13a1f4-efef-41af-9948-30a1a5d84c76','878ea916-2c73-4a84-855d-da7323750fec')  -- paulrowlinson12@gmail.com
) AS m(op_id, auth_user_id)
WHERE o.id = m.op_id::uuid
  AND o.auth_user_id IS NULL          -- only currently-unlinked
  AND o.left_at IS NULL;              -- only active
-- expect: UPDATE 27

-- ---- Write 2: Joe ACTIVE — Thomas Worley operative linked to his icloud login ----
UPDATE operatives
SET    auth_user_id = '87eccb3f-07a8-4f8f-86d8-521f5531e8c9'   -- joe.szavay@icloud.com (confirmed)
WHERE  id = '0b5775d7-72e6-4bb8-82c8-6e646fee8d84'
  AND  auth_user_id IS NULL
  AND  left_at IS NULL;
-- expect: UPDATE 1

-- ---- Write 3: Joe HISTORICAL — Bancroft + Szavay PG rows marked left, never linked ----
UPDATE operatives
SET    left_at = now(), auth_user_id = NULL
WHERE  id IN ('269e5905-a615-428b-a62e-86327489f0c4',   -- Bancroft LTD (manager via profiles)
              '507c6d52-4d4e-498f-820c-20212fe9117f')   -- Szavay PG (super-admin via profiles/managers)
  AND  left_at IS NULL;
-- expect: UPDATE 2

-- ---- in-transaction VERIFY (uncommitted) — must read these EXACT values ----
SELECT 'collisions'      AS check, count(*)::text AS value FROM (
         SELECT auth_user_id FROM operatives
         WHERE left_at IS NULL AND auth_user_id IS NOT NULL
         GROUP BY auth_user_id HAVING count(*) > 1) x          -- expect 0
UNION ALL SELECT 'active_linked',   count(*)::text FROM operatives WHERE auth_user_id IS NOT NULL AND left_at IS NULL   -- expect 28
UNION ALL SELECT 'active_unlinked', count(*)::text FROM operatives WHERE auth_user_id IS NULL     AND left_at IS NULL   -- expect 26
UNION ALL SELECT 'historical',      count(*)::text FROM operatives WHERE left_at IS NOT NULL                            -- expect 2
UNION ALL SELECT 'total',           count(*)::text FROM operatives;                                                    -- expect 56

COMMIT;   -- ← swap to ROLLBACK for the dry-run; COMMIT to apply

-- ---- Post-apply verification (run separately) ----
-- 1) collisions must be 0 (the partial-unique guarantee held):
--   SELECT count(*) AS active_collisions FROM (
--     SELECT auth_user_id FROM operatives
--     WHERE left_at IS NULL AND auth_user_id IS NOT NULL
--     GROUP BY auth_user_id HAVING count(*) > 1) x;
-- 2) Joe's three rows landed as intended:
--   SELECT id, company_id, auth_user_id, left_at FROM operatives
--    WHERE id IN ('0b5775d7-72e6-4bb8-82c8-6e646fee8d84',
--                 '269e5905-a615-428b-a62e-86327489f0c4',
--                 '507c6d52-4d4e-498f-820c-20212fe9117f');
