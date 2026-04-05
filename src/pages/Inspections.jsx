import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import {
  CheckSquare, Plus, X, Check, AlertTriangle, FileText,
  Trash2, Camera, ClipboardList
} from 'lucide-react'

const CATEGORIES = [
  'Pre-Plaster',
  'Pre-Handover',
  'Fire Stopping',
  'M&E First Fix',
  'Commissioning',
  'General',
]

const DEFAULT_TEMPLATES = [
  {
    name: 'Site Induction Check',
    category: 'General',
    description: 'Standard site induction checklist for new operatives',
    items: [
      { label: 'PPE worn correctly', category: 'General' },
      { label: 'Site rules explained', category: 'General' },
      { label: 'Emergency procedures understood', category: 'General' },
      { label: 'Welfare facilities shown', category: 'General' },
      { label: 'CSCS card verified', category: 'General' },
    ],
  },
  {
    name: 'Pre-Plaster Inspection',
    category: 'Pre-Plaster',
    description: 'Checks to complete before plastering begins',
    items: [
      { label: 'First fix electrics complete', category: 'Pre-Plaster' },
      { label: 'First fix plumbing complete', category: 'Pre-Plaster' },
      { label: 'Window and door frames fitted', category: 'Pre-Plaster' },
      { label: 'Cavity barriers installed', category: 'Pre-Plaster' },
      { label: 'Lintels and beads in place', category: 'Pre-Plaster' },
      { label: 'Insulation fitted correctly', category: 'Pre-Plaster' },
    ],
  },
  {
    name: 'Fire Stopping Inspection',
    category: 'Fire Stopping',
    description: 'Fire stopping compliance checks',
    items: [
      { label: 'Penetration seals installed', category: 'Fire Stopping' },
      { label: 'Fire doors correctly hung', category: 'Fire Stopping' },
      { label: 'Intumescent strips fitted', category: 'Fire Stopping' },
      { label: 'Cavity barriers in place', category: 'Fire Stopping' },
      { label: 'Fire stopping certification available', category: 'Fire Stopping' },
    ],
  },
]

export default function Inspections() {
  const { user } = useCompany()
  const cid = user?.company_id

  const [tab, setTab] = useState('inspections')

  // Data
  const [templates, setTemplates] = useState([])
  const [inspections, setInspections] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  // Template form
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [tplName, setTplName] = useState('')
  const [tplCategory, setTplCategory] = useState('General')
  const [tplDescription, setTplDescription] = useState('')
  const [tplItems, setTplItems] = useState([])
  const [newItemText, setNewItemText] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  // Inspection form
  const [showInspectionForm, setShowInspectionForm] = useState(false)
  const [selTemplateId, setSelTemplateId] = useState('')
  const [selProjectId, setSelProjectId] = useState('')
  const [inspLocation, setInspLocation] = useState('')
  const [inspInspector, setInspInspector] = useState('')
  const [savingInspection, setSavingInspection] = useState(false)

  // Active inspection
  const [activeInspection, setActiveInspection] = useState(null)
  const [results, setResults] = useState([])
  const [overallNotes, setOverallNotes] = useState('')
  const [completing, setCompleting] = useState(false)

  useEffect(() => {
    if (cid) loadData()
  }, [cid])

  useEffect(() => {
    if (user?.name && !inspInspector) setInspInspector(user.name)
  }, [user])

  async function loadData() {
    setLoading(true)
    const [t, i, p] = await Promise.all([
      supabase.from('inspection_templates').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('inspections').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name').eq('company_id', cid).order('name'),
    ])
    setTemplates(t.data || [])
    setInspections(i.data || [])
    setProjects(p.data || [])
    setLoading(false)
  }

  // ---------- Templates ----------

  function resetTemplateForm() {
    setTplName('')
    setTplCategory('General')
    setTplDescription('')
    setTplItems([])
    setNewItemText('')
    setShowTemplateForm(false)
  }

  function addItem() {
    const text = newItemText.trim()
    if (!text) return
    setTplItems(prev => [...prev, { label: text, category: tplCategory }])
    setNewItemText('')
  }

  function removeItem(idx) {
    setTplItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function saveTemplate() {
    if (!tplName.trim()) return toast.error('Template name is required')
    if (tplItems.length === 0) return toast.error('Add at least one item')
    setSavingTemplate(true)
    const { error } = await supabase.from('inspection_templates').insert({
      company_id: cid,
      name: tplName.trim(),
      description: tplDescription.trim(),
      category: tplCategory,
      items: tplItems,
      created_by: user?.id,
    })
    setSavingTemplate(false)
    if (error) return toast.error('Failed to save template')
    toast.success('Template saved')
    resetTemplateForm()
    loadData()
  }

  async function loadDefaults() {
    const rows = DEFAULT_TEMPLATES.map(t => ({
      company_id: cid,
      name: t.name,
      description: t.description,
      category: t.category,
      items: t.items,
      created_by: user?.id,
    }))
    const { error } = await supabase.from('inspection_templates').insert(rows)
    if (error) return toast.error('Failed to load defaults')
    toast.success('Default templates loaded')
    loadData()
  }

  // ---------- Inspections ----------

  function resetInspectionForm() {
    setSelTemplateId('')
    setSelProjectId('')
    setInspLocation('')
    setInspInspector(user?.name || '')
    setShowInspectionForm(false)
  }

  async function startInspection() {
    if (!selTemplateId) return toast.error('Select a template')
    if (!selProjectId) return toast.error('Select a project')
    if (!inspLocation.trim()) return toast.error('Enter a location')
    const template = templates.find(t => t.id === selTemplateId)
    if (!template) return toast.error('Template not found')

    setSavingInspection(true)
    const initialResults = template.items.map(item => ({
      label: item.label,
      result: null,
      notes: '',
      photo_url: null,
    }))
    const { data, error } = await supabase.from('inspections').insert({
      company_id: cid,
      project_id: selProjectId,
      template_id: selTemplateId,
      template_name: template.name,
      location: inspLocation.trim(),
      inspector_name: inspInspector.trim() || user?.name || 'Unknown',
      status: 'in_progress',
      results: initialResults,
      notes: '',
    }).select().single()
    setSavingInspection(false)
    if (error) return toast.error('Failed to create inspection')
    toast.success('Inspection started')
    resetInspectionForm()
    openInspection(data)
    loadData()
  }

  function openInspection(insp) {
    setActiveInspection(insp)
    setResults(insp.results || [])
    setOverallNotes(insp.notes || '')
  }

  function closeInspection() {
    setActiveInspection(null)
    setResults([])
    setOverallNotes('')
  }

  function setItemResult(idx, result) {
    setResults(prev => prev.map((r, i) => i === idx ? { ...r, result } : r))
  }

  function setItemNotes(idx, notes) {
    setResults(prev => prev.map((r, i) => i === idx ? { ...r, notes } : r))
  }

  async function uploadItemPhoto(idx, file) {
    if (!file || !activeInspection) return
    const path = `inspections/${activeInspection.id}/${idx}.jpg`
    const { error } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
    if (error) return toast.error('Photo upload failed')
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
    setResults(prev => prev.map((r, i) => i === idx ? { ...r, photo_url: urlData.publicUrl } : r))
    toast.success('Photo uploaded')
  }

  async function saveProgress() {
    if (!activeInspection) return
    const { error } = await supabase.from('inspections').update({
      results,
      notes: overallNotes,
    }).eq('id', activeInspection.id)
    if (error) return toast.error('Failed to save')
    toast.success('Progress saved')
    loadData()
  }

  async function completeInspection() {
    if (!activeInspection) return
    const unanswered = results.some(r => r.result === null)
    if (unanswered) return toast.error('All items must be marked before completing')
    const hasFail = results.some(r => r.result === 'fail')
    const status = hasFail ? 'failed' : 'completed'
    setCompleting(true)
    const { error } = await supabase.from('inspections').update({
      results,
      notes: overallNotes,
      status,
      completed_at: new Date().toISOString(),
    }).eq('id', activeInspection.id)
    setCompleting(false)
    if (error) return toast.error('Failed to complete inspection')
    toast.success(status === 'completed' ? 'Inspection completed' : 'Inspection marked as failed')
    closeInspection()
    loadData()
  }

  // ---------- Helpers ----------

  function statusBadge(status) {
    const map = {
      in_progress: 'bg-amber-100 text-amber-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    }
    const labels = { in_progress: 'In Progress', completed: 'Completed', failed: 'Failed' }
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status] || 'bg-gray-100 text-gray-600'}`}>
        {labels[status] || status}
      </span>
    )
  }

  function formatDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  // ---------- Active inspection view ----------

  if (activeInspection) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {activeInspection.template_name}
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {activeInspection.location} &middot; {activeInspection.inspector_name}
            </p>
          </div>
          <button onClick={() => { saveProgress(); closeInspection() }} className="p-2 rounded-lg hover:opacity-80" style={{ color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          {results.map((item, idx) => (
            <div key={idx} className="rounded-xl border p-4 space-y-2" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{idx + 1}. {item.label}</p>
              <div className="flex gap-2">
                {['pass', 'fail', 'na'].map(val => {
                  const active = item.result === val
                  const colors = {
                    pass: active ? 'bg-green-500 text-white' : 'bg-green-50 text-green-700 border border-green-200',
                    fail: active ? 'bg-red-500 text-white' : 'bg-red-50 text-red-700 border border-red-200',
                    na: active ? 'bg-gray-500 text-white' : 'bg-gray-50 text-gray-600 border border-gray-200',
                  }
                  const labels = { pass: 'Pass', fail: 'Fail', na: 'N/A' }
                  const icons = { pass: <Check size={14} />, fail: <X size={14} />, na: null }
                  return (
                    <button
                      key={val}
                      onClick={() => setItemResult(idx, val)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${colors[val]}`}
                    >
                      {icons[val]}
                      {labels[val]}
                    </button>
                  )
                })}
              </div>
              <input
                type="text"
                placeholder="Notes (optional)"
                value={item.notes}
                onChange={e => setItemNotes(idx, e.target.value)}
                className="w-full text-sm rounded-lg border px-3 py-2"
                style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                  <Camera size={14} />
                  {item.photo_url ? 'Replace Photo' : 'Add Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={e => uploadItemPhoto(idx, e.target.files[0])}
                  />
                </label>
                {item.photo_url && (
                  <img src={item.photo_url} alt="" className="h-10 w-10 rounded object-cover border" style={{ borderColor: 'var(--border-color)' }} />
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border p-4 space-y-2" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Overall Notes</label>
          <textarea
            rows={3}
            value={overallNotes}
            onChange={e => setOverallNotes(e.target.value)}
            placeholder="Any overall comments..."
            className="w-full text-sm rounded-lg border px-3 py-2 resize-none"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          />
        </div>

        <div className="flex gap-3">
          <LoadingButton
            loading={false}
            onClick={saveProgress}
            className="flex-1 text-white text-sm"
            style={{ backgroundColor: 'var(--primary-color)' }}
          >
            Save Progress
          </LoadingButton>
          <LoadingButton
            loading={completing}
            onClick={completeInspection}
            className="flex-1 bg-green-600 text-white text-sm"
          >
            <CheckSquare size={16} />
            Complete Inspection
          </LoadingButton>
        </div>
      </div>
    )
  }

  // ---------- Main view ----------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--primary-color)' }} />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList size={22} style={{ color: 'var(--primary-color)' }} />
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Inspections</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-color)' }}>
        {['inspections', 'templates'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-medium transition-all ${tab === t ? 'text-white' : ''}`}
            style={{
              backgroundColor: tab === t ? 'var(--primary-color)' : 'var(--bg-card)',
              color: tab === t ? '#fff' : 'var(--text-muted)',
            }}
          >
            {t === 'inspections' ? 'Inspections' : 'Templates'}
          </button>
        ))}
      </div>

      {/* ===== Templates Tab ===== */}
      {tab === 'templates' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setShowTemplateForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--primary-color)' }}
            >
              <Plus size={16} />
              New Template
            </button>
            <button
              onClick={loadDefaults}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-card)' }}
            >
              <FileText size={16} />
              Load Defaults
            </button>
          </div>

          {/* Template form */}
          {showTemplateForm && (
            <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>New Template</h2>
                <button onClick={resetTemplateForm} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
              </div>
              <input
                type="text"
                placeholder="Template name"
                value={tplName}
                onChange={e => setTplName(e.target.value)}
                className="w-full text-sm rounded-lg border px-3 py-2"
                style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
              <select
                value={tplCategory}
                onChange={e => setTplCategory(e.target.value)}
                className="w-full text-sm rounded-lg border px-3 py-2"
                style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <textarea
                placeholder="Description (optional)"
                value={tplDescription}
                onChange={e => setTplDescription(e.target.value)}
                rows={2}
                className="w-full text-sm rounded-lg border px-3 py-2 resize-none"
                style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Checklist item"
                  value={newItemText}
                  onChange={e => setNewItemText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addItem()}
                  className="flex-1 text-sm rounded-lg border px-3 py-2"
                  style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
                <button
                  onClick={addItem}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: 'var(--primary-color)' }}
                >
                  Add Item
                </button>
              </div>
              {tplItems.length > 0 && (
                <ul className="space-y-1">
                  {tplItems.map((item, idx) => (
                    <li key={idx} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                      <span>{idx + 1}. {item.label}</span>
                      <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
              <LoadingButton
                loading={savingTemplate}
                onClick={saveTemplate}
                className="w-full text-white text-sm"
                style={{ backgroundColor: 'var(--primary-color)' }}
              >
                Save Template
              </LoadingButton>
            </div>
          )}

          {/* Template list */}
          {templates.length === 0 && !showTemplateForm && (
            <div className="text-center py-12 rounded-xl border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
              <FileText size={32} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No templates yet. Create one or load defaults.</p>
            </div>
          )}
          {templates.map(t => (
            <div key={t.id} className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{t.name}</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {t.items?.length || 0} items &middot; {t.category}
                  </p>
                  {t.description && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t.description}</p>
                  )}
                </div>
                <CheckSquare size={18} style={{ color: 'var(--primary-color)' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== Inspections Tab ===== */}
      {tab === 'inspections' && (
        <div className="space-y-3">
          <button
            onClick={() => setShowInspectionForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--primary-color)' }}
          >
            <Plus size={16} />
            New Inspection
          </button>

          {/* New inspection form */}
          {showInspectionForm && (
            <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>New Inspection</h2>
                <button onClick={resetInspectionForm} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
              </div>
              <select
                value={selTemplateId}
                onChange={e => setSelTemplateId(e.target.value)}
                className="w-full text-sm rounded-lg border px-3 py-2"
                style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              >
                <option value="">Select template...</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select
                value={selProjectId}
                onChange={e => setSelProjectId(e.target.value)}
                className="w-full text-sm rounded-lg border px-3 py-2"
                style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              >
                <option value="">Select project...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input
                type="text"
                placeholder="Location (e.g. Block A, Floor 2)"
                value={inspLocation}
                onChange={e => setInspLocation(e.target.value)}
                className="w-full text-sm rounded-lg border px-3 py-2"
                style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
              <input
                type="text"
                placeholder="Inspector name"
                value={inspInspector}
                onChange={e => setInspInspector(e.target.value)}
                className="w-full text-sm rounded-lg border px-3 py-2"
                style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
              <LoadingButton
                loading={savingInspection}
                onClick={startInspection}
                className="w-full text-white text-sm"
                style={{ backgroundColor: 'var(--primary-color)' }}
              >
                Start Inspection
              </LoadingButton>
            </div>
          )}

          {/* Inspection list */}
          {inspections.length === 0 && !showInspectionForm && (
            <div className="text-center py-12 rounded-xl border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
              <ClipboardList size={32} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No inspections yet. Start one from a template.</p>
            </div>
          )}
          {inspections.map(insp => (
            <button
              key={insp.id}
              onClick={() => openInspection(insp)}
              className="w-full text-left rounded-xl border p-4 transition-all hover:shadow-sm"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{insp.template_name}</h3>
                    {statusBadge(insp.status)}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {insp.location} &middot; {insp.inspector_name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(insp.created_at)}
                  </p>
                </div>
                {insp.status === 'failed' ? (
                  <AlertTriangle size={18} className="text-red-500" />
                ) : insp.status === 'completed' ? (
                  <Check size={18} className="text-green-500" />
                ) : (
                  <FileText size={18} style={{ color: 'var(--text-muted)' }} />
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
