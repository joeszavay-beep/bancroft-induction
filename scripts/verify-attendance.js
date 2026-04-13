import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)
await supabase.auth.signInWithPassword({ email: 'demo@coresite.io', password: 'Demo2026!' })
const todayStart = new Date(); todayStart.setHours(0,0,0,0)
const { data } = await supabase.from('site_attendance').select('type, operative_name, ip_address').eq('company_id', 'a3a6b344-8394-4ca6-8f07-3011b4513bbe').gte('recorded_at', todayStart.toISOString()).order('recorded_at')
const ins = data?.filter(r => r.type === 'sign_in') || []
const outs = data?.filter(r => r.type === 'sign_out') || []
console.log(`Today: ${ins.length} sign-ins, ${outs.length} sign-outs`)
console.log(`All have IPs: ${ins.every(r => r.ip_address) ? 'YES' : 'NO'}`)
console.log(`On site: ${ins.length - outs.length}`)
await supabase.auth.signOut()
