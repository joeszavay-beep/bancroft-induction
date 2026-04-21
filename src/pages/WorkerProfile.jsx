import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { ArrowLeft, Phone, Briefcase, ShieldCheck } from 'lucide-react'
import { getSession } from '../lib/storage'

export default function WorkerProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const cid = JSON.parse(getSession('manager_data') || '{}').company_id

  const [operative, setOperative] = useState(null)
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState('')
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('operatives')
        .select('*, projects(name)')
        .eq('id', id)
        .single()
      if (!data) { navigate('/app/workers'); return }
      setOperative(data)

      if (!data.project_id && cid) {
        const { data: projs } = await supabase
          .from('projects')
          .select('id, name')
          .eq('company_id', cid)
          .order('name')
        setProjects(projs || [])
      }
      setLoading(false)
    }
    load()
  }, [id])

  async function handleAssign() {
    if (!selectedProject) return
    setAssigning(true)
    const { error } = await supabase
      .from('operatives')
      .update({ project_id: selectedProject })
      .eq('id', id)
    setAssigning(false)
    if (error) { toast.error('Failed to assign project'); return }
    const proj = projects.find(p => p.id === selectedProject)
    setOperative(prev => ({ ...prev, project_id: selectedProject, projects: { name: proj?.name } }))
    toast.success(`Assigned to ${proj?.name}`)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin w-6 h-6 border-2 border-[#1B6FC8] border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!operative) return null

  const today = new Date()
  const thirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
  const certs = [
    { label: 'CSCS', date: operative.cscs_expiry },
    { label: 'IPAF', date: operative.ipaf_expiry },
    { label: 'PASMA', date: operative.pasma_expiry },
    { label: 'SSSTS', date: operative.sssts_expiry },
    { label: 'First Aid', date: operative.first_aid_expiry },
  ]

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/app/workers')} className="p-1.5 hover:bg-[#F5F6F8] rounded-lg transition-colors">
          <ArrowLeft size={20} className="text-[#6B7A99]" />
        </button>
        <h1 className="text-2xl font-bold text-[#1A1A2E]">Worker Profile</h1>
      </div>

      <div className="max-w-2xl space-y-4">
        {/* Identity */}
        <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm p-5">
          <div className="flex items-center gap-4">
            {operative.photo_url ? (
              <img src={operative.photo_url} alt="" className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#1B6FC8]/10 flex items-center justify-center text-[#1B6FC8] text-xl font-bold">
                {operative.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-[#1A1A2E]">{operative.name}</h2>
              {(operative.role || operative.trade) && (
                <p className="text-sm text-[#6B7A99]">{[operative.role, operative.trade].filter(Boolean).join(' · ')}</p>
              )}
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm">
          <div className="px-5 py-3 border-b border-[#E2E6EA] bg-[#F5F6F8]">
            <p className="text-xs font-semibold text-[#6B7A99] flex items-center gap-1.5"><Phone size={12} /> Contact</p>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Email" value={operative.email} />
            <Field label="Mobile" value={operative.mobile} />
          </div>
        </div>

        {/* Project */}
        <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm">
          <div className="px-5 py-3 border-b border-[#E2E6EA] bg-[#F5F6F8]">
            <p className="text-xs font-semibold text-[#6B7A99] flex items-center gap-1.5"><Briefcase size={12} /> Project</p>
          </div>
          <div className="p-5">
            {operative.project_id ? (
              <p className="text-sm font-medium text-[#1A1A2E]">{operative.projects?.name}</p>
            ) : (
              <div className="flex items-center gap-3">
                <select
                  value={selectedProject}
                  onChange={e => setSelectedProject(e.target.value)}
                  className="flex-1 px-3 py-2 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]"
                >
                  <option value="">— Select project —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button
                  onClick={handleAssign}
                  disabled={!selectedProject || assigning}
                  className="px-4 py-2 bg-[#1B6FC8] hover:bg-[#1558A0] disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
                >
                  {assigning ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* CSCS & Certifications */}
        <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm">
          <div className="px-5 py-3 border-b border-[#E2E6EA] bg-[#F5F6F8]">
            <p className="text-xs font-semibold text-[#6B7A99] flex items-center gap-1.5"><ShieldCheck size={12} /> CSCS & Certifications</p>
          </div>
          <div className="p-5 space-y-4">
            {operative.cscs_number ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="CSCS Number" value={operative.cscs_number} />
                <Field label="Card Type" value={operative.cscs_type} />
                <Field label="Expiry" value={operative.cscs_expiry ? new Date(operative.cscs_expiry).toLocaleDateString('en-GB') : null} />
              </div>
            ) : (
              <p className="text-sm text-[#B0B8C9]">No CSCS card on file</p>
            )}

            {certs.some(c => c.date) && (
              <div className="border-t border-[#E2E6EA] pt-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {certs.filter(c => c.date).map(c => {
                    const d = new Date(c.date)
                    const expired = d < today
                    const expiring = !expired && d <= thirtyDays
                    return (
                      <div key={c.label} className={`px-3 py-2 rounded-lg border text-xs ${expired ? 'bg-[#DA3633]/5 border-[#DA3633]/20' : expiring ? 'bg-[#D29922]/5 border-[#D29922]/20' : 'bg-[#2EA043]/5 border-[#2EA043]/20'}`}>
                        <p className="font-semibold text-[#1A1A2E]">{c.label}</p>
                        <p className={expired ? 'text-[#DA3633]' : expiring ? 'text-[#D29922]' : 'text-[#2EA043]'}>
                          {expired ? 'Expired ' : expiring ? 'Expiring ' : ''}{d.toLocaleDateString('en-GB')}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[11px] text-[#6B7A99] font-medium uppercase tracking-wider">{label}</p>
      <p className="text-sm text-[#1A1A2E] mt-0.5">{value || <span className="text-[#B0B8C9]">—</span>}</p>
    </div>
  )
}
