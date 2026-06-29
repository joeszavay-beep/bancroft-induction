/**
 * Format a date value safely. Returns "\u2014" for any null, undefined, NaN, invalid input.
 * @param {*} value \u2014 date string, Date object, or anything
 * @param {object} opts \u2014 { short: bool } for DD/MM/YY vs DD/MM/YYYY
 * @returns {string}
 */
export function formatDate(value, opts = {}) {
  if (value == null || value === '') return '\u2014'
  if (typeof value === 'number' && isNaN(value)) return '\u2014'

  let d
  try {
    d = value instanceof Date ? value : new Date(value)
  } catch {
    return '\u2014'
  }

  if (!d || isNaN(d.getTime())) return '\u2014'

  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')

  if (opts.short) {
    const year = String(d.getFullYear()).slice(-2)
    return `${day}/${month}/${year}`
  }

  return `${day}/${month}/${d.getFullYear()}`
}

/**
 * Classify cert expiry relative to report week ending date.
 * @param {*} dateValue - expiry date (string, Date, or falsy)
 * @param {*} weekEndDate - the week-ending reference date
 * @returns {'expired' | 'critical' | 'warning' | 'valid' | 'none'}
 */
export function classifyExpiry(dateValue, weekEndDate) {
  if (!dateValue) return 'none'

  let expiry, weekEnd
  try {
    expiry = dateValue instanceof Date ? dateValue : new Date(dateValue)
    weekEnd = weekEndDate instanceof Date ? weekEndDate : new Date(weekEndDate)
  } catch {
    return 'none'
  }

  if (isNaN(expiry.getTime()) || isNaN(weekEnd.getTime())) return 'none'

  const diffMs = expiry.getTime() - weekEnd.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)

  if (diffDays < 0) return 'expired'
  if (diffDays <= 30) return 'critical'
  if (diffDays <= 90) return 'warning'
  return 'valid'
}

/**
 * Compute the executive summary data for the cover page.
 * @returns {{ totalHours: number, operativeCount: number, inspectionsPassed: number,
 *             inspectionsTotal: number, expiringCertCount: number,
 *             attentionItems: Array<{ severity: string, message: string, page: number }> }}
 */
export function computeReportSummary({ operatives, weekEnd, pmChecklist, envChecklist, opChecklist, labourData, rawAttendance, equipmentRows }) {
  const attentionItems = []

  // --- Total shifts: count sign_in events only (not sign_out) to avoid double-counting ---
  let totalShifts = 0
  const signInOps = new Set()
  if (Array.isArray(rawAttendance) && rawAttendance.length > 0) {
    // Use raw attendance data: filter to sign_in only, count events, track unique operatives
    rawAttendance.forEach(rec => {
      if (rec.type === 'sign_in') {
        totalShifts++
        if (rec.operative_id) signInOps.add(rec.operative_id)
      }
    })
  } else if (Array.isArray(labourData)) {
    // Fallback to labourData if rawAttendance not available (halve to approximate)
    labourData.forEach(row => {
      if (Array.isArray(row.days)) {
        totalShifts += row.days.reduce((sum, d) => sum + (Number(d) || 0), 0)
      }
    })
    totalShifts = Math.round(totalShifts / 2)
  }

  // --- Operative count: unique operatives who actually signed in, not roster size ---
  const operativeCount = signInOps.size > 0 ? signInOps.size : (Array.isArray(operatives) ? operatives.length : 0)

  // --- Inspections passed ---
  let inspectionsPassed = 0
  let inspectionsTotal = 0
  const failedItems = [] // Track individual failures for attention callout

  function countChecklist(checks, sectionLabel) {
    if (!Array.isArray(checks)) return
    checks.forEach(item => {
      // Handle both formats: { value: 'Y'|'N'|'NA' } and { result: 'pass'|'fail'|'na' }
      const v = (item.value || item.result || '').trim().toUpperCase()
      if (v === 'Y' || v === 'YES' || v === 'PASS' || v === 'N' || v === 'NO' || v === 'FAIL' || v === 'NA' || v === 'N/A') {
        inspectionsTotal++
        if (v === 'N' || v === 'NO' || v === 'FAIL') {
          failedItems.push({ section: sectionLabel, name: item.label || item.item || 'Unknown item' })
        } else {
          inspectionsPassed++
        }
      }
    })
  }

  countChecklist(pmChecklist, 'PM Inspection')
  countChecklist(envChecklist, 'Environmental Inspection')
  countChecklist(opChecklist, 'Operative Inspection')

  // If no inspections were filled in, count zero
  if (inspectionsTotal === 0) {
    inspectionsPassed = 0
  }

  // Add per-item attention entries for failed inspections
  failedItems.forEach(fi => {
    attentionItems.push({
      severity: 'red',
      message: `${fi.section}: ${fi.name} \u2014 non-compliant`,
      page: fi.section === 'PM Inspection' ? 5 : fi.section === 'Environmental Inspection' ? 5 : 6,
    })
  })

  // --- Expiring certs (split into expired vs critical-within-30d) ---
  let expiringCertCount = 0
  let expiredCertCount = 0
  let criticalCertCount = 0
  const weekEndDate = weekEnd instanceof Date ? weekEnd : new Date(weekEnd)
  const certFieldLabels = {
    cscs_expiry: 'CSCS',
    first_aid_expiry: 'First Aid',
    asbestos_expiry: 'Asbestos Awareness',
    manual_handling_expiry: 'Manual Handling',
    ipaf_expiry: 'IPAF',
    pasma_expiry: 'PASMA',
    smsts_expiry: 'SMSTS',
    sssts_expiry: 'SSSTS',
  }

  if (Array.isArray(operatives)) {
    let noCertsCount = 0
    operatives.forEach(op => {
      const certFields = Object.keys(certFieldLabels)
      let hasAnyCert = false
      certFields.forEach(field => {
        if (op[field]) hasAnyCert = true
        const status = classifyExpiry(op[field], weekEndDate)
        if (status === 'expired' || status === 'critical') {
          expiringCertCount++
          if (status === 'expired') expiredCertCount++
          else criticalCertCount++
          const opName = op.full_name || op.name || 'Unknown operative'
          const certLabel = certFieldLabels[field]
          const expiryFmt = formatDate(op[field], { short: true })
          attentionItems.push({
            severity: (status === 'expired' || status === 'critical') ? 'red' : 'amber',
            message: `${opName} \u2014 ${certLabel} ${status === 'expired' ? 'expired' : 'expiring'} ${expiryFmt}`,
            page: 3,
          })
        }
      })
      if (!hasAnyCert) noCertsCount++
    })
    if (noCertsCount > 0) {
      attentionItems.push({
        severity: 'red',
        message: `${noCertsCount} operative${noCertsCount > 1 ? 's' : ''} with no training records on file`,
        page: 3,
      })
    }
  }

  // Also check equipment certs
  if (Array.isArray(equipmentRows)) {
    equipmentRows.forEach(row => {
      const certStatus = classifyExpiry(row.certExpiry, weekEndDate)
      const patStatus = classifyExpiry(row.patExpiry, weekEndDate)
      if (certStatus === 'expired' || certStatus === 'critical') expiringCertCount++
      if (patStatus === 'expired' || patStatus === 'critical') expiringCertCount++
    })
  }

  return {
    totalShifts,
    operativeCount,
    inspectionsPassed,
    inspectionsTotal,
    expiringCertCount,
    expiredCertCount,
    criticalCertCount,
    attentionItems,
  }
}

const LABOUR_DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Build the weekly Labour Return grid — the SINGLE source of truth shared by the
 * on-screen preview (HSReportGenerator) and the PDF (LabourReturn). Having one
 * helper guarantees the two can never drift (the bug this replaces: the preview
 * counted every attendance row incl. sign-outs → ~2x the real headcount, while
 * the PDF counted sign-in events → they disagreed).
 *
 * Counts UNIQUE operatives with a sign-in per day (true daily headcount):
 *   - sign-IN events only (a sign-out is not a separate person on site)
 *   - de-duplicated per day, so a re-scan (e.g. lunch re-entry) counts once
 *   - grouped by trade (operative.role), 'General' when role is unknown
 *   - rows without an operative_id are skipped (can't be de-duplicated into a headcount)
 *
 * Day buckets use the local weekday (Mon=0 … Sun=6), matching the rest of the report.
 *
 * @param {Array} rawAttendance — site_attendance rows ({ operative_id, type, recorded_at })
 * @param {Array} operatives — operatives ({ id, role }) for trade lookup
 * @returns {{ rows: Array<{trade, days:number[7], total, avg}>, dayCounts:number[7],
 *             grandTotal:number, uniqueOps:number, avgDaily:string, peakDay:string }}
 */
export function buildLabourGrid(rawAttendance, operatives) {
  const opMap = new Map()
  if (Array.isArray(operatives)) operatives.forEach(op => { if (op && op.id) opMap.set(op.id, op) })

  const tradeDaySets = {}                                   // trade -> [Set<opId> x7]
  const daySets = Array.from({ length: 7 }, () => new Set()) // per-day unique opIds (any trade)
  const weekOps = new Set()                                  // unique opIds across the week

  const rows0 = Array.isArray(rawAttendance) ? rawAttendance : []
  rows0.forEach(rec => {
    if (!rec || rec.type !== 'sign_in' || !rec.operative_id) return
    const d = new Date(rec.recorded_at)
    if (isNaN(d.getTime())) return
    const dow = d.getDay()                  // 0=Sun
    const idx = dow === 0 ? 6 : dow - 1      // Mon=0 … Sun=6
    const trade = opMap.get(rec.operative_id)?.role || 'General'
    if (!tradeDaySets[trade]) tradeDaySets[trade] = Array.from({ length: 7 }, () => new Set())
    tradeDaySets[trade][idx].add(rec.operative_id)
    daySets[idx].add(rec.operative_id)
    weekOps.add(rec.operative_id)
  })

  const rows = Object.keys(tradeDaySets)
    .sort((a, b) => a.localeCompare(b))
    .map(trade => {
      const days = tradeDaySets[trade].map(s => s.size)
      const total = days.reduce((x, y) => x + y, 0)
      const activeDays = days.filter(n => n > 0).length
      const avg = activeDays > 0 ? (total / activeDays).toFixed(1) : '0.0'
      return { trade, days, total, avg }
    })

  const dayCounts = daySets.map(s => s.size)
  const grandTotal = dayCounts.reduce((x, y) => x + y, 0)
  const activeDaysOverall = dayCounts.filter(n => n > 0).length
  const avgDaily = activeDaysOverall > 0 ? (grandTotal / activeDaysOverall).toFixed(1) : '0.0'
  const peakVal = Math.max(0, ...dayCounts)
  const peakIdx = dayCounts.indexOf(peakVal)
  const peakDay = peakVal > 0 ? `${LABOUR_DAY_NAMES[peakIdx]} (${peakVal})` : '—'

  return { rows, dayCounts, grandTotal, uniqueOps: weekOps.size, avgDaily, peakDay }
}
