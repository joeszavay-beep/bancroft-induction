import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import { TRADES } from '../lib/marketplace'
import toast from 'react-hot-toast'
import {
  Link2, Search, X, Users, Phone, Mail, Briefcase, Loader2, Trash2, Eye, Building2
} from 'lucide-react'

export default function AgencyConnections() {
  const managerData = JSON.parse(getSession('manager_data') || '{}')
  const companyId = managerData.company_id

  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [connecting, setConnecting] = useState(null)
  const [removing, setRemoving] = useState(null)

  // Operatives viewer
  const [viewingAgency, setViewingAgency] = useState(null)
  const [agencyOperatives, setAgencyOperatives] = useState([])
  const [loadingOperatives, setLoadingOperatives] = useState(false)

  async function loadConnections() {
    if (!companyId) { setLoading(false); return }
    try {
      const { data, error } = await supabase
        .from('agency_connections')
        .select('id, agency_id, notes, created_at, agencies(id, company_name, primary_contact_name, primary_contact_email, primary_contact_phone)')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
      if (error) throw error

      // Enrich with operative counts and top trades
      const agencyIds = (data || []).map(c => c.agency_id)
      let opCounts = {}
      let topTrades = {}

      if (agencyIds.length > 0) {
        const { data: ops } = await supabase
          .from('agency_operatives')
          .select('agency_id, primary_trade')
          .in('agency_id', agencyIds)

        if (ops) {
          for (const op of ops) {
            opCounts[op.agency_id] = (opCounts[op.agency_id] || 0) + 1
            if (!topTrades[op.agency_id]) topTrades[op.agency_id] = {}
            topTrades[op.agency_id][op.primary_trade] = (topTrades[op.agency_id][op.primary_trade] || 0) + 1
          }
        }
      }

      setConnections((data || []).map(c => ({
        ...c,
        agency: c.agencies,
        operativeCount: opCounts[c.agency_id] || 0,
        topTrades: topTrades[c.agency_id]
          ? Object.entries(topTrades[c.agency_id])
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([trade]) => TRADES[trade]?.label || trade)
          : [],
      })))
    } catch (err) {
      console.error('loadConnections error:', err)
      toast.error('Failed to load agency connections')
    }
    setLoading(false)
  }

  useEffect(() => { loadConnections() }, [])

  async function searchAgencies(term) {
    if (!term || term.length < 2) { setSearchResults([]); return }
    setSearching(true)
    try {
      const { data, error } = await supabase
        .from('agencies')
        .select('id, company_name, primary_contact_name, primary_contact_email')
        .eq('status', 'active')
        .ilike('company_name', `%${term}%`)
        .limit(20)
      if (error) throw error

      // Exclude already-connected agencies
      const connectedIds = new Set(connections.map(c => c.agency_id))
      setSearchResults((data || []).filter(a => !connectedIds.has(a.id)))
    } catch (err) {
      console.error('searchAgencies error:', err)
    }
    setSearching(false)
  }

  useEffect(() => {
    const timeout = setTimeout(() => searchAgencies(searchTerm), 300)
    return () => clearTimeout(timeout)
  }, [searchTerm])

  async function handleConnect(agency) {
    setConnecting(agency.id)
    try {
      const { error } = await supabase.from('agency_connections').upsert({
        company_id: companyId,
        agency_id: agency.id,
        status: 'active',
        connected_by: managerData.id || managerData.name,
      }, { onConflict: 'company_id,agency_id' })
      if (error) throw error
      toast.success(`Connected with ${agency.company_name}`)
      setShowConnectModal(false)
      setSearchTerm('')
      setSearchResults([])
      await loadConnections()
    } catch (err) {
      console.error('Connect error:', err)
      toast.error(err.message || 'Failed to connect')
    }
    setConnecting(null)
  }

  async function handleRemove(connection) {
    if (!confirm(`Remove connection with ${connection.agency?.company_name}? They will no longer see your preferred-only requests.`)) return
    setRemoving(connection.id)
    try {
      const { error } = await supabase
        .from('agency_connections')
        .update({ status: 'removed' })
        .eq('id', connection.id)
      if (error) throw error
      toast.success('Agency connection removed')
      setConnections(prev => prev.filter(c => c.id !== connection.id))
    } catch (err) {
      console.error('Remove error:', err)
      toast.error('Failed to remove connection')
    }
    setRemoving(null)
  }

  async function handleViewOperatives(connection) {
    setViewingAgency(connection)
    setLoadingOperatives(true)
    try {
      const { data, error } = await supabase
        .from('agency_operatives')
        .select('id, first_name, last_name, primary_trade, skill_level, rating')
        .eq('agency_id', connection.agency_id)
        .order('last_name')
      if (error) throw error
      setAgencyOperatives(data || [])
    } catch (err) {
      console.error('loadOperatives error:', err)
      toast.error('Failed to load operatives')
    }
    setLoadingOperatives(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Link2 size={20} className="text-blue-500" /> Agency Network
          </h1>
          <p className="text-sm text-slate-500">Manage your preferred agency connections</p>
        </div>
        <button
          onClick={() => setShowConnectModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Link2 size={16} /> Connect Agency
        </button>
      </div>

      {/* Connected Agencies */}
      {connections.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <Building2 size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No agencies connected yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Connect with agencies to use preferred-only requests and build your trusted supply chain.
          </p>
          <button
            onClick={() => setShowConnectModal(true)}
            className="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            Connect Your First Agency
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {connections.map(conn => (
            <div key={conn.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">{conn.agency?.company_name || 'Agency'}</h3>
                  {conn.agency?.primary_contact_name && (
                    <p className="text-xs text-slate-500 mt-0.5">{conn.agency.primary_contact_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full font-medium">
                  <Users size={12} /> {conn.operativeCount}
                </div>
              </div>

              {/* Contact info */}
              <div className="space-y-1">
                {conn.agency?.primary_contact_phone && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Phone size={12} /> {conn.agency.primary_contact_phone}
                  </div>
                )}
                {conn.agency?.primary_contact_email && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Mail size={12} /> {conn.agency.primary_contact_email}
                  </div>
                )}
              </div>

              {/* Trade specialisms */}
              {conn.topTrades.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {conn.topTrades.map(trade => (
                    <span key={trade} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                      {trade}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                <button
                  onClick={() => handleViewOperatives(conn)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors"
                >
                  <Eye size={12} /> View Operatives
                </button>
                <button
                  onClick={() => handleRemove(conn)}
                  disabled={removing === conn.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-red-500 hover:bg-red-50 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {removing === conn.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connect Agency Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowConnectModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">Connect Agency</h2>
              <button onClick={() => setShowConnectModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search agencies by name..."
                  autoFocus
                  className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400"
                />
              </div>

              {searching && (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                  <Loader2 size={14} className="animate-spin" /> Searching...
                </div>
              )}

              {!searching && searchTerm.length >= 2 && searchResults.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No agencies found matching "{searchTerm}"</p>
              )}

              {searchResults.length > 0 && (
                <div className="space-y-2">
                  {searchResults.map(agency => (
                    <div key={agency.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{agency.company_name}</p>
                        {agency.primary_contact_name && (
                          <p className="text-xs text-slate-500">{agency.primary_contact_name}</p>
                        )}
                        {agency.primary_contact_email && (
                          <p className="text-xs text-slate-400">{agency.primary_contact_email}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleConnect(agency)}
                        disabled={connecting === agency.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 shrink-0"
                      >
                        {connecting === agency.id ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                        Connect
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View Operatives Modal */}
      {viewingAgency && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setViewingAgency(null); setAgencyOperatives([]) }} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-900">{viewingAgency.agency?.company_name}</h2>
                <p className="text-xs text-slate-500">Available operatives</p>
              </div>
              <button onClick={() => { setViewingAgency(null); setAgencyOperatives([]) }} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {loadingOperatives ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-blue-500" />
                </div>
              ) : agencyOperatives.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No operatives registered</p>
              ) : (
                <div className="space-y-2">
                  {agencyOperatives.map(op => (
                    <div key={op.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">
                        {op.first_name?.[0]}{op.last_name?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{op.first_name} {op.last_name}</p>
                        <p className="text-xs text-slate-500">
                          {TRADES[op.primary_trade]?.label || op.primary_trade}
                          {op.skill_level && ` \u00b7 ${op.skill_level}`}
                        </p>
                      </div>
                      {op.rating > 0 && (
                        <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium shrink-0">
                          {op.rating.toFixed(1)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
