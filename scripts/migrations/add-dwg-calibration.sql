-- =====================================================================
-- Add DWG calibration data to progress_drawings
--
-- WHAT THIS DOES:
-- Stores the two-point calibration and layer selection used when
-- auto-placing progress items from a DWG file.
--
-- WHY:
-- DWG auto-detect maps fixture coordinates to the progress drawing.
-- The calibration is saved so items can be re-mapped if needed.
--
-- ROLLBACK:
-- ALTER TABLE progress_drawings DROP COLUMN IF EXISTS dwg_calibration;
--
-- RUN IN: Supabase SQL Editor
-- =====================================================================

ALTER TABLE progress_drawings ADD COLUMN IF NOT EXISTS dwg_calibration JSONB DEFAULT NULL;

COMMENT ON COLUMN progress_drawings.dwg_calibration IS 'Two-point calibration + layer selection for DWG auto-detect. Null = no DWG mapping.';
