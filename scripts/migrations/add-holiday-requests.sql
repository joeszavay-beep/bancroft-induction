-- Holiday Request Feature
-- Run in Supabase SQL Editor

-- Main holiday requests table
CREATE TABLE IF NOT EXISTS holiday_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  operative_id UUID NOT NULL REFERENCES operatives(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  approver_id UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_half_day BOOLEAN DEFAULT false,
  end_half_day BOOLEAN DEFAULT false,
  working_days NUMERIC(4,1) NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  reassigned_at TIMESTAMPTZ,
  reassigned_from UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holiday_requests_operative ON holiday_requests(operative_id, status);
CREATE INDEX IF NOT EXISTS idx_holiday_requests_approver ON holiday_requests(approver_id, status);
CREATE INDEX IF NOT EXISTS idx_holiday_requests_dates ON holiday_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_holiday_requests_company ON holiday_requests(company_id);

ALTER TABLE holiday_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on holiday_requests" ON holiday_requests
  FOR ALL USING (true) WITH CHECK (true);

-- Audit log for status changes
CREATE TABLE IF NOT EXISTS holiday_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  holiday_request_id UUID REFERENCES holiday_requests(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id UUID,
  actor_name TEXT,
  actor_role TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holiday_audit_request ON holiday_audit_log(holiday_request_id);

ALTER TABLE holiday_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on holiday_audit_log" ON holiday_audit_log
  FOR ALL USING (true) WITH CHECK (true);

-- Allowance fields on operatives
ALTER TABLE operatives ADD COLUMN IF NOT EXISTS annual_allowance_days INTEGER DEFAULT 28;
ALTER TABLE operatives ADD COLUMN IF NOT EXISTS allowance_year_start DATE;
