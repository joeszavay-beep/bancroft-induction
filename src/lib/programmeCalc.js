/**
 * Programme Calculator — date calculation utility.
 * Shared between client (live preview) and server (source of truth on save).
 */

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/**
 * Format a date as "Mon 1 Jun 2026"
 */
export function formatDateWithDay(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00') // noon to avoid timezone edge
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

/** Convert Date to YYYY-MM-DD using local time (NOT UTC) */
function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function parseDate(s) {
  return new Date(s + 'T12:00:00') // noon avoids DST edge cases
}

/**
 * Check if a date is a working day given the calendar settings.
 */
function isWorkingDay(date, settings) {
  const { workingDays = ['mon','tue','wed','thu','fri'], bankHolidays = [], nonWorkingPeriods = [] } = settings
  const dayName = DAY_NAMES[date.getDay()]
  const dateStr = toISO(date)
  if (!workingDays.includes(dayName)) return false
  if (bankHolidays.some(bh => bh.date === dateStr)) return false
  if (nonWorkingPeriods.some(p => dateStr >= p.start_date && dateStr <= p.end_date)) return false
  return true
}

/**
 * Calculate end date for a task.
 *
 * @param {string} startDate - ISO date string (YYYY-MM-DD)
 * @param {number} duration - number of days (>0)
 * @param {string} mode - 'calendar_days' | 'working_days' | 'monday_start_working_days'
 * @param {object} settings - { workingDays, bankHolidays, nonWorkingPeriods }
 * @param {string} [todayStr] - override today for testing snap-back-into-past check
 * @returns {{ endDate, snappedStart?, snapDirection?, firstWorkingDay?, warnings[] }}
 */
export function calculateEndDate(startDate, duration, mode, settings = {}, todayStr) {
  if (!startDate || !duration || duration < 1) {
    return { endDate: startDate || '', warnings: ['Invalid start date or duration'] }
  }

  const start = parseDate(startDate)
  const warnings = []

  // ── Mode 1: Calendar Days ──
  if (mode === 'calendar_days') {
    const end = addDays(start, duration - 1)
    return { endDate: toISO(end), warnings }
  }

  // ── Mode 3: Monday-Start Working Days — snap to nearest first-day-of-working-week ──
  let effectiveStart = new Date(start)
  let snappedStart = null
  let snapDirection = null

  if (mode === 'monday_start_working_days') {
    const workingDays = settings.workingDays || ['mon','tue','wed','thu','fri']
    const firstWorkDay = workingDays[0] || 'mon'
    const targetDayIdx = DAY_NAMES.indexOf(firstWorkDay)
    const currentDayIdx = effectiveStart.getDay()

    if (currentDayIdx !== targetDayIdx) {
      // Calculate days backward and forward to the target day
      const daysBack = (currentDayIdx - targetDayIdx + 7) % 7
      const daysForward = (targetDayIdx - currentDayIdx + 7) % 7

      // First half of week (Mon/Tue/Wed for Mon-Fri) → snap backward
      // Second half (Thu/Fri/Sat/Sun) → snap forward
      // Threshold: if daysBack <= 2, snap back; otherwise snap forward
      const today = todayStr || toISO(new Date())

      if (daysBack <= 2) {
        // Try snapping backward
        const snappedBackDate = addDays(effectiveStart, -daysBack)
        if (toISO(snappedBackDate) < today) {
          // Would snap into the past — snap forward instead
          effectiveStart = addDays(effectiveStart, daysForward)
          snapDirection = 'forward'
          warnings.push(`Start date ${formatDateWithDay(startDate)} → would snap back to ${formatDateWithDay(toISO(snappedBackDate))} (past). Snapped forward to ${formatDateWithDay(toISO(effectiveStart))} instead.`)
        } else {
          effectiveStart = snappedBackDate
          snapDirection = 'backward'
          warnings.push(`Start date snapped back to ${formatDateWithDay(toISO(effectiveStart))} (start of this week)`)
        }
      } else {
        // Snap forward
        effectiveStart = addDays(effectiveStart, daysForward)
        snapDirection = 'forward'
        warnings.push(`Start date snapped forward to ${formatDateWithDay(toISO(effectiveStart))} (start of next week)`)
      }
      snappedStart = toISO(effectiveStart)
    }
  }

  // ── Mode 2 & 3: Working Days count ──
  let cursor = new Date(effectiveStart)
  let firstWorkingDay = null
  const maxIterations = duration * 5 + 365

  // If start itself is non-working, advance to first working day
  if (!isWorkingDay(cursor, settings)) {
    const originalCursor = toISO(cursor)
    let i = 0
    while (!isWorkingDay(cursor, settings) && i < 365) {
      cursor = addDays(cursor, 1)
      i++
    }
    firstWorkingDay = toISO(cursor)

    const overlapping = (settings.nonWorkingPeriods || []).find(p => originalCursor >= p.start_date && originalCursor <= p.end_date)
    if (overlapping) {
      warnings.push(`Start date falls in non-working period${overlapping.name ? ' (' + overlapping.name + ')' : ''}. First working day: ${formatDateWithDay(firstWorkingDay)}`)
    }
  } else {
    firstWorkingDay = toISO(cursor)
  }

  // Count working days: start day = day 1
  let counted = 0
  let iterations = 0
  while (iterations < maxIterations) {
    if (isWorkingDay(cursor, settings)) {
      counted++
      if (counted === duration) break
    }
    cursor = addDays(cursor, 1)
    iterations++
  }

  const endDate = toISO(cursor)

  // Info warnings for spans
  const taskStart = snappedStart || startDate
  for (const p of (settings.nonWorkingPeriods || [])) {
    if (taskStart <= p.end_date && endDate >= p.start_date) {
      if (!warnings.some(w => w.includes(p.name || 'non-working'))) {
        warnings.push(`Task spans non-working period${p.name ? ': ' + p.name : ''} (${formatDateWithDay(p.start_date)} – ${formatDateWithDay(p.end_date)})`)
      }
    }
  }

  const bhOverlap = (settings.bankHolidays || []).filter(bh => bh.date >= taskStart && bh.date <= endDate)
  if (bhOverlap.length > 0) {
    warnings.push(`Task spans ${bhOverlap.length} bank holiday${bhOverlap.length > 1 ? 's' : ''}`)
  }

  return {
    endDate,
    ...(snappedStart ? { snappedStart, snapDirection } : {}),
    firstWorkingDay,
    warnings,
  }
}

/**
 * Get the next working day after a given date.
 */
export function nextWorkingDay(dateStr, settings = {}) {
  let cursor = parseDate(dateStr)
  cursor = addDays(cursor, 1)
  let i = 0
  while (!isWorkingDay(cursor, settings) && i < 365) {
    cursor = addDays(cursor, 1)
    i++
  }
  return toISO(cursor)
}

export function modeLabel(mode) {
  if (mode === 'calendar_days') return 'Calendar Days'
  if (mode === 'working_days') return 'Working Days'
  if (mode === 'monday_start_working_days') return 'Mon-Start Working Days'
  return mode
}

export function durationUnit(mode) {
  if (mode === 'calendar_days') return 'days'
  return 'working days'
}
