-- =====================================================================
-- Add floor plans for plant/equipment location tracking
--
-- WHAT THIS DOES:
-- 1. Creates project_floors table for defining floor levels per project
-- 2. Adds pin_x/pin_y to equipment_checks for floor plan pin placement
-- 3. Adds floor_plans_enabled to projects for opt-in toggle
--
-- WHY:
-- Managers need to see where equipment is on site. Operatives select
-- a floor from a dropdown and optionally drop a pin on a floor plan
-- during QR check-in.
--
-- ROLLBACK:
-- DROP TABLE IF EXISTS project_floors;
-- ALTER TABLE equipment_checks DROP COLUMN IF EXISTS pin_x;
-- ALTER TABLE equipment_checks DROP COLUMN IF EXISTS pin_y;
-- ALTER TABLE projects DROP COLUMN IF EXISTS floor_plans_enabled;
--
-- RUN IN: Supabase SQL Editor
-- =====================================================================

-- 1. Project floors table
CREATE TABLE IF NOT EXISTS project_floors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_project_floors_project ON project_floors(project_id);
CREATE INDEX IF NOT EXISTS idx_project_floors_company ON project_floors(company_id);

COMMENT ON TABLE project_floors IS 'Floor levels per project with optional floor plan images for equipment location tracking.';

-- 2. Pin position on equipment checks (0-100 percentage, nullable)
ALTER TABLE equipment_checks ADD COLUMN IF NOT EXISTS pin_x double precision;
ALTER TABLE equipment_checks ADD COLUMN IF NOT EXISTS pin_y double precision;

COMMENT ON COLUMN equipment_checks.pin_x IS 'Pin X position on floor plan (0-100%). Null = no pin placed.';
COMMENT ON COLUMN equipment_checks.pin_y IS 'Pin Y position on floor plan (0-100%). Null = no pin placed.';

-- 3. Floor plans toggle on projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS floor_plans_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN projects.floor_plans_enabled IS 'When true, operatives see floor plan pin-drop during equipment check-in.';

-- 4. RLS policies for project_floors
ALTER TABLE project_floors ENABLE ROW LEVEL SECURITY;

-- Anon can read (operatives need floors during QR check-in without auth JWT)
CREATE POLICY "pf_select" ON project_floors FOR SELECT USING (
  company_id = get_my_company_id()
  OR company_id = get_operative_company_id()
  OR auth.role() = 'anon'
);

CREATE POLICY "pf_insert" ON project_floors FOR INSERT WITH CHECK (
  company_id = get_my_company_id()
);

CREATE POLICY "pf_update" ON project_floors FOR UPDATE USING (
  company_id = get_my_company_id()
);

CREATE POLICY "pf_delete" ON project_floors FOR DELETE USING (
  company_id = get_my_company_id()
);

-- 5. Storage bucket for floor plan images
INSERT INTO storage.buckets (id, name, public) VALUES ('floor-plans', 'floor-plans', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "floor_plans_read" ON storage.objects FOR SELECT USING (bucket_id = 'floor-plans');
CREATE POLICY "floor_plans_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'floor-plans');
CREATE POLICY "floor_plans_delete" ON storage.objects FOR DELETE USING (bucket_id = 'floor-plans');
