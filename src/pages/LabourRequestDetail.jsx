import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  TRADES, SKILL_LEVELS, CARD_TYPES, CERT_TYPES, URGENCY_LABELS,
  STATUS_COLORS, formatDayRate, formatDate
} from '../lib/marketplace'
import toast from 'react-hot-toast'
import { ArrowLeft, Check, X, Clock, Loader2, User, Star, Briefcase, CheckCircle, XCircle } from 'lucide-react'

const REQUEST_STATUS = {
  open:             { label: 'Open',             bg: 'bg-blue-100',  text: 'text-blue-700' },
  partially_filled: { label: 'Partially Filled', bg: 'bg-amber-100', text: 'text-amber-700' },
  filled:           { label: 'Filled',           bg: 'bg-green-100', text: 'text-green-700' },
  cancelled:        { label: 'Cancelled',        bg: 'bg-slate-100', text: 'text-slate-500' },
}

export default function LabourRequestDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [request, setRequest] = useState(null)
  const [proposals, setProposals] = useState([])
  const [operativeCerts, setOperativeCerts] = useState({})
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)

  async function loadRequest() {
    setLoading(true)
    try {
      const { data: req, error } = await supabase
        .from('labour_requests')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      setRequest(req)

      const { data: props, error: propErr } = await supabase
        .from('labour_proposals')
        .select('*, agency_operatives(*, agency:agencies(company_name))')
        .eq('labour_request_id', id)
        .order('match_score', { ascending: false })
      if (propErr) throw propErr
      setProposals(props || [])

      // Load certifications for all proposed operatives
      const opIds = (props || []).map(p => p.agency_operatives?.id).filter(Boolean)
      if (opIds.length > 0) {
        const { data: certs } = await supabase
          .from('operative_certifications')
          .select('operative_id, certification_type')
          .in('operative_id', opIds)
        const certsByOp = {}
        for (const c of (certs || [])) {
          if (!certsByOp[c.operative_id]) certsByOp[c.operative_id] = []
          certsByOp[c.operative_id].push(c.certification_type)
        }
        setOperativeCerts(certsByOp)
      } else {
        setOperativeCerts({})
      }
    } catch (err) {
      console.error('loadRequest error:', err)
      toast.error('Failed to load request')
    }
    setLoading(false)
  }

  useEffect(() => { loadRequest() }, [id])

  async function handleAccept(proposal) {
    setActionLoading(proposal.id)
    try {
      const op = proposal.agency_operatives
      const req = request

      // 1. Create a labour_booking
      const { error: bookErr } = await supabase.from('labour_bookings').insert({
        company_id: req.company_id,
        project_id: req.project_id,
        labour_request_id: req.id,
        operative_id: op.id,
        agency_id: op.agency_id,
        start_date: req.start_date,
        end_date: req.end_date,
        agreed_day_rate: proposal.proposed_day_rate || req.day_rate_offered,
        status: 'confirmed',
        onboarding_status: 'pending',
      })
      if (bookErr) throw bookErr

      // 2. Update proposal status
      const { error: propErr } = await supabase
        .from('labour_proposals')
        .update({ status: 'accepted' })
        .eq('id', proposal.id)
      if (propErr) throw propErr

      // 3. Count confirmed bookings to determine new status
      const { data: confirmedBookings } = await supabase
        .from('labour_bookings')
        .select('id')
        .eq('labour_request_id', req.id)
        .eq('status', 'confirmed')
      const filledCount = (confirmedBookings?.length || 0)
      const newStatus = filledCount >= req.number_of_operatives ? 'filled' : 'partially_filled'
      const { error: reqErr } = await supabase
        .from('labour_requests')
        .update({ status: newStatus })
        .eq('id', req.id)
      if (reqErr) throw reqErr

      // 4. Update operative status
      await supabase
        .from('agency_operatives')
        .update({ status: 'booked' })
        .eq('id', op.id)

      // 5. Insert operative_availability records for booking dates
      const availRecords = []
      const d = new Date(req.start_date)
      const end = new Date(req.end_date)
      while (d <= end) {
        availRecords.push({
          operative_id: op.id,
          agency_id: op.agency_id,
          date: d.toISOString().split('T')[0],
          status: 'booked',
        })
        d.setDate(d.getDate() + 1)
      }
      if (availRecords.length > 0) {
        await supabase.from('operative_availability').upsert(availRecords, { onConflict: 'operative_id,date' })
      }

      toast.success(`${op.first_name && op.last_name ? `${op.first_name} ${op.last_name}` : 'Operative'} accepted and booking confirmed`)
      loadRequest() // Refresh
    } catch (err) {
      console.error('Accept error:', err)
      toast.error(err.message || 'Failed to accept proposal')
    }
    setActionLoading(null)
  }

  async function handleDecline(proposal) {
    setActionLoading(proposal.id)
    try {
      const { error } = await supabase
        .from('labour_proposals')
        .update({ status: 'declined' })
        .eq('id', proposal.id)
      if (error) throw error
      toast.success('Proposal declined')
      loadRequest()
    } catch (err) {
      console.error('Decline error:', err)
      toast.error('Failed to decline proposal')
    }
    setActionLoading(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!request) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <p className="text-slate-500">Request not found</p>
      </div>
    )
  }

  const sc = REQUEST_STATUS[request.status] || REQUEST_STATUS.open
  const requiredCerts = request.certifications_required || []

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => navigate('/app/labour-requests')} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-2">
          <ArrowLeft size={16} /> Back to Requests
        </button>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-slate-900">
            {TRADES[request.trade_required]?.label || request.trade_required}
          </h1>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>
            {sc.label}
          </span>
          {request.urgency && request.urgency !== 'standard' && (
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium bg-${URGENCY_LABELS[request.urgency]?.color || 'slate'}-100 text-${URGENCY_LABELS[request.urgency]?.color || 'slate'}-700`}>
              {URGENCY_LABELS[request.urgency]?.label || request.urgency}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 mt-1">
          {request.number_of_operatives} operative{request.number_of_operatives !== 1 ? 's' : ''} needed
          {' '}&middot;{' '}{formatDate(request.start_date)} — {formatDate(request.end_date)}
          {' '}&middot;{' '}{request.site_name}
        </p>
      </div>

      {/* Request info card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">Request Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          <InfoItem label="Trade" value={TRADES[request.trade_required]?.label} />
          <InfoItem label="Needed" value={`${request.number_of_operatives} operative${request.number_of_operatives !== 1 ? 's' : ''}`} />
          <InfoItem label="Skill level" value={SKILL_LEVELS.find(s => s.value === request.skill_level_minimum)?.label || 'Any'} />
          <InfoItem label="Card" value={request.cscs_card_type_required ? CARD_TYPES[request.cscs_card_type_required] : 'Any'} />
          <InfoItem label="Working days" value={request.working_days === 'mon_fri' ? 'Mon-Fri' : request.working_days === 'mon_sat' ? 'Mon-Sat' : '7 days'} />
          <InfoItem label="Hours" value={request.working_hours || '—'} />
          <InfoItem label="Day rate" value={formatDayRate(request.day_rate_offered)} />
          <InfoItem label="Accommodation" value={request.accommodation_provided ? 'Yes' : 'No'} />
          <InfoItem label="Travel expenses" value={request.travel_expenses ? 'Yes' : 'No'} />
        </div>
        {requiredCerts.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Required Certifications</p>
            <div className="flex flex-wrap gap-1.5">
              {requiredCerts.map(c => (
                <span key={c} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full font-medium">
                  {CERT_TYPES[c] || c}
                </span>
              ))}
            </div>
          </div>
        )}
        {request.description && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Description</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{request.description}</p>
          </div>
        )}
        {request.ppe_requirements && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">PPE Requirements</p>
            <p className="text-sm text-slate-700">{request.ppe_requirements}</p>
          </div>
        )}
      </div>

      {/* Proposals section */}
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-3">
          Proposals ({proposals.length})
        </h2>

        {proposals.length === 0 ? (
          <div className="text-center py-12 bg-white border border-slate-200 rounded-xl">
            <Clock size={36} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Waiting for agencies to respond</p>
            <p className="text-xs text-slate-400 mt-1">Agencies will propose operatives that match your requirements</p>
          </div>
        ) : (
          <div className="space-y-3">
            {proposals.map(proposal => {
              const op = proposal.agency_operatives || {}
              const agency = op.agency || {}
              const matchColor = STATUS_COLORS[proposal.match_status] || STATUS_COLORS.grey
              const isAccepted = proposal.status === 'accepted'
              const isDeclined = proposal.status === 'declined'
              const isPending = proposal.status === 'pending' || proposal.status === 'proposed'

              return (
                <div key={proposal.id} className={`bg-white border rounded-xl p-4 transition-colors ${
                  isAccepted ? 'border-green-300 bg-green-50/30' :
                  isDeclined ? 'border-slate-200 opacity-60' :
                  'border-slate-200'
                }`}>
                  <div className="flex items-start gap-4">
                    {/* Photo / avatar */}
                    <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                      {op.photo_url ? (
                        <img src={op.photo_url} alt={`${op.first_name} ${op.last_name}`} className="w-full h-full object-cover" />
                      ) : (
                        <User size={24} className="text-slate-400" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-slate-800">{op.first_name && op.last_name ? `${op.first_name} ${op.last_name}` : 'Unknown Operative'}</h3>
                        <span className={`w-3 h-3 rounded-full ${matchColor.dot}`} title={matchColor.label} />
                        {isAccepted && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Accepted</span>}
                        {isDeclined && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">Declined</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {agency.company_name || 'Agency'} &middot; {TRADES[op.primary_trade]?.label || op.primary_trade || '—'}
                      </p>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-600">
                        <span>Card: {CARD_TYPES[op.cscs_card_type] || op.cscs_card_type || '—'}</span>
                        <span>Experience: {op.experience_years ? `${op.experience_years} yrs` : '—'}</span>
                        {op.rating != null && (
                          <span className="flex items-center gap-0.5">
                            <Star size={12} className="text-amber-400 fill-amber-400" />
                            {op.rating.toFixed(1)}
                          </span>
                        )}
                        <span>Rate: {formatDayRate(proposal.proposed_day_rate || op.day_rate)}</span>
                        {proposal.match_score != null && (
                          <span>Match: {proposal.match_score}%</span>
                        )}
                      </div>

                      {/* Cert checks */}
                      {requiredCerts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {requiredCerts.map(cert => {
                            const hasCert = (operativeCerts[op.id] || []).includes(cert)
                            return (
                              <span
                                key={cert}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                  hasCert ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                                }`}
                              >
                                {hasCert ? <CheckCircle size={11} /> : <XCircle size={11} />}
                                {CERT_TYPES[cert] || cert}
                              </span>
                            )
                          })}
                        </div>
                      )}

                      {proposal.notes && (
                        <p className="text-xs text-slate-500 mt-2 italic">{proposal.notes}</p>
                      )}
                    </div>

                    {/* Actions */}
                    {isPending && request.status !== 'filled' && request.status !== 'cancelled' && (
                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          onClick={() => handleAccept(proposal)}
                          disabled={actionLoading === proposal.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-lg text-xs font-semibold transition-colors"
                        >
                          {actionLoading === proposal.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          Accept
                        </button>
                        <button
                          onClick={() => handleDecline(proposal)}
                          disabled={actionLoading === proposal.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 text-slate-600 hover:text-red-600 rounded-lg text-xs font-semibold transition-colors"
                        >
                          <X size={14} /> Decline
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoItem({ label, value }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm text-slate-800 font-medium">{value || '—'}</p>
    </div>
  )
}
