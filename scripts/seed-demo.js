import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

const CID = 'a3a6b344-8394-4ca6-8f07-3011b4513bbe' // ABC Construction

// Get ABC project IDs
const { data: projects } = await supabase.from('projects').select('id, name').eq('company_id', CID)
const proj = projects?.[0]
if (!proj) { console.error('No ABC project found'); process.exit(1) }
const PID = proj.id
console.log(`Seeding for project: ${proj.name} (${PID})`)

// Get ABC operatives
const { data: ops } = await supabase.from('operatives').select('id, name, role').eq('company_id', CID)
console.log(`Found ${ops?.length || 0} operatives`)

// 1. SITE DIARY — 10 entries over the past 2 weeks
console.log('\n--- Site Diary ---')
const weather = ['sunny', 'cloudy', 'rain', 'sunny', 'cloudy', 'windy', 'sunny', 'rain', 'cloudy', 'sunny']
const diaryEntries = []
for (let i = 9; i >= 0; i--) {
  const d = new Date()
  d.setDate(d.getDate() - i)
  if (d.getDay() === 0 || d.getDay() === 6) continue // skip weekends
  diaryEntries.push({
    company_id: CID,
    project_id: PID,
    date: d.toISOString().split('T')[0],
    weather: weather[i],
    temp_high: 12 + Math.floor(Math.random() * 8),
    temp_low: 4 + Math.floor(Math.random() * 5),
    workforce_count: 18 + Math.floor(Math.random() * 12),
    subcontractors: ['ABC Electrical (4), Delta Plumbing (3)', 'ABC Electrical (3), BMS Solutions (2)', 'Delta Plumbing (4), Fire Systems Ltd (2)', 'ABC Electrical (5), Delta Plumbing (2), BMS Solutions (1)'][i % 4],
    work_completed: [
      'Completed containment runs on Level 2 east wing. Final fix lighting in corridors A-D.',
      'Fire alarm loop testing Levels 1-3. BMS controller installation in plant room.',
      'First fix pipework to risers 4-6. Pressure testing completed on Level 1.',
      'Cable pulling to Level 3 distribution boards. Earthing and bonding checks Level 2.',
      'Ductwork installation Level 2 west wing. Commissioning prep for AHU-01.',
      'Small power final fix Level 1 offices. Data cabling to server room.',
      'Emergency lighting installation Levels 1-2. Fire damper installation.',
      'Commissioning of FCUs Levels 1-2. Snagging walkthrough with PM.',
    ][i % 8],
    work_planned: [
      'Continue containment Level 2 west wing. Start cable pulling Level 3.',
      'Complete fire alarm testing. Start BMS integration.',
      'Continue risers 7-9. Start Level 2 pipework.',
      'Complete Level 3 DB connections. Start lighting Level 3.',
      'Continue ductwork Level 3. AHU commissioning.',
      'Continue data cabling. Start Level 2 small power.',
      'Complete emergency lighting Level 3. Fire stopping.',
      'Continue snagging. Client walkthrough prep.',
    ][i % 8],
    deliveries: i % 3 === 0 ? 'Cable drums x12 (Edmundson), Distribution boards x4 (Schneider)' : i % 3 === 1 ? 'Copper pipe (City Plumbing), Fire alarm devices (ADT)' : null,
    visitors: i % 4 === 0 ? 'Client site visit — Mark Thompson (Riverside Developments)' : i % 4 === 2 ? 'H&S inspection — completed, no actions' : null,
    delays: i === 3 ? 'Lift shaft access restricted until scaffolding complete — delayed riser work by 2 hours' : i === 7 ? 'Heavy rain stopped external works. Internal works continued.' : null,
    incidents: i === 5 ? 'Near miss: unsecured ladder on Level 3 stairwell. Toolbox talk delivered on ladder safety. No injuries.' : null,
    notes: i === 0 ? 'Good progress this week. On track for Phase 1 handover.' : null,
    created_by: 'Demo Manager',
  })
}
const { error: diaryErr } = await supabase.from('site_diary').insert(diaryEntries)
console.log(diaryErr ? `Error: ${diaryErr.message}` : `${diaryEntries.length} diary entries created`)

// 2. INSPECTION TEMPLATES
console.log('\n--- Inspection Templates ---')
const templates = [
  {
    company_id: CID, name: 'Site Induction Check', category: 'General',
    description: 'Standard checks for new operative induction',
    items: JSON.stringify([
      { label: 'PPE worn correctly (hard hat, hi-vis, boots)' },
      { label: 'Site rules briefing completed' },
      { label: 'Emergency exits and muster point identified' },
      { label: 'CSCS card verified and in date' },
      { label: 'RAMS read and understood' },
    ]),
    created_by: 'Demo Manager',
  },
  {
    company_id: CID, name: 'Pre-Plaster Inspection', category: 'Pre-Plaster',
    description: 'M&E first fix inspection before plasterboard',
    items: JSON.stringify([
      { label: 'All cable runs complete and clipped' },
      { label: 'Back boxes installed at correct heights' },
      { label: 'Containment sealed at fire compartment boundaries' },
      { label: 'Pipework pressure tested and certified' },
      { label: 'Ductwork connections sealed and insulated' },
      { label: 'Fire stopping installed at all penetrations' },
    ]),
    created_by: 'Demo Manager',
  },
  {
    company_id: CID, name: 'Fire Stopping Inspection', category: 'Fire Stopping',
    description: 'Third party fire stopping verification',
    items: JSON.stringify([
      { label: 'All penetrations through fire walls sealed' },
      { label: 'Correct fire stop product used per schedule' },
      { label: 'Manufacturer installation guide followed' },
      { label: 'Labels/tags applied to all fire stops' },
      { label: 'Photographic evidence captured' },
    ]),
    created_by: 'Demo Manager',
  },
]
const { data: tmplData, error: tmplErr } = await supabase.from('inspection_templates').insert(templates).select()
console.log(tmplErr ? `Error: ${tmplErr.message}` : `${tmplData.length} templates created`)

// 3. INSPECTIONS — 4 completed inspections
console.log('\n--- Inspections ---')
if (tmplData?.length) {
  const inspections = [
    {
      company_id: CID, project_id: PID, template_id: tmplData[0].id,
      template_name: 'Site Induction Check', location: 'Level 1 Entrance', inspector_name: 'Demo Manager',
      status: 'completed', completed_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      results: JSON.stringify([
        { label: 'PPE worn correctly (hard hat, hi-vis, boots)', result: 'pass' },
        { label: 'Site rules briefing completed', result: 'pass' },
        { label: 'Emergency exits and muster point identified', result: 'pass' },
        { label: 'CSCS card verified and in date', result: 'pass' },
        { label: 'RAMS read and understood', result: 'pass' },
      ]),
    },
    {
      company_id: CID, project_id: PID, template_id: tmplData[1].id,
      template_name: 'Pre-Plaster Inspection', location: 'Level 2 East Wing', inspector_name: 'Demo Manager',
      status: 'completed', completed_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      results: JSON.stringify([
        { label: 'All cable runs complete and clipped', result: 'pass' },
        { label: 'Back boxes installed at correct heights', result: 'pass' },
        { label: 'Containment sealed at fire compartment boundaries', result: 'pass' },
        { label: 'Pipework pressure tested and certified', result: 'pass' },
        { label: 'Ductwork connections sealed and insulated', result: 'pass' },
        { label: 'Fire stopping installed at all penetrations', result: 'pass' },
      ]),
    },
    {
      company_id: CID, project_id: PID, template_id: tmplData[1].id,
      template_name: 'Pre-Plaster Inspection', location: 'Level 2 West Wing', inspector_name: 'Demo Manager',
      status: 'failed', completed_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      results: JSON.stringify([
        { label: 'All cable runs complete and clipped', result: 'pass' },
        { label: 'Back boxes installed at correct heights', result: 'fail', notes: '3x back boxes in Room 204 at wrong height — need repositioning' },
        { label: 'Containment sealed at fire compartment boundaries', result: 'pass' },
        { label: 'Pipework pressure tested and certified', result: 'pass' },
        { label: 'Ductwork connections sealed and insulated', result: 'fail', notes: 'Insulation missing on 2x flex connections to FCU-07 and FCU-08' },
        { label: 'Fire stopping installed at all penetrations', result: 'pass' },
      ]),
      notes: 'Two items failed — remedial work required before re-inspection.',
    },
    {
      company_id: CID, project_id: PID, template_id: tmplData[2].id,
      template_name: 'Fire Stopping Inspection', location: 'Level 1 Riser 4', inspector_name: 'Demo Manager',
      status: 'completed', completed_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      results: JSON.stringify([
        { label: 'All penetrations through fire walls sealed', result: 'pass' },
        { label: 'Correct fire stop product used per schedule', result: 'pass' },
        { label: 'Manufacturer installation guide followed', result: 'pass' },
        { label: 'Labels/tags applied to all fire stops', result: 'pass' },
        { label: 'Photographic evidence captured', result: 'pass' },
      ]),
    },
  ]
  const { error: inspErr } = await supabase.from('inspections').insert(inspections)
  console.log(inspErr ? `Error: ${inspErr.message}` : `${inspections.length} inspections created`)
}

// 4. WORKER CERTIFICATIONS — update existing operatives
console.log('\n--- Worker Certifications ---')
if (ops?.length) {
  const certData = [
    { cscs_number: '1234567890', cscs_type: 'Blue - Skilled Worker', cscs_expiry: '2027-06-15', ipaf_expiry: '2026-11-30', first_aid_expiry: '2027-03-20' },
    { cscs_number: '2345678901', cscs_type: 'Gold - Supervisor', cscs_expiry: '2028-02-10', sssts_expiry: '2027-08-15', first_aid_expiry: '2026-04-18' }, // first aid expiring soon!
    { cscs_number: '3456789012', cscs_type: 'Blue - Skilled Worker', cscs_expiry: '2026-04-20', pasma_expiry: '2027-01-10' }, // CSCS expiring very soon!
    { cscs_number: '4567890123', cscs_type: 'Blue - Skilled Worker', cscs_expiry: '2027-09-30', ipaf_expiry: '2026-03-01' }, // IPAF expired!
    { cscs_number: '5678901234', cscs_type: 'Green - Labourer', cscs_expiry: '2027-12-01', first_aid_expiry: '2027-05-15' },
  ]
  for (let i = 0; i < Math.min(ops.length, certData.length); i++) {
    const { error } = await supabase.from('operatives').update(certData[i]).eq('id', ops[i].id)
    console.log(error ? `  ${ops[i].name}: Error - ${error.message}` : `  ${ops[i].name}: certs updated`)
  }
}

// 5. AFTERCARE DEFECTS — 3 sample defects
console.log('\n--- Aftercare Defects ---')
const defects = [
  {
    company_id: CID, project_id: PID,
    reported_by: 'Jane Thompson', email: 'jane.thompson@riverside.co.uk', phone: '07700 900123',
    unit_ref: 'Apartment 4B', location: 'Kitchen',
    description: 'Socket behind washing machine is not working. Tried with multiple appliances — no power.',
    status: 'open', priority: 'medium',
  },
  {
    company_id: CID, project_id: PID,
    reported_by: 'David Hall', email: 'david.hall@riverside.co.uk', phone: '07700 900456',
    unit_ref: 'Apartment 2A', location: 'Bathroom',
    description: 'Extractor fan making loud rattling noise when running. Started 2 weeks after move-in.',
    status: 'in_progress', priority: 'low', assigned_to: 'James Wilson',
  },
  {
    company_id: CID, project_id: PID,
    reported_by: 'Jane Thompson', email: 'jane.thompson@riverside.co.uk',
    unit_ref: 'Apartment 4B', location: 'Hallway',
    description: 'Emergency light near front door not illuminating during power cut test.',
    status: 'open', priority: 'high',
  },
]
const { error: defErr } = await supabase.from('aftercare_defects').insert(defects)
console.log(defErr ? `Error: ${defErr.message}` : `${defects.length} aftercare defects created`)

// 6. NOTIFICATIONS — seed a few for the demo user
console.log('\n--- Notifications ---')
const { data: demoProfile } = await supabase.from('profiles').select('id').eq('company_id', CID).limit(1)
const demoUserId = demoProfile?.[0]?.id
if (demoUserId) {
  const notifs = [
    { company_id: CID, user_id: demoUserId, title: 'Snag #12 is overdue', body: 'Level 2 East Wing — socket not flush. Due 2 days ago.', type: 'warning', link: '/app/snags' },
    { company_id: CID, user_id: demoUserId, title: 'Inspection completed', body: 'Fire Stopping Inspection — Level 1 Riser 4 passed all checks.', type: 'success', link: '/app/inspections' },
    { company_id: CID, user_id: demoUserId, title: 'New aftercare defect reported', body: 'Jane Thompson reported a dead socket in Apartment 4B.', type: 'info', link: '/app/snags' },
    { company_id: CID, user_id: demoUserId, title: 'CSCS expiring soon', body: "Lisa Martinez's CSCS card expires on 20 Apr 2026.", type: 'warning', link: '/app/workers' },
    { company_id: CID, user_id: demoUserId, title: 'IPAF certification expired', body: "Mike O'Brien's IPAF expired on 1 Mar 2026. Restrict access to MEWPs.", type: 'error', link: '/app/workers' },
  ]
  const { error: notifErr } = await supabase.from('notifications').insert(notifs)
  console.log(notifErr ? `Error: ${notifErr.message}` : `${notifs.length} notifications created`)
} else {
  console.log('No demo user found — skipping notifications')
}

console.log('\n✅ Demo data seeded successfully!')
