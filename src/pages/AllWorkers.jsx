import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { Users, Search, Plus, Trash2, ChevronRight, AlertTriangle, ShieldCheck, Clock, CreditCard } from 'lucide-react'
import AttendanceHistory from '../components/AttendanceHistory'
import CardVerification from '../components/CardVerification'

export default function AllWorkers() {
  const navigate = useNavigate()
  const cid = JSON.parse(sessionStorage.getItem('manager_data') || '{}').company_id
  const [operatives, setOperatives] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedWorker, setSelectedWorker] = useState(null)
  const [verifyWorker, setVerifyWorker] = useState(null)

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
    if (!confirm(`Remove ${name}? This will remove all their data including signatures, attendance, and messages.`)) return
    try {
      // Delete all related records first (foreign key constraints)
      await Promise.all([
        supabase.from('signatures').delete().eq('operative_id', id),
        supabase.from('site_attendance').delete().eq('operative_id', id),
        supabase.from('toolbox_signatures').delete().eq('operative_id', id),
        supabase.from('chat_messages').delete().eq('operative_id', id),
        supabase.from('notifications').delete().eq('user_id', id),
      ])
      const { error } = await supabase.from('operatives').delete().eq('id', id)
      if (error) throw error
      toast.success('Worker removed')
    } catch (err) {
      toast.error(`Failed to remove: ${err.message}`)
    }
    loadData()
  }

  const filtered = operatives.filter(op =>
    op.name.toLowerCase().includes(search.toLowerCase()) ||
    (op.email && op.email.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#1B6FC8]/10 flex items-center justify-center">
            <Users size={20} className="text-[#1B6FC8]" />
          </div>
          <h1 className="text-2xl font-bold text-[#1A1A2E]">All Workers</h1>
          <span className="text-sm text-[#6B7A99]">({operatives.length})</span>
        </div>
        <button onClick={() => navigate('/app/workers/new')} className="flex items-center gap-1.5 px-4 py-2 bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm font-medium rounded-md transition-colors w-full sm:w-auto justify-center sm:justify-start">
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
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99] hidden sm:table-cell">Email</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99] hidden sm:table-cell">Mobile</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Project</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99] hidden md:table-cell">CSCS</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Certs</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-[#6B7A99]">No workers found</td></tr>
              ) : (
                filtered.map(op => {
                  const today = new Date()
                  const thirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
                  const expiryFields = [
                    { label: 'CSCS', date: op.cscs_expiry },
                    { label: 'IPAF', date: op.ipaf_expiry },
                    { label: 'PASMA', date: op.pasma_expiry },
                    { label: 'SSSTS', date: op.sssts_expiry },
                    { label: 'First Aid', date: op.first_aid_expiry },
                  ].filter(f => f.date)
                  const expired = expiryFields.filter(f => new Date(f.date) < today)
                  const expiringSoon = expiryFields.filter(f => new Date(f.date) >= today && new Date(f.date) <= thirtyDays)
                  const certStatus = expired.length > 0 ? 'expired' : expiringSoon.length > 0 ? 'warning' : expiryFields.length > 0 ? 'valid' : 'none'
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
                      <td className="px-4 py-3 text-[#6B7A99] hidden sm:table-cell">{op.email || '—'}</td>
                      <td className="px-4 py-3 text-[#6B7A99] hidden sm:table-cell">{op.mobile || '—'}</td>
                      <td className="px-4 py-3 text-[#6B7A99]">{op.projects?.name || '—'}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {op.cscs_number ? (
                          <div>
                            <span className="text-xs font-mono text-[#1A1A2E]">{op.cscs_number}</span>
                            {op.cscs_type && <span className="block text-[10px] text-[#6B7A99]">{op.cscs_type}</span>}
                          </div>
                        ) : <span className="text-[#B0B8C9]">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {certStatus === 'expired' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#DA3633]/10 text-[#DA3633]" title={expired.map(f => `${f.label} expired`).join(', ')}>
                            <AlertTriangle size={10} /> {expired.length} expired
                          </span>
                        ) : certStatus === 'warning' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#D29922]/10 text-[#D29922]" title={expiringSoon.map(f => `${f.label} expires ${f.date}`).join(', ')}>
                            <AlertTriangle size={10} /> {expiringSoon.length} expiring
                          </span>
                        ) : certStatus === 'valid' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#2EA043]/10 text-[#2EA043]">
                            <ShieldCheck size={10} /> Valid
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#B0B8C9]">No certs</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setVerifyWorker(op)} className={`p-1.5 transition-colors ${op.card_verified === true ? 'text-[#2EA043]' : op.card_front_url || op.card_number ? 'text-amber-500' : 'text-[#B0B8C9]'} hover:text-[#1B6FC8]`} title="Card verification">
                            <CreditCard size={14} />
                          </button>
                          <button onClick={() => setSelectedWorker(op)} className="p-1.5 text-[#6B7A99] hover:text-[#1B6FC8] transition-colors" title="Attendance history">
                            <Clock size={14} />
                          </button>
                          <button onClick={() => removeWorker(op.id, op.name)} className="p-1.5 text-[#6B7A99] hover:text-[#DA3633] transition-colors" title="Remove worker">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {selectedWorker && (
        <AttendanceHistory operative={selectedWorker} onClose={() => setSelectedWorker(null)} />
      )}
      {verifyWorker && (
        <CardVerification operative={verifyWorker} onClose={() => setVerifyWorker(null)} onUpdated={() => { setVerifyWorker(null); loadData() }} />
      )}
    </div>
  )
}
