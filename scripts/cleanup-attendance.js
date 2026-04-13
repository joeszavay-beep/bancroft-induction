import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

await supabase.auth.signInWithPassword({ email: 'demo@coresite.io', password: 'Demo2026!' })

const CID = 'a3a6b344-8394-4ca6-8f07-3011b4513bbe'

// Check what's there
const { data: all } = await supabase.from('site_attendance').select('id, recorded_at, type, operative_name').eq('company_id', CID).order('recorded_at', { ascending: false }).limit(10)
console.log('Latest records:', all?.length)
all?.forEach(r => console.log(`  ${r.recorded_at.split('T')[0]} ${r.recorded_at.split('T')[1].slice(0,5)} ${r.type} ${r.operative_name}`))

// Count today's
const todayStart = new Date(); todayStart.setHours(0,0,0,0)
const { data: todayRecs } = await supabase.from('site_attendance').select('id, type, operative_id').eq('company_id', CID).gte('recorded_at', todayStart.toISOString())
console.log(`\nToday: ${todayRecs?.length} records`)
const signIns = todayRecs?.filter(r => r.type === 'sign_in') || []
const signOuts = todayRecs?.filter(r => r.type === 'sign_out') || []
console.log(`  Sign-ins: ${signIns.length}`)
console.log(`  Sign-outs: ${signOuts.length}`)

// Check for duplicates
const opIds = signIns.map(r => r.operative_id)
const unique = new Set(opIds)
console.log(`  Unique operatives: ${unique.size}`)
if (opIds.length !== unique.size) {
  console.log('  ⚠ DUPLICATES FOUND')
  // Find and delete duplicates — keep only the first sign-in per operative
  const seen = new Set()
  const toDelete = []
  for (const r of signIns) {
    if (seen.has(r.operative_id)) {
      toDelete.push(r.id)
    } else {
      seen.add(r.operative_id)
    }
  }
  if (toDelete.length > 0) {
    console.log(`  Deleting ${toDelete.length} duplicate sign-ins...`)
    for (const id of toDelete) {
      await supabase.from('site_attendance').delete().eq('id', id)
    }
    console.log('  Done')
  }
}

// Also check for sign-outs today that shouldn't be there
if (signOuts.length > 0) {
  console.log(`  Deleting ${signOuts.length} sign-outs (workers should still be on site)...`)
  for (const r of signOuts) {
    await supabase.from('site_attendance').delete().eq('id', r.id)
  }
  console.log('  Done')
}

// Recount
const { data: final } = await supabase.from('site_attendance').select('id, type').eq('company_id', CID).gte('recorded_at', todayStart.toISOString())
console.log(`\nAfter cleanup: ${final?.length} records today (${final?.filter(r => r.type === 'sign_in').length} sign-ins)`)

await supabase.auth.signOut()
