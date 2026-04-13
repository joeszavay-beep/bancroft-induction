// Run the SQL below in your Supabase SQL Editor

export default async function handler(req, res) {
  const sql = `
-- Site Attendance
CREATE TABLE IF NOT EXISTS site_attendance (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES companies(id),
  project_id uuid REFERENCES projects(id),
  operative_id uuid REFERENCES operatives(id),
  operative_name text NOT NULL,
  type text NOT NULL CHECK (type IN ('sign_in', 'sign_out')),
  recorded_at timestamptz DEFAULT now(),
  ip_address text,
  latitude double precision,
  longitude double precision,
  method text DEFAULT 'qr',
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE site_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_attendance_all" ON site_attendance USING (true);
CREATE INDEX IF NOT EXISTS idx_attendance_company ON site_attendance(company_id);
CREATE INDEX IF NOT EXISTS idx_attendance_project ON site_attendance(project_id);
CREATE INDEX IF NOT EXISTS idx_attendance_operative ON site_attendance(operative_id);
CREATE INDEX IF NOT EXISTS idx_attendance_recorded ON site_attendance(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_type ON site_attendance(type);
  `
  return res.status(200).json({ message: 'Run this SQL in Supabase SQL Editor', sql })
}
