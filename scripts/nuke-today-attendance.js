import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

await supabase.auth.signInWithPassword({ email: 'demo@coresite.io', password: 'Demo2026!' })

const CID = 'a3a6b344-8394-4ca6-8f07-3011b4513bbe'
const PID = '68c8298f-cd1b-4a4d-9739-f7e902200c84'
const todayStart = new Date(); todayStart.setHours(0,0,0,0)

// Delete ALL today's records
console.log('Deleting all of today\'s attendance...')
const { data: todayAll } = await supabase.from('site_attendance').select('id').eq('company_id', CID).gte('recorded_at', todayStart.toISOString())
console.log(`Found ${todayAll?.length} records to delete`)

for (const r of (todayAll || [])) {
  await supabase.from('site_attendance').delete().eq('id', r.id)
}

// Now insert exactly 20 clean sign-ins for today
const { data: allOps } = await supabase.from('operatives').select('id, name').eq('company_id', CID)
const todayWorkers = [...allOps].sort(() => Math.random() - 0.5).slice(0, 20)

const ips = ['192.168.1.101','192.168.1.103','192.168.1.105','10.0.0.51','10.0.0.53','31.94.32.78','86.150.12.44','81.107.3.12']
const records = []

for (const op of todayWorkers) {
  const inM = 20 + Math.floor(Math.random() * 20) // 07:20 - 07:39
  const signIn = new Date(todayStart)
  signIn.setHours(7, inM, Math.floor(Math.random() * 60))
  records.push({
    company_id: CID, project_id: PID,
    operative_id: op.id, operative_name: op.name,
    type: 'sign_in', method: 'qr',
    recorded_at: signIn.toISOString(),
    ip_address: ips[Math.floor(Math.random() * ips.length)],
    latitude: 53.4808 + (Math.random() - 0.5) * 0.001,
    longitude: -2.2426 + (Math.random() - 0.5) * 0.001,
  })
}

const { error } = await supabase.from('site_attendance').insert(records)
console.log(error ? `Insert error: ${error.message}` : `Inserted ${records.length} clean sign-ins`)

// Verify
const { data: verify } = await supabase.from('site_attendance').select('id, type').eq('company_id', CID).gte('recorded_at', todayStart.toISOString())
console.log(`\nToday now: ${verify?.length} records (${verify?.filter(r => r.type === 'sign_in').length} sign-ins, ${verify?.filter(r => r.type === 'sign_out').length} sign-outs)`)

await supabase.auth.signOut()
