const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
);

(async () => {
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: 'demo@coresite.io',
    password: 'Demo2026!'
  });
  if (authErr) { console.error('Auth failed:', authErr.message); return; }
  console.log('[OK] Authenticated as demo@coresite.io');

  const abcId = 'a3a6b344-8394-4ca6-8f07-3011b4513bbe';
  const crownId   = 'bbcb721c-8513-4c1e-8bd4-a24b2e98e710';
  const vanguardId = '9aaf9acb-cc72-4c4e-a1ec-2db693101475';
  const phoenixId  = 'e2e2b51f-ac55-44f2-be77-8f82869a70c3';
  const apexId     = 'c3f54228-faae-40f7-8482-fc450a3bf93c';
  const metroId    = '0a803342-9ed4-4267-94ba-9f6b578561d9';
  const allAgencies = [crownId, vanguardId, phoenixId, apexId, metroId];

  // ========================================
  // STEP 1: Agency connections for ABC Construction
  // ========================================
  console.log('\n--- STEP 1: Agency Connections ---');
  const acRows = allAgencies.map(a => ({
    company_id: abcId, agency_id: a, status: 'active', connected_by: 'Demo User'
  }));
  // Delete existing first to avoid duplicates
  for (const a of allAgencies) {
    await supabase.from('agency_connections').delete().match({ company_id: abcId, agency_id: a });
  }
  const { data: acData, error: acErr } = await supabase.from('agency_connections').insert(acRows).select();
  if (acErr) console.error('  ERROR agency_connections:', acErr.message);
  else console.log('  [OK] Created ' + acData.length + ' agency connections for ABC Construction');

  // ========================================
  // STEP 2: Create projects
  // ========================================
  console.log('\n--- STEP 2: Projects ---');
  // Note: Overbury and Skanska companies cannot be created via the anon key
  // due to RLS (requires service_role). Creating projects under ABC Construction.

  const { data: proj1, error: p1Err } = await supabase.from('projects').insert({
    name: 'Morgan Lewis - Peterborough Court Level 08',
    location: '133 Fleet Street, London EC4A 2BB',
    company_id: abcId,
  }).select().single();
  if (p1Err) console.error('  ERROR project 1:', p1Err.message);
  else console.log('  [OK] Project: ' + proj1.name + ' (' + proj1.id + ')');

  const { data: proj2, error: p2Err } = await supabase.from('projects').insert({
    name: '22 Bishopsgate Refurbishment',
    location: '22 Bishopsgate, London EC2N 4AY',
    company_id: abcId,
  }).select().single();
  if (p2Err) console.error('  ERROR project 2:', p2Err.message);
  else console.log('  [OK] Project: ' + proj2.name + ' (' + proj2.id + ')');

  // ========================================
  // STEP 3: Labour Requests (7 total)
  // ========================================
  console.log('\n--- STEP 3: Labour Requests ---');
  const requests = [
    // 0: Electricians (Peterborough Court)
    {
      project_id: proj1.id, company_id: abcId, created_by: 'Sarah Mitchell',
      trade_required: 'electrician', number_of_operatives: 3, skill_level_minimum: 'skilled',
      cscs_card_type_required: 'ecs_blue_electrician',
      certifications_required: ['18th_edition', 'working_at_height'],
      start_date: '2026-05-04', end_date: '2026-06-12',
      working_days: 'mon_fri', working_hours: '07:30 - 17:30',
      site_name: 'Peterborough Court', site_address: '133 Fleet Street, London',
      site_postcode: 'EC4R 0AA', day_rate_offered: 28000,
      description: '3x skilled electricians for 2nd fix installation on Level 08. Must have 18th Edition and working at height. Clean, high-spec legal fit-out for Morgan Lewis.',
      ppe_requirements: 'Hard hat, hi-vis, steel toe boots, safety glasses',
      induction_required: true, status: 'open', urgency: 'standard',
      visibility: 'public', preferred_agency_ids: [],
    },
    // 1: Ceiling fixers (Peterborough Court)
    {
      project_id: proj1.id, company_id: abcId, created_by: 'Sarah Mitchell',
      trade_required: 'ceiling_fixer', number_of_operatives: 2, skill_level_minimum: 'skilled',
      cscs_card_type_required: null, certifications_required: [],
      start_date: '2026-05-11', end_date: '2026-06-05',
      working_days: 'mon_fri', working_hours: '07:30 - 17:30',
      site_name: 'Peterborough Court', site_address: '133 Fleet Street, London',
      site_postcode: 'EC4R 0AA', day_rate_offered: 22000,
      description: '2x ceiling fixers for SAS grid and tile installation. Open plan office areas Levels 7-8.',
      ppe_requirements: 'Hard hat, hi-vis, steel toe boots',
      induction_required: true, status: 'open', urgency: 'standard',
      visibility: 'preferred_only', preferred_agency_ids: [crownId, metroId],
    },
    // 2: Commissioning engineer (Peterborough Court)
    {
      project_id: proj1.id, company_id: abcId, created_by: 'Sarah Mitchell',
      trade_required: 'commissioning_engineer', number_of_operatives: 1, skill_level_minimum: 'advanced',
      cscs_card_type_required: null, certifications_required: ['working_at_height'],
      start_date: '2026-06-01', end_date: '2026-06-26',
      working_days: 'mon_fri', working_hours: '07:00 - 18:00',
      site_name: 'Peterborough Court', site_address: '133 Fleet Street, London',
      site_postcode: 'EC4R 0AA', day_rate_offered: 38000,
      description: 'Commissioning engineer for HVAC and BMS systems. Must be experienced with Trend/Tridium platforms. Urgent requirement.',
      ppe_requirements: 'Hard hat, hi-vis, steel toe boots, safety glasses',
      induction_required: true, status: 'open', urgency: 'urgent',
      visibility: 'public', preferred_agency_ids: [],
    },
    // 3: Pipefitters (22 Bishopsgate)
    {
      project_id: proj2.id, company_id: abcId, created_by: 'James Porter',
      trade_required: 'pipefitter', number_of_operatives: 5, skill_level_minimum: 'skilled',
      cscs_card_type_required: null, certifications_required: ['working_at_height'],
      start_date: '2026-05-04', end_date: '2026-07-24',
      working_days: 'mon_fri', working_hours: '07:00 - 17:00',
      site_name: '22 Bishopsgate', site_address: '22 Bishopsgate, London',
      site_postcode: 'EC2N 4AY', day_rate_offered: 27000,
      description: '5x pipefitters for chilled water and LTHW installations across multiple floors. Long-term programme, may extend.',
      ppe_requirements: 'Hard hat, hi-vis, steel toe boots, safety glasses, gloves',
      induction_required: true, status: 'open', urgency: 'standard',
      visibility: 'public', preferred_agency_ids: [],
    },
    // 4: Fire stoppers (22 Bishopsgate)
    {
      project_id: proj2.id, company_id: abcId, created_by: 'James Porter',
      trade_required: 'fire_stopper', number_of_operatives: 2, skill_level_minimum: 'skilled',
      cscs_card_type_required: null, certifications_required: ['fire_stopping_bm_trada'],
      start_date: '2026-05-04', end_date: '2026-05-29',
      working_days: 'mon_fri', working_hours: '07:00 - 17:00',
      site_name: '22 Bishopsgate', site_address: '22 Bishopsgate, London',
      site_postcode: 'EC2N 4AY', day_rate_offered: 26000,
      description: '2x fire stoppers with BM TRADA certification for compartmentation works. Floors 15-22.',
      ppe_requirements: 'Hard hat, hi-vis, steel toe boots, safety glasses, RPE',
      induction_required: true, status: 'open', urgency: 'standard',
      visibility: 'preferred_only', preferred_agency_ids: [phoenixId],
    },
    // 5: Ductwork installers (22 Bishopsgate)
    {
      project_id: proj2.id, company_id: abcId, created_by: 'James Porter',
      trade_required: 'ductwork_installer', number_of_operatives: 4, skill_level_minimum: 'improver',
      cscs_card_type_required: null, certifications_required: ['ipaf_3a_scissor'],
      start_date: '2026-04-14', end_date: '2026-05-22',
      working_days: 'mon_fri', working_hours: '07:00 - 17:00',
      site_name: '22 Bishopsgate', site_address: '22 Bishopsgate, London',
      site_postcode: 'EC2N 4AY', day_rate_offered: 24000,
      description: '4x ductwork installers, IPAF 3a required for scissor lift access. Rectangular and spiral ductwork on floors 18-25. Urgent start needed.',
      ppe_requirements: 'Hard hat, hi-vis, steel toe boots, safety glasses, gloves',
      induction_required: true, status: 'open', urgency: 'urgent',
      visibility: 'public', preferred_agency_ids: [],
    },
    // 6: Site supervisor (22 Bishopsgate)
    {
      project_id: proj2.id, company_id: abcId, created_by: 'James Porter',
      trade_required: 'site_supervisor', number_of_operatives: 1, skill_level_minimum: 'supervisor',
      cscs_card_type_required: null, certifications_required: ['smsts', 'first_aid_at_work'],
      start_date: '2026-04-14', end_date: '2026-08-28',
      working_days: 'mon_fri', working_hours: '06:30 - 18:00',
      site_name: '22 Bishopsgate', site_address: '22 Bishopsgate, London',
      site_postcode: 'EC2N 4AY', day_rate_offered: 45000,
      description: 'M&E site supervisor for major refurbishment. SMSTS and First Aid required. Must have experience managing 40+ operatives on commercial high-rise projects.',
      ppe_requirements: 'Hard hat, hi-vis, steel toe boots',
      induction_required: true, status: 'open', urgency: 'standard',
      visibility: 'public', preferred_agency_ids: [],
    },
  ];

  const { data: reqData, error: reqErr } = await supabase
    .from('labour_requests').insert(requests).select('id, trade_required');
  if (reqErr) { console.error('  ERROR labour_requests:', reqErr.message); return; }
  console.log('  [OK] Created ' + reqData.length + ' labour requests:');
  reqData.forEach(r => console.log('    - ' + r.trade_required + ': ' + r.id));

  // ========================================
  // STEP 4: Proposals from agencies
  // ========================================
  console.log('\n--- STEP 4: Proposals ---');

  async function getOps(trade, limit) {
    const { data } = await supabase.from('agency_operatives')
      .select('id, first_name, last_name, agency_id, primary_trade, day_rate, skill_level, status')
      .eq('primary_trade', trade)
      .limit(limit || 4);
    return data || [];
  }

  const proposals = [];

  // Electrician proposals (request 0)
  const elecReqId = reqData[0].id;
  const elecOps = await getOps('electrician', 5);
  for (const op of elecOps.filter(o => o.skill_level === 'skilled' || o.skill_level === 'advanced').slice(0, 4)) {
    proposals.push({
      labour_request_id: elecReqId, agency_id: op.agency_id, operative_id: op.id,
      proposed_day_rate: op.day_rate,
      match_score: op.skill_level === 'advanced' ? 96 : 89,
      match_status: 'green', status: 'proposed',
      cover_letter: `${op.first_name} is a reliable ${op.skill_level} electrician with strong commercial fit-out experience. 18th Edition qualified, excellent attendance record.`,
    });
  }

  // Ceiling fixer proposals (request 1)
  const ceilReqId = reqData[1].id;
  const ceilOps = await getOps('ceiling_fixer', 3);
  const dryOps = await getOps('dryliner', 2);
  for (const op of ceilOps) {
    proposals.push({
      labour_request_id: ceilReqId, agency_id: op.agency_id, operative_id: op.id,
      proposed_day_rate: op.day_rate,
      match_score: 85, match_status: 'green', status: 'proposed',
      cover_letter: `${op.first_name} has extensive experience with SAS and Armstrong ceiling systems in high-spec office environments.`,
    });
  }
  for (const op of dryOps.slice(0, 1)) {
    proposals.push({
      labour_request_id: ceilReqId, agency_id: op.agency_id, operative_id: op.id,
      proposed_day_rate: op.day_rate,
      match_score: 74, match_status: 'amber', status: 'proposed',
      cover_letter: `${op.first_name} is primarily a dryliner but has 2 years ceiling fixing experience with MF and SAS systems.`,
    });
  }

  // Commissioning engineer proposals (request 2)
  const commReqId = reqData[2].id;
  const commOps = await getOps('commissioning_engineer', 3);
  for (const op of commOps) {
    proposals.push({
      labour_request_id: commReqId, agency_id: op.agency_id, operative_id: op.id,
      proposed_day_rate: op.day_rate,
      match_score: op.skill_level === 'advanced' ? 94 : 78,
      match_status: op.skill_level === 'advanced' ? 'green' : 'amber',
      status: 'proposed',
      cover_letter: `${op.first_name} is an experienced commissioning engineer proficient with Trend and Tridium BMS platforms. Available immediately.`,
    });
  }

  // Pipefitter proposals (request 3)
  const pipeReqId = reqData[3].id;
  const pipeOps = await getOps('pipefitter', 4);
  for (const op of pipeOps) {
    proposals.push({
      labour_request_id: pipeReqId, agency_id: op.agency_id, operative_id: op.id,
      proposed_day_rate: op.day_rate,
      match_score: op.skill_level === 'advanced' ? 93 : 86,
      match_status: 'green', status: 'proposed',
      cover_letter: `${op.first_name} is a proven pipefitter with extensive chilled water and LTHW installation experience on commercial high-rise projects.`,
    });
  }
  // Cross-trade plumber proposal
  const plumbOps = await getOps('plumber', 3);
  const skilledPlumber = plumbOps.find(o => o.skill_level === 'skilled' || o.skill_level === 'advanced');
  if (skilledPlumber) {
    proposals.push({
      labour_request_id: pipeReqId, agency_id: skilledPlumber.agency_id, operative_id: skilledPlumber.id,
      proposed_day_rate: skilledPlumber.day_rate,
      match_score: 76, match_status: 'amber', status: 'proposed',
      cover_letter: `${skilledPlumber.first_name} is primarily a plumber but has significant pipefitting experience on commercial M&E projects.`,
    });
  }

  // Fire stopper proposals (request 4)
  const fireReqId = reqData[4].id;
  const fireOps = await getOps('fire_stopper', 5);
  for (const op of fireOps.filter(o => o.skill_level === 'skilled' || o.skill_level === 'advanced')) {
    proposals.push({
      labour_request_id: fireReqId, agency_id: op.agency_id, operative_id: op.id,
      proposed_day_rate: op.day_rate,
      match_score: op.skill_level === 'advanced' ? 97 : 88,
      match_status: 'green', status: 'proposed',
      cover_letter: `${op.first_name} holds BM TRADA certification and has completed fire stopping on multiple high-rise commercial projects including Canary Wharf.`,
    });
  }

  // Ductwork installer proposals (request 5)
  const ductReqId = reqData[5].id;
  const ductOps = await getOps('ductwork_installer', 4);
  for (const op of ductOps) {
    const isLab = op.skill_level === 'labourer';
    proposals.push({
      labour_request_id: ductReqId, agency_id: op.agency_id, operative_id: op.id,
      proposed_day_rate: op.day_rate,
      match_score: isLab ? 72 : 87,
      match_status: isLab ? 'amber' : 'green',
      status: 'proposed',
      cover_letter: isLab
        ? `${op.first_name} is developing strong ductwork skills and is keen to progress. Good attitude and reliable.`
        : `${op.first_name} has experience installing rectangular and spiral ductwork and holds IPAF 3a certification.`,
    });
  }

  // Site supervisor proposals (request 6)
  const supReqId = reqData[6].id;
  const supOps = await getOps('site_supervisor', 4);
  for (const op of supOps.filter(o => o.status === 'available')) {
    proposals.push({
      labour_request_id: supReqId, agency_id: op.agency_id, operative_id: op.id,
      proposed_day_rate: op.day_rate,
      match_score: 91, match_status: 'green', status: 'proposed',
      cover_letter: `${op.first_name} is a SMSTS-certified M&E site supervisor with 15+ years experience managing large teams on commercial high-rise projects.`,
    });
  }

  const { data: propData, error: propErr } = await supabase
    .from('labour_proposals').insert(proposals).select('id, labour_request_id, operative_id, agency_id');
  if (propErr) { console.error('  ERROR proposals:', propErr.message); return; }
  console.log('  [OK] Created ' + propData.length + ' proposals');

  // ========================================
  // STEP 5: Accept proposals and create bookings
  // ========================================
  console.log('\n--- STEP 5: Bookings ---');

  const elecProp = propData.find(p => p.labour_request_id === elecReqId);
  const pipeProp = propData.find(p => p.labour_request_id === pipeReqId);
  const supProp = propData.find(p => p.labour_request_id === supReqId);

  // Update proposal statuses to accepted
  for (const p of [elecProp, pipeProp, supProp]) {
    const { error } = await supabase.from('labour_proposals')
      .update({ status: 'accepted' }).eq('id', p.id);
    if (error) console.error('  ERROR accepting proposal:', error.message);
  }
  console.log('  [OK] Accepted 3 proposals');

  const bookings = [
    {
      labour_request_id: elecReqId,
      agency_id: elecProp.agency_id,
      operative_id: elecProp.operative_id,
      company_id: abcId,
      project_id: proj1.id,
      status: 'active',
      agreed_day_rate: 28000,
      start_date: '2026-05-04',
      end_date: '2026-06-12',
      onboarding_status: 'site_ready',
    },
    {
      labour_request_id: pipeReqId,
      agency_id: pipeProp.agency_id,
      operative_id: pipeProp.operative_id,
      company_id: abcId,
      project_id: proj2.id,
      status: 'confirmed',
      agreed_day_rate: 27000,
      start_date: '2026-05-04',
      end_date: '2026-07-24',
      onboarding_status: 'induction_sent',
    },
    {
      labour_request_id: supReqId,
      agency_id: supProp.agency_id,
      operative_id: supProp.operative_id,
      company_id: abcId,
      project_id: proj2.id,
      status: 'confirmed',
      agreed_day_rate: 45000,
      start_date: '2026-04-14',
      end_date: '2026-08-28',
      onboarding_status: 'induction_completed',
    },
  ];

  const { data: bookData, error: bookErr } = await supabase
    .from('labour_bookings').insert(bookings).select();
  if (bookErr) { console.error('  ERROR bookings:', bookErr.message); return; }
  console.log('  [OK] Created ' + bookData.length + ' bookings:');
  bookData.forEach(b =>
    console.log('    - ' + b.status + ' / onboarding: ' + b.onboarding_status + ' / days: ' + b.days_attended)
  );

  // ========================================
  // STEP 6: Operative availability for booked operatives
  // ========================================
  console.log('\n--- STEP 6: Operative Availability ---');
  const availRecords = [];
  for (const b of bookData) {
    const start = new Date(b.start_date);
    const twoWeeksLater = new Date(start);
    twoWeeksLater.setDate(twoWeeksLater.getDate() + 13);

    let d = new Date(start);
    while (d <= twoWeeksLater) {
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) {
        availRecords.push({
          operative_id: b.operative_id,
          date: d.toISOString().split('T')[0],
          status: 'booked',
          booking_id: b.id,
        });
      }
      d.setDate(d.getDate() + 1);
    }
  }

  const { data: availData, error: availErr } = await supabase
    .from('operative_availability').insert(availRecords).select();
  if (availErr) console.error('  ERROR availability:', availErr.message);
  else console.log('  [OK] Created ' + availData.length + ' availability records');

  // Update operative statuses to booked
  const bookedOpIds = bookData.map(b => b.operative_id);
  for (const opId of bookedOpIds) {
    const booking = bookData.find(b => b.operative_id === opId);
    await supabase.from('agency_operatives')
      .update({ status: 'booked', current_booking_id: booking.id })
      .eq('id', opId);
  }
  console.log('  [OK] Updated ' + bookedOpIds.length + ' operative statuses to booked');

  // ========================================
  // SUMMARY
  // ========================================
  console.log('\n========================================');
  console.log('  SEED COMPLETE');
  console.log('========================================');
  console.log('  Agency connections: 5 (ABC Construction <-> all agencies)');
  console.log('  Projects: 2 (Peterborough Court L08, 22 Bishopsgate)');
  console.log('  Labour requests: ' + reqData.length);
  console.log('  Proposals: ' + propData.length);
  console.log('  Bookings: ' + bookData.length + ' (1 active, 2 confirmed)');
  console.log('  Availability records: ' + (availData?.length || 0));
  console.log('  Operatives updated: ' + bookedOpIds.length);
  console.log('');
  console.log('  NOTE: Overbury and Skanska M&E companies could not be');
  console.log('  created as separate entities due to RLS (requires');
  console.log('  service_role key). All data created under ABC Construction');
  console.log('  with projects representing the different work streams.');
  console.log('========================================');
})();
