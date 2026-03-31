import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { Users, Search, Plus, Trash2, ChevronRight } from 'lucide-react'

export default function AllWorkers() {
  const navigate = useNavigate()
  const cid = JSON.parse(sessionStorage.getItem('manager_data') || '{}').company_id
  const [operatives, setOperatives] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data } = cid
      ? await supabase.from('operatives').select('*, projects(name)').eq('company_id', cid).order('name')
      : await supabase.from('operatives').select('*, projects(name)').order('name')
    setOperatives(data || [])
    setLoading(false)
  }

  async function removeWorker(id, name) {
    if (!confirm(`Remove ${name}? This will also remove their signatures.`)) return
    await supabase.from('signatures').delete().eq('operative_id', id)
    await supabase.from('operatives').delete().eq('id', id)
    toast.success('Worker removed')
    loadData()
  }

  const filtered = operatives.filter(op =>
    op.name.toLowerCase().includes(search.toLowerCase()) ||
    (op.email && op.email.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#1B6FC8]/10 flex items-center justify-center">
            <Users size={20} className="text-[#1B6FC8]" />
          </div>
          <h1 className="text-2xl font-bold text-[#1A1A2E]">All Workers</h1>
          <span className="text-sm text-[#6B7A99]">({operatives.length})</span>
        </div>
        <button onClick={() => navigate('/app/workers/new')} className="flex items-center gap-1.5 px-4 py-2 bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm font-medium rounded-md transition-colors">
          <Plus size={14} /> Add New Worker
        </button>
      </div>

      {/* Search */}
      <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm mb-4 p-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B0B8C9]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..."
            className="w-full pl-9 pr-3 py-2 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-[#1B6FC8] border-t-transparent rounded-full" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5F6F8] text-left">
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Name</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Role / Trade</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Email</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Mobile</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Project</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Profile</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[#6B7A99]">No workers found</td></tr>
              ) : (
                filtered.map(op => {
                  const profileComplete = !!(op.date_of_birth && op.ni_number)
                  return (
                    <tr key={op.id} className="border-t border-[#E2E6EA] hover:bg-[#F5F6F8]/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {op.photo_url ? (
                            <img src={op.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#1B6FC8]/10 flex items-center justify-center text-[#1B6FC8] text-xs font-bold">
                              {op.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="font-medium text-[#1A1A2E]">{op.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#6B7A99]">{op.role || '—'}</td>
                      <td className="px-4 py-3 text-[#6B7A99]">{op.email || '—'}</td>
                      <td className="px-4 py-3 text-[#6B7A99]">{op.mobile || '—'}</td>
                      <td className="px-4 py-3 text-[#6B7A99]">{op.projects?.name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${profileComplete ? 'bg-[#2EA043]/10 text-[#2EA043]' : 'bg-[#D29922]/10 text-[#D29922]'}`}>
                          {profileComplete ? 'Complete' : 'Incomplete'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => removeWorker(op.id, op.name)} className="p-1.5 text-[#6B7A99] hover:text-[#DA3633] transition-colors">
                          <Trash2 size={14} />
                        </button>
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
