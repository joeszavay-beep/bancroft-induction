import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import WorkerSidebarLayout from '../components/WorkerSidebarLayout'
import { ChevronLeft, ChevronRight, Clock, CalendarDays, QrCode } from 'lucide-react'

function getWeekDates(offset = 0) {
  const now = new Date()
  const day = now.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset + offset * 7)
  monday.setHours(0, 0, 0, 0)

  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    days.push(d)
  }
  return days
}

function formatDate(d) {
  return d.toISOString().split('T')[0]
}

function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const STATUS_STYLES = {
  approved: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', label: 'Approved' },
  reviewed: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', label: 'Reviewed' },
  auto: { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', label: 'Auto' },
  queried: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Queried' },
}

export default function OperativeTimesheet() {
  const navigate = useNavigate()
  const [op, setOp] = useState(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [entries, setEntries] = useState([])
  const [attendance, setAttendance] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAttendance, setShowAttendance] = useState(false)

  useEffect(() => {
    const session = getSession('operative_session')
    if (!session) { navigate('/worker-login'); return }
    setOp(JSON.parse(session))
  }, [])

  useEffect(() => {
    if (op) loadWeek()
  }, [op, weekOffset])

  async function loadWeek() {
    setLoading(true)
    const days = getWeekDates(weekOffset)
    const from = formatDate(days[0])
    const to = formatDate(days[6])

    const [tsRes, attRes] = await Promise.all([
      supabase.from('timesheet_entries')
        .select('*')
        .eq('operative_id', op.id)
        .gte('date', from)
        .lte('date', to)
        .order('date'),
      supabase.from('site_attendance')
        .select('*')
        .eq('operative_id', op.id)
        .gte('recorded_at', `${from}T00:00:00`)
        .lte('recorded_at', `${to}T23:59:59`)
        .order('recorded_at'),
    ])

    setEntries(tsRes.data || [])
    setAttendance(attRes.data || [])
    setLoading(false)
  }

  if (!op) return null

  const days = getWeekDates(weekOffset)
  const weekStart = days[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const weekEnd = days[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  const totalHours = entries.reduce((sum, e) => sum + (e.hours_adjusted ?? e.hours_calculated ?? 0), 0)
  const totalDays = entries.filter(e => (e.hours_adjusted ?? e.hours_calculated ?? 0) > 0).length

  // Map entries by date
  const entryByDate = {}
  entries.forEach(e => { entryByDate[e.date] = e })

  // Map attendance by date
  const attendanceByDate = {}
  attendance.forEach(a => {
    const dateKey = a.recorded_at?.split('T')[0]
    if (!attendanceByDate[dateKey]) attendanceByDate[dateKey] = []
    attendanceByDate[dateKey].push(a)
  })

  return (
    <WorkerSidebarLayout op={op}>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>My Timesheet</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>View your recorded hours</p>
          </div>
          <button
            onClick={() => setShowAttendance(!showAttendance)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              showAttendance ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            <QrCode size={14} />
            QR Data
          </button>
        </div>

        {/* Week selector */}
        <div className="flex items-center justify-between bg-white border border-[#E2E6EA] rounded-xl px-4 py-3">
          <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <ChevronLeft size={18} className="text-slate-600" />
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              <CalendarDays size={14} className="inline mr-1.5 -mt-0.5" />
              {weekStart} — {weekEnd}
            </p>
            {weekOffset === 0 && <p className="text-[10px] text-blue-600 font-medium">This Week</p>}
          </div>
          <button onClick={() => setWeekOffset(w => Math.min(w + 1, 0))} disabled={weekOffset >= 0}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30">
            <ChevronRight size={18} className="text-slate-600" />
          </button>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-[#E2E6EA] rounded-xl p-3.5 text-center">
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{totalHours.toFixed(1)}</p>
            <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--text-muted)' }}>Hours</p>
          </div>
          <div className="bg-white border border-[#E2E6EA] rounded-xl p-3.5 text-center">
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{totalDays}</p>
            <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--text-muted)' }}>Days Worked</p>
          </div>
        </div>

        {/* Day rows */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-2">
            {days.map((day, i) => {
              const dateStr = formatDate(day)
              const entry = entryByDate[dateStr]
              const dayAttendance = attendanceByDate[dateStr] || []
              const hours = entry ? (entry.hours_adjusted ?? entry.hours_calculated ?? 0) : 0
              const status = entry?.status || null
              const style = status ? (STATUS_STYLES[status] || STATUS_STYLES.auto) : null
              const isWeekend = i >= 5
              const isToday = formatDate(new Date()) === dateStr

              return (
                <div key={dateStr} className={`bg-white border rounded-xl overflow-hidden ${
                  isToday ? 'border-blue-300 ring-1 ring-blue-100' : 'border-[#E2E6EA]'
                }`}>
                  <div className="px-4 py-3 flex items-center gap-3">
                    {/* Day label */}
                    <div className="w-12 shrink-0">
                      <p className={`text-xs font-bold ${isWeekend ? 'text-slate-400' : ''}`} style={!isWeekend ? { color: 'var(--text-primary)' } : {}}>
                        {DAY_NAMES[i]}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>

                    {/* Times */}
                    {entry ? (
                      <div className="flex-1 flex items-center gap-4 text-xs">
                        <div>
                          <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-muted)' }}>In</p>
                          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{formatTime(entry.sign_in_time)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-muted)' }}>Out</p>
                          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{formatTime(entry.sign_out_time)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-muted)' }}>Hours</p>
                          <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{hours.toFixed(1)}</p>
                        </div>
                        {entry.day_type && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            entry.day_type === 'full' ? 'bg-green-100 text-green-700' :
                            entry.day_type === 'half' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {entry.day_type === 'full' ? 'Full' : entry.day_type === 'half' ? 'Half' : entry.day_type}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex-1">
                        <p className="text-xs text-slate-400 italic">No record</p>
                      </div>
                    )}

                    {/* Status badge */}
                    {style && (
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${style.bg} ${style.text} ${style.border} border`}>
                        {style.label}
                      </span>
                    )}
                  </div>

                  {/* QR Attendance comparison */}
                  {showAttendance && dayAttendance.length > 0 && (
                    <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1 flex items-center gap-1">
                        <QrCode size={10} /> Raw QR Scans
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {dayAttendance.map(a => (
                          <span key={a.id} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            a.type === 'sign_in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {a.type === 'sign_in' ? 'IN' : 'OUT'} {formatTime(a.recorded_at)}
                            {a.method && <span className="text-slate-400 ml-1">({a.method})</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Read-only notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2.5">
          <Clock size={16} className="text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-blue-800">Read-only timesheet</p>
            <p className="text-[11px] text-blue-600 mt-0.5">Your timesheet is managed by your subcontractor. Contact your supervisor if you notice any discrepancies.</p>
          </div>
        </div>
      </div>
    </WorkerSidebarLayout>
  )
}
