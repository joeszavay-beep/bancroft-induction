import { useState, useEffect } from 'react'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Date of birth picker with day/month/year dropdowns.
 * Much faster than native date input for DOBs (no scrolling to 1999).
 *
 * Props:
 *   value: string — ISO date "1999-01-29" or ""
 *   onChange: (isoDate: string) => void
 */
export default function DateOfBirthPicker({ value, onChange }) {
  const currentYear = new Date().getFullYear()
  const minYear = currentYear - 80
  const maxYear = currentYear - 16 // must be at least 16

  // Parse existing value
  const parsed = value ? new Date(value + 'T00:00') : null
  const [day, setDay] = useState(parsed ? parsed.getDate().toString() : '')
  const [month, setMonth] = useState(parsed ? (parsed.getMonth() + 1).toString() : '')
  const [year, setYear] = useState(parsed ? parsed.getFullYear().toString() : '')

  // Sync if value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00')
      if (!isNaN(d.getTime())) {
        setDay(d.getDate().toString())
        setMonth((d.getMonth() + 1).toString())
        setYear(d.getFullYear().toString())
      }
    }
  }, [value])

  function handleChange(newDay, newMonth, newYear) {
    if (newDay && newMonth && newYear) {
      const d = newDay.padStart(2, '0')
      const m = newMonth.padStart(2, '0')
      const iso = `${newYear}-${m}-${d}`
      // Validate the date is real
      const check = new Date(iso + 'T00:00')
      if (!isNaN(check.getTime()) && check.getDate() === parseInt(d)) {
        onChange(iso)
      }
    } else {
      onChange('')
    }
  }

  // Days in selected month
  const daysInMonth = month && year
    ? new Date(parseInt(year), parseInt(month), 0).getDate()
    : 31

  const selectCls = "flex-1 px-2 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10 bg-white appearance-none"

  return (
    <div className="flex gap-2">
      {/* Day */}
      <select
        value={day}
        onChange={e => { setDay(e.target.value); handleChange(e.target.value, month, year) }}
        className={selectCls}
      >
        <option value="">Day</option>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
          <option key={d} value={d.toString()}>{d}</option>
        ))}
      </select>

      {/* Month */}
      <select
        value={month}
        onChange={e => { setMonth(e.target.value); handleChange(day, e.target.value, year) }}
        className={`${selectCls} min-w-0`}
      >
        <option value="">Month</option>
        {MONTHS.map((m, i) => (
          <option key={i} value={(i + 1).toString()}>{m}</option>
        ))}
      </select>

      {/* Year */}
      <select
        value={year}
        onChange={e => { setYear(e.target.value); handleChange(day, month, e.target.value) }}
        className={selectCls}
      >
        <option value="">Year</option>
        {Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i).map(y => (
          <option key={y} value={y.toString()}>{y}</option>
        ))}
      </select>
    </div>
  )
}
