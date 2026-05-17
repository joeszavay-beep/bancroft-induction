import { describe, it, expect } from 'vitest'
import {
  formatDate, formatDateWithDay, formatDateShort, formatTime, formatDateTime,
  formatDateRange, formatDuration, formatRelative,
  formatCalendarDate, formatCalendarDateWithDay, parseCalendarDate,
  todayDateStr, ukDateStr, startOfDayUK,
  isToday, isPast, isFuture, daysBetween,
  addCalendarDays, addWorkingDays, isWorkingDay, countWorkingDays,
  weekStart, monthStart,
} from './dates.js'

// ─────────────────────────────────────────────────
// DISPLAY — Timestamps
// ─────────────────────────────────────────────────

describe('formatDate', () => {
  it('formats a UTC timestamp', () => {
    expect(formatDate('2026-05-17T14:30:00Z')).toBe('17 May 2026')
  })
  it('returns -- for null', () => {
    expect(formatDate(null)).toBe('\u2014')
  })
  it('returns -- for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('\u2014')
  })
})

describe('formatDateWithDay', () => {
  it('includes weekday', () => {
    expect(formatDateWithDay('2026-05-17T14:30:00Z')).toMatch(/Sun.*17 May 2026/)
  })
})

describe('formatDateShort', () => {
  it('formats without year', () => {
    expect(formatDateShort('2026-05-17T14:30:00Z')).toBe('17 May')
  })
})

describe('formatTime', () => {
  it('formats time in UK timezone (BST)', () => {
    // 14:30 UTC during BST (May) = 15:30 UK
    expect(formatTime('2026-05-17T14:30:00Z')).toBe('15:30')
  })
  it('formats time in UK timezone (GMT)', () => {
    // 14:30 UTC during GMT (January) = 14:30 UK
    expect(formatTime('2026-01-17T14:30:00Z')).toBe('14:30')
  })
})

describe('formatDateTime', () => {
  it('formats date and time in UK timezone', () => {
    const result = formatDateTime('2026-05-17T14:30:00Z')
    expect(result).toMatch(/17 May 2026/)
    expect(result).toMatch(/15:30/) // BST = UTC+1
  })
})

describe('formatDateRange', () => {
  it('formats same-month range', () => {
    expect(formatDateRange('2026-05-12', '2026-05-19')).toBe('12–19 May 2026')
  })
  it('formats cross-month range', () => {
    expect(formatDateRange('2026-05-28', '2026-06-03')).toBe('28 May – 3 Jun 2026')
  })
  it('formats cross-year range', () => {
    expect(formatDateRange('2026-12-28', '2027-01-05')).toBe('28 Dec 2026 – 5 Jan 2027')
  })
})

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(135)).toBe('2h 15m')
  })
  it('formats hours only', () => {
    expect(formatDuration(120)).toBe('2h')
  })
  it('formats minutes only', () => {
    expect(formatDuration(45)).toBe('45m')
  })
  it('returns -- for zero', () => {
    expect(formatDuration(0)).toBe('\u2014')
  })
})

// ─────────────────────────────────────────────────
// DISPLAY — Calendar dates
// ─────────────────────────────────────────────────

describe('formatCalendarDate', () => {
  it('formats YYYY-MM-DD', () => {
    expect(formatCalendarDate('2026-05-17')).toBe('17 May 2026')
  })
  it('handles null', () => {
    expect(formatCalendarDate(null)).toBe('\u2014')
  })
})

describe('formatCalendarDateWithDay', () => {
  it('includes weekday', () => {
    expect(formatCalendarDateWithDay('2026-05-17')).toMatch(/Sun.*17 May 2026/)
  })
})

describe('parseCalendarDate', () => {
  it('parses to noon UTC', () => {
    const d = parseCalendarDate('2026-05-17')
    expect(d.getUTCHours()).toBe(12)
    expect(d.getUTCDate()).toBe(17)
  })
})

// ─────────────────────────────────────────────────
// BOUNDARY — The Friday-as-Saturday bug fix
// ─────────────────────────────────────────────────

describe('todayDateStr', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = todayDateStr()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('ukDateStr — THE CRITICAL TIMEZONE TEST', () => {
  it('Friday 23:30 BST (22:30 UTC) → Friday in UK', () => {
    // May is BST (UTC+1). 22:30 UTC = 23:30 BST = still Friday
    const result = ukDateStr('2026-05-15T22:30:00Z')
    expect(result).toBe('2026-05-15') // Friday
  })

  it('Friday 23:30 UTC in winter (GMT) → Friday in UK', () => {
    // January is GMT. 23:30 UTC = 23:30 UK = still Friday
    const result = ukDateStr('2026-01-16T23:30:00Z')
    expect(result).toBe('2026-01-16') // Friday
  })

  it('Saturday 00:30 BST (23:30 UTC Friday) → Saturday in UK', () => {
    // 23:30 UTC on Friday in May = 00:30 BST Saturday
    const result = ukDateStr('2026-05-15T23:30:00Z')
    expect(result).toBe('2026-05-16') // Saturday in UK!
  })

  it('Sunday 00:30 GMT → Sunday in UK', () => {
    const result = ukDateStr('2026-01-18T00:30:00Z')
    expect(result).toBe('2026-01-18') // Sunday
  })
})

describe('DST boundary tests', () => {
  // 2026 UK clocks go forward: Sun 29 March at 01:00 GMT → 02:00 BST
  // 2026 UK clocks go back: Sun 25 October at 02:00 BST → 01:00 GMT

  it('Spring forward — 00:30 UTC on 29 March → 29 March in UK (still GMT)', () => {
    // At 00:30 UTC, clocks haven't changed yet (change is at 01:00 UTC)
    const result = ukDateStr('2026-03-29T00:30:00Z')
    expect(result).toBe('2026-03-29')
  })

  it('Spring forward — 01:30 UTC on 29 March → 29 March in UK (now BST, 02:30)', () => {
    // At 01:30 UTC, UK is BST (02:30), still 29 March
    const result = ukDateStr('2026-03-29T01:30:00Z')
    expect(result).toBe('2026-03-29')
  })

  it('Spring forward — 23:30 UTC on 29 March → 30 March in UK (BST, 00:30)', () => {
    // 23:30 UTC = 00:30 BST next day
    const result = ukDateStr('2026-03-29T23:30:00Z')
    expect(result).toBe('2026-03-30')
  })

  // Autumn: 2025 clocks go back Sun 26 October at 02:00 BST → 01:00 GMT
  // (Using 2025 since 2026 date isn't confirmed yet — DST rules are the same)
  it('Autumn back — 00:30 UTC on 26 Oct 2025 → 26 Oct in UK (01:30 BST)', () => {
    const result = ukDateStr('2025-10-26T00:30:00Z')
    expect(result).toBe('2025-10-26')
  })

  it('Autumn back — 01:30 UTC on 26 Oct 2025 → 26 Oct in UK (01:30 GMT, clocks went back)', () => {
    // After 01:00 UTC, UK is back to GMT. 01:30 UTC = 01:30 GMT
    const result = ukDateStr('2025-10-26T01:30:00Z')
    expect(result).toBe('2025-10-26')
  })

  it('Autumn back — 23:30 UTC on 25 Oct 2025 → 26 Oct in UK (00:30 BST)', () => {
    // 23:30 UTC = 00:30 BST (still on BST, hasn't switched yet)
    const result = ukDateStr('2025-10-25T23:30:00Z')
    expect(result).toBe('2025-10-26')
  })
})

describe('startOfDayUK', () => {
  it('returns UK midnight as UTC ISO during BST', () => {
    // Friday 23:30 UTC in May (BST) = Saturday 00:30 UK
    // UK midnight Saturday = Friday 23:00 UTC
    const friday2330utc = new Date('2026-05-15T23:30:00Z')
    const result = startOfDayUK(friday2330utc)
    expect(result).toBe('2026-05-15T23:00:00.000Z')
  })

  it('returns UK midnight as UTC ISO during GMT', () => {
    // Friday 23:30 UTC in January (GMT) = Friday 23:30 UK
    // UK midnight Friday = Friday 00:00 UTC
    const jan2330utc = new Date('2026-01-16T23:30:00Z')
    const result = startOfDayUK(jan2330utc)
    expect(result).toBe('2026-01-16T00:00:00.000Z')
  })
})

// ─────────────────────────────────────────────────
// COMPARISON
// ─────────────────────────────────────────────────

describe('daysBetween', () => {
  it('counts days between two dates', () => {
    expect(daysBetween('2026-05-12', '2026-05-19')).toBe(7)
  })
  it('returns negative for reversed dates', () => {
    expect(daysBetween('2026-05-19', '2026-05-12')).toBe(-7)
  })
  it('returns 0 for same date', () => {
    expect(daysBetween('2026-05-17', '2026-05-17')).toBe(0)
  })
})

// ─────────────────────────────────────────────────
// ARITHMETIC — Working days
// ─────────────────────────────────────────────────

const STD = { workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'], bankHolidays: [], nonWorkingPeriods: [] }

describe('isWorkingDay', () => {
  it('Monday is a working day', () => {
    expect(isWorkingDay('2026-05-11', STD)).toBe(true) // Monday
  })
  it('Saturday is not a working day', () => {
    expect(isWorkingDay('2026-05-16', STD)).toBe(false)
  })
  it('Sunday is not a working day', () => {
    expect(isWorkingDay('2026-05-17', STD)).toBe(false)
  })
  it('Bank holiday is not a working day', () => {
    const opts = { ...STD, bankHolidays: [{ date: '2026-05-25' }] }
    expect(isWorkingDay('2026-05-25', opts)).toBe(false)
  })
  it('Non-working period is not a working day', () => {
    const opts = { ...STD, nonWorkingPeriods: [{ start_date: '2026-12-22', end_date: '2027-01-02' }] }
    expect(isWorkingDay('2026-12-25', opts)).toBe(false)
  })
})

describe('addWorkingDays', () => {
  it('add 5 working days from Friday → next Friday', () => {
    expect(addWorkingDays('2026-05-15', 5, STD)).toBe('2026-05-22') // Fri → next Fri
  })
  it('add 1 working day from Friday → Monday', () => {
    expect(addWorkingDays('2026-05-15', 1, STD)).toBe('2026-05-18') // Fri → Mon
  })
  it('add 5 working days from Monday → Monday', () => {
    expect(addWorkingDays('2026-05-11', 5, STD)).toBe('2026-05-18') // Mon → next Mon
  })
  it('skips bank holiday', () => {
    const opts = { ...STD, bankHolidays: [{ date: '2026-05-25' }] } // Monday BH
    // Fri 22 May + 5 working days: Mon 25 is BH, so Tue 26, Wed 27, Thu 28, Fri 29, Mon 1 Jun
    expect(addWorkingDays('2026-05-22', 5, opts)).toBe('2026-06-01')
  })
  it('skips non-working period', () => {
    const opts = { ...STD, nonWorkingPeriods: [{ start_date: '2026-12-22', end_date: '2027-01-02' }] }
    // Fri 19 Dec + 1 working day → Mon 21 Dec (shutdown starts 22nd, so 21st is fine)
    expect(addWorkingDays('2026-12-19', 1, opts)).toBe('2026-12-21')
    // Fri 19 Dec + 2 working days → shutdown 22 Dec – 2 Jan, next working day is Mon 4 Jan (not 5th — 4 Jan 2027 is Monday)
    expect(addWorkingDays('2026-12-19', 2, opts)).toBe('2027-01-04')
  })
})

describe('countWorkingDays', () => {
  it('counts Mon–Fri as 5 working days', () => {
    expect(countWorkingDays('2026-05-11', '2026-05-15', STD)).toBe(5)
  })
  it('counts Mon–Sun as 5 working days', () => {
    expect(countWorkingDays('2026-05-11', '2026-05-17', STD)).toBe(5)
  })
  it('bank holiday reduces count', () => {
    const opts = { ...STD, bankHolidays: [{ date: '2026-05-25' }] }
    expect(countWorkingDays('2026-05-25', '2026-05-29', opts)).toBe(4)
  })
})

describe('addCalendarDays', () => {
  it('adds positive days', () => {
    expect(addCalendarDays('2026-05-15', 5)).toBe('2026-05-20')
  })
  it('adds negative days', () => {
    expect(addCalendarDays('2026-05-15', -3)).toBe('2026-05-12')
  })
  it('crosses month boundary', () => {
    expect(addCalendarDays('2026-05-30', 3)).toBe('2026-06-02')
  })
})

// ─────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────

describe('weekStart', () => {
  it('returns Monday for a Wednesday', () => {
    // 2026-05-13 is a Wednesday
    const wed = new Date('2026-05-13T12:00:00Z')
    expect(weekStart(wed)).toBe('2026-05-11') // Monday
  })
  it('returns same day for a Monday', () => {
    const mon = new Date('2026-05-11T12:00:00Z')
    expect(weekStart(mon)).toBe('2026-05-11')
  })
  it('returns previous Monday for a Sunday', () => {
    const sun = new Date('2026-05-17T12:00:00Z')
    expect(weekStart(sun)).toBe('2026-05-11')
  })
})

describe('monthStart', () => {
  it('returns first of month', () => {
    const mid = new Date('2026-05-17T12:00:00Z')
    expect(monthStart(mid)).toBe('2026-05-01')
  })
})

// ─────────────────────────────────────────────────
// MATCH EXISTING BEHAVIOUR — programmeCalc compatibility
// ─────────────────────────────────────────────────

describe('compatibility with programmeCalc', () => {
  it('isWorkingDay matches programmeCalc for standard week', () => {
    // Monday through Friday = working, Sat/Sun = not
    for (let day = 11; day <= 17; day++) {
      const dateStr = `2026-05-${String(day).padStart(2, '0')}`
      const d = parseCalendarDate(dateStr)
      const dayOfWeek = d.getUTCDay()
      const expected = dayOfWeek >= 1 && dayOfWeek <= 5
      expect(isWorkingDay(dateStr, STD)).toBe(expected)
    }
  })

  it('bank holiday handling matches programmeCalc', () => {
    // programmeCalc checks: bankHolidays.some(bh => bh.date === dateStr)
    // Our function does the same
    const opts = {
      ...STD,
      bankHolidays: [
        { date: '2026-05-25', name: 'Spring Bank Holiday' },
        { date: '2026-08-31', name: 'Summer Bank Holiday' },
      ],
    }
    expect(isWorkingDay('2026-05-25', opts)).toBe(false)
    expect(isWorkingDay('2026-05-26', opts)).toBe(true) // Tuesday after BH
    expect(isWorkingDay('2026-08-31', opts)).toBe(false)
  })

  it('non-working period handling matches programmeCalc', () => {
    // programmeCalc checks: nonWorkingPeriods.some(p => dateStr >= p.start_date && dateStr <= p.end_date)
    const opts = {
      ...STD,
      nonWorkingPeriods: [{ start_date: '2026-12-22', end_date: '2027-01-02', name: 'Xmas' }],
    }
    expect(isWorkingDay('2026-12-21', opts)).toBe(true) // Monday before shutdown starts
    expect(isWorkingDay('2026-12-22', opts)).toBe(false) // In shutdown
    expect(isWorkingDay('2026-12-25', opts)).toBe(false) // In shutdown
    expect(isWorkingDay('2027-01-02', opts)).toBe(false) // Last day of shutdown
    expect(isWorkingDay('2027-01-05', opts)).toBe(true)  // Monday after shutdown
  })
})
