import { describe, it, expect } from 'vitest'
import { buildLabourGrid } from './utils'

// 2026-06-15 is a Monday, 2026-06-16 a Tuesday. Datetimes are written WITHOUT a
// trailing Z so they parse in the runner's local TZ and read back the same calendar
// day — making getDay() bucketing stable regardless of where the test runs.
const operatives = [
  { id: 'A', role: 'Electrician' },
  { id: 'B', role: 'Electrician' },
  { id: 'C', role: 'Labourer' },
  { id: 'D' }, // no role -> 'General'
]

describe('buildLabourGrid — Labour Return single source of truth', () => {
  it('counts unique operatives per day: sign-outs excluded, re-entries deduped', () => {
    const attendance = [
      // Monday
      { operative_id: 'A', type: 'sign_in', recorded_at: '2026-06-15T07:00:00' },
      { operative_id: 'A', type: 'sign_out', recorded_at: '2026-06-15T16:00:00' }, // excluded
      { operative_id: 'A', type: 'sign_in', recorded_at: '2026-06-15T12:30:00' }, // re-entry -> still 1
      { operative_id: 'B', type: 'sign_in', recorded_at: '2026-06-15T07:30:00' },
      { operative_id: 'C', type: 'sign_in', recorded_at: '2026-06-15T07:45:00' },
      { operative_id: 'D', type: 'sign_in', recorded_at: '2026-06-15T08:00:00' },
      // Tuesday
      { operative_id: 'A', type: 'sign_in', recorded_at: '2026-06-16T07:00:00' },
      { operative_id: 'B', type: 'sign_in', recorded_at: '2026-06-16T07:10:00' },
      // no operative_id -> skipped (can't dedupe into a headcount)
      { operative_id: null, type: 'sign_in', recorded_at: '2026-06-15T09:00:00' },
    ]
    const g = buildLabourGrid(attendance, operatives)

    // Per-day unique headcount: Mon = A,B,C,D = 4 ; Tue = A,B = 2
    expect(g.dayCounts).toEqual([4, 2, 0, 0, 0, 0, 0])
    expect(g.grandTotal).toBe(6)          // total person-days, NOT the 9 raw rows
    expect(g.uniqueOps).toBe(4)           // A,B,C,D across the week
    expect(g.avgDaily).toBe('3.0')        // 6 / 2 active days
    expect(g.peakDay).toBe('Mon (4)')

    // Rows grouped by trade, alphabetical
    const byTrade = Object.fromEntries(g.rows.map(r => [r.trade, r]))
    expect(byTrade.Electrician.days).toEqual([2, 2, 0, 0, 0, 0, 0]) // A,B both days
    expect(byTrade.Electrician.total).toBe(4)
    expect(byTrade.Labourer.days).toEqual([1, 0, 0, 0, 0, 0, 0])
    expect(byTrade.General.days).toEqual([1, 0, 0, 0, 0, 0, 0])     // D, no role

    // Per-day trade counts sum to the day headcount (no double counting)
    const monSum = g.rows.reduce((s, r) => s + r.days[0], 0)
    expect(monSum).toBe(g.dayCounts[0])
  })

  it('empty attendance yields an empty, zeroed grid', () => {
    const g = buildLabourGrid([], operatives)
    expect(g.rows).toEqual([])
    expect(g.dayCounts).toEqual([0, 0, 0, 0, 0, 0, 0])
    expect(g.grandTotal).toBe(0)
    expect(g.uniqueOps).toBe(0)
    expect(g.peakDay).toBe('—')
  })

  it('tolerates bad input (null array, missing operatives)', () => {
    expect(buildLabourGrid(null, null).grandTotal).toBe(0)
    const g = buildLabourGrid(
      [{ operative_id: 'Z', type: 'sign_in', recorded_at: '2026-06-15T07:00:00' }],
      null,
    )
    expect(g.grandTotal).toBe(1)
    expect(g.rows[0].trade).toBe('General') // unknown operative -> General
  })
})
