import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

const CID = 'a3a6b344-8394-4ca6-8f07-3011b4513bbe'
const PID = '68c8298f-cd1b-4a4d-9739-f7e902200c84'
const MANAGER_ID = '6153e96f-8ee2-451a-9a58-e61bd20e9e50'

// Sign in for RLS
await supabase.auth.signInWithPassword({ email: 'demo@coresite.io', password: 'Demo2026!' })

const today = new Date()
const day = (offset) => { const d = new Date(today); d.setDate(d.getDate() + offset); return d.toISOString() }

// Get all operatives
const { data: allOps } = await supabase.from('operatives').select('id, name').eq('company_id', CID)
console.log(`Found ${allOps.length} operatives`)

const talks = [
  { title: 'Electrical Isolation Procedures', desc: 'Safe isolation of electrical supplies before working on circuits. Lock-off procedures, use of voltage indicators, and proving dead. All operatives working on or near electrical systems must attend.', daysAgo: 18, closed: true },
  { title: 'Manual Handling on Site', desc: 'Correct lifting techniques for cable drums, containment, and equipment. Risk assessment for heavy items. When to use mechanical aids. Maximum carry weights and team lifts.', daysAgo: 16, closed: true },
  { title: 'Fire Safety & Emergency Evacuation', desc: 'Site fire procedures, muster point location, use of fire extinguishers. Emergency exit routes. What to do if you discover a fire. Assembly point: Ground floor courtyard.', daysAgo: 14, closed: true },
  { title: 'Working in Confined Spaces', desc: 'Risks of working in risers, ducts, and ceiling voids. Permit to work requirements. Ventilation checks. Lone working prohibition. Emergency rescue procedures.', daysAgo: 12, closed: true },
  { title: 'PPE Inspection & Compliance', desc: 'Daily PPE checks: hard hats for cracks, hi-vis for reflectivity, boots for sole integrity. When to replace damaged PPE. Correct eye protection for grinding and drilling. Face fit testing for dust masks.', daysAgo: 10, closed: true },
  { title: 'Cable Containment & Support Standards', desc: 'Maximum unsupported cable spans. Correct bracket spacing for tray, basket, and conduit. Fire barrier requirements at compartment walls. Labelling requirements.', daysAgo: 8, closed: true },
  { title: 'Asbestos Awareness', desc: 'What asbestos looks like and where it might be found in refurbishment projects. What to do if you suspect asbestos. Do not disturb — stop work, report immediately, evacuate the area.', daysAgo: 6, closed: true },
  { title: 'Hot Works Permit Procedure', desc: 'When hot works permits are needed: grinding, soldering, brazing, welding. Fire watch requirements — 60 minutes minimum after completion. Extinguisher placement. Notify site manager before starting.', daysAgo: 4, closed: true },
  { title: 'Ladder & Step Safety', desc: 'Following the near-miss incident on Level 2: ladders must be secured at top or footed. Three points of contact at all times. Maximum 30 minutes continuous use. Podium steps preferred for repetitive work.', daysAgo: 2, closed: true },
  { title: 'Housekeeping & Waste Management', desc: 'Keep work areas clear of debris and offcuts. Cable ties, packaging, and waste to be cleared at end of each shift. Segregate waste: metal, cardboard, general. Skip locations identified on site plan.', daysAgo: 0, closed: false },
]

console.log('\n--- Creating 10 Toolbox Talks ---')
const talkRecords = talks.map(t => ({
  company_id: CID, project_id: PID,
  title: t.title, description: t.desc,
  created_by: null,
  is_open: !t.closed,
  created_at: day(-t.daysAgo),
}))

const { data: insertedTalks, error: tErr } = await supabase.from('toolbox_talks').insert(talkRecords).select('id, title, created_at')
console.log(tErr ? `Error: ${tErr.message}` : `${insertedTalks.length} talks created`)

// Add signatures from operatives to each closed talk
console.log('\n--- Adding signatures ---')
let totalSigs = 0

for (const talk of (insertedTalks || [])) {
  const isClosed = talks.find(t => t.title === talk.title)?.closed

  // Random subset signs each talk (most workers, not all — realistic)
  const attendees = isClosed
    ? allOps.sort(() => Math.random() - 0.5).slice(0, 18 + Math.floor(Math.random() * 8)) // 18-25 of 27
    : allOps.sort(() => Math.random() - 0.5).slice(0, 5 + Math.floor(Math.random() * 5)) // 5-9 for open one

  const sigRecords = attendees.map((op, i) => {
    const signedAt = new Date(talk.created_at)
    signedAt.setMinutes(signedAt.getMinutes() + 2 + i * 1.5) // staggered signing times
    return {
      talk_id: talk.id,
      operative_id: op.id,
      operative_name: op.name,
      signed_at: signedAt.toISOString(),
    }
  })

  const { error: sErr } = await supabase.from('toolbox_signatures').insert(sigRecords)
  if (sErr) {
    console.log(`  ${talk.title}: Error — ${sErr.message}`)
  } else {
    console.log(`  ${talk.title}: ${sigRecords.length} signatures`)
    totalSigs += sigRecords.length
  }
}

console.log(`\n✅ Toolbox Talks seeded!`)
console.log(`  Talks: ${insertedTalks?.length || 0} (9 closed, 1 open)`)
console.log(`  Total signatures: ${totalSigs}`)
console.log(`  Avg attendance: ${Math.round(totalSigs / (insertedTalks?.length || 1))} per talk`)
