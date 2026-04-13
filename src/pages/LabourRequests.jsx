import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import { TRADES, URGENCY_LABELS, formatDate } from '../lib/marketplace'
import toast from 'react-hot-toast'
import { PlusCircle, Briefcase, Loader2, Inbox } from 'lucide-react'

const REQUEST_STATUS = {
  open:             { label: 'Open',             bg: 'bg-blue-100',  text: 'text-blue-700' },
  partially_filled: { label: 'Partially Filled', bg: 'bg-amber-100', text: 'text-amber-700' },
  filled:           { label: 'Filled',           bg: 'bg-green-100', text: 'text-green-700' },
  cancelled:        { label: 'Cancelled',        bg: 'bg-slate-100', text: 'text-slate-500' },
}

export default function LabourRequests() {
  const navigate = useNavigate()
  const managerData = JSON.parse(getSession('manager_data') || '{}')

  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState('')
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadProjects() }, [])
  useEffect(() => { if (selectedProject) loadRequests() }, [selectedProject])

  async function loadProjects() {
    try {
      let query = supabase.from('projects').select('id, name').order('name')
      if (managerData.company_id) query = query.eq('company_id', managerData.company_id)
      const { data } = await query
      setProjects(data || [])
      if (data?.length > 0) setSelectedProject(data[0].id)
    } catch (err) {
      console.error('loadProjects error:', err)
    }
    setLoading(false)
  }

  async function loadRequests() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('labour_requests')
        .select('*')
        .eq('project_id', selectedProject)
        .order('created_at', { ascending: false })
      if (error) throw error

      // Count proposals per request
      const requestIds = (data || []).map(r => r.id)
      let proposalCounts = {}
      if (requestIds.length > 0) {
        const { data: proposals } = await supabase
          .from('labour_proposals')
          .select('labour_request_id')
          .in('labour_request_id', requestIds)
        if (proposals) {
          for (const p of proposals) {
            proposalCounts[p.labour_request_id] = (proposalCounts[p.labour_request_id] || 0) + 1
          }
        }
      }

      // Count accepted bookings per request for filled count
      let filledCounts = {}
      if (requestIds.length > 0) {
        const { data: bookings } = await supabase
          .from('labour_bookings')
          .select('labour_request_id')
          .in('labour_request_id', requestIds)
          .eq('status', 'confirmed')
        if (bookings) {
          for (const b of bookings) {
            filledCounts[b.labour_request_id] = (filledCounts[b.labour_request_id] || 0) + 1
          }
        }
      }

      setRequests((data || []).map(r => ({
        ...r,
        _proposalCount: proposalCounts[r.id] || 0,
        _filledCount: filledCounts[r.id] || 0,
      })))
    } catch (err) {
      console.error('loadRequests error:', err)
      toast.error('Failed to load requests')
    }
    setLoading(false)
  }

  if (loading && !requests.length) {
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
        <h1 className="text-xl font-bold text-slate-900">Labour Requests</h1>
        <p className="text-sm text-slate-500">Manage your labour requests and view agency proposals</p>
      </div>

      {/* Project selector + New Request */}
      <div className="flex items-center gap-3 flex-wrap">
        {projects.length > 0 ? (
          <select
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400"
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <p className="text-sm text-slate-400">No projects found</p>
        )}

        <button
          onClick={() => navigate('/app/labour-requests/new', { state: { projectId: selectedProject } })}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <PlusCircle size={16} /> New Request
        </button>
      </div>

      {/* Requests list */}
      {requests.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <Inbox size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No labour requests yet</p>
          <p className="text-xs text-slate-400 mt-1">Create your first request to find operatives through agencies</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500">Trade</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500">Dates</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500">Needed</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500">Status</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500">Urgency</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500">Proposals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map(req => {
                  const sc = REQUEST_STATUS[req.status] || REQUEST_STATUS.open
                  const urg = URGENCY_LABELS[req.urgency] || URGENCY_LABELS.standard
                  const proposalCount = req._proposalCount || 0
                  return (
                    <tr
                      key={req.id}
                      onClick={() => navigate(`/app/labour-requests/${req.id}`)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2.5 text-slate-800 font-medium">
                        <div className="flex items-center gap-2">
                          <Briefcase size={14} className="text-slate-400" />
                          {TRADES[req.trade_required]?.label || req.trade_required}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 text-xs">
                        {formatDate(req.start_date)} — {formatDate(req.end_date)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 tabular-nums">
                        {req._filledCount || 0} / {req.number_of_operatives}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-${urg.color}-100 text-${urg.color}-700`}>
                          {urg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 tabular-nums">
                        {proposalCount}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
