/**
 * CoreSite Procurement Scheduler — Date Algorithm
 *
 * Reverse-schedules four upstream milestones from a Required On Site date.
 * All weekday values follow ISO: Mon=1 … Sun=7.
 */

// ── Weekday helpers (ISO: Mon=1 … Sun=7) ──

function isoWeekday(date) {
  const d = date.getDay() // 0=Sun … 6=Sat
  return d === 0 ? 7 : d
}

/**
 * Snap a date BACKWARDS to the target ISO weekday.
 * If already on that weekday, return the same date.
 */
function snapBackward(date, targetWeekday) {
  const diff = (isoWeekday(date) - targetWeekday + 7) % 7
  if (diff === 0) return new Date(date)
  const result = new Date(date)
  result.setDate(result.getDate() - diff)
  return result
}

/**
 * Add (or subtract) calendar days to a date.
 */
function addDays(date, days) {
  const r = new Date(date)
  r.setDate(r.getDate() + days)
  return r
}

/**
 * Strip time, returning a date at midnight UTC.
 */
function dateOnly(d) {
  if (!d) return null
  const dt = typeof d === 'string' ? new Date(d) : new Date(d)
  if (isNaN(dt)) return null
  return new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()))
}

// ── UK Bank Holidays (2026–2028 — extend as needed) ──

const UK_HOLIDAYS = new Set([
  // 2026
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25',
  '2026-08-31', '2026-12-25', '2026-12-28',
  // 2027
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31',
  '2027-08-30', '2027-12-27', '2027-12-28',
  // 2028
  '2028-01-03', '2028-04-14', '2028-04-17', '2028-05-01', '2028-05-29',
  '2028-08-28', '2028-12-25', '2028-12-26',
])

export function isUKHoliday(date) {
  const d = dateOnly(date)
  if (!d) return false
  return UK_HOLIDAYS.has(d.toISOString().slice(0, 10))
}

export function isWorkingDay(date) {
  const d = dateOnly(date)
  if (!d) return false
  const wd = isoWeekday(d)
  return wd >= 1 && wd <= 5 && !isUKHoliday(d)
}

/**
 * Subtract N working days from a date (skips weekends + UK holidays).
 */
export function subtractWorkingDays(date, days) {
  const d = dateOnly(date)
  if (!d || !days) return d
  let remaining = days
  const result = new Date(d)
  while (remaining > 0) {
    result.setDate(result.getDate() - 1)
    if (isWorkingDay(result)) remaining--
  }
  return result
}

/**
 * Count working days between two dates (exclusive of end).
 */
export function countWorkingDays(start, end) {
  const s = dateOnly(start)
  const e = dateOnly(end)
  if (!s || !e) return 0
  let count = 0
  const d = new Date(s)
  const dir = e >= s ? 1 : -1
  while (dir > 0 ? d < e : d > e) {
    if (isWorkingDay(d)) count++
    d.setDate(d.getDate() + dir)
  }
  return count
}

/**
 * Count calendar days between two dates.
 */
export function countCalendarDays(start, end) {
  const s = dateOnly(start)
  const e = dateOnly(end)
  if (!s || !e) return 0
  return Math.round((e - s) / (24 * 60 * 60 * 1000))
}

// ── Default scheduling rules ──

export const DEFAULT_RULES = {
  deliveryWeeksBefore: 1,
  orderPlacedWeekday: 1,    // Mon
  approvalWeekday: 5,       // Fri
  techSubDaysBefore: 10,
  techSubDaysType: 'calendar', // 'calendar' or 'working'
  techSubWeekday: 1,        // Mon
}

export const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
]

// ── Core algorithm ──

/**
 * Compute all four upstream milestones from Required On Site + Lead Time.
 *
 * @param {Date|string} onSite - Required On Site date
 * @param {number} leadWeeks - Lead time in weeks (integer)
 * @param {object} rules - Project-wide scheduling rules
 * @returns {{ delivery, orderPlaced, approvalRequired, techSubIssue } | null}
 */
export function computeMilestones(onSite, leadWeeks, rules = DEFAULT_RULES) {
  const onSiteDate = dateOnly(onSite)
  if (!onSiteDate || !leadWeeks || leadWeeks < 0) return null

  const r = { ...DEFAULT_RULES, ...rules }

  // 1. Delivery = onSite - (deliveryWeeksBefore × 7)
  const delivery = addDays(onSiteDate, -(r.deliveryWeeksBefore * 7))

  // 2. Order Placed = delivery - (leadWeeks × 7)
  const orderPlaced = addDays(delivery, -(leadWeeks * 7))

  // 3. Approval Required = same as order placed (approval needed before order)
  const approvalRequired = new Date(orderPlaced)

  // 4. Tech Sub = approvalRequired - techSubDaysBefore (calendar or working days)
  const techSubIssue = r.techSubDaysType === 'working'
    ? subtractWorkingDays(approvalRequired, r.techSubDaysBefore)
    : addDays(approvalRequired, -r.techSubDaysBefore)

  return {
    delivery,
    orderPlaced,
    approvalRequired,
    techSubIssue,
  }
}

/**
 * Forward-plan: given a Tech Sub Issue date + lead time, compute Required On Site.
 */
export function computeForward(techSubDate, leadWeeks, rules = DEFAULT_RULES) {
  const ts = dateOnly(techSubDate)
  if (!ts || !leadWeeks || leadWeeks < 0) return null

  const r = { ...DEFAULT_RULES, ...rules }

  // Reverse the algorithm: techSub → approval → orderPlaced → delivery → onSite
  const approvalRequired = addDays(ts, r.techSubDaysBefore)
  const orderPlaced = new Date(approvalRequired)
  const delivery = addDays(orderPlaced, leadWeeks * 7)
  const onSite = addDays(delivery, r.deliveryWeeksBefore * 7)

  return {
    techSubIssue: ts,
    approvalRequired,
    orderPlaced,
    delivery,
    onSite,
  }
}

// ── Parse lead time ──

/**
 * Parse lead time string like "16W", "8w", "12" into integer weeks.
 */
export function parseLeadTime(input) {
  if (!input) return null
  const cleaned = String(input).trim().toUpperCase().replace(/W$/, '')
  const num = parseInt(cleaned, 10)
  return isNaN(num) || num < 0 ? null : num
}

/**
 * Format lead time as "NW".
 */
export function formatLeadTime(weeks) {
  if (weeks == null) return ''
  return `${weeks}W`
}

// ── Date formatting ──

export function fmtDate(d) {
  const dt = dateOnly(d)
  if (!dt) return '\u2014'
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateISO(d) {
  const dt = dateOnly(d)
  if (!dt) return ''
  return dt.toISOString().slice(0, 10)
}

export function parseDate(s) {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d) ? null : dateOnly(d)
}

// ── Row risk flags ──

export function getRowFlags(row, milestones) {
  const flags = []
  const today = dateOnly(new Date())
  if (!milestones) return flags

  if (milestones.techSubIssue && milestones.techSubIssue < today) {
    flags.push({ type: 'danger', message: 'Tech sub date has passed \u2014 programme at risk' })
  }

  const onSite = dateOnly(row.requiredOnSite)
  if (onSite && onSite < today && !row.dateApproved) {
    flags.push({ type: 'danger', message: 'Required on site date has passed with no approval' })
  }

  return flags
}

// ── ISO week number ──

export function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

// ── Sample data ──

export const SAMPLE_RULES = { ...DEFAULT_RULES }

export const SAMPLE_CATEGORIES = [
  'Lighting',
  'Containment',
  'Power',
  'Data',
]

export const SAMPLE_HEADER = {
  title: 'Procurement Tracker',
  project: 'LEGO \u2013 76 Upperground',
  stage: 'Stage 4 Addendum Update (P05 Revision)',
  projectNo: 'PCLG2907E',
  revision: 'B',
  trade: 'Electrical',
}

export const SAMPLE_ROWS = [
  // Lighting
  { id: 1, category: 'Lighting', description: 'Recessed downlights \u2013 4000K narrow beam', supplier: 'ERCO', firstLevel: 2, leadTime: '12W', requiredOnSite: '2026-11-09' },
  { id: 2, category: 'Lighting', description: 'Linear LED profiles \u2013 suspended', supplier: 'XAL', firstLevel: 1, leadTime: '14W', requiredOnSite: '2026-11-16' },
  { id: 3, category: 'Lighting', description: 'Track spotlights \u2013 gallery zones', supplier: 'ERCO', firstLevel: 2, leadTime: '12W', requiredOnSite: '2026-11-23' },
  { id: 4, category: 'Lighting', description: 'Pendant feature luminaires \u2013 atrium', supplier: 'Vibia', firstLevel: 1, leadTime: '16W', requiredOnSite: '2026-12-07' },
  { id: 5, category: 'Lighting', description: 'Wall wash uplighters \u2013 lobby', supplier: 'Orluna', firstLevel: 3, leadTime: '10W', requiredOnSite: '2026-12-14' },
  { id: 6, category: 'Lighting', description: 'Emergency luminaires \u2013 all zones', supplier: 'Lumenpulse', firstLevel: 2, leadTime: '8W', requiredOnSite: '2026-11-30' },
  { id: 7, category: 'Lighting', description: 'Facade uplighting \u2013 external', supplier: 'Foroma Collective', firstLevel: 1, leadTime: '16W', requiredOnSite: '2027-01-11' },
  // Containment
  { id: 8, category: 'Containment', description: 'Cable tray \u2013 galvanised heavy duty', supplier: 'Legrand', firstLevel: 3, leadTime: '8W', requiredOnSite: '2026-11-02' },
  { id: 9, category: 'Containment', description: 'Basket tray \u2013 data zones', supplier: 'Legrand', firstLevel: 4, leadTime: '8W', requiredOnSite: '2026-11-09' },
  { id: 10, category: 'Containment', description: 'Conduit \u2013 galvanised 25mm', supplier: 'Schneider', firstLevel: 4, leadTime: '10W', requiredOnSite: '2026-11-16' },
  // Power
  { id: 11, category: 'Power', description: 'Distribution boards \u2013 MCCB rated', supplier: 'Schneider', firstLevel: 1, leadTime: '14W', requiredOnSite: '2026-12-07' },
  { id: 12, category: 'Power', description: 'Busbar trunking \u2013 rising main', supplier: 'Schneider', firstLevel: 1, leadTime: '16W', requiredOnSite: '2026-12-21' },
  { id: 13, category: 'Power', description: 'Socket outlets \u2013 flush white', supplier: 'MK Electric', firstLevel: 4, leadTime: '8W', requiredOnSite: '2026-11-30' },
  // Data
  { id: 14, category: 'Data', description: 'Cat6A patch panels \u2013 48-port', supplier: 'Panduit', firstLevel: 2, leadTime: '10W', requiredOnSite: '2026-12-14' },
  { id: 15, category: 'Data', description: 'Fibre enclosures \u2013 24-core LC', supplier: 'Panduit', firstLevel: 2, leadTime: '12W', requiredOnSite: '2027-01-04' },
]
