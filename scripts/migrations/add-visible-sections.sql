-- Role-based section visibility
-- Run in Supabase SQL Editor

ALTER TABLE managers ADD COLUMN IF NOT EXISTS visible_sections TEXT[];
