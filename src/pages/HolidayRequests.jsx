import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession } from '../lib/storage'
import WorkerSidebarLayout from '../components/WorkerSidebarLayout'
import LoadingButton from '../components/LoadingButton'
import toast from 'react-hot-toast'
import { Calendar, Send, X, RefreshCw, AlertCircle } from 'lucide-react'
import { formatCalendarDate, todayDateStr } from '../lib/dates'

function countWorkingDays(start, end, startHalf, endHalf) {
  if (!start || !end) return 0
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  if (e < s) return 0

  let count = 0
  const current = new Date(s)
  while (current <= e) {
    const day = current.getDay()
    if (day !== 0 && day !== 6) count++
    current.setDate(current.getDate() + 1)
  }

  if (startHalf) count -= 0.5
  if (endHalf) count -= 0.5

  return Math.max(0, count)
}


export default function HolidayRequests() {
  const navigate = useNavigate()
  const [op, setOp] = useState(null)

  // Allowance state
  const [allowance, setAllowance] = useState(null)
  const [allowanceLoading, setAllowanceLoading] = useState(true)

  // Form state
  const [formOpen, setFormOpen] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [startHalfDay, setStartHalfDay] = useState(false)
  const [endHalfDay, setEndHalfDay] = useState(false)
  const [approverId, setApproverId] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Approvers state
  const [approvers, setApprovers] = useState([])
  const [approversLoading, setApproversLoading] = useState(true)

  // Requests state
  const [requests, setRequests] = useState([])
  const [requestsLoading, setRequestsLoading] = useState(true)

  // Reassign state
  const [reassigningId, setReassigningId] = useState(null)
  const [reassignApprover, setReassignApprover] = useState('')
  const [cancellingId, setCancellingId] = useState(null)

  useEffect(() => {
    const session = getSession('operative_session')
    if (!session) { navigate('/worker-login'); return }
    setOp(JSON.parse(session))
  }, [])

  // Load allowance
  useEffect(() => {
    if (!op) return
    setAllowanceLoading(true)
    fetch(`/api/holiday-allowance?operativeId=${op.id}&operativeSessionId=${op.id}`)
      .then(r => r.json())
      .then(data => setAllowance(data))
      .catch(() => toast.error('Failed to load allowance'))
      .finally(() => setAllowanceLoading(false))
  }, [op])

  // Load approvers
  useEffect(() => {
    if (!op) return
    setApproversLoading(true)
    fetch(`/api/eligible-approvers?operativeId=${op.id}&operativeSessionId=${op.id}`)
      .then(r => r.json())
      .then(data => setApprovers(data.approvers || []))
      .catch(() => toast.error('Failed to load approvers'))
      .finally(() => setApproversLoading(false))
  }, [op])

  // Load requests
  function loadRequests() {
    if (!op) return
    setRequestsLoading(true)
    fetch(`/api/holidays?operativeId=${op.id}&operativeSessionId=${op.id}`)
      .then(r => r.json())
      .then(data => setRequests(data.requests || []))
      .catch(() => toast.error('Failed to load requests'))
      .finally(() => setRequestsLoading(false))
  }

  useEffect(() => {
    if (op) loadRequests()
  }, [op])

  const workingDays = useMemo(
    () => countWorkingDays(startDate, endDate, startHalfDay, endHalfDay),
    [startDate, endDate, startHalfDay, endHalfDay]
  )

  const remaining = allowance ? allowance.remaining : null
  const wouldExceed = remaining !== null && workingDays > remaining

  const canSubmit = startDate && endDate && approverId && workingDays > 0 && !wouldExceed

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operativeId: op.id,
          operativeSessionId: op.id,
          approverId,
          startDate,
          endDate,
          startHalfDay,
          endHalfDay,
          reason: reason.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to submit request')
      }
      toast.success('Holiday request submitted')
      setStartDate('')
      setEndDate('')
      setStartHalfDay(false)
      setEndHalfDay(false)
      setApproverId('')
      setReason('')
      loadRequests()
      // Reload allowance to reflect pending change
      fetch(`/api/holiday-allowance?operativeId=${op.id}&operativeSessionId=${op.id}`)
        .then(r => r.json())
        .then(data => setAllowance(data))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel(requestId) {
    setCancellingId(requestId)
    try {
      const res = await fetch('/api/holidays', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          action: 'cancel',
          operativeSessionId: op.id,
        }),
      })
      if (!res.ok) throw new Error('Failed to cancel')
      toast.success('Request cancelled')
      loadRequests()
      fetch(`/api/holiday-allowance?operativeId=${op.id}&operativeSessionId=${op.id}`)
        .then(r => r.json())
        .then(data => setAllowance(data))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCancellingId(null)
    }
  }

  async function handleReassign(requestId) {
    if (!reassignApprover) return
    try {
      const res = await fetch('/api/holidays', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          action: 'reassign',
          approverId: reassignApprover,
          operativeSessionId: op.id,
        }),
      })
      if (!res.ok) throw new Error('Failed to reassign')
      toast.success('Request reassigned')
      setReassigningId(null)
      setReassignApprover('')
      loadRequests()
    } catch (err) {
      toast.error(err.message)
    }
  }

  function isOlderThan48h(createdAt) {
    if (!createdAt) return false
    const created = new Date(createdAt)
    const now = new Date()
    return (now - created) > 48 * 60 * 60 * 1000
  }

  if (!op) return null

  return (
    <WorkerSidebarLayout op={op}>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Calendar size={20} />
            Holiday Requests
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Request time off and view your holiday balance</p>
        </div>

        {/* Allowance Summary */}
        {allowanceLoading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : allowance ? (
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white border border-[#E2E6EA] rounded-xl p-3 text-center">
              <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{allowance.total ?? '—'}</p>
              <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--text-muted)' }}>Total</p>
            </div>
            <div className="bg-white border border-[#E2E6EA] rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-blue-600">{allowance.used ?? 0}</p>
              <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--text-muted)' }}>Used</p>
            </div>
            <div className="bg-white border border-[#E2E6EA] rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-amber-600">{allowance.pending ?? 0}</p>
              <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--text-muted)' }}>Pending</p>
            </div>
            <div className="bg-white border border-[#E2E6EA] rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-green-600">{allowance.remaining ?? '—'}</p>
              <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--text-muted)' }}>Remaining</p>
            </div>
          </div>
        ) : null}

        {/* Request Form */}
        <div className="bg-white border border-[#E2E6EA] rounded-xl overflow-hidden">
          <button
            onClick={() => setFormOpen(!formOpen)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
          >
            <span className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Send size={14} />
              New Request
            </span>
            <span className="text-xs text-slate-400">{formOpen ? '▲' : '▼'}</span>
          </button>

          {formOpen && (
            <form onSubmit={handleSubmit} className="px-4 pb-4 space-y-3 border-t border-[#E2E6EA]">
              {/* Date inputs */}
              <div className="grid grid-cols-2 gap-3 pt-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                    Start date
                  </label>
                  <input
                    type="date"
                    min={todayDateStr()}
                    value={startDate}
                    onChange={e => {
                      setStartDate(e.target.value)
                      if (endDate && e.target.value > endDate) setEndDate(e.target.value)
                    }}
                    className="w-full border border-[#E2E6EA] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                    End date
                  </label>
                  <input
                    type="date"
                    min={startDate || todayDateStr()}
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full border border-[#E2E6EA] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>

              {/* Half-day checkboxes */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                  <input
                    type="checkbox"
                    checked={startHalfDay}
                    onChange={e => setStartHalfDay(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Start from afternoon
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                  <input
                    type="checkbox"
                    checked={endHalfDay}
                    onChange={e => setEndHalfDay(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Finish at lunchtime
                </label>
              </div>

              {/* Working days display */}
              {startDate && endDate && (
                <div className={`text-xs font-medium px-3 py-2 rounded-lg ${
                  wouldExceed ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                }`}>
                  {workingDays} working day{workingDays !== 1 ? 's' : ''} requested
                  {wouldExceed && ' — exceeds remaining allowance'}
                </div>
              )}

              {/* Approver dropdown */}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                  Send to
                </label>
                {approversLoading ? (
                  <div className="animate-pulse h-10 bg-slate-100 rounded-lg" />
                ) : approvers.length === 0 ? (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                    <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">No manager accounts found. Please contact your company administrator.</p>
                  </div>
                ) : (
                  <select
                    value={approverId}
                    onChange={e => setApproverId(e.target.value)}
                    className="w-full border border-[#E2E6EA] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">Select approver...</option>
                    {approvers.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}{a.projects?.length ? ` — ${a.projects.join(', ')}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Reason textarea */}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                  Reason <span className="font-normal">(optional)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value.slice(0, 500))}
                  maxLength={500}
                  rows={2}
                  placeholder="Any notes for your manager..."
                  className="w-full border border-[#E2E6EA] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                />
                {reason.length > 0 && (
                  <p className="text-[10px] text-right mt-0.5" style={{ color: 'var(--text-muted)' }}>{reason.length}/500</p>
                )}
              </div>

              {/* Submit button */}
              <LoadingButton
                type="submit"
                loading={submitting}
                disabled={!canSubmit}
                className="w-full bg-blue-600 text-white hover:bg-blue-700 text-sm"
              >
                <Send size={14} />
                Submit Request
              </LoadingButton>
            </form>
          )}
        </div>

        {/* My Requests List */}
        <div>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Calendar size={14} />
            My Requests
          </h2>

          {requestsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : requests.length === 0 ? (
            <div className="bg-white border border-[#E2E6EA] rounded-xl p-6 text-center">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No holiday requests yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {requests.map(req => {
                const statusColors = {
                  pending: 'bg-amber-100 text-amber-800',
                  approved: 'bg-green-100 text-green-800',
                  rejected: 'bg-red-100 text-red-800',
                  cancelled: 'bg-slate-100 text-slate-600',
                }
                const statusLabel = {
                  pending: 'Pending',
                  approved: 'Approved',
                  rejected: 'Rejected',
                  cancelled: 'Cancelled',
                }
                const isPending = req.status === 'pending'
                const canReassign = isPending && isOlderThan48h(req.created_at)

                return (
                  <div key={req.id} className="bg-white border border-[#E2E6EA] rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {formatCalendarDate(req.start_date)} — {formatCalendarDate(req.end_date)}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {req.working_days} working day{req.working_days !== 1 ? 's' : ''}
                          {req.start_half_day && ' (PM start)'}
                          {req.end_half_day && ' (AM finish)'}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColors[req.status] || statusColors.pending}`}>
                        {statusLabel[req.status] || req.status}
                      </span>
                    </div>

                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Sent to: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{req.approver_name || '—'}</span>
                    </p>

                    {req.status === 'rejected' && req.rejection_reason && (
                      <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        <p className="text-xs text-red-700">
                          <span className="font-semibold">Reason:</span> {req.rejection_reason}
                        </p>
                      </div>
                    )}

                    {isPending && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleCancel(req.id)}
                          disabled={cancellingId === req.id}
                          className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
                        >
                          {cancellingId === req.id ? (
                            <div className="animate-spin w-3 h-3 border border-red-500 border-t-transparent rounded-full" />
                          ) : (
                            <X size={12} />
                          )}
                          Cancel
                        </button>

                        {canReassign && (
                          <>
                            {reassigningId === req.id ? (
                              <div className="flex items-center gap-2 flex-1">
                                <select
                                  value={reassignApprover}
                                  onChange={e => setReassignApprover(e.target.value)}
                                  className="flex-1 border border-[#E2E6EA] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
                                >
                                  <option value="">Select new approver...</option>
                                  {approvers.map(a => (
                                    <option key={a.id} value={a.id}>
                                      {a.name}{a.projects?.length ? ` — ${a.projects.join(', ')}` : ''}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handleReassign(req.id)}
                                  disabled={!reassignApprover}
                                  className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => { setReassigningId(null); setReassignApprover('') }}
                                  className="text-xs text-slate-400 hover:text-slate-600"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setReassigningId(req.id)}
                                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 transition-colors"
                              >
                                <RefreshCw size={12} />
                                Reassign
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </WorkerSidebarLayout>
  )
}
