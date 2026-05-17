/**
 * CoreSite Date Utility Module
 *
 * Centralised date formatting, timezone handling, and working-day arithmetic.
 * All display functions use Europe/London timezone.
 *
 * Two date types:
 * - TIMESTAMPS (TIMESTAMPTZ in DB): moments in time, stored as ISO strings with offset
 * - CALENDAR DATES (DATE in DB): day-only values, stored as "YYYY-MM-DD" strings
 *
 * The key rule: never use setHours(0,0,0,0).toISOString() for day boundaries.
 * That pattern converts local midnight to UTC, which shifts the day during BST.
 */

const TZ = 'Europe/London'

// ─────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────

/** Convert any date-like input to a Date object. */
function toDate(input) {
  if (!input) return null
  if (input instanceof Date) return input
  return new Date(input)
}

/**
 * Parse a calendar date string (YYYY-MM-DD) into a Date at noon UTC.
 * Noon avoids DST boundary issues — no timezone offset can shift the calendar date
 * because the nearest midnight is 12 hours away.
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {Date}
 */
export function parseCalendarDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr + 'T12:00:00Z')
}

/**
 * Get a formatted part of a date in UK timezone using Intl.
 * @param {Date} date
 * @param {Intl.DateTimeFormatOptions} opts
 * @returns {string}
 */
function intl(date, opts) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts }).format(date)
}

// ─────────────────────────────────────────────────
// DISPLAY — Timestamps (TIMESTAMPTZ → human string)
// ─────────────────────────────────────────────────

/**
 * Format a timestamp as "17 May 2026" in UK time.
 * @param {string|Date} isoOrDate - ISO timestamp or Date
 * @returns {string}
 */
export function formatDate(isoOrDate) {
  const d = toDate(isoOrDate)
  if (!d || isNaN(d)) return '--'
  return intl(d, { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Format a timestamp as "Sat 17 May 2026" in UK time.
 * @param {string|Date} isoOrDate
 * @returns {string}
 */
export function formatDateWithDay(isoOrDate) {
  const d = toDate(isoOrDate)
  if (!d || isNaN(d)) return '--'
  return intl(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Format a timestamp as "17 May" in UK time (no year).
 * @param {string|Date} isoOrDate
 * @returns {string}
 */
export function formatDateShort(isoOrDate) {
  const d = toDate(isoOrDate)
  if (!d || isNaN(d)) return '--'
  return intl(d, { day: 'numeric', month: 'short' })
}

/**
 * Format a timestamp as "14:30" in UK time (24h).
 * @param {string|Date} isoOrDate
 * @returns {string}
 */
export function formatTime(isoOrDate) {
  const d = toDate(isoOrDate)
  if (!d || isNaN(d)) return '--'
  return intl(d, { hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * Format a timestamp as "17 May 2026, 14:30" in UK time.
 * @param {string|Date} isoOrDate
 * @returns {string}
 */
export function formatDateTime(isoOrDate) {
  const d = toDate(isoOrDate)
  if (!d || isNaN(d)) return '--'
  return intl(d, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * Format a date range as "12–19 May 2026" or "28 May – 3 Jun 2026".
 * Works with both timestamps and calendar date strings.
 * @param {string} startISO
 * @param {string} endISO
 * @returns {string}
 */
export function formatDateRange(startISO, endISO) {
  if (!startISO || !endISO) return '--'
  const s = isCalendarDate(startISO) ? parseCalendarDate(startISO) : toDate(startISO)
  const e = isCalendarDate(endISO) ? parseCalendarDate(endISO) : toDate(endISO)
  if (!s || !e || isNaN(s) || isNaN(e)) return '--'

  const sMonth = intl(s, { month: 'short' })
  const eMonth = intl(e, { month: 'short' })
  const sYear = intl(s, { year: 'numeric' })
  const eYear = intl(e, { year: 'numeric' })
  const sDay = intl(s, { day: 'numeric' })
  const eDay = intl(e, { day: 'numeric' })

  if (sYear !== eYear) {
    return `${sDay} ${sMonth} ${sYear} – ${eDay} ${eMonth} ${eYear}`
  }
  if (sMonth !== eMonth) {
    return `${sDay} ${sMonth} – ${eDay} ${eMonth} ${eYear}`
  }
  return `${sDay}–${eDay} ${sMonth} ${eYear}`
}

/**
 * Format a duration in minutes as "2h 15m".
 * @param {number} minutes
 * @returns {string}
 */
export function formatDuration(minutes) {
  if (!minutes || minutes < 0) return '--'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/**
 * Format a timestamp as a relative string ("3 days ago", "in 2 hours", "just now").
 * @param {string|Date} isoOrDate
 * @returns {string}
 */
export function formatRelative(isoOrDate) {
  const d = toDate(isoOrDate)
  if (!d || isNaN(d)) return '--'
  const now = Date.now()
  const diff = now - d.getTime()
  const absDiff = Math.abs(diff)
  const future = diff < 0

  if (absDiff < 60_000) return 'just now'
  if (absDiff < 3600_000) {
    const mins = Math.floor(absDiff / 60_000)
    return future ? `in ${mins}m` : `${mins}m ago`
  }
  if (absDiff < 86400_000) {
    const hrs = Math.floor(absDiff / 3600_000)
    return future ? `in ${hrs}h` : `${hrs}h ago`
  }
  const days = Math.floor(absDiff / 86400_000)
  if (days === 1) return future ? 'tomorrow' : 'yesterday'
  if (days < 30) return future ? `in ${days} days` : `${days} days ago`
  return formatDate(d)
}

// ─────────────────────────────────────────────────
// DISPLAY — Calendar dates (DATE → human string)
// ─────────────────────────────────────────────────

/** Check if a string looks like a calendar date (YYYY-MM-DD, no time component). */
function isCalendarDate(str) {
  return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str)
}

/**
 * Format a calendar date string as "17 May 2026".
 * Uses noon UTC to avoid DST issues.
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {string}
 */
export function formatCalendarDate(dateStr) {
  if (!dateStr) return '--'
  const d = parseCalendarDate(dateStr)
  if (!d || isNaN(d)) return '--'
  return intl(d, { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Format a calendar date string as "Sat 17 May 2026".
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {string}
 */
export function formatCalendarDateWithDay(dateStr) {
  if (!dateStr) return '--'
  const d = parseCalendarDate(dateStr)
  if (!d || isNaN(d)) return '--'
  return intl(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

// ─────────────────────────────────────────────────
// BOUNDARY — Safe "start of day" functions
// ─────────────────────────────────────────────────

/**
 * Get the start of today in UTC as an ISO string.
 * Use this for DB queries filtering by "today's records" on TIMESTAMPTZ columns.
 *
 * This is the FIX for the setHours(0,0,0,0).toISOString() bug.
 * Instead of converting local midnight to UTC (which shifts the day during BST),
 * we extract the UK calendar date and construct UTC midnight directly.
 *
 * @param {Date} [now] - override for testing
 * @returns {string} e.g. "2026-05-17T00:00:00.000Z"
 */
export function startOfDayUTC(now) {
  const dateStr = todayDateStr(now)
  return dateStr + 'T00:00:00.000Z'
}

/**
 * Get the start of today in UK time as an ISO string.
 * During GMT: returns same as startOfDayUTC.
 * During BST: returns 23:00 UTC previous day (= 00:00 BST).
 *
 * Use this when you need the actual UK midnight for time comparisons.
 *
 * @param {Date} [now] - override for testing
 * @returns {string} ISO string for midnight UK time
 */
export function startOfDayUK(now) {
  const dateStr = todayDateStr(now)
  // Create a date at midnight UK time by using the timezone offset
  const midnight = new Date(dateStr + 'T00:00:00')
  // Get the UK offset for this date
  const ukFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    timeZoneName: 'shortOffset',
  })
  const parts = ukFormatter.formatToParts(midnight)
  const offsetPart = parts.find(p => p.type === 'timeZoneName')
  // Parse offset like "GMT+1" or "GMT"
  const offsetMatch = offsetPart?.value?.match(/GMT([+-]\d+)?/)
  const offsetHours = offsetMatch?.[1] ? parseInt(offsetMatch[1]) : 0
  // Midnight UK = midnight UTC minus the offset
  const utcMidnight = new Date(dateStr + 'T00:00:00Z')
  utcMidnight.setHours(utcMidnight.getHours() - offsetHours)
  return utcMidnight.toISOString()
}

/**
 * Get today's date as a YYYY-MM-DD string in UK time.
 * This is the safe replacement for new Date().toISOString().split('T')[0]
 * which returns the UTC date (wrong during late evening BST).
 *
 * @param {Date} [now] - override for testing
 * @returns {string} e.g. "2026-05-17"
 */
export function todayDateStr(now) {
  const d = now || new Date()
  // Use Intl to get the UK date parts
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d) // en-CA gives YYYY-MM-DD format
  return parts
}

/**
 * Extract the UK calendar date from a timestamp.
 * A timestamp at 23:30 UTC on Friday in BST is actually Saturday 00:30 UK time.
 * This function returns the correct UK date.
 *
 * @param {string|Date} isoOrDate - timestamp
 * @returns {string} "YYYY-MM-DD" in UK time
 */
export function ukDateStr(isoOrDate) {
  const d = toDate(isoOrDate)
  if (!d || isNaN(d)) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
}

// ─────────────────────────────────────────────────
// COMPARISON
// ─────────────────────────────────────────────────

/**
 * Check if a timestamp falls on today (UK time).
 * @param {string|Date} isoOrDate
 * @returns {boolean}
 */
export function isToday(isoOrDate) {
  return ukDateStr(isoOrDate) === todayDateStr()
}

/**
 * Check if a calendar date is before today (UK time).
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {boolean}
 */
export function isPast(dateStr) {
  if (!dateStr) return false
  return dateStr < todayDateStr()
}

/**
 * Check if a calendar date is after today (UK time).
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {boolean}
 */
export function isFuture(dateStr) {
  if (!dateStr) return false
  return dateStr > todayDateStr()
}

/**
 * Count calendar days between two YYYY-MM-DD date strings.
 * @param {string} dateStr1
 * @param {string} dateStr2
 * @returns {number} Positive if dateStr2 is later, negative if earlier
 */
export function daysBetween(dateStr1, dateStr2) {
  if (!dateStr1 || !dateStr2) return 0
  const d1 = parseCalendarDate(dateStr1)
  const d2 = parseCalendarDate(dateStr2)
  return Math.round((d2 - d1) / 86400_000)
}

// ─────────────────────────────────────────────────
// ARITHMETIC — Calendar days and working days
// ─────────────────────────────────────────────────

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/**
 * Convert a Date to YYYY-MM-DD using its UTC date parts.
 * Since we parse calendar dates at noon UTC, this always gives the correct date.
 * @param {Date} d
 * @returns {string}
 */
function dateToStr(d) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Add calendar days to a YYYY-MM-DD date string.
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {number} n - days to add (can be negative)
 * @returns {string} "YYYY-MM-DD"
 */
export function addCalendarDays(dateStr, n) {
  const d = parseCalendarDate(dateStr)
  if (!d) return dateStr
  d.setUTCDate(d.getUTCDate() + n)
  return dateToStr(d)
}

/**
 * Check if a calendar date is a working day.
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {object} [opts]
 * @param {string[]} [opts.workingDays] - e.g. ['mon','tue','wed','thu','fri']
 * @param {Array<{date: string}>} [opts.bankHolidays] - e.g. [{date: '2026-05-25'}]
 * @param {Array<{start_date: string, end_date: string}>} [opts.nonWorkingPeriods]
 * @returns {boolean}
 */
export function isWorkingDay(dateStr, opts = {}) {
  const { workingDays = ['mon', 'tue', 'wed', 'thu', 'fri'], bankHolidays = [], nonWorkingPeriods = [] } = opts
  const d = parseCalendarDate(dateStr)
  if (!d) return false
  const dayName = DAY_NAMES[d.getUTCDay()]
  if (!workingDays.includes(dayName)) return false
  if (bankHolidays.some(bh => bh.date === dateStr)) return false
  if (nonWorkingPeriods.some(p => dateStr >= p.start_date && dateStr <= p.end_date)) return false
  return true
}

/**
 * Add N working days to a date.
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {number} n - working days to add (must be > 0)
 * @param {object} [opts] - same as isWorkingDay
 * @returns {string} "YYYY-MM-DD"
 */
export function addWorkingDays(dateStr, n, opts = {}) {
  if (!dateStr || !n || n < 1) return dateStr
  let cursor = dateStr
  let counted = 0
  const maxIterations = n * 5 + 365

  // Start from the next day after dateStr
  for (let i = 0; i < maxIterations; i++) {
    cursor = addCalendarDays(cursor, 1)
    if (isWorkingDay(cursor, opts)) {
      counted++
      if (counted === n) return cursor
    }
  }
  return cursor
}

/**
 * Count working days in a date range (inclusive of both start and end).
 * @param {string} startStr - "YYYY-MM-DD"
 * @param {string} endStr - "YYYY-MM-DD"
 * @param {object} [opts] - same as isWorkingDay
 * @returns {number}
 */
export function countWorkingDays(startStr, endStr, opts = {}) {
  if (!startStr || !endStr) return 0
  let count = 0
  let cursor = startStr
  while (cursor <= endStr) {
    if (isWorkingDay(cursor, opts)) count++
    cursor = addCalendarDays(cursor, 1)
  }
  return count
}

// ─────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────

/**
 * Get the Monday of the current week in UK time as YYYY-MM-DD.
 * @param {Date} [now] - override for testing
 * @returns {string}
 */
export function weekStart(now) {
  const today = todayDateStr(now)
  const d = parseCalendarDate(today)
  const dayOfWeek = d.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  return addCalendarDays(today, -daysFromMonday)
}

/**
 * Get the first day of the current month in UK time as YYYY-MM-DD.
 * @param {Date} [now] - override for testing
 * @returns {string}
 */
export function monthStart(now) {
  const today = todayDateStr(now)
  return today.substring(0, 8) + '01'
}

/**
 * The timezone constant, exported for use in Intl.DateTimeFormat calls
 * that need to be consistent with this module.
 */
export { TZ }
