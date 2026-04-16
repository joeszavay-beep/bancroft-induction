import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import { BarChart3, Search, Check, X, Clock, RotateCcw } from 'lucide-react'
import { getSession } from '../lib/storage'

export default function InvitationsPipeline() {
  const { company } = useCompany()
  const cid = JSON.parse(getSession('manager_data') || '{}').company_id
  const [operatives, setOperatives] = useState([])
  const [documents, setDocuments] = useState([])
  const [signatures, setSignatures] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchFirst, setSearchFirst] = useState('')
  const [filterSite, setFilterSite] = useState('all')

  async function loadData() {
    setLoading(true)
    const [o, d, s, p] = await Promise.all([
      cid ? supabase.from('operatives').select('*, projects(name)').eq('company_id', cid).order('created_at', { ascending: false })
           : supabase.from('operatives').select('*, projects(name)').order('created_at', { ascending: false }),
      cid ? supabase.from('documents').select('*').eq('company_id', cid)
           : supabase.from('documents').select('*'),
      cid ? supabase.from('signatures').select('*').eq('company_id', cid).eq('invalidated', false)
           : supabase.from('signatures').select('*').eq('invalidated', false),
      cid ? supabase.from('projects').select('*').eq('company_id', cid).order('name')
           : supabase.from('projects').select('*').order('name'),
    ])
    setOperatives(o.data || [])
    setDocuments(d.data || [])
    setSignatures(s.data || [])
    setProjects(p.data || [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData() }, [])

  // Pipeline stats
  const total = operatives.length
  const profileComplete = operatives.filter(op => op.date_of_birth && op.ni_number).length
  const hasLoggedIn = operatives.filter(op => op.date_of_birth).length // proxy: filled DOB = logged in
  const allDocsComplete = operatives.filter(op => {
    if (!op.project_id) return false
    const projDocs = documents.filter(d => d.project_id === op.project_id)
    if (projDocs.length === 0) return false
    const signedIds = new Set(signatures.filter(s => s.operative_id === op.id).map(s => s.document_id))
    return projDocs.every(d => signedIds.has(d.id))
  }).length

  const invited = total - hasLoggedIn
  const inProgress = hasLoggedIn - allDocsComplete
  const maxBar = Math.max(total, 1)

  // Filtered operatives
  let filtered = operatives
  if (searchFirst) filtered = filtered.filter(op => op.name.toLowerCase().includes(searchFirst.toLowerCase()))
  if (filterSite !== 'all') filtered = filtered.filter(op => op.project_id === filterSite)

  function getStatus(op) {
    if (!op.project_id) return { label: 'No Project', color: 'bg-gray-400' }
    const projDocs = documents.filter(d => d.project_id === op.project_id)
    if (projDocs.length === 0) return { label: 'No Docs', color: 'bg-gray-400' }
    const signedIds = new Set(signatures.filter(s => s.operative_id === op.id).map(s => s.document_id))
    const signedCount = projDocs.filter(d => signedIds.has(d.id)).length
    if (signedCount === projDocs.length) return { label: 'Complete', color: 'bg-[#2EA043]' }
    if (signedCount > 0) return { label: 'In Progress', color: 'bg-[#1B6FC8]' }
    if (op.date_of_birth) return { label: 'Logged In', color: 'bg-[#D29922]' }
    return { label: 'Invited', color: 'bg-[#93C5FD]' }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[#1B6FC8]/10 flex items-center justify-center">
          <BarChart3 size={20} className="text-[#1B6FC8]" />
        </div>
        <h1 className="text-2xl font-bold text-[#1A1A2E]">Invitations Pipeline</h1>
      </div>

      {/* Pipeline chart */}
      <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-[#1A1A2E]">Current Training Pipeline</p>
          <span className="w-8 h-8 rounded-full bg-[#1B6FC8] text-white text-xs font-bold flex items-center justify-center">{total}</span>
        </div>

        {/* Stacked bar */}
        <div className="mb-3">
          <div className="flex h-14 sm:h-10 rounded-md overflow-hidden">
            {invited > 0 && (
              <div className="bg-[#93C5FD] flex items-center justify-center text-xs font-bold text-white" style={{ width: `${(invited / maxBar) * 100}%`, minWidth: invited > 0 ? '30px' : 0 }}>
                {invited}
              </div>
            )}
            {hasLoggedIn - profileComplete > 0 && (
              <div className="bg-[#D29922] flex items-center justify-center text-xs font-bold text-white" style={{ width: `${((hasLoggedIn - profileComplete) / maxBar) * 100}%`, minWidth: '30px' }}>
                {hasLoggedIn - profileComplete}
              </div>
            )}
            {inProgress > 0 && (
              <div className="bg-[#1B6FC8] flex items-center justify-center text-xs font-bold text-white" style={{ width: `${(inProgress / maxBar) * 100}%`, minWidth: inProgress > 0 ? '30px' : 0 }}>
                {inProgress}
              </div>
            )}
            {allDocsComplete > 0 && (
              <div className="bg-[#2EA043] flex items-center justify-center text-xs font-bold text-white" style={{ width: `${(allDocsComplete / maxBar) * 100}%`, minWidth: allDocsComplete > 0 ? '30px' : 0 }}>
                {allDocsComplete}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-[#6B7A99]">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#93C5FD]" /> Invited ({invited})</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#D29922]" /> Have Logged In ({hasLoggedIn - profileComplete})</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#1B6FC8]" /> In Progress ({inProgress})</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#2EA043]" /> Complete ({allDocsComplete})</span>
        </div>

        <p className="text-[10px] text-[#6B7A99] text-right mt-2">(Last updated: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</p>
      </div>

      {/* Search filters */}
      <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm p-4 mb-4">
        <p className="text-sm font-semibold text-[#1A1A2E] mb-3">Search</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[#6B7A99] mb-1 block">First Name</label>
            <input value={searchFirst} onChange={e => setSearchFirst(e.target.value)}
              className="w-full px-3 py-2 border border-[#E2E6EA] rounded-md text-sm focus:outline-none focus:border-[#1B6FC8]" />
          </div>
          <div>
            <label className="text-xs text-[#6B7A99] mb-1 block">Site(s)</label>
            <select value={filterSite} onChange={e => setFilterSite(e.target.value)}
              className="w-full px-3 py-2 border border-[#E2E6EA] rounded-md text-sm focus:outline-none focus:border-[#1B6FC8]">
              <option value="all">All Selected</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button onClick={loadData} className="px-4 py-2 border border-[#E2E6EA] rounded-md text-sm text-[#6B7A99] hover:bg-[#F5F6F8] flex items-center gap-1">
              <RotateCcw size={12} /> Reload
            </button>
            <button onClick={() => { setSearchFirst(''); setFilterSite('all') }} className="px-4 py-2 bg-[#1B6FC8] text-white rounded-md text-sm hover:bg-[#1558A0]">
              <Search size={12} className="inline mr-1" /> Search
            </button>
          </div>
        </div>
      </div>

      {/* Results table */}
      <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-[#1B6FC8] border-t-transparent rounded-full" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5F6F8] text-left">
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Contractor</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Name</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Site</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Profile Status</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Documents</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-[#6B7A99]">0 Invitations Found</td></tr>
              ) : (
                filtered.map(op => {
                  const status = getStatus(op)
                  const profileDone = !!(op.date_of_birth && op.ni_number)
                  const projDocs = documents.filter(d => d.project_id === op.project_id)
                  const signedCount = signatures.filter(s => s.operative_id === op.id && projDocs.some(d => d.id === s.document_id)).length

                  return (
                    <tr key={op.id} className="border-t border-[#E2E6EA] hover:bg-[#F5F6F8]/50">
                      <td className="px-4 py-3 text-[#6B7A99]">{company?.name || '—'}</td>
                      <td className="px-4 py-3 font-medium text-[#1A1A2E]">{op.name}</td>
                      <td className="px-4 py-3 text-[#6B7A99]">{op.projects?.name || '—'}</td>
                      <td className="px-4 py-3">
                        {profileDone ? (
                          <span className="text-[#2EA043] flex items-center gap-1"><Check size={14} /> Complete</span>
                        ) : (
                          <span className="text-[#D29922] flex items-center gap-1"><Clock size={14} /> Incomplete</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#6B7A99]">
                        {projDocs.length > 0 ? `${signedCount}/${projDocs.length}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
