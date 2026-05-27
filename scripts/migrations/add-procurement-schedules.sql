-- Procurement Schedules table
-- Stores the full schedule (header, rules, rows) per project per company

CREATE TABLE IF NOT EXISTS procurement_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  header jsonb NOT NULL DEFAULT '{}',
  rules jsonb NOT NULL DEFAULT '{}',
  rows jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, project_id)
);

-- RLS
ALTER TABLE procurement_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view their schedules"
  ON procurement_schedules FOR SELECT
  USING (company_id = get_my_company_id());

CREATE POLICY "Company members can insert schedules"
  ON procurement_schedules FOR INSERT
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY "Company members can update their schedules"
  ON procurement_schedules FOR UPDATE
  USING (company_id = get_my_company_id());

CREATE POLICY "Company members can delete their schedules"
  ON procurement_schedules FOR DELETE
  USING (company_id = get_my_company_id());
