-- Programme Calculator
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS project_calendar_settings (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  working_days TEXT[] DEFAULT '{"mon","tue","wed","thu","fri"}',
  use_uk_bank_holidays BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_non_working_periods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS uk_bank_holidays (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  name TEXT NOT NULL,
  division TEXT DEFAULT 'england-and-wales',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date, division)
);

CREATE TABLE IF NOT EXISTS programme_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  duration INTEGER NOT NULL CHECK (duration > 0),
  end_date DATE NOT NULL,
  calendar_mode TEXT NOT NULL DEFAULT 'monday_start_working_days',
  trade TEXT,
  assigned_to_user_id UUID,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by_user_id UUID
);

CREATE INDEX IF NOT EXISTS idx_programme_tasks_project ON programme_tasks(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_non_working_project ON project_non_working_periods(project_id);
CREATE INDEX IF NOT EXISTS idx_bank_holidays_date ON uk_bank_holidays(date);

ALTER TABLE project_calendar_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_non_working_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE uk_bank_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE programme_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON project_calendar_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON project_non_working_periods FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON uk_bank_holidays FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON programme_tasks FOR ALL USING (true) WITH CHECK (true);
