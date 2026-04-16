import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { authFetch } from '../lib/authFetch'
import toast from 'react-hot-toast'
import { UserPlus, Search, Check } from 'lucide-react'
import { getSession } from '../lib/storage'

export default function InviteExistingWorkers() {
  const cid = JSON.parse(getSession('manager_data') || '{}').company_id
  const [operatives, setOperatives] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedProject, setSelectedProject] = useState('')
  const [sending, setSending] = useState(null)

  async function loadData() {
    if (!cid) { setLoading(false); return }
    const [o, p] = await Promise.all([
      supabase.from('operatives').select('*, projects(name)').eq('company_id', cid).order('name'),
      supabase.from('projects').select('*').eq('company_id', cid).order('name'),
    ])
    setOperatives(o.data || [])
    setProjects(p.data || [])
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [])

  async function inviteToProject(op) {
    if (!selectedProject) {
      toast.error('Select a project first')
      return
    }
    setSending(op.id)
    // Update operative's project assignment
    await supabase.from('operatives').update({ project_id: selectedProject }).eq('id', op.id)

    // Send invite email
    const proj = projects.find(p => p.id === selectedProject)
    if (op.email) {
      await authFetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operativeId: op.id,
          operativeName: op.name,
          email: op.email,
          projectName: proj?.name || '',
        }),
      }).catch(() => {})
    }

    setSending(null)
    toast.success(`${op.name} invited to ${proj?.name}`)
    loadData()
  }

  const filtered = operatives.filter(op =>
    op.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[#1B6FC8]/10 flex items-center justify-center">
          <UserPlus size={20} className="text-[#1B6FC8]" />
        </div>
        <h1 className="text-2xl font-bold text-[#1A1A2E]">Invite Existing Workers</h1>
      </div>

      {/* Project selector */}
      <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm p-4 mb-4">
        <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Select Project to Invite To *</label>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
          className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]">
          <option value="">Choose a project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Search */}
      <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm">
        <div className="p-4 border-b border-[#E2E6EA] flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B0B8C9]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name..."
              className="w-full pl-9 pr-3 py-2 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]" />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-[#1B6FC8] border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F5F6F8] text-left">
                  <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Name</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Email</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Contact</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Current Project</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-[#6B7A99]">No workers found</td></tr>
                ) : (
                  filtered.map(op => {
                    const isAssigned = selectedProject && op.project_id === selectedProject
                    return (
                      <tr key={op.id} className="border-t border-[#E2E6EA] hover:bg-[#F5F6F8]/50">
                        <td className="px-4 py-3 font-medium text-[#1A1A2E]">{op.name}</td>
                        <td className="px-4 py-3 text-[#6B7A99]">{op.email || '—'}</td>
                        <td className="px-4 py-3 text-[#6B7A99]">{op.mobile || '—'}</td>
                        <td className="px-4 py-3 text-[#6B7A99]">{op.projects?.name || '—'}</td>
                        <td className="px-4 py-3">
                          {isAssigned ? (
                            <span className="inline-flex items-center gap-1 text-xs text-[#2EA043] font-medium">
                              <Check size={12} /> Assigned
                            </span>
                          ) : (
                            <button
                              onClick={() => inviteToProject(op)}
                              disabled={!selectedProject || sending === op.id}
                              className="px-3 py-1.5 text-xs bg-[#1B6FC8] hover:bg-[#1558A0] text-white rounded-md font-medium disabled:opacity-40 transition-colors"
                            >
                              {sending === op.id ? 'Sending...' : 'Invite'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
