/**
 * CoreSite Agency Labour Marketplace — Core Logic
 * Matching engine, distance calculation, trade/cert constants
 */

// ============================================================
// TRADE CATEGORIES
// ============================================================

export const TRADES = {
  // Electrical
  electrician: { label: 'Electrician', category: 'Electrical' },
  electrical_labourer: { label: 'Electrical Labourer', category: 'Electrical' },
  cable_tray_installer: { label: 'Cable Tray Installer', category: 'Electrical' },
  fire_alarm_engineer: { label: 'Fire Alarm Engineer', category: 'Electrical' },
  data_cabling_engineer: { label: 'Data Cabling Engineer', category: 'Electrical' },
  electrical_testing_engineer: { label: 'Electrical Testing Engineer', category: 'Electrical' },
  // Mechanical
  plumber: { label: 'Plumber', category: 'Mechanical' },
  pipefitter: { label: 'Pipefitter', category: 'Mechanical' },
  hvac_engineer: { label: 'HVAC Engineer', category: 'Mechanical' },
  ductwork_installer: { label: 'Ductwork Installer', category: 'Mechanical' },
  mechanical_labourer: { label: 'Mechanical Labourer', category: 'Mechanical' },
  commissioning_engineer: { label: 'Commissioning Engineer', category: 'Mechanical' },
  controls_engineer: { label: 'Controls Engineer', category: 'Mechanical' },
  // General
  general_labourer: { label: 'General Labourer', category: 'General' },
  banksman: { label: 'Banksman', category: 'General' },
  telehandler_operator: { label: 'Telehandler Operator', category: 'General' },
  crane_operator: { label: 'Crane Operator', category: 'General' },
  scaffolder: { label: 'Scaffolder', category: 'General' },
  steel_erector: { label: 'Steel Erector', category: 'General' },
  cladding_installer: { label: 'Cladding Installer', category: 'General' },
  // Finishing
  dryliner: { label: 'Dryliner', category: 'Finishing' },
  plasterer: { label: 'Plasterer', category: 'Finishing' },
  painter_decorator: { label: 'Painter & Decorator', category: 'Finishing' },
  tiler: { label: 'Tiler', category: 'Finishing' },
  carpet_fitter: { label: 'Carpet Fitter', category: 'Finishing' },
  ceiling_fixer: { label: 'Ceiling Fixer', category: 'Finishing' },
  // Fire Protection
  fire_stopper: { label: 'Fire Stopper', category: 'Fire Protection' },
  passive_fire_protection: { label: 'Passive Fire Protection', category: 'Fire Protection' },
  sprinkler_fitter: { label: 'Sprinkler Fitter', category: 'Fire Protection' },
  // Specialist
  asbestos_removal: { label: 'Asbestos Removal', category: 'Specialist' },
  demolition_operative: { label: 'Demolition Operative', category: 'Specialist' },
  ground_worker: { label: 'Ground Worker', category: 'Specialist' },
  concrete_finisher: { label: 'Concrete Finisher', category: 'Specialist' },
  bricklayer: { label: 'Bricklayer', category: 'Specialist' },
  roofer: { label: 'Roofer', category: 'Specialist' },
  glazier: { label: 'Glazier', category: 'Specialist' },
  joiner: { label: 'Joiner', category: 'Specialist' },
  // Supervision
  site_supervisor: { label: 'Site Supervisor', category: 'Supervision' },
  site_manager: { label: 'Site Manager', category: 'Supervision' },
  project_manager: { label: 'Project Manager', category: 'Supervision' },
  quantity_surveyor: { label: 'Quantity Surveyor', category: 'Supervision' },
  design_coordinator: { label: 'Design Coordinator', category: 'Supervision' },
  health_and_safety_advisor: { label: 'H&S Advisor', category: 'Supervision' },
  other: { label: 'Other', category: 'Other' },
}

export const TRADE_OPTIONS = Object.entries(TRADES).map(([value, { label, category }]) => ({ value, label, category }))

export const TRADE_CATEGORIES = [...new Set(Object.values(TRADES).map(t => t.category))]

// ============================================================
// CSCS/ECS CARD TYPES
// ============================================================

export const CARD_TYPES = {
  cscs_green_labourer: 'CSCS Green (Labourer)',
  cscs_blue_skilled: 'CSCS Blue (Skilled)',
  cscs_gold_advanced: 'CSCS Gold (Advanced)',
  cscs_gold_supervisor: 'CSCS Gold (Supervisor)',
  cscs_black_manager: 'CSCS Black (Manager)',
  cscs_white_professionally_qualified: 'CSCS White (Professionally Qualified)',
  cscs_red_provisional: 'CSCS Red (Provisional)',
  cscs_platinum_site_visitor: 'CSCS Platinum (Site Visitor)',
  ecs_gold_approved: 'ECS Gold (Approved)',
  ecs_blue_electrician: 'ECS Blue (Electrician)',
  ecs_green_labourer: 'ECS Green (Labourer)',
  ecs_white_apprentice: 'ECS White (Apprentice)',
  ecs_red_provisional: 'ECS Red (Provisional)',
  jib_gold_advanced: 'JIB Gold (Advanced)',
  jib_blue_skilled: 'JIB Blue (Skilled)',
  jib_red_trainee: 'JIB Red (Trainee)',
  cpcs_red_trained: 'CPCS Red (Trained)',
  cpcs_blue_competent: 'CPCS Blue (Competent)',
  other: 'Other',
  none: 'None',
}

// ============================================================
// CERTIFICATION TYPES
// ============================================================

export const CERT_TYPES = {
  ipaf_3a_scissor: 'IPAF 3a (Scissor Lift)',
  ipaf_3b_boom: 'IPAF 3b (Boom Lift)',
  ipaf_pav: 'IPAF PAV',
  pasma_towers: 'PASMA Towers',
  pasma_low_level: 'PASMA Low Level',
  sssts: 'SSSTS',
  smsts: 'SMSTS',
  cscs_health_safety_test: 'CSCS H&S Test',
  first_aid_at_work: 'First Aid at Work',
  emergency_first_aid: 'Emergency First Aid',
  fire_marshal: 'Fire Marshal',
  asbestos_awareness: 'Asbestos Awareness',
  manual_handling: 'Manual Handling',
  working_at_height: 'Working at Height',
  confined_spaces: 'Confined Spaces',
  face_fit_test: 'Face Fit Test',
  harness_training: 'Harness Training',
  abrasive_wheels: 'Abrasive Wheels',
  hot_works: 'Hot Works',
  electrical_isolation: 'Electrical Isolation',
  pat_testing: 'PAT Testing',
  '18th_edition': '18th Edition',
  '2391_inspection_testing': '2391 Inspection & Testing',
  unvented_hot_water: 'Unvented Hot Water',
  f_gas: 'F-Gas',
  acs_gas_safe: 'ACS Gas Safe',
  water_hygiene: 'Water Hygiene',
  legionella_awareness: 'Legionella Awareness',
  scaffolding_inspection: 'Scaffolding Inspection',
  banksman_slinger: 'Banksman / Slinger',
  telehandler: 'Telehandler',
  forklift: 'Forklift',
  excavator_360: 'Excavator 360',
  dumper: 'Dumper',
  roller: 'Roller',
  cpcs_crane: 'CPCS Crane',
  mental_health_first_aider: 'Mental Health First Aider',
  fire_stopping_bm_trada: 'Fire Stopping (BM TRADA)',
  fire_stopping_firas: 'Fire Stopping (FIRAS)',
  other: 'Other',
}

// ============================================================
// SKILL LEVELS (ordered)
// ============================================================

export const SKILL_LEVELS = [
  { value: 'labourer', label: 'Labourer', rank: 1 },
  { value: 'improver', label: 'Improver', rank: 2 },
  { value: 'skilled', label: 'Skilled', rank: 3 },
  { value: 'advanced', label: 'Advanced', rank: 4 },
  { value: 'supervisor', label: 'Supervisor', rank: 5 },
]

function skillRank(level) {
  return SKILL_LEVELS.find(s => s.value === level)?.rank || 0
}

// ============================================================
// POSTCODE DISTANCE (Haversine formula + postcodes.io)
// ============================================================

const postcodeCoordCache = new Map()

export async function getPostcodeCoords(postcode, supabase) {
  const clean = postcode.replace(/\s+/g, '').toUpperCase()
  if (postcodeCoordCache.has(clean)) return postcodeCoordCache.get(clean)

  // Check DB cache first
  if (supabase) {
    const { data } = await supabase.from('postcode_cache').select('latitude, longitude').eq('postcode', clean).single()
    if (data) {
      const coords = { lat: Number(data.latitude), lng: Number(data.longitude) }
      postcodeCoordCache.set(clean, coords)
      return coords
    }
  }

  // Fetch from postcodes.io
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`)
    if (!res.ok) return null
    const json = await res.json()
    if (json.status !== 200 || !json.result) return null
    const coords = { lat: json.result.latitude, lng: json.result.longitude }
    postcodeCoordCache.set(clean, coords)

    // Cache in DB
    if (supabase) {
      await supabase.from('postcode_cache').upsert({ postcode: clean, latitude: coords.lat, longitude: coords.lng }).catch(() => {})
    }
    return coords
  } catch {
    return null
  }
}

export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 3959 // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ============================================================
// MATCHING ENGINE
// ============================================================

/**
 * Match operatives to a labour request
 * @param {object} request - The labour request
 * @param {Array} operatives - All agency operatives to check
 * @param {Array} certifications - All operative certifications (flat array)
 * @param {Array} availability - All operative availability records for the date range
 * @param {object} options - { siteCoords, operativeCoords } for distance matching
 * @returns {Array<{ operative, matchStatus, matchScore, issues }>}
 */
export function matchOperatives(request, operatives, certifications, availability, options = {}) {
  const results = []
  const requestStart = new Date(request.start_date)
  const requestEnd = new Date(request.end_date)
  const requiredCerts = request.certifications_required || []

  for (const op of operatives) {
    const issues = []
    let score = 100
    let status = 'green'

    // 1. Trade match
    const secTrades = Array.isArray(op.secondary_trades) ? op.secondary_trades : []
    const trades = [op.primary_trade, ...secTrades]
    if (!trades.includes(request.trade_required)) {
      issues.push({ type: 'trade', message: `Trade mismatch: has ${TRADES[op.primary_trade]?.label || op.primary_trade}, needs ${TRADES[request.trade_required]?.label || request.trade_required}` })
      status = 'grey'
      score -= 50
    }

    // 2. Skill level
    if (request.skill_level_minimum && skillRank(op.skill_level) < skillRank(request.skill_level_minimum)) {
      issues.push({ type: 'skill', message: `Skill level: ${op.skill_level}, minimum required: ${request.skill_level_minimum}` })
      status = 'grey'
      score -= 30
    }

    // 3. CSCS card type
    if (request.cscs_card_type_required && op.cscs_card_type !== request.cscs_card_type_required) {
      issues.push({ type: 'card', message: `Card: has ${CARD_TYPES[op.cscs_card_type] || 'none'}, needs ${CARD_TYPES[request.cscs_card_type_required]}` })
      status = 'grey'
      score -= 20
    }

    // 4. Certifications
    const opCerts = certifications.filter(c => c.operative_id === op.id)
    for (const reqCert of requiredCerts) {
      const hasCert = opCerts.find(c => c.certification_type === reqCert)
      if (!hasCert) {
        issues.push({ type: 'cert_missing', message: `Missing: ${CERT_TYPES[reqCert] || reqCert}` })
        if (status !== 'grey') status = 'grey'
        score -= 15
      } else if (hasCert.expiry_date) {
        const expiry = new Date(hasCert.expiry_date)
        if (expiry < requestEnd) {
          issues.push({ type: 'cert_expired', message: `${CERT_TYPES[reqCert]} expires ${hasCert.expiry_date} (before booking ends)` })
          if (status === 'green') status = 'amber'
          score -= 10
        } else {
          const daysUntilExpiry = (expiry - requestEnd) / (1000 * 60 * 60 * 24)
          if (daysUntilExpiry < 14) {
            issues.push({ type: 'cert_expiring', message: `${CERT_TYPES[reqCert]} expires ${Math.round(daysUntilExpiry)} days after booking ends` })
            if (status === 'green') status = 'amber'
            score -= 5
          }
        }
      }
    }

    // 5. Availability
    const opAvail = availability.filter(a => a.operative_id === op.id)
    const bookedDates = opAvail.filter(a => a.status === 'booked' || a.status === 'unavailable')
    let conflictDates = 0
    const d = new Date(requestStart)
    const totalDays = Math.ceil((requestEnd - requestStart) / (1000 * 60 * 60 * 24)) + 1
    while (d <= requestEnd) {
      const dateStr = d.toISOString().split('T')[0]
      const isBooked = bookedDates.find(a => a.date === dateStr)
      if (isBooked) conflictDates++
      d.setDate(d.getDate() + 1)
    }
    if (conflictDates > 0) {
      if (conflictDates >= totalDays * 0.5) {
        issues.push({ type: 'availability', message: `Booked for ${conflictDates} of ${totalDays} requested days` })
        status = 'red'
        score -= 40
      } else {
        issues.push({ type: 'partial_availability', message: `Conflict on ${conflictDates} of ${totalDays} days` })
        if (status === 'green') status = 'amber'
        score -= 20
      }
    }

    // 6. Distance (if coords available)
    if (options.siteCoords && options.operativeCoords?.[op.id]) {
      const opCoords = options.operativeCoords[op.id]
      const dist = haversineDistance(opCoords.lat, opCoords.lng, options.siteCoords.lat, options.siteCoords.lng)
      if (dist > (op.willing_to_travel_miles || 30)) {
        issues.push({ type: 'distance', message: `${Math.round(dist)} miles away (max ${op.willing_to_travel_miles || 30})` })
        if (status === 'green') status = 'amber'
        score -= 10
      }
    }

    // Bonus points for experience and rating
    score += Math.min(10, (op.experience_years || 0))
    score += (op.rating || 0) * 2

    results.push({
      operative: op,
      matchStatus: status,
      matchScore: Math.max(0, Math.min(100, score)),
      issues,
    })
  }

  // Sort: green first, then amber, then red, then grey. Within each, by score desc.
  const statusOrder = { green: 0, amber: 1, red: 2, grey: 3 }
  results.sort((a, b) => {
    const statusDiff = (statusOrder[a.matchStatus] || 4) - (statusOrder[b.matchStatus] || 4)
    if (statusDiff !== 0) return statusDiff
    return b.matchScore - a.matchScore
  })

  return results
}

// ============================================================
// CSCS VERIFICATION (placeholder for Smart Check API)
// ============================================================

// eslint-disable-next-line no-unused-vars
export async function verifyCscsCard(registrationNumber) {
  // TODO: Integrate with CITB Smart Check API
  // When available, this function should:
  // 1. Accept a CSCS registration number
  // 2. Call the CITB verification endpoint
  // 3. Return: valid (boolean), card_type, expiry_date, holder_name
  // 4. Auto-populate the operative's CSCS fields
  return {
    verified: false,
    method: 'manual_review_required',
    message: 'Card uploaded — awaiting manual verification',
  }
}

// ============================================================
// HELPERS
// ============================================================

export const STATUS_COLORS = {
  green: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500', label: 'Available & Qualified' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Available — Minor Issues' },
  red: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500', label: 'Unavailable' },
  grey: { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', label: 'Does Not Meet Requirements' },
}

export const BOOKING_STATUSES = {
  confirmed: { label: 'Confirmed', color: 'blue' },
  active: { label: 'Active', color: 'green' },
  completed: { label: 'Completed', color: 'slate' },
  cancelled: { label: 'Cancelled', color: 'red' },
  no_show: { label: 'No Show', color: 'red' },
}

export const URGENCY_LABELS = {
  standard: { label: 'Standard', color: 'slate' },
  urgent: { label: 'Urgent', color: 'amber' },
  emergency: { label: 'Emergency', color: 'red' },
}

export function formatDayRate(pence) {
  if (!pence) return '—'
  return `£${(pence / 100).toFixed(2)}`
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
