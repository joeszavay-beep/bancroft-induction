const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://pbyxpeaeijuxkzktvwbd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXhwZWFlaWp1eGt6a3R2d2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODE0NTcsImV4cCI6MjA5MDQ1NzQ1N30.SHUqaTJkY-JBkdSpOLqB4PQeO4Q9xn1kIMavklGJ5_s'
);

const PROJECT_ID = '68c8298f-cd1b-4a4d-9739-f7e902200c84';
const COMPANY_ID = 'a3a6b344-8394-4ca6-8f07-3011b4513bbe';

// Existing agencies
const CROWN_ID = 'bbcb721c-8513-4c1e-8bd4-a24b2e98e710';
const VANGUARD_ID = '9aaf9acb-cc72-4c4e-a1ec-2db693101475';

// New agency IDs (will be created)
let PHOENIX_ID, APEX_ID, METRO_ID;

const LONDON_POSTCODES = [
  'SE1 7PB', 'SE16 4DG', 'SE10 0QJ', 'SW1A 1AA', 'SW11 3TN', 'SW8 4BG',
  'E1 6AN', 'E14 5AB', 'E15 2GW', 'E3 4QS', 'N1 9GU', 'N7 8LE', 'N22 6XJ',
  'W1D 3QR', 'W12 7RJ', 'W3 6RS', 'NW1 6XE', 'NW10 7AS', 'EC1V 9HQ',
  'EC2A 4BX', 'WC1E 7HU', 'WC2H 9JQ', 'HA0 1HB', 'HA9 0WS', 'UB3 1HB',
  'UB6 8DR', 'CR0 2RF', 'CR4 3EB', 'BR1 1LU', 'BR3 4AB', 'DA1 1DJ',
  'DA6 7LB', 'EN1 3PH', 'EN3 5TW', 'IG1 1BY', 'IG11 8NB', 'RM1 3ER',
  'RM10 7XS', 'TW1 3QS', 'TW7 6BD', 'KT1 1HB', 'KT6 7SA', 'SM1 4DP',
];

const PROJECT_NAMES = [
  'One Crown Place', '22 Bishopsgate', 'Battersea Power Station Phase 3',
  'The Shard Refurb', 'Canary Wharf E20', 'One Nine Elms', 'Southbank Place',
  'Principal Tower', 'London Wall Place', 'The Madison', '8 Bishopsgate',
  'One Blackfriars', '250 City Road', 'Wardian London', 'Royal Wharf',
  'Elephant Park', 'Silvertown Tunnel', 'Thames Tideway', 'HS2 Euston',
  'Brent Cross Town',
];

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min, max, dp = 1) { return parseFloat((Math.random() * (max - min) + min).toFixed(dp)); }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function normalRand(mean, sd) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const n = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return n * sd + mean;
}

function futureDate(daysMin, daysMax) {
  const d = new Date();
  d.setDate(d.getDate() + randInt(daysMin, daysMax));
  return d.toISOString().split('T')[0];
}

function pastDate(daysMin, daysMax) {
  const d = new Date();
  d.setDate(d.getDate() - randInt(daysMin, daysMax));
  return d.toISOString().split('T')[0];
}

// ============================================================
// OPERATIVES DATA (50 realistic UK construction names)
// ============================================================
const operativesData = [
  // --- Crown Electrical Services (10 more) ---
  { fn: 'Tomasz', ln: 'Kowalski', trade: 'electrician', skill: 'skilled', agency: 'crown' },
  { fn: 'Declan', ln: 'Murphy', trade: 'electrician', skill: 'advanced', agency: 'crown' },
  { fn: 'Callum', ln: 'Stewart', trade: 'cable_tray_installer', skill: 'skilled', agency: 'crown' },
  { fn: 'Ravi', ln: 'Sharma', trade: 'fire_alarm_engineer', skill: 'advanced', agency: 'crown' },
  { fn: 'James', ln: 'O\'Brien', trade: 'electrical_labourer', skill: 'labourer', agency: 'crown' },
  { fn: 'Piotr', ln: 'Nowak', trade: 'data_cabling_engineer', skill: 'skilled', agency: 'crown' },
  { fn: 'Connor', ln: 'Walsh', trade: 'electrician', skill: 'improver', agency: 'crown' },
  { fn: 'Deepak', ln: 'Patel', trade: 'electrical_testing_engineer', skill: 'advanced', agency: 'crown' },
  { fn: 'Ryan', ln: 'McCarthy', trade: 'electrician', skill: 'labourer', agency: 'crown' },
  { fn: 'Damian', ln: 'Zielinski', trade: 'site_supervisor', skill: 'supervisor', agency: 'crown' },

  // --- Vanguard M&E Labour (8 more) ---
  { fn: 'Stefan', ln: 'Popescu', trade: 'pipefitter', skill: 'skilled', agency: 'vanguard' },
  { fn: 'Liam', ln: 'Gallagher', trade: 'plumber', skill: 'advanced', agency: 'vanguard' },
  { fn: 'Adrian', ln: 'Ionescu', trade: 'ductwork_installer', skill: 'skilled', agency: 'vanguard' },
  { fn: 'Mark', ln: 'Thompson', trade: 'mechanical_labourer', skill: 'labourer', agency: 'vanguard' },
  { fn: 'Eoin', ln: 'Brennan', trade: 'hvac_engineer', skill: 'advanced', agency: 'vanguard' },
  { fn: 'Andrei', ln: 'Marin', trade: 'commissioning_engineer', skill: 'advanced', agency: 'vanguard' },
  { fn: 'Chris', ln: 'Doyle', trade: 'plumber', skill: 'improver', agency: 'vanguard' },
  { fn: 'Vikram', ln: 'Singh', trade: 'site_supervisor', skill: 'supervisor', agency: 'vanguard' },

  // --- Phoenix Fire Protection (10) ---
  { fn: 'Sean', ln: 'Kelly', trade: 'fire_stopper', skill: 'skilled', agency: 'phoenix' },
  { fn: 'Marian', ln: 'Dumitru', trade: 'fire_stopper', skill: 'skilled', agency: 'phoenix' },
  { fn: 'Niall', ln: 'Fitzgerald', trade: 'passive_fire_protection', skill: 'advanced', agency: 'phoenix' },
  { fn: 'Raj', ln: 'Kumar', trade: 'sprinkler_fitter', skill: 'skilled', agency: 'phoenix' },
  { fn: 'Bogdan', ln: 'Radu', trade: 'fire_stopper', skill: 'labourer', agency: 'phoenix' },
  { fn: 'Patrick', ln: 'Byrne', trade: 'passive_fire_protection', skill: 'skilled', agency: 'phoenix' },
  { fn: 'Arun', ln: 'Nair', trade: 'sprinkler_fitter', skill: 'improver', agency: 'phoenix' },
  { fn: 'Darren', ln: 'Quinn', trade: 'fire_stopper', skill: 'advanced', agency: 'phoenix' },
  { fn: 'Cosmin', ln: 'Gheorghe', trade: 'fire_stopper', skill: 'labourer', agency: 'phoenix' },
  { fn: 'Michael', ln: 'Flanagan', trade: 'site_supervisor', skill: 'supervisor', agency: 'phoenix' },

  // --- Apex Mechanical Services (10) ---
  { fn: 'Marek', ln: 'Wojciechowski', trade: 'hvac_engineer', skill: 'skilled', agency: 'apex' },
  { fn: 'Danny', ln: 'Sullivan', trade: 'pipefitter', skill: 'advanced', agency: 'apex' },
  { fn: 'Ciprian', ln: 'Stoica', trade: 'ductwork_installer', skill: 'skilled', agency: 'apex' },
  { fn: 'Pradeep', ln: 'Reddy', trade: 'commissioning_engineer', skill: 'advanced', agency: 'apex' },
  { fn: 'Kieran', ln: 'Donnelly', trade: 'controls_engineer', skill: 'advanced', agency: 'apex' },
  { fn: 'Lukasz', ln: 'Kaczmarek', trade: 'ductwork_installer', skill: 'labourer', agency: 'apex' },
  { fn: 'Owen', ln: 'Reilly', trade: 'plumber', skill: 'improver', agency: 'apex' },
  { fn: 'Sanjay', ln: 'Gupta', trade: 'hvac_engineer', skill: 'advanced', agency: 'apex' },
  { fn: 'Florin', ln: 'Barbu', trade: 'mechanical_labourer', skill: 'labourer', agency: 'apex' },
  { fn: 'Brendan', ln: 'Maguire', trade: 'site_manager', skill: 'supervisor', agency: 'apex' },

  // --- Metro Labour Solutions (12) ---
  { fn: 'Kevin', ln: 'Taylor', trade: 'general_labourer', skill: 'labourer', agency: 'metro' },
  { fn: 'Ion', ln: 'Moldovan', trade: 'general_labourer', skill: 'labourer', agency: 'metro' },
  { fn: 'Daryl', ln: 'Hughes', trade: 'dryliner', skill: 'skilled', agency: 'metro' },
  { fn: 'Arjun', ln: 'Yadav', trade: 'painter_decorator', skill: 'skilled', agency: 'metro' },
  { fn: 'Jakub', ln: 'Lewandowski', trade: 'ceiling_fixer', skill: 'skilled', agency: 'metro' },
  { fn: 'Shane', ln: 'Carroll', trade: 'plasterer', skill: 'advanced', agency: 'metro' },
  { fn: 'Vasile', ln: 'Popa', trade: 'tiler', skill: 'skilled', agency: 'metro' },
  { fn: 'Nathan', ln: 'Williams', trade: 'scaffolder', skill: 'skilled', agency: 'metro' },
  { fn: 'Amit', ln: 'Verma', trade: 'general_labourer', skill: 'labourer', agency: 'metro' },
  { fn: 'Cian', ln: 'Ryan', trade: 'banksman', skill: 'skilled', agency: 'metro' },
  { fn: 'George', ln: 'Stanescu', trade: 'cladding_installer', skill: 'improver', agency: 'metro' },
  { fn: 'Terry', ln: 'Jackson', trade: 'site_supervisor', skill: 'supervisor', agency: 'metro' },
];

function getAgencyId(agencyKey) {
  switch (agencyKey) {
    case 'crown': return CROWN_ID;
    case 'vanguard': return VANGUARD_ID;
    case 'phoenix': return PHOENIX_ID;
    case 'apex': return APEX_ID;
    case 'metro': return METRO_ID;
  }
}

function getAgencyEmail(agencyKey) {
  switch (agencyKey) {
    case 'crown': return 'crownelectrical.co.uk';
    case 'vanguard': return 'vanguardme.co.uk';
    case 'phoenix': return 'phoenixfp.co.uk';
    case 'apex': return 'apexmech.co.uk';
    case 'metro': return 'metrolabour.co.uk';
  }
}

function getCardType(trade, skill) {
  const elecTrades = ['electrician', 'electrical_labourer', 'cable_tray_installer', 'fire_alarm_engineer', 'data_cabling_engineer', 'electrical_testing_engineer'];
  const mechTrades = ['plumber', 'pipefitter'];
  const isElec = elecTrades.includes(trade);
  const isMech = mechTrades.includes(trade);

  if (skill === 'supervisor') return 'cscs_gold_supervisor';
  if (skill === 'labourer') return isElec ? 'ecs_green_labourer' : 'cscs_green_labourer';
  if (skill === 'improver') return isElec ? 'ecs_white_apprentice' : 'cscs_red_provisional';
  if (skill === 'advanced') {
    if (isElec) return 'ecs_gold_approved';
    if (isMech) return 'jib_gold_advanced';
    return 'cscs_gold_advanced';
  }
  // skilled
  if (isElec) return 'ecs_blue_electrician';
  if (isMech) return 'jib_blue_skilled';
  return 'cscs_blue_skilled';
}

function getDayRate(skill) {
  switch (skill) {
    case 'labourer': return randInt(14000, 16000);
    case 'improver': return randInt(16000, 20000);
    case 'skilled': return randInt(22000, 28000);
    case 'advanced': return randInt(28000, 35000);
    case 'supervisor': return randInt(35000, 45000);
    default: return 20000;
  }
}

function getExperienceYears(skill) {
  switch (skill) {
    case 'labourer': return randInt(0, 4);
    case 'improver': return randInt(2, 6);
    case 'skilled': return randInt(4, 12);
    case 'advanced': return randInt(8, 20);
    case 'supervisor': return randInt(12, 25);
    default: return 3;
  }
}

function buildOperativeRecord(op, index) {
  const agencyId = getAgencyId(op.agency);
  const email = `${op.fn.toLowerCase()}.${op.ln.toLowerCase().replace(/'/g, '')}@${getAgencyEmail(op.agency)}`;
  const phone = `07${randInt(400, 999)}${String(randInt(100000, 999999)).padStart(6, '0')}`;
  const skill = op.skill;
  const trade = op.trade;

  // Status distribution: 35 available, 10 booked, 5 unavailable
  let status;
  if (index < 35) status = 'available';
  else if (index < 45) status = 'booked';
  else status = 'unavailable';

  const experienceYears = getExperienceYears(skill);
  const rating = Math.max(2.5, Math.min(5.0, parseFloat(normalRand(4.0, 0.5).toFixed(1))));
  const hasTransport = Math.random() < 0.6;
  const hasTools = skill === 'labourer' ? Math.random() < 0.2 : Math.random() < 0.7;

  // CSCS expiry: most 2027, some 2026, a few expiring soon
  let cscsExpiry;
  if (index % 15 === 0) cscsExpiry = futureDate(10, 25); // expiring very soon
  else if (index % 7 === 0) cscsExpiry = '2026-' + String(randInt(6, 12)).padStart(2, '0') + '-' + String(randInt(1, 28)).padStart(2, '0');
  else cscsExpiry = '2027-' + String(randInt(1, 12)).padStart(2, '0') + '-' + String(randInt(1, 28)).padStart(2, '0');

  // Secondary trades
  const secondaryOptions = {
    electrician: ['cable_tray_installer', 'fire_alarm_engineer', 'data_cabling_engineer'],
    plumber: ['pipefitter', 'hvac_engineer'],
    pipefitter: ['plumber', 'hvac_engineer'],
    hvac_engineer: ['pipefitter', 'commissioning_engineer', 'controls_engineer'],
    fire_stopper: ['passive_fire_protection'],
    passive_fire_protection: ['fire_stopper', 'sprinkler_fitter'],
    sprinkler_fitter: ['pipefitter', 'passive_fire_protection'],
    dryliner: ['ceiling_fixer', 'plasterer'],
    plasterer: ['dryliner', 'painter_decorator'],
    general_labourer: ['banksman'],
    ductwork_installer: ['hvac_engineer'],
    commissioning_engineer: ['controls_engineer', 'hvac_engineer'],
    site_supervisor: ['site_manager'],
    site_manager: ['site_supervisor', 'project_manager'],
  };
  let secondaryTrades = null;
  const opts = secondaryOptions[trade];
  if (opts && Math.random() < 0.35) {
    secondaryTrades = [pick(opts)];
    if (opts.length > 1 && Math.random() < 0.2) secondaryTrades.push(opts.find(t => t !== secondaryTrades[0]));
  }

  const totalBookings = status === 'available' && experienceYears < 2 ? randInt(0, 5) : randInt(3, 30);
  const totalDaysWorked = Math.min(400, totalBookings * randInt(5, 20));
  const avgAttendance = randFloat(75, 100, 0);

  const lastProjectName = (status === 'booked' || totalBookings > 5) ? pick(PROJECT_NAMES) : null;

  return {
    agency_id: agencyId,
    first_name: op.fn,
    last_name: op.ln,
    email,
    phone,
    primary_trade: trade,
    secondary_trades: secondaryTrades,
    skill_level: skill,
    cscs_card_type: getCardType(trade, skill),
    cscs_expiry_date: cscsExpiry,
    day_rate: getDayRate(skill),
    experience_years: experienceYears,
    status,
    postcode: pick(LONDON_POSTCODES),
    has_own_transport: hasTransport,
    has_own_tools: hasTools,
    willing_to_travel_miles: randInt(15, 50),
    rating,
    total_bookings: totalBookings,
    total_days_worked: totalDaysWorked,
    average_attendance_percentage: avgAttendance,
    last_project_name: lastProjectName,
  };
}

function buildCertifications(operativeId, agencyId, trade, skill, index) {
  const certs = [];
  const now = new Date();

  function addCert(type, expiryDaysMin, expiryDaysMax, issuedDaysAgo) {
    let expiryDate;
    if (expiryDaysMin < 0) {
      // already expired
      expiryDate = pastDate(-expiryDaysMax, -expiryDaysMin);
    } else {
      expiryDate = futureDate(expiryDaysMin, expiryDaysMax);
    }
    certs.push({
      operative_id: operativeId,
      certification_type: type,
      certificate_number: `CERT-${String(randInt(100000, 999999))}`,
      date_issued: pastDate(issuedDaysAgo || 365, (issuedDaysAgo || 365) + 365),
      expiry_date: expiryDate,
    });
  }

  // Everyone gets CSCS H&S test
  addCert('cscs_health_safety_test', 200, 800, 500);

  const elecTrades = ['electrician', 'electrical_labourer', 'cable_tray_installer', 'fire_alarm_engineer', 'data_cabling_engineer', 'electrical_testing_engineer'];
  const mechTrades = ['plumber', 'pipefitter', 'hvac_engineer', 'ductwork_installer', 'mechanical_labourer', 'commissioning_engineer', 'controls_engineer'];
  const fireTrades = ['fire_stopper', 'passive_fire_protection', 'sprinkler_fitter'];
  const isElec = elecTrades.includes(trade);
  const isMech = mechTrades.includes(trade);
  const isFire = fireTrades.includes(trade);

  // Trade-specific certs
  if (isElec) {
    addCert('18th_edition', 300, 900, 400);
    if (skill === 'advanced' || (skill === 'skilled' && Math.random() < 0.4)) {
      addCert('2391_inspection_testing', 300, 900, 500);
    }
    if (Math.random() < 0.3) addCert('pat_testing', 200, 700, 300);
  }

  if (isMech) {
    addCert('working_at_height', 200, 700, 300);
    if (trade === 'hvac_engineer' && Math.random() < 0.5) addCert('f_gas', 300, 900, 400);
    if (trade === 'hvac_engineer' && Math.random() < 0.3) addCert('acs_gas_safe', 300, 900, 500);
    if (trade === 'plumber' && Math.random() < 0.4) addCert('unvented_hot_water', 300, 900, 400);
  }

  if (isFire) {
    if (Math.random() < 0.6) addCert('fire_stopping_bm_trada', 300, 900, 400);
    else addCert('fire_stopping_firas', 300, 900, 400);
    addCert('fire_marshal', 200, 700, 300);
  }

  // Skilled+ get working at height (if not already added)
  if (['skilled', 'advanced', 'supervisor'].includes(skill) && !certs.find(c => c.certification_type === 'working_at_height')) {
    addCert('working_at_height', 200, 700, 300);
  }

  // Supervisors
  if (skill === 'supervisor') {
    if (Math.random() < 0.6) addCert('smsts', 300, 900, 500);
    else addCert('sssts', 300, 900, 400);
    addCert('first_aid_at_work', 200, 700, 300);
  }

  // Random extras
  if (Math.random() < 0.4) addCert('manual_handling', 200, 700, 200);
  if (Math.random() < 0.35) addCert('asbestos_awareness', 200, 700, 300);
  if (Math.random() < 0.2) addCert('ipaf_3a_scissor', 200, 700, 300);
  if (Math.random() < 0.1) addCert('ipaf_3b_boom', 200, 700, 300);
  if (Math.random() < 0.15) addCert('pasma_towers', 200, 700, 300);

  // Make some certs expire soon (within 30 days) for testing alerts
  if (index % 8 === 0 && certs.length > 1) {
    certs[1].expiry_date = futureDate(5, 28);
  }

  // Make some certs already expired for testing warnings
  if (index % 12 === 0 && certs.length > 2) {
    const d = new Date();
    d.setDate(d.getDate() - randInt(5, 60));
    certs[2].expiry_date = d.toISOString().split('T')[0];
  }

  return certs;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('=== CoreSite Marketplace Seed Script ===\n');

  // 1. Sign in
  console.log('1. Signing in...');
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'demo@coresite.io',
    password: 'Demo2026!'
  });
  if (authErr) { console.error('Auth error:', authErr.message); process.exit(1); }
  console.log('   Signed in as:', authData.user.email);

  // 2. Create 3 new agencies
  console.log('\n2. Creating 3 new agencies...');
  const newAgencies = [
    {
      company_name: 'Phoenix Fire Protection',
      trading_name: 'Phoenix FP',
      primary_contact_name: 'Paul Doyle',
      primary_contact_email: 'paul.doyle@phoenixfp.co.uk',
      primary_contact_phone: '020 7946 0201',
      registered_address: '14 Bermondsey Street, London SE1 3TJ',
      status: 'approved',
      company_registration_number: 'FP' + randInt(100000, 999999),
    },
    {
      company_name: 'Apex Mechanical Services',
      trading_name: 'Apex Mech',
      primary_contact_name: 'Sarah Mitchell',
      primary_contact_email: 'sarah.mitchell@apexmech.co.uk',
      primary_contact_phone: '020 7946 0202',
      registered_address: '22 Tooley Street, London SE1 2SZ',
      status: 'approved',
      company_registration_number: 'AM' + randInt(100000, 999999),
    },
    {
      company_name: 'Metro Labour Solutions',
      trading_name: 'Metro Labour',
      primary_contact_name: 'Dave Wilson',
      primary_contact_email: 'dave.wilson@metrolabour.co.uk',
      primary_contact_phone: '020 7946 0203',
      registered_address: '8 Borough High Street, London SE1 9QQ',
      status: 'approved',
      company_registration_number: 'ML' + randInt(100000, 999999),
    },
  ];

  const { data: agencies, error: agencyErr } = await supabase
    .from('agencies')
    .insert(newAgencies)
    .select('id, company_name');
  if (agencyErr) { console.error('Agency insert error:', agencyErr.message); process.exit(1); }

  PHOENIX_ID = agencies.find(a => a.company_name === 'Phoenix Fire Protection').id;
  APEX_ID = agencies.find(a => a.company_name === 'Apex Mechanical Services').id;
  METRO_ID = agencies.find(a => a.company_name === 'Metro Labour Solutions').id;

  console.log('   Phoenix Fire Protection:', PHOENIX_ID);
  console.log('   Apex Mechanical Services:', APEX_ID);
  console.log('   Metro Labour Solutions:', METRO_ID);

  // 3. Create 50 operatives
  console.log('\n3. Creating 50 operatives...');
  const operativeRecords = operativesData.map((op, i) => buildOperativeRecord(op, i));

  // Insert in batches of 25
  const allInsertedOps = [];
  for (let i = 0; i < operativeRecords.length; i += 25) {
    const batch = operativeRecords.slice(i, i + 25);
    const { data: inserted, error: opErr } = await supabase
      .from('agency_operatives')
      .insert(batch)
      .select('id, first_name, last_name, agency_id, primary_trade, skill_level');
    if (opErr) { console.error(`Operative batch ${i} error:`, opErr.message); process.exit(1); }
    allInsertedOps.push(...inserted);
    console.log(`   Batch ${Math.floor(i / 25) + 1}: ${inserted.length} operatives inserted`);
  }
  console.log(`   Total operatives created: ${allInsertedOps.length}`);

  // Count by agency
  const byCrown = allInsertedOps.filter(o => o.agency_id === CROWN_ID).length;
  const byVanguard = allInsertedOps.filter(o => o.agency_id === VANGUARD_ID).length;
  const byPhoenix = allInsertedOps.filter(o => o.agency_id === PHOENIX_ID).length;
  const byApex = allInsertedOps.filter(o => o.agency_id === APEX_ID).length;
  const byMetro = allInsertedOps.filter(o => o.agency_id === METRO_ID).length;
  console.log(`   Crown: ${byCrown}, Vanguard: ${byVanguard}, Phoenix: ${byPhoenix}, Apex: ${byApex}, Metro: ${byMetro}`);

  // 4. Create certifications for each operative
  console.log('\n4. Creating certifications...');
  let allCerts = [];
  allInsertedOps.forEach((op, i) => {
    const origData = operativesData[i];
    const certs = buildCertifications(op.id, op.agency_id, origData.trade, origData.skill, i);
    allCerts.push(...certs);
  });

  // Insert certs in batches
  let certCount = 0;
  for (let i = 0; i < allCerts.length; i += 50) {
    const batch = allCerts.slice(i, i + 50);
    const { error: certErr } = await supabase.from('operative_certifications').insert(batch);
    if (certErr) { console.error(`Cert batch error:`, certErr.message); process.exit(1); }
    certCount += batch.length;
  }
  console.log(`   Total certifications created: ${certCount}`);

  // 5. Create 5 labour requests
  console.log('\n5. Creating 5 labour requests...');
  const labourRequests = [
    {
      company_id: COMPANY_ID,
      project_id: PROJECT_ID,
      created_by: 'Demo Manager',
      trade_required: 'ductwork_installer',
      number_of_operatives: 4,
      skill_level_minimum: 'skilled',
      certifications_required: ['working_at_height', 'ipaf_3a_scissor'],
      start_date: '2026-05-04',
      end_date: '2026-05-29',
      working_days: 'mon_fri',
      working_hours: '07:30 - 17:00',
      site_name: 'One Crown Place',
      site_address: '1 Sun Street, London',
      site_postcode: 'EC2A 2EP',
      day_rate_offered: 24000,
      urgency: 'urgent',
      status: 'open',
      description: '4x experienced ductwork installers needed for Level 3-5 installation. Must have IPAF 3a for scissor lift access to high-level runs. Start ASAP.',
      ppe_requirements: 'Hard hat, hi-vis, steel toe boots, safety glasses, harness',
    },
    {
      company_id: COMPANY_ID,
      project_id: PROJECT_ID,
      created_by: 'Demo Manager',
      trade_required: 'fire_alarm_engineer',
      number_of_operatives: 2,
      skill_level_minimum: 'advanced',
      certifications_required: ['18th_edition'],
      start_date: '2026-04-20',
      end_date: '2026-05-15',
      working_days: 'mon_fri',
      working_hours: '08:00 - 17:00',
      site_name: '22 Bishopsgate',
      site_address: '22 Bishopsgate, London',
      site_postcode: 'EC2N 4BQ',
      day_rate_offered: 32000,
      urgency: 'standard',
      status: 'open',

      description: '2x fire alarm engineers for commissioning and loop testing on Levels 10-15. Must hold 18th Edition.',
    },
    {
      company_id: COMPANY_ID,
      project_id: PROJECT_ID,
      created_by: 'Demo Manager',
      trade_required: 'general_labourer',
      number_of_operatives: 6,
      skill_level_minimum: 'labourer',
      certifications_required: null,
      start_date: '2026-04-14',
      end_date: '2026-06-26',
      working_days: 'mon_fri',
      working_hours: '07:00 - 16:30',
      site_name: 'Battersea Power Station Phase 3',
      site_address: '188 Kirtling Street, London',
      site_postcode: 'SW8 5BN',
      day_rate_offered: 15000,
      urgency: 'standard',
      status: 'open',

      description: '6x general labourers for ongoing site clearance, material distribution, and trade support. Long-term placement available for reliable workers.',
    },
    {
      company_id: COMPANY_ID,
      project_id: PROJECT_ID,
      created_by: 'Demo Manager',
      trade_required: 'commissioning_engineer',
      number_of_operatives: 1,
      skill_level_minimum: 'advanced',
      certifications_required: ['working_at_height'],
      start_date: '2026-06-01',
      end_date: '2026-06-26',
      working_days: 'mon_fri',
      working_hours: '08:00 - 18:00',
      site_name: 'Canary Wharf E20',
      site_address: 'Bank Street, London',
      site_postcode: 'E14 5NR',
      day_rate_offered: 38000,
      urgency: 'standard',
      status: 'open',

      description: '1x experienced commissioning engineer for AHU and FCU commissioning. Must have at least 8 years experience in commercial M&E.',
    },
    {
      company_id: COMPANY_ID,
      project_id: PROJECT_ID,
      created_by: 'Demo Manager',
      trade_required: 'fire_stopper',
      number_of_operatives: 3,
      skill_level_minimum: 'skilled',
      certifications_required: ['fire_stopping_bm_trada'],
      start_date: '2026-05-11',
      end_date: '2026-06-05',
      working_days: 'mon_fri',
      working_hours: '07:30 - 17:00',
      site_name: 'One Nine Elms',
      site_address: '1 Nine Elms Lane, London',
      site_postcode: 'SW8 5NQ',
      day_rate_offered: 26000,
      urgency: 'emergency',
      status: 'open',

      description: '3x fire stoppers URGENTLY needed — inspection in 4 weeks. Must hold BM TRADA certification. Previous high-rise experience essential.',
      ppe_requirements: 'Hard hat, hi-vis, steel toe boots, RPE mask',
    },
  ];

  const { data: insertedRequests, error: reqErr } = await supabase
    .from('labour_requests')
    .insert(labourRequests)
    .select('id, trade_required, number_of_operatives, urgency');
  if (reqErr) { console.error('Labour request error:', reqErr.message); process.exit(1); }
  console.log(`   ${insertedRequests.length} labour requests created`);
  insertedRequests.forEach(r => console.log(`   - ${r.trade_required} x${r.number_of_operatives} (${r.urgency})`));

  // 6. Create proposals for the first 3 requests
  console.log('\n6. Creating proposals...');

  // Helper: find operatives by trade/agency
  function findOps(trade, agencyKey, limit) {
    const aid = getAgencyId(agencyKey);
    return allInsertedOps.filter(o => o.primary_trade === trade && o.agency_id === aid).slice(0, limit);
  }

  const proposals = [];

  // Request 1: ductwork_installer — propose from Vanguard and Apex
  const req1 = insertedRequests[0];
  const ductVanguard = allInsertedOps.filter(o => o.primary_trade === 'ductwork_installer' && o.agency_id === VANGUARD_ID);
  const ductApex = allInsertedOps.filter(o => o.primary_trade === 'ductwork_installer' && o.agency_id === APEX_ID);
  if (ductVanguard[0]) proposals.push({ labour_request_id: req1.id, agency_id: VANGUARD_ID, operative_id: ductVanguard[0].id, status: 'proposed', match_score: 92, match_status: 'green', proposed_day_rate: 24000, proposed_at: new Date().toISOString() });
  if (ductApex[0]) proposals.push({ labour_request_id: req1.id, agency_id: APEX_ID, operative_id: ductApex[0].id, status: 'proposed', match_score: 88, match_status: 'green', proposed_day_rate: 25000, proposed_at: new Date().toISOString() });
  if (ductApex[1]) proposals.push({ labour_request_id: req1.id, agency_id: APEX_ID, operative_id: ductApex[1].id, status: 'proposed', match_score: 61, match_status: 'amber', proposed_day_rate: 18000, proposed_at: new Date().toISOString() });

  // Request 2: fire_alarm_engineer — propose from Crown
  const req2 = insertedRequests[1];
  const fireAlarmCrown = allInsertedOps.filter(o => o.primary_trade === 'fire_alarm_engineer' && o.agency_id === CROWN_ID);
  if (fireAlarmCrown[0]) proposals.push({ labour_request_id: req2.id, agency_id: CROWN_ID, operative_id: fireAlarmCrown[0].id, status: 'proposed', match_score: 95, match_status: 'green', proposed_day_rate: 32000, proposed_at: new Date().toISOString() });
  // Also propose an electrician with secondary trade
  const elecAdvanced = allInsertedOps.filter(o => o.primary_trade === 'electrician' && o.skill_level === 'advanced' && o.agency_id === CROWN_ID);
  if (elecAdvanced[0]) proposals.push({ labour_request_id: req2.id, agency_id: CROWN_ID, operative_id: elecAdvanced[0].id, status: 'proposed', match_score: 72, match_status: 'amber', proposed_day_rate: 30000, proposed_at: new Date().toISOString() });

  // Request 3: general_labourer — propose from Metro and Vanguard
  const req3 = insertedRequests[2];
  const labourerMetro = allInsertedOps.filter(o => o.primary_trade === 'general_labourer' && o.agency_id === METRO_ID);
  const labourerVanguard = allInsertedOps.filter(o => o.skill_level === 'labourer' && o.agency_id === VANGUARD_ID);
  if (labourerMetro[0]) proposals.push({ labour_request_id: req3.id, agency_id: METRO_ID, operative_id: labourerMetro[0].id, status: 'proposed', match_score: 90, match_status: 'green', proposed_day_rate: 15000, proposed_at: new Date().toISOString() });
  if (labourerMetro[1]) proposals.push({ labour_request_id: req3.id, agency_id: METRO_ID, operative_id: labourerMetro[1].id, status: 'proposed', match_score: 87, match_status: 'green', proposed_day_rate: 15000, proposed_at: new Date().toISOString() });
  if (labourerVanguard[0]) proposals.push({ labour_request_id: req3.id, agency_id: VANGUARD_ID, operative_id: labourerVanguard[0].id, status: 'proposed', match_score: 55, match_status: 'red', proposed_day_rate: 16000, proposed_at: new Date().toISOString() });

  if (proposals.length > 0) {
    const { error: propErr } = await supabase.from('labour_proposals').insert(proposals);
    if (propErr) { console.error('Proposal error:', propErr.message); process.exit(1); }
    console.log(`   ${proposals.length} proposals created`);
  } else {
    console.log('   WARNING: No matching operatives found for proposals');
  }

  // Summary
  console.log('\n========================================');
  console.log('SEED COMPLETE');
  console.log('========================================');
  console.log(`Agencies created:      3 (total 5)`);
  console.log(`Operatives created:    ${allInsertedOps.length}`);
  console.log(`Certifications:        ${certCount}`);
  console.log(`Labour requests:       ${insertedRequests.length}`);
  console.log(`Proposals:             ${proposals.length}`);
  console.log('========================================\n');

  // Skill level distribution
  const skillDist = {};
  operativesData.forEach(o => { skillDist[o.skill] = (skillDist[o.skill] || 0) + 1; });
  console.log('Skill distribution:', skillDist);

  // Trade distribution
  const tradeDist = {};
  operativesData.forEach(o => {
    const cat = { electrician: 'Electrical', electrical_labourer: 'Electrical', cable_tray_installer: 'Electrical', fire_alarm_engineer: 'Electrical', data_cabling_engineer: 'Electrical', electrical_testing_engineer: 'Electrical', plumber: 'Mechanical', pipefitter: 'Mechanical', hvac_engineer: 'Mechanical', ductwork_installer: 'Mechanical', mechanical_labourer: 'Mechanical', commissioning_engineer: 'Mechanical', controls_engineer: 'Mechanical', general_labourer: 'General', banksman: 'General', scaffolder: 'General', cladding_installer: 'General', dryliner: 'Finishing', plasterer: 'Finishing', painter_decorator: 'Finishing', tiler: 'Finishing', ceiling_fixer: 'Finishing', fire_stopper: 'Fire Protection', passive_fire_protection: 'Fire Protection', sprinkler_fitter: 'Fire Protection', site_supervisor: 'Supervision', site_manager: 'Supervision' }[o.trade] || 'Other';
    tradeDist[cat] = (tradeDist[cat] || 0) + 1;
  });
  console.log('Trade categories:', tradeDist);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
