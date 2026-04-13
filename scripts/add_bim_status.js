import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

// Note: This needs to be run as SQL in Supabase SQL Editor:
// ALTER TABLE bim_elements ADD COLUMN IF NOT EXISTS status text DEFAULT 'not_verified';

console.log(`
Run this SQL in your Supabase SQL Editor:

ALTER TABLE bim_elements ADD COLUMN IF NOT EXISTS status text DEFAULT 'not_verified';
CREATE INDEX IF NOT EXISTS idx_bim_elements_status ON bim_elements(status);
`)
