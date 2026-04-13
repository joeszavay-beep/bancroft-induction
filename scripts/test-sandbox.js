import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

console.log('Step 1: Sign out...')
await supabase.auth.signOut().catch(() => {})

console.log('Step 2: Sign in as demo...')
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'demo@coresite.io',
  password: 'Demo2026!',
})
if (error) { console.error('AUTH ERROR:', error.message); process.exit(1) }
console.log('Signed in:', data.user.email)

console.log('Step 3: Load profile...')
const { data: profile, error: pErr } = await supabase
  .from('profiles')
  .select('*, companies(id, name, logo_url, primary_colour, secondary_colour, features)')
  .eq('id', data.user.id)
  .single()

if (pErr) { console.error('PROFILE ERROR:', pErr.message); process.exit(1) }
console.log('Profile:', profile.name, '| Company:', profile.companies?.name)

console.log('\n✅ All steps passed — sandbox should load fine')
