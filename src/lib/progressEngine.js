/**
 * Programme progress calculation engine
 * Calculates installed lengths, rates, forecasts and CSV exports
 */

/**
 * Calculate progress for an activity based on its markup lines
 * Green lines count at 100%, amber lines at 50%
 * @param {object} activity - programme_activities record with baseline_length_metres
 * @param {Array} markupLines - markup_lines records with colour and real_world_length_metres
 * @returns {{ installedLength, percentage, status, greenLength, amberLength }}
 */
export function calculateProgress(activity, markupLines) {
  if (!activity || !activity.baseline_length_metres) {
    return { installedLength: 0, percentage: 0, status: 'not_started', greenLength: 0, amberLength: 0 }
  }

  let greenLength = 0
  let amberLength = 0

  for (const line of (markupLines || [])) {
    const len = line.real_world_length_metres || 0
    if (line.colour === 'green') {
      greenLength += len
    } else if (line.colour === 'amber') {
      amberLength += len
    }
    // Red lines are issues — not counted as progress
  }

  const installedLength = greenLength + amberLength * 0.5
  const baseline = activity.baseline_length_metres
  const percentage = Math.min(100, Math.round((installedLength / baseline) * 10000) / 100)

  // Determine status based on variance
  const variance = calculateVarianceDays(activity, percentage)
  let status = 'on_track'
  if (percentage >= 100) {
    status = 'complete'
  } else if (variance > 7) {
    status = 'critical'
  } else if (variance > 0) {
    status = 'behind'
  } else if (variance < -1) {
    status = 'ahead'
  }

  return { installedLength, percentage, status, greenLength, amberLength }
}

/**
 * Calculate variance in days between expected and actual progress
 * Positive = behind schedule, negative = ahead
 */
function calculateVarianceDays(activity, percentage) {
  if (!activity.planned_start_date || !activity.planned_completion_date) return 0

  const now = new Date()
  const start = new Date(activity.planned_start_date)
  const end = new Date(activity.planned_completion_date)
  const totalDuration = Math.max(1, (end - start) / (1000 * 60 * 60 * 24))
  const elapsed = Math.max(0, (now - start) / (1000 * 60 * 60 * 24))
  const expectedPct = Math.min(100, (elapsed / totalDuration) * 100)
  const pctDelta = expectedPct - percentage
  // Convert percentage delta back to days
  return Math.round((pctDelta / 100) * totalDuration)
}

/**
 * Calculate installation rate from historical snapshots (metres per week)
 * @param {Array} snapshots - Array of { snapshot_date, installed_length_metres } sorted by date ascending
 * @returns {{ ratePerWeek, trend }}
 */
export function calculateRate(snapshots) {
  if (!snapshots || snapshots.length < 2) {
    return { ratePerWeek: 0, trend: 'stable' }
  }

  // Support both 'snapshot_date' (DB column) and 'date' (legacy) field names
  const getDate = (s) => s.snapshot_date || s.date

  // Use last 4 weeks of data if available
  const sorted = [...snapshots].sort((a, b) => new Date(getDate(a)) - new Date(getDate(b)))
  const latest = sorted[sorted.length - 1]
  const fourWeeksAgo = new Date(new Date(getDate(latest)).getTime() - 28 * 24 * 60 * 60 * 1000)
  const recentStart = sorted.find(s => new Date(getDate(s)) >= fourWeeksAgo) || sorted[0]

  const lengthDelta = latest.installed_length_metres - recentStart.installed_length_metres
  const daysDelta = Math.max(1, (new Date(getDate(latest)) - new Date(getDate(recentStart))) / (1000 * 60 * 60 * 24))
  const ratePerWeek = Math.round((lengthDelta / daysDelta) * 7 * 100) / 100

  // Calculate trend by comparing last 2 weeks vs previous 2 weeks
  let trend = 'stable'
  if (sorted.length >= 3) {
    const midIdx = Math.floor(sorted.length / 2)
    const firstHalfRate = (sorted[midIdx].installed_length_metres - sorted[0].installed_length_metres) /
      Math.max(1, (new Date(getDate(sorted[midIdx])) - new Date(getDate(sorted[0]))) / (1000 * 60 * 60 * 24))
    const secondHalfRate = (latest.installed_length_metres - sorted[midIdx].installed_length_metres) /
      Math.max(1, (new Date(getDate(latest)) - new Date(getDate(sorted[midIdx]))) / (1000 * 60 * 60 * 24))

    if (secondHalfRate > firstHalfRate * 1.15) trend = 'improving'
    else if (secondHalfRate < firstHalfRate * 0.85) trend = 'declining'
  }

  return { ratePerWeek: Math.max(0, ratePerWeek), trend }
}

/**
 * Calculate forecast completion date
 * @param {object} activity - programme_activities record
 * @param {number} installedLength - current installed metres
 * @param {number} ratePerWeek - installation rate in metres/week
 * @returns {{ forecastDate, varianceDays, status }}
 */
export function calculateForecast(activity, installedLength, ratePerWeek) {
  if (!activity || !activity.baseline_length_metres) {
    return { forecastDate: null, varianceDays: 0, status: 'unknown' }
  }

  const remaining = Math.max(0, activity.baseline_length_metres - installedLength)

  if (remaining === 0) {
    return { forecastDate: new Date().toISOString().split('T')[0], varianceDays: 0, status: 'complete' }
  }

  if (ratePerWeek <= 0) {
    return { forecastDate: null, varianceDays: Infinity, status: 'stalled' }
  }

  const weeksRemaining = remaining / ratePerWeek
  const daysRemaining = Math.ceil(weeksRemaining * 7)
  const forecastDate = new Date()
  forecastDate.setDate(forecastDate.getDate() + daysRemaining)
  const forecastStr = forecastDate.toISOString().split('T')[0]

  // Calculate variance against planned completion
  let varianceDays = 0
  let status = 'on_track'

  if (activity.planned_completion_date) {
    const planned = new Date(activity.planned_completion_date)
    varianceDays = Math.round((forecastDate - planned) / (1000 * 60 * 60 * 24))

    if (varianceDays > 7) status = 'critical'
    else if (varianceDays > 0) status = 'behind'
    else if (varianceDays < -1) status = 'ahead'
  }

  return { forecastDate: forecastStr, varianceDays, status }
}

/**
 * Generate CSV export string compatible with Asta/MS Project
 * @param {Array} activities - Array of activity objects with computed progress
 * @returns {string} CSV content
 */
export function generateCSVExport(activities) {
  const headers = [
    'Activity ID',
    'Activity Name',
    'Package',
    'Floor',
    'Zone',
    'Subcontractor',
    'Baseline Length (m)',
    'Installed Length (m)',
    '% Complete',
    'Status',
    'Rate (m/week)',
    'Planned Start',
    'Planned Completion',
    'Forecast Completion',
    'Variance (days)',
  ]

  const rows = (activities || []).map(a => [
    a.id || '',
    csvEscape(a.name || ''),
    csvEscape(a.package || ''),
    csvEscape(a.floor || ''),
    csvEscape(a.zone || ''),
    csvEscape(a.subcontractor || ''),
    a.baseline_length_metres ?? '',
    a.installed_length ?? '',
    a.percentage ?? '',
    a.status || '',
    a.rate_per_week ?? '',
    a.planned_start_date || '',
    a.planned_completion_date || '',
    a.forecast_date || '',
    a.variance_days ?? '',
  ])

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
}

function csvEscape(str) {
  if (!str) return ''
  const s = String(str)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
