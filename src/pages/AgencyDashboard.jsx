import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import { TRADES, CERT_TYPES, formatDayRate, formatDate } from '../lib/marketplace'
import toast from 'react-hot-toast'
import {
  Users, UserCheck, CalendarClock, AlertTriangle, Clock, Plus,
  FileText, Calendar, Building2, Loader2, ArrowRight, ShieldAlert
} from 'lucide-react'

export default function AgencyDashboard() {
  const navigate = useNavigate()
  const managerData = JSON.parse(getSession('manager_data') || '{}')

  const [agencyId, setAgencyId] = useState(null)
  const [agency, setAgency] = useState(null)
  const [loading, setLoading] = useState(true)
  const [operatives, setOperatives] = useState([])
  const [certifications, setCertifications] = useState([])
  const [requests, setRequests] = useState([])
  const [bookings, setBookings] = useState([])

  useEffect(() => { lookupAgency() }, [])

  async function lookupAgency() {
    try {
      const { data: agencyUser } = await supabase
        .from('agency_users')
        .select('agency_id')
        .eq('email', managerData.email)
        .single()

      if (!agencyUser) {
        setLoading(false)
        return
      }

      setAgencyId(agencyUser.agency_id)

      const { data: agencyData } = await supabase
        .from('agencies')
        .select('*')
        .eq('id', agencyUser.agency_id)
        .single()

      setAgency(agencyData)
      await loadDashboardData(agencyUser.agency_id)
    } catch (err) {
      console.error('Agency lookup error:', err)
    }
    setLoading(false)
  }

  async function loadDashboardData(aid) {
    try {
      const opsRes = await supabase.from('agency_operatives').select('*').eq('agency_id', aid)
      const ops = opsRes.data || []
      setOperatives(ops)

      // Load certs for all operatives
      let certs = []
      if (ops.length > 0) {
        const opIds = ops.map(o => o.id)
        const { data: certsData } = await supabase.from('operative_certifications').select('*').in('operative_id', opIds)
        certs = certsData || []
      }
      setCertifications(certs)

      const [reqsRes, bookRes] = await Promise.all([
        supabase.from('labour_requests').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(10),
        supabase.from('labour_bookings').select('*').eq('agency_id', aid).order('start_date', { ascending: false }).limit(10),
      ])
      setRequests(reqsRes.data || [])
      setBookings(bookRes.data || [])
    } catch (err) {
      console.error('Dashboard data error:', err)
    }
  }

  const stats = useMemo(() => {
    const total = operatives.length
    const available = operatives.filter(o => o.status === 'available').length
    const booked = operatives.filter(o => o.status === 'booked').length
    const pendingRequests = requests.length

    const now = new Date()
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const expiringCerts = certifications.filter(c => {
      if (!c.expiry_date) return false
      const exp = new Date(c.expiry_date)
      return exp <= thirtyDays && exp >= now
    })

    return { total, available, booked, pendingRequests, expiringCerts }
  }, [operatives, certifications, requests])

  // Requests matching agency trades
  const matchingRequests = useMemo(() => {
    const agencyTrades = new Set()
    for (const op of operatives) {
      if (op.primary_trade) agencyTrades.add(op.primary_trade)
      if (op.secondary_trades) op.secondary_trades.forEach(t => agencyTrades.add(t))
    }
    return requests.filter(r => agencyTrades.has(r.trade_required))
  }, [operatives, requests])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  // Not linked to an agency
  if (!agencyId) {
    return (
      <div className="max-w-lg mx-auto p-4 mt-16">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <Building2 size={48} className="text-slate-300 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-900 mb-2">No Agency Linked</h2>
          <p className="text-sm text-slate-500 mb-6">
            Your account is not linked to an agency yet. Register your agency to start managing operatives and responding to labour requests.
          </p>
          <button
            onClick={() => navigate('/agency/register')}
            className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Register Agency
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">{agency?.company_name || 'Agency'} Dashboard</h1>
        <p className="text-sm text-slate-500">Manage your operatives, respond to requests, and track bookings</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard icon={Users} label="Total Operatives" value={stats.total} color="blue" />
        <StatCard icon={UserCheck} label="Available" value={stats.available} color="green" />
        <StatCard icon={CalendarClock} label="Booked" value={stats.booked} color="blue" />
        <StatCard icon={FileText} label="Open Requests" value={stats.pendingRequests} color="amber" />
        <StatCard icon={ShieldAlert} label="Certs Expiring" value={stats.expiringCerts.length} color={stats.expiringCerts.length > 0 ? 'red' : 'slate'} />
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => navigate('/app/agency/operatives')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus size={16} /> Add Operative
        </button>
        <button
          onClick={() => navigate('/app/agency/requests')}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-700 rounded-lg transition-colors"
        >
          <FileText size={16} /> View Requests
        </button>
        <button
          onClick={() => navigate('/app/agency/operatives')}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-700 rounded-lg transition-colors"
        >
          <Calendar size={16} /> View Bookings
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Matching Requests */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">Recent Labour Requests</h2>
            <button onClick={() => navigate('/app/agency/requests')} className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1">
              View all <ArrowRight size={12} />
            </button>
          </div>
          {matchingRequests.length === 0 ? (
            <div className="p-8 text-center">
              <FileText size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No matching requests right now</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {matchingRequests.slice(0, 5).map(req => (
                <button
                  key={req.id}
                  onClick={() => navigate('/app/agency/requests')}
                  className="w-full px-4 py-3 hover:bg-slate-50 text-left transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-800">
                      {TRADES[req.trade_required]?.label || req.trade_required}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      req.urgency === 'emergency' ? 'bg-red-100 text-red-700' :
                      req.urgency === 'urgent' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {req.urgency?.toUpperCase() || 'STANDARD'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {req.number_required} needed &middot; {formatDate(req.start_date)} - {formatDate(req.end_date)} &middot; {formatDayRate(req.day_rate_pence)}/day
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cert Expiry Alerts */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800">Certification Expiry Alerts (30 days)</h2>
          </div>
          {stats.expiringCerts.length === 0 ? (
            <div className="p-8 text-center">
              <ShieldAlert size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No certifications expiring soon</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {stats.expiringCerts.map(cert => {
                const daysLeft = Math.ceil((new Date(cert.expiry_date) - new Date()) / (1000 * 60 * 60 * 24))
                const op = operatives.find(o => o.id === cert.operative_id)
                return (
                  <div key={cert.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {op ? `${op.first_name} ${op.last_name}` : 'Unknown'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {CERT_TYPES[cert.certification_type] || cert.certification_type}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      daysLeft <= 7 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {daysLeft}d left
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-100',
  }
  const c = colors[color] || colors.slate
  return (
    <div className={`border rounded-xl p-3 ${c}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} />
        <span className="text-[11px] font-medium opacity-70">{label}</span>
      </div>
      <p className="text-lg font-bold">{value}</p>
    </div>
  )
}
