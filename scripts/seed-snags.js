import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

const CID = 'a3a6b344-8394-4ca6-8f07-3011b4513bbe'
const PID = '68c8298f-cd1b-4a4d-9739-f7e902200c84'
const DWG1 = '6153d225-9e84-4dfb-b6ff-f79e736de6d3' // Level 1
const DWG2 = 'a5edb886-e32c-4f3f-805f-26c99352456c' // Level 3

const today = new Date()
const day = (offset) => { const d = new Date(today); d.setDate(d.getDate() + offset); return d.toISOString() }
const dateStr = (offset) => { const d = new Date(today); d.setDate(d.getDate() + offset); return d.toISOString().split('T')[0] }

const snags = [
  // ── COMPLETED (resolved properly, good stats) ──
  { n: 9, trade: 'Electrical', type: 'Installation', desc: 'Cable not clipped to containment in corridor B. Hanging loose between tray and back box.', status: 'completed', priority: 'medium', assigned: 'Ryan Kelly', drawing: DWG1, pin_x: 25, pin_y: 35, due: -8, created: -14 },
  { n: 10, trade: 'Electrical', type: 'Installation', desc: 'Back box not flush with plasterboard in Room 201. Protruding 5mm.', status: 'completed', priority: 'low', assigned: 'Darren Patel', drawing: DWG1, pin_x: 40, pin_y: 22, due: -5, created: -12 },
  { n: 11, trade: 'Pipework', type: 'Installation', desc: 'Pipe clip missing on horizontal run — Level 1 plant room. Unsupported span of 2m.', status: 'completed', priority: 'high', assigned: 'Nathan Brooks', drawing: DWG1, pin_x: 65, pin_y: 70, due: -10, created: -15 },
  { n: 12, trade: 'Ductwork', type: 'Installation', desc: 'Duct joint not sealed at Level 1 riser penetration. Air leakage audible.', status: 'completed', priority: 'high', assigned: 'Liam Cooper', drawing: DWG1, pin_x: 78, pin_y: 45, due: -6, created: -10 },
  { n: 13, trade: 'Electrical', type: 'Commissioning', desc: 'Emergency light not illuminating on test. Battery pack may be faulty.', status: 'completed', priority: 'high', assigned: 'James Wilson', drawing: DWG1, pin_x: 15, pin_y: 55, due: -4, created: -8 },
  { n: 14, trade: 'BMS', type: 'Commissioning', desc: 'Room temperature sensor reading 4°C above actual in Room 105. Needs recalibration.', status: 'completed', priority: 'medium', assigned: 'Jake Thompson', drawing: DWG1, pin_x: 52, pin_y: 38, due: -3, created: -7 },
  { n: 15, trade: 'Fire Alarm', type: 'Installation', desc: 'Smoke detector base plate not flush to ceiling tile. Gap visible.', status: 'completed', priority: 'low', assigned: 'Callum Ward', drawing: DWG1, pin_x: 33, pin_y: 62, due: -2, created: -6 },

  // ── OPEN (need attention) ──
  { n: 16, trade: 'Electrical', type: 'Installation', desc: 'Socket face plate cracked in Room 302. Replacement required.', status: 'open', priority: 'low', assigned: 'Daniel Evans', drawing: DWG2, pin_x: 20, pin_y: 30, due: 5, created: -3 },
  { n: 17, trade: 'Electrical', type: 'Installation', desc: 'Light switch at wrong height in corridor C — 1350mm instead of 1200mm per spec.', status: 'open', priority: 'medium', assigned: 'Ryan Kelly', drawing: DWG2, pin_x: 45, pin_y: 18, due: 3, created: -4 },
  { n: 18, trade: 'Pipework', type: 'Installation', desc: 'Valve label missing on LTHW flow at Level 3 riser. Cannot identify without label.', status: 'open', priority: 'low', assigned: 'Steve Clarke', drawing: DWG2, pin_x: 72, pin_y: 55, due: 7, created: -2 },
  { n: 19, trade: 'Ductwork', type: 'Design', desc: 'Ductwork clashing with structural beam at grid line F3. RFI raised with architect.', status: 'open', priority: 'high', assigned: 'Chris Morgan', drawing: DWG2, pin_x: 58, pin_y: 42, due: 2, created: -5 },
  { n: 20, trade: 'Electrical', type: 'Installation', desc: 'Cable tray support bracket loose at Level 3 east corridor. Needs re-fixing to soffit.', status: 'open', priority: 'high', assigned: 'Mark Robinson', drawing: DWG2, pin_x: 35, pin_y: 67, due: 1, created: -3 },
  { n: 21, trade: 'BMS', type: 'Commissioning', desc: 'FCU-12 not responding to BMS commands. Actuator may be wired incorrectly.', status: 'open', priority: 'medium', assigned: 'Kevin Price', drawing: DWG2, pin_x: 82, pin_y: 28, due: 4, created: -2 },
  { n: 22, trade: 'Fire Alarm', type: 'Installation', desc: 'Manual call point at Level 3 stairwell door not yet installed. Location marked.', status: 'open', priority: 'high', assigned: 'Tony Baker', drawing: DWG2, pin_x: 10, pin_y: 80, due: 0, created: -4 },

  // ── OVERDUE (red flags for performance) ──
  { n: 23, trade: 'Electrical', type: 'Installation', desc: 'Double socket behind kitchen unit inaccessible — unit installed too close to wall.', status: 'open', priority: 'high', assigned: 'Gary Simpson', drawing: DWG1, pin_x: 88, pin_y: 25, due: -5, created: -12 },
  { n: 24, trade: 'Pipework', type: 'Installation', desc: 'Isolation valve seized on Level 1 cold water main. Cannot close for maintenance.', status: 'open', priority: 'high', assigned: 'Nathan Brooks', drawing: DWG1, pin_x: 70, pin_y: 82, due: -3, created: -10 },
  { n: 25, trade: 'Electrical', type: 'Installation', desc: 'Containment lid missing at riser entry Level 1. Fire stopping cannot be completed.', status: 'open', priority: 'high', assigned: 'Peter Hall', drawing: DWG1, pin_x: 55, pin_y: 50, due: -7, created: -14 },

  // ── REASSIGNED ──
  { n: 26, trade: 'Electrical', type: 'Installation', desc: 'Wrong type of luminaire installed in meeting room 3A. Spec says recessed, installed surface.', status: 'reassigned', priority: 'medium', assigned: 'Darren Patel', drawing: DWG2, pin_x: 30, pin_y: 50, due: 3, created: -6 },

  // ── PENDING REVIEW ──
  { n: 27, trade: 'Pipework', type: 'Installation', desc: 'Radiator not level in Room 204 — tilted 10mm left to right. Brackets need adjusting.', status: 'pending_review', priority: 'low', assigned: 'Dave Russell', drawing: DWG1, pin_x: 42, pin_y: 75, due: -1, created: -5 },
  { n: 28, trade: 'Electrical', type: 'Commissioning', desc: 'RCD tripping intermittently on DB-3A circuit 7. Earth fault suspected downstream.', status: 'pending_review', priority: 'high', assigned: 'Daniel Evans', drawing: DWG2, pin_x: 62, pin_y: 15, due: -2, created: -7 },
]

console.log('--- Inserting 20 snags ---')
const snagRecords = snags.map(s => ({
  company_id: CID, project_id: PID, drawing_id: s.drawing,
  snag_number: s.n, trade: s.trade, type: s.type, description: s.desc,
  status: s.status, priority: s.priority, assigned_to: s.assigned,
  raised_by: 'Demo Manager', pin_x: s.pin_x, pin_y: s.pin_y,
  due_date: dateStr(s.due), created_at: day(s.created), updated_at: day(s.status === 'open' ? s.created : s.created + 3),
}))

const { data: inserted, error } = await supabase.from('snags').insert(snagRecords).select('id, snag_number, assigned_to, status')
console.log(error ? `Error: ${error.message}` : `${inserted.length} snags inserted`)

// Add realistic comments to each snag
console.log('\n--- Adding comments ---')
const comments = []
for (const snag of (inserted || [])) {
  const isCompleted = snag.status === 'completed'
  const isPending = snag.status === 'pending_review'
  const isOverdue = snag.status === 'open'

  // PM raises it
  comments.push({ snag_id: snag.id, comment: `Snag #${snag.snag_number} raised during site walkthrough. ${snag.assigned_to} — please attend to this.`, author_name: 'Demo Manager', author_role: 'PM', created_at: day(-10 + snag.snag_number % 5) })

  // Operative acknowledges
  comments.push({ snag_id: snag.id, comment: 'Noted. I\'ll get to this today.', author_name: snag.assigned_to, author_role: 'Operative', created_at: day(-9 + snag.snag_number % 5) })

  if (isCompleted) {
    comments.push({ snag_id: snag.id, comment: 'Work completed. Area cleaned and ready for inspection.', author_name: snag.assigned_to, author_role: 'Operative', created_at: day(-7 + snag.snag_number % 5) })
    comments.push({ snag_id: snag.id, comment: 'Inspected and approved. Good quality workmanship.', author_name: 'Demo Manager', author_role: 'PM', created_at: day(-6 + snag.snag_number % 5) })
  } else if (isPending) {
    comments.push({ snag_id: snag.id, comment: 'I believe this is now resolved. Completion photo submitted for your review.', author_name: snag.assigned_to, author_role: 'Operative', created_at: day(-2) })
  } else if (isOverdue) {
    comments.push({ snag_id: snag.id, comment: 'Still waiting on access / materials. Will update once sorted.', author_name: snag.assigned_to, author_role: 'Operative', created_at: day(-5 + snag.snag_number % 3) })
    comments.push({ snag_id: snag.id, comment: 'This is now overdue. Please prioritise.', author_name: 'Demo Manager', author_role: 'PM', created_at: day(-1) })
  } else {
    comments.push({ snag_id: snag.id, comment: 'Making progress on this. About 60% done.', author_name: snag.assigned_to, author_role: 'Operative', created_at: day(-4 + snag.snag_number % 3) })
  }
}

const { error: cErr } = await supabase.from('snag_comments').insert(comments)
console.log(cErr ? `Comments error: ${cErr.message}` : `${comments.length} comments added`)

// Also update existing snags 1-8 to have varied statuses for better performance stats
console.log('\n--- Updating existing snags for varied stats ---')
const { data: existing } = await supabase.from('snags').select('id, snag_number').eq('company_id', CID).lte('snag_number', 8).order('snag_number')
if (existing?.length) {
  // Make some completed, some open with varied dates
  for (const s of existing) {
    if (s.snag_number <= 4) {
      await supabase.from('snags').update({ status: 'completed', updated_at: day(-8 + s.snag_number) }).eq('id', s.id)
    } else if (s.snag_number === 5) {
      await supabase.from('snags').update({ status: 'open', due_date: dateStr(-2), priority: 'high' }).eq('id', s.id)
    }
  }
  console.log('Updated existing snags 1-8')
}

console.log('\n✅ Snags seeded!')
console.log('Summary:')
console.log('  Completed: 11 (snags 1-4, 9-15)')
console.log('  Open: 10 (snags 5, 16-22, 23-25 overdue)')
console.log('  Overdue: 4 (snags 5, 23, 24, 25)')
console.log('  Reassigned: 1 (snag 26)')
console.log('  Pending Review: 2 (snags 27, 28)')
console.log('  Total: 28 snags')
