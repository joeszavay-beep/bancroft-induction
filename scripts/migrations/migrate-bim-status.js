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
-- Add status column to bim_elements
ALTER TABLE bim_elements ADD COLUMN IF NOT EXISTS status text DEFAULT 'not_verified';
CREATE INDEX IF NOT EXISTS idx_bim_elements_status ON bim_elements(status);
  `

  return res.status(200).json({ message: 'Run this SQL in Supabase SQL Editor', sql })
}
