import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.headers['x-migration-key'] !== 'CORESITE_MIGRATE_2026') {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const sql = `
-- BIM Models — stores uploaded IFC file metadata
CREATE TABLE IF NOT EXISTS bim_models (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id),
  project_id uuid REFERENCES projects(id),
  name text NOT NULL,
  file_url text NOT NULL,
  file_size bigint,
  ifc_schema text,
  element_count integer DEFAULT 0,
  status text DEFAULT 'processing',
  uploaded_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE bim_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bim_models_select" ON bim_models FOR SELECT USING (true);
CREATE POLICY "bim_models_insert" ON bim_models FOR INSERT WITH CHECK (
  company_id = get_my_company_id() OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
);
CREATE POLICY "bim_models_update" ON bim_models FOR UPDATE USING (
  company_id = get_my_company_id() OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
);
CREATE POLICY "bim_models_delete" ON bim_models FOR DELETE USING (
  company_id = get_my_company_id()
);
CREATE INDEX IF NOT EXISTS idx_bim_models_project ON bim_models(project_id);
CREATE INDEX IF NOT EXISTS idx_bim_models_company ON bim_models(company_id);

-- BIM Elements — extracted MEP elements from IFC models
CREATE TABLE IF NOT EXISTS bim_elements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id uuid REFERENCES bim_models(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id),
  project_id uuid REFERENCES projects(id),
  ifc_id bigint,
  global_id text,
  ifc_type text NOT NULL,
  name text,
  description text,
  category text NOT NULL,
  system_type text,
  floor_name text,
  x numeric,
  y numeric,
  z numeric,
  properties jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE bim_elements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bim_elements_select" ON bim_elements FOR SELECT USING (true);
CREATE POLICY "bim_elements_insert" ON bim_elements FOR INSERT WITH CHECK (
  company_id = get_my_company_id() OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
);
CREATE POLICY "bim_elements_delete" ON bim_elements FOR DELETE USING (
  company_id = get_my_company_id()
);
CREATE INDEX IF NOT EXISTS idx_bim_elements_model ON bim_elements(model_id);
CREATE INDEX IF NOT EXISTS idx_bim_elements_project ON bim_elements(project_id);
CREATE INDEX IF NOT EXISTS idx_bim_elements_category ON bim_elements(category);
CREATE INDEX IF NOT EXISTS idx_bim_elements_floor ON bim_elements(floor_name);

-- BIM Drawing Calibration — two-point mapping from IFC coords to drawing pixels
CREATE TABLE IF NOT EXISTS bim_drawing_calibration (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  drawing_id uuid REFERENCES drawings(id) ON DELETE CASCADE,
  model_id uuid REFERENCES bim_models(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id),
  point1_ifc_x numeric NOT NULL,
  point1_ifc_y numeric NOT NULL,
  point1_draw_x numeric NOT NULL,
  point1_draw_y numeric NOT NULL,
  point2_ifc_x numeric NOT NULL,
  point2_ifc_y numeric NOT NULL,
  point2_draw_x numeric NOT NULL,
  point2_draw_y numeric NOT NULL,
  floor_name text,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(drawing_id, model_id)
);
ALTER TABLE bim_drawing_calibration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bim_calibration_select" ON bim_drawing_calibration FOR SELECT USING (true);
CREATE POLICY "bim_calibration_insert" ON bim_drawing_calibration FOR INSERT WITH CHECK (
  company_id = get_my_company_id()
);
CREATE POLICY "bim_calibration_update" ON bim_drawing_calibration FOR UPDATE USING (
  company_id = get_my_company_id()
);
CREATE POLICY "bim_calibration_delete" ON bim_drawing_calibration FOR DELETE USING (
  company_id = get_my_company_id()
);

-- Add bim_element_id to snags table for asset linking
ALTER TABLE snags ADD COLUMN IF NOT EXISTS bim_element_id uuid REFERENCES bim_elements(id);
CREATE INDEX IF NOT EXISTS idx_snags_bim_element ON snags(bim_element_id);
  `

  return res.status(200).json({
    message: 'Run this SQL in your Supabase SQL Editor',
    sql,
  })
}
