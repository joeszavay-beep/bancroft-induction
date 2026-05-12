-- Profile editing: audit log + email verification
-- Run in Supabase SQL Editor

-- Audit log for profile field changes
CREATE TABLE IF NOT EXISTS profile_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES operatives(id) ON DELETE CASCADE,
  edited_by TEXT NOT NULL,
  edited_by_id UUID,
  editor_role TEXT,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_worker ON profile_audit_log(worker_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON profile_audit_log(created_at DESC);

ALTER TABLE profile_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on profile_audit_log" ON profile_audit_log
  FOR ALL USING (true) WITH CHECK (true);

-- Pending email changes with verification tokens
CREATE TABLE IF NOT EXISTS pending_email_changes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  operative_id UUID NOT NULL REFERENCES operatives(id) ON DELETE CASCADE,
  old_email TEXT NOT NULL,
  new_email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  requested_by UUID,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  verified_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_email_token ON pending_email_changes(token);
CREATE INDEX IF NOT EXISTS idx_pending_email_operative ON pending_email_changes(operative_id);

ALTER TABLE pending_email_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on pending_email_changes" ON pending_email_changes
  FOR ALL USING (true) WITH CHECK (true);

-- Quick-access column so the UI can display pending state without a join
ALTER TABLE operatives ADD COLUMN IF NOT EXISTS pending_email TEXT;
