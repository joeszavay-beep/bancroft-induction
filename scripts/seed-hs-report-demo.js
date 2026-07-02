import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

await supabase.auth.signInWithPassword({ email: 'demo@coresite.io', password: 'Demo2026!' })

const CID = 'a3a6b344-8394-4ca6-8f07-3011b4513bbe'
const PID = '68c8298f-cd1b-4a4d-9739-f7e902200c84' // Riverside Tower - Phase 1

// Get operatives
const { data: ops } = await supabase.from('operatives').select('id, name, role').eq('company_id', CID)
console.log(`${ops.length} operatives`)

// This week: Monday 20 Apr to Sunday 26 Apr 2026
const weekStart = new Date('2026-04-20T00:00:00Z')

// ─── 1. TOOLBOX TALKS ───────────────────────────────────────────
console.log('Seeding toolbox talks...')

const talks = [
  { title: 'Working at Height — Scaffold Safety', topic: 'Working at Height', notes: 'Covered scaffold inspection procedures, harness checks, and exclusion zones. All operatives reminded to inspect scaffold tags before use.' },
  { title: 'Manual Handling — Heavy Conduit Runs', topic: 'Manual Handling', notes: 'Discussed correct lifting technique for 50mm heavy gauge conduit. Team lifting required for lengths over 3m. Kinetic handling refresher.' },
  { title: 'Fire Safety & Emergency Evacuation', topic: 'Fire Safety', notes: 'Weekly fire point locations reviewed. Assembly point confirmed as south car park. Fire warden rotation updated.' },
  { title: 'Electrical Isolation Procedures', topic: 'Electrical Safety', notes: 'Lock-out/tag-out procedure demonstrated on Level 8 DB. All electricians to carry personal padlocks. Permit to work required for all live working.' },
  { title: 'PPE Compliance — Eye Protection', topic: 'PPE', notes: 'Safety glasses now mandatory in all riser rooms following near-miss incident on Level 6. Issued replacement safety glasses to 4 operatives.' },
]

for (let i = 0; i < talks.length; i++) {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + i)
  d.setHours(7, 30, 0)

  const { data: talk, error: tErr } = await supabase.from('toolbox_talks').insert({
    company_id: CID,
    project_id: PID,
    title: talks[i].title,
    description: talks[i].notes,
    is_open: false,
    created_at: d.toISOString(),
  }).select().single()

  if (tErr) { console.error('Talk error:', tErr.message); continue }

  // Sign 8-12 random operatives per talk
  const signers = [...ops].sort(() => Math.random() - 0.5).slice(0, 8 + Math.floor(Math.random() * 5))
  const sigs = signers.map(op => ({
    talk_id: talk.id,
    operative_id: op.id,
    operative_name: op.name,
    signed_at: new Date(d.getTime() + 5 * 60000 + Math.random() * 10 * 60000).toISOString(),
  }))
  await supabase.from('toolbox_signatures').insert(sigs)
}
console.log(`  ${talks.length} talks with signatures`)

// ─── 2. RAMS DOCUMENTS ──────────────────────────────────────────
console.log('Seeding RAMS documents...')

const ramsDocs = [
  { title: 'Electrical First Fix — Containment & Wiring', reference: 'RAMS-EL-001', version: 3 },
  { title: 'Working at Height — Mobile Scaffold Towers', reference: 'RAMS-WAH-002', version: 2 },
  { title: 'Fire Alarm Installation — Level 5-8', reference: 'RAMS-FA-003', version: 1 },
  { title: 'BMS Controls Installation', reference: 'RAMS-BMS-004', version: 2 },
  { title: 'Emergency Lighting Installation', reference: 'RAMS-EL-005', version: 1 },
  { title: 'Cable Pulling — Riser Vertical Runs', reference: 'RAMS-CP-006', version: 1 },
  { title: 'Commissioning & Testing — DB Panels', reference: 'RAMS-CT-007', version: 2 },
  { title: 'Mechanical Pipework — Hot & Cold', reference: 'RAMS-MP-008', version: 1 },
  { title: 'Ductwork Installation — AHU to Diffusers', reference: 'RAMS-DW-009', version: 1 },
  { title: 'Access Equipment — MEWP & Podium Steps', reference: 'RAMS-AE-010', version: 2 },
]

// RAMS live in the dedicated Risk Assessments section: documents rows with
// doc_type='rams', signed via the standard signatures flow. (The old
// document_hub category='RAMS' + document_signoffs path is retired — the
// report no longer reads it.)
for (const doc of ramsDocs) {
  const { data: ramsDoc, error: rErr } = await supabase.from('documents').insert({
    company_id: CID,
    project_id: PID,
    title: doc.title,
    doc_type: 'rams',
    doc_ref: doc.reference,
    revision: `P0${doc.version}`,
    version: doc.version,
    review_date: '2026-07-20',
    file_url: null,
    file_name: null,
  }).select().single()

  if (rErr) { console.error('RAMS error:', rErr.message); continue }

  // Signatures from 5-8 operatives
  const signers = [...ops].sort(() => Math.random() - 0.5).slice(0, 5 + Math.floor(Math.random() * 4))
  const sigRows = signers.map(op => ({
    document_id: ramsDoc.id,
    operative_id: op.id,
    project_id: PID,
    company_id: CID,
    operative_name: op.name,
    document_title: doc.title,
    typed_name: op.name,
    signed_at: new Date(weekStart.getTime() + Math.random() * 3 * 86400000).toISOString(),
  }))
  const { error: sErr } = await supabase.from('signatures').insert(sigRows)
  if (sErr) console.error('RAMS signatures error:', sErr.message)
}
console.log(`  ${ramsDocs.length} RAMS docs with signatures`)

// ─── 3. INSPECTIONS (PM, Environmental, Operative) ──────────────
console.log('Seeding inspections...')

const pmItems = [
  { item: 'housekeeping', label: 'General housekeeping', result: 'pass' },
  { item: 'access_routes', label: 'Access routes clear', result: 'pass' },
  { item: 'welfare', label: 'Welfare facilities adequate', result: 'pass' },
  { item: 'scaffolding', label: 'Scaffolding inspected & tagged', result: 'pass' },
  { item: 'fire_points', label: 'Fire points accessible', result: 'pass' },
  { item: 'signage', label: 'Safety signage in place', result: 'pass' },
  { item: 'lighting', label: 'Adequate lighting', result: 'pass' },
  { item: 'ppe_compliance', label: 'PPE compliance', result: 'pass' },
  { item: 'plant_equipment', label: 'Plant & equipment safe', result: 'pass' },
  { item: 'permits', label: 'Permits to work displayed', result: 'pass' },
]

const envItems = [
  { item: 'waste_segregation', label: 'Waste segregated correctly', result: 'pass' },
  { item: 'spill_kits', label: 'Spill kits available', result: 'pass' },
  { item: 'dust_control', label: 'Dust suppression in place', result: 'pass' },
  { item: 'noise_levels', label: 'Noise levels acceptable', result: 'pass' },
  { item: 'water_drainage', label: 'Water/drainage protected', result: 'pass' },
  { item: 'material_storage', label: 'Materials stored correctly', result: 'pass' },
  { item: 'coshh', label: 'COSHH stored & labelled', result: 'pass' },
  { item: 'skip_levels', label: 'Skip levels managed', result: 'pass' },
]

const opItems = [
  { item: 'ppe_worn', label: 'Correct PPE worn', result: 'pass' },
  { item: 'competence', label: 'Competence cards checked', result: 'pass' },
  { item: 'method_statement', label: 'Working to method statement', result: 'pass' },
  { item: 'tools_condition', label: 'Tools in good condition', result: 'pass' },
  { item: 'manual_handling', label: 'Manual handling correct', result: 'pass' },
  { item: 'housekeeping', label: 'Work area tidy', result: 'pass' },
  { item: 'exclusion_zones', label: 'Exclusion zones respected', result: 'pass' },
  { item: 'permits_followed', label: 'Permits followed', result: 'pass' },
]

const inspections = [
  { template_name: 'PM Weekly Inspection', results: pmItems, inspector: 'Joe Szavay' },
  { template_name: 'Environmental Inspection', results: envItems, inspector: 'Joe Szavay' },
  { template_name: 'Operative Behaviour Inspection', results: opItems, inspector: 'Joe Szavay' },
]

for (const insp of inspections) {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + 1) // Tuesday
  d.setHours(10, 0, 0)

  await supabase.from('inspections').insert({
    company_id: CID,
    project_id: PID,
    template_name: insp.template_name,
    inspector: insp.inspector,
    results: insp.results,
    comments: 'No issues identified. Site in good order.',
    created_at: d.toISOString(),
  })
}
console.log(`  ${inspections.length} inspections`)

// ─── 4. SITE DIARY (for Safe Start Cards) ───────────────────────
console.log('Seeding site diary entries...')

const weatherOptions = ['Sunny', 'Overcast', 'Light Rain', 'Cloudy', 'Clear']
const workItems = [
  'Electrical first fix Level 7 — containment runs complete, wiring in progress',
  'Fire alarm installation Level 5-6 — detectors and sounders fitted',
  'BMS controls rough-in Level 8 — sensors and actuators mounted',
  'Mechanical pipework Level 6 — LTHW distribution complete',
  'Cable pulling riser — vertical runs Levels 3-8 complete',
]

for (let i = 0; i < 5; i++) {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + i)
  const dateStr = d.toISOString().split('T')[0]

  await supabase.from('site_diary').upsert({
    company_id: CID,
    project_id: PID,
    date: dateStr,
    weather: weatherOptions[i],
    workforce_count: 22 + Math.floor(Math.random() * 6),
    work_completed: workItems[i],
    work_planned: workItems[(i + 1) % workItems.length],
    deliveries: i === 0 ? '2x pallets LED panels, 1x pallet trunking' : i === 2 ? 'BMS controllers delivery (x12)' : '',
    visitors: i === 1 ? 'Client walkround — John Peters (Lendlease)' : '',
    delays: '',
    incidents: '',
    notes: '',
  }, { onConflict: 'company_id,project_id,date' })
}
console.log('  5 diary entries (Mon-Fri)')

console.log('\nDone! H&S report for Riverside Tower - Phase 1 is ready to generate for this week (20-26 Apr 2026).')
