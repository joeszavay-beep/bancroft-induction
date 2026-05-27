import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Copy, ArrowDownToLine } from 'lucide-react'
import {
  computeMilestones, computeForward,
  isoWeekNumber, isUKHoliday, parseLeadTime, fmtDate, fmtDateISO, parseDate,
  DEFAULT_RULES,
} from '../lib/procurementSchedule'

const MODES = [
  { id: 'reverse', label: 'Reverse-plan' },
  { id: 'forward', label: 'Forward-plan' },
]

const MILESTONE_COLORS = {
  techSub:     { dot: '#1B6FC8', label: 'Tech Sub' },
  approval:    { dot: '#D29922', label: 'Approval' },
  orderPlaced: { dot: '#7C3AED', label: 'Order Placed' },
  delivery:    { dot: '#2C9C5E', label: 'Delivery' },
  onSite:      { dot: '#0D1426', label: 'On Site' },
}

function dayKey(d) { return d.toISOString().slice(0, 10) }
function sameDay(a, b) { return a && b && dayKey(a) === dayKey(b) }

export default function ProcurementCalendar({ rules = DEFAULT_RULES, trackerRows = [], onApplyRow }) {
  const [mode, setMode] = useState('reverse')
  const [viewDate, setViewDate] = useState(new Date())
  const [cursor, setCursor] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [leadInput, setLeadInput] = useState('12')
  const [results, setResults] = useState(null)
  const gridRef = useRef(null)

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  // Build grid
  const firstDay = new Date(year, month, 1)
  const startWd = firstDay.getDay() || 7
  const gridStart = new Date(firstDay); gridStart.setDate(gridStart.getDate() - (startWd - 1))
  const days = []
  const d = new Date(gridStart)
  for (let i = 0; i < 42; i++) { days.push(new Date(d)); d.setDate(d.getDate() + 1) }

  // Milestone dots from tracker rows
  const dotMap = {}
  trackerRows.forEach(row => {
    if (!row.requiredOnSite || !row._leadWeeks) return
    const ms = computeMilestones(row.requiredOnSite, row._leadWeeks, rules)
    if (!ms) return
    const entries = { [dayKey(ms.techSubIssue)]: 'techSub', [dayKey(ms.approvalRequired)]: 'approval', [dayKey(ms.orderPlaced)]: 'orderPlaced', [dayKey(ms.delivery)]: 'delivery' }
    const osKey = dayKey(parseDate(row.requiredOnSite)); if (osKey) entries[osKey] = 'onSite'
    Object.entries(entries).forEach(([k, v]) => { if (!dotMap[k]) dotMap[k] = new Set(); dotMap[k].add(v) })
  })

  // Compute results
  useEffect(() => {
    const weeks = parseLeadTime(leadInput)
    if (mode === 'reverse' && selectedDate && weeks) {
      const ms = computeMilestones(selectedDate, weeks, rules)
      if (ms) setResults({ ...ms, onSite: selectedDate, mode: 'reverse' }); else setResults(null)
    } else if (mode === 'forward' && selectedDate && weeks) {
      const ms = computeForward(selectedDate, weeks, rules)
      if (ms) setResults({ ...ms, mode: 'forward' }); else setResults(null)
    } else { setResults(null) }
  }, [selectedDate, leadInput, mode, rules])

  function handleDayClick(day) {
    setSelectedDate(day)
    setCursor(day)
  }

  // Arrow key nav — prevent page scroll, keep calendar in view
  const handleKeyDown = useCallback((e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) return
    e.preventDefault()
    if (e.key === 'Enter') { if (cursor) handleDayClick(cursor); return }
    if (!cursor) { setCursor(new Date()); return }
    const next = new Date(cursor)
    switch (e.key) {
      case 'ArrowLeft': next.setDate(next.getDate() - 1); break
      case 'ArrowRight': next.setDate(next.getDate() + 1); break
      case 'ArrowUp': next.setDate(next.getDate() - 7); break
      case 'ArrowDown': next.setDate(next.getDate() + 7); break
    }
    setCursor(next)
    if (next.getMonth() !== month) setViewDate(new Date(next.getFullYear(), next.getMonth(), 1))
  }, [cursor, month])

  // Result highlights
  const highlights = {}
  if (results && results.mode) {
    if (results.techSubIssue) highlights[dayKey(results.techSubIssue)] = 'techSub'
    if (results.approvalRequired) highlights[dayKey(results.approvalRequired)] = 'approval'
    if (results.orderPlaced) highlights[dayKey(results.orderPlaced)] = 'orderPlaced'
    if (results.delivery) highlights[dayKey(results.delivery)] = 'delivery'
    if (results.onSite) highlights[dayKey(results.onSite)] = 'onSite'
  }

  function copyResults() {
    if (!results) return
    navigator.clipboard?.writeText([
      'Tech Sub: ' + fmtDate(results.techSubIssue),
      'Approval: ' + fmtDate(results.approvalRequired),
      'Order Placed: ' + fmtDate(results.orderPlaced),
      'Delivery: ' + fmtDate(results.delivery),
      'On Site: ' + fmtDate(results.onSite),
    ].join('\n'))
  }

  const monthLabel = viewDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div>
      {/* Mode tabs */}
      <div className="flex border mb-4 overflow-hidden" style={{ borderColor: 'var(--border-color)' }}>
        {MODES.map((m, i) => (
          <button key={m.id}
            onClick={() => { setMode(m.id); setResults(null); setSelectedDate(null) }}
            className="flex-1 py-2 text-xs font-medium transition-colors"
            style={{
              background: mode === m.id ? 'var(--primary-color)' : 'var(--bg-card)',
              color: mode === m.id ? '#fff' : 'var(--text-muted)',
              borderRight: i < MODES.length - 1 ? '1px solid var(--border-color)' : 'none',
            }}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Inputs */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          {mode === 'reverse' ? 'On Site:' : 'Tech Sub:'}
        </label>
        <input type="date" value={selectedDate ? fmtDateISO(selectedDate) : ''}
          onChange={e => setSelectedDate(parseDate(e.target.value))}
          className="px-2.5 py-1.5 border text-sm"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }} />
        <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Lead:</label>
        <div className="flex items-center gap-1">
          <input type="text" value={leadInput} onChange={e => setLeadInput(e.target.value)}
            className="w-12 px-2 py-1.5 border text-sm text-center"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>wks</span>
        </div>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="p-1.5 hover:bg-black/5 transition-colors" style={{ color: 'var(--text-muted)' }}>
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{monthLabel}</span>
        <div className="flex gap-1 items-center">
          <button onClick={() => { setViewDate(new Date()); setCursor(new Date()) }}
            className="text-[11px] px-2.5 py-1 border font-medium transition-colors hover:bg-black/[0.02]"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)', background: 'var(--bg-card)' }}>
            Today
          </button>
          <button onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="p-1.5 hover:bg-black/5 transition-colors" style={{ color: 'var(--text-muted)' }}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div ref={gridRef} tabIndex={0} onKeyDown={handleKeyDown}
        className="grid outline-none border" style={{ gridTemplateColumns: '26px repeat(7, 1fr)', borderColor: 'var(--border-color)' }}>
        {/* Day headers */}
        {['', 'M', 'T', 'W', 'T', 'F', 'S', 'S'].map((h, i) => (
          <div key={i}
            className="text-center text-[10px] font-semibold py-2 border-b"
            style={{
              color: i === 0 ? 'var(--text-muted)' : i >= 6 ? 'var(--text-muted)' : 'var(--text-primary)',
              borderColor: 'var(--border-color)',
              background: 'var(--bg-main)',
            }}>
            {h}
          </div>
        ))}
        {/* Days */}
        {days.map((day, i) => {
          const key = dayKey(day)
          const inMonth = day.getMonth() === month
          const isToday = sameDay(day, today)
          const isCur = cursor && sameDay(day, cursor)
          const isSel = selectedDate && sameDay(day, selectedDate)
          const holiday = isUKHoliday(day)
          const hl = highlights[key]
          const dots = dotMap[key]
          const mc = hl ? MILESTONE_COLORS[hl] : null
          const isWeekend = day.getDay() === 0 || day.getDay() === 6

          const dayCell = (
            <button key={key} onClick={() => handleDayClick(day)}
              className="relative flex flex-col items-center justify-center gap-0.5 border-b border-r transition-all min-h-[40px]"
              style={{
                borderColor: 'var(--border-color)',
                cursor: 'pointer',
                background: isSel ? 'rgba(27,111,200,.12)' : mc ? mc.dot + '14' : isToday ? 'rgba(27,111,200,.04)' : 'transparent',
                outline: isCur ? '2px solid var(--primary-color)' : 'none',
                outlineOffset: -2,
              }}>
              {holiday && <span className="absolute top-0 right-0 w-0 h-0" style={{ borderLeft: '6px solid transparent', borderTop: '6px solid #E8505030' }} />}
              <span className="text-xs leading-none"
                style={{
                  fontWeight: isSel || (mc && hl === 'onSite') ? 700 : isToday ? 600 : 400,
                  color: !inMonth ? 'var(--text-muted)' : mc ? mc.dot : isWeekend ? 'var(--text-muted)' : 'var(--text-primary)',
                  fontSize: mc && hl === 'onSite' ? 14 : 12,
                  opacity: !inMonth ? 0.4 : 1,
                }}>
                {day.getDate()}
              </span>
              {dots && dots.size > 0 && (
                <div className="flex gap-px">
                  {[...dots].map(dd => <span key={dd} className="w-[3px] h-[3px]" style={{ background: MILESTONE_COLORS[dd]?.dot }} />)}
                </div>
              )}
            </button>
          )

          // Week number on Monday
          if (i % 7 === 0) {
            return [
              <div key={`w${i}`} className="flex items-center justify-center text-[9px] border-b border-r"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--border-color)', background: 'var(--bg-main)', opacity: 0.7 }}>
                {isoWeekNumber(day)}
              </div>,
              dayCell,
            ]
          }
          return dayCell
        }).flat()}
      </div>

      {/* Results */}
      {results && (
        <div className="mt-3 border" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-main)' }}>
          <div className="flex justify-between items-center px-3 py-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              {results.mode === 'reverse' ? 'Reverse Schedule' : 'Forward Schedule'}
            </span>
            <div className="flex gap-1">
              <button onClick={copyResults} className="flex items-center gap-1 px-2 py-1 border text-[11px] transition-colors hover:bg-black/[0.02]"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)', background: 'var(--bg-card)' }}>
                <Copy size={10} /> Copy
              </button>
              {onApplyRow && (
                <button onClick={() => onApplyRow(results)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white"
                  style={{ background: 'var(--primary-color)' }}>
                  <ArrowDownToLine size={10} /> Apply
                </button>
              )}
            </div>
          </div>
          <div className="px-3 py-1.5">
            {[
              { key: 'techSubIssue', label: 'Tech Sub', color: MILESTONE_COLORS.techSub.dot },
              { key: 'approvalRequired', label: 'Approval', color: MILESTONE_COLORS.approval.dot },
              { key: 'orderPlaced', label: 'Order Placed', color: MILESTONE_COLORS.orderPlaced.dot },
              { key: 'delivery', label: 'Delivery', color: MILESTONE_COLORS.delivery.dot },
              { key: 'onSite', label: 'On Site', color: MILESTONE_COLORS.onSite.dot },
            ].map(m => (
              <div key={m.key} className="flex items-center gap-2 py-1.5 border-b last:border-0" style={{ borderColor: 'var(--border-color)' }}>
                <span className="w-2 h-2 shrink-0" style={{ background: m.color }} />
                <span className="text-xs w-24 shrink-0" style={{ color: 'var(--text-muted)' }}>{m.label}</span>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtDate(results[m.key])}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3">
        {Object.entries(MILESTONE_COLORS).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5" style={{ background: v.dot }} />
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{v.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
