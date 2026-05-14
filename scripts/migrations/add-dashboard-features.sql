-- Dashboard Features Migration
-- Adds: project key dates, incidents table, activity_feed table
-- Run in Supabase SQL Editor

-- ============================================================
-- 1. PROJECT KEY DATES
-- ============================================================
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS practical_completion_date DATE,
  ADD COLUMN IF NOT EXISTS practical_completion_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS practical_completion_completed_by TEXT;

-- ============================================================
-- 2. INCIDENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS incidents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  project_id UUID NOT NULL,
  incident_date DATE NOT NULL,
  incident_type TEXT NOT NULL CHECK (incident_type IN ('near_miss', 'first_aid', 'reportable', 'dangerous_occurrence', 'environmental', 'other')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  description TEXT NOT NULL DEFAULT '',
  reported_by TEXT,
  reported_by_id UUID,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "incidents_company_access" ON incidents
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM manager_profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM operatives WHERE id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_incidents_project_date
  ON incidents (project_id, incident_date DESC);

CREATE INDEX IF NOT EXISTS idx_incidents_company
  ON incidents (company_id);

-- ============================================================
-- 3. ACTIVITY FEED TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_feed (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  project_id UUID,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  actor_name TEXT,
  actor_id UUID,
  actor_photo_url TEXT,
  link TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_feed_company_access" ON activity_feed
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM manager_profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM operatives WHERE id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_activity_feed_company_created
  ON activity_feed (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_feed_project_created
  ON activity_feed (project_id, created_at DESC);

-- Prevent future incident dates
ALTER TABLE incidents
  ADD CONSTRAINT incidents_date_not_future
  CHECK (incident_date <= CURRENT_DATE);
