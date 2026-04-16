import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import { TRADES, BOOKING_STATUSES, formatDate, formatDayRate } from '../lib/marketplace'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Filter, CalendarCheck, Loader2, Inbox, ChevronDown, ChevronUp,
  User, Star, X, CheckCircle, Clock, AlertTriangle, Send
} from 'lucide-react'

const ONBOARDING_STEPS = [
  { key: 'pending', label: 'Pending', icon: Clock },
  { key: 'induction_sent', label: 'Induction Sent', icon: Send },
  { key: 'completed', label: 'Completed', icon: CheckCircle },
  { key: 'site_ready', label: 'Site Ready', icon: CalendarCheck },
]

export default function Bookings() {
  const managerData = JSON.parse(getSession('manager_data') || '{}')

  const [bookings, setBookings] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [statusFilter, setStatusFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Detail panel
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [attendance, setAttendance] = useState([])
  const [feedbackRating, setFeedbackRating] = useState(0)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [submittingFeedback, setSubmittingFeedback] = useState(false)

  async function loadData() {
    setLoading(true)
    try {
      let bookQuery = supabase
        .from('labour_bookings')
        .select('*, agency_operatives(first_name, last_name, photo_url, primary_trade, rating), agencies(company_name), projects(name)')
        .order('start_date', { ascending: false })
      if (managerData.company_id) bookQuery = bookQuery.eq('company_id', managerData.company_id)
      const { data: bookData, error: bookErr } = await bookQuery
      if (bookErr) throw bookErr
      setBookings(bookData || [])

      let projQuery = supabase.from('projects').select('id, name').order('name')
      if (managerData.company_id) projQuery = projQuery.eq('company_id', managerData.company_id)
      const { data: projData } = await projQuery
      setProjects(projData || [])
    } catch (err) {
      console.error('loadData error:', err)
      toast.error('Failed to load bookings')
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filteredBookings = useMemo(() => {
    let result = bookings
    if (statusFilter) result = result.filter(b => b.status === statusFilter)
    if (projectFilter) result = result.filter(b => b.project_id === projectFilter)
    return result
  }, [bookings, statusFilter, projectFilter])

  async function openDetail(booking) {
    setSelectedBooking(booking)
    setDetailLoading(true)
    setFeedbackRating(0)
    setFeedbackComment('')
    try {
      // Load attendance records (if attendance table exists)
      const { data: att, error: attError } = await supabase
        .from('site_sign_ins')
        .select('*')
        .eq('operative_id', booking.operative_id)
        .eq('project_id', booking.project_id)
        .gte('signed_in_at', booking.start_date)
        .lte('signed_in_at', booking.end_date)
        .order('signed_in_at', { ascending: true })
      if (attError) {
        console.warn('site_sign_ins query failed (table may not exist):', attError.message)
        setAttendance([])
      } else {
        setAttendance(att || [])
      }
    } catch (err) {
      console.warn('loadAttendance error:', err)
      setAttendance([])
    }
    setDetailLoading(false)
  }

  function closeDetail() {
    setSelectedBooking(null)
    setAttendance([])
  }

  async function handleOnboardingUpdate(booking, newStatus) {
    try {
      const { error } = await supabase
        .from('labour_bookings')
        .update({ onboarding_status: newStatus })
        .eq('id', booking.id)
      if (error) throw error
      toast.success(`Onboarding updated to: ${ONBOARDING_STEPS.find(s => s.key === newStatus)?.label}`)
      // Update local state
      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, onboarding_status: newStatus } : b))
      setSelectedBooking(prev => prev ? { ...prev, onboarding_status: newStatus } : prev)
    } catch {
      toast.error('Failed to update onboarding')
    }
  }

  async function handleCancelBooking(booking) {
    if (!confirm('Are you sure you want to cancel this booking?')) return
    try {
      const { error } = await supabase
        .from('labour_bookings')
        .update({ status: 'cancelled' })
        .eq('id', booking.id)
      if (error) throw error

      // Free up operative availability
      await supabase
        .from('operative_availability')
        .delete()
        .eq('operative_id', booking.operative_id)
        .gte('date', booking.start_date)
        .lte('date', booking.end_date)
        .eq('status', 'booked')

      toast.success('Booking cancelled')
      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled' } : b))
      setSelectedBooking(prev => prev ? { ...prev, status: 'cancelled' } : prev)
    } catch {
      toast.error('Failed to cancel booking')
    }
  }

  async function handleSubmitFeedback(booking) {
    if (!feedbackRating) { toast.error('Please select a rating'); return }
    setSubmittingFeedback(true)
    try {
      const { error } = await supabase.from('labour_bookings').update({
        rating_from_subcontractor: feedbackRating,
        feedback_from_subcontractor: feedbackComment || null,
      }).eq('id', booking.id)
      if (error) throw error
      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, rating_from_subcontractor: feedbackRating, feedback_from_subcontractor: feedbackComment } : b))
      toast.success('Feedback submitted')
      setFeedbackRating(0)
      setFeedbackComment('')
    } catch {
      toast.error('Failed to submit feedback')
    }
    setSubmittingFeedback(false)
  }

  // Calculate attendance %
  function getAttendancePercent(booking) {
    if (!booking.start_date || !booking.end_date) return null
    const start = new Date(booking.start_date)
    const end = new Date(booking.end_date)
    const today = new Date()
    const effectiveEnd = end < today ? end : today
    if (effectiveEnd < start) return null
    let workDays = 0
    const d = new Date(start)
    while (d <= effectiveEnd) {
      const day = d.getDay()
      if (day !== 0 && day !== 6) workDays++
      d.setDate(d.getDate() + 1)
    }
    if (workDays === 0) return null
    return Math.round((attendance.length / workDays) * 100)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Bookings</h1>
        <p className="text-sm text-slate-500">Manage labour bookings, onboarding and attendance</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowFilters(f => !f)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <Filter size={14} /> Filters
          {(statusFilter || projectFilter) && <span className="w-2 h-2 rounded-full bg-blue-500" />}
        </button>

        {showFilters && (
          <>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-400"
            >
              <option value="">All Statuses</option>
              {Object.entries(BOOKING_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>

            <select
              value={projectFilter}
              onChange={e => setProjectFilter(e.target.value)}
              className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-400"
            >
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            {(statusFilter || projectFilter) && (
              <button
                onClick={() => { setStatusFilter(''); setProjectFilter('') }}
                className="text-xs text-blue-500 hover:text-blue-700 font-medium"
              >
                Clear all
              </button>
            )}
          </>
        )}
      </div>

      {/* Bookings table */}
      {filteredBookings.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <Inbox size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No bookings found</p>
          <p className="text-xs text-slate-400 mt-1">Bookings are created when you accept proposals on labour requests</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500">Operative</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500">Agency</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500">Trade</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500">Project</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500">Dates</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500">Status</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500">Onboarding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBookings.map(booking => {
                  const op = booking.agency_operatives || {}
                  const agency = booking.agencies || {}
                  const project = booking.projects || {}
                  const bs = BOOKING_STATUSES[booking.status] || BOOKING_STATUSES.confirmed
                  const onStep = ONBOARDING_STEPS.find(s => s.key === booking.onboarding_status)

                  return (
                    <tr
                      key={booking.id}
                      onClick={() => openDetail(booking)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2.5 text-slate-800 font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                            {op.photo_url ? (
                              <img src={op.photo_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <User size={14} className="text-slate-400" />
                            )}
                          </div>
                          {`${op.first_name || ''} ${op.last_name || ''}`.trim() || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 text-xs">{agency.company_name || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-600 text-xs">{TRADES[booking.agency_operatives?.primary_trade]?.label || booking.agency_operatives?.primary_trade || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-600 text-xs">{project.name || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-600 text-xs whitespace-nowrap">
                        {formatDate(booking.start_date)} — {formatDate(booking.end_date)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-${bs.color}-100 text-${bs.color}-700`}>
                          {bs.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {onStep?.label || booking.onboarding_status || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail panel (slide-over) */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeDetail} />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-xl overflow-y-auto">
            <div className="p-5 space-y-5">
              {/* Close */}
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900">Booking Detail</h2>
                <button onClick={closeDetail} className="p-1 text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>

              {/* Operative info */}
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                  {selectedBooking.agency_operatives?.photo_url ? (
                    <img src={selectedBooking.agency_operatives.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User size={24} className="text-slate-400" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">{`${selectedBooking.agency_operatives?.first_name || ''} ${selectedBooking.agency_operatives?.last_name || ''}`.trim() || 'Operative'}</h3>
                  <p className="text-xs text-slate-500">
                    {selectedBooking.agencies?.company_name || 'Agency'} &middot; {TRADES[selectedBooking.trade]?.label || selectedBooking.trade}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formatDate(selectedBooking.start_date)} — {formatDate(selectedBooking.end_date)}
                    {' '}&middot;{' '}Rate: {formatDayRate(selectedBooking.agreed_day_rate)}
                  </p>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center gap-2">
                {(() => {
                  const bs = BOOKING_STATUSES[selectedBooking.status] || BOOKING_STATUSES.confirmed
                  return (
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium bg-${bs.color}-100 text-${bs.color}-700`}>
                      {bs.label}
                    </span>
                  )
                })()}
              </div>

              {/* Onboarding checklist */}
              <div className="border border-slate-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Onboarding Progress</h3>
                <div className="space-y-2">
                  {ONBOARDING_STEPS.map((step, i) => {
                    const currentIdx = ONBOARDING_STEPS.findIndex(s => s.key === selectedBooking.onboarding_status)
                    const isComplete = i <= currentIdx
                    const _isCurrent = i === currentIdx
                    const isNext = i === currentIdx + 1
                    const Icon = step.icon
                    return (
                      <div key={step.key} className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                          isComplete ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'
                        }`}>
                          <Icon size={14} />
                        </div>
                        <span className={`text-sm flex-1 ${isComplete ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>
                          {step.label}
                        </span>
                        {isNext && selectedBooking.status !== 'cancelled' && (
                          <button
                            onClick={() => handleOnboardingUpdate(selectedBooking, step.key)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Mark done
                          </button>
                        )}
                        {isComplete && <CheckCircle size={14} className="text-green-500 shrink-0" />}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Attendance */}
              <div className="border border-slate-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Attendance Record</h3>
                {detailLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 size={20} className="animate-spin text-slate-400" />
                  </div>
                ) : attendance.length === 0 ? (
                  <p className="text-xs text-slate-400">No sign-in records yet</p>
                ) : (
                  <>
                    {(() => {
                      const pct = getAttendancePercent(selectedBooking)
                      return pct != null ? (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                            <span>Attendance</span>
                            <span className="font-medium">{pct}%</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all ${pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                        </div>
                      ) : null
                    })()}
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {attendance.map((rec, i) => (
                        <div key={i} className="flex items-center justify-between text-xs text-slate-600 py-1 border-b border-slate-50 last:border-0">
                          <span>{formatDate(rec.signed_in_at?.split('T')[0])}</span>
                          <span>{rec.signed_in_at ? new Date(rec.signed_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Feedback (only for completed bookings) */}
              {selectedBooking.status === 'completed' && (
                <div className="border border-slate-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">Rate & Feedback</h3>
                  <div className="flex items-center gap-1 mb-3">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setFeedbackRating(n)}
                        className="p-0.5"
                      >
                        <Star
                          size={20}
                          className={n <= feedbackRating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}
                        />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={feedbackComment}
                    onChange={e => setFeedbackComment(e.target.value)}
                    rows={3}
                    placeholder="Optional comments..."
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400 resize-y mb-2"
                  />
                  <button
                    onClick={() => handleSubmitFeedback(selectedBooking)}
                    disabled={submittingFeedback}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    {submittingFeedback ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Submit Feedback
                  </button>
                </div>
              )}

              {/* Cancel booking */}
              {selectedBooking.status !== 'cancelled' && selectedBooking.status !== 'completed' && (
                <button
                  onClick={() => handleCancelBooking(selectedBooking)}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-lg text-xs font-semibold transition-colors"
                >
                  <X size={14} /> Cancel Booking
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
