-- ============================================================
-- Plant & Equipment Module
-- Equipment register, pre-use checks, defect tracking
-- ============================================================

-- 1. Equipment register
CREATE TABLE IF NOT EXISTS equipment (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  description text NOT NULL,
  type text NOT NULL,
  serial_number text,
  hire_company text,
  on_hire_date date,
  off_hire_date date,
  daily_hire_rate numeric(10,2),
  status text NOT NULL DEFAULT 'In Service' CHECK (status IN ('In Service','Defective','Off-Site','Off-Hire')),
  inspection_interval_days integer NOT NULL DEFAULT 7,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_company ON equipment(company_id);
CREATE INDEX IF NOT EXISTS idx_equipment_project ON equipment(project_id);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);

-- 2. Pre-use check-in log
CREATE TABLE IF NOT EXISTS equipment_checks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id uuid NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  project_id uuid,
  operative_id uuid REFERENCES operatives(id) ON DELETE SET NULL,
  operative_name text NOT NULL,
  checklist jsonb NOT NULL DEFAULT '[]',
  all_passed boolean NOT NULL DEFAULT true,
  floor text,
  location text,
  notes text,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_checks_equipment ON equipment_checks(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_checks_date ON equipment_checks(checked_at);
CREATE INDEX IF NOT EXISTS idx_equipment_checks_operative ON equipment_checks(operative_id);

-- 3. Defect reports
CREATE TABLE IF NOT EXISTS equipment_defects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id uuid NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  reported_by_id uuid,
  reported_by_name text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('Minor','Major','Critical')),
  photo_url text,
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Resolved')),
  resolved_by_id uuid,
  resolved_by_name text,
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_defects_equipment ON equipment_defects(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_defects_status ON equipment_defects(status);

-- 4. Checklist templates (company_id NULL = system default)
CREATE TABLE IF NOT EXISTS equipment_checklist_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  equipment_type text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, equipment_type)
);

-- ============================================================
-- RLS Policies
-- ============================================================

-- equipment: company members CRUD, anon can read (for QR check-in page)
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipment_select" ON equipment FOR SELECT USING (company_id = get_my_company_id() OR auth.role() = 'anon');
CREATE POLICY "equipment_insert" ON equipment FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "equipment_update" ON equipment FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "equipment_delete" ON equipment FOR DELETE USING (company_id = get_my_company_id());

-- equipment_checks: company members read, anyone can insert (operative via QR)
ALTER TABLE equipment_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipment_checks_select" ON equipment_checks FOR SELECT USING (company_id = get_my_company_id() OR auth.role() = 'anon');
CREATE POLICY "equipment_checks_insert" ON equipment_checks FOR INSERT WITH CHECK (true);

-- equipment_defects: company members read + update, anyone can insert
ALTER TABLE equipment_defects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipment_defects_select" ON equipment_defects FOR SELECT USING (company_id = get_my_company_id() OR auth.role() = 'anon');
CREATE POLICY "equipment_defects_insert" ON equipment_defects FOR INSERT WITH CHECK (true);
CREATE POLICY "equipment_defects_update" ON equipment_defects FOR UPDATE USING (company_id = get_my_company_id());

-- checklist templates: anyone can read, company members manage
ALTER TABLE equipment_checklist_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_templates_select" ON equipment_checklist_templates FOR SELECT USING (true);
CREATE POLICY "checklist_templates_insert" ON equipment_checklist_templates FOR INSERT WITH CHECK (company_id = get_my_company_id());
CREATE POLICY "checklist_templates_update" ON equipment_checklist_templates FOR UPDATE USING (company_id = get_my_company_id());
CREATE POLICY "checklist_templates_delete" ON equipment_checklist_templates FOR DELETE USING (company_id = get_my_company_id());

-- ============================================================
-- Seed default checklist templates (company_id = NULL)
-- ============================================================

INSERT INTO equipment_checklist_templates (company_id, equipment_type, items) VALUES
  (NULL, 'MEWP - Scissor Lift', '["Outriggers / stabilisers deployed and locked","Guardrails secure and undamaged","Emergency lowering tested","Battery charge adequate","Ground conditions stable and level","Controls responsive and correct","Safety harness anchor points checked","No visible damage, leaks, or corrosion","Horn / alarm functional","Wheels / tyres in good condition"]'),
  (NULL, 'MEWP - Boom Lift', '["Outriggers / stabilisers deployed and locked","Guardrails secure and undamaged","Emergency lowering tested","Battery / fuel level adequate","Ground conditions stable and level","Controls responsive and correct","Safety harness anchor points checked","No visible damage, leaks, or corrosion","Horn / alarm functional","Boom sections move freely"]'),
  (NULL, 'MEWP - Cherry Picker', '["Outriggers / stabilisers deployed and locked","Guardrails and basket secure","Emergency lowering tested","Fuel / battery level adequate","Ground conditions stable and level","Controls responsive and correct","Safety harness anchor points checked","No visible damage, leaks, or corrosion"]'),
  (NULL, 'MEWP - Spider Lift', '["Outriggers deployed and locked","Guardrails and basket secure","Emergency lowering tested","Battery charge adequate","Ground conditions stable and level","Controls responsive and correct","Safety harness anchor points checked","No visible damage or leaks","Tracks / wheels in good condition"]'),
  (NULL, 'Scaffold Tower', '["Base plates or castors locked","All braces in place and secure","Platform boards secure with no gaps","Toe boards fitted","Guardrails at correct height","No visible damage or corrosion","Scaffold tag in date","Outriggers deployed if required"]'),
  (NULL, 'Podium', '["Platform locked in position","Wheels locked","Guardrails secure","No visible damage or cracks","Steps secure and non-slip"]'),
  (NULL, 'Step Ladder', '["Feet / rubber pads intact","No cracks, bends, or damage","Locking mechanism works","Rungs clean and non-slip","Correct height for task"]'),
  (NULL, 'Extension Ladder', '["Feet / rubber pads intact","No cracks, bends, or damage","Rung locks engage properly","Rungs clean and non-slip","Rope / pulley in good condition","Secured at top or footed by second person"]'),
  (NULL, 'Hop-Up Platform', '["Platform stable and level","No visible cracks or damage","Non-slip surface intact","Legs / feet secure"]'),
  (NULL, 'Hoist', '["Wire rope / chain in good condition","Hook and safety catch functional","Brakes working correctly","LOLER examination in date","SWL clearly marked","No visible damage or corrosion"]'),
  (NULL, 'Chain Block', '["Chain links undamaged","Hook and safety catch functional","Brakes hold load securely","LOLER examination in date","SWL clearly marked"]'),
  (NULL, 'Sling', '["No cuts, abrasion, or damage to webbing","Stitching intact","Label legible with SWL","LOLER examination in date","No knots or twists"]'),
  (NULL, 'Angle Grinder', '["Cable and plug undamaged","Guard in place and secure","Disc in good condition and correct type","Trigger / switch functional","PAT test in date","Handle secure"]'),
  (NULL, 'Drill', '["Cable and plug undamaged","Chuck tightens securely","Trigger / switch functional","PAT test in date","Guard in place if applicable"]'),
  (NULL, 'Temp Electrics', '["RCD tested and functional","Cables undamaged and routed safely","All connections secure","Distribution board door closes and locks","No signs of overheating or burning","Labels legible and correct","Earth bonding intact"]'),
  (NULL, 'Extension Lead', '["Cable undamaged along full length","Plug and socket undamaged","PAT test in date","No signs of overheating","Fully unwound when in use"]'),
  (NULL, 'Fire Extinguisher', '["Pin intact and sealed","Pressure gauge in green zone","No visible damage or corrosion","Service tag in date","Nozzle clear and undamaged","Correct type for area"]'),
  (NULL, 'Harness', '["Webbing undamaged — no cuts, fraying, or burns","Buckles and D-rings undamaged","Stitching intact","Label legible with inspection date","Thorough examination in date"]'),
  (NULL, 'Lanyard', '["Webbing / rope undamaged","Karabiners lock correctly","Shock absorber pack undamaged","Label legible with inspection date","Thorough examination in date"]'),
  (NULL, 'Generator', '["Fuel level adequate","Oil level checked","Exhaust clear and ventilated","Earth bonding intact","Output sockets functional","No visible damage or leaks"]'),
  (NULL, 'Other', '["General visual inspection passed","No visible damage","Safe to use"]')
ON CONFLICT (company_id, equipment_type) DO NOTHING;
