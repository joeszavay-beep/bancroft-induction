/**
 * Unit tests for programmeCalc.js
 * Run with: node --experimental-vm-modules src/lib/programmeCalc.test.js
 */

// Inline the functions for Node testing (no ESM import issues)
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function parseDate(s) { return new Date(s + 'T12:00:00') }

function isWorkingDay(date, settings) {
  const { workingDays = ['mon','tue','wed','thu','fri'], bankHolidays = [], nonWorkingPeriods = [] } = settings
  const dayName = DAY_NAMES[date.getDay()]
  const dateStr = toISO(date)
  if (!workingDays.includes(dayName)) return false
  if (bankHolidays.some(bh => bh.date === dateStr)) return false
  if (nonWorkingPeriods.some(p => dateStr >= p.start_date && dateStr <= p.end_date)) return false
  return true
}

function calculateEndDate(startDate, duration, mode, settings = {}, todayStr) {
  if (!startDate || !duration || duration < 1) return { endDate: startDate || '', warnings: [] }
  const start = parseDate(startDate)
  const warnings = []

  if (mode === 'calendar_days') {
    return { endDate: toISO(addDays(start, duration - 1)), warnings }
  }

  let effectiveStart = new Date(start)
  let snappedStart = null, snapDirection = null

  if (mode === 'monday_start_working_days') {
    const workingDays = settings.workingDays || ['mon','tue','wed','thu','fri']
    const targetDayIdx = DAY_NAMES.indexOf(workingDays[0] || 'mon')
    const currentDayIdx = effectiveStart.getDay()
    if (currentDayIdx !== targetDayIdx) {
      const daysBack = (currentDayIdx - targetDayIdx + 7) % 7
      const daysForward = (targetDayIdx - currentDayIdx + 7) % 7
      const today = todayStr || toISO(new Date())
      if (daysBack <= 2) {
        const snappedBackDate = addDays(effectiveStart, -daysBack)
        if (toISO(snappedBackDate) < today) {
          effectiveStart = addDays(effectiveStart, daysForward)
          snapDirection = 'forward'
        } else {
          effectiveStart = snappedBackDate
          snapDirection = 'backward'
        }
      } else {
        effectiveStart = addDays(effectiveStart, daysForward)
        snapDirection = 'forward'
      }
      snappedStart = toISO(effectiveStart)
    }
  }

  let cursor = new Date(effectiveStart)
  while (!isWorkingDay(cursor, settings)) cursor = addDays(cursor, 1)

  let counted = 0, max = duration * 5 + 365
  while (max-- > 0) {
    if (isWorkingDay(cursor, settings)) { counted++; if (counted === duration) break }
    cursor = addDays(cursor, 1)
  }

  return { endDate: toISO(cursor), snappedStart, snapDirection, warnings }
}

// ── Test runner ──
let passed = 0, failed = 0
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`) }
}
function eq(a, b) { if (a !== b) throw new Error(`Expected "${b}", got "${a}"`) }

const STD = { workingDays: ['mon','tue','wed','thu','fri'], bankHolidays: [], nonWorkingPeriods: [] }

console.log('\n── Working Days Mode ──')

test('Mon start, 5 working days → Fri same week', () => {
  eq(calculateEndDate('2026-05-11', 5, 'working_days', STD).endDate, '2026-05-15') // Mon→Fri
})

test('Wed start, 5 working days → Tue next week', () => {
  eq(calculateEndDate('2026-05-13', 5, 'working_days', STD).endDate, '2026-05-19') // Wed→Tue
})

test('Fri start, 5 working days → Thu next week', () => {
  eq(calculateEndDate('2026-05-15', 5, 'working_days', STD).endDate, '2026-05-21') // Fri→Thu
})

test('Mon start, 1 working day → Mon same day', () => {
  eq(calculateEndDate('2026-05-11', 1, 'working_days', STD).endDate, '2026-05-11')
})

test('Fri start, 1 working day → Fri same day', () => {
  eq(calculateEndDate('2026-05-15', 1, 'working_days', STD).endDate, '2026-05-15')
})

test('Sat start (non-working), 5 working days → Fri', () => {
  eq(calculateEndDate('2026-05-16', 5, 'working_days', STD).endDate, '2026-05-22') // Sat→next Fri
})

test('Task spanning bank holiday (Mon 25 May)', () => {
  const s = { ...STD, bankHolidays: [{ date: '2026-05-25' }] }
  // Fri 22 May, 5 working days. Without BH: Fri→Thu 28. With Mon 25 BH: Fri→Fri 29
  eq(calculateEndDate('2026-05-22', 5, 'working_days', s).endDate, '2026-05-29')
})

test('Task spanning non-working period', () => {
  const s = { ...STD, nonWorkingPeriods: [{ start_date: '2026-12-22', end_date: '2027-01-02', name: 'Xmas' }] }
  // Mon 22 Dec falls in shutdown, first working day is Mon 4 Jan, 5 days → Fri 8 Jan
  eq(calculateEndDate('2026-12-22', 5, 'working_days', s).endDate, '2027-01-08')
})

console.log('\n── Calendar Days Mode ──')

test('Mon start, 5 calendar days → Fri', () => {
  eq(calculateEndDate('2026-06-01', 5, 'calendar_days', STD).endDate, '2026-06-05')
})

test('Fri start, 5 calendar days → Tue (includes weekend)', () => {
  eq(calculateEndDate('2026-06-05', 5, 'calendar_days', STD).endDate, '2026-06-09')
})

test('1 calendar day → same day', () => {
  eq(calculateEndDate('2026-06-01', 1, 'calendar_days', STD).endDate, '2026-06-01')
})

console.log('\n── Monday-Start Mode (nearest Monday snap) ──')

test('Mon input → no snap', () => {
  const r = calculateEndDate('2026-05-11', 5, 'monday_start_working_days', STD, '2026-05-01')
  eq(r.snappedStart, null) // Mon, no snap needed
  eq(r.endDate, '2026-05-15')
})

test('Tue input → snap backward to Mon', () => {
  const r = calculateEndDate('2026-05-12', 5, 'monday_start_working_days', STD, '2026-05-01')
  eq(r.snappedStart, '2026-05-11')
  eq(r.snapDirection, 'backward')
  eq(r.endDate, '2026-05-15')
})

test('Wed input → snap backward to Mon', () => {
  const r = calculateEndDate('2026-05-13', 5, 'monday_start_working_days', STD, '2026-05-01')
  eq(r.snappedStart, '2026-05-11')
  eq(r.snapDirection, 'backward')
  eq(r.endDate, '2026-05-15')
})

test('Thu input → snap forward to next Mon', () => {
  const r = calculateEndDate('2026-05-14', 5, 'monday_start_working_days', STD, '2026-05-01')
  eq(r.snappedStart, '2026-05-18')
  eq(r.snapDirection, 'forward')
  eq(r.endDate, '2026-05-22')
})

test('Fri input → snap forward to next Mon', () => {
  const r = calculateEndDate('2026-05-15', 5, 'monday_start_working_days', STD, '2026-05-01')
  eq(r.snappedStart, '2026-05-18')
  eq(r.snapDirection, 'forward')
  eq(r.endDate, '2026-05-22')
})

test('Sat input → snap forward to next Mon', () => {
  const r = calculateEndDate('2026-05-16', 5, 'monday_start_working_days', STD, '2026-05-01')
  eq(r.snappedStart, '2026-05-18')
  eq(r.snapDirection, 'forward')
  eq(r.endDate, '2026-05-22')
})

test('Sun input → snap forward to next Mon', () => {
  const r = calculateEndDate('2026-05-17', 5, 'monday_start_working_days', STD, '2026-05-01')
  eq(r.snappedStart, '2026-05-18')
  eq(r.snapDirection, 'forward')
  eq(r.endDate, '2026-05-22')
})

test('Snap backward would go into past → snap forward instead', () => {
  // Today is Wed 13 May. Tue 12 May would snap back to Mon 11 (past). Should snap forward to Mon 18.
  const r = calculateEndDate('2026-05-12', 5, 'monday_start_working_days', STD, '2026-05-13')
  eq(r.snappedStart, '2026-05-18')
  eq(r.snapDirection, 'forward')
})

test('Tue-Sat working week: Wed → snap backward to Tue', () => {
  const s = { workingDays: ['tue','wed','thu','fri','sat'], bankHolidays: [], nonWorkingPeriods: [] }
  const r = calculateEndDate('2026-05-13', 5, 'monday_start_working_days', s, '2026-05-01') // Wed
  eq(r.snappedStart, '2026-05-12') // Tue
  eq(r.snapDirection, 'backward')
})

console.log('\n── Summary ──')
console.log(`${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
