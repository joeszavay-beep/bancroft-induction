import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Clock, LogIn, LogOut, Calendar, X, ChevronDown, ChevronRight } from 'lucide-react'

/**
 * Shows full attendance history for a single operative.
 * Used as a modal/panel when clicking an operative on AllWorkers.
 *
 * Props: operative (object with id, name), onClose (function)
 */
export default function AttendanceHistory({ operative, onClose }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    loadRecords()
  }, [operative.id])

  async function loadRecords() {
    setLoading(true)
    const { data } = await supabase
      .from('site_attendance')
      .select('*, projects(name)')
      .eq('operative_id', operative.id)
      .order('recorded_at', { ascending: false })
      .limit(200)
    setRecords(data || [])
    setLoading(false)
  }

  // Group records into sessions (sign_in → sign_out pairs)
  const sessions = []
  const sorted = [...records].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
  const openSessions = {}

  for (const rec of sorted) {
    const key = `${rec.project_id}_${rec.operative_id}`
    if (rec.type === 'sign_in') {
      openSessions[key] = rec
    } else if (rec.type === 'sign_out' && openSessions[key]) {
      const signIn = openSessions[key]
      const duration = Math.round((new Date(rec.recorded_at) - new Date(signIn.recorded_at)) / (1000 * 60))
      sessions.push({
        date: new Date(signIn.recorded_at).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }),
        signIn: signIn.recorded_at,
        signOut: rec.recorded_at,
        project: signIn.projects?.name || rec.projects?.name || 'Unknown',
        durationMins: duration,
        durationText: duration >= 60 ? `${Math.floor(duration / 60)}h ${duration % 60}m` : `${duration}m`,
        ip: signIn.ip_address,
      })
      delete openSessions[key]
    }
  }

  // Any unmatched sign_ins are "still on site"
  for (const rec of Object.values(openSessions)) {
    sessions.push({
      date: new Date(rec.recorded_at).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }),
      signIn: rec.recorded_at,
      signOut: null,
      project: rec.projects?.name || 'Unknown',
      durationMins: null,
      durationText: 'On site',
      ip: rec.ip_address,
    })
  }

  sessions.reverse() // newest first

  const totalHours = Math.round(sessions.reduce((sum, s) => sum + (s.durationMins || 0), 0) / 60 * 10) / 10
  const totalDays = new Set(sessions.map(s => s.date)).size
  const displayed = showAll ? sessions : sessions.slice(0, 20)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900">Attendance Record</h3>
            <p className="text-xs text-slate-500">{operative.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3 px-5 py-3 border-b border-slate-200 bg-slate-50">
          <div className="text-center">
            <p className="text-lg font-bold text-slate-900">{totalDays}</p>
            <p className="text-[10px] text-slate-500 uppercase">Days</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-slate-900">{totalHours}</p>
            <p className="text-[10px] text-slate-500 uppercase">Hours</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-slate-900">{totalDays > 0 ? (totalHours / totalDays).toFixed(1) : '0'}</p>
            <p className="text-[10px] text-slate-500 uppercase">Avg hrs/day</p>
          </div>
        </div>

        {/* Records list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Clock size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No attendance records</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {displayed.map((s, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Calendar size={16} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{s.date}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span className="flex items-center gap-1">
                        <LogIn size={10} className="text-green-500" />
                        {new Date(s.signIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {s.signOut ? (
                        <span className="flex items-center gap-1">
                          <LogOut size={10} className="text-red-500" />
                          {new Date(s.signOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        <span className="text-green-600 font-medium">Still on site</span>
                      )}
                      <span className="text-slate-400">·</span>
                      <span>{s.project}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-semibold ${s.signOut ? 'text-slate-700' : 'text-green-600'}`}>{s.durationText}</p>
                  </div>
                </div>
              ))}
              {!showAll && sessions.length > 20 && (
                <button onClick={() => setShowAll(true)} className="w-full py-3 text-xs text-blue-500 font-medium hover:bg-blue-50 transition-colors">
                  Show all {sessions.length} records
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
