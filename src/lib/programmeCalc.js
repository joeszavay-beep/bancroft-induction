/**
 * Programme Calculator — date calculation utility.
 * Shared between client (live preview) and server (source of truth on save).
 */

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DAY_LABELS = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' }

/**
 * Format a date as "Mon 1 Jun 2026"
 */
export function formatDateWithDay(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Check if a date is a working day given the calendar settings.
 */
function isWorkingDay(date, settings) {
  const { workingDays = ['mon','tue','wed','thu','fri'], bankHolidays = [], nonWorkingPeriods = [] } = settings
  const dayName = DAY_NAMES[date.getDay()]
  const dateStr = toISO(date)

  // Not in the working week
  if (!workingDays.includes(dayName)) return false

  // Is a bank holiday
  if (bankHolidays.some(bh => bh.date === dateStr)) return false

  // Falls inside a non-working period
  if (nonWorkingPeriods.some(p => dateStr >= p.start_date && dateStr <= p.end_date)) return false

  return true
}

function toISO(d) {
  return d.toISOString().split('T')[0]
}

function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/**
 * Calculate end date for a task.
 *
 * @param {string} startDate - ISO date string (YYYY-MM-DD)
 * @param {number} duration - number of days (>0)
 * @param {string} mode - 'calendar_days' | 'working_days' | 'monday_start_working_days'
 * @param {object} settings - { workingDays: string[], bankHolidays: {date}[], nonWorkingPeriods: {start_date, end_date}[] }
 * @returns {{ endDate: string, snappedStart?: string, firstWorkingDay?: string, warnings: string[] }}
 */
export function calculateEndDate(startDate, duration, mode, settings = {}) {
  if (!startDate || !duration || duration < 1) {
    return { endDate: startDate || '', warnings: ['Invalid start date or duration'] }
  }

  const start = new Date(startDate + 'T00:00:00')
  const warnings = []

  // ── Mode 1: Calendar Days ──
  if (mode === 'calendar_days') {
    const end = addDays(start, duration - 1)
    return { endDate: toISO(end), warnings }
  }

  // ── Mode 3: Monday-Start Working Days (snap first, then working_days logic) ──
  let effectiveStart = new Date(start)
  let snappedStart = null

  if (mode === 'monday_start_working_days') {
    const workingDays = settings.workingDays || ['mon','tue','wed','thu','fri']
    const firstWorkDay = workingDays[0] || 'mon'
    const targetDayIdx = DAY_NAMES.indexOf(firstWorkDay)
    const currentDayIdx = effectiveStart.getDay()

    if (currentDayIdx !== targetDayIdx) {
      let daysToAdd = (targetDayIdx - currentDayIdx + 7) % 7
      if (daysToAdd === 0) daysToAdd = 7
      effectiveStart = addDays(effectiveStart, daysToAdd)
      snappedStart = toISO(effectiveStart)
      warnings.push(`Start date snapped to ${formatDateWithDay(snappedStart)}`)
    }
  }

  // ── Mode 2 & 3: Working Days count ──
  // Find the first working day on or after effectiveStart
  let cursor = new Date(effectiveStart)
  let firstWorkingDay = null
  const maxIterations = duration * 5 + 365 // safety limit

  // If start itself is non-working, note it
  if (!isWorkingDay(cursor, settings)) {
    const originalCursor = toISO(cursor)
    let i = 0
    while (!isWorkingDay(cursor, settings) && i < 365) {
      cursor = addDays(cursor, 1)
      i++
    }
    firstWorkingDay = toISO(cursor)

    // Check if it's due to a non-working period
    const overlapping = (settings.nonWorkingPeriods || []).find(p => originalCursor >= p.start_date && originalCursor <= p.end_date)
    if (overlapping) {
      warnings.push(`Start date falls in non-working period${overlapping.name ? ' (' + overlapping.name + ')' : ''}. First working day: ${formatDateWithDay(firstWorkingDay)}`)
    }
  } else {
    firstWorkingDay = toISO(cursor)
  }

  // Count working days from cursor
  let counted = 0
  let iterations = 0
  while (counted < duration && iterations < maxIterations) {
    if (isWorkingDay(cursor, settings)) {
      counted++
      if (counted === duration) break
    }
    cursor = addDays(cursor, 1)
    iterations++
  }

  const endDate = toISO(cursor)

  // Check for any non-working period overlaps
  const taskStart = snappedStart || startDate
  for (const p of (settings.nonWorkingPeriods || [])) {
    if (taskStart <= p.end_date && endDate >= p.start_date) {
      if (!warnings.some(w => w.includes(p.name || 'non-working'))) {
        warnings.push(`Task spans non-working period${p.name ? ': ' + p.name : ''} (${formatDateWithDay(p.start_date)} – ${formatDateWithDay(p.end_date)})`)
      }
    }
  }

  // Check for bank holiday overlaps
  const bhOverlap = (settings.bankHolidays || []).filter(bh => bh.date >= (snappedStart || startDate) && bh.date <= endDate)
  if (bhOverlap.length > 0) {
    warnings.push(`Task spans ${bhOverlap.length} bank holiday${bhOverlap.length > 1 ? 's' : ''}`)
  }

  return {
    endDate,
    ...(snappedStart ? { snappedStart } : {}),
    firstWorkingDay,
    warnings,
  }
}

/**
 * Get the next working day after a given date.
 */
export function nextWorkingDay(dateStr, settings = {}) {
  let cursor = new Date(dateStr + 'T00:00:00')
  cursor = addDays(cursor, 1)
  let i = 0
  while (!isWorkingDay(cursor, settings) && i < 365) {
    cursor = addDays(cursor, 1)
    i++
  }
  return toISO(cursor)
}

/**
 * Get the mode label for display.
 */
export function modeLabel(mode) {
  if (mode === 'calendar_days') return 'Calendar Days'
  if (mode === 'working_days') return 'Working Days'
  if (mode === 'monday_start_working_days') return 'Mon-Start Working Days'
  return mode
}

/**
 * Get the duration unit label.
 */
export function durationUnit(mode) {
  if (mode === 'calendar_days') return 'days'
  return 'working days'
}
