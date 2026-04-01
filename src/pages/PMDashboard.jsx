import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import LoadingButton from '../components/LoadingButton'
import {
  Home, FolderOpen, Users, Globe, LogOut, Plus, Trash2, Upload,
  FileText, UserPlus, ChevronRight, CheckCircle2, Clock, AlertCircle, Download,
  RefreshCw, Mail, Settings, Bell, ShieldCheck, FileWarning, ClipboardList, ArrowLeft,
  MessageSquare, MapPin
} from 'lucide-react'
import { generateSignOffSheet } from '../lib/generateSignOffSheet'
import { generateAuditReport } from '../lib/generateAuditReport'
import { generateArchivePDF } from '../lib/generateArchivePDF'
import SnagDetail from '../components/SnagDetail'
import { generateSnagPDF } from '../lib/generateSnagPDF'
import { generateToolboxPDF } from '../lib/generateToolboxPDF'

const TABS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'projects', label: 'Projects', icon: FolderOpen },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'snags', label: 'Snags', icon: MapPin },
  { id: 'toolbox', label: 'Toolbox', icon: MessageSquare },
  { id: 'portal', label: 'Portal', icon: Globe },
  { id: 'hsreport', label: 'H&S', icon: ClipboardList },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function PMDashboard({ initialTab }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState(initialTab || 'home')
  const [projects, setProjects] = useState([])
  const [operatives, setOperatives] = useState([])
  const [documents, setDocuments] = useState([])
  const [signatures, setSignatures] = useState([])
  const [loading, setLoading] = useState(true)

  const managerData = JSON.parse(sessionStorage.getItem('manager_data') || '{}')
  const managerProjectIds = managerData.project_ids || []
  const isAdmin = managerData.role === 'admin'

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const cid = managerData.company_id
    const [p, o, d, s] = await Promise.all([
      cid ? supabase.from('projects').select('*').eq('company_id', cid).order('created_at', { ascending: false }) : supabase.from('projects').select('*').order('created_at', { ascending: false }),
      cid ? supabase.from('operatives').select('*').eq('company_id', cid).order('name') : supabase.from('operatives').select('*').order('name'),
      cid ? supabase.from('documents').select('*').eq('company_id', cid).order('created_at', { ascending: false }) : supabase.from('documents').select('*').order('created_at', { ascending: false }),
      cid ? supabase.from('signatures').select('*').eq('company_id', cid).order('signed_at', { ascending: false }) : supabase.from('signatures').select('*').order('signed_at', { ascending: false }),
    ])

    let filteredProjects = p.data || []
    // Filter projects if manager has restricted access
    if (!isAdmin && managerProjectIds.length > 0) {
      filteredProjects = filteredProjects.filter(proj => managerProjectIds.includes(proj.id))
    }
    const projectIds = new Set(filteredProjects.map(proj => proj.id))

    setProjects(filteredProjects)
    setOperatives((o.data || []).filter(op => !op.project_id || projectIds.has(op.project_id)))
    setDocuments((d.data || []).filter(doc => projectIds.has(doc.project_id)))
    setSignatures((s.data || []).filter(sig => projectIds.has(sig.project_id)))
    setLoading(false)
  }

  const handleLogout = () => {
    sessionStorage.removeItem('pm_auth')
    sessionStorage.removeItem('manager_data')
    navigate('/')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-[#1B6FC8] border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div>
      {tab === 'home' && <HomeTab projects={projects} operatives={operatives} documents={documents} signatures={signatures} onNavigate={setTab} />}
      {tab === 'projects' && <ProjectsTab projects={projects} documents={documents} operatives={operatives} signatures={signatures} onRefresh={loadData} />}
      {tab === 'team' && <TeamTab operatives={operatives} projects={projects} onRefresh={loadData} />}
      {tab === 'snags' && <SnagsTab projects={projects} navigate={navigate} />}
      {tab === 'toolbox' && <ToolboxTab projects={projects} navigate={navigate} />}
      {tab === 'portal' && <PortalTab projects={projects} navigate={navigate} />}
      {tab === 'hsreport' && <HSReportTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  )
}

/* ==================== HOME TAB ==================== */
function HomeTab({ projects, operatives, documents, signatures, onNavigate }) {
  const stats = [
    { label: 'Projects', value: projects.length, icon: FolderOpen, color: 'text-blue-500', tab: 'projects' },
    { label: 'Operatives', value: operatives.length, icon: Users, color: 'text-blue-400', tab: 'team' },
    { label: 'Documents', value: documents.length, icon: FileText, color: 'text-warning', tab: 'projects' },
    { label: 'Signatures', value: signatures.length, icon: CheckCircle2, color: 'text-success', tab: 'portal' },
  ]

  // Needs attention: operatives with unsigned documents
  const now = Date.now()
  const needsAttention = operatives
    .filter(op => op.project_id)
    .map(op => {
      const projDocs = documents.filter(d => d.project_id === op.project_id)
      const validSigs = signatures.filter(s => s.operative_id === op.id && !s.invalidated)
      const signedDocIds = new Set(validSigs.map(s => s.document_id))
      const unsignedDocs = projDocs.filter(d => !signedDocIds.has(d.id))
      const project = projects.find(p => p.id === op.project_id)

      // Check if operative was created more than 24 hours ago with pending docs
      const createdAt = new Date(op.created_at).getTime()
      const overdue = unsignedDocs.length > 0 && (now - createdAt > 24 * 60 * 60 * 1000)

      return {
        ...op,
        projectName: project?.name || 'Unknown',
        totalDocs: projDocs.length,
        pendingDocs: unsignedDocs.length,
        overdue,
      }
    })
    .filter(op => op.pendingDocs > 0)
    .sort((a, b) => b.overdue - a.overdue || b.pendingDocs - a.pendingDocs)

  // Recent activity: last 10 signatures
  const recentActivity = signatures
    .filter(s => !s.invalidated)
    .slice(0, 10)
    .map(sig => {
      const project = projects.find(p => p.id === sig.project_id)
      return { ...sig, projectName: project?.name || 'Unknown' }
    })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Dashboard</h2>
        <div className="grid grid-cols-2 gap-3">
          {stats.map(s => (
            <button
              key={s.label}
              onClick={() => onNavigate(s.tab)}
              className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-blue-400/50 active:scale-[0.97] transition-all"
            >
              <s.icon size={20} className={s.color} />
              <p className="text-2xl font-bold text-slate-900 mt-2">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Needs Attention */}
      {needsAttention.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={16} className="text-warning" />
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Needs Attention</h3>
            <span className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded-full font-semibold">{needsAttention.length}</span>
          </div>
          <div className="space-y-2">
            {needsAttention.map(op => (
              <div key={op.id} className={`bg-white border rounded-xl p-3.5 flex items-center gap-3 ${op.overdue ? 'border-danger/40' : 'border-slate-200'}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${op.overdue ? 'bg-danger/15' : 'bg-warning/15'}`}>
                  {op.photo_url ? (
                    <img src={op.photo_url} alt={op.name} className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <span className={`font-bold text-sm ${op.overdue ? 'text-danger' : 'text-warning'}`}>{op.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-slate-900 font-medium truncate">{op.name}</p>
                    {op.overdue && (
                      <span className="text-[10px] bg-danger/20 text-danger px-1.5 py-0.5 rounded font-semibold shrink-0">OVERDUE</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{op.projectName}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${op.overdue ? 'text-danger' : 'text-warning'}`}>{op.pendingDocs}</p>
                  <p className="text-[10px] text-slate-400">pending</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Recent Activity</h3>
          </div>
          <div className="space-y-2">
            {recentActivity.map(sig => {
              const signedDate = new Date(sig.signed_at)
              const diffMs = now - signedDate.getTime()
              const diffMins = Math.floor(diffMs / 60000)
              const diffHours = Math.floor(diffMs / 3600000)
              const diffDays = Math.floor(diffMs / 86400000)
              let timeAgo
              if (diffMins < 1) timeAgo = 'Just now'
              else if (diffMins < 60) timeAgo = `${diffMins}m ago`
              else if (diffHours < 24) timeAgo = `${diffHours}h ago`
              else timeAgo = `${diffDays}d ago`

              return (
                <div key={sig.id} className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center gap-3">
                  <div className="w-8 h-8 bg-success/10 rounded-full flex items-center justify-center shrink-0">
                    <CheckCircle2 size={14} className="text-success" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 truncate">
                      <span className="font-medium">{sig.operative_name}</span>
                      <span className="text-slate-400"> signed </span>
                      <span className="text-slate-600">{sig.document_title}</span>
                    </p>
                    <p className="text-xs text-slate-400 truncate">{sig.projectName}</p>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">{timeAgo}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ==================== PROJECTS TAB ==================== */
function ProjectsTab({ projects, documents, operatives, signatures, onRefresh }) {
  const cid = JSON.parse(sessionStorage.getItem('manager_data') || '{}').company_id
  const [showAdd, setShowAdd] = useState(false)
  const [showUpload, setShowUpload] = useState(null) // project id
  const [showUpdateDoc, setShowUpdateDoc] = useState(null) // document to update
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(null)
  const [exportingAudit, setExportingAudit] = useState(null)
  const [archivingProject, setArchivingProject] = useState(null)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [uploadFile, setUploadFile] = useState(null)
  const [docTitle, setDocTitle] = useState('')
  const [expandedProject, setExpandedProject] = useState(null)

  async function addProject(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    const { error } = await supabase.from('projects').insert({ name: name.trim(), location: location.trim(), company_id: cid })
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
      company_id: cid,
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

  async function handleArchive(project) {
    setArchivingProject(project.id)
    try {
      const projOps = operatives.filter(o => o.project_id === project.id)
      const projDocs = documents.filter(d => d.project_id === project.id)
      const projSigs = signatures.filter(s => s.project_id === project.id)

      // Fetch toolbox talks and signatures for this project
      const { data: talks } = await supabase.from('toolbox_talks').select('*').eq('project_id', project.id).order('created_at')
      const talkIds = (talks || []).map(t => t.id)
      let talkSigs = []
      if (talkIds.length > 0) {
        const { data: ts } = await supabase.from('toolbox_signatures').select('*').in('talk_id', talkIds).order('signed_at')
        talkSigs = ts || []
      }

      // Fetch snags and drawings for this project
      const { data: drws } = await supabase.from('drawings').select('*').eq('project_id', project.id)
      const { data: sngs } = await supabase.from('snags').select('*').eq('project_id', project.id).order('snag_number')

      await generateArchivePDF({
        project,
        operatives: projOps,
        documents: projDocs,
        signatures: projSigs,
        toolboxTalks: talks || [],
        toolboxSignatures: talkSigs,
        snags: sngs || [],
        drawings: drws || [],
      })
      toast.success('H&S Archive downloaded')
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate archive')
    }
    setArchivingProject(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Projects</h2>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus size={16} /> Add
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
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
              <div key={p.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedProject(expanded ? null : p.id)}
                  className="w-full flex items-center gap-3 p-4 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-900 font-semibold truncate">{p.name}</p>
                    {p.location && <p className="text-xs text-slate-500 truncate">{p.location}</p>}
                    <div className="flex gap-3 mt-1.5">
                      <span className="text-xs text-slate-400">{projDocs.length} doc{projDocs.length !== 1 ? 's' : ''}</span>
                      <span className="text-xs text-slate-400">{projOps.length} operative{projOps.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <ChevronRight size={18} className={`text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                </button>

                {expanded && (
                  <div className="border-t border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-600">Documents</h4>
                      <button onClick={() => { setShowUpload(p.id); setDocTitle(''); setUploadFile(null) }} className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                        <Upload size={12} /> Upload
                      </button>
                    </div>
                    {projDocs.length === 0 ? (
                      <p className="text-xs text-slate-400">No documents uploaded</p>
                    ) : (
                      <div className="space-y-1.5">
                        {projDocs.map(d => {
                          const docSigs = signatures.filter(s => s.document_id === d.id && !s.invalidated)
                          const invalidatedCount = signatures.filter(s => s.document_id === d.id && s.invalidated).length
                          return (
                            <div key={d.id} className="bg-slate-50 rounded-lg px-3 py-2">
                              <div className="flex items-center gap-2">
                                <FileText size={14} className="text-blue-500 shrink-0" />
                                <span className="flex-1 text-sm text-slate-900 truncate">{d.title}</span>
                                <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">v{d.version || 1}</span>
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
                                    className="p-1 text-blue-500 hover:text-blue-400 transition-colors"
                                    title="Download sign-off sheet"
                                  >
                                    {downloading === d.id ? (
                                      <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <Download size={14} />
                                    )}
                                  </button>
                                )}
                                <button onClick={() => { setShowUpdateDoc(d); setUploadFile(null) }} className="p-1 text-warning hover:text-yellow-400 transition-colors" title="Upload new version">
                                  <RefreshCw size={14} />
                                </button>
                                <span className="text-xs text-slate-400">{docSigs.length} sig{docSigs.length !== 1 ? 's' : ''}</span>
                                <button onClick={() => deleteDocument(d.id)} className="p-1 text-slate-400 hover:text-danger transition-colors">
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
                      className="w-full mt-2 py-2 text-sm text-blue-500 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {exportingAudit === p.id ? (
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <ShieldCheck size={14} />
                      )}
                      Download Audit Trail
                    </button>
                    <button
                      disabled={archivingProject === p.id}
                      onClick={() => handleArchive(p)}
                      className="w-full py-2 text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center justify-center gap-2 font-medium"
                    >
                      {archivingProject === p.id ? (
                        <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                      Archive Full H&S Pack
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
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
            autoFocus
          />
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Location (optional)"
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
          />
          <LoadingButton loading={saving} type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white">
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
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
            autoFocus
          />
          <div>
            <label className="block w-full px-4 py-3 bg-white border border-slate-200 border-dashed rounded-lg text-center cursor-pointer hover:border-blue-400 transition-colors">
              <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => setUploadFile(e.target.files[0])} className="hidden" />
              <Upload size={20} className="mx-auto text-slate-400 mb-1" />
              <p className="text-sm text-slate-500">{uploadFile ? uploadFile.name : 'Tap to select file'}</p>
            </label>
          </div>
          <LoadingButton loading={saving} type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white">
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
            <p className="text-xs text-slate-500">
              Uploading a new version will <strong className="text-slate-900">invalidate all existing signatures</strong> for this document.
              All operatives will be flagged to re-sign.
            </p>
          </div>
          <p className="text-sm text-slate-500">Current version: <span className="text-slate-900 font-medium">v{showUpdateDoc?.version || 1}</span> → New version: <span className="text-blue-500 font-medium">v{(showUpdateDoc?.version || 1) + 1}</span></p>
          <div>
            <label className="block w-full px-4 py-3 bg-white border border-slate-200 border-dashed rounded-lg text-center cursor-pointer hover:border-blue-400 transition-colors">
              <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => setUploadFile(e.target.files[0])} className="hidden" />
              <Upload size={20} className="mx-auto text-slate-400 mb-1" />
              <p className="text-sm text-slate-500">{uploadFile ? uploadFile.name : 'Tap to select new file'}</p>
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
  const cid = JSON.parse(sessionStorage.getItem('manager_data') || '{}').company_id
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
    const { data, error } = await supabase.from('operatives').insert({
      name: name.trim(),
      project_id: projectId,
      mobile: mobile.trim() || null,
      email: email.trim() || null,
      company_id: cid,
    }).select().single()
    if (error) {
      setSaving(false)
      toast.error('Failed to add operative')
      return
    }
    // Send invite email/SMS
    if (data && (email.trim() || mobile.trim())) {
      const proj = projects.find(p => p.id === projectId)
      await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operativeId: data.id,
          operativeName: name.trim(),
          email: email.trim() || null,
          mobile: mobile.trim() || null,
          projectName: proj?.name || '',
        }),
      }).catch(() => {})
    }
    setSaving(false)
    toast.success(email.trim() ? 'Operative added — invite sent' : 'Operative added')
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
        <h2 className="text-xl font-bold text-slate-900">Team</h2>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
          <UserPlus size={16} /> Add
        </button>
      </div>

      {operatives.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Users size={40} className="mx-auto mb-3 opacity-50" />
          <p>No operatives yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {operatives.map(op => {
            const proj = projects.find(p => p.id === op.project_id)
            return (
              <div key={op.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                <label className="relative w-12 h-12 rounded-full shrink-0 cursor-pointer group">
                  {op.photo_url ? (
                    <img src={op.photo_url} alt={op.name} className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
                      <span className="text-blue-500 font-semibold">{op.name.charAt(0).toUpperCase()}</span>
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
                  <p className="text-slate-900 font-medium truncate">{op.name}</p>
                  <p className="text-xs text-slate-500 truncate">{proj ? proj.name : 'Unassigned'}</p>
                  {(op.mobile || op.email) && (
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {op.mobile}{op.mobile && op.email ? ' · ' : ''}{op.email}
                    </p>
                  )}
                  {!op.date_of_birth && (
                    <p className="text-[11px] text-warning mt-0.5">Profile incomplete</p>
                  )}
                </div>
                <button onClick={() => removeOperative(op.id)} className="p-2 text-slate-400 hover:text-danger transition-colors">
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
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
            autoFocus
          />
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
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
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
          />
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email address"
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
          />
          <p className="text-xs text-slate-400">The operative will complete their full profile (DOB, NI, address, next of kin) themselves.</p>
          <LoadingButton loading={saving} type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white">
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
      <h2 className="text-xl font-bold text-slate-900">Portal</h2>
      <p className="text-sm text-slate-500">Select a project to view its sign-off record.</p>

      {projects.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Globe size={40} className="mx-auto mb-3 opacity-50" />
          <p>No projects yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => navigate(`/portal/${p.id}`)}
              className="w-full flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-400/50 transition-colors text-left"
            >
              <FolderOpen size={20} className="text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 font-medium truncate">{p.name}</p>
                {p.location && <p className="text-xs text-slate-500 truncate">{p.location}</p>}
              </div>
              <ChevronRight size={18} className="text-slate-400" />
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
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-900">Settings</h2>

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
            <Mail size={20} className="text-blue-500" />
          </div>
          <div>
            <p className="text-slate-900 font-semibold">Email Notifications</p>
            <p className="text-xs text-slate-500">Get notified when an operative completes all their documents</p>
          </div>
        </div>

        <form onSubmit={saveEmail} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
          />
          <LoadingButton loading={saving} type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white">
            Save Email
          </LoadingButton>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
            <ShieldCheck size={20} className="text-blue-500" />
          </div>
          <div>
            <p className="text-slate-900 font-semibold">Security Features</p>
            <p className="text-xs text-slate-500">Active on all sign-offs</p>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-slate-600">
            <CheckCircle2 size={14} className="text-success" />
            DOB identity verification on sign-off
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <CheckCircle2 size={14} className="text-success" />
            IP address captured with every signature
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <CheckCircle2 size={14} className="text-success" />
            Document version control with re-sign flags
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <CheckCircle2 size={14} className="text-success" />
            In-app PDF viewer — operatives must read before signing
          </div>
        </div>
      </div>
    </div>
  )
}

/* ==================== SNAGS TAB ==================== */
function SnagsTab({ projects, navigate }) {
  const cid = JSON.parse(sessionStorage.getItem('manager_data') || '{}').company_id
  const [drawings, setDrawings] = useState([])
  const [allSnags, setAllSnags] = useState([])
  const [allOperatives, setAllOperatives] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedDrawing, setExpandedDrawing] = useState(null)
  const [selectedSnag, setSelectedSnag] = useState(null)
  const [selectedDrawing, setSelectedDrawing] = useState(null)
  const [exportingDrawing, setExportingDrawing] = useState(null)
  const [checkedSnags, setCheckedSnags] = useState(new Set())
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignTo, setAssignTo] = useState('')
  const [assignEmail, setAssignEmail] = useState('')
  const [assigning, setAssigning] = useState(false)

  // Filters
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterDrawing, setFilterDrawing] = useState('all')
  const [filterSnagNo, setFilterSnagNo] = useState('')

  // Upload form
  const [drawingName, setDrawingName] = useState('')
  const [levelRef, setLevelRef] = useState('')
  const [drawingNumber, setDrawingNumber] = useState('')
  const [revision, setRevision] = useState('')
  const [drawingProjectId, setDrawingProjectId] = useState('')
  const [drawingFile, setDrawingFile] = useState(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [d, s, o] = await Promise.all([
      cid ? supabase.from('drawings').select('*').eq('company_id', cid).order('uploaded_at', { ascending: false }) : supabase.from('drawings').select('*').order('uploaded_at', { ascending: false }),
      cid ? supabase.from('snags').select('*').eq('company_id', cid).order('snag_number') : supabase.from('snags').select('*').order('snag_number'),
      cid ? supabase.from('operatives').select('*').eq('company_id', cid).order('name') : supabase.from('operatives').select('*').order('name'),
    ])
    setDrawings(d.data || [])
    setAllSnags(s.data || [])
    setAllOperatives(o.data || [])
    setLoading(false)
  }

  async function deleteDrawing(drawingId, drawingName) {
    if (!confirm(`Delete "${drawingName}" and all its snags? This cannot be undone.`)) return
    // Delete snags first (cascade should handle it but let's be safe)
    await supabase.from('snag_comments').delete().in('snag_id',
      (await supabase.from('snags').select('id').eq('drawing_id', drawingId)).data?.map(s => s.id) || []
    )
    await supabase.from('snags').delete().eq('drawing_id', drawingId)
    const { error } = await supabase.from('drawings').delete().eq('id', drawingId)
    if (error) {
      toast.error('Failed to delete drawing')
      return
    }
    toast.success('Drawing deleted')
    loadAll()
  }

  async function exportDrawingPDF(d) {
    setExportingDrawing(d.id)
    try {
      const proj = projects.find(p => p.id === d.project_id)
      const allDrawingSnags = allSnags.filter(s => s.drawing_id === d.id)
      // If some snags on this drawing are checked, only export those. Otherwise export all.
      const checkedOnThisDrawing = allDrawingSnags.filter(s => checkedSnags.has(s.id))
      const snagsToExport = checkedOnThisDrawing.length > 0 ? checkedOnThisDrawing : allDrawingSnags
      await generateSnagPDF({ drawing: d, project: proj, snags: snagsToExport, imageUrl: d.file_url })
      const label = checkedOnThisDrawing.length > 0 ? `${checkedOnThisDrawing.length} selected snag${checkedOnThisDrawing.length > 1 ? 's' : ''}` : 'full report'
      toast.success(`Downloaded ${label}`)
    } catch (err) {
      console.error(err)
      toast.error('Failed to export report')
    }
    setExportingDrawing(null)
  }

  function toggleSnagCheck(snagId) {
    setCheckedSnags(prev => {
      const next = new Set(prev)
      if (next.has(snagId)) next.delete(snagId)
      else next.add(snagId)
      return next
    })
  }

  async function assignCheckedSnags() {
    if (!assignTo || checkedSnags.size === 0) return
    setAssigning(true)

    const snagIds = [...checkedSnags]
    // Update assigned_to on all checked snags
    for (const id of snagIds) {
      await supabase.from('snags').update({ assigned_to: assignTo, updated_at: new Date().toISOString() }).eq('id', id)
    }

    const selectedSnagData = allSnags.filter(s => checkedSnags.has(s.id))
    const drawingId = selectedSnagData[0]?.drawing_id
    const drawing = drawings.find(d => d.id === drawingId)
    const proj = projects.find(p => p.id === drawing?.project_id)

    // Generate PDF of selected snags and upload to Supabase storage
    let pdfUrl = null
    try {
      // Import dynamically to avoid loading jsPDF on every page load
      const { generateSnagPDF } = await import('../lib/generateSnagPDF')
      // Temporarily override doc.save to capture the blob instead of downloading
      const { jsPDF } = await import('jspdf')
      const origSave = jsPDF.prototype.save
      let pdfBlob = null
      jsPDF.prototype.save = function() { pdfBlob = this.output('blob') }
      await generateSnagPDF({ drawing, project: proj, snags: selectedSnagData, imageUrl: drawing?.file_url })
      jsPDF.prototype.save = origSave

      if (pdfBlob) {
        const pdfPath = `snag-reports/${cid}/${Date.now()}.pdf`
        const { error: upErr } = await supabase.storage.from('documents').upload(pdfPath, pdfBlob, { contentType: 'application/pdf' })
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('documents').getPublicUrl(pdfPath)
          pdfUrl = urlData.publicUrl
        }
      }
    } catch (err) { console.error('PDF generation for email failed:', err) }

    // Send email with snag details and PDF link
    if (assignEmail) {
      await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operativeId: 'snag-assign',
          operativeName: assignTo,
          email: assignEmail,
          projectName: `Snag Assignment — ${proj?.name || 'Project'}`,
          customHtml: `
            <div style="font-family:system-ui,sans-serif;max-width:580px;margin:0 auto;">
              <div style="background:#0D1526;padding:20px 24px;border-radius:12px 12px 0 0;">
                <h1 style="color:white;margin:0;font-size:20px;">CoreSite</h1>
                <p style="color:#6B7A99;margin:4px 0 0;font-size:12px;">Snag Assignment — ${drawing?.name || 'Drawing'}</p>
              </div>
              <div style="background:#fff;padding:24px;border:1px solid #E2E6EA;border-top:none;">
                <p style="color:#1A1A2E;font-size:15px;margin:0 0 8px;">Hi ${assignTo},</p>
                <p style="color:#6B7A99;font-size:14px;margin:0 0 20px;">You have been assigned <strong>${snagIds.length} snag${snagIds.length > 1 ? 's' : ''}</strong> on <strong>${drawing?.name || 'a drawing'}</strong> — ${proj?.name || ''}.</p>
                ${selectedSnagData.map(s => `
                  <div style="background:#F5F6F8;border:1px solid #E2E6EA;border-left:4px solid ${s.status === 'open' ? '#DA3633' : s.status === 'completed' ? '#2EA043' : '#D29922'};border-radius:6px;padding:14px;margin-bottom:10px;">
                    <table style="width:100%;border-collapse:collapse;">
                      <tr>
                        <td style="vertical-align:top;${s.photo_url ? 'width:90px;padding-right:12px;' : ''}">
                          ${s.photo_url ? `<img src="${s.photo_url}" alt="Snag photo" style="width:80px;height:60px;object-fit:cover;border-radius:4px;" />` : ''}
                        </td>
                        <td style="vertical-align:top;">
                          <p style="margin:0;color:#1A1A2E;font-weight:700;font-size:14px;">Snag #${s.snag_number}</p>
                          <p style="margin:2px 0 0;color:#6B7A99;font-size:12px;font-weight:600;">${s.trade || 'General'}${s.type ? ' — ' + s.type : ''}</p>
                          <p style="margin:6px 0 0;color:#1A1A2E;font-size:13px;">${s.description || 'No description'}</p>
                          <p style="margin:6px 0 0;color:#6B7A99;font-size:11px;">Priority: <strong>${s.priority || 'N/A'}</strong> | Due: <strong>${s.due_date ? new Date(s.due_date).toLocaleDateString('en-GB') : 'Not set'}</strong></p>
                          <p style="margin:2px 0 0;color:#6B7A99;font-size:11px;">Location: ${drawing?.name || ''}${drawing?.level_ref ? ' — ' + drawing.level_ref : ''}</p>
                        </td>
                      </tr>
                    </table>
                  </div>
                `).join('')}
                ${pdfUrl ? `
                  <div style="margin-top:16px;text-align:center;">
                    <a href="${pdfUrl}" style="display:inline-block;background:#1B6FC8;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Download Snag Report (PDF)</a>
                  </div>
                ` : ''}
                <p style="color:#6B7A99;font-size:12px;margin-top:16px;">Please review and action these snags as soon as possible.</p>
              </div>
              <div style="background:#F5F6F8;padding:12px 24px;border-radius:0 0 12px 12px;border:1px solid #E2E6EA;border-top:none;">
                <p style="color:#B0B8C9;font-size:10px;margin:0;text-align:center;">CoreSite — Site Compliance Platform</p>
              </div>
            </div>
          `,
        }),
      }).catch(() => {})
    }

    setAssigning(false)
    toast.success(`${snagIds.length} snag${snagIds.length > 1 ? 's' : ''} assigned to ${assignTo}${assignEmail ? ' — email sent' : ''}`)
    setShowAssignModal(false)
    setCheckedSnags(new Set())
    setAssignTo('')
    setAssignEmail('')
    loadAll()
  }

  async function uploadDrawing(e) {
    e.preventDefault()
    if (!drawingName.trim() || !drawingProjectId || !drawingFile) return
    setSaving(true)

    let fileToUpload = drawingFile
    let fileExt = drawingFile.name.split('.').pop().toLowerCase()

    // Convert PDF to image
    if (fileExt === 'pdf') {
      try {
        const { pdfToImage } = await import('../lib/pdfToImage')
        fileToUpload = await pdfToImage(drawingFile)
        fileExt = 'png'
      } catch (err) {
        console.error('PDF conversion failed:', err)
        setSaving(false)
        toast.error('Failed to convert PDF — try uploading as an image instead')
        return
      }
    }

    const filePath = `${drawingProjectId}/${Date.now()}.${fileExt}`
    const { error: upErr } = await supabase.storage.from('drawings').upload(filePath, fileToUpload, {
      contentType: fileExt === 'png' ? 'image/png' : fileToUpload.type || 'image/jpeg',
    })
    if (upErr) {
      console.error('Upload error:', upErr)
      setSaving(false)
      toast.error('Failed to upload drawing')
      return
    }
    const { data: urlData } = supabase.storage.from('drawings').getPublicUrl(filePath)
    console.log('Drawing URL:', urlData.publicUrl)
    const managerData = JSON.parse(sessionStorage.getItem('manager_data') || '{}')

    const { error: dbErr } = await supabase.from('drawings').insert({
      project_id: drawingProjectId,
      name: drawingName.trim(),
      level_ref: levelRef.trim() || null,
      drawing_number: drawingNumber.trim() || null,
      revision: revision.trim() || null,
      file_url: urlData.publicUrl,
      uploaded_by: managerData.name || 'PM',
      company_id: cid,
    })
    setSaving(false)
    if (dbErr) {
      toast.error('Failed to save drawing record')
      return
    }
    toast.success('Drawing uploaded')
    setShowUpload(false)
    setDrawingName(''); setLevelRef(''); setDrawingNumber(''); setRevision(''); setDrawingProjectId(''); setDrawingFile(null)
    loadAll()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  // Stats
  const openCount = allSnags.filter(s => s.status === 'open').length
  const completedCount = allSnags.filter(s => s.status === 'completed').length
  const closedCount = allSnags.filter(s => s.status === 'closed').length
  const reassignedCount = allSnags.filter(s => s.status === 'reassigned').length
  const totalCount = allSnags.length

  // Donut chart data
  const donutData = [
    { label: 'Open', count: openCount, color: '#ef4444' },
    { label: 'Completed', count: completedCount, color: '#22c55e' },
    { label: 'Closed', count: closedCount, color: '#9ca3af' },
    { label: 'Reassigned', count: reassignedCount, color: '#f59e0b' },
  ]

  // Top 5 drawings by open snags
  const drawingOpenCounts = drawings.map(d => ({
    name: d.name,
    count: allSnags.filter(s => s.drawing_id === d.id && s.status === 'open').length,
  })).filter(d => d.count > 0).sort((a, b) => b.count - a.count).slice(0, 5)
  const maxOpen = Math.max(...drawingOpenCounts.map(d => d.count), 1)

  // Filtered snags
  let filtered = allSnags
  if (filterStatus !== 'all') filtered = filtered.filter(s => s.status === filterStatus)
  if (filterDrawing !== 'all') filtered = filtered.filter(s => s.drawing_id === filterDrawing)
  if (filterSnagNo) filtered = filtered.filter(s => String(s.snag_number).includes(filterSnagNo))

  // Group by drawing
  const snagsByDrawing = {}
  filtered.forEach(s => {
    if (!snagsByDrawing[s.drawing_id]) snagsByDrawing[s.drawing_id] = []
    snagsByDrawing[s.drawing_id].push(s)
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Snags</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
            <Upload size={14} /> Upload Drawing
          </button>
        </div>
      </div>

      {/* Status pills - top right style */}
      <div className="flex items-center gap-1.5 justify-end">
        {[
          { count: closedCount, color: 'bg-gray-400' },
          { count: openCount, color: 'bg-red-500' },
          { count: completedCount, color: 'bg-green-500' },
          { count: reassignedCount, color: 'bg-amber-500' },
          { count: 0, color: 'bg-pink-400' },
        ].map((s, i) => (
          <span key={i} className={`${s.color} text-white text-[10px] font-bold w-7 h-7 rounded-full flex items-center justify-center`}>{s.count}</span>
        ))}
      </div>

      {/* Charts */}
      {totalCount > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Snags by Status - Donut */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Snags By Status</h3>
            <div className="flex items-center gap-4">
              <svg viewBox="0 0 100 100" className="w-32 h-32 shrink-0">
                {(() => {
                  let cumulative = 0
                  return donutData.filter(d => d.count > 0).map((d, i) => {
                    const pct = (d.count / totalCount) * 100
                    const dashArray = `${pct * 2.51327} ${251.327 - pct * 2.51327}`
                    const rotation = cumulative * 3.6 - 90
                    cumulative += pct
                    return <circle key={i} cx="50" cy="50" r="40" fill="none" stroke={d.color} strokeWidth="20"
                      strokeDasharray={dashArray} transform={`rotate(${rotation} 50 50)`} />
                  })
                })()}
                <text x="50" y="50" textAnchor="middle" dy="4" fontSize="16" fontWeight="700" fill="#1e293b">{totalCount}</text>
              </svg>
              <div className="space-y-1.5">
                {donutData.map(d => (
                  <div key={d.label} className="flex items-center gap-2 text-xs">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: d.color }} />
                    <span className="text-slate-600">{d.label} ({d.count})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top 5 Open Snags by Drawing */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Top 5 Open Snags By Drawing</h3>
            {drawingOpenCounts.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No open snags</p>
            ) : (
              <div className="space-y-2.5">
                {drawingOpenCounts.map((d, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-slate-600 truncate flex-1 mr-2">{d.name}</p>
                      <span className="text-[11px] text-slate-900 font-bold">{d.count}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full" style={{ width: `${(d.count / maxOpen) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-slate-400">Status:</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-400">
            <option value="all">All Active</option>
            <option value="open">Open</option>
            <option value="completed">Completed</option>
            <option value="closed">Closed</option>
            <option value="reassigned">Reassigned</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-slate-400">Drawing:</label>
          <select value={filterDrawing} onChange={e => setFilterDrawing(e.target.value)}
            className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-400 max-w-[160px]">
            <option value="all">All Drawings</option>
            {drawings.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-slate-400">Snag No:</label>
          <input value={filterSnagNo} onChange={e => setFilterSnagNo(e.target.value)} placeholder="#"
            className="w-14 px-2 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-400" />
        </div>
        <button onClick={() => { setFilterStatus('all'); setFilterDrawing('all'); setFilterSnagNo('') }}
          className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600">Reset</button>
      </div>

      {/* Drawings list with snags */}
      {drawings.length === 0 ? (
        <div className="text-center py-12">
          <MapPin size={40} className="mx-auto mb-3 text-slate-200" />
          <p className="text-slate-400">No drawings uploaded yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {drawings.map(d => {
            const dSnags = snagsByDrawing[d.id] || []
            const dAllSnags = allSnags.filter(s => s.drawing_id === d.id)
            const proj = projects.find(p => p.id === d.project_id)
            const expanded = expandedDrawing === d.id
            const dOpen = dAllSnags.filter(s => s.status === 'open').length
            const dCompleted = dAllSnags.filter(s => s.status === 'completed').length
            const dClosed = dAllSnags.filter(s => s.status === 'closed').length
            const dReassigned = dAllSnags.filter(s => s.status === 'reassigned').length

            if (filterDrawing !== 'all' && filterDrawing !== d.id) return null

            return (
              <div key={d.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {/* Drawing header */}
                <div className="p-3 flex items-center gap-3">
                  <button onClick={() => setExpandedDrawing(expanded ? null : d.id)} className="flex-1 text-left min-w-0">
                    <p className="text-blue-600 font-semibold text-sm truncate hover:underline">{d.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{d.drawing_number || ''}{d.revision ? `, Rev: ${d.revision}` : ''}</p>
                  </button>
                  {/* Status count pills */}
                  <div className="flex items-center gap-1 shrink-0">
                    {dOpen > 0 && <span className="bg-red-500 text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{dOpen}</span>}
                    {dCompleted > 0 && <span className="bg-green-500 text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{dCompleted}</span>}
                    {dClosed > 0 && <span className="bg-gray-400 text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{dClosed}</span>}
                    {dReassigned > 0 && <span className="bg-amber-500 text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{dReassigned}</span>}
                    <span className="bg-slate-700 text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{dAllSnags.length}</span>
                  </div>
                  <button onClick={() => navigate(`/snags/${d.id}`)} className="px-2.5 py-1 text-[11px] text-white bg-[#1B6FC8] hover:bg-[#1558A0] rounded-md font-medium shrink-0 transition-colors">
                    View
                  </button>
                  <button onClick={() => navigate(`/snags/${d.id}?add=true`)} className="p-1.5 text-[#1B6FC8] hover:bg-blue-50 rounded-md transition-colors shrink-0" title="Add snag">
                    <Plus size={14} />
                  </button>
                  <button
                    disabled={exportingDrawing === d.id}
                    onClick={() => exportDrawingPDF(d)}
                    className="p-1.5 text-slate-400 hover:text-[#1B6FC8] hover:bg-blue-50 rounded-md transition-colors shrink-0"
                    title="Download snag report"
                  >
                    {exportingDrawing === d.id ? (
                      <div className="w-3.5 h-3.5 border-2 border-[#1B6FC8] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Download size={14} />
                    )}
                  </button>
                  <button onClick={() => deleteDrawing(d.id, d.name)} className="p-1.5 text-slate-400 hover:text-[#DA3633] hover:bg-red-50 rounded-md transition-colors shrink-0" title="Delete drawing">
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Expanded snag table */}
                {expanded && dSnags.length > 0 && (
                  <div className="border-t border-slate-100 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-left">
                          <th className="px-3 py-2 w-10 text-center"><input type="checkbox" className="w-4 h-4 rounded accent-[#1B6FC8] cursor-pointer" onChange={e => {
                            if (e.target.checked) setCheckedSnags(new Set(dSnags.map(s => s.id)))
                            else setCheckedSnags(new Set())
                          }} /></th>
                          <th className="px-3 py-2 font-semibold">No.</th>
                          <th className="px-3 py-2 font-semibold">Photo</th>
                          <th className="px-3 py-2 font-semibold">Details</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Priority</th>
                          <th className="px-3 py-2 font-semibold">Due On</th>
                          <th className="px-3 py-2 font-semibold">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dSnags.map(snag => {
                          const isOverdue = snag.due_date && new Date(snag.due_date) < new Date() && snag.status === 'open'
                          return (
                            <tr key={snag.id} className="border-t border-slate-100 hover:bg-blue-50/30 cursor-pointer" onClick={() => { setSelectedSnag(snag); setSelectedDrawing(d) }}>
                              <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                                <input type="checkbox" checked={checkedSnags.has(snag.id)} onChange={() => toggleSnagCheck(snag.id)}
                                  className="w-4 h-4 rounded accent-[#1B6FC8] cursor-pointer" />
                              </td>
                              <td className="px-3 py-2.5 font-bold text-slate-700">{snag.snag_number}</td>
                              <td className="px-3 py-2.5">
                                {snag.photo_url ? (
                                  <img src={snag.photo_url} alt="" className="w-14 h-10 object-cover rounded hover:ring-2 hover:ring-[#1B6FC8] transition-all" />
                                ) : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-3 py-2.5 max-w-[200px]">
                                <p className="text-slate-800 font-medium">{snag.trade || ''}</p>
                                {snag.type && <p className="text-slate-500">— {snag.type}</p>}
                                <p className="text-slate-600 truncate mt-0.5">{snag.description}</p>
                                {snag.assigned_to && <p className="text-slate-400 mt-0.5">→ {snag.assigned_to}</p>}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  snag.status === 'open' ? 'bg-red-100 text-red-700' :
                                  snag.status === 'completed' ? 'bg-green-100 text-green-700' :
                                  snag.status === 'closed' ? 'bg-gray-100 text-gray-600' :
                                  'bg-amber-100 text-amber-700'
                                }`}>{snag.status}</span>
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={`text-[10px] ${
                                  snag.priority === 'high' ? 'text-red-600' : snag.priority === 'medium' ? 'text-amber-600' : 'text-blue-600'
                                }`}>{snag.priority}{snag.priority === 'high' ? ' (2 day)' : snag.priority === 'medium' ? ' (5 day)' : ' (10 day)'}</span>
                              </td>
                              <td className={`px-3 py-2.5 ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                                {snag.due_date ? new Date(snag.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-slate-500">
                                {new Date(snag.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {expanded && dSnags.length === 0 && (
                  <div className="border-t border-slate-100 p-4 text-center text-xs text-slate-400">No snags match filters</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Upload Drawing Modal */}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload Drawing">
        <form onSubmit={uploadDrawing} className="space-y-3">
          <input value={drawingName} onChange={e => setDrawingName(e.target.value)} placeholder="Drawing name *"
            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm placeholder-slate-300 focus:outline-none focus:border-blue-400" autoFocus />
          <select value={drawingProjectId} onChange={e => setDrawingProjectId(e.target.value)}
            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:border-blue-400">
            <option value="">Select project *</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input value={levelRef} onChange={e => setLevelRef(e.target.value)} placeholder="Level / Area ref"
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm placeholder-slate-300 focus:outline-none focus:border-blue-400" />
            <input value={revision} onChange={e => setRevision(e.target.value)} placeholder="Revision (e.g. C01)"
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm placeholder-slate-300 focus:outline-none focus:border-blue-400" />
          </div>
          <input value={drawingNumber} onChange={e => setDrawingNumber(e.target.value)} placeholder="Drawing number"
            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm placeholder-slate-300 focus:outline-none focus:border-blue-400" />
          <label className="flex items-center justify-center gap-2 w-full px-3 py-4 bg-slate-50 border border-slate-200 border-dashed rounded-lg cursor-pointer hover:border-blue-400 transition-colors">
            <Upload size={16} className="text-slate-400" />
            <span className="text-sm text-slate-400">{drawingFile ? drawingFile.name : 'Select PDF or image file'}</span>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setDrawingFile(e.target.files[0])} className="hidden" />
          </label>
          <p className="text-[11px] text-slate-400">PDFs will be automatically converted to high-res images</p>
          <LoadingButton loading={saving} type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-xl">
            Upload Drawing
          </LoadingButton>
        </form>
      </Modal>

      {/* Floating action bar when snags are checked */}
      {checkedSnags.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-[#0D1526] text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3">
          <span className="text-sm font-semibold">{checkedSnags.size} snag{checkedSnags.size > 1 ? 's' : ''} selected</span>
          <button onClick={() => setShowAssignModal(true)} className="px-4 py-2 bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm font-medium rounded-lg transition-colors">
            Assign & Email
          </button>
          <button onClick={() => setCheckedSnags(new Set())} className="px-3 py-2 text-white/50 hover:text-white text-sm transition-colors">
            Clear
          </button>
        </div>
      )}

      {/* Assign modal */}
      <Modal open={showAssignModal} onClose={() => setShowAssignModal(false)} title={`Assign ${checkedSnags.size} Snag${checkedSnags.size > 1 ? 's' : ''}`}>
        <div className="space-y-4">
          <p className="text-sm text-[#6B7A99]">Assign the selected snags to an operative and send them an email with the details.</p>
          <div>
            <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Assign To *</label>
            <select value={assignTo} onChange={e => {
              setAssignTo(e.target.value)
              const op = allOperatives.find(o => o.name === e.target.value)
              if (op?.email) setAssignEmail(op.email)
            }}
              className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]">
              <option value="">Select person</option>
              {allOperatives.map(op => <option key={op.id} value={op.name}>{op.name}{op.role ? ` — ${op.role}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Email Address (to receive snag details)</label>
            <input type="email" value={assignEmail} onChange={e => setAssignEmail(e.target.value)} placeholder="their@email.com"
              className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] placeholder-[#B0B8C9] focus:outline-none focus:border-[#1B6FC8]" />
          </div>
          <div className="bg-[#F5F6F8] rounded-lg p-3">
            <p className="text-xs text-[#6B7A99] font-medium mb-2">Selected snags:</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {allSnags.filter(s => checkedSnags.has(s.id)).map(s => (
                <div key={s.id} className="flex items-center gap-2 text-xs text-[#1A1A2E]">
                  <span className={`w-2 h-2 rounded-full ${s.status === 'open' ? 'bg-red-500' : s.status === 'completed' ? 'bg-green-500' : 'bg-amber-500'}`} />
                  <span className="font-semibold">#{s.snag_number}</span>
                  <span className="text-[#6B7A99] truncate">{s.description || s.trade || 'No description'}</span>
                </div>
              ))}
            </div>
          </div>
          <LoadingButton loading={assigning} onClick={assignCheckedSnags} disabled={!assignTo}
            className="w-full bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm font-semibold rounded-md">
            Assign & Send Email
          </LoadingButton>
        </div>
      </Modal>

      {/* Snag detail modal */}
      {selectedSnag && (
        <SnagDetail
          snag={selectedSnag}
          onClose={() => setSelectedSnag(null)}
          onUpdated={() => { setSelectedSnag(null); loadAll() }}
          isPM={true}
          operatives={allOperatives}
          drawing={selectedDrawing}
        />
      )}
    </div>
  )
}

/* ==================== H&S REPORT TAB ==================== */
/* ==================== TOOLBOX TAB ==================== */
function ToolboxTab({ projects, navigate }) {
  const cid = JSON.parse(sessionStorage.getItem('manager_data') || '{}').company_id
  const [talks, setTalks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [talkSigs, setTalkSigs] = useState({})
  const [exporting, setExporting] = useState(null)

  useEffect(() => {
    loadTalks()
  }, [])

  async function loadTalks() {
    setLoading(true)
    const { data: t } = cid
      ? await supabase.from('toolbox_talks').select('*').eq('company_id', cid).order('created_at', { ascending: false })
      : await supabase.from('toolbox_talks').select('*').order('created_at', { ascending: false })

    const allTalks = t || []
    setTalks(allTalks)

    // Load signature counts
    if (allTalks.length > 0) {
      const { data: sigs } = await supabase
        .from('toolbox_signatures')
        .select('talk_id, operative_name, signed_at')
      const grouped = {}
      ;(sigs || []).forEach(s => {
        if (!grouped[s.talk_id]) grouped[s.talk_id] = []
        grouped[s.talk_id].push(s)
      })
      setTalkSigs(grouped)
    }
    setLoading(false)
  }

  async function createTalk(e) {
    e.preventDefault()
    if (!title.trim() || !projectId) return
    setSaving(true)
    const managerData = JSON.parse(sessionStorage.getItem('manager_data') || '{}')
    const { data, error } = await supabase.from('toolbox_talks').insert({
      title: title.trim(),
      description: description.trim() || null,
      project_id: projectId,
      created_by: managerData.id || null,
      company_id: cid,
    }).select().single()
    setSaving(false)
    if (error) {
      toast.error('Failed to create toolbox talk')
      return
    }
    toast.success('Toolbox talk created')
    setShowAdd(false)
    setTitle(''); setDescription(''); setProjectId('')
    navigate(`/toolbox-live/${data.id}`)
  }

  async function handleExport(talk) {
    setExporting(talk.id)
    try {
      const { data: proj } = await supabase.from('projects').select('*').eq('id', talk.project_id).single()
      const { data: sigs } = await supabase.from('toolbox_signatures').select('*').eq('talk_id', talk.id).order('signed_at')
      await generateToolboxPDF({ talk, project: proj, signatures: sigs || [] })
      toast.success('PDF downloaded')
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate PDF')
    }
    setExporting(null)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const openTalks = talks.filter(t => t.is_open)
  const closedTalks = talks.filter(t => !t.is_open)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Toolbox Talks</h2>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus size={16} /> New Talk
        </button>
      </div>

      {/* Open talks */}
      {openTalks.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">Live Now</p>
          <div className="space-y-2">
            {openTalks.map(talk => {
              const proj = projects.find(p => p.id === talk.project_id)
              const sigs = talkSigs[talk.id] || []
              return (
                <button
                  key={talk.id}
                  onClick={() => navigate(`/toolbox-live/${talk.id}`)}
                  className="w-full bg-white border border-green-200 rounded-xl p-4 text-left hover:shadow-md transition-all active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-success rounded-full animate-pulse shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 font-semibold truncate">{talk.title}</p>
                      <p className="text-xs text-slate-400">{proj?.name} · {sigs.length} signed</p>
                    </div>
                    <ChevronRight size={16} className="text-slate-400" />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Completed talks */}
      {closedTalks.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">Completed</p>
          <div className="space-y-2">
            {closedTalks.map(talk => {
              const proj = projects.find(p => p.id === talk.project_id)
              const sigs = talkSigs[talk.id] || []
              return (
                <div key={talk.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 font-semibold truncate">{talk.title}</p>
                      <p className="text-xs text-slate-400">{proj?.name} · {new Date(talk.created_at).toLocaleDateString()} · {sigs.length} attendees</p>
                    </div>
                    <button
                      onClick={() => navigate(`/toolbox-live/${talk.id}`)}
                      className="p-2 text-slate-400 hover:text-blue-500 transition-colors"
                      title="View details"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      disabled={exporting === talk.id}
                      onClick={() => handleExport(talk)}
                      className="p-2 text-slate-400 hover:text-blue-500 transition-colors"
                      title="Download PDF"
                    >
                      {exporting === talk.id ? (
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Download size={16} />
                      )}
                    </button>
                  </div>
                  {sigs.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {sigs.map(s => (
                        <span key={s.signed_at} className="text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full">{s.operative_name}</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {talks.length === 0 && (
        <div className="text-center py-12">
          <MessageSquare size={40} className="mx-auto mb-3 text-slate-200" />
          <p className="text-slate-400">No toolbox talks yet</p>
          <p className="text-xs text-slate-300 mt-1">Create one to generate a QR code for operatives to sign</p>
        </div>
      )}

      {/* Create Talk Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Toolbox Talk">
        <form onSubmit={createTalk} className="space-y-4">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Talk title (e.g. Working at Height)"
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
            autoFocus
          />
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
          >
            <option value="">Select project / site</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Brief description of the talk (optional)"
            rows={3}
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10 resize-none"
          />
          <LoadingButton loading={saving} type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-xl">
            Create & Show QR Code
          </LoadingButton>
        </form>
      </Modal>
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
