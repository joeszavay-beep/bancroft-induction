-- Migration: Operative-to-project many-to-many
-- Purpose: Allow operatives to be assigned to multiple projects
-- Run this in the Supabase SQL editor BEFORE deploying the code update.
--
-- Deploy order:
--   1. Run this SQL in Supabase SQL editor
--   2. Verify: SELECT count(*) FROM operative_projects
--      should equal: SELECT count(*) FROM operatives WHERE project_id IS NOT NULL
--   3. Push code

-- 1. Create junction table
CREATE TABLE IF NOT EXISTS operative_projects (
  operative_id UUID REFERENCES operatives(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (operative_id, project_id)
);

-- 2. RLS (matches existing wide-open pattern)
ALTER TABLE operative_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on operative_projects" ON operative_projects FOR ALL USING (true) WITH CHECK (true);

-- 3. Migrate existing assignments
INSERT INTO operative_projects (operative_id, project_id)
SELECT id, project_id FROM operatives WHERE project_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. Drop old column and index
DROP INDEX IF EXISTS idx_operatives_project;
ALTER TABLE operatives DROP COLUMN IF EXISTS project_id;
