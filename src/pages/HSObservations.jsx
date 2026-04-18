import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import { getSession } from '../lib/storage'
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import {
  Eye, Plus, X, Search, ChevronLeft, ChevronDown, Camera, Trash2,
  CheckCircle, AlertTriangle, Clock, Shield, TrendingUp, XCircle,
  Edit2, Filter, Calendar, MapPin, User, MessageSquare, Loader2
} from 'lucide-react'

// ── Category configuration ──
const CATEGORIES = [
  'Company Standard / Compliance',
  'Improvement Required / Minor / Medium Hazard',
  'Stop Work / Major Hazard',
  'Best Practice / Innovation',
]

const CATEGORY_COLOURS = {
  'Company Standard / Compliance': '#2563EB',
  'Improvement Required / Minor / Medium Hazard': '#D29922',
  'Stop Work / Major Hazard': '#DC2626',
  'Best Practice / Innovation': '#059669',
}

// ── Priority configuration ──
const PRIORITIES = [
  'Immediate',
  'As soon as possible',
  'Within 24 hours',
  'Note',
  'Advice',
]

const PRIORITY_COLOURS = {
  'Immediate': '#DC2626',
  'As soon as possible': '#EA580C',
  'Within 24 hours': '#D29922',
  'Note': '#6B7280',
  'Advice': '#2563EB',
}

// ── Status configuration ──
const STATUSES = ['Open', 'In Progress', 'Closed']

const STATUS_STYLES = {
  'Open': { bg: '#FEF2F2', text: '#DC2626', label: 'Open' },
  'In Progress': { bg: '#FFF7ED', text: '#EA580C', label: 'In Progress' },
  'Closed': { bg: '#F0FDF4', text: '#16A34A', label: 'Closed' },
}

// ── Helpers ──
function formatDate(d) {
  if (!d) return '\u2014'
  const date = new Date(d)
  const day = String(date.getDate()).padStart(2, '0')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const mon = months[date.getMonth()]
  const year = date.getFullYear()
  return `${day}-${mon}-${year}`
}

function todayISO() {
  const d = new Date()
  return d.toISOString().split('T')[0]
}

function parseJson(r) {
  if (!r) return []
  if (Array.isArray(r)) return r
  if (typeof r === 'string') { try { return JSON.parse(r) } catch { return [] } }
  return []
}


export default function HSObservations() {
  const { user } = useCompany()
  const cid = user?.company_id
  const managerData = user || JSON.parse(getSession('manager_data') || '{}')
  const managerName = managerData.name || 'User'

  // Main state
  const [loading, setLoading] = useState(true)
  const [observations, setObservations] = useState([])
  const [projects, setProjects] = useState([])
  const [visibleCount, setVisibleCount] = useState(50)

  // Filters
  const [filterProject, setFilterProject] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [searchText, setSearchText] = useState('')

  // New observation modal
  const [showNewModal, setShowNewModal] = useState(false)
  const [form, setForm] = useState({
    project_id: '', category: '', priority: '', observation_date: todayISO(),
    location: '', comment: '', assigned_to: '', photos: [],
  })
  const [saving, setSaving] = useState(false)
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const fileInputRef = useRef(null)

  // Detail view
  const [selected, setSelected] = useState(null)
  const [closeNotes, setCloseNotes] = useState('')
  const [showCloseForm, setShowCloseForm] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [editingAssigned, setEditingAssigned] = useState(false)
  const [assignedValue, setAssignedValue] = useState('')

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState(null)

  // ── Data loading ──
  const loadData = useCallback(async () => {
    if (!cid) return
    setLoading(true)
    const [obsRes, prRes] = await Promise.all([
      supabase.from('hs_observations').select('*').eq('company_id', cid).order('observation_date', { ascending: false }),
      supabase.from('projects').select('id, name').eq('company_id', cid).order('name'),
    ])
    setObservations(obsRes.data || [])
    setProjects(prRes.data || [])
    setLoading(false)
  }, [cid])

  useEffect(() => {
    if (cid) loadData()
  }, [cid, loadData])

  // ── Filtering ──
  const filtered = observations.filter(o => {
    if (filterProject && o.project_id !== filterProject) return false
    if (filterCategory && o.category !== filterCategory) return false
    if (filterStatus && o.status !== filterStatus) return false
    if (filterPriority && o.priority !== filterPriority) return false
    if (filterDateFrom && o.observation_date < filterDateFrom) return false
    if (filterDateTo && o.observation_date > filterDateTo) return false
    if (searchText) {
      const s = searchText.toLowerCase()
      const matchComment = o.comment?.toLowerCase().includes(s)
      const matchLocation = o.location?.toLowerCase().includes(s)
      const matchObserver = o.observed_by?.toLowerCase().includes(s)
      const matchAssigned = o.assigned_to?.toLowerCase().includes(s)
      if (!matchComment && !matchLocation && !matchObserver && !matchAssigned) return false
    }
    return true
  })

  const visible = filtered.slice(0, visibleCount)

  // ── Stats ──
  const totalCount = observations.length
  const openCount = observations.filter(o => o.status === 'Open').length
  const positiveCount = observations.filter(o =>
    o.category === 'Company Standard / Compliance' || o.category === 'Best Practice / Innovation'
  ).length
  const stopWorkCount = observations.filter(o => o.category === 'Stop Work / Major Hazard').length

  // ── Photo upload ──
  async function handlePhotoUpload(files) {
    if (!files.length) return
    const remaining = 5 - form.photos.length
    if (remaining <= 0) return toast.error('Maximum 5 photos allowed')
    const toUpload = Array.from(files).slice(0, remaining)
    setUploadingPhotos(true)
    const uploaded = []
    for (const file of toUpload) {
      if (file.size > 10 * 1024 * 1024) { toast.error('Photo must be under 10MB'); continue }
      const ext = file.name.split('.').pop()
      const path = `observations/temp/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(path, file, { contentType: file.type })
      if (!error) {
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        uploaded.push(urlData.publicUrl)
      }
    }
    setForm(prev => ({ ...prev, photos: [...prev.photos, ...uploaded] }))
    setUploadingPhotos(false)
    if (uploaded.length) toast.success(`${uploaded.length} photo(s) uploaded`)
  }

  function removeFormPhoto(idx) {
    setForm(prev => ({ ...prev, photos: prev.photos.filter((_, i) => i !== idx) }))
  }

  // ── Submit new observation ──
  async function handleSubmit() {
    if (!form.category) return toast.error('Select a category')
    if (!form.priority) return toast.error('Select a priority')
    if (!form.comment.trim()) return toast.error('Enter a comment')

    setSaving(true)
    try {
      const { data, error } = await supabase.from('hs_observations').insert({
        company_id: cid,
        project_id: form.project_id || null,
        observation_date: form.observation_date,
        category: form.category,
        priority: form.priority,
        comment: form.comment.trim(),
        location: form.location.trim() || null,
        observed_by: managerName,
        observed_by_id: managerData.id || null,
        assigned_to: form.assigned_to.trim() || null,
        status: 'Open',
        photos: form.photos,
        is_read: false,
      }).select().single()

      if (error) throw error

      // Move photos from temp to permanent path
      if (form.photos.length > 0 && data?.id) {
        const movedUrls = []
        for (const url of form.photos) {
          const oldPath = url.split('/documents/')[1]
          if (oldPath && oldPath.startsWith('observations/temp/')) {
            const fileName = oldPath.split('/').pop()
            const newPath = `observations/${cid}/${data.id}/${fileName}`
            const { error: moveErr } = await supabase.storage.from('documents').move(oldPath, newPath)
            if (!moveErr) {
              const { data: newUrl } = supabase.storage.from('documents').getPublicUrl(newPath)
              movedUrls.push(newUrl.publicUrl)
            } else {
              movedUrls.push(url) // keep original if move fails
            }
          } else {
            movedUrls.push(url)
          }
        }
        await supabase.from('hs_observations').update({ photos: movedUrls }).eq('id', data.id)
      }

      toast.success('Observation recorded')
      resetForm()
      loadData()
    } catch (err) {
      toast.error('Failed to save observation')
    }
    setSaving(false)
  }

  function resetForm() {
    setShowNewModal(false)
    setForm({
      project_id: '', category: '', priority: '', observation_date: todayISO(),
      location: '', comment: '', assigned_to: '', photos: [],
    })
  }

  // ── Detail actions ──
  async function openDetail(obs) {
    setSelected(obs)
    setCloseNotes('')
    setShowCloseForm(false)
    setEditingAssigned(false)
    setAssignedValue(obs.assigned_to || '')
    // Mark as read
    if (!obs.is_read) {
      await supabase.from('hs_observations').update({ is_read: true }).eq('id', obs.id)
      setObservations(prev => prev.map(o => o.id === obs.id ? { ...o, is_read: true } : o))
    }
  }

  async function updateStatus(newStatus) {
    if (!selected) return
    if (newStatus === 'Closed' && !closeNotes.trim()) {
      return toast.error('Close notes are required')
    }
    setActionLoading(true)
    const updates = { status: newStatus }
    if (newStatus === 'Closed') {
      updates.closed_by = managerName
      updates.closed_at = new Date().toISOString()
      updates.close_notes = closeNotes.trim()
    }
    const { error } = await supabase.from('hs_observations').update(updates).eq('id', selected.id)
    if (!error) {
      toast.success(`Status updated to ${newStatus}`)
      setSelected(prev => ({ ...prev, ...updates }))
      loadData()
      setShowCloseForm(false)
    } else {
      toast.error('Failed to update status')
    }
    setActionLoading(false)
  }

  async function saveAssigned() {
    if (!selected) return
    setActionLoading(true)
    const { error } = await supabase.from('hs_observations')
      .update({ assigned_to: assignedValue.trim() || null })
      .eq('id', selected.id)
    if (!error) {
      toast.success('Assigned to updated')
      setSelected(prev => ({ ...prev, assigned_to: assignedValue.trim() || null }))
      setEditingAssigned(false)
      loadData()
    } else {
      toast.error('Failed to update')
    }
    setActionLoading(false)
  }

  // ── Render ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--primary-color)' }} />
      </div>
    )
  }

  // ── Detail View ──
  if (selected) {
    const o = selected
    const photos = parseJson(o.photos)
    const catColor = CATEGORY_COLOURS[o.category] || '#6B7280'
    const prioColor = PRIORITY_COLOURS[o.priority] || '#6B7280'
    const statusStyle = STATUS_STYLES[o.status] || STATUS_STYLES['Open']
    const projectName = projects.find(p => p.id === o.project_id)?.name || '\u2014'

    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-sm font-medium mb-2"
          style={{ color: 'var(--primary-color)' }}
        >
          <ChevronLeft size={16} /> Back to observations
        </button>

        {/* Header card */}
        <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: catColor + '18', color: catColor }}>{o.category}</span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: prioColor + '18', color: prioColor }}>{o.priority}</span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}>{statusStyle.label}</span>
              </div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Observation Detail</h2>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>Date</p>
              <p style={{ color: 'var(--text-primary)' }}>{formatDate(o.observation_date)}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>Location</p>
              <p style={{ color: 'var(--text-primary)' }}>{o.location || '\u2014'}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>Observed By</p>
              <p style={{ color: 'var(--text-primary)' }}>{o.observed_by || '\u2014'}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>Project</p>
              <p style={{ color: 'var(--text-primary)' }}>{projectName}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>Assigned To</p>
              {editingAssigned ? (
                <div className="flex items-center gap-1">
                  <input
                    value={assignedValue}
                    onChange={e => setAssignedValue(e.target.value)}
                    className="text-sm border rounded px-2 py-0.5 w-full"
                    style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                  <button onClick={saveAssigned} disabled={actionLoading} className="text-green-600 hover:text-green-700"><CheckCircle size={16} /></button>
                  <button onClick={() => setEditingAssigned(false)} className="text-red-500 hover:text-red-600"><XCircle size={16} /></button>
                </div>
              ) : (
                <p className="flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                  {o.assigned_to || '\u2014'}
                  <button onClick={() => { setAssignedValue(o.assigned_to || ''); setEditingAssigned(true) }} className="text-xs hover:opacity-70" style={{ color: 'var(--primary-color)' }}><Edit2 size={12} /></button>
                </p>
              )}
            </div>
          </div>

          {/* Comment */}
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Comment</p>
            <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-primary)' }}>{o.comment}</p>
          </div>

          {/* Photos */}
          {photos.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Photos</p>
              <div className="flex gap-2 flex-wrap">
                {photos.map((url, i) => (
                  <button key={i} onClick={() => setLightboxUrl(url)} className="rounded-lg overflow-hidden border hover:ring-2 hover:ring-blue-400 transition-all" style={{ borderColor: 'var(--border-color)' }}>
                    <img src={url} alt={`Photo ${i + 1}`} className="w-20 h-20 object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Status actions */}
          <div className="border-t pt-4 space-y-3" style={{ borderColor: 'var(--border-color)' }}>
            {o.status === 'Open' && (
              <div className="flex gap-2 flex-wrap">
                <LoadingButton
                  loading={actionLoading}
                  onClick={() => updateStatus('In Progress')}
                  className="bg-orange-600 hover:bg-orange-700 text-white text-sm px-4 py-2"
                >
                  <Clock size={14} /> Mark In Progress
                </LoadingButton>
                <button
                  onClick={() => setShowCloseForm(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
                >
                  <CheckCircle size={14} /> Close
                </button>
              </div>
            )}
            {o.status === 'In Progress' && (
              <button
                onClick={() => setShowCloseForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
              >
                <CheckCircle size={14} /> Close Observation
              </button>
            )}
            {showCloseForm && (
              <div className="space-y-2 p-3 rounded-lg border" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)' }}>
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Close Notes *</label>
                <textarea
                  value={closeNotes}
                  onChange={e => setCloseNotes(e.target.value)}
                  rows={3}
                  placeholder="Describe the corrective action taken..."
                  className="w-full text-sm border rounded-lg px-3 py-2 resize-none"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
                <div className="flex gap-2">
                  <LoadingButton
                    loading={actionLoading}
                    onClick={() => updateStatus('Closed')}
                    className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2"
                  >
                    Confirm Close
                  </LoadingButton>
                  <button onClick={() => setShowCloseForm(false)} className="text-sm px-3 py-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>Cancel</button>
                </div>
              </div>
            )}
            {o.status === 'Closed' && (
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#F0FDF4' }}>
                <p className="text-xs font-medium text-green-800 mb-1">Closed by {o.closed_by} on {formatDate(o.closed_at)}</p>
                <p className="text-sm text-green-700">{o.close_notes}</p>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="border-t pt-4" style={{ borderColor: 'var(--border-color)' }}>
            <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-muted)' }}>Timeline</p>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Created</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(o.created_at)} by {o.observed_by}</p>
                </div>
              </div>
              {o.status === 'In Progress' && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-orange-500 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>In Progress</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Status changed to In Progress</p>
                  </div>
                </div>
              )}
              {o.status === 'Closed' && (
                <>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-orange-500 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>In Progress</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Status changed</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Closed</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(o.closed_at)} by {o.closed_by}</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Main list view ──
  const hasFilters = filterProject || filterCategory || filterStatus || filterPriority || filterDateFrom || filterDateTo || searchText

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>H&S Observations</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{totalCount} observation{totalCount !== 1 ? 's' : ''} recorded</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: 'var(--primary-color)' }}
        >
          <Plus size={16} /> New Observation
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Eye size={16} style={{ color: 'var(--primary-color)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Total</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{totalCount}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: openCount > 0 ? '#FCA5A5' : 'var(--border-color)' }}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={16} className={openCount > 0 ? 'text-red-500' : ''} style={openCount === 0 ? { color: 'var(--text-muted)' } : {}} />
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Open</span>
          </div>
          <p className={`text-2xl font-bold ${openCount > 0 ? 'text-red-600' : ''}`} style={openCount === 0 ? { color: 'var(--text-primary)' } : {}}>{openCount}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={16} className="text-green-600" />
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Positive</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{positiveCount}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: stopWorkCount > 0 ? '#FCA5A5' : 'var(--border-color)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Shield size={16} className={stopWorkCount > 0 ? 'text-red-500' : ''} style={stopWorkCount === 0 ? { color: 'var(--text-muted)' } : {}} />
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Stop Work</span>
          </div>
          <p className={`text-2xl font-bold ${stopWorkCount > 0 ? 'text-red-600' : ''}`} style={stopWorkCount === 0 ? { color: 'var(--text-primary)' } : {}}>{stopWorkCount}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border p-3 space-y-2" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <select
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
            className="text-sm border rounded-lg px-2.5 py-2 truncate"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="text-sm border rounded-lg px-2.5 py-2 truncate"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-sm border rounded-lg px-2.5 py-2"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            className="text-sm border rounded-lg px-2.5 py-2 truncate"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            <option value="">All Priorities</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input
            type="date"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
            placeholder="From"
            className="text-sm border rounded-lg px-2.5 py-2"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          />
          <input
            type="date"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
            placeholder="To"
            className="text-sm border rounded-lg px-2.5 py-2"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Search comments, location, observer..."
              className="w-full text-sm border rounded-lg pl-8 pr-3 py-2"
              style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
          </div>
          {hasFilters && (
            <button
              onClick={() => { setFilterProject(''); setFilterCategory(''); setFilterStatus(''); setFilterPriority(''); setFilterDateFrom(''); setFilterDateTo(''); setSearchText('') }}
              className="text-xs font-medium px-3 py-2 rounded-lg border hover:bg-red-50 text-red-600 transition-colors shrink-0"
              style={{ borderColor: 'var(--border-color)' }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      {hasFilters && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''} found</p>
      )}

      {/* Desktop table */}
      <div className="hidden lg:block rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Category</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Priority</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Comment</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Location</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Observed By</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</th>
              <th className="text-center px-2 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-12">
                  <Eye size={32} className="mx-auto mb-2 opacity-30" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {hasFilters ? 'No observations match your filters' : 'No observations recorded yet'}
                  </p>
                </td>
              </tr>
            )}
            {visible.map(o => {
              const catColor = CATEGORY_COLOURS[o.category] || '#6B7280'
              const prioColor = PRIORITY_COLOURS[o.priority] || '#6B7280'
              const statusStyle = STATUS_STYLES[o.status] || STATUS_STYLES['Open']
              return (
                <tr
                  key={o.id}
                  onClick={() => openDetail(o)}
                  className="cursor-pointer transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                  style={{ borderBottom: '1px solid var(--border-color)' }}
                >
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{formatDate(o.observation_date)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: catColor + '18', color: catColor }}>
                      {o.category?.split(' / ')[0]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: prioColor + '18', color: prioColor }}>
                      {o.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[280px]">
                    <p className="text-sm line-clamp-2" style={{ color: 'var(--text-primary)' }} title={o.comment}>{o.comment}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{o.location || '\u2014'}</td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{o.observed_by || '\u2014'}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}>
                      {statusStyle.label}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-center">
                    {!o.is_read && <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" title="Unread" />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {visible.length === 0 && (
          <div className="text-center py-12 rounded-xl border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <Eye size={32} className="mx-auto mb-2 opacity-30" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {hasFilters ? 'No observations match your filters' : 'No observations recorded yet'}
            </p>
          </div>
        )}
        {visible.map(o => {
          const catColor = CATEGORY_COLOURS[o.category] || '#6B7280'
          const prioColor = PRIORITY_COLOURS[o.priority] || '#6B7280'
          const statusStyle = STATUS_STYLES[o.status] || STATUS_STYLES['Open']
          return (
            <button
              key={o.id}
              onClick={() => openDetail(o)}
              className="w-full text-left rounded-xl border p-3.5 space-y-2 transition-colors active:bg-black/[0.02]"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: catColor + '18', color: catColor }}>
                    {o.category?.split(' / ')[0]}
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: prioColor + '18', color: prioColor }}>
                    {o.priority}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}>
                    {statusStyle.label}
                  </span>
                  {!o.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                </div>
              </div>
              <p className="text-sm line-clamp-2" style={{ color: 'var(--text-primary)' }}>{o.comment}</p>
              <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span className="flex items-center gap-1"><Calendar size={11} /> {formatDate(o.observation_date)}</span>
                {o.location && <span className="flex items-center gap-1"><MapPin size={11} /> {o.location}</span>}
                <span className="flex items-center gap-1"><User size={11} /> {o.observed_by}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Load more */}
      {filtered.length > visibleCount && (
        <div className="text-center">
          <button
            onClick={() => setVisibleCount(prev => prev + 50)}
            className="text-sm font-medium px-6 py-2.5 rounded-lg border transition-colors"
            style={{ color: 'var(--primary-color)', borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
          >
            Load More ({filtered.length - visibleCount} remaining)
          </button>
        </div>
      )}

      {/* New Observation Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 sm:pt-16 overflow-y-auto">
          <div className="absolute inset-0 bg-black/50" onClick={resetForm} />
          <div className="relative rounded-xl border shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>New Observation</h2>
              <button onClick={resetForm} className="p-1 rounded-lg hover:bg-black/5 transition-colors" style={{ color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Project */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Project</label>
                <select
                  value={form.project_id}
                  onChange={e => setForm(prev => ({ ...prev, project_id: e.target.value }))}
                  className="w-full text-sm border rounded-lg px-3 py-2.5"
                  style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="">Select project (optional)</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Category *</label>
                <select
                  value={form.category}
                  onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full text-sm border rounded-lg px-3 py-2.5"
                  style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="">Select category</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Priority *</label>
                <select
                  value={form.priority}
                  onChange={e => setForm(prev => ({ ...prev, priority: e.target.value }))}
                  className="w-full text-sm border rounded-lg px-3 py-2.5"
                  style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="">Select priority</option>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Date</label>
                <input
                  type="date"
                  value={form.observation_date}
                  onChange={e => setForm(prev => ({ ...prev, observation_date: e.target.value }))}
                  className="w-full text-sm border rounded-lg px-3 py-2.5"
                  style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* Location */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Location</label>
                <input
                  value={form.location}
                  onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="e.g. Block A, Level 3"
                  className="w-full text-sm border rounded-lg px-3 py-2.5"
                  style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* Comment */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Comment *</label>
                <textarea
                  value={form.comment}
                  onChange={e => setForm(prev => ({ ...prev, comment: e.target.value }))}
                  rows={4}
                  placeholder="Describe the observation..."
                  className="w-full text-sm border rounded-lg px-3 py-2.5 resize-none"
                  style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* Assigned to */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Assigned To</label>
                <input
                  value={form.assigned_to}
                  onChange={e => setForm(prev => ({ ...prev, assigned_to: e.target.value }))}
                  placeholder="Name of responsible person or company"
                  className="w-full text-sm border rounded-lg px-3 py-2.5"
                  style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* Photos */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Photos ({form.photos.length}/5)</label>
                {form.photos.length > 0 && (
                  <div className="flex gap-2 flex-wrap mb-2">
                    {form.photos.map((url, i) => (
                      <div key={i} className="relative group">
                        <img src={url} alt="" className="w-16 h-16 rounded-lg object-cover border" style={{ borderColor: 'var(--border-color)' }} />
                        <button
                          onClick={() => removeFormPhoto(i)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {form.photos.length < 5 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhotos}
                    className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border transition-colors hover:bg-black/[0.02]"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
                  >
                    {uploadingPhotos ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                    {uploadingPhotos ? 'Uploading...' : 'Add Photos'}
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => handlePhotoUpload(e.target.files)}
                />
              </div>

              {/* Submit */}
              <div className="flex gap-2 pt-2">
                <LoadingButton
                  loading={saving}
                  onClick={handleSubmit}
                  className="flex-1 text-white text-sm py-2.5"
                  style={{ backgroundColor: 'var(--primary-color)' }}
                >
                  Submit Observation
                </LoadingButton>
                <button
                  onClick={resetForm}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80" onClick={() => setLightboxUrl(null)}>
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X size={20} />
          </button>
          <img src={lightboxUrl} alt="Full size" className="max-w-full max-h-[90vh] rounded-lg object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
