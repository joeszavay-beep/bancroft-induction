import { useState, useEffect, useMemo } from 'react'
import { useCompany } from '../lib/CompanyContext'
import { authFetch } from '../lib/authFetch'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import { Calendar, Check, X, Clock, Users, ChevronDown, ChevronLeft, ChevronRight, Filter, Plus } from 'lucide-react'
import { formatDateRange } from '../lib/dates'

function daysAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return '1 day ago'
  return `${diff} days ago`
}

function statusBadge(status) {
  const styles = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-700',
    cancelled: 'bg-slate-100 text-slate-500',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status] || styles.pending}`}>
      {status?.charAt(0).toUpperCase() + status?.slice(1)}
    </span>
  )
}

export default function HolidayApprovals() {
  const { user } = useCompany()
  const managerData = JSON.parse(getSession('manager_data') || '{}')
  const managerId = managerData.manager_id
  const managerCompanyId = user?.company_id

  const [activeTab, setActiveTab] = useState('calendar')
  const [pendingRequests, setPendingRequests] = useState([])
  const [allRequests, setAllRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [allowanceCache, setAllowanceCache] = useState({})
  const [loadingAllowance, setLoadingAllowance] = useState(null)

  // Rejection modal
  const [rejectModal, setRejectModal] = useState(null) // { requestId }
  const [rejectNote, setRejectNote] = useState('')
  const [actionLoading, setActionLoading] = useState(null)

  // All Requests filters
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  // Calendar state
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calRequests, setCalRequests] = useState([])
  const [bankHolidays, setBankHolidays] = useState([])
  const [loadingCal, setLoadingCal] = useState(false)

  async function fetchPending() {
    if (!managerCompanyId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: 'pending' })
      if (managerId) params.set('managerId', managerId)
      const res = await authFetch(`/api/holidays?${params.toString()}`)
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        const sorted = (data.requests || data || []).sort(
          (a, b) => new Date(a.start_date) - new Date(b.start_date)
        )
        setPendingRequests(sorted)
      }
    } catch (err) {
      toast.error('Failed to load pending requests')
    }
    setLoading(false)
  }

  async function fetchAll() {
    if (!managerCompanyId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({})
      if (managerId) params.set('managerId', managerId)
      const res = await authFetch(`/api/holidays?${params.toString()}`)
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        setAllRequests(data.requests || data || [])
      }
    } catch (err) {
      toast.error('Failed to load requests')
    }
    setLoading(false)
  }

  async function fetchCalendarData() {
    setLoadingCal(true)
    try {
      // Fetch all approved + pending requests for the visible month range
      const firstDay = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`
      const lastDay = new Date(calYear, calMonth + 1, 0)
      const lastStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`

      const res = await authFetch(`/api/holidays?from_date=${firstDay}&to_date=${lastStr}`)
      const data = await res.json()
      setCalRequests((data.requests || []).filter(r => r.status === 'approved' || r.status === 'pending'))

      // Fetch bank holidays
      const { data: bh } = await supabase.from('uk_bank_holidays').select('date, name').eq('division', 'england-and-wales')
      setBankHolidays(bh || [])
    } catch { /* ignore */ }
    setLoadingCal(false)
  }

  useEffect(() => {
    if (activeTab === 'pending') {
      fetchPending()
    } else if (activeTab === 'calendar') {
      setLoading(false)
      fetchCalendarData()
    } else {
      fetchAll()
    }
  }, [activeTab, managerId, managerCompanyId, calMonth, calYear])

  async function fetchAllowance(operativeId) {
    if (allowanceCache[operativeId]) return
    setLoadingAllowance(operativeId)
    try {
      const res = await authFetch(`/api/holiday-allowance?operativeId=${operativeId}`)
      const data = await res.json()
      setAllowanceCache(prev => ({ ...prev, [operativeId]: data }))
    } catch {
      toast.error('Failed to load allowance')
    }
    setLoadingAllowance(null)
  }

  function handleExpand(requestId, operativeId) {
    if (expandedId === requestId) {
      setExpandedId(null)
    } else {
      setExpandedId(requestId)
      fetchAllowance(operativeId)
    }
  }

  async function handleApprove(requestId) {
    setActionLoading(requestId)
    try {
      const res = await authFetch('/api/holidays', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          action: 'approve',
          managerCompanyId,
          managerId,
        }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success('Request approved')
        setPendingRequests(prev => prev.filter(r => r.id !== requestId))
      }
    } catch {
      toast.error('Failed to approve request')
    }
    setActionLoading(null)
  }

  async function handleReject() {
    if (!rejectModal) return
    setActionLoading(rejectModal.requestId)
    try {
      const res = await authFetch('/api/holidays', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: rejectModal.requestId,
          action: 'reject',
          note: rejectNote,
          managerCompanyId,
          managerId,
        }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success('Request rejected')
        setPendingRequests(prev => prev.filter(r => r.id !== rejectModal.requestId))
      }
    } catch {
      toast.error('Failed to reject request')
    }
    setActionLoading(null)
    setRejectModal(null)
    setRejectNote('')
  }

  // Calendar grid
  const calendarGrid = useMemo(() => {
    const firstOfMonth = new Date(calYear, calMonth, 1)
    const lastOfMonth = new Date(calYear, calMonth + 1, 0)
    const startDay = firstOfMonth.getDay() // 0=Sun
    const totalDays = lastOfMonth.getDate()

    // Build array of day cells (pad start to Monday)
    const mondayOffset = startDay === 0 ? 6 : startDay - 1
    const cells = []
    for (let i = 0; i < mondayOffset; i++) cells.push(null) // empty padding
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dayOfWeek = new Date(calYear, calMonth, d).getDay()
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
      const bh = bankHolidays.find(h => h.date === dateStr)
      const dayRequests = calRequests.filter(r => r.start_date <= dateStr && r.end_date >= dateStr)
      cells.push({ day: d, dateStr, isWeekend, bankHoliday: bh, requests: dayRequests })
    }
    return cells
  }, [calMonth, calYear, calRequests, bankHolidays])

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
    else setCalMonth(m => m - 1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
    else setCalMonth(m => m + 1)
  }
  function goToday() { setCalMonth(new Date().getMonth()); setCalYear(new Date().getFullYear()) }

  // Unique operatives with holidays this month (for legend)
  const calOperatives = useMemo(() => {
    const opMap = {}
    for (const r of calRequests) {
      const name = r.operatives?.name || 'Unknown'
      if (!opMap[name]) opMap[name] = { name, photo_url: r.operatives?.photo_url, status: r.status }
    }
    return Object.values(opMap)
  }, [calRequests])

  const opColors = ['#3B82F6', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1', '#14B8A6', '#F97316']
  function getOpColor(name) {
    let hash = 0
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
    return opColors[Math.abs(hash) % opColors.length]
  }

  // Filter all-requests
  const filteredAll = allRequests.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    if (filterFrom && r.start_date < filterFrom) return false
    if (filterTo && r.end_date > filterTo) return false
    return true
  })

  function renderRequestCard(request, showActions = false) {
    const operative = request.operatives
    const isExpanded = expandedId === request.id
    const allowance = allowanceCache[operative?.id]

    return (
      <div
        key={request.id}
        className="rounded-xl border p-4 space-y-3 transition-all"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {operative?.photo_url ? (
              <img src={operative.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                style={{ backgroundColor: 'var(--primary-color)' }}
              >
                {(operative?.name || '?').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {operative?.name || 'Unknown Operative'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Submitted {daysAgo(request.created_at)}
              </p>
            </div>
          </div>
          {!showActions && statusBadge(request.status)}
        </div>

        {/* Date range and days */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-primary)' }}>
            <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
            {formatDateRange(request.start_date, request.end_date)}
          </div>
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)' }}
          >
            <Clock size={12} />
            {request.working_days || '--'} working day{request.working_days !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Reason */}
        {request.reason && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Reason: {request.reason}
          </p>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => handleExpand(request.id, operative?.id)}
          className="flex items-center gap-1 text-xs font-medium transition-colors hover:opacity-70"
          style={{ color: 'var(--primary-color)' }}
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
          {isExpanded ? 'Less detail' : 'More detail'}
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div
            className="rounded-lg p-3 space-y-2 border"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)' }}
          >
            {loadingAllowance === operative?.id ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--primary-color)' }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading allowance...</span>
              </div>
            ) : allowance ? (
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Total Allowance</p>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{allowance.total ?? '--'} days</p>
                </div>
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Used</p>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{allowance.used ?? '--'} days</p>
                </div>
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Remaining</p>
                  <p className="text-sm font-bold" style={{ color: 'var(--primary-color)' }}>{allowance.remaining ?? '--'} days</p>
                </div>
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Allowance info unavailable</p>
            )}

            {request.manager_note && (
              <div className="pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Manager Note</p>
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{request.manager_note}</p>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        {showActions && (
          <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <button
              onClick={() => handleApprove(request.id)}
              disabled={actionLoading === request.id}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
            >
              {actionLoading === request.id ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Check size={15} />
              )}
              Approve
            </button>
            <button
              onClick={() => setRejectModal({ requestId: request.id })}
              disabled={actionLoading === request.id}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              <X size={15} />
              Reject
            </button>
          </div>
        )}
      </div>
    )
  }

  if (loading && pendingRequests.length === 0 && allRequests.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--primary-color)] border-t-transparent" />
      </div>
    )
  }

  return (
    <div className={`${activeTab === 'calendar' ? 'max-w-6xl' : 'max-w-4xl'} mx-auto p-4 sm:p-6 space-y-6 transition-all`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--primary-color)', opacity: 0.1 }}>
            <Calendar size={24} style={{ color: 'var(--primary-color)' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Holiday Approvals
          </h1>
        </div>

        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          <Users size={15} />
          <span>{pendingRequests.length} pending</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: 'var(--border-color)' }}>
        <button
          onClick={() => setActiveTab('calendar')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'calendar'
              ? 'border-[var(--primary-color)]'
              : 'border-transparent'
          }`}
          style={{
            color: activeTab === 'calendar' ? 'var(--primary-color)' : 'var(--text-muted)',
          }}
        >
          <Calendar size={14} />
          Calendar
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'all'
              ? 'border-[var(--primary-color)]'
              : 'border-transparent'
          }`}
          style={{
            color: activeTab === 'all' ? 'var(--primary-color)' : 'var(--text-muted)',
          }}
        >
          All Requests
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'pending'
              ? 'border-[var(--primary-color)]'
              : 'border-transparent'
          }`}
          style={{
            color: activeTab === 'pending' ? 'var(--primary-color)' : 'var(--text-muted)',
          }}
        >
          Pending
          {pendingRequests.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
              {pendingRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* Pending Tab */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          {pendingRequests.length === 0 ? (
            <div
              className="rounded-xl border p-8 text-center"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
            >
              <Check size={40} className="mx-auto mb-3 text-emerald-400" />
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                No pending requests
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                All holiday requests have been actioned.
              </p>
            </div>
          ) : (
            pendingRequests.map(request => renderRequestCard(request, true))
          )}
        </div>
      )}

      {/* All Requests Tab */}
      {activeTab === 'all' && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div
            className="rounded-xl border p-4 flex flex-wrap items-end gap-3"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
          >
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
              <Filter size={14} />
              Filters
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Status</label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="px-3 py-2 rounded-lg border text-sm"
                style={{
                  backgroundColor: 'var(--bg-main)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>From</label>
              <input
                type="date"
                value={filterFrom}
                onChange={e => setFilterFrom(e.target.value)}
                className="px-3 py-2 rounded-lg border text-sm"
                style={{
                  backgroundColor: 'var(--bg-main)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>To</label>
              <input
                type="date"
                value={filterTo}
                onChange={e => setFilterTo(e.target.value)}
                className="px-3 py-2 rounded-lg border text-sm"
                style={{
                  backgroundColor: 'var(--bg-main)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          {/* Requests list */}
          {filteredAll.length === 0 ? (
            <div
              className="rounded-xl border p-8 text-center"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
            >
              <Calendar size={40} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                No requests found
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Try adjusting your filters.
              </p>
            </div>
          ) : (
            filteredAll.map(request =>
              renderRequestCard(request, request.status === 'pending')
            )
          )}
        </div>
      )}

      {/* Calendar Tab */}
      {activeTab === 'calendar' && (
        <div className="space-y-4">
          {/* Month navigation */}
          <div
            className="rounded-xl border p-4 flex items-center justify-between"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
          >
            <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-black/5 transition-colors" style={{ color: 'var(--text-primary)' }}>
              <ChevronLeft size={20} />
            </button>
            <div className="text-center">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                {monthNames[calMonth]} {calYear}
              </h2>
              <button onClick={goToday} className="text-xs font-medium mt-0.5 hover:underline" style={{ color: 'var(--primary-color)' }}>
                Today
              </button>
            </div>
            <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-black/5 transition-colors" style={{ color: 'var(--text-primary)' }}>
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Calendar grid */}
          <div
            className="rounded-xl border overflow-hidden"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
          >
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--border-color)' }}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                <div key={day} className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  {day}
                </div>
              ))}
            </div>

            {/* Day cells */}
            {loadingCal ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-t-transparent" style={{ borderColor: 'var(--primary-color)' }} />
              </div>
            ) : (
              <div className="grid grid-cols-7">
                {calendarGrid.map((cell, i) => {
                  if (!cell) {
                    return <div key={`empty-${i}`} className="min-h-[90px] border-b border-r" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)' }} />
                  }
                  const today = new Date()
                  const isToday = cell.day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear()
                  return (
                    <div
                      key={cell.dateStr}
                      className={`min-h-[90px] border-b border-r p-1.5 relative transition-colors ${cell.isWeekend ? 'bg-slate-50/50' : ''}`}
                      style={{ borderColor: 'var(--border-color)', backgroundColor: cell.bankHoliday ? 'rgba(239,68,68,0.04)' : cell.isWeekend ? 'var(--bg-main)' : undefined }}
                    >
                      {/* Day number */}
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-[var(--primary-color)] text-white' : ''}`}
                          style={{ color: isToday ? undefined : cell.isWeekend ? 'var(--text-muted)' : 'var(--text-primary)' }}
                        >
                          {cell.day}
                        </span>
                        {cell.bankHoliday && (
                          <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-red-100 text-red-600 truncate max-w-[70px]" title={cell.bankHoliday.name}>
                            {cell.bankHoliday.name}
                          </span>
                        )}
                      </div>

                      {/* Holiday bars */}
                      <div className="space-y-0.5">
                        {cell.requests.slice(0, 3).map(r => {
                          const name = r.operatives?.name || 'Unknown'
                          const color = getOpColor(name)
                          const isPending = r.status === 'pending'
                          return (
                            <div
                              key={r.id}
                              className="text-[9px] font-medium px-1.5 py-0.5 rounded truncate"
                              style={{
                                backgroundColor: isPending ? 'transparent' : color + '18',
                                color: color,
                                border: isPending ? `1px dashed ${color}` : `1px solid ${color}30`,
                              }}
                              title={`${name} — ${r.status} (${r.start_date} to ${r.end_date})`}
                            >
                              {name.split(' ')[0]}
                            </div>
                          )
                        })}
                        {cell.requests.length > 3 && (
                          <p className="text-[8px] font-medium px-1" style={{ color: 'var(--text-muted)' }}>
                            +{cell.requests.length - 3} more
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Legend */}
          {calOperatives.length > 0 && (
            <div
              className="rounded-xl border p-4"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                People off this month
              </p>
              <div className="flex flex-wrap gap-2">
                {calOperatives.map(op => {
                  const color = getOpColor(op.name)
                  return (
                    <div key={op.name} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: color + '12', color, border: `1px solid ${color}25` }}>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      {op.name}
                      {op.status === 'pending' && <span className="text-[9px] opacity-60">(pending)</span>}
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  <div className="w-3 h-3 rounded bg-red-100 border border-red-200" /> Bank Holiday
                </div>
                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  <div className="w-3 h-3 rounded bg-blue-100 border border-blue-300" /> Approved
                </div>
                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  <div className="w-3 h-3 rounded border border-dashed border-blue-400" /> Pending
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rejection Reason Modal */}
      <Modal
        open={!!rejectModal}
        onClose={() => { setRejectModal(null); setRejectNote('') }}
        title="Reject Request"
      >
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Please provide a reason for rejecting this holiday request. The operative will see this message.
          </p>
          <textarea
            value={rejectNote}
            onChange={e => setRejectNote(e.target.value)}
            placeholder="Reason for rejection..."
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg border text-sm resize-none"
            style={{
              backgroundColor: 'var(--bg-main)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)',
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setRejectModal(null); setRejectNote('') }}
              className="flex-1 py-2.5 text-sm font-medium rounded-lg border transition-colors"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              disabled={!rejectNote.trim() || actionLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold rounded-lg text-white transition-colors bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {actionLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <X size={14} />
              )}
              Reject
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
