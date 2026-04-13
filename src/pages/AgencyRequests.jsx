import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import {
  TRADES, TRADE_CATEGORIES, TRADE_OPTIONS, CARD_TYPES, CERT_TYPES, SKILL_LEVELS,
  STATUS_COLORS, URGENCY_LABELS, formatDayRate, formatDate, matchOperatives
} from '../lib/marketplace'
import toast from 'react-hot-toast'
import {
  FileText, Filter, Search, X, Users, MapPin, Calendar, Clock,
  AlertTriangle, ChevronDown, ChevronRight, Building2, Loader2, Send
} from 'lucide-react'

export default function AgencyRequests() {
  const navigate = useNavigate()
  const managerData = JSON.parse(getSession('manager_data') || '{}')

  const [agencyId, setAgencyId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState([])
  const [operatives, setOperatives] = useState([])
  const [certifications, setCertifications] = useState([])
  const [availability, setAvailability] = useState([])

  const [tradeFilter, setTradeFilter] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState('')
  const [expandedRequest, setExpandedRequest] = useState(null)
  const [proposing, setProposing] = useState(null)

  useEffect(() => { lookupAgency() }, [])

  async function lookupAgency() {
    try {
      let email = managerData.email
      if (!email) {
        const { data: { session } } = await supabase.auth.getSession()
        email = session?.user?.email
      }
      if (!email) { setLoading(false); return }

      const { data: agencyUser } = await supabase
        .from('agency_users')
        .select('agency_id')
        .eq('email', email)
        .single()

      if (!agencyUser) {
        setLoading(false)
        return
      }
      setAgencyId(agencyUser.agency_id)
      await loadData(agencyUser.agency_id)
    } catch (err) {
      console.error('Agency lookup error:', err)
    }
    setLoading(false)
  }

  async function loadData(aid) {
    try {
      // Load requests and operatives in parallel
      const [reqRes, opsRes] = await Promise.all([
        supabase.from('labour_requests').select('*').eq('status', 'open').order('created_at', { ascending: false }),
        supabase.from('agency_operatives').select('*').eq('agency_id', aid),
      ])
      setRequests(reqRes.data || [])
      setOperatives(opsRes.data || [])

      // Get operative IDs, then load certs and availability by operative_id
      const opIds = (opsRes.data || []).map(op => op.id)
      if (opIds.length > 0) {
        const [certsRes, availRes] = await Promise.all([
          supabase.from('operative_certifications').select('*').in('operative_id', opIds),
          supabase.from('operative_availability').select('*').in('operative_id', opIds),
        ])
        setCertifications(certsRes.data || [])
        setAvailability(availRes.data || [])
      } else {
        setCertifications([])
        setAvailability([])
      }
    } catch (err) {
      console.error('Load error:', err)
    }
  }

  const filtered = useMemo(() => {
    // Filter by visibility: only show public requests or preferred requests that include this agency
    let list = requests.filter(r => {
      if (!r.visibility || r.visibility === 'public') return true
      if (r.visibility === 'preferred_only' && Array.isArray(r.preferred_agency_ids)) {
        return r.preferred_agency_ids.includes(agencyId)
      }
      return false
    })
    if (tradeFilter) list = list.filter(r => r.trade_required === tradeFilter)
    if (urgencyFilter) list = list.filter(r => r.urgency === urgencyFilter)
    return list
  }, [requests, tradeFilter, urgencyFilter, agencyId])

  function getMatchedOperatives(request) {
    return matchOperatives(request, operatives, certifications, availability)
  }

  async function handlePropose(requestId, operativeId) {
    setProposing(operativeId)
    try {
      const { error } = await supabase.from('labour_proposals').insert({
        labour_request_id: requestId,
        agency_id: agencyId,
        operative_id: operativeId,
        status: 'proposed',
        proposed_at: new Date().toISOString(),
      })
      if (error) throw new Error(error.message)
      toast.success('Operative proposed successfully')
    } catch (err) {
      toast.error(err.message || 'Failed to propose operative')
    }
    setProposing(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!agencyId) {
    return (
      <div className="max-w-lg mx-auto p-4 mt-16">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <Building2 size={48} className="text-slate-300 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-900 mb-2">No Agency Linked</h2>
          <p className="text-sm text-slate-500 mb-6">Register your agency to view labour requests.</p>
          <button onClick={() => navigate('/agency/register')} className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors">
            Register Agency
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Labour Requests</h1>
        <p className="text-sm text-slate-500">{filtered.length} open requests</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={tradeFilter} onChange={e => setTradeFilter(e.target.value)} className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-400">
          <option value="">All Trades</option>
          {TRADE_CATEGORIES.map(cat => (
            <optgroup key={cat} label={cat}>
              {TRADE_OPTIONS.filter(t => t.category === cat).map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select value={urgencyFilter} onChange={e => setUrgencyFilter(e.target.value)} className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-400">
          <option value="">All Urgency</option>
          <option value="standard">Standard</option>
          <option value="urgent">Urgent</option>
          <option value="emergency">Emergency</option>
        </select>
        {(tradeFilter || urgencyFilter) && (
          <button onClick={() => { setTradeFilter(''); setUrgencyFilter('') }} className="text-xs text-blue-500 hover:text-blue-700 font-medium">
            Clear
          </button>
        )}
      </div>

      {/* Requests */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <FileText size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No open labour requests</p>
          <p className="text-xs text-slate-400 mt-1">Check back soon for new requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const isExpanded = expandedRequest === req.id
            const urgency = URGENCY_LABELS[req.urgency] || URGENCY_LABELS.standard
            const matched = isExpanded ? getMatchedOperatives(req) : []

            return (
              <div key={req.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedRequest(isExpanded ? null : req.id)}
                  className="w-full p-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-slate-800">
                          {TRADES[req.trade_required]?.label || req.trade_required}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold bg-${urgency.color}-100 text-${urgency.color}-700`}>
                          {urgency.label}
                        </span>
                        {req.visibility === 'preferred_only' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
                            Preferred
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Users size={12} /> {req.number_of_operatives} needed</span>
                        <span className="flex items-center gap-1"><Calendar size={12} /> {formatDate(req.start_date)} - {formatDate(req.end_date)}</span>
                        {req.site_postcode && <span className="flex items-center gap-1"><MapPin size={12} /> {req.site_postcode}</span>}
                        <span className="flex items-center gap-1"><Clock size={12} /> {formatDayRate(req.day_rate_offered)}/day</span>
                      </div>
                      {req.certifications_required?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {req.certifications_required.map(c => (
                            <span key={c} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                              {CERT_TYPES[c] || c}
                            </span>
                          ))}
                        </div>
                      )}
                      {req.skill_level_minimum && (
                        <p className="text-[11px] text-slate-400 mt-1">
                          Min skill: {SKILL_LEVELS.find(s => s.value === req.skill_level_minimum)?.label || req.skill_level_minimum}
                          {req.cscs_card_type_required && ` | Card: ${CARD_TYPES[req.cscs_card_type_required] || req.cscs_card_type_required}`}
                        </p>
                      )}
                    </div>
                    {isExpanded ? <ChevronDown size={16} className="text-slate-400 mt-1" /> : <ChevronRight size={16} className="text-slate-400 mt-1" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 p-4 space-y-3">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Matched Operatives</h3>
                    {matched.length === 0 ? (
                      <p className="text-sm text-slate-400">No operatives match this request</p>
                    ) : (
                      <div className="space-y-2">
                        {matched.map(({ operative: op, matchStatus, matchScore, issues }) => {
                          const sc = STATUS_COLORS[matchStatus] || STATUS_COLORS.grey
                          return (
                            <div key={op.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                              {/* Status dot */}
                              <span className={`w-3 h-3 rounded-full shrink-0 ${sc.dot}`} title={sc.label} />

                              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">
                                {op.first_name?.[0]}{op.last_name?.[0]}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-slate-800 truncate">{op.first_name} {op.last_name}</p>
                                  <span className="text-[10px] text-slate-400">Score: {matchScore}</span>
                                </div>
                                <p className="text-xs text-slate-500">
                                  {TRADES[op.primary_trade]?.label} &middot; {op.skill_level} &middot; {formatDayRate(op.day_rate)}/day
                                </p>
                                {issues.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {issues.map((issue, i) => (
                                      <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${sc.bg} ${sc.text}`}>
                                        {issue.message}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <button
                                onClick={() => handlePropose(req.id, op.id)}
                                disabled={proposing === op.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 shrink-0"
                              >
                                {proposing === op.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                Propose
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
