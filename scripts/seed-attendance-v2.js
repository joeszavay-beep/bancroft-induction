import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

await supabase.auth.signInWithPassword({ email: 'demo@coresite.io', password: 'Demo2026!' })

const CID = 'a3a6b344-8394-4ca6-8f07-3011b4513bbe'
const PID = '68c8298f-cd1b-4a4d-9739-f7e902200c84'

// Clear all old attendance
console.log('Clearing old attendance...')
await supabase.from('site_attendance').delete().eq('company_id', CID)

const { data: allOps } = await supabase.from('operatives').select('id, name').eq('company_id', CID)
console.log(`${allOps.length} operatives`)

const today = new Date()
const records = []

const ips = [
  '192.168.1.101', '192.168.1.102', '192.168.1.103', '192.168.1.104', '192.168.1.105',
  '192.168.1.106', '192.168.1.107', '192.168.1.108', '192.168.1.109', '192.168.1.110',
  '10.0.0.51', '10.0.0.52', '10.0.0.53', '10.0.0.54', '10.0.0.55',
  '31.94.32.78', '31.94.32.80', '86.150.12.44', '86.150.12.45', '81.107.3.12',
]

for (let dayOffset = -29; dayOffset <= -1; dayOffset++) {
  const d = new Date(today)
  d.setDate(d.getDate() + dayOffset)
  if (d.getDay() === 0 || d.getDay() === 6) continue

  // Pick 18-24 unique workers for this day
  const shuffled = [...allOps].sort(() => Math.random() - 0.5)
  const count = 18 + Math.floor(Math.random() * 7)
  const todayWorkers = shuffled.slice(0, Math.min(count, allOps.length))

  for (let w = 0; w < todayWorkers.length; w++) {
    const op = todayWorkers[w]
    const ip = ips[Math.floor(Math.random() * ips.length)]
    const rand = Math.random()

    // ONE sign-in per worker per day
    let inH, inM
    if (rand < 0.08) {
      // Late: 07:42 - 08:05
      inH = 7; inM = 42 + Math.floor(Math.random() * 23)
      if (inM >= 60) { inH = 8; inM -= 60 }
    } else if (rand < 0.15) {
      // Early bird: 07:00 - 07:19
      inH = 7; inM = Math.floor(Math.random() * 20)
    } else {
      // On time: 07:20 - 07:39
      inH = 7; inM = 20 + Math.floor(Math.random() * 20)
    }

    const signIn = new Date(d)
    signIn.setHours(inH, inM, Math.floor(Math.random() * 60))
    const isLate = (inH * 60 + inM) > (7 * 60 + 40)

    records.push({
      company_id: CID, project_id: PID,
      operative_id: op.id, operative_name: op.name,
      type: 'sign_in', method: 'qr',
      recorded_at: signIn.toISOString(),
      ip_address: ip,
      latitude: 53.4808 + (Math.random() - 0.5) * 0.001,
      longitude: -2.2426 + (Math.random() - 0.5) * 0.001,
      notes: isLate ? `Late — arrived at ${String(inH).padStart(2,'0')}:${String(inM).padStart(2,'0')}` : null,
    })

    // ONE sign-out per worker per day
    const outRand = Math.random()
    let outH, outM, method = 'qr', notes = null

    if (outRand < 0.04) {
      // 4% forgot — auto sign out at 23:59
      outH = 23; outM = 59; method = 'auto'
      notes = 'Automatic sign-out at end of day'
    } else if (outRand < 0.10) {
      // 6% early: 14:30 - 16:19
      outH = 14 + Math.floor(Math.random() * 2); outM = 30 + Math.floor(Math.random() * 30)
      if (outH === 16) outM = Math.min(outM, 19)
      notes = `Early — left at ${String(outH).padStart(2,'0')}:${String(outM).padStart(2,'0')}`
    } else if (outRand < 0.18) {
      // 8% overtime: 16:41 - 17:30
      outH = 16; outM = 41 + Math.floor(Math.random() * 49)
      if (outM >= 60) { outH = 17; outM -= 60 }
      notes = `Overtime — left at ${String(outH).padStart(2,'0')}:${String(outM).padStart(2,'0')}`
    } else {
      // 82% normal: 16:20 - 16:40
      outH = 16; outM = 20 + Math.floor(Math.random() * 20)
    }

    const signOut = new Date(d)
    signOut.setHours(outH, outM, Math.floor(Math.random() * 60))

    records.push({
      company_id: CID, project_id: PID,
      operative_id: op.id, operative_name: op.name,
      type: 'sign_out', method,
      recorded_at: signOut.toISOString(),
      ip_address: ip,
      latitude: 53.4808 + (Math.random() - 0.5) * 0.001,
      longitude: -2.2426 + (Math.random() - 0.5) * 0.001,
      notes,
    })
  }
}

// Today: some workers signed in, no sign-outs yet (it's during the day)
const todayWorkers = [...allOps].sort(() => Math.random() - 0.5).slice(0, 20)
for (const op of todayWorkers) {
  const ip = ips[Math.floor(Math.random() * ips.length)]
  const inM = 20 + Math.floor(Math.random() * 20)
  const signIn = new Date(today)
  signIn.setHours(7, inM, Math.floor(Math.random() * 60))

  records.push({
    company_id: CID, project_id: PID,
    operative_id: op.id, operative_name: op.name,
    type: 'sign_in', method: 'qr',
    recorded_at: signIn.toISOString(),
    ip_address: ip,
    latitude: 53.4808 + (Math.random() - 0.5) * 0.001,
    longitude: -2.2426 + (Math.random() - 0.5) * 0.001,
    notes: null,
  })
}

// Insert in batches
console.log(`\nInserting ${records.length} records...`)
for (let i = 0; i < records.length; i += 200) {
  const batch = records.slice(i, i + 200)
  const { error } = await supabase.from('site_attendance').insert(batch)
  if (error) { console.error(`Batch ${i}: ${error.message}`); break }
  process.stdout.write('.')
}

const signIns = records.filter(r => r.type === 'sign_in')
const late = records.filter(r => r.notes?.startsWith('Late')).length
const early = records.filter(r => r.notes?.startsWith('Early')).length
const overtime = records.filter(r => r.notes?.startsWith('Overtime')).length
const auto = records.filter(r => r.method === 'auto').length
const days = new Set(records.map(r => r.recorded_at.split('T')[0])).size

console.log(`\n\n✅ Done!`)
console.log(`  ${days} days | ${records.length} records | ${signIns.length} sign-ins`)
console.log(`  Late: ${late} | Early: ${early} | Overtime: ${overtime} | Auto: ${auto}`)
console.log(`  Avg workers/day: ${Math.round(signIns.length / days)}`)
console.log(`  Today: ${todayWorkers.length} on site (no sign-outs yet)`)

await supabase.auth.signOut()
