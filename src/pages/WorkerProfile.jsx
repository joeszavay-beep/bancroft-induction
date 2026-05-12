import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import { authFetch } from '../lib/authFetch'
import toast from 'react-hot-toast'
import { ArrowLeft, Phone, Briefcase, ShieldCheck, CheckCircle2, ZoomIn, X, Camera, User, Users, FileText, ChevronRight, ChevronDown, Clock } from 'lucide-react'
import { getSession } from '../lib/storage'
import InlineEditField from '../components/InlineEditField'
import { validateDOB, validateNI, validateEmail, validateUKMobile, validateUKPhone, validateCardExpiry } from '../lib/validators'

export default function WorkerProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useCompany()
  const cid = JSON.parse(getSession('manager_data') || '{}').company_id

  const [operative, setOperative] = useState(null)
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [certDocs, setCertDocs] = useState({})
  const [auditOpen, setAuditOpen] = useState(false)
  const [auditLog, setAuditLog] = useState([])

  const canEdit = user && ['manager', 'admin', 'super_admin'].includes(user.role)

  async function handleFieldSave(fieldKey, newValue) {
    try {
      const res = await authFetch('/api/update-operative', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operativeId: id, fields: { [fieldKey]: newValue }, managerCompanyId: cid, managerName: user?.name }),
      })
      const data = await res.json()
      if (data.success) {
        setOperative(prev => ({ ...prev, [fieldKey]: newValue }))
        return { success: true }
      }
      return { success: false, error: data.details?.[fieldKey] || data.error || 'Failed to save' }
    } catch {
      return { success: false, error: 'Couldn\'t save, try again' }
    }
  }

  async function handleEmailChange(newEmail) {
    try {
      const res = await authFetch('/api/request-email-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operativeId: id, newEmail, managerCompanyId: cid, managerName: user?.name }),
      })
      const data = await res.json()
      if (data.success) {
        setOperative(prev => ({ ...prev, pending_email: newEmail }))
        toast.success('Verification email sent')
        return { success: true }
      }
      return { success: false, error: data.error || 'Failed to send verification' }
    } catch {
      return { success: false, error: 'Couldn\'t send verification email' }
    }
  }

  async function handleCancelPending() {
    await supabase.from('operatives').update({ pending_email: null }).eq('id', id)
    await supabase.from('pending_email_changes')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('operative_id', id).is('verified_at', null).is('cancelled_at', null)
    setOperative(prev => ({ ...prev, pending_email: null }))
    toast.success('Email change cancelled')
  }

  async function handleResendVerification() {
    if (operative?.pending_email) {
      await handleEmailChange(operative.pending_email)
    }
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    const filePath = `photos/${id}_${crypto.randomUUID()}.jpg`
    const { error: upErr } = await supabase.storage.from('documents').upload(filePath, file, { contentType: file.type })
    if (upErr) { setUploadingPhoto(false); toast.error('Failed to upload photo'); return }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)
    const { error: dbErr } = await supabase.from('operatives').update({ photo_url: urlData.publicUrl }).eq('id', id)
    setUploadingPhoto(false)
    if (dbErr) { toast.error('Failed to save photo'); return }
    setOperative(prev => ({ ...prev, photo_url: urlData.publicUrl }))
    toast.success('Photo updated')
  }

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('operatives')
        .select('*, operative_projects(project_id, assigned_at, projects(name))')
        .eq('id', id)
        .single()
      if (!data) { navigate('/app/workers'); return }
      setOperative(data)

      const docs = {}
      for (const key of ['cscs', 'ipaf', 'pasma', 'sssts', 'smsts', 'first_aid']) {
        const folder = `certs/${id}/${key}`
        const { data: files } = await supabase.storage.from('documents').list(folder, { limit: 1 })
        if (files?.length > 0) {
          const { data: urlData } = supabase.storage.from('documents').getPublicUrl(`${folder}/${files[0].name}`)
          docs[key] = urlData.publicUrl
        }
      }
      setCertDocs(docs)

      if (cid) {
        const { data: projs } = await supabase.from('projects').select('id, name').eq('company_id', cid).order('name')
        setProjects(projs || [])
      }
      setLoading(false)
    }
    load()
  }, [id])

  async function loadAuditLog() {
    const { data } = await supabase.from('profile_audit_log')
      .select('*')
      .eq('worker_id', id)
      .order('created_at', { ascending: false })
      .limit(10)
    setAuditLog(data || [])
  }

  useEffect(() => {
    if (auditOpen && canEdit) loadAuditLog()
  }, [auditOpen])

  async function handleAssign() {
    if (!selectedProject) return
    setAssigning(true)
    const { error } = await supabase.from('operative_projects').insert({ operative_id: id, project_id: selectedProject })
    setAssigning(false)
    if (error) { toast.error('Failed to assign project'); return }
    const proj = projects.find(p => p.id === selectedProject)
    setOperative(prev => ({
      ...prev,
      operative_projects: [...(prev.operative_projects || []), { project_id: selectedProject, projects: { name: proj?.name } }],
    }))
    setSelectedProject('')
    toast.success(`Assigned to ${proj?.name}`)
  }

  async function handleRemove(projectId) {
    const proj = (operative.operative_projects || []).find(r => r.project_id === projectId)
    const name = proj?.projects?.name || 'project'
    const { error } = await supabase.from('operative_projects').delete().eq('operative_id', id).eq('project_id', projectId)
    if (error) { toast.error('Failed to remove from project'); return }
    setOperative(prev => ({
      ...prev,
      operative_projects: (prev.operative_projects || []).filter(r => r.project_id !== projectId),
    }))
    toast.success(`Removed from ${name}`)
  }

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-6 h-6 border-2 border-[#1B6FC8] border-t-transparent rounded-full" /></div>
  }
  if (!operative) return null

  const today = new Date()
  const thirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
  const certs = [
    { key: 'cscs', label: 'CSCS', date: operative.cscs_expiry },
    { key: 'ipaf', label: 'IPAF', date: operative.ipaf_expiry },
    { key: 'pasma', label: 'PASMA', date: operative.pasma_expiry },
    { key: 'sssts', label: 'SSSTS', date: operative.sssts_expiry },
    { key: 'smsts', label: 'SMSTS', date: operative.smsts_expiry },
    { key: 'first_aid', label: 'First Aid', date: operative.first_aid_expiry },
  ]

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/app/workers')} className="p-1.5 hover:bg-[#F5F6F8] rounded-lg transition-colors">
          <ArrowLeft size={20} className="text-[#6B7A99]" />
        </button>
        <h1 className="text-2xl font-bold text-[#1A1A2E]">Worker Profile</h1>
      </div>

      <div className="space-y-4">
        {/* Identity */}
        <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm p-5">
          <div className="flex items-center gap-4">
            <label className="relative w-16 h-16 rounded-full shrink-0 cursor-pointer group">
              {operative.photo_url ? (
                <img src={operative.photo_url} alt="" className="w-16 h-16 rounded-full object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-[#1B6FC8]/10 flex items-center justify-center text-[#1B6FC8] text-xl font-bold">
                  {operative.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                {uploadingPhoto ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera size={18} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
            </label>
            <div>
              <h2 className="text-lg font-bold text-[#1A1A2E]">{operative.name}</h2>
              {(operative.role || operative.trade) && (
                <p className="text-sm text-[#6B7A99]">{[operative.role, operative.trade].filter(Boolean).join(' · ')}</p>
              )}
            </div>
          </div>
        </div>

        {/* Personal Details */}
        <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm">
          <div className="px-5 py-3 border-b border-[#E2E6EA] bg-[#F5F6F8]">
            <p className="text-xs font-semibold text-[#6B7A99] flex items-center gap-1.5"><User size={12} /> Personal Details</p>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-x-4">
            <InlineEditField label="Date of Birth" value={operative.date_of_birth} fieldKey="date_of_birth" type="date" editable={canEdit} onSave={handleFieldSave} validate={validateDOB} />
            <InlineEditField label="NI Number" value={operative.ni_number} fieldKey="ni_number" type="ni_number" editable={canEdit} onSave={handleFieldSave} validate={validateNI} />
            <InlineEditField label="Address" value={operative.address} fieldKey="address" type="address" editable={canEdit} onSave={handleFieldSave} />
          </div>
        </div>

        {/* Contact */}
        <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm">
          <div className="px-5 py-3 border-b border-[#E2E6EA] bg-[#F5F6F8]">
            <p className="text-xs font-semibold text-[#6B7A99] flex items-center gap-1.5"><Phone size={12} /> Contact</p>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <InlineEditField label="Email" value={operative.email} fieldKey="email" type="email" editable={canEdit}
              onSave={(_, v) => handleEmailChange(v)} validate={validateEmail}
              pendingEmail={operative.pending_email} onCancelPending={handleCancelPending} onResendVerification={handleResendVerification} />
            <InlineEditField label="Mobile" value={operative.mobile} fieldKey="mobile" type="phone" editable={canEdit} onSave={handleFieldSave} validate={validateUKMobile} />
          </div>
        </div>

        {/* Next of Kin */}
        <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm">
          <div className="px-5 py-3 border-b border-[#E2E6EA] bg-[#F5F6F8]">
            <p className="text-xs font-semibold text-[#6B7A99] flex items-center gap-1.5"><Users size={12} /> Emergency Contact</p>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <InlineEditField label="Next of Kin" value={operative.next_of_kin} fieldKey="next_of_kin" type="text" editable={canEdit} onSave={handleFieldSave} />
            <InlineEditField label="Phone" value={operative.next_of_kin_phone} fieldKey="next_of_kin_phone" type="phone" editable={canEdit} onSave={handleFieldSave} validate={validateUKPhone} />
          </div>
        </div>

        {/* Projects — unchanged */}
        <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm">
          <div className="px-5 py-3 border-b border-[#E2E6EA] bg-[#F5F6F8]">
            <p className="text-xs font-semibold text-[#6B7A99] flex items-center gap-1.5"><Briefcase size={12} /> Projects</p>
          </div>
          <div className="p-5 space-y-3">
            {(operative.operative_projects || []).length > 0 && (
              <div className="space-y-1.5">
                {operative.operative_projects.map(r => (
                  <div key={r.project_id} className="flex items-center justify-between group">
                    <p className="text-sm font-medium text-[#1A1A2E]">{r.projects?.name}</p>
                    <button onClick={() => handleRemove(r.project_id)} className="p-1 text-[#B0B8C9] hover:text-[#DA3633] transition-colors" title="Remove from project">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {(operative.operative_projects || []).length === 0 && <p className="text-sm text-[#B0B8C9]">No project assigned</p>}
            {(() => {
              const assignedIds = new Set((operative.operative_projects || []).map(r => r.project_id))
              const available = projects.filter(p => !assignedIds.has(p.id))
              if (available.length === 0) return null
              return (
                <div className="flex items-center gap-3">
                  <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
                    className="flex-1 px-3 py-2 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]">
                    <option value="">— Add to project —</option>
                    {available.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button onClick={handleAssign} disabled={!selectedProject || assigning}
                    className="px-4 py-2 bg-[#1B6FC8] hover:bg-[#1558A0] disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors">
                    {assigning ? 'Assigning...' : 'Assign'}
                  </button>
                </div>
              )
            })()}
          </div>
        </div>

        {/* CSCS / ECS Card & Certifications */}
        <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm">
          <div className="px-5 py-3 border-b border-[#E2E6EA] bg-[#F5F6F8]">
            <p className="text-xs font-semibold text-[#6B7A99] flex items-center gap-1.5"><ShieldCheck size={12} /> CSCS / ECS Card & Certifications</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4">
              <InlineEditField label="Card Number" value={operative.card_number || operative.cscs_number} fieldKey="card_number" type="text" editable={canEdit} onSave={handleFieldSave} />
              <InlineEditField label="Card Type" value={operative.card_type || operative.cscs_type} fieldKey="card_type" type="dropdown" editable={canEdit} onSave={handleFieldSave} />
              <InlineEditField label="Expiry" value={operative.card_expiry || operative.cscs_expiry} fieldKey="card_expiry" type="date" editable={canEdit} onSave={handleFieldSave} validate={validateCardExpiry} />
            </div>

            {(operative.card_front_url || operative.card_back_url) && (
              <div className="grid grid-cols-2 gap-3">
                {operative.card_front_url && (
                  <div>
                    <p className="text-[11px] text-[#6B7A99] font-medium uppercase tracking-wider mb-1">Front</p>
                    <div className="relative group rounded-lg overflow-hidden border border-[#E2E6EA] cursor-pointer" onClick={() => setLightbox(operative.card_front_url)}>
                      <img src={operative.card_front_url} alt="Card front" className="w-full h-24 object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <ZoomIn size={18} className="text-white opacity-0 group-hover:opacity-100 drop-shadow" />
                      </div>
                    </div>
                  </div>
                )}
                {operative.card_back_url && (
                  <div>
                    <p className="text-[11px] text-[#6B7A99] font-medium uppercase tracking-wider mb-1">Back</p>
                    <div className="relative group rounded-lg overflow-hidden border border-[#E2E6EA] cursor-pointer" onClick={() => setLightbox(operative.card_back_url)}>
                      <img src={operative.card_back_url} alt="Card back" className="w-full h-24 object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <ZoomIn size={18} className="text-white opacity-0 group-hover:opacity-100 drop-shadow" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {operative.card_verified === true && (
              <div className="flex items-center gap-2 p-2.5 bg-[#ECFDF5] border border-[#A7F3D0] rounded-lg">
                <CheckCircle2 size={14} className="text-[#059669]" />
                <span className="text-xs text-[#065F46] font-medium">Verified by {operative.card_verified_by} · {new Date(operative.card_verified_at).toLocaleDateString('en-GB')}</span>
              </div>
            )}
            {operative.card_verified === false && (
              <div className="flex items-center gap-2 p-2.5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg">
                <ShieldCheck size={14} className="text-[#DC2626]" />
                <span className="text-xs text-[#991B1B] font-medium">Card rejected — please upload a valid card</span>
              </div>
            )}

            {certs.some(c => c.date || certDocs[c.key]) && (
              <div className="border-t border-[#E2E6EA] pt-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {certs.filter(c => c.date || certDocs[c.key]).map(c => {
                    const d = c.date ? new Date(c.date) : null
                    const expired = d && d < today
                    const expiring = d && !expired && d <= thirtyDays
                    const hasDoc = !!certDocs[c.key]
                    return (
                      <div key={c.key} className={`px-3 py-2 rounded-lg border text-xs ${expired ? 'bg-[#DA3633]/5 border-[#DA3633]/20' : expiring ? 'bg-[#D29922]/5 border-[#D29922]/20' : d ? 'bg-[#2EA043]/5 border-[#2EA043]/20' : 'bg-[#F5F6F8] border-[#E2E6EA]'}`}>
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-[#1A1A2E]">{c.label}</p>
                          {hasDoc && (
                            <a href={certDocs[c.key]} target="_blank" rel="noopener noreferrer" className="text-[#1B6FC8] hover:text-[#1558A0]" title="View uploaded document">
                              <FileText size={13} />
                            </a>
                          )}
                        </div>
                        {d ? (
                          <p className={expired ? 'text-[#DA3633]' : expiring ? 'text-[#D29922]' : 'text-[#2EA043]'}>
                            {expired ? 'Expired ' : expiring ? 'Expiring ' : ''}{d.toLocaleDateString('en-GB')}
                          </p>
                        ) : (
                          <p className="text-[#B0B8C9]">No expiry set</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Audit Log — admins/PMs only */}
        {canEdit && (
          <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm">
            <button onClick={() => setAuditOpen(!auditOpen)} className="flex items-center justify-between w-full px-5 py-3 text-left">
              <p className="text-xs font-semibold text-[#6B7A99] flex items-center gap-1.5"><Clock size={12} /> Recent Changes</p>
              {auditOpen ? <ChevronDown size={16} className="text-[#B0B8C9]" /> : <ChevronRight size={16} className="text-[#B0B8C9]" />}
            </button>
            {auditOpen && (
              <div className="px-5 pb-4">
                {auditLog.length === 0 ? (
                  <p className="text-xs text-[#B0B8C9]">No changes recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {auditLog.map(entry => (
                      <div key={entry.id} className="flex items-start gap-3 text-xs py-1.5 border-b border-[#F5F6F8] last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[#1A1A2E]">
                            {entry.field_name === 'ni_number_changed' ? 'NI Number changed' : (
                              <>
                                <span className="text-[#6B7A99]">{entry.field_name.replace(/_/g, ' ')}</span>
                                {entry.old_value && <> from <span className="text-[#DA3633] line-through">{entry.old_value}</span></>}
                                {entry.new_value && <> to <span className="text-[#2EA043]">{entry.new_value}</span></>}
                              </>
                            )}
                          </p>
                          <p className="text-[#B0B8C9] mt-0.5">
                            {entry.edited_by} ({entry.editor_role}) · {new Date(entry.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Card" className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white hover:bg-white/20"><X size={24} /></button>
        </div>
      )}
    </div>
  )
}
