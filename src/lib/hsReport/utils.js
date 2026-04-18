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
export function computeReportSummary({ operatives, weekEnd, pmChecklist, envChecklist, opChecklist, labourData, equipmentRows }) {
  const attentionItems = []

  // --- Total hours from labour data ---
  let totalHours = 0
  if (Array.isArray(labourData)) {
    labourData.forEach(row => {
      if (Array.isArray(row.days)) {
        totalHours += row.days.reduce((sum, d) => sum + (Number(d) || 0), 0)
      }
    })
  }
  // Convert person-days to approximate hours (8h/day)
  totalHours = totalHours * 8

  // --- Operative count ---
  const operativeCount = Array.isArray(operatives) ? operatives.length : 0

  // --- Inspections passed ---
  let inspectionsPassed = 0
  let inspectionsTotal = 0

  function countChecklist(checks) {
    if (!Array.isArray(checks)) return
    checks.forEach(item => {
      const v = (item.value || '').trim().toUpperCase()
      if (v === 'Y' || v === 'N' || v === 'NA' || v === 'N/A') {
        inspectionsTotal++
        if (v === 'Y' || v === 'NA' || v === 'N/A') inspectionsPassed++
      }
    })
  }

  countChecklist(pmChecklist)
  countChecklist(envChecklist)
  countChecklist(opChecklist)

  // If no inspections were filled in, count zero
  if (inspectionsTotal === 0) {
    inspectionsPassed = 0
  }

  // Check for failed inspections
  const failedCount = inspectionsTotal - inspectionsPassed
  if (failedCount > 0) {
    attentionItems.push({
      severity: 'red',
      message: `${failedCount} inspection item${failedCount > 1 ? 's' : ''} marked as non-compliant`,
      page: 4,
    })
  }

  // --- Expiring certs ---
  let expiringCertCount = 0
  const weekEndDate = weekEnd instanceof Date ? weekEnd : new Date(weekEnd)

  if (Array.isArray(operatives)) {
    operatives.forEach(op => {
      const certFields = ['cscs_expiry', 'first_aid_expiry', 'asbestos_expiry', 'manual_handling_expiry', 'ipaf_expiry', 'pasma_expiry', 'smsts_expiry', 'sssts_expiry']
      certFields.forEach(field => {
        const status = classifyExpiry(op[field], weekEndDate)
        if (status === 'expired' || status === 'critical') {
          expiringCertCount++
        }
      })
    })
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

  if (expiringCertCount > 0) {
    attentionItems.push({
      severity: 'red',
      message: `${expiringCertCount} certificate${expiringCertCount > 1 ? 's' : ''} expired or expiring within 30 days`,
      page: 3,
    })
  }

  return {
    totalHours,
    operativeCount,
    inspectionsPassed,
    inspectionsTotal,
    expiringCertCount,
    attentionItems,
  }
}
