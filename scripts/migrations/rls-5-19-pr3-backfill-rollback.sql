-- =====================================================================
-- ROLLBACK for the durable §5.19 (PR3) backfill (rls-5-19-pr3-backfill.sql)
--
-- Restores the PR2 clean slate (auth_user_id NULL, left_at NULL) for the 30 rows
-- the backfill touched: 27 auto-linked + Joe's 3 (0b5775d7 active link,
-- 269e5905 + 507c6d52 historical). PR2 verified all 56 rows had auth_user_id NULL
-- and left_at NULL beforehand, so nulling these two columns on these 30 ids fully
-- reverses PR3. SAFE to run only if no create-operative-account.js linking has
-- since written auth_user_id on any of these rows (none expected mid-rollout).
--
-- Scoped to the exact 30 touched ids so it cannot disturb any later-linked row.
-- Run inside BEGIN; … COMMIT; (dry-run with ROLLBACK first if desired).
-- =====================================================================

BEGIN;

UPDATE operatives SET auth_user_id = NULL, left_at = NULL
WHERE id IN (
  -- Joe (3)
  '0b5775d7-72e6-4bb8-82c8-6e646fee8d84','269e5905-a615-428b-a62e-86327489f0c4','507c6d52-4d4e-498f-820c-20212fe9117f',
  -- auto-linked (27)
  '1cd8a101-916a-4f91-8b44-f16469184938','41145098-8c89-4ead-bc9e-a6148046df4e','825fa8cd-2d0d-47a1-8c20-ec03fb05bf86',
  '7df47ac8-4007-4798-b12b-94291b4d3c54','4cb4d655-a494-45df-a899-929abc540f09','2acc211a-04c6-4dc0-954a-c12af4693979',
  '70fb8237-f688-425c-8cb2-09de5a8876a0','6e1bd65b-b6ea-4e8b-9cc0-cd8f330651ea','bd4bfc8a-d66e-41d1-ad1e-53276bf7e3d0',
  '31cf91de-514f-4877-803d-94d87314f5be','d9b3b3be-1cff-498b-a99f-04446e566b28','2a5f0575-8d5d-478c-a31e-2850ed556aac',
  'fc7e6109-a94a-4018-b022-976e13a8c0a6','61f1dd10-5369-4509-84e9-a889bd94f384','0e222037-cbc1-4991-8968-083e331b9f72',
  'c98f9ad6-8f4e-4a8c-b387-38dc6cc68266','d76a1fd3-cdc2-4821-aa14-0b229999453a','f7cbdd65-6ae5-491d-9733-7f5407870fa8',
  '57fbd17f-e528-4455-a1aa-874f203055b4','571fde92-24f1-46c1-bab5-d2e3c508f48d','5a4bfd91-1be9-4cf5-a078-b3b173ccab51',
  'e77ad1aa-f1c7-4514-b000-649d26b9fa08','e08c4abc-f381-4407-9a6c-086187d2d7f6','4ef8022a-f06e-4dfd-af51-0a05bc2b1731',
  'b0cc9065-b75b-434a-b0ab-68c27bc5ae45','c1b05823-91bb-4aab-a198-b65957b451c3','7a13a1f4-efef-41af-9948-30a1a5d84c76');
-- expect: UPDATE 30

-- verify reverted (run before COMMIT, or separately after):
--   SELECT count(*) FILTER (WHERE auth_user_id IS NOT NULL) AS linked,
--          count(*) FILTER (WHERE left_at      IS NOT NULL) AS historical
--   FROM operatives;   -- expect linked=0, historical=0 (PR2 clean slate)

COMMIT;
