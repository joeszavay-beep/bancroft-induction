-- =====================================================================
-- ROLLBACK for add-progress-item-counts-rpc.sql
--
-- Drops the per-drawing aggregation RPC. Additive migration — nothing
-- else depends on it server-side. After running this, revert the
-- front-end commit so ProgressDrawingsList stops calling the RPC.
--
-- RUN IN: Supabase SQL Editor
-- =====================================================================

DROP FUNCTION IF EXISTS public.get_progress_item_counts();
