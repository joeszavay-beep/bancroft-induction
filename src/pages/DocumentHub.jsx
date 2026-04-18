import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import { getSession } from '../lib/storage'
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import {
  FolderOpen, Plus, X, Search, Upload, Download, Eye, Edit2,
  FileText, FileImage, FileSpreadsheet, File, Check, Clock,
  AlertTriangle, Archive, ChevronRight, ChevronDown, Users,
  Send, Copy, Package, LayoutGrid, CalendarClock, History,
  CheckCircle, XCircle, Loader2, RefreshCw, Trash2, Filter
} from 'lucide-react'

// ── Category configuration ──
const CATEGORIES = {
  'RAMS': { color: '#DC2626', label: 'RAMS' },
  'Method Statement': { color: '#EA580C', label: 'Method Statement' },
  'Drawing': { color: '#2563EB', label: 'Drawing' },
  'Policy': { color: '#7C3AED', label: 'Policy' },
  'Permit/Certificate': { color: '#D29922', label: 'Permit/Certificate' },
  'Meeting Minutes': { color: '#0891B2', label: 'Meeting Minutes' },
  'Correspondence': { color: '#6B7280', label: 'Correspondence' },
  'O&M Manual': { color: '#059669', label: 'O&M Manual' },
  'Other': { color: '#94A3B8', label: 'Other' },
}

const CATEGORY_LIST = Object.keys(CATEGORIES)

// ── Helpers ──
function formatDate(d) {
  if (!d) return '\u2014'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysUntil(d) {
  if (!d) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target - now) / 86400000)
}

function expiryColor(days) {
  if (days === null) return ''
  if (days < 0) return '#DC2626'
  if (days < 7) return '#DC2626'
  if (days < 30) return '#D97706'
  return '#16A34A'
}

function fileIcon(filename) {
  if (!filename) return File
  const ext = filename.split('.').pop()?.toLowerCase()
  if (['pdf'].includes(ext)) return FileText
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return FileImage
  if (['xls', 'xlsx', 'csv'].includes(ext)) return FileSpreadsheet
  return File
}

function fileExt(filename) {
  if (!filename) return ''
  return filename.split('.').pop()?.toUpperCase() || ''
}

function titleFromFilename(name) {
  if (!name) return ''
  return name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Main Component ──
export default function DocumentHub() {
  const { user, company } = useCompany()
  const cid = user?.company_id
  const managerData = user || JSON.parse(getSession('manager_data') || '{}')
  const managerName = managerData.name || 'User'

  // Tab state
  const [tab, setTab] = useState('documents')
  const TABS = [
    { key: 'documents', label: 'All Documents' },
    { key: 'matrix', label: 'Document Matrix' },
    { key: 'packs', label: 'Packs' },
    { key: 'templates', label: 'Templates' },
    { key: 'expiring', label: 'Expiring & Reviews' },
  ]

  // Data
  const [loading, setLoading] = useState(true)
  const [documents, setDocuments] = useState([])
  const [packs, setPacks] = useState([])
  const [projects, setProjects] = useState([])
  const [operatives, setOperatives] = useState([])
  const [signoffs, setSignoffs] = useState([])

  // Filters
  const [filterCategory, setFilterCategory] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [searchText, setSearchText] = useState('')

  // Modals
  const [showUpload, setShowUpload] = useState(false)
  const [showVersionUpload, setShowVersionUpload] = useState(null)
  const [showAssignSignoff, setShowAssignSignoff] = useState(null)
  const [showEditDoc, setShowEditDoc] = useState(null)
  const [showAuditLog, setShowAuditLog] = useState(null)
  const [auditEntries, setAuditEntries] = useState([])
  const [showCreatePack, setShowCreatePack] = useState(false)
  const [showSendPack, setShowSendPack] = useState(null)
  const [expandedPack, setExpandedPack] = useState(null)
  const [showCloneTemplate, setShowCloneTemplate] = useState(null)
  const [matrixProject, setMatrixProject] = useState('')
  const [showCellDetail, setShowCellDetail] = useState(null)

  // Upload form
  const [uploadForm, setUploadForm] = useState({
    category: '', subcategory: '', title: '', description: '',
    project_id: '', tags: '', expiry_date: '', review_date: '',
    requires_signoff: false, is_template: false, signoff_operatives: [],
  })
  const [uploadFile, setUploadFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef(null)
  const [dragActive, setDragActive] = useState(false)

  // Version upload
  const [versionFile, setVersionFile] = useState(null)
  const [uploadingVersion, setUploadingVersion] = useState(false)

  // Assign signoff
  const [signoffSelections, setSignoffSelections] = useState([])
  const [assigningSignoff, setAssigningSignoff] = useState(false)

  // Edit form
  const [editForm, setEditForm] = useState({})
  const [savingEdit, setSavingEdit] = useState(false)

  // Pack form
  const [packForm, setPackForm] = useState({ name: '', project_id: '', document_ids: [] })
  const [savingPack, setSavingPack] = useState(false)
  const [packSendSelections, setPackSendSelections] = useState([])
  const [sendingPack, setSendingPack] = useState(false)

  // Clone template
  const [cloneProjectId, setCloneProjectId] = useState('')
  const [cloningTemplate, setCloningTemplate] = useState(false)

  // ── Data loading ──
  const loadData = useCallback(async () => {
    if (!cid) return
    setLoading(true)
    const [docRes, packRes, projRes, opRes, sigRes] = await Promise.all([
      supabase.from('document_hub').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('document_packs').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name').eq('company_id', cid).order('name'),
      supabase.from('operatives').select('id, name, role').eq('company_id', cid).order('name'),
      supabase.from('document_signoffs').select('*').eq('company_id', cid),
    ])
    setDocuments(docRes.data || [])
    setPacks(packRes.data || [])
    setProjects(projRes.data || [])
    setOperatives(opRes.data || [])
    setSignoffs(sigRes.data || [])
    setLoading(false)
  }, [cid])

  useEffect(() => { if (cid) loadData() }, [cid, loadData])

  // ── Audit log helper ──
  function logAudit(action, documentId, details) {
    if (!cid) return
    supabase.from('document_audit_log').insert({
      company_id: cid,
      document_id: documentId,
      action,
      performed_by: managerName,
      details: details || null,
    }).then(() => {})
  }

  // ── File upload to storage ──
  async function uploadFileToStorage(file, category) {
    const ext = file.name.split('.').pop()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `hub/${cid}/${category || 'Other'}/${Date.now()}_${safeName}`
    const { data, error } = await supabase.storage.from('documents').upload(path, file, { contentType: file.type })
    if (error) throw error
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
    return { path, publicUrl: urlData.publicUrl }
  }

  // ── Upload document ──
  async function handleUploadDocument() {
    if (!uploadFile) return toast.error('Select a file to upload')
    if (!uploadForm.category) return toast.error('Select a category')
    if (!uploadForm.title.trim()) return toast.error('Enter a document title')
    if (uploadFile.size > 50 * 1024 * 1024) return toast.error('File must be under 50MB')

    setUploading(true)
    setUploadProgress(20)
    try {
      const { path, publicUrl } = await uploadFileToStorage(uploadFile, uploadForm.category)
      setUploadProgress(60)

      const tags = uploadForm.tags
        ? uploadForm.tags.split(',').map(t => t.trim()).filter(Boolean)
        : []

      const { data: doc, error } = await supabase.from('document_hub').insert({
        company_id: cid,
        category: uploadForm.category,
        subcategory: uploadForm.subcategory.trim() || null,
        title: uploadForm.title.trim(),
        description: uploadForm.description.trim() || null,
        project_id: uploadForm.project_id || null,
        file_url: publicUrl,
        file_path: path,
        file_name: uploadFile.name,
        file_type: uploadFile.type,
        file_size: uploadFile.size,
        version: 1,
        tags,
        expiry_date: uploadForm.expiry_date || null,
        review_date: uploadForm.review_date || null,
        requires_signoff: uploadForm.requires_signoff,
        is_template: uploadForm.is_template,
        uploaded_by: managerName,
        status: 'active',
      }).select().single()

      if (error) throw error
      setUploadProgress(80)

      // Create signoff records if needed
      if (uploadForm.requires_signoff && uploadForm.signoff_operatives.length > 0) {
        const signoffRows = uploadForm.signoff_operatives.map(opId => ({
          company_id: cid,
          document_id: doc.id,
          operative_id: opId,
          status: 'pending',
        }))
        await supabase.from('document_signoffs').insert(signoffRows)
      }

      logAudit('upload', doc.id, { filename: uploadFile.name, category: uploadForm.category })
      setUploadProgress(100)
      toast.success('Document uploaded')
      resetUploadForm()
      loadData()
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    }
    setUploading(false)
    setUploadProgress(0)
  }

  function resetUploadForm() {
    setShowUpload(false)
    setUploadFile(null)
    setUploadForm({
      category: '', subcategory: '', title: '', description: '',
      project_id: '', tags: '', expiry_date: '', review_date: '',
      requires_signoff: false, is_template: false, signoff_operatives: [],
    })
    setUploadProgress(0)
  }

  // ── Upload new version ──
  async function handleUploadVersion() {
    if (!versionFile || !showVersionUpload) return
    if (versionFile.size > 50 * 1024 * 1024) return toast.error('File must be under 50MB')
    setUploadingVersion(true)
    try {
      const doc = showVersionUpload
      const { path, publicUrl } = await uploadFileToStorage(versionFile, doc.category)
      const newVersion = (doc.version || 1) + 1

      // Create new doc record linked to previous
      const { data: newDoc, error } = await supabase.from('document_hub').insert({
        company_id: cid,
        category: doc.category,
        subcategory: doc.subcategory,
        title: doc.title,
        description: doc.description,
        project_id: doc.project_id,
        file_url: publicUrl,
        file_path: path,
        file_name: versionFile.name,
        file_type: versionFile.type,
        file_size: versionFile.size,
        version: newVersion,
        tags: doc.tags,
        expiry_date: doc.expiry_date,
        review_date: doc.review_date,
        requires_signoff: doc.requires_signoff,
        is_template: doc.is_template,
        uploaded_by: managerName,
        status: 'active',
        previous_version_id: doc.id,
      }).select().single()

      if (error) throw error

      // Archive old version
      await supabase.from('document_hub').update({ status: 'archived' }).eq('id', doc.id)

      // If requires signoff, invalidate old and create new pending signoffs
      if (doc.requires_signoff) {
        await supabase.from('document_signoffs')
          .update({ status: 'invalidated' })
          .eq('document_id', doc.id)

        // Get operatives who had signoffs on old version
        const oldSignoffs = signoffs.filter(s => s.document_id === doc.id)
        if (oldSignoffs.length > 0) {
          const newSignoffRows = oldSignoffs.map(s => ({
            company_id: cid,
            document_id: newDoc.id,
            operative_id: s.operative_id,
            status: 'pending',
          }))
          await supabase.from('document_signoffs').insert(newSignoffRows)
        }
      }

      logAudit('version_update', newDoc.id, { from_version: doc.version, to_version: newVersion, previous_id: doc.id })
      toast.success(`Version ${newVersion} uploaded`)
      setShowVersionUpload(null)
      setVersionFile(null)
      loadData()
    } catch (err) {
      toast.error(err.message || 'Version upload failed')
    }
    setUploadingVersion(false)
  }

  // ── Assign for sign-off ──
  async function handleAssignSignoff() {
    if (!showAssignSignoff || signoffSelections.length === 0) return toast.error('Select at least one operative')
    setAssigningSignoff(true)
    try {
      const existingOpIds = signoffs
        .filter(s => s.document_id === showAssignSignoff.id && s.status !== 'invalidated')
        .map(s => s.operative_id)
      const newOps = signoffSelections.filter(id => !existingOpIds.includes(id))
      if (newOps.length === 0) {
        toast('All selected operatives are already assigned')
        setAssigningSignoff(false)
        return
      }

      const rows = newOps.map(opId => ({
        company_id: cid,
        document_id: showAssignSignoff.id,
        operative_id: opId,
        status: 'pending',
      }))
      const { error } = await supabase.from('document_signoffs').insert(rows)
      if (error) throw error

      // Mark doc as requires signoff if not already
      if (!showAssignSignoff.requires_signoff) {
        await supabase.from('document_hub').update({ requires_signoff: true }).eq('id', showAssignSignoff.id)
      }

      logAudit('assign', showAssignSignoff.id, { operatives: newOps.length })
      toast.success(`${newOps.length} operative(s) assigned for sign-off`)
      setShowAssignSignoff(null)
      setSignoffSelections([])
      loadData()
    } catch (err) {
      toast.error(err.message || 'Assignment failed')
    }
    setAssigningSignoff(false)
  }

  // ── Edit document ──
  async function handleSaveEdit() {
    if (!showEditDoc) return
    setSavingEdit(true)
    try {
      const tags = editForm.tags
        ? (typeof editForm.tags === 'string' ? editForm.tags.split(',').map(t => t.trim()).filter(Boolean) : editForm.tags)
        : []
      const { error } = await supabase.from('document_hub').update({
        title: editForm.title?.trim(),
        description: editForm.description?.trim() || null,
        category: editForm.category,
        subcategory: editForm.subcategory?.trim() || null,
        project_id: editForm.project_id || null,
        tags,
        expiry_date: editForm.expiry_date || null,
        review_date: editForm.review_date || null,
        requires_signoff: editForm.requires_signoff,
      }).eq('id', showEditDoc.id)
      if (error) throw error
      logAudit('edit', showEditDoc.id, { fields: 'metadata' })
      toast.success('Document updated')
      setShowEditDoc(null)
      loadData()
    } catch (err) {
      toast.error(err.message || 'Update failed')
    }
    setSavingEdit(false)
  }

  // ── Archive document ──
  async function handleArchive(doc) {
    if (!confirm(`Archive "${doc.title}"?`)) return
    const { error } = await supabase.from('document_hub').update({ status: 'archived' }).eq('id', doc.id)
    if (error) return toast.error('Failed to archive')
    logAudit('archive', doc.id)
    toast.success('Document archived')
    loadData()
  }

  // ── View document ──
  function handleView(doc) {
    logAudit('view', doc.id)
    window.open(doc.file_url, '_blank')
  }

  // ── Audit log panel ──
  async function openAuditLog(doc) {
    setShowAuditLog(doc)
    const { data } = await supabase.from('document_audit_log')
      .select('*')
      .eq('document_id', doc.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setAuditEntries(data || [])
  }

  // ── Create pack ──
  async function handleCreatePack() {
    if (!packForm.name.trim()) return toast.error('Enter a pack name')
    if (packForm.document_ids.length === 0) return toast.error('Select at least one document')
    setSavingPack(true)
    try {
      const { error } = await supabase.from('document_packs').insert({
        company_id: cid,
        name: packForm.name.trim(),
        project_id: packForm.project_id || null,
        document_ids: packForm.document_ids,
        created_by: managerName,
      })
      if (error) throw error
      toast.success('Pack created')
      setShowCreatePack(false)
      setPackForm({ name: '', project_id: '', document_ids: [] })
      loadData()
    } catch (err) {
      toast.error(err.message || 'Failed to create pack')
    }
    setSavingPack(false)
  }

  // ── Send pack ──
  async function handleSendPack() {
    if (!showSendPack || packSendSelections.length === 0) return toast.error('Select operatives')
    setSendingPack(true)
    try {
      const docIds = showSendPack.document_ids || []
      const rows = []
      for (const docId of docIds) {
        for (const opId of packSendSelections) {
          // Check not already assigned
          const existing = signoffs.find(s => s.document_id === docId && s.operative_id === opId && s.status !== 'invalidated')
          if (!existing) {
            rows.push({
              company_id: cid,
              document_id: docId,
              operative_id: opId,
              status: 'pending',
            })
          }
        }
      }
      if (rows.length > 0) {
        const { error } = await supabase.from('document_signoffs').insert(rows)
        if (error) throw error
        // Mark docs as requires_signoff
        await supabase.from('document_hub').update({ requires_signoff: true }).in('id', docIds)
      }
      toast.success(`Pack sent to ${packSendSelections.length} operative(s)`)
      setShowSendPack(null)
      setPackSendSelections([])
      loadData()
    } catch (err) {
      toast.error(err.message || 'Failed to send pack')
    }
    setSendingPack(false)
  }

  // ── Clone template ──
  async function handleCloneTemplate() {
    if (!showCloneTemplate || !cloneProjectId) return toast.error('Select a project')
    setCloningTemplate(true)
    try {
      const tpl = showCloneTemplate
      const { error } = await supabase.from('document_hub').insert({
        company_id: cid,
        category: tpl.category,
        subcategory: tpl.subcategory,
        title: tpl.title,
        description: tpl.description,
        project_id: cloneProjectId,
        file_url: tpl.file_url,
        file_path: tpl.file_path,
        file_name: tpl.file_name,
        file_type: tpl.file_type,
        file_size: tpl.file_size,
        version: 1,
        tags: tpl.tags,
        expiry_date: null,
        review_date: null,
        requires_signoff: tpl.requires_signoff,
        is_template: false,
        uploaded_by: managerName,
        status: 'active',
      })
      if (error) throw error
      logAudit('clone', tpl.id, { to_project: cloneProjectId })
      toast.success('Template cloned to project')
      setShowCloneTemplate(null)
      setCloneProjectId('')
      loadData()
    } catch (err) {
      toast.error(err.message || 'Clone failed')
    }
    setCloningTemplate(false)
  }

  // ── Send reminder from matrix ──
  async function sendReminder(docId, opId) {
    const op = operatives.find(o => o.id === opId)
    const doc = documents.find(d => d.id === docId)
    toast.success(`Reminder sent to ${op?.name || 'operative'} for "${doc?.title || 'document'}"`)
    setShowCellDetail(null)
  }

  // ── Drag and drop handlers ──
  function handleDragOver(e) { e.preventDefault(); e.stopPropagation(); setDragActive(true) }
  function handleDragLeave(e) { e.preventDefault(); e.stopPropagation(); setDragActive(false) }
  function handleDrop(e) {
    e.preventDefault(); e.stopPropagation(); setDragActive(false)
    const files = e.dataTransfer?.files
    if (files?.length > 0) {
      const f = files[0]
      setUploadFile(f)
      if (!uploadForm.title) {
        setUploadForm(prev => ({ ...prev, title: titleFromFilename(f.name) }))
      }
    }
  }

  // ── Filtering ──
  const activeDocuments = documents.filter(d => d.status !== 'archived' && !d.is_template)
  const archivedDocuments = documents.filter(d => d.status === 'archived')
  const templateDocuments = documents.filter(d => d.is_template)

  const filteredDocuments = documents.filter(d => {
    if (filterCategory && d.category !== filterCategory) return false
    if (filterProject && d.project_id !== filterProject) return false
    if (filterStatus === 'active' && d.status !== 'active') return false
    if (filterStatus === 'archived' && d.status !== 'archived') return false
    if (filterStatus === 'expiring') {
      const days = daysUntil(d.expiry_date)
      if (days === null || days > 30) return false
    }
    if (searchText) {
      const s = searchText.toLowerCase()
      const match = d.title?.toLowerCase().includes(s)
        || d.category?.toLowerCase().includes(s)
        || d.description?.toLowerCase().includes(s)
        || d.file_name?.toLowerCase().includes(s)
        || (d.tags || []).some(t => t.toLowerCase().includes(s))
      if (!match) return false
    }
    return true
  })

  // ── Signoff helpers ──
  function getSignoffStats(docId) {
    const docSignoffs = signoffs.filter(s => s.document_id === docId && s.status !== 'invalidated')
    const signed = docSignoffs.filter(s => s.status === 'signed').length
    return { total: docSignoffs.length, signed }
  }

  // ── Render helpers ──
  function CategoryBadge({ category }) {
    const config = CATEGORIES[category] || CATEGORIES['Other']
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
        style={{ backgroundColor: config.color + '18', color: config.color }}>
        {config.label}
      </span>
    )
  }

  function ExpiryBadge({ date }) {
    const days = daysUntil(date)
    if (days === null) return null
    const color = expiryColor(days)
    const label = days < 0 ? `Expired ${Math.abs(days)}d ago` : days === 0 ? 'Expires today' : `${days}d until expiry`
    return (
      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: color + '18', color }}>
        {label}
      </span>
    )
  }

  function SignoffBar({ docId }) {
    const { total, signed } = getSignoffStats(docId)
    if (total === 0) return null
    const pct = total > 0 ? (signed / total) * 100 : 0
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-color)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#16A34A' : '#D97706' }} />
        </div>
        <span className="text-[10px] font-medium shrink-0" style={{ color: 'var(--text-muted)' }}>{signed}/{total} signed</span>
      </div>
    )
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--primary-color)' }} />
      </div>
    )
  }

  // ── Modals ──

  // Upload Document Modal
  const uploadModal = showUpload && (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50" onClick={resetUploadForm} />
      <div className="relative w-full max-w-lg mx-4 rounded-xl border shadow-xl" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Upload size={18} style={{ color: 'var(--primary-color)' }} /> Upload Document
          </h2>
          <button onClick={resetUploadForm} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {/* Category */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Category *</label>
            <select value={uploadForm.category} onChange={e => setUploadForm(f => ({ ...f, category: e.target.value }))}
              className="w-full text-sm rounded-lg border px-3 py-2"
              style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
              <option value="">Select category...</option>
              {CATEGORY_LIST.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Subcategory */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Subcategory</label>
            <input type="text" placeholder="e.g. Structural, Electrical..." value={uploadForm.subcategory}
              onChange={e => setUploadForm(f => ({ ...f, subcategory: e.target.value }))}
              className="w-full text-sm rounded-lg border px-3 py-2"
              style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Title *</label>
            <input type="text" placeholder="Document title" value={uploadForm.title}
              onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))}
              className="w-full text-sm rounded-lg border px-3 py-2"
              style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Description</label>
            <textarea rows={2} placeholder="Optional description..." value={uploadForm.description}
              onChange={e => setUploadForm(f => ({ ...f, description: e.target.value }))}
              className="w-full text-sm rounded-lg border px-3 py-2 resize-none"
              style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
          </div>

          {/* Project */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Project</label>
            <select value={uploadForm.project_id} onChange={e => setUploadForm(f => ({ ...f, project_id: e.target.value }))}
              className="w-full text-sm rounded-lg border px-3 py-2"
              style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
              <option value="">Company-wide</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* File upload */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>File * (max 50MB)</label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                dragActive ? 'border-[var(--primary-color)] bg-blue-50/50' : ''
              }`}
              style={{ borderColor: dragActive ? 'var(--primary-color)' : 'var(--border-color)' }}
            >
              {uploadFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText size={18} style={{ color: 'var(--primary-color)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{uploadFile.name}</span>
                  <button onClick={e => { e.stopPropagation(); setUploadFile(null) }} className="text-red-500 hover:text-red-700"><X size={16} /></button>
                </div>
              ) : (
                <div>
                  <Upload size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Drag and drop or click to browse</p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>PDF, Images, Word, Excel</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.webp"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) {
                    setUploadFile(f)
                    if (!uploadForm.title) setUploadForm(prev => ({ ...prev, title: titleFromFilename(f.name) }))
                  }
                }}
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Tags (comma separated)</label>
            <input type="text" placeholder="e.g. Phase 1, Ground Floor, Structural" value={uploadForm.tags}
              onChange={e => setUploadForm(f => ({ ...f, tags: e.target.value }))}
              className="w-full text-sm rounded-lg border px-3 py-2"
              style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Expiry Date</label>
              <input type="date" value={uploadForm.expiry_date}
                onChange={e => setUploadForm(f => ({ ...f, expiry_date: e.target.value }))}
                className="w-full text-sm rounded-lg border px-3 py-2"
                style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Review Date</label>
              <input type="date" value={uploadForm.review_date}
                onChange={e => setUploadForm(f => ({ ...f, review_date: e.target.value }))}
                className="w-full text-sm rounded-lg border px-3 py-2"
                style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Requires sign-off</span>
              <button type="button" onClick={() => setUploadForm(f => ({ ...f, requires_signoff: !f.requires_signoff }))}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${uploadForm.requires_signoff ? 'bg-[var(--primary-color)]' : 'bg-slate-300'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${uploadForm.requires_signoff ? 'translate-x-5' : ''}`} />
              </button>
            </label>

            {/* Operative selector for signoff */}
            {uploadForm.requires_signoff && (
              <div className="space-y-2 border rounded-lg p-3" style={{ borderColor: 'var(--border-color)' }}>
                <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Select operatives for sign-off:</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {operatives.map(op => (
                    <label key={op.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5" style={{ color: 'var(--text-primary)' }}>
                      <input type="checkbox"
                        checked={uploadForm.signoff_operatives.includes(op.id)}
                        onChange={e => {
                          setUploadForm(f => ({
                            ...f,
                            signoff_operatives: e.target.checked
                              ? [...f.signoff_operatives, op.id]
                              : f.signoff_operatives.filter(id => id !== op.id),
                          }))
                        }}
                        className="rounded" />
                      <span>{op.name}</span>
                      {op.role && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({op.role})</span>}
                    </label>
                  ))}
                </div>
                {uploadForm.signoff_operatives.length > 0 && (
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{uploadForm.signoff_operatives.length} selected</p>
                )}
              </div>
            )}

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Save as template</span>
              <button type="button" onClick={() => setUploadForm(f => ({ ...f, is_template: !f.is_template }))}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${uploadForm.is_template ? 'bg-[var(--primary-color)]' : 'bg-slate-300'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${uploadForm.is_template ? 'translate-x-5' : ''}`} />
              </button>
            </label>
          </div>

          {/* Progress */}
          {uploading && uploadProgress > 0 && (
            <div className="space-y-1">
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-color)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${uploadProgress}%`, backgroundColor: 'var(--primary-color)' }} />
              </div>
              <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>{uploadProgress}%</p>
            </div>
          )}
        </div>
        <div className="p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <LoadingButton loading={uploading} onClick={handleUploadDocument} className="w-full text-white text-sm" style={{ backgroundColor: 'var(--primary-color)' }}>
            <Upload size={16} /> Upload Document
          </LoadingButton>
        </div>
      </div>
    </div>
  )

  // Version Upload Modal
  const versionModal = showVersionUpload && (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => { setShowVersionUpload(null); setVersionFile(null) }} />
      <div className="relative w-full max-w-md mx-4 rounded-xl border shadow-xl p-5 space-y-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Upload New Version</h2>
          <button onClick={() => { setShowVersionUpload(null); setVersionFile(null) }} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>
        <div className="text-sm space-y-1 p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-main)' }}>
          <p style={{ color: 'var(--text-primary)' }}><strong>{showVersionUpload.title}</strong></p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Current version: v{showVersionUpload.version || 1}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>File: {showVersionUpload.file_name}</p>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>New file</label>
          <input type="file" className="w-full text-sm"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.webp"
            onChange={e => setVersionFile(e.target.files?.[0] || null)} />
        </div>
        {showVersionUpload.requires_signoff && (
          <div className="text-xs p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-2">
            <AlertTriangle size={14} /> Existing sign-offs will be invalidated. New pending sign-offs will be created.
          </div>
        )}
        <LoadingButton loading={uploadingVersion} onClick={handleUploadVersion} className="w-full text-white text-sm" style={{ backgroundColor: 'var(--primary-color)' }}>
          <Upload size={16} /> Upload v{(showVersionUpload.version || 1) + 1}
        </LoadingButton>
      </div>
    </div>
  )

  // Assign Signoff Modal
  const signoffModal = showAssignSignoff && (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => { setShowAssignSignoff(null); setSignoffSelections([]) }} />
      <div className="relative w-full max-w-md mx-4 rounded-xl border shadow-xl p-5 space-y-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Assign for Sign-off</h2>
          <button onClick={() => { setShowAssignSignoff(null); setSignoffSelections([]) }} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>"{showAssignSignoff.title}"</p>
        {/* Filter operatives by project */}
        <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-3" style={{ borderColor: 'var(--border-color)' }}>
          {operatives.map(op => {
            const alreadyAssigned = signoffs.some(s => s.document_id === showAssignSignoff.id && s.operative_id === op.id && s.status !== 'invalidated')
            return (
              <label key={op.id} className={`flex items-center gap-2 text-sm py-0.5 ${alreadyAssigned ? 'opacity-50' : 'cursor-pointer'}`} style={{ color: 'var(--text-primary)' }}>
                <input type="checkbox" disabled={alreadyAssigned}
                  checked={alreadyAssigned || signoffSelections.includes(op.id)}
                  onChange={e => {
                    setSignoffSelections(prev => e.target.checked ? [...prev, op.id] : prev.filter(id => id !== op.id))
                  }}
                  className="rounded" />
                <span>{op.name}</span>
                {op.role && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({op.role})</span>}
                {alreadyAssigned && <span className="text-[10px] text-green-600 ml-auto">Assigned</span>}
              </label>
            )
          })}
        </div>
        <LoadingButton loading={assigningSignoff} onClick={handleAssignSignoff} className="w-full text-white text-sm" style={{ backgroundColor: 'var(--primary-color)' }}>
          <Send size={16} /> Assign {signoffSelections.length > 0 ? `(${signoffSelections.length})` : ''}
        </LoadingButton>
      </div>
    </div>
  )

  // Edit Document Modal
  const editModal = showEditDoc && (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50" onClick={() => setShowEditDoc(null)} />
      <div className="relative w-full max-w-lg mx-4 rounded-xl border shadow-xl p-5 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Edit Document</h2>
          <button onClick={() => setShowEditDoc(null)} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Title</label>
          <input type="text" value={editForm.title || ''} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Category</label>
          <select value={editForm.category || ''} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
            {CATEGORY_LIST.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Subcategory</label>
          <input type="text" value={editForm.subcategory || ''} onChange={e => setEditForm(f => ({ ...f, subcategory: e.target.value }))}
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Description</label>
          <textarea rows={2} value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
            className="w-full text-sm rounded-lg border px-3 py-2 resize-none"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Project</label>
          <select value={editForm.project_id || ''} onChange={e => setEditForm(f => ({ ...f, project_id: e.target.value }))}
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
            <option value="">Company-wide</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Tags (comma separated)</label>
          <input type="text" value={typeof editForm.tags === 'string' ? editForm.tags : (editForm.tags || []).join(', ')}
            onChange={e => setEditForm(f => ({ ...f, tags: e.target.value }))}
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Expiry Date</label>
            <input type="date" value={editForm.expiry_date || ''} onChange={e => setEditForm(f => ({ ...f, expiry_date: e.target.value }))}
              className="w-full text-sm rounded-lg border px-3 py-2"
              style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Review Date</label>
            <input type="date" value={editForm.review_date || ''} onChange={e => setEditForm(f => ({ ...f, review_date: e.target.value }))}
              className="w-full text-sm rounded-lg border px-3 py-2"
              style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
          </div>
        </div>
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Requires sign-off</span>
          <button type="button" onClick={() => setEditForm(f => ({ ...f, requires_signoff: !f.requires_signoff }))}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${editForm.requires_signoff ? 'bg-[var(--primary-color)]' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${editForm.requires_signoff ? 'translate-x-5' : ''}`} />
          </button>
        </label>
        <LoadingButton loading={savingEdit} onClick={handleSaveEdit} className="w-full text-white text-sm" style={{ backgroundColor: 'var(--primary-color)' }}>
          Save Changes
        </LoadingButton>
      </div>
    </div>
  )

  // Audit Log Slide-out
  const auditPanel = showAuditLog && (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={() => setShowAuditLog(null)} />
      <div className="relative w-full max-w-sm h-full overflow-y-auto shadow-xl" style={{ backgroundColor: 'var(--bg-card)' }}>
        <div className="flex items-center justify-between p-4 border-b sticky top-0" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <History size={18} /> Document History
          </h2>
          <button onClick={() => setShowAuditLog(null)} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>
        <div className="p-4">
          <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>{showAuditLog.title}</p>
          {auditEntries.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>No history entries yet</p>
          )}
          <div className="space-y-3">
            {auditEntries.map((entry, i) => (
              <div key={entry.id || i} className="flex gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--bg-main)' }}>
                  {entry.action === 'upload' && <Upload size={14} style={{ color: 'var(--primary-color)' }} />}
                  {entry.action === 'view' && <Eye size={14} style={{ color: '#6B7280' }} />}
                  {entry.action === 'sign' && <CheckCircle size={14} style={{ color: '#16A34A' }} />}
                  {entry.action === 'version_update' && <RefreshCw size={14} style={{ color: '#D97706' }} />}
                  {entry.action === 'archive' && <Archive size={14} style={{ color: '#DC2626' }} />}
                  {entry.action === 'assign' && <Send size={14} style={{ color: '#7C3AED' }} />}
                  {entry.action === 'edit' && <Edit2 size={14} style={{ color: '#0891B2' }} />}
                  {entry.action === 'clone' && <Copy size={14} style={{ color: '#059669' }} />}
                  {!['upload', 'view', 'sign', 'version_update', 'archive', 'assign', 'edit', 'clone'].includes(entry.action) &&
                    <FileText size={14} style={{ color: 'var(--text-muted)' }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
                    {entry.action?.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{entry.performed_by}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{formatDate(entry.created_at)}</p>
                  {entry.details && typeof entry.details === 'object' && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {Object.entries(entry.details).map(([k, v]) => `${k}: ${v}`).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  // Create Pack Modal
  const packModal = showCreatePack && (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreatePack(false)} />
      <div className="relative w-full max-w-lg mx-4 rounded-xl border shadow-xl p-5 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Create Document Pack</h2>
          <button onClick={() => setShowCreatePack(false)} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Pack Name *</label>
          <input type="text" placeholder="e.g. Induction Pack - Block A" value={packForm.name}
            onChange={e => setPackForm(f => ({ ...f, name: e.target.value }))}
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Project</label>
          <select value={packForm.project_id} onChange={e => setPackForm(f => ({ ...f, project_id: e.target.value }))}
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
            <option value="">Company-wide</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Select Documents *</label>
          <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-3" style={{ borderColor: 'var(--border-color)' }}>
            {activeDocuments.map(doc => (
              <label key={doc.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5" style={{ color: 'var(--text-primary)' }}>
                <input type="checkbox"
                  checked={packForm.document_ids.includes(doc.id)}
                  onChange={e => {
                    setPackForm(f => ({
                      ...f,
                      document_ids: e.target.checked
                        ? [...f.document_ids, doc.id]
                        : f.document_ids.filter(id => id !== doc.id),
                    }))
                  }}
                  className="rounded" />
                <span className="truncate">{doc.title}</span>
                <CategoryBadge category={doc.category} />
              </label>
            ))}
          </div>
          {packForm.document_ids.length > 0 && (
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{packForm.document_ids.length} document(s) selected</p>
          )}
        </div>
        <LoadingButton loading={savingPack} onClick={handleCreatePack} className="w-full text-white text-sm" style={{ backgroundColor: 'var(--primary-color)' }}>
          <Package size={16} /> Create Pack
        </LoadingButton>
      </div>
    </div>
  )

  // Send Pack Modal
  const sendPackModal = showSendPack && (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => { setShowSendPack(null); setPackSendSelections([]) }} />
      <div className="relative w-full max-w-md mx-4 rounded-xl border shadow-xl p-5 space-y-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Send Pack</h2>
          <button onClick={() => { setShowSendPack(null); setPackSendSelections([]) }} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Send "{showSendPack.name}" ({(showSendPack.document_ids || []).length} docs) to operatives for sign-off.</p>
        <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-3" style={{ borderColor: 'var(--border-color)' }}>
          {operatives.map(op => (
            <label key={op.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5" style={{ color: 'var(--text-primary)' }}>
              <input type="checkbox"
                checked={packSendSelections.includes(op.id)}
                onChange={e => {
                  setPackSendSelections(prev => e.target.checked ? [...prev, op.id] : prev.filter(id => id !== op.id))
                }}
                className="rounded" />
              <span>{op.name}</span>
              {op.role && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({op.role})</span>}
            </label>
          ))}
        </div>
        <LoadingButton loading={sendingPack} onClick={handleSendPack} className="w-full text-white text-sm" style={{ backgroundColor: 'var(--primary-color)' }}>
          <Send size={16} /> Send to {packSendSelections.length} operative(s)
        </LoadingButton>
      </div>
    </div>
  )

  // Clone Template Modal
  const cloneModal = showCloneTemplate && (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => { setShowCloneTemplate(null); setCloneProjectId('') }} />
      <div className="relative w-full max-w-sm mx-4 rounded-xl border shadow-xl p-5 space-y-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Clone to Project</h2>
          <button onClick={() => { setShowCloneTemplate(null); setCloneProjectId('') }} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Clone "{showCloneTemplate.title}" to a project.</p>
        <select value={cloneProjectId} onChange={e => setCloneProjectId(e.target.value)}
          className="w-full text-sm rounded-lg border px-3 py-2"
          style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
          <option value="">Select project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <LoadingButton loading={cloningTemplate} onClick={handleCloneTemplate} className="w-full text-white text-sm" style={{ backgroundColor: 'var(--primary-color)' }}>
          <Copy size={16} /> Clone
        </LoadingButton>
      </div>
    </div>
  )

  // Matrix Cell Detail Modal
  const cellDetailModal = showCellDetail && (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => setShowCellDetail(null)} />
      <div className="relative w-full max-w-sm mx-4 rounded-xl border shadow-xl p-5 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Sign-off Detail</h2>
          <button onClick={() => setShowCellDetail(null)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <div className="text-sm space-y-1">
          <p style={{ color: 'var(--text-primary)' }}><strong>Document:</strong> {showCellDetail.docTitle}</p>
          <p style={{ color: 'var(--text-primary)' }}><strong>Operative:</strong> {showCellDetail.opName}</p>
          <p style={{ color: 'var(--text-primary)' }}><strong>Status:</strong>{' '}
            <span className={showCellDetail.status === 'signed' ? 'text-green-600' : showCellDetail.status === 'pending' ? 'text-amber-600' : 'text-slate-500'}>
              {showCellDetail.status === 'signed' ? 'Signed' : showCellDetail.status === 'pending' ? 'Pending' : 'Not assigned'}
            </span>
          </p>
          {showCellDetail.signed_at && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Signed: {formatDate(showCellDetail.signed_at)}</p>
          )}
        </div>
        {showCellDetail.status === 'pending' && (
          <button onClick={() => sendReminder(showCellDetail.docId, showCellDetail.opId)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--primary-color)' }}>
            <Send size={14} /> Send Reminder
          </button>
        )}
        {showCellDetail.status === 'not_assigned' && (
          <button onClick={() => {
            setShowCellDetail(null)
            setShowAssignSignoff(documents.find(d => d.id === showCellDetail.docId))
            setSignoffSelections([showCellDetail.opId])
          }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--primary-color)' }}>
            <Plus size={14} /> Assign for Sign-off
          </button>
        )}
      </div>
    </div>
  )

  // ── Document Card ──
  function DocCard({ doc }) {
    const FileIcon = fileIcon(doc.file_name)
    const projectName = projects.find(p => p.id === doc.project_id)?.name
    const catConfig = CATEGORIES[doc.category] || CATEGORIES['Other']
    const tags = Array.isArray(doc.tags) ? doc.tags : []
    const expiryDays = daysUntil(doc.expiry_date)
    const reviewDays = daysUntil(doc.review_date)
    const reviewOverdue = reviewDays !== null && reviewDays < 0

    return (
      <div className="rounded-xl border p-4 transition-all hover:shadow-sm" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="flex items-start gap-3">
          {/* File icon */}
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: catConfig.color + '18' }}>
            <FileIcon size={20} style={{ color: catConfig.color }} />
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Top row: badges */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <CategoryBadge category={doc.category} />
              {doc.version > 1 && (
                <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-muted)' }}>
                  v{doc.version}
                </span>
              )}
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded uppercase" style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-muted)' }}>
                {fileExt(doc.file_name)}
              </span>
              {doc.status === 'archived' && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Archived</span>
              )}
            </div>

            {/* Title */}
            <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{doc.title}</h3>

            {/* Info row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {projectName && <span>{projectName}</span>}
              {!projectName && <span>Company-wide</span>}
              <span>{formatDate(doc.created_at)}</span>
              <span>{doc.uploaded_by}</span>
            </div>

            {/* Expiry / Review badges */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {doc.expiry_date && <ExpiryBadge date={doc.expiry_date} />}
              {reviewOverdue && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                  Review overdue
                </span>
              )}
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map((tag, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-muted)' }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Signoff bar */}
            {doc.requires_signoff && <SignoffBar docId={doc.id} />}

            {/* Actions */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button onClick={() => handleView(doc)}
                className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border transition-colors hover:bg-black/5"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                <Eye size={12} /> View
              </button>
              {doc.file_url && (
                <a href={doc.file_url} download target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border transition-colors hover:bg-black/5"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', textDecoration: 'none' }}>
                  <Download size={12} /> Download
                </a>
              )}
              {doc.status !== 'archived' && (
                <>
                  <button onClick={() => setShowVersionUpload(doc)}
                    className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border transition-colors hover:bg-black/5"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                    <RefreshCw size={12} /> New Version
                  </button>
                  <button onClick={() => { setShowEditDoc(doc); setEditForm({ ...doc, tags: (doc.tags || []).join(', ') }) }}
                    className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border transition-colors hover:bg-black/5"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                    <Edit2 size={12} /> Edit
                  </button>
                  <button onClick={() => setShowAssignSignoff(doc)}
                    className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border transition-colors hover:bg-black/5"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                    <Send size={12} /> Assign
                  </button>
                  <button onClick={() => handleArchive(doc)}
                    className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border transition-colors hover:bg-black/5 text-red-600"
                    style={{ borderColor: 'var(--border-color)' }}>
                    <Archive size={12} /> Archive
                  </button>
                </>
              )}
              <button onClick={() => openAuditLog(doc)}
                className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border transition-colors hover:bg-black/5"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                <History size={12} /> History
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── MAIN RENDER ──
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* All modals */}
      {uploadModal}
      {versionModal}
      {signoffModal}
      {editModal}
      {auditPanel}
      {packModal}
      {sendPackModal}
      {cloneModal}
      {cellDetailModal}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FolderOpen size={22} style={{ color: 'var(--primary-color)' }} />
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Document Hub</h1>
        </div>
        <button onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--primary-color)' }}>
          <Plus size={16} /> Upload Document
        </button>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl border overflow-hidden overflow-x-auto" style={{ borderColor: 'var(--border-color)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex-1 py-2.5 text-xs sm:text-sm font-medium transition-all whitespace-nowrap px-2"
            style={{
              backgroundColor: tab === t.key ? 'var(--primary-color)' : 'var(--bg-card)',
              color: tab === t.key ? '#fff' : 'var(--text-muted)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== TAB 1: All Documents ===== */}
      {tab === 'documents' && (
        <div className="space-y-3">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Total', count: activeDocuments.length, color: 'var(--primary-color)' },
              { label: 'Expiring <30d', count: activeDocuments.filter(d => { const x = daysUntil(d.expiry_date); return x !== null && x >= 0 && x < 30 }).length, color: '#D97706' },
              { label: 'Expired', count: activeDocuments.filter(d => { const x = daysUntil(d.expiry_date); return x !== null && x < 0 }).length, color: '#DC2626' },
              { label: 'Archived', count: archivedDocuments.length, color: '#64748B' },
            ].map(s => (
              <div key={s.label} className="rounded-xl border p-3 text-center" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                <p className="text-2xl font-bold" style={{ color: s.color }}>{s.count}</p>
                <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="text-sm rounded-lg border px-3 py-2"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
              <option value="">All Categories</option>
              {CATEGORY_LIST.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
              className="text-sm rounded-lg border px-3 py-2"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="text-sm rounded-lg border px-3 py-2"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="expiring">Expiring Soon</option>
              <option value="archived">Archived</option>
            </select>
            <div className="relative flex-1 min-w-[180px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input type="text" placeholder="Search documents..." value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="w-full text-sm rounded-lg border pl-9 pr-3 py-2"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
            </div>
          </div>

          {/* Document list */}
          {filteredDocuments.length === 0 && (
            <div className="text-center py-12 rounded-xl border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
              <FolderOpen size={32} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {documents.length === 0 ? 'No documents yet. Upload your first document.' : 'No documents match your filters.'}
              </p>
            </div>
          )}

          <div className="space-y-2">
            {filteredDocuments.map(doc => <DocCard key={doc.id} doc={doc} />)}
          </div>
        </div>
      )}

      {/* ===== TAB 2: Document Matrix ===== */}
      {tab === 'matrix' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <select value={matrixProject} onChange={e => setMatrixProject(e.target.value)}
              className="text-sm rounded-lg border px-3 py-2"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
              <option value="">Select a project...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-100 border border-green-300 inline-block" /> Signed</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 inline-block" /> Pending</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-50 border border-red-200 inline-block" /> Not Assigned</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-100 border border-slate-200 inline-block" /> N/A</span>
            </div>
          </div>

          {!matrixProject && (
            <div className="text-center py-12 rounded-xl border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
              <LayoutGrid size={32} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Select a project to view the sign-off matrix.</p>
            </div>
          )}

          {matrixProject && (() => {
            const matrixDocs = documents.filter(d =>
              d.project_id === matrixProject &&
              d.requires_signoff &&
              d.status === 'active'
            )
            const matrixOps = operatives // In a more advanced version, filter by project assignment

            if (matrixDocs.length === 0) {
              return (
                <div className="text-center py-12 rounded-xl border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
                  <LayoutGrid size={32} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No documents requiring sign-off for this project.</p>
                </div>
              )
            }

            return (
              <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 text-left px-3 py-2.5 border-b font-semibold min-w-[180px]"
                        style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-card)' }}>
                        Document
                      </th>
                      {matrixOps.map(op => (
                        <th key={op.id} className="px-2 py-2.5 border-b text-center font-medium min-w-[80px] max-w-[100px]"
                          style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                          <div className="truncate">{op.name?.split(' ')[0]}</div>
                          <div className="text-[9px] font-normal truncate">{op.name?.split(' ').slice(1).join(' ')}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixDocs.map(doc => (
                      <tr key={doc.id}>
                        <td className="sticky left-0 z-10 px-3 py-2 border-b font-medium"
                          style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-card)' }}>
                          <div className="flex items-center gap-1.5">
                            <CategoryBadge category={doc.category} />
                            <span className="truncate max-w-[140px]">{doc.title}</span>
                          </div>
                        </td>
                        {matrixOps.map(op => {
                          const so = signoffs.find(s =>
                            s.document_id === doc.id &&
                            s.operative_id === op.id &&
                            s.status !== 'invalidated'
                          )
                          let cellBg, cellIcon, status
                          if (so?.status === 'signed') {
                            cellBg = 'bg-green-50'
                            cellIcon = <CheckCircle size={14} className="text-green-600" />
                            status = 'signed'
                          } else if (so?.status === 'pending') {
                            cellBg = 'bg-amber-50'
                            cellIcon = <Clock size={14} className="text-amber-600" />
                            status = 'pending'
                          } else {
                            cellBg = 'bg-red-50'
                            cellIcon = <XCircle size={14} className="text-red-400" />
                            status = 'not_assigned'
                          }

                          return (
                            <td key={op.id} className={`px-2 py-2 border-b text-center ${cellBg} cursor-pointer hover:opacity-80 transition-opacity`}
                              style={{ borderColor: 'var(--border-color)' }}
                              onClick={() => setShowCellDetail({
                                docId: doc.id,
                                opId: op.id,
                                docTitle: doc.title,
                                opName: op.name,
                                status,
                                signed_at: so?.signed_at,
                              })}>
                              {cellIcon}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })()}
        </div>
      )}

      {/* ===== TAB 3: Packs ===== */}
      {tab === 'packs' && (
        <div className="space-y-3">
          <button onClick={() => setShowCreatePack(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--primary-color)' }}>
            <Plus size={16} /> Create Pack
          </button>

          {packs.length === 0 && (
            <div className="text-center py-12 rounded-xl border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
              <Package size={32} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No document packs yet. Create one to group documents together.</p>
            </div>
          )}

          {packs.map(pack => {
            const docIds = pack.document_ids || []
            const packDocs = documents.filter(d => docIds.includes(d.id))
            const projectName = projects.find(p => p.id === pack.project_id)?.name
            const isExpanded = expandedPack === pack.id

            return (
              <div key={pack.id} className="rounded-xl border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                <div className="flex items-center gap-3 p-4">
                  <button onClick={() => setExpandedPack(isExpanded ? null : pack.id)} className="shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </button>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-blue-50">
                    <Package size={20} style={{ color: 'var(--primary-color)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{pack.name}</h3>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {docIds.length} document(s) {projectName ? `\u00b7 ${projectName}` : ''} {'\u00b7'} by {pack.created_by}
                    </p>
                  </div>
                  <button onClick={() => { setShowSendPack(pack); setPackSendSelections([]) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white shrink-0"
                    style={{ backgroundColor: 'var(--primary-color)' }}>
                    <Send size={12} /> Send
                  </button>
                </div>
                {isExpanded && (
                  <div className="border-t px-4 pb-4 pt-2 space-y-1.5" style={{ borderColor: 'var(--border-color)' }}>
                    {packDocs.length === 0 && (
                      <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>No documents found (they may have been deleted).</p>
                    )}
                    {packDocs.map(doc => (
                      <div key={doc.id} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-lg hover:bg-black/5 transition-colors">
                        <CategoryBadge category={doc.category} />
                        <span className="truncate" style={{ color: 'var(--text-primary)' }}>{doc.title}</span>
                        <span className="text-[10px] ml-auto shrink-0" style={{ color: 'var(--text-muted)' }}>v{doc.version || 1}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ===== TAB 4: Templates ===== */}
      {tab === 'templates' && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Documents saved as templates can be cloned to any project. Upload a document with "Save as template" enabled, or mark existing documents as templates.
          </p>

          {templateDocuments.length === 0 && (
            <div className="text-center py-12 rounded-xl border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
              <Copy size={32} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No templates yet. Upload a document and enable "Save as template".</p>
            </div>
          )}

          {templateDocuments.map(doc => {
            const FileIcon = fileIcon(doc.file_name)
            const catConfig = CATEGORIES[doc.category] || CATEGORIES['Other']
            return (
              <div key={doc.id} className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: catConfig.color + '18' }}>
                    <FileIcon size={20} style={{ color: catConfig.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <CategoryBadge category={doc.category} />
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">Template</span>
                    </div>
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{doc.title}</h3>
                    {doc.description && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{doc.description}</p>
                    )}
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      {doc.file_name} {'\u00b7'} Uploaded {formatDate(doc.created_at)} by {doc.uploaded_by}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => handleView(doc)}
                      className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border"
                      style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                      <Eye size={12} /> View
                    </button>
                    <button onClick={() => { setShowCloneTemplate(doc); setCloneProjectId('') }}
                      className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg text-white"
                      style={{ backgroundColor: 'var(--primary-color)' }}>
                      <Copy size={12} /> Clone to Project
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ===== TAB 5: Expiring & Reviews ===== */}
      {tab === 'expiring' && (
        <div className="space-y-6">
          {/* Expiring Soon */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <CalendarClock size={18} className="text-amber-500" /> Expiring Soon
            </h2>
            {(() => {
              const expiring = activeDocuments
                .filter(d => {
                  const days = daysUntil(d.expiry_date)
                  return days !== null && days <= 60
                })
                .sort((a, b) => {
                  const da = daysUntil(a.expiry_date) ?? 999
                  const db = daysUntil(b.expiry_date) ?? 999
                  return da - db
                })

              if (expiring.length === 0) {
                return (
                  <div className="text-center py-8 rounded-xl border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
                    <CheckCircle size={24} className="mx-auto mb-2 text-green-500" />
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No documents expiring within 60 days.</p>
                  </div>
                )
              }

              return expiring.map(doc => {
                const days = daysUntil(doc.expiry_date)
                const color = expiryColor(days)
                const projectName = projects.find(p => p.id === doc.project_id)?.name
                return (
                  <div key={doc.id} className="rounded-xl border p-4 flex items-center gap-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + '18' }}>
                      <AlertTriangle size={20} style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <CategoryBadge category={doc.category} />
                        <ExpiryBadge date={doc.expiry_date} />
                      </div>
                      <h3 className="font-semibold text-sm mt-1 truncate" style={{ color: 'var(--text-primary)' }}>{doc.title}</h3>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {projectName || 'Company-wide'} {'\u00b7'} Expires {formatDate(doc.expiry_date)}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => handleView(doc)}
                        className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border"
                        style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                        <Eye size={12} /> View
                      </button>
                      <button onClick={() => setShowVersionUpload(doc)}
                        className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg text-white"
                        style={{ backgroundColor: 'var(--primary-color)' }}>
                        <RefreshCw size={12} /> Renew
                      </button>
                    </div>
                  </div>
                )
              })
            })()}
          </div>

          {/* Review Due */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Clock size={18} className="text-blue-500" /> Review Due
            </h2>
            {(() => {
              const reviewDue = activeDocuments
                .filter(d => {
                  const days = daysUntil(d.review_date)
                  return days !== null && days <= 14
                })
                .sort((a, b) => {
                  const da = daysUntil(a.review_date) ?? 999
                  const db = daysUntil(b.review_date) ?? 999
                  return da - db
                })

              if (reviewDue.length === 0) {
                return (
                  <div className="text-center py-8 rounded-xl border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
                    <CheckCircle size={24} className="mx-auto mb-2 text-green-500" />
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No documents due for review.</p>
                  </div>
                )
              }

              return reviewDue.map(doc => {
                const days = daysUntil(doc.review_date)
                const overdue = days < 0
                const projectName = projects.find(p => p.id === doc.project_id)?.name
                return (
                  <div key={doc.id} className="rounded-xl border p-4 flex items-center gap-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: overdue ? '#DC262618' : '#2563EB18' }}>
                      <Clock size={20} style={{ color: overdue ? '#DC2626' : '#2563EB' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <CategoryBadge category={doc.category} />
                        {overdue ? (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                            Overdue by {Math.abs(days)}d
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            Due in {days}d
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-sm mt-1 truncate" style={{ color: 'var(--text-primary)' }}>{doc.title}</h3>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {projectName || 'Company-wide'} {'\u00b7'} Review by {formatDate(doc.review_date)}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => handleView(doc)}
                        className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border"
                        style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                        <Eye size={12} /> View
                      </button>
                      <button onClick={() => { setShowEditDoc(doc); setEditForm({ ...doc, tags: (doc.tags || []).join(', ') }) }}
                        className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg text-white"
                        style={{ backgroundColor: 'var(--primary-color)' }}>
                        <Edit2 size={12} /> Review
                      </button>
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
