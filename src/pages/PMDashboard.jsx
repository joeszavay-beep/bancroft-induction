import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import LoadingButton from '../components/LoadingButton'
import {
  Home, FolderOpen, Users, Globe, LogOut, Plus, Trash2, Upload,
  FileText, UserPlus, ChevronRight, CheckCircle2, Clock, AlertCircle, Download,
  RefreshCw, Mail, Settings, Bell, ShieldCheck, FileWarning, ClipboardList, ArrowLeft
} from 'lucide-react'
import { generateSignOffSheet } from '../lib/generateSignOffSheet'
import { generateAuditReport } from '../lib/generateAuditReport'

const TABS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'projects', label: 'Projects', icon: FolderOpen },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'portal', label: 'Portal', icon: Globe },
  { id: 'hsreport', label: 'H&S', icon: ClipboardList },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function PMDashboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('home')
  const [projects, setProjects] = useState([])
  const [operatives, setOperatives] = useState([])
  const [documents, setDocuments] = useState([])
  const [signatures, setSignatures] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (sessionStorage.getItem('pm_auth') !== 'true') {
      navigate('/pm-login')
      return
    }
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [p, o, d, s] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('operatives').select('*').order('name'),
      supabase.from('documents').select('*').order('created_at', { ascending: false }),
      supabase.from('signatures').select('*').order('signed_at', { ascending: false }),
    ])
    setProjects(p.data || [])
    setOperatives(o.data || [])
    setDocuments(d.data || [])
    setSignatures(s.data || [])
    setLoading(false)
  }

  const handleLogout = () => {
    sessionStorage.removeItem('pm_auth')
    navigate('/')
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-navy-950">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-navy-950 flex flex-col">
      {/* Header */}
      <header className="bg-navy-900 border-b border-navy-700 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {tab !== 'home' && (
            <button onClick={() => setTab('home')} className="p-1 text-gray-400 hover:text-white transition-colors">
              <ArrowLeft size={22} />
            </button>
          )}
          <button onClick={() => setTab('home')}>
            <img src="/bancroft-logo.png" alt="Bancroft" className="h-8" />
          </button>
          <p className="text-xs text-gray-400">Project Manager</p>
        </div>
        <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-white transition-colors">
          <LogOut size={20} />
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        {tab === 'home' && <HomeTab projects={projects} operatives={operatives} documents={documents} signatures={signatures} onNavigate={setTab} />}
        {tab === 'projects' && <ProjectsTab projects={projects} documents={documents} operatives={operatives} signatures={signatures} onRefresh={loadData} />}
        {tab === 'team' && <TeamTab operatives={operatives} projects={projects} onRefresh={loadData} />}
        {tab === 'portal' && <PortalTab projects={projects} navigate={navigate} />}
        {tab === 'hsreport' && <HSReportTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-navy-900 border-t border-navy-700 flex z-40">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center py-3 text-xs transition-colors ${
              tab === t.id ? 'text-accent' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <t.icon size={20} />
            <span className="mt-1">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

/* ==================== HOME TAB ==================== */
function HomeTab({ projects, operatives, documents, signatures, onNavigate }) {
  const stats = [
    { label: 'Projects', value: projects.length, icon: FolderOpen, color: 'text-accent', tab: 'projects' },
    { label: 'Operatives', value: operatives.length, icon: Users, color: 'text-accent-light', tab: 'team' },
    { label: 'Documents', value: documents.length, icon: FileText, color: 'text-warning', tab: 'projects' },
    { label: 'Signatures', value: signatures.length, icon: CheckCircle2, color: 'text-success', tab: 'portal' },
  ]

  const recentSigs = signatures.slice(0, 5)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-4">Dashboard</h2>
        <div className="grid grid-cols-2 gap-3">
          {stats.map(s => (
            <button
              key={s.label}
              onClick={() => onNavigate(s.tab)}
              className="bg-navy-800 border border-navy-600 rounded-xl p-4 text-left hover:border-accent/50 active:scale-[0.97] transition-all"
            >
              <s.icon size={20} className={s.color} />
              <p className="text-2xl font-bold text-white mt-2">{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </button>
          ))}
        </div>
      </div>

      {recentSigs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent Sign-Offs</h3>
          <div className="space-y-2">
            {recentSigs.map(sig => (
              <div key={sig.id} className="bg-navy-800 border border-navy-600 rounded-lg p-3 flex items-center gap-3">
                <CheckCircle2 size={16} className="text-success shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{sig.operative_name}</p>
                  <p className="text-xs text-gray-400">{new Date(sig.signed_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ==================== PROJECTS TAB ==================== */
function ProjectsTab({ projects, documents, operatives, signatures, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showUpload, setShowUpload] = useState(null) // project id
  const [showUpdateDoc, setShowUpdateDoc] = useState(null) // document to update
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(null)
  const [exportingAudit, setExportingAudit] = useState(null)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [uploadFile, setUploadFile] = useState(null)
  const [docTitle, setDocTitle] = useState('')
  const [expandedProject, setExpandedProject] = useState(null)

  async function addProject(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    const { error } = await supabase.from('projects').insert({ name: name.trim(), location: location.trim() })
    setSaving(false)
    if (error) {
      console.error('Add project error:', error)
      toast.error(`Failed to add project: ${error.message}`)
      return
    }
    toast.success('Project added')
    setShowAdd(false)
    setName('')
    setLocation('')
    onRefresh()
  }

  async function uploadDocument(e) {
    e.preventDefault()
    if (!uploadFile || !docTitle.trim()) return
    setSaving(true)
    const fileExt = uploadFile.name.split('.').pop()
    const filePath = `${showUpload}/${Date.now()}.${fileExt}`
    const { error: upErr } = await supabase.storage.from('documents').upload(filePath, uploadFile)
    if (upErr) {
      setSaving(false)
      toast.error('Failed to upload file')
      return
    }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)
    const { error: dbErr } = await supabase.from('documents').insert({
      project_id: showUpload,
      title: docTitle.trim(),
      file_url: urlData.publicUrl,
      file_name: uploadFile.name,
    })
    setSaving(false)
    if (dbErr) {
      toast.error('Failed to save document record')
      return
    }
    toast.success('Document uploaded')
    setShowUpload(null)
    setDocTitle('')
    setUploadFile(null)
    onRefresh()
  }

  async function deleteProject(id) {
    if (!confirm('Delete this project and all its documents?')) return
    await supabase.from('documents').delete().eq('project_id', id)
    await supabase.from('signatures').delete().eq('project_id', id)
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) {
      toast.error('Failed to delete project')
      return
    }
    toast.success('Project deleted')
    onRefresh()
  }

  async function deleteDocument(id) {
    const { error } = await supabase.from('documents').delete().eq('id', id)
    if (error) {
      toast.error('Failed to delete document')
      return
    }
    toast.success('Document deleted')
    onRefresh()
  }

  async function updateDocument(e) {
    e.preventDefault()
    if (!uploadFile || !showUpdateDoc) return
    setSaving(true)
    const fileExt = uploadFile.name.split('.').pop()
    const filePath = `${showUpdateDoc.project_id}/${Date.now()}.${fileExt}`
    const { error: upErr } = await supabase.storage.from('documents').upload(filePath, uploadFile)
    if (upErr) {
      setSaving(false)
      toast.error('Failed to upload file')
      return
    }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)
    // Update document with new file and increment version
    const { error: dbErr } = await supabase.from('documents').update({
      file_url: urlData.publicUrl,
      file_name: uploadFile.name,
      version: (showUpdateDoc.version || 1) + 1,
    }).eq('id', showUpdateDoc.id)
    if (dbErr) {
      setSaving(false)
      toast.error('Failed to update document')
      return
    }
    // Invalidate all existing signatures for this document
    await supabase.from('signatures').update({ invalidated: true }).eq('document_id', showUpdateDoc.id)
    setSaving(false)
    toast.success('Document updated — operatives flagged to re-sign')
    setShowUpdateDoc(null)
    setUploadFile(null)
    onRefresh()
  }

  async function handleAuditExport(project) {
    setExportingAudit(project.id)
    try {
      const projDocs = documents.filter(d => d.project_id === project.id)
      const projOps = operatives.filter(o => o.project_id === project.id)
      const projSigs = signatures.filter(s => s.project_id === project.id)
      await generateAuditReport({
        project,
        documents: projDocs,
        operatives: projOps,
        signatures: projSigs,
      })
      toast.success('Audit report downloaded')
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate audit report')
    }
    setExportingAudit(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Projects</h2>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-2 bg-accent hover:bg-accent-dark text-white text-sm font-medium rounded-lg transition-colors">
          <Plus size={16} /> Add
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FolderOpen size={40} className="mx-auto mb-3 opacity-50" />
          <p>No projects yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(p => {
            const projDocs = documents.filter(d => d.project_id === p.id)
            const projOps = operatives.filter(o => o.project_id === p.id)
            const expanded = expandedProject === p.id
            return (
              <div key={p.id} className="bg-navy-800 border border-navy-600 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedProject(expanded ? null : p.id)}
                  className="w-full flex items-center gap-3 p-4 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold truncate">{p.name}</p>
                    {p.location && <p className="text-xs text-gray-400 truncate">{p.location}</p>}
                    <div className="flex gap-3 mt-1.5">
                      <span className="text-xs text-gray-500">{projDocs.length} doc{projDocs.length !== 1 ? 's' : ''}</span>
                      <span className="text-xs text-gray-500">{projOps.length} operative{projOps.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <ChevronRight size={18} className={`text-gray-500 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                </button>

                {expanded && (
                  <div className="border-t border-navy-600 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-300">Documents</h4>
                      <button onClick={() => { setShowUpload(p.id); setDocTitle(''); setUploadFile(null) }} className="text-xs text-accent hover:underline flex items-center gap-1">
                        <Upload size={12} /> Upload
                      </button>
                    </div>
                    {projDocs.length === 0 ? (
                      <p className="text-xs text-gray-500">No documents uploaded</p>
                    ) : (
                      <div className="space-y-1.5">
                        {projDocs.map(d => {
                          const docSigs = signatures.filter(s => s.document_id === d.id && !s.invalidated)
                          const invalidatedCount = signatures.filter(s => s.document_id === d.id && s.invalidated).length
                          return (
                            <div key={d.id} className="bg-navy-700 rounded-lg px-3 py-2">
                              <div className="flex items-center gap-2">
                                <FileText size={14} className="text-accent shrink-0" />
                                <span className="flex-1 text-sm text-white truncate">{d.title}</span>
                                <span className="text-[10px] text-gray-500 bg-navy-600 px-1.5 py-0.5 rounded">v{d.version || 1}</span>
                                {docSigs.length > 0 && (
                                  <button
                                    disabled={downloading === d.id}
                                    onClick={async () => {
                                      setDownloading(d.id)
                                      try {
                                        await generateSignOffSheet({
                                          projectName: p.name,
                                          documentTitle: d.title,
                                          signatures: docSigs,
                                        })
                                        toast.success(`Sign-off sheet downloaded (${docSigs.length} signatures)`)
                                      } catch (err) {
                                        console.error(err)
                                        toast.error('Failed to generate PDF')
                                      }
                                      setDownloading(null)
                                    }}
                                    className="p-1 text-accent hover:text-accent-light transition-colors"
                                    title="Download sign-off sheet"
                                  >
                                    {downloading === d.id ? (
                                      <div className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <Download size={14} />
                                    )}
                                  </button>
                                )}
                                <button onClick={() => { setShowUpdateDoc(d); setUploadFile(null) }} className="p-1 text-warning hover:text-yellow-400 transition-colors" title="Upload new version">
                                  <RefreshCw size={14} />
                                </button>
                                <span className="text-xs text-gray-500">{docSigs.length} sig{docSigs.length !== 1 ? 's' : ''}</span>
                                <button onClick={() => deleteDocument(d.id)} className="p-1 text-gray-500 hover:text-danger transition-colors">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                              {invalidatedCount > 0 && (
                                <div className="flex items-center gap-1.5 mt-1.5 text-warning">
                                  <FileWarning size={12} />
                                  <span className="text-[11px]">{invalidatedCount} signature{invalidatedCount !== 1 ? 's' : ''} invalidated — operatives must re-sign</span>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {/* Audit trail export */}
                    <button
                      disabled={exportingAudit === p.id}
                      onClick={() => handleAuditExport(p)}
                      className="w-full mt-2 py-2 text-sm text-accent hover:bg-accent/10 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {exportingAudit === p.id ? (
                        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <ShieldCheck size={14} />
                      )}
                      Download Audit Trail
                    </button>
                    <button onClick={() => deleteProject(p.id)} className="w-full py-2 text-sm text-danger hover:bg-danger/10 rounded-lg transition-colors">
                      Delete Project
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add Project Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Project">
        <form onSubmit={addProject} className="space-y-4">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Project name"
            className="w-full px-4 py-3 bg-navy-700 border border-navy-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
            autoFocus
          />
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Location (optional)"
            className="w-full px-4 py-3 bg-navy-700 border border-navy-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          <LoadingButton loading={saving} type="submit" className="w-full bg-accent hover:bg-accent-dark text-white">
            Add Project
          </LoadingButton>
        </form>
      </Modal>

      {/* Upload Document Modal */}
      <Modal open={!!showUpload} onClose={() => setShowUpload(null)} title="Upload Document">
        <form onSubmit={uploadDocument} className="space-y-4">
          <input
            value={docTitle}
            onChange={e => setDocTitle(e.target.value)}
            placeholder="Document title"
            className="w-full px-4 py-3 bg-navy-700 border border-navy-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
            autoFocus
          />
          <div>
            <label className="block w-full px-4 py-3 bg-navy-700 border border-navy-600 border-dashed rounded-lg text-center cursor-pointer hover:border-accent transition-colors">
              <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => setUploadFile(e.target.files[0])} className="hidden" />
              <Upload size={20} className="mx-auto text-gray-400 mb-1" />
              <p className="text-sm text-gray-400">{uploadFile ? uploadFile.name : 'Tap to select file'}</p>
            </label>
          </div>
          <LoadingButton loading={saving} type="submit" className="w-full bg-accent hover:bg-accent-dark text-white">
            Upload
          </LoadingButton>
        </form>
      </Modal>

      {/* Update Document Modal */}
      <Modal open={!!showUpdateDoc} onClose={() => setShowUpdateDoc(null)} title={`Update: ${showUpdateDoc?.title}`}>
        <form onSubmit={updateDocument} className="space-y-4">
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-warning mb-1">
              <FileWarning size={16} />
              <span className="text-sm font-semibold">Version Control Warning</span>
            </div>
            <p className="text-xs text-gray-400">
              Uploading a new version will <strong className="text-white">invalidate all existing signatures</strong> for this document.
              All operatives will be flagged to re-sign.
            </p>
          </div>
          <p className="text-sm text-gray-400">Current version: <span className="text-white font-medium">v{showUpdateDoc?.version || 1}</span> → New version: <span className="text-accent font-medium">v{(showUpdateDoc?.version || 1) + 1}</span></p>
          <div>
            <label className="block w-full px-4 py-3 bg-navy-700 border border-navy-600 border-dashed rounded-lg text-center cursor-pointer hover:border-accent transition-colors">
              <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => setUploadFile(e.target.files[0])} className="hidden" />
              <Upload size={20} className="mx-auto text-gray-400 mb-1" />
              <p className="text-sm text-gray-400">{uploadFile ? uploadFile.name : 'Tap to select new file'}</p>
            </label>
          </div>
          <LoadingButton loading={saving} type="submit" className="w-full bg-warning hover:bg-yellow-600 text-black font-semibold">
            Update Document & Invalidate Signatures
          </LoadingButton>
        </form>
      </Modal>
    </div>
  )
}

/* ==================== TEAM TAB ==================== */
function TeamTab({ operatives, projects, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(null)
  const [name, setName] = useState('')
  const [projectId, setProjectId] = useState('')
  const [mobile, setMobile] = useState('')
  const [email, setEmail] = useState('')

  async function addOperative(e) {
    e.preventDefault()
    if (!name.trim() || !projectId) return
    setSaving(true)
    const { error } = await supabase.from('operatives').insert({
      name: name.trim(),
      project_id: projectId,
      mobile: mobile.trim() || null,
      email: email.trim() || null,
    })
    setSaving(false)
    if (error) {
      toast.error('Failed to add operative')
      return
    }
    toast.success('Operative added')
    setShowAdd(false)
    setName('')
    setProjectId('')
    setMobile('')
    setEmail('')
    onRefresh()
  }

  async function removeOperative(id) {
    if (!confirm('Remove this operative?')) return
    await supabase.from('signatures').delete().eq('operative_id', id)
    const { error } = await supabase.from('operatives').delete().eq('id', id)
    if (error) {
      toast.error('Failed to remove operative')
      return
    }
    toast.success('Operative removed')
    onRefresh()
  }

  async function handlePhotoUpload(opId, file) {
    if (!file) return
    setUploadingPhoto(opId)
    const filePath = `photos/${opId}_${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage.from('documents').upload(filePath, file, { contentType: file.type })
    if (upErr) {
      setUploadingPhoto(null)
      toast.error('Failed to upload photo')
      return
    }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)
    const { error: dbErr } = await supabase.from('operatives').update({ photo_url: urlData.publicUrl }).eq('id', opId)
    setUploadingPhoto(null)
    if (dbErr) {
      toast.error('Failed to save photo')
      return
    }
    toast.success('Photo updated')
    onRefresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Team</h2>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-2 bg-accent hover:bg-accent-dark text-white text-sm font-medium rounded-lg transition-colors">
          <UserPlus size={16} /> Add
        </button>
      </div>

      {operatives.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Users size={40} className="mx-auto mb-3 opacity-50" />
          <p>No operatives yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {operatives.map(op => {
            const proj = projects.find(p => p.id === op.project_id)
            return (
              <div key={op.id} className="bg-navy-800 border border-navy-600 rounded-xl p-4 flex items-center gap-3">
                <label className="relative w-12 h-12 rounded-full shrink-0 cursor-pointer group">
                  {op.photo_url ? (
                    <img src={op.photo_url} alt={op.name} className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center">
                      <span className="text-accent font-semibold">{op.name.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploadingPhoto === op.id ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Upload size={16} className="text-white" />
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={e => handlePhotoUpload(op.id, e.target.files[0])}
                  />
                </label>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{op.name}</p>
                  <p className="text-xs text-gray-400 truncate">{proj ? proj.name : 'Unassigned'}</p>
                  {(op.mobile || op.email) && (
                    <p className="text-[11px] text-gray-500 truncate mt-0.5">
                      {op.mobile}{op.mobile && op.email ? ' · ' : ''}{op.email}
                    </p>
                  )}
                  {!op.date_of_birth && (
                    <p className="text-[11px] text-warning mt-0.5">Profile incomplete</p>
                  )}
                </div>
                <button onClick={() => removeOperative(op.id)} className="p-2 text-gray-500 hover:text-danger transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Operative Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Operative">
        <form onSubmit={addOperative} className="space-y-4">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Full name"
            className="w-full px-4 py-3 bg-navy-700 border border-navy-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
            autoFocus
          />
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="w-full px-4 py-3 bg-navy-700 border border-navy-600 rounded-lg text-white focus:outline-none focus:border-accent"
          >
            <option value="">Select site</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input
            type="tel"
            value={mobile}
            onChange={e => setMobile(e.target.value)}
            placeholder="Mobile number"
            className="w-full px-4 py-3 bg-navy-700 border border-navy-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email address"
            className="w-full px-4 py-3 bg-navy-700 border border-navy-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          <p className="text-xs text-gray-500">The operative will complete their full profile (DOB, NI, address, next of kin) themselves.</p>
          <LoadingButton loading={saving} type="submit" className="w-full bg-accent hover:bg-accent-dark text-white">
            Add Operative
          </LoadingButton>
        </form>
      </Modal>
    </div>
  )
}

/* ==================== PORTAL TAB ==================== */
function PortalTab({ projects, navigate }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Portal</h2>
      <p className="text-sm text-gray-400">Select a project to view its sign-off record.</p>

      {projects.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Globe size={40} className="mx-auto mb-3 opacity-50" />
          <p>No projects yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => navigate(`/portal/${p.id}`)}
              className="w-full flex items-center gap-3 bg-navy-800 border border-navy-600 rounded-xl p-4 hover:border-accent/50 transition-colors text-left"
            >
              <FolderOpen size={20} className="text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{p.name}</p>
                {p.location && <p className="text-xs text-gray-400 truncate">{p.location}</p>}
              </div>
              <ChevronRight size={18} className="text-gray-500" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ==================== SETTINGS TAB ==================== */
function SettingsTab() {
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    const { data } = await supabase.from('settings').select('*').eq('key', 'pm_email').single()
    if (data) setEmail(data.value)
    setLoaded(true)
  }

  async function saveEmail(e) {
    e.preventDefault()
    if (!email.trim()) return
    setSaving(true)
    const { error } = await supabase.from('settings').upsert({
      key: 'pm_email',
      value: email.trim(),
    }, { onConflict: 'key' })
    setSaving(false)
    if (error) {
      toast.error('Failed to save email')
      return
    }
    toast.success('Notification email saved')
  }

  if (!loaded) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Settings</h2>

      <div className="bg-navy-800 border border-navy-600 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center shrink-0">
            <Mail size={20} className="text-accent" />
          </div>
          <div>
            <p className="text-white font-semibold">Email Notifications</p>
            <p className="text-xs text-gray-400">Get notified when an operative completes all their documents</p>
          </div>
        </div>

        <form onSubmit={saveEmail} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full px-4 py-3 bg-navy-700 border border-navy-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          <LoadingButton loading={saving} type="submit" className="w-full bg-accent hover:bg-accent-dark text-white">
            Save Email
          </LoadingButton>
        </form>
      </div>

      <div className="bg-navy-800 border border-navy-600 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center shrink-0">
            <ShieldCheck size={20} className="text-accent" />
          </div>
          <div>
            <p className="text-white font-semibold">Security Features</p>
            <p className="text-xs text-gray-400">Active on all sign-offs</p>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-gray-300">
            <CheckCircle2 size={14} className="text-success" />
            DOB identity verification on sign-off
          </div>
          <div className="flex items-center gap-2 text-gray-300">
            <CheckCircle2 size={14} className="text-success" />
            IP address captured with every signature
          </div>
          <div className="flex items-center gap-2 text-gray-300">
            <CheckCircle2 size={14} className="text-success" />
            Document version control with re-sign flags
          </div>
          <div className="flex items-center gap-2 text-gray-300">
            <CheckCircle2 size={14} className="text-success" />
            In-app PDF viewer — operatives must read before signing
          </div>
        </div>
      </div>
    </div>
  )
}

/* ==================== H&S REPORT TAB ==================== */
function HSReportTab() {
  return (
    <div className="space-y-4 -mx-4 -mt-4">
      <iframe
        src="/hs-report.html"
        className="w-full border-0"
        style={{ height: 'calc(100dvh - 120px)' }}
        title="H&S Report Generator"
      />
    </div>
  )
}
