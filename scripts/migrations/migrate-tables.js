import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.headers['x-migration-key'] !== 'CORESITE_MIGRATE_2026') {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const results = []

  // 1. Site Diary table
  try {
    const { error } = await supabase.rpc('exec_sql', { sql: '' }) // won't work, need raw SQL
  } catch {}

  // Since we can't run raw SQL via the API, return the SQL for manual execution
  const sql = `
-- Site Diary
CREATE TABLE IF NOT EXISTS site_diary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id),
  project_id uuid REFERENCES projects(id),
  date date NOT NULL,
  weather text DEFAULT 'sunny',
  temp_high integer,
  temp_low integer,
  workforce_count integer,
  subcontractors text,
  deliveries text,
  visitors text,
  delays text,
  incidents text,
  work_completed text,
  work_planned text,
  notes text,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE site_diary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_diary_all" ON site_diary USING (true);
CREATE INDEX IF NOT EXISTS idx_site_diary_company ON site_diary(company_id);
CREATE INDEX IF NOT EXISTS idx_site_diary_project ON site_diary(project_id);
CREATE INDEX IF NOT EXISTS idx_site_diary_date ON site_diary(date DESC);

-- Inspections
CREATE TABLE IF NOT EXISTS inspection_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id),
  name text NOT NULL,
  description text,
  category text,
  items jsonb NOT NULL DEFAULT '[]',
  created_by text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE inspection_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inspection_templates_all" ON inspection_templates USING (true);

CREATE TABLE IF NOT EXISTS inspections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id),
  project_id uuid REFERENCES projects(id),
  template_id uuid REFERENCES inspection_templates(id),
  template_name text,
  location text,
  inspector_name text,
  status text DEFAULT 'in_progress',
  results jsonb NOT NULL DEFAULT '[]',
  notes text,
  signature_url text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inspections_all" ON inspections USING (true);
CREATE INDEX IF NOT EXISTS idx_inspections_company ON inspections(company_id);
CREATE INDEX IF NOT EXISTS idx_inspections_project ON inspections(project_id);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id),
  user_id uuid,
  title text NOT NULL,
  body text,
  type text DEFAULT 'info',
  link text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_all" ON notifications USING (true);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);

-- Aftercare defects
CREATE TABLE IF NOT EXISTS aftercare_defects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id),
  project_id uuid REFERENCES projects(id),
  reported_by text NOT NULL,
  email text,
  phone text,
  unit_ref text,
  location text,
  description text NOT NULL,
  photo_url text,
  status text DEFAULT 'open',
  priority text DEFAULT 'medium',
  assigned_to text,
  notes text,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE aftercare_defects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aftercare_defects_all" ON aftercare_defects USING (true);
CREATE INDEX IF NOT EXISTS idx_aftercare_company ON aftercare_defects(company_id);
CREATE INDEX IF NOT EXISTS idx_aftercare_project ON aftercare_defects(project_id);

-- Worker certifications (add columns to operatives table)
ALTER TABLE operatives ADD COLUMN IF NOT EXISTS cscs_number text;
ALTER TABLE operatives ADD COLUMN IF NOT EXISTS cscs_expiry date;
ALTER TABLE operatives ADD COLUMN IF NOT EXISTS cscs_type text;
ALTER TABLE operatives ADD COLUMN IF NOT EXISTS ipaf_expiry date;
ALTER TABLE operatives ADD COLUMN IF NOT EXISTS pasma_expiry date;
ALTER TABLE operatives ADD COLUMN IF NOT EXISTS sssts_expiry date;
ALTER TABLE operatives ADD COLUMN IF NOT EXISTS smsts_expiry date;
ALTER TABLE operatives ADD COLUMN IF NOT EXISTS first_aid_expiry date;
ALTER TABLE operatives ADD COLUMN IF NOT EXISTS other_certs jsonb DEFAULT '[]';
  `

  return res.status(200).json({
    message: 'Run this SQL in your Supabase SQL Editor',
    sql,
  })
}
