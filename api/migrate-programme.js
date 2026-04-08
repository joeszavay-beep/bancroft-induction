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
-- Design Drawings — uploaded DXF files with parsed metadata
CREATE TABLE IF NOT EXISTS design_drawings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id),
  project_id uuid REFERENCES projects(id),
  name text NOT NULL,
  file_url text NOT NULL,
  file_size bigint,
  units text DEFAULT 'mm',
  scale_factor numeric DEFAULT 0.001,
  status text DEFAULT 'processing',
  uploaded_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE design_drawings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "design_drawings_select" ON design_drawings FOR SELECT USING (true);
CREATE POLICY "design_drawings_insert" ON design_drawings FOR INSERT WITH CHECK (true);
CREATE POLICY "design_drawings_update" ON design_drawings FOR UPDATE USING (true);
CREATE POLICY "design_drawings_delete" ON design_drawings FOR DELETE USING (true);
CREATE INDEX IF NOT EXISTS idx_design_drawings_project ON design_drawings(project_id);

-- Drawing Layers — extracted layers from DXF with calculated lengths
CREATE TABLE IF NOT EXISTS drawing_layers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  drawing_id uuid REFERENCES design_drawings(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id),
  layer_name text NOT NULL,
  entity_count integer DEFAULT 0,
  total_length_metres numeric DEFAULT 0,
  geometry_data jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE drawing_layers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drawing_layers_select" ON drawing_layers FOR SELECT USING (true);
CREATE POLICY "drawing_layers_insert" ON drawing_layers FOR INSERT WITH CHECK (true);
CREATE POLICY "drawing_layers_update" ON drawing_layers FOR UPDATE USING (true);
CREATE POLICY "drawing_layers_delete" ON drawing_layers FOR DELETE USING (true);
CREATE INDEX IF NOT EXISTS idx_drawing_layers_drawing ON drawing_layers(drawing_id);

-- Programme Activities — named activities linked to drawing layers
CREATE TABLE IF NOT EXISTS programme_activities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id),
  project_id uuid REFERENCES projects(id),
  name text NOT NULL,
  package text,
  floor text,
  zone text,
  subcontractor text,
  planned_start_date date,
  planned_completion_date date,
  baseline_length_metres numeric DEFAULT 0,
  drawing_layer_id uuid REFERENCES drawing_layers(id) ON DELETE SET NULL,
  design_drawing_id uuid REFERENCES design_drawings(id) ON DELETE SET NULL,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE programme_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "programme_activities_select" ON programme_activities FOR SELECT USING (true);
CREATE POLICY "programme_activities_insert" ON programme_activities FOR INSERT WITH CHECK (true);
CREATE POLICY "programme_activities_update" ON programme_activities FOR UPDATE USING (true);
CREATE POLICY "programme_activities_delete" ON programme_activities FOR DELETE USING (true);
CREATE INDEX IF NOT EXISTS idx_programme_activities_project ON programme_activities(project_id);

-- Markup Lines — user-drawn progress lines on drawings
CREATE TABLE IF NOT EXISTS markup_lines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  design_drawing_id uuid REFERENCES design_drawings(id) ON DELETE CASCADE,
  programme_activity_id uuid REFERENCES programme_activities(id) ON DELETE SET NULL,
  company_id uuid REFERENCES companies(id),
  coordinates jsonb NOT NULL,
  colour text DEFAULT 'green',
  real_world_length_metres numeric DEFAULT 0,
  created_by text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE markup_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "markup_lines_select" ON markup_lines FOR SELECT USING (true);
CREATE POLICY "markup_lines_insert" ON markup_lines FOR INSERT WITH CHECK (true);
CREATE POLICY "markup_lines_update" ON markup_lines FOR UPDATE USING (true);
CREATE POLICY "markup_lines_delete" ON markup_lines FOR DELETE USING (true);
CREATE INDEX IF NOT EXISTS idx_markup_lines_drawing ON markup_lines(design_drawing_id);
CREATE INDEX IF NOT EXISTS idx_markup_lines_activity ON markup_lines(programme_activity_id);

-- Progress Snapshots — historical progress records for trending
CREATE TABLE IF NOT EXISTS progress_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  programme_activity_id uuid REFERENCES programme_activities(id) ON DELETE CASCADE,
  snapshot_date date DEFAULT CURRENT_DATE,
  installed_length_metres numeric DEFAULT 0,
  percentage_complete numeric DEFAULT 0,
  rate_metres_per_week numeric DEFAULT 0,
  forecast_completion_date date,
  status text DEFAULT 'on_track',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE progress_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "progress_snapshots_select" ON progress_snapshots FOR SELECT USING (true);
CREATE POLICY "progress_snapshots_insert" ON progress_snapshots FOR INSERT WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_activity ON progress_snapshots(programme_activity_id);
  `

  try {
    const { error } = await supabase.rpc('exec_sql', { sql })
    if (error) {
      const statements = sql.split(';').filter(s => s.trim())
      const results = []
      for (const stmt of statements) {
        const { error: e } = await supabase.rpc('exec_sql', { sql: stmt + ';' })
        results.push({ sql: stmt.trim().slice(0, 60), error: e?.message || 'OK' })
      }
      return res.status(200).json({ fallback: true, results })
    }
    return res.status(200).json({ success: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
