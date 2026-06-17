-- =====================================================================
-- Durable §5.19 (PR2) — add operatives.auth_user_id + left_at + active-unique index
--
-- WHAT: anchors operative identity to the auth user (auth_user_id FK) and adds an
-- active/historical lifecycle marker (left_at). The partial unique index enforces
-- "one ACTIVE operative record per auth login" while allowing a retained historical
-- trail (left_at set) and any number of not-yet-linked rows (auth_user_id NULL).
--
-- WHY NON-CONCURRENT: this table is tiny (58 rows) and the partial index covers
-- ZERO rows at creation (auth_user_id is all-NULL until the PR3 backfill), so the
-- build is instant and the lock negligible. Keeping it non-concurrent means the
-- WHOLE migration stays inside one transaction → it can be dry-run with
-- BEGIN; … ROLLBACK; and applied with BEGIN; … COMMIT;, exactly like the lockdown
-- and the §5.19 interim. (CREATE INDEX CONCURRENTLY cannot run in a transaction.)
--
-- INVISIBLE TO LIVE SESSIONS: the RLS helpers do not read these columns until PR4
-- (dual-accept). This migration is pure additive prep — no behaviour change.
--
-- ORDERING: apply this to prod BEFORE deploying the create-operative-account.js
-- change (which writes auth_user_id). The code must not reach prod before the column.
--
-- APPLY (Supabase SQL editor): pre-check (columns/index absent) → run with COMMIT
-- swapped to ROLLBACK (dry-run) → restore COMMIT and run (apply) → verify.
-- ROLLBACK:
--   DROP INDEX IF EXISTS operatives_active_auth_user_id_key;
--   ALTER TABLE operatives DROP COLUMN IF EXISTS auth_user_id, DROP COLUMN IF EXISTS left_at;
-- =====================================================================

BEGIN;

ALTER TABLE operatives
  ADD COLUMN IF NOT EXISTS auth_user_id uuid
      REFERENCES auth.users(id) ON DELETE SET NULL,   -- delete of the auth user UNLINKS; never deletes the compliance record
  ADD COLUMN IF NOT EXISTS left_at timestamptz;        -- NULL = active; set = historical (no marker existed before)

-- One ACTIVE operative identity per auth login. Historical rows (left_at set) and
-- not-yet-linked rows (auth_user_id NULL) are excluded from the uniqueness check.
CREATE UNIQUE INDEX IF NOT EXISTS operatives_active_auth_user_id_key
  ON operatives (auth_user_id)
  WHERE auth_user_id IS NOT NULL AND left_at IS NULL;

-- In-transaction sanity (read-only). Expect linked = 0 and historical = 0 right now:
--   SELECT count(*) FILTER (WHERE auth_user_id IS NOT NULL) AS linked,
--          count(*) FILTER (WHERE left_at      IS NOT NULL) AS historical
--   FROM operatives;

COMMIT;   -- ← swap to ROLLBACK for the dry-run; COMMIT to apply

-- Post-apply verification (run separately):
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_name='operatives' AND column_name IN ('auth_user_id','left_at');
--   SELECT indexdef FROM pg_indexes WHERE indexname='operatives_active_auth_user_id_key';
--   SELECT conname, confrelid::regclass FROM pg_constraint
--    WHERE conrelid='operatives'::regclass AND contype='f' AND conname LIKE '%auth_user_id%';
