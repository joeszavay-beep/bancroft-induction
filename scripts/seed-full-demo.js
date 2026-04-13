import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
)

const CID = 'a3a6b344-8394-4ca6-8f07-3011b4513bbe'
const MANAGER_ID = '6153e96f-8ee2-451a-9a58-e61bd20e9e50'
const today = new Date()
const day = (offset) => { const d = new Date(today); d.setDate(d.getDate() + offset); return d.toISOString() }
const dateStr = (offset) => { const d = new Date(today); d.setDate(d.getDate() + offset); return d.toISOString().split('T')[0] }

// Get existing project
const { data: projects } = await supabase.from('projects').select('id, name').eq('company_id', CID)
const PID = projects?.[0]?.id
if (!PID) { console.error('No project found'); process.exit(1) }
console.log(`Seeding for: ${projects[0].name} (${PID})`)

// ═══════════ 1. ADD 20 NEW WORKERS ═══════════
console.log('\n--- Adding 20 Workers ---')
const newWorkers = [
  { name: 'Ryan Kelly', role: 'Electrician', email: 'r.kelly@abcelectrical.co.uk', mobile: '07700 100001', date_of_birth: '1992-03-14', ni_number: 'AB123456A', address: 'Flat 3, 12 Deansgate, Manchester, M3 2BY', cscs_number: '6789012345', cscs_type: 'Blue - Skilled Worker', cscs_expiry: '2027-08-15', card_type: 'CSCS Blue - Skilled Worker', card_number: '6789012345', card_expiry: '2027-08-15' },
  { name: 'Darren Patel', role: 'Electrician', email: 'd.patel@abcelectrical.co.uk', mobile: '07700 100002', date_of_birth: '1988-07-22', ni_number: 'CD234567B', address: '45 Piccadilly, Manchester, M1 2AP', cscs_number: '7890123456', cscs_type: 'Blue - Skilled Worker', cscs_expiry: '2026-12-01', card_type: 'ECS Gold - Electrician', card_number: '7890123456', card_expiry: '2026-12-01' },
  { name: 'Chris Morgan', role: 'Supervisor', email: 'c.morgan@abcelectrical.co.uk', mobile: '07700 100003', date_of_birth: '1985-11-03', ni_number: 'EF345678C', address: '8 Portland Street, Manchester, M1 3LA', cscs_number: '8901234567', cscs_type: 'Gold - Supervisor', cscs_expiry: '2028-03-20', sssts_expiry: '2027-06-10', card_type: 'CSCS Gold - Supervisor', card_number: '8901234567', card_expiry: '2028-03-20' },
  { name: 'Adam Fletcher', role: 'Apprentice', email: 'a.fletcher@abcelectrical.co.uk', mobile: '07700 100004', date_of_birth: '2003-09-18', ni_number: 'GH456789D', address: '22 Oxford Road, Manchester, M13 9PL', cscs_number: '9012345678', cscs_type: 'Red - Trainee', cscs_expiry: '2026-06-30', card_type: 'CSCS Red - Trainee', card_number: '9012345678', card_expiry: '2026-06-30' },
  { name: 'Nathan Brooks', role: 'Plumber', email: 'n.brooks@deltaPlumbing.co.uk', mobile: '07700 100005', date_of_birth: '1990-01-29', ni_number: 'IJ567890E', address: '17 Whitworth Street, Manchester, M1 5WG', cscs_number: '0123456789', cscs_type: 'Blue - Skilled Worker', cscs_expiry: '2027-11-05', card_type: 'CSCS Blue - Skilled Worker', card_number: '0123456789', card_expiry: '2027-11-05' },
  { name: 'Liam Cooper', role: 'Plumber', email: 'l.cooper@deltaplumbing.co.uk', mobile: '07700 100006', date_of_birth: '1993-04-12', ni_number: 'KL678901F', address: '33 Lever Street, Manchester, M1 1LN', cscs_number: '1234509876', cscs_type: 'Blue - Skilled Worker', cscs_expiry: '2027-09-20', card_type: 'CSCS Blue - Skilled Worker', card_number: '1234509876', card_expiry: '2027-09-20' },
  { name: 'Jake Thompson', role: 'BMS Engineer', email: 'j.thompson@bmssolutions.co.uk', mobile: '07700 100007', date_of_birth: '1987-06-08', ni_number: 'MN789012G', address: '5 Spinningfields, Manchester, M3 3AP', cscs_number: '2345610987', cscs_type: 'White - Prof. Qualified', cscs_expiry: '2028-01-15', card_type: 'CSCS White - Prof. Qualified', card_number: '2345610987', card_expiry: '2028-01-15' },
  { name: 'Callum Ward', role: 'Electrician', email: 'c.ward@abcelectrical.co.uk', mobile: '07700 100008', date_of_birth: '1995-12-25', ni_number: 'OP890123H', address: '19 Bridge Street, Manchester, M3 3BZ', cscs_number: '3456721098', cscs_type: 'Blue - Skilled Worker', cscs_expiry: '2026-04-10', card_type: 'ECS Blue - Approved Electrician', card_number: '3456721098', card_expiry: '2026-04-10' },
  { name: 'Ben Harris', role: 'Labourer', email: 'b.harris@abcelectrical.co.uk', mobile: '07700 100009', date_of_birth: '2001-08-14', ni_number: 'QR901234I', address: '7 Ancoats, Manchester, M4 5AD', cscs_number: '4567832109', cscs_type: 'Green - Labourer', cscs_expiry: '2027-07-30', card_type: 'CSCS Green - Labourer', card_number: '4567832109', card_expiry: '2027-07-30' },
  { name: 'Daniel Evans', role: 'Electrician', email: 'd.evans@abcelectrical.co.uk', mobile: '07700 100010', date_of_birth: '1991-02-17', ni_number: 'ST012345J', address: '41 King Street, Manchester, M2 7AT', cscs_number: '5678943210', cscs_type: 'Blue - Skilled Worker', cscs_expiry: '2027-05-12', ipaf_expiry: '2026-11-20', card_type: 'ECS Gold - Electrician', card_number: '5678943210', card_expiry: '2027-05-12' },
  { name: 'Mark Robinson', role: 'Electrician', email: 'm.robinson@abcelectrical.co.uk', mobile: '07700 100011', date_of_birth: '1989-10-05', ni_number: 'UV123456K', address: '15 Mosley Street, Manchester, M2 3HY', cscs_number: '6789054321', cscs_type: 'Blue - Skilled Worker', cscs_expiry: '2028-02-28', pasma_expiry: '2027-04-15', card_type: 'ECS Gold - Electrician', card_number: '6789054321', card_expiry: '2028-02-28' },
  { name: 'Paul Wright', role: 'Supervisor', email: 'p.wright@abcelectrical.co.uk', mobile: '07700 100012', date_of_birth: '1983-05-20', ni_number: 'WX234567L', address: '9 Peter Street, Manchester, M2 5GP', cscs_number: '7890165432', cscs_type: 'Gold - Supervisor', cscs_expiry: '2027-10-18', smsts_expiry: '2027-12-01', card_type: 'CSCS Gold - Supervisor', card_number: '7890165432', card_expiry: '2027-10-18' },
  { name: 'Steve Clarke', role: 'Plumber', email: 's.clarke@deltaplumbing.co.uk', mobile: '07700 100013', date_of_birth: '1994-08-30', ni_number: 'YZ345678M', address: '28 Tib Street, Manchester, M4 1LA', cscs_number: '8901276543', cscs_type: 'Blue - Skilled Worker', cscs_expiry: '2027-06-22', card_type: 'CSCS Blue - Skilled Worker', card_number: '8901276543', card_expiry: '2027-06-22' },
  { name: 'Gary Simpson', role: 'Electrician', email: 'g.simpson@abcelectrical.co.uk', mobile: '07700 100014', date_of_birth: '1986-03-11', ni_number: 'AB456789N', address: '6 Quay Street, Manchester, M3 3HN', cscs_number: '9012387654', cscs_type: 'Blue - Skilled Worker', cscs_expiry: '2026-04-25', first_aid_expiry: '2026-05-01', card_type: 'ECS Gold - Electrician', card_number: '9012387654', card_expiry: '2026-04-25' },
  { name: 'Ian Foster', role: 'Labourer', email: 'i.foster@abcelectrical.co.uk', mobile: '07700 100015', date_of_birth: '1998-11-07', ni_number: 'CD567890O', address: '52 Dale Street, Manchester, M1 2HF', cscs_number: '0123498765', cscs_type: 'Green - Labourer', cscs_expiry: '2027-08-10', card_type: 'CSCS Green - Labourer', card_number: '0123498765', card_expiry: '2027-08-10' },
  { name: 'Kevin Price', role: 'BMS Engineer', email: 'k.price@bmssolutions.co.uk', mobile: '07700 100016', date_of_birth: '1984-07-19', ni_number: 'EF678901P', address: '3 St Ann Square, Manchester, M2 7LF', cscs_number: '1234500987', cscs_type: 'White - Prof. Qualified', cscs_expiry: '2028-04-30', card_type: 'CSCS White - Prof. Qualified', card_number: '1234500987', card_expiry: '2028-04-30' },
  { name: 'Peter Hall', role: 'Electrician', email: 'p.hall@abcelectrical.co.uk', mobile: '07700 100017', date_of_birth: '1996-01-23', ni_number: 'GH789012Q', address: '14 Corporation Street, Manchester, M4 3AQ', cscs_number: '2345611098', cscs_type: 'Blue - Skilled Worker', cscs_expiry: '2027-03-14', card_type: 'ECS Blue - Approved Electrician', card_number: '2345611098', card_expiry: '2027-03-14' },
  { name: 'Scott Mitchell', role: 'Apprentice', email: 's.mitchell@abcelectrical.co.uk', mobile: '07700 100018', date_of_birth: '2004-04-02', ni_number: 'IJ890123R', address: '21 Newton Street, Manchester, M1 1FT', cscs_number: '3456722109', cscs_type: 'Red - Trainee', cscs_expiry: '2026-09-15', card_type: 'CSCS Red - Trainee', card_number: '3456722109', card_expiry: '2026-09-15' },
  { name: 'Dave Russell', role: 'Plumber', email: 'd.russell@deltaplumbing.co.uk', mobile: '07700 100019', date_of_birth: '1992-06-28', ni_number: 'KL901234S', address: '38 High Street, Manchester, M4 1QB', cscs_number: '4567833210', cscs_type: 'Blue - Skilled Worker', cscs_expiry: '2027-12-20', card_type: 'CSCS Blue - Skilled Worker', card_number: '4567833210', card_expiry: '2027-12-20' },
  { name: 'Tony Baker', role: 'Electrician', email: 't.baker@abcelectrical.co.uk', mobile: '07700 100020', date_of_birth: '1990-09-15', ni_number: 'MN012345T', address: '10 Cross Street, Manchester, M2 7AE', cscs_number: '5678944321', cscs_type: 'Blue - Skilled Worker', cscs_expiry: '2027-01-08', ipaf_expiry: '2027-03-25', card_type: 'ECS Gold - Electrician', card_number: '5678944321', card_expiry: '2027-01-08' },
].map(w => ({ ...w, company_id: CID, project_id: PID, next_of_kin: 'Emergency Contact', next_of_kin_phone: '07700 999999' }))

const { data: insertedWorkers, error: wErr } = await supabase.from('operatives').insert(newWorkers).select('id, name')
console.log(wErr ? `Error: ${wErr.message}` : `${insertedWorkers.length} workers added`)

// Get all operatives
const { data: allOps } = await supabase.from('operatives').select('id, name, role, email').eq('company_id', CID)
console.log(`Total operatives: ${allOps.length}`)

// ═══════════ 2. MORE SITE DIARY ENTRIES ═══════════
console.log('\n--- Site Diary (20 entries) ---')
const diaryEntries = []
for (let i = 20; i >= 1; i--) {
  const d = new Date(today); d.setDate(d.getDate() - i)
  if (d.getDay() === 0 || d.getDay() === 6) continue
  const weathers = ['sunny', 'cloudy', 'rain', 'sunny', 'cloudy', 'windy', 'sunny', 'rain', 'cloudy', 'sunny', 'heavy_rain', 'sunny', 'cloudy', 'sunny', 'rain']
  diaryEntries.push({
    company_id: CID, project_id: PID, date: d.toISOString().split('T')[0],
    weather: weathers[i % weathers.length],
    temp_high: 10 + Math.floor(Math.random() * 10),
    temp_low: 2 + Math.floor(Math.random() * 6),
    workforce_count: 20 + Math.floor(Math.random() * 15),
    subcontractors: ['ABC Electrical (8), Delta Plumbing (4), BMS Solutions (2)', 'ABC Electrical (6), Delta Plumbing (3)', 'ABC Electrical (10), Delta Plumbing (5), Fire Systems (3)', 'ABC Electrical (7), BMS Solutions (3), Delta Plumbing (2)'][i % 4],
    work_completed: ['Containment runs Level 2 east — 80% complete. Final fix lighting corridors A-D.', 'Fire alarm loop testing Levels 1-3 complete. BMS integration started.', 'Pipework risers 4-8 pressure tested and signed off. Level 1 hot water commissioned.', 'Cable pulling to Level 3 DBs complete. Earthing and bonding verified Level 2.', 'Ductwork Level 2 west 100%. AHU-01 commissioned — air balance in progress.', 'Emergency lighting Level 1-2 complete. Fire dampers installed and tagged.', 'Small power Level 1 offices — final fix 90%. Server room cabling started.', 'FCU commissioning Levels 1-2 complete. Temperature sensors calibrated.'][i % 8],
    work_planned: ['Continue Level 2 west containment. Start Level 3 cable pulling.', 'Complete BMS integration Level 1. Start fire alarm commissioning.', 'Start Level 2 pipework. Continue riser insulation.', 'Level 3 DB terminations. Start lighting circuit testing.', 'AHU-02 commissioning. Level 3 ductwork start.', 'Emergency lighting Level 3. Begin fire stopping inspection.', 'Complete server room. Start Level 2 small power.', 'Start snag walkthrough Level 1. Continue FCU commissioning Level 3.'][i % 8],
    deliveries: i % 3 === 0 ? 'Cable drums x8 (Edmundson), DBs x2 (Schneider), Fire alarm devices x50 (Apollo)' : i % 3 === 1 ? 'Copper pipe (City Plumbing), BMS controllers x4 (Trend)' : null,
    visitors: i % 5 === 0 ? 'Client walkthrough — Mark Thompson (Riverside Developments). Very pleased with progress.' : i % 5 === 2 ? 'H&S audit — PASS. One minor: additional signage needed at riser doors.' : null,
    delays: i === 5 ? 'Lift access restricted — scaffolding in shaft delayed riser work 3 hours.' : i === 12 ? 'Heavy rain — external penetration sealing postponed to tomorrow.' : i === 18 ? 'Material delay: BMS actuators on back order, ETA Thursday.' : null,
    incidents: i === 7 ? 'Near miss: loose cable tray bracket on Level 2. Secured immediately. Toolbox talk on bracket inspections delivered.' : i === 15 ? 'Minor first aid: operative cut finger on conduit. Treated on site. RIDDOR not required.' : null,
    notes: i === 1 ? 'Excellent week — Level 1 substantially complete. Client delighted with quality.' : i === 10 ? 'Team working well. Ahead of programme by 2 days.' : null,
    created_by: 'Demo Manager',
  })
}
const { error: diaryErr } = await supabase.from('site_diary').insert(diaryEntries)
console.log(diaryErr ? `Error: ${diaryErr.message}` : `${diaryEntries.length} diary entries`)

// ═══════════ 3. SITE ATTENDANCE (last 5 days) ═══════════
console.log('\n--- Site Attendance ---')
const attendanceRecords = []
for (let dayOffset = -4; dayOffset <= 0; dayOffset++) {
  const d = new Date(today); d.setDate(d.getDate() + dayOffset)
  if (d.getDay() === 0 || d.getDay() === 6) continue
  // Random subset of workers sign in
  const workersToday = allOps.sort(() => Math.random() - 0.5).slice(0, 15 + Math.floor(Math.random() * 10))
  for (const op of workersToday) {
    const signInHour = 6 + Math.floor(Math.random() * 2)
    const signInMin = Math.floor(Math.random() * 60)
    const signIn = new Date(d); signIn.setHours(signInHour, signInMin, 0)
    attendanceRecords.push({
      company_id: CID, project_id: PID, operative_id: op.id, operative_name: op.name,
      type: 'sign_in', method: 'qr', recorded_at: signIn.toISOString(),
      notes: signInHour >= 8 ? `Late — arrived at ${signInHour}:${String(signInMin).padStart(2,'0')}` : null,
    })
    // Most sign out, some forget
    if (Math.random() > 0.1) {
      const signOutHour = 16 + Math.floor(Math.random() * 3)
      const signOutMin = Math.floor(Math.random() * 60)
      const signOut = new Date(d); signOut.setHours(signOutHour, signOutMin, 0)
      attendanceRecords.push({
        company_id: CID, project_id: PID, operative_id: op.id, operative_name: op.name,
        type: 'sign_out', method: signOutHour >= 18 ? 'auto' : 'qr', recorded_at: signOut.toISOString(),
        notes: signOutHour < 17 ? `Early — left at ${signOutHour}:${String(signOutMin).padStart(2,'0')}` : null,
      })
    }
  }
}
const { error: attErr } = await supabase.from('site_attendance').insert(attendanceRecords)
console.log(attErr ? `Error: ${attErr.message}` : `${attendanceRecords.length} attendance records`)

// ═══════════ 4. CHAT MESSAGES ═══════════
console.log('\n--- Chat Messages ---')
const chatConvos = [
  { opIdx: 0, messages: [
    { sender: 'operative', msg: 'Morning, we\'re running low on 2.5mm twin and earth on Level 2. Can we get more ordered?' },
    { sender: 'manager', msg: 'How many drums do you need?' },
    { sender: 'operative', msg: 'At least 4 drums should see us through the week' },
    { sender: 'manager', msg: 'Ordered from Edmundson. ETA tomorrow morning by 8am.' },
    { sender: 'operative', msg: 'Perfect, thanks' },
  ]},
  { opIdx: 2, messages: [
    { sender: 'operative', msg: 'The containment on Level 3 east corridor doesn\'t match the drawing. Looks like the architect moved the cable route.' },
    { sender: 'manager', msg: 'Can you take a photo and send it over?' },
    { sender: 'operative', msg: 'Sent it on the snag. It\'s about 300mm off from where it should be. We\'ll need an RFI.' },
    { sender: 'manager', msg: 'I\'ll raise the RFI with the architect today. Hold off on that section for now.' },
    { sender: 'operative', msg: 'Will do. We\'ll move to Level 3 west in the meantime.' },
    { sender: 'manager', msg: 'Good call. Keep me posted on progress there.' },
  ]},
  { opIdx: 4, messages: [
    { sender: 'operative', msg: 'Hi, the pressure test on riser 6 failed — dropping 0.2 bar over 2 hours. Checking joints now.' },
    { sender: 'manager', msg: 'Keep me updated. We need that signed off before the void closure inspection on Friday.' },
    { sender: 'operative', msg: 'Found it — dodgy fitting on the 3rd floor branch. Replaced and retesting now.' },
    { sender: 'operative', msg: 'Retest passed. Holding at 10 bar for 2 hours, no drop. Cert coming over.' },
    { sender: 'manager', msg: 'Excellent work Nathan. Send the cert through and I\'ll attach it to the inspection pack.' },
  ]},
  { opIdx: 6, messages: [
    { sender: 'operative', msg: 'BMS controller in plant room is throwing an error — "Comms fault on network 3". I think the Cat6 run from the riser might be damaged.' },
    { sender: 'manager', msg: 'Can you check the cable? Might have been nicked during the ductwork install.' },
    { sender: 'operative', msg: 'Yeah found it — cable was trapped under a duct support bracket. Replaced the run, controller back online.' },
    { sender: 'manager', msg: 'Nice one. Log it as an incident in the diary please — we need to flag it to the ductwork guys.' },
  ]},
  { opIdx: 8, messages: [
    { sender: 'operative', msg: 'Where do you want me today?' },
    { sender: 'manager', msg: 'Level 1 offices — the small power final fix needs finishing. Back boxes are all in, just needs faces and testing.' },
    { sender: 'operative', msg: 'On it. Should have it done by lunch if there\'s no issues.' },
    { sender: 'operative', msg: 'All done. 32 doubles, 8 fused spurs. All tested and labelled. Moving to corridor lighting this arvo.' },
    { sender: 'manager', msg: 'Great pace Ben. Corridor lighting is the last bit for Level 1 final fix.' },
  ]},
]

const chatRecords = []
for (const convo of chatConvos) {
  const op = allOps[convo.opIdx] || allOps[0]
  convo.messages.forEach((m, i) => {
    const time = new Date(today)
    time.setHours(7 + Math.floor(i * 1.5), Math.floor(Math.random() * 60))
    time.setDate(time.getDate() - Math.floor(Math.random() * 3))
    chatRecords.push({
      company_id: CID, operative_id: op.id, operative_name: op.name,
      manager_id: MANAGER_ID, manager_name: 'Demo Manager',
      sender_type: m.sender === 'manager' ? 'manager' : 'operative',
      sender_name: m.sender === 'manager' ? 'Demo Manager' : op.name,
      message: m.msg,
      read_by_manager: true, read_by_operative: true,
      created_at: time.toISOString(),
    })
  })
}
const { error: chatErr } = await supabase.from('chat_messages').insert(chatRecords)
console.log(chatErr ? `Error: ${chatErr.message}` : `${chatRecords.length} chat messages`)

// ═══════════ 5. MORE SNAG COMMENTS ═══════════
console.log('\n--- Snag Comments ---')
const { data: snags } = await supabase.from('snags').select('id, snag_number, assigned_to, status').eq('company_id', CID)
const snagComments = []
for (const snag of (snags || []).slice(0, 8)) {
  snagComments.push(
    { snag_id: snag.id, comment: `Attended site to inspect snag #${snag.snag_number}. Issue confirmed.`, author_name: 'Demo Manager', author_role: 'PM', created_at: day(-5) },
    { snag_id: snag.id, comment: `Working on this today. Should be resolved by end of shift.`, author_name: snag.assigned_to || 'Operative', author_role: 'Operative', created_at: day(-4) },
    { snag_id: snag.id, comment: `Update: 50% complete. Need access to the riser again tomorrow morning.`, author_name: snag.assigned_to || 'Operative', author_role: 'Operative', created_at: day(-3) },
    { snag_id: snag.id, comment: `Completed. Please review when you get a chance.`, author_name: snag.assigned_to || 'Operative', author_role: 'Operative', created_at: day(-2) },
    { snag_id: snag.id, comment: `Reviewed on site. Good quality. Closing this off.`, author_name: 'Demo Manager', author_role: 'PM', created_at: day(-1) },
  )
}
const { error: scErr } = await supabase.from('snag_comments').insert(snagComments)
console.log(scErr ? `Error: ${scErr.message}` : `${snagComments.length} snag comments`)

// ═══════════ 6. MORE INSPECTIONS ═══════════
console.log('\n--- Inspections ---')
const { data: templates } = await supabase.from('inspection_templates').select('id, name, items').eq('company_id', CID)
if (templates?.length) {
  const moreInspections = [
    { template: templates[0], location: 'Level 1 West Wing', status: 'completed', daysAgo: 8 },
    { template: templates[0], location: 'Level 2 East Wing', status: 'completed', daysAgo: 6 },
    { template: templates[1] || templates[0], location: 'Level 1 Riser 1-3', status: 'completed', daysAgo: 5 },
    { template: templates[1] || templates[0], location: 'Level 2 Riser 4-6', status: 'failed', daysAgo: 4 },
    { template: templates[2] || templates[0], location: 'Level 1 Corridor A', status: 'completed', daysAgo: 3 },
    { template: templates[2] || templates[0], location: 'Level 2 Corridor B', status: 'completed', daysAgo: 2 },
    { template: templates[0], location: 'Level 3 East Wing', status: 'in_progress', daysAgo: 1 },
    { template: templates[1] || templates[0], location: 'Level 3 Riser 7-9', status: 'in_progress', daysAgo: 0 },
  ]
  const inspRecords = moreInspections.map(insp => {
    let items
    try { items = typeof insp.template.items === 'string' ? JSON.parse(insp.template.items) : insp.template.items } catch { items = [] }
    const results = items.map(item => ({
      label: item.label,
      result: insp.status === 'in_progress' ? null : (insp.status === 'failed' && Math.random() > 0.7 ? 'fail' : 'pass'),
      notes: insp.status === 'failed' && Math.random() > 0.7 ? 'Needs remedial work — see photo' : '',
    }))
    return {
      company_id: CID, project_id: PID, template_id: insp.template.id,
      template_name: insp.template.name, location: insp.location,
      inspector_name: 'Demo Manager', status: insp.status,
      results: JSON.stringify(results),
      completed_at: insp.status !== 'in_progress' ? day(-insp.daysAgo) : null,
      created_at: day(-insp.daysAgo),
    }
  })
  const { error: inspErr } = await supabase.from('inspections').insert(inspRecords)
  console.log(inspErr ? `Error: ${inspErr.message}` : `${inspRecords.length} inspections`)
}

// ═══════════ 7. MORE NOTIFICATIONS ═══════════
console.log('\n--- Notifications ---')
const notifications = [
  { title: 'Snag #4 completed', body: 'Ryan Kelly has submitted a completion photo for review.', type: 'success', link: '/app/snags' },
  { title: 'New worker registered', body: 'Scott Mitchell has completed his profile and CSCS card upload.', type: 'info', link: '/app/workers' },
  { title: 'Void closure inspection failed', body: 'Level 2 Riser 4-6 — 2 items failed. Remedial work required.', type: 'error', link: '/app/inspections' },
  { title: 'Pressure test passed', body: 'Riser 6 pressure test certificate uploaded by Nathan Brooks.', type: 'success', link: '/app/projects' },
  { title: 'Callum Ward CSCS expiring', body: 'CSCS card expires 10 Apr 2026. Renewal needed urgently.', type: 'warning', link: '/app/workers' },
  { title: 'Gary Simpson first aid expiring', body: 'First aid certificate expires 1 May 2026.', type: 'warning', link: '/app/workers' },
  { title: 'Material request', body: 'Ryan Kelly: "Running low on 2.5mm twin and earth on Level 2"', type: 'info', link: '/app/messages' },
  { title: 'BMS fault resolved', body: 'Jake Thompson fixed the comms fault on network 3 in plant room.', type: 'success', link: '/app/messages' },
  { title: 'Aftercare defect reported', body: 'Jane Thompson: dead socket in Apartment 4B kitchen.', type: 'info', link: '/app/snags' },
  { title: 'Weekly summary', body: '12 snags raised, 8 closed. 3 inspections completed. Avg attendance: 24.', type: 'info', link: '/app' },
]
const notifRecords = notifications.map((n, i) => ({
  company_id: CID, user_id: MANAGER_ID, ...n, read: i > 4, created_at: day(-i),
}))
const { error: notifErr } = await supabase.from('notifications').insert(notifRecords)
console.log(notifErr ? `Error: ${notifErr.message}` : `${notifRecords.length} notifications`)

// ═══════════ 8. MORE AFTERCARE DEFECTS ═══════════
console.log('\n--- Aftercare Defects ---')
const defects = [
  { reported_by: 'Sarah Williams', email: 'sarah.w@riverside.co.uk', unit_ref: 'Apartment 6A', location: 'Bedroom 1', description: 'Light switch not working — no power to the ceiling light. Other sockets in the room work fine.', status: 'open', priority: 'medium' },
  { reported_by: 'Mark Johnson', email: 'mark.j@riverside.co.uk', unit_ref: 'Apartment 3C', location: 'En-suite', description: 'Hot water taking over 5 minutes to come through at the basin tap. Cold is instant.', status: 'in_progress', priority: 'low', assigned_to: 'Nathan Brooks' },
  { reported_by: 'Jane Thompson', email: 'jane.thompson@riverside.co.uk', unit_ref: 'Apartment 4B', location: 'Living Room', description: 'Thermostat display showing error code E7. Heating not responding to temperature changes.', status: 'open', priority: 'high' },
  { reported_by: 'David Hall', email: 'david.hall@riverside.co.uk', unit_ref: 'Apartment 2A', location: 'Kitchen', description: 'Under-cabinet LED strip light flickering intermittently. Worse in the evenings.', status: 'resolved', priority: 'low', resolved_at: day(-3) },
  { reported_by: 'Lisa Chen', email: 'lisa.chen@riverside.co.uk', unit_ref: 'Apartment 5B', location: 'Hallway', description: 'Smoke detector beeping every 30 seconds. Changed battery but still beeping.', status: 'open', priority: 'high' },
].map(d => ({ ...d, company_id: CID, project_id: PID }))
const { error: defErr } = await supabase.from('aftercare_defects').insert(defects)
console.log(defErr ? `Error: ${defErr.message}` : `${defects.length} aftercare defects`)

console.log('\n✅ Full demo data seeded!')
console.log(`Workers: ${allOps.length + 20}`)
console.log(`Diary entries: ${diaryEntries.length}`)
console.log(`Attendance records: ${attendanceRecords.length}`)
console.log(`Chat messages: ${chatRecords.length}`)
console.log(`Snag comments: ${snagComments.length}`)
console.log(`Notifications: ${notifRecords.length}`)
console.log(`Aftercare defects: ${defects.length}`)
