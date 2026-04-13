import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

// Try deleting as anon first (catches anon-inserted records)
console.log('Deleting as anon...')
const { data: d1 } = await supabase.from('site_attendance').delete().eq('company_id', 'a3a6b344-8394-4ca6-8f07-3011b4513bbe').select('id')
console.log(`  Deleted: ${d1?.length || 0}`)

// Then as authenticated
await supabase.auth.signInWithPassword({ email: 'demo@coresite.io', password: 'Demo2026!' })
console.log('Deleting as demo user...')
const { data: d2 } = await supabase.from('site_attendance').delete().eq('company_id', 'a3a6b344-8394-4ca6-8f07-3011b4513bbe').select('id')
console.log(`  Deleted: ${d2?.length || 0}`)

// Check what's left
const { data: remaining } = await supabase.from('site_attendance').select('id').eq('company_id', 'a3a6b344-8394-4ca6-8f07-3011b4513bbe')
console.log(`Remaining: ${remaining?.length || 0}`)

await supabase.auth.signOut()
