-- =====================================================================
-- Add per-operative working hours (start_time / end_time)
--
-- WHAT THIS DOES:
-- Adds nullable start_time and end_time columns to the operatives table.
-- When set, these override the project-level start/end times for
-- attendance timing flags (late, early, overtime).
--
-- WHY:
-- Different operatives work different shifts (e.g. 06:30–15:00 vs
-- 08:00–16:00). Without per-operative times, everyone is measured
-- against the same project default, producing false late/early flags.
--
-- ROLLBACK:
-- ALTER TABLE operatives DROP COLUMN IF EXISTS start_time;
-- ALTER TABLE operatives DROP COLUMN IF EXISTS end_time;
--
-- RUN IN: Supabase SQL Editor
-- =====================================================================

ALTER TABLE operatives ADD COLUMN IF NOT EXISTS start_time text;
ALTER TABLE operatives ADD COLUMN IF NOT EXISTS end_time text;

COMMENT ON COLUMN operatives.start_time IS 'Custom shift start (HH:MM). Null = use project default.';
COMMENT ON COLUMN operatives.end_time IS 'Custom shift end (HH:MM). Null = use project default.';
