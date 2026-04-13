import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

// Auth for RLS
await supabase.auth.signInWithPassword({ email: 'demo@coresite.io', password: 'Demo2026!' })

const CID = 'a3a6b344-8394-4ca6-8f07-3011b4513bbe'
const PID = '68c8298f-cd1b-4a4d-9739-f7e902200c84'

// Delete old attendance data first
console.log('Clearing old attendance...')
await supabase.from('site_attendance').delete().eq('company_id', CID)

// Get all operatives
const { data: allOps } = await supabase.from('operatives').select('id, name').eq('company_id', CID)
console.log(`${allOps.length} operatives`)

const today = new Date()
const records = []

// IP pool — realistic site IPs
const ips = [
  '192.168.1.101', '192.168.1.102', '192.168.1.103', '192.168.1.104', '192.168.1.105',
  '192.168.1.106', '192.168.1.107', '192.168.1.108', '192.168.1.109', '192.168.1.110',
  '10.0.0.51', '10.0.0.52', '10.0.0.53', '10.0.0.54', '10.0.0.55',
  '172.16.0.21', '172.16.0.22', '172.16.0.23', '172.16.0.24', '172.16.0.25',
  '31.94.32.78', '31.94.32.80', '86.150.12.44', '86.150.12.45', '81.107.3.12',
]

// Start: 07:30, End: 16:30, Grace: 10 min
const START_H = 7, START_M = 30
const END_H = 16, END_M = 30

for (let dayOffset = -29; dayOffset <= 0; dayOffset++) {
  const d = new Date(today)
  d.setDate(d.getDate() + dayOffset)

  // Skip weekends
  if (d.getDay() === 0 || d.getDay() === 6) continue

  // Random subset of workers each day (18-25 of 27)
  const todayWorkers = [...allOps].sort(() => Math.random() - 0.5).slice(0, 18 + Math.floor(Math.random() * 8))

  for (const op of todayWorkers) {
    const ip = ips[Math.floor(Math.random() * ips.length)]
    const rand = Math.random()

    // Sign in time
    let inH, inM
    if (rand < 0.08) {
      // 8% — Late (after 07:40)
      inH = 7; inM = 41 + Math.floor(Math.random() * 30) // 07:41 - 08:10
      if (inM >= 60) { inH = 8; inM -= 60 }
    } else if (rand < 0.15) {
      // 7% — Early (before 07:20)
      inH = 6; inM = 30 + Math.floor(Math.random() * 50) // 06:30 - 07:19
      if (inM >= 60) { inH = 7; inM -= 60 }
    } else {
      // 85% — On time (07:20 - 07:40)
      inH = 7; inM = 20 + Math.floor(Math.random() * 20) // 07:20 - 07:39
    }

    const signIn = new Date(d)
    signIn.setHours(inH, inM, Math.floor(Math.random() * 60))

    const isLate = (inH * 60 + inM) > (START_H * 60 + START_M + 10)

    records.push({
      company_id: CID, project_id: PID,
      operative_id: op.id, operative_name: op.name,
      type: 'sign_in', method: 'qr',
      recorded_at: signIn.toISOString(),
      ip_address: ip,
      latitude: 53.4808 + (Math.random() - 0.5) * 0.002,
      longitude: -2.2426 + (Math.random() - 0.5) * 0.002,
      notes: isLate ? `Late — arrived at ${String(inH).padStart(2,'0')}:${String(inM).padStart(2,'0')}` : null,
    })

    // Sign out
    const outRand = Math.random()
    let outH, outM, method = 'qr'

    if (outRand < 0.05) {
      // 5% — Forgot to sign out (auto at 23:59)
      outH = 23; outM = 59; method = 'auto'
    } else if (outRand < 0.12) {
      // 7% — Left early (before 16:20)
      outH = 14 + Math.floor(Math.random() * 2); outM = Math.floor(Math.random() * 60)
    } else if (outRand < 0.20) {
      // 8% — Stayed over (after 16:40)
      outH = 16 + Math.floor(Math.random() * 3); outM = 41 + Math.floor(Math.random() * 19)
      if (outM >= 60) { outH++; outM -= 60 }
    } else {
      // 80% — Normal (16:20 - 16:40)
      outH = 16; outM = 20 + Math.floor(Math.random() * 20)
    }

    const signOut = new Date(d)
    signOut.setHours(outH, outM, Math.floor(Math.random() * 60))

    const isEarly = (outH * 60 + outM) < (END_H * 60 + END_M - 10)
    const isOvertime = (outH * 60 + outM) > (END_H * 60 + END_M + 10)

    records.push({
      company_id: CID, project_id: PID,
      operative_id: op.id, operative_name: op.name,
      type: 'sign_out', method,
      recorded_at: signOut.toISOString(),
      ip_address: ip,
      latitude: 53.4808 + (Math.random() - 0.5) * 0.002,
      longitude: -2.2426 + (Math.random() - 0.5) * 0.002,
      notes: method === 'auto' ? 'Automatic sign-out at end of day'
        : isEarly ? `Early — left at ${String(outH).padStart(2,'0')}:${String(outM).padStart(2,'0')}`
        : isOvertime ? `Overtime — left at ${String(outH).padStart(2,'0')}:${String(outM).padStart(2,'0')}`
        : null,
    })
  }
}

// Insert in batches of 200
console.log(`\nInserting ${records.length} attendance records...`)
for (let i = 0; i < records.length; i += 200) {
  const batch = records.slice(i, i + 200)
  const { error } = await supabase.from('site_attendance').insert(batch)
  if (error) { console.error(`Batch ${i}: ${error.message}`); break }
  console.log(`  Batch ${i}-${i + batch.length}: OK`)
}

// Stats
const signIns = records.filter(r => r.type === 'sign_in')
const lateCount = signIns.filter(r => r.notes?.startsWith('Late')).length
const earlyOuts = records.filter(r => r.type === 'sign_out' && r.notes?.startsWith('Early')).length
const overtime = records.filter(r => r.type === 'sign_out' && r.notes?.startsWith('Overtime')).length
const autoOuts = records.filter(r => r.method === 'auto').length
const workDays = new Set(records.map(r => r.recorded_at.split('T')[0])).size

console.log(`\n✅ Attendance seeded!`)
console.log(`  Days: ${workDays}`)
console.log(`  Total records: ${records.length}`)
console.log(`  Sign-ins: ${signIns.length}`)
console.log(`  Late arrivals: ${lateCount}`)
console.log(`  Early departures: ${earlyOuts}`)
console.log(`  Overtime: ${overtime}`)
console.log(`  Auto sign-outs: ${autoOuts}`)
console.log(`  Avg workers/day: ${Math.round(signIns.length / workDays)}`)

await supabase.auth.signOut()
