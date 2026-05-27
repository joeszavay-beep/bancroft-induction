import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Copy, ArrowDownToLine } from 'lucide-react'
import {
  computeMilestones, computeForward, countWorkingDays, countCalendarDays,
  isoWeekNumber, isUKHoliday, parseLeadTime, fmtDate, fmtDateISO, parseDate,
  DEFAULT_RULES,
} from '../lib/procurementSchedule'

const MODES = [
  { id: 'reverse', label: 'Reverse-plan' },
  { id: 'forward', label: 'Forward-plan' },
  { id: 'working', label: 'Working days' },
]

const MILESTONE_COLORS = {
  techSub:    { bg: 'var(--blue)',   dot: '#1B6FC8', label: 'Tech Sub' },
  approval:   { bg: '#D29922',      dot: '#D29922', label: 'Approval' },
  orderPlaced:{ bg: '#7C3AED',      dot: '#7C3AED', label: 'Order Placed' },
  delivery:   { bg: '#2C9C5E',      dot: '#2C9C5E', label: 'Delivery' },
  onSite:     { bg: 'var(--navy)',   dot: '#0D1426', label: 'On Site' },
}

function dayKey(d) { return d.toISOString().slice(0, 10) }
function sameDay(a, b) { return a && b && dayKey(a) === dayKey(b) }

export default function ProcurementCalendar({ rules = DEFAULT_RULES, trackerRows = [], onApplyRow }) {
  const [mode, setMode] = useState('reverse')
  const [viewDate, setViewDate] = useState(new Date())
  const [cursor, setCursor] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedDate2, setSelectedDate2] = useState(null)
  const [leadInput, setLeadInput] = useState('12')
  const [results, setResults] = useState(null)
  const gridRef = useRef(null)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  // Build calendar grid
  const firstDay = new Date(year, month, 1)
  const startWeekday = firstDay.getDay() || 7 // ISO Mon=1
  const gridStart = new Date(firstDay)
  gridStart.setDate(gridStart.getDate() - (startWeekday - 1))

  const days = []
  const d = new Date(gridStart)
  for (let i = 0; i < 42; i++) {
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }

  // Build milestone dot map from tracker rows
  const dotMap = {}
  trackerRows.forEach(row => {
    if (!row.requiredOnSite || !row._leadWeeks) return
    const ms = computeMilestones(row.requiredOnSite, row._leadWeeks, rules)
    if (!ms) return
    const map = {
      [dayKey(ms.techSubIssue)]: 'techSub',
      [dayKey(ms.approvalRequired)]: 'approval',
      [dayKey(ms.orderPlaced)]: 'orderPlaced',
      [dayKey(ms.delivery)]: 'delivery',
    }
    const osKey = dayKey(parseDate(row.requiredOnSite))
    if (osKey) map[osKey] = 'onSite'
    Object.entries(map).forEach(([k, v]) => {
      if (!dotMap[k]) dotMap[k] = new Set()
      dotMap[k].add(v)
    })
  })

  // Compute on input change
  useEffect(() => {
    const weeks = parseLeadTime(leadInput)
    if (mode === 'reverse' && selectedDate && weeks) {
      const ms = computeMilestones(selectedDate, weeks, rules)
      if (ms) setResults({ ...ms, onSite: selectedDate, mode: 'reverse' })
      else setResults(null)
    } else if (mode === 'forward' && selectedDate && weeks) {
      const ms = computeForward(selectedDate, weeks, rules)
      if (ms) setResults({ ...ms, mode: 'forward' })
      else setResults(null)
    } else if (mode === 'working' && selectedDate && selectedDate2) {
      const cal = countCalendarDays(selectedDate, selectedDate2)
      const work = countWorkingDays(selectedDate, selectedDate2)
      setResults({ calendarDays: Math.abs(cal), workingDays: work, weeks: (Math.abs(cal) / 7).toFixed(1), mode: 'working' })
    } else {
      setResults(null)
    }
  }, [selectedDate, selectedDate2, leadInput, mode, rules])

  function prevMonth() { setViewDate(new Date(year, month - 1, 1)) }
  function nextMonth() { setViewDate(new Date(year, month + 1, 1)) }
  function goToday() { setViewDate(new Date()); setCursor(new Date()) }

  function handleDayClick(day) {
    if (mode === 'working') {
      if (!selectedDate || (selectedDate && selectedDate2)) {
        setSelectedDate(day)
        setSelectedDate2(null)
      } else {
        setSelectedDate2(day)
      }
    } else {
      setSelectedDate(day)
    }
    setCursor(day)
  }

  // Keyboard nav
  const handleKeyDown = useCallback((e) => {
    if (!cursor) return
    let next = new Date(cursor)
    switch (e.key) {
      case 'ArrowLeft':  next.setDate(next.getDate() - 1); break
      case 'ArrowRight': next.setDate(next.getDate() + 1); break
      case 'ArrowUp':    next.setDate(next.getDate() - 7); break
      case 'ArrowDown':  next.setDate(next.getDate() + 7); break
      case 'Enter':      handleDayClick(cursor); return
      default: return
    }
    e.preventDefault()
    setCursor(next)
    if (next.getMonth() !== month) setViewDate(new Date(next.getFullYear(), next.getMonth(), 1))
  }, [cursor, month])

  // Result highlight dates
  const highlights = {}
  if (results && results.mode !== 'working') {
    if (results.techSubIssue) highlights[dayKey(results.techSubIssue)] = 'techSub'
    if (results.approvalRequired) highlights[dayKey(results.approvalRequired)] = 'approval'
    if (results.orderPlaced) highlights[dayKey(results.orderPlaced)] = 'orderPlaced'
    if (results.delivery) highlights[dayKey(results.delivery)] = 'delivery'
    if (results.onSite) highlights[dayKey(results.onSite)] = 'onSite'
  }

  function copyResults() {
    if (!results || results.mode === 'working') return
    const lines = [
      `Tech Sub: ${fmtDate(results.techSubIssue)}`,
      `Approval: ${fmtDate(results.approvalRequired)}`,
      `Order Placed: ${fmtDate(results.orderPlaced)}`,
      `Delivery: ${fmtDate(results.delivery)}`,
      `On Site: ${fmtDate(results.onSite)}`,
    ].join('\n')
    navigator.clipboard?.writeText(lines)
  }

  const monthLabel = viewDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const DAY_HEADERS = ['W', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="so-cal" style={{ minWidth: 0, flex: 1 }}>
      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, border: '1px solid var(--line)', overflow: 'hidden' }}>
        {MODES.map(m => (
          <button key={m.id} onClick={() => { setMode(m.id); setResults(null); setSelectedDate(null); setSelectedDate2(null) }}
            style={{
              flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: mode === m.id ? 600 : 400, letterSpacing: '.02em',
              background: mode === m.id ? 'var(--blue)' : 'var(--paper)',
              color: mode === m.id ? '#fff' : 'var(--muted)',
              fontFamily: "'Hanken Grotesk',sans-serif",
            }}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Inputs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {mode !== 'working' && (
          <>
            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
              {mode === 'reverse' ? 'Required On Site:' : 'Tech Sub Date:'}
            </label>
            <input type="date" value={selectedDate ? fmtDateISO(selectedDate) : ''}
              onChange={e => setSelectedDate(parseDate(e.target.value))}
              style={{
                padding: '6px 10px', border: '1px solid var(--line)', fontSize: 13,
                fontFamily: "'Hanken Grotesk',sans-serif", color: 'var(--ink)', background: 'var(--paper)',
              }} />
            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Lead Time:</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <input type="text" value={leadInput} onChange={e => setLeadInput(e.target.value)}
                style={{
                  width: 48, padding: '6px 8px', border: '1px solid var(--line)', fontSize: 13, textAlign: 'center',
                  fontFamily: "'Hanken Grotesk',sans-serif", color: 'var(--ink)', background: 'var(--paper)',
                }} />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>weeks</span>
            </div>
          </>
        )}
        {mode === 'working' && (
          <>
            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Start:</label>
            <input type="date" value={selectedDate ? fmtDateISO(selectedDate) : ''}
              onChange={e => setSelectedDate(parseDate(e.target.value))}
              style={{ padding: '6px 10px', border: '1px solid var(--line)', fontSize: 13, fontFamily: "'Hanken Grotesk',sans-serif", color: 'var(--ink)', background: 'var(--paper)' }} />
            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>End:</label>
            <input type="date" value={selectedDate2 ? fmtDateISO(selectedDate2) : ''}
              onChange={e => setSelectedDate2(parseDate(e.target.value))}
              style={{ padding: '6px 10px', border: '1px solid var(--line)', fontSize: 13, fontFamily: "'Hanken Grotesk',sans-serif", color: 'var(--ink)', background: 'var(--paper)' }} />
          </>
        )}
      </div>

      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><ChevronLeft size={18} /></button>
        <span style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 600, color: 'var(--navy)' }}>{monthLabel}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={goToday} style={{ fontSize: 11, padding: '3px 10px', background: 'var(--paper-2)', border: '1px solid var(--line)', cursor: 'pointer', color: 'var(--muted)', fontFamily: "'Hanken Grotesk',sans-serif", fontWeight: 500 }}>Today</button>
          <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><ChevronRight size={18} /></button>
        </div>
      </div>

      {/* Grid */}
      <div ref={gridRef} tabIndex={0} onKeyDown={handleKeyDown}
        style={{ display: 'grid', gridTemplateColumns: '28px repeat(7, 1fr)', gap: 0, outline: 'none' }}>
        {/* Day headers */}
        {DAY_HEADERS.map((h, i) => (
          <div key={h} style={{
            fontSize: 10, fontWeight: 600, color: 'var(--muted)', textAlign: 'center',
            padding: '6px 0', borderBottom: '1px solid var(--line)',
            ...(i === 0 ? { color: 'var(--muted-2)' } : {}),
          }}>{h}</div>
        ))}

        {/* Days */}
        {days.map((day, i) => {
          const key = dayKey(day)
          const inMonth = day.getMonth() === month
          const isToday = sameDay(day, today)
          const isCursor = cursor && sameDay(day, cursor)
          const isSel = selectedDate && sameDay(day, selectedDate)
          const isSel2 = selectedDate2 && sameDay(day, selectedDate2)
          const holiday = isUKHoliday(day)
          const hl = highlights[key]
          const dots = dotMap[key]
          const isWeekNum = i % 8 === 0
          const isWeekend = day.getDay() === 0 || day.getDay() === 6

          // Week number cell
          if (i % 7 === 0) {
            const wn = isoWeekNumber(day)
            return [
              <div key={`w${i}`} style={{
                fontSize: 9, color: 'var(--muted-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderBottom: '1px solid var(--line)',
              }}>{wn}</div>,
              <DayCell key={key} day={day} num={day.getDate()} {...{ inMonth, isToday, isCursor, isSel, isSel2, holiday, hl, dots, isWeekend, onClick: () => handleDayClick(day) }} />,
            ]
          }
          return <DayCell key={key} day={day} num={day.getDate()} {...{ inMonth, isToday, isCursor, isSel, isSel2, holiday, hl, dots, isWeekend, onClick: () => handleDayClick(day) }} />
        }).flat()}
      </div>

      {/* Results */}
      {results && results.mode !== 'working' && (
        <div style={{ marginTop: 14, padding: 12, background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
              {results.mode === 'reverse' ? 'Reverse Schedule' : 'Forward Schedule'}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={copyResults} title="Copy to clipboard"
                style={{ background: 'none', border: '1px solid var(--line)', padding: '4px 8px', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: "'Hanken Grotesk',sans-serif" }}>
                <Copy size={12} /> Copy
              </button>
              {onApplyRow && (
                <button onClick={() => onApplyRow(results)} title="Apply to selected row"
                  style={{ background: 'var(--blue)', border: 'none', padding: '4px 10px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: "'Hanken Grotesk',sans-serif", fontWeight: 600 }}>
                  <ArrowDownToLine size={12} /> Apply
                </button>
              )}
            </div>
          </div>
          {[
            { key: 'techSubIssue', label: 'Tech Sub', color: MILESTONE_COLORS.techSub.dot },
            { key: 'approvalRequired', label: 'Approval Required', color: MILESTONE_COLORS.approval.dot },
            { key: 'orderPlaced', label: 'Order Placed', color: MILESTONE_COLORS.orderPlaced.dot },
            { key: 'delivery', label: 'Delivery', color: MILESTONE_COLORS.delivery.dot },
            { key: 'onSite', label: 'Required On Site', color: MILESTONE_COLORS.onSite.dot },
          ].map(m => (
            <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ width: 8, height: 8, background: m.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--muted)', width: 120, flexShrink: 0 }}>{m.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: "'Hanken Grotesk',sans-serif" }}>{fmtDate(results[m.key])}</span>
            </div>
          ))}
        </div>
      )}

      {results && results.mode === 'working' && (
        <div style={{ marginTop: 14, padding: 12, background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '.1em', display: 'block', marginBottom: 8 }}>Result</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { label: 'Calendar days', val: results.calendarDays },
              { label: 'Working days', val: results.workingDays },
              { label: 'Weeks', val: results.weeks },
            ].map(r => (
              <div key={r.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 600, color: 'var(--ink)' }}>{r.val}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginTop: 2 }}>{r.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {Object.entries(MILESTONE_COLORS).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, background: v.dot }} />
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>{v.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DayCell({ day, num, inMonth, isToday, isCursor, isSel, isSel2, holiday, hl, dots, isWeekend, onClick }) {
  const mc = hl ? MILESTONE_COLORS[hl] : null
  return (
    <button onClick={onClick}
      style={{
        border: 'none', padding: '4px 2px 6px', cursor: 'pointer', position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        background: mc ? mc.dot + '18' : isSel || isSel2 ? 'var(--blue-soft)' : 'var(--paper)',
        outline: isCursor ? '2px solid var(--blue)' : isToday ? '1px solid var(--line-2)' : 'none',
        outlineOffset: -1,
        borderBottom: '1px solid var(--line)',
        minHeight: 38,
      }}>
      {holiday && (
        <span style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderLeft: '6px solid transparent', borderTop: '6px solid #E8505020' }} />
      )}
      <span style={{
        fontSize: mc && hl === 'onSite' ? 14 : 12,
        fontWeight: isSel || isSel2 || (mc && hl === 'onSite') ? 700 : isToday ? 600 : 400,
        color: !inMonth ? 'var(--muted-2)' : mc ? mc.dot : isWeekend ? 'var(--muted)' : 'var(--ink)',
        fontFamily: mc ? "'Fraunces',serif" : "'Hanken Grotesk',sans-serif",
        lineHeight: 1.3,
      }}>{num}</span>
      {/* Milestone dots from tracker */}
      {dots && dots.size > 0 && (
        <div style={{ display: 'flex', gap: 2 }}>
          {[...dots].map(d => (
            <span key={d} style={{ width: 3, height: 3, background: MILESTONE_COLORS[d]?.dot || '#999' }} />
          ))}
        </div>
      )}
    </button>
  )
}
