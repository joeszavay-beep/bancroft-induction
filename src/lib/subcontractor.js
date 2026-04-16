/**
 * CoreSite Subcontractor Module — Core Logic
 * Timesheet calculation, financial forecasting, CIS, compliance gates
 */

// ============================================================
// MONEY HELPERS (all values in pence)
// ============================================================

export function formatMoney(pence) {
  if (pence == null) return '—'
  const pounds = pence / 100
  return pounds < 0
    ? `-£${Math.abs(pounds).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `£${pounds.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function parseMoney(input) {
  const cleaned = String(input).replace(/[£,\s]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : Math.round(num * 100)
}

// ============================================================
// TIMESHEET CALCULATION FROM QR DATA
// ============================================================

/**
 * Calculate hours worked from sign-in/sign-out records
 * @param {string} signInTime - ISO timestamp
 * @param {string} signOutTime - ISO timestamp
 * @returns {{ hours: number, dayType: 'full'|'half'|'none' }}
 */
export function calculateHoursWorked(signInTime, signOutTime, fullDayThreshold = 8) {
  if (!signInTime || !signOutTime) return { hours: 0, dayType: 'none' }
  const inTime = new Date(signInTime)
  const outTime = new Date(signOutTime)
  const diffMs = outTime - inTime
  if (diffMs <= 0) return { hours: 0, dayType: 'none' }

  // Round to nearest 15 minutes
  const rawHours = diffMs / (1000 * 60 * 60)
  const hours = Math.round(rawHours * 4) / 4

  let dayType = 'none'
  if (hours >= fullDayThreshold) dayType = 'full'
  else if (hours >= 4) dayType = 'half'

  return { hours, dayType }
}

/**
 * Calculate cost for a timesheet entry
 * @param {{ hours, dayType }} hoursData
 * @param {string} payType - 'daily'|'hourly'|'weekly'
 * @param {number} payRate - in pence
 * @returns {number} cost in pence
 */
export function calculateCost(hoursData, payType, payRate) {
  if (!payRate) return 0
  switch (payType) {
    case 'daily':
      if (hoursData.dayType === 'full') return payRate
      if (hoursData.dayType === 'half') return Math.round(payRate / 2)
      return 0
    case 'hourly':
      return Math.round(hoursData.hours * payRate)
    case 'weekly': {
      // Weekly rate / 5 days, then apply day type
      const dailyFromWeekly = Math.round(payRate / 5)
      if (hoursData.dayType === 'full') return dailyFromWeekly
      if (hoursData.dayType === 'half') return Math.round(dailyFromWeekly / 2)
      return 0
    }
    default:
      return 0
  }
}

// ============================================================
// FINANCIAL FORECASTING
// ============================================================

/**
 * Calculate weighted moving average burn rate
 * @param {number[]} weeklySpends - array of weekly spend totals (most recent first)
 * @returns {number} weighted average spend per week (pence)
 */
export function calculateBurnRate(weeklySpends) {
  if (!weeklySpends?.length) return 0
  const weights = [0.4, 0.3, 0.2, 0.1]
  let totalWeight = 0
  let weightedSum = 0
  for (let i = 0; i < Math.min(weeklySpends.length, 4); i++) {
    weightedSum += weeklySpends[i] * weights[i]
    totalWeight += weights[i]
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0
}

/**
 * Calculate financial projections for a job
 */
export function calculateProjections(job, totalSpendToDate, weeklySpends) {
  const contractValue = job.revised_contract_value || job.contract_value || 0
  const burnRate = calculateBurnRate(weeklySpends)
  const remaining = Math.max(0, contractValue - totalSpendToDate)

  // Weeks remaining at current burn rate
  const weeksRemaining = burnRate > 0 ? remaining / burnRate : Infinity

  // Budget exhaustion date
  const now = new Date()
  const exhaustionDate = burnRate > 0
    ? new Date(now.getTime() + weeksRemaining * 7 * 24 * 60 * 60 * 1000)
    : null

  // Projected total cost (extrapolate to completion)
  const completionDate = job.est_completion_date ? new Date(job.est_completion_date) : null
  const weeksToCompletion = completionDate
    ? Math.max(0, (completionDate - now) / (7 * 24 * 60 * 60 * 1000))
    : weeksRemaining

  const projectedTotalCost = totalSpendToDate + (burnRate * weeksToCompletion)
  const projectedMargin = contractValue - projectedTotalCost
  const projectedMarginPct = contractValue > 0 ? (projectedMargin / contractValue) * 100 : 0

  // Traffic light
  let trafficLight = 'green'
  if (projectedMarginPct <= 0) trafficLight = 'red'
  else if (projectedMarginPct <= 10) trafficLight = 'amber'

  return {
    contractValue,
    totalSpendToDate,
    burnRate,
    remaining,
    weeksRemaining,
    exhaustionDate,
    projectedTotalCost: Math.round(projectedTotalCost),
    projectedMargin: Math.round(projectedMargin),
    projectedMarginPct: Math.round(projectedMarginPct * 10) / 10,
    trafficLight,
    weeksToCompletion: Math.round(weeksToCompletion * 10) / 10,
  }
}

// ============================================================
// COMPLIANCE GATES
// ============================================================

/**
 * Check if an operative can be assigned to a job
 * @param {object} operative - from operatives table
 * @returns {{ canAssign: boolean, issues: string[] }}
 */
export function checkCompliance(operative) {
  const issues = []
  const now = new Date()

  // CSCS card check
  if (operative.cscs_expiry) {
    const expiry = new Date(operative.cscs_expiry)
    if (expiry < now) {
      issues.push('CSCS card expired')
    } else {
      const daysUntil = (expiry - now) / (1000 * 60 * 60 * 24)
      if (daysUntil < 30) issues.push(`CSCS card expires in ${Math.round(daysUntil)} days`)
    }
  } else {
    issues.push('No CSCS card on file')
  }

  // Card verification
  if (!operative.card_verified) {
    issues.push('ID card not verified')
  }

  // Check other cert expiries
  const certChecks = [
    { field: 'ipaf_expiry', name: 'IPAF' },
    { field: 'pasma_expiry', name: 'PASMA' },
    { field: 'sssts_expiry', name: 'SSSTS' },
    { field: 'smsts_expiry', name: 'SMSTS' },
    { field: 'first_aid_expiry', name: 'First Aid' },
  ]
  for (const cert of certChecks) {
    if (operative[cert.field]) {
      const expiry = new Date(operative[cert.field])
      if (expiry < now) issues.push(`${cert.name} expired`)
    }
  }

  const blocking = issues.filter(i => i.includes('expired') || i.includes('No CSCS') || i.includes('not verified'))

  return {
    canAssign: blocking.length === 0,
    issues,
    blocking,
  }
}

// ============================================================
// CIS CALCULATION
// ============================================================

export function calculateCIS(grossAmount, cisRate) {
  if (!cisRate || cisRate === 0) return 0 // gross status
  return Math.round(grossAmount * (cisRate / 100))
}

// ============================================================
// INVOICE HELPERS
// ============================================================

export function calculateInvoiceTotals(grossAmount, retentionPct, cisRate) {
  const retention = Math.round(grossAmount * (retentionPct / 100))
  const afterRetention = grossAmount - retention
  const cisDeduction = calculateCIS(afterRetention, cisRate)
  const netAmount = afterRetention - cisDeduction
  return { retention, cisDeduction, netAmount }
}

export function getInvoiceDueDate(submittedDate, paymentTermsDays) {
  if (!submittedDate || !paymentTermsDays) return null
  const due = new Date(submittedDate)
  due.setDate(due.getDate() + paymentTermsDays)
  return due.toISOString().split('T')[0]
}

// ============================================================
// CONSTANTS
// ============================================================

export const PAY_TYPES = [
  { value: 'daily', label: 'Daily Rate' },
  { value: 'hourly', label: 'Hourly Rate' },
  { value: 'weekly', label: 'Weekly Rate' },
]

export const EMPLOYMENT_STATUSES = [
  { value: 'self_employed', label: 'Self-Employed' },
  { value: 'employed', label: 'Employed' },
  { value: 'agency', label: 'Agency' },
]

export const CIS_RATES = [
  { value: 20, label: '20% (Standard)' },
  { value: 30, label: '30% (Unverified)' },
  { value: 0, label: '0% (Gross Status)' },
]

export const JOB_STATUSES = [
  { value: 'active', label: 'Active', color: 'green' },
  { value: 'complete', label: 'Complete', color: 'blue' },
  { value: 'on_hold', label: 'On Hold', color: 'amber' },
]

export const INVOICE_STATUSES = [
  { value: 'draft', label: 'Draft', color: 'slate' },
  { value: 'submitted', label: 'Submitted', color: 'blue' },
  { value: 'certified', label: 'Certified', color: 'green' },
  { value: 'paid', label: 'Paid', color: 'green' },
  { value: 'overdue', label: 'Overdue', color: 'red' },
]

export const TIMESHEET_STATUSES = [
  { value: 'auto', label: 'Auto-generated', color: 'slate' },
  { value: 'reviewed', label: 'Reviewed', color: 'blue' },
  { value: 'approved', label: 'Approved', color: 'green' },
  { value: 'queried', label: 'Queried', color: 'amber' },
]

export const TRAFFIC_LIGHT_COLORS = {
  green: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500', label: 'On Track (>10% margin)' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500', label: 'At Risk (0-10% margin)' },
  red: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500', label: 'Loss Projected' },
}
