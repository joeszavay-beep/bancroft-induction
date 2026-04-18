import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import { getSession } from '../lib/storage'
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import {
  Shield, Plus, X, Check, Clock, AlertTriangle, FileText, Search,
  ChevronDown, ChevronRight, Flame, Wind, ArrowUpFromLine, Shovel,
  Zap, Home, Users, Camera, Trash2, CheckCircle, XCircle,
  Timer, Edit2, ChevronLeft
} from 'lucide-react'

// ── Type configuration ──
const PERMIT_TYPES = {
  hot_works: { label: 'Hot Works', prefix: 'HW', color: '#DC2626', icon: Flame },
  confined_space: { label: 'Confined Space', prefix: 'CS', color: '#7C3AED', icon: Wind },
  working_at_height: { label: 'Working at Height', prefix: 'WH', color: '#D29922', icon: ArrowUpFromLine },
  excavation: { label: 'Excavation', prefix: 'EX', color: '#92400E', icon: Shovel },
  electrical: { label: 'Electrical Isolation', prefix: 'EI', color: '#2563EB', icon: Zap },
  roof_work: { label: 'Roof Work', prefix: 'RW', color: '#0891B2', icon: Home },
}

const STATUS_STYLES = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Draft' },
  pending_approval: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Pending Approval' },
  active: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
  expired: { bg: 'bg-red-100', text: 'text-red-800', label: 'Expired' },
  closed: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Closed' },
  rejected: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rejected' },
}

const DURATION_OPTIONS = [
  { value: 2, label: '2 hours' },
  { value: 4, label: '4 hours' },
  { value: 8, label: '8 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours' },
]

const DEFAULT_TEMPLATES = [
  {
    type: 'hot_works',
    name: 'Hot Works Permit',
    description: 'Welding, cutting, grinding, brazing',
    hazards: ['Fire', 'Burns', 'Fumes', 'UV radiation'],
    precautions: [
      'Fire extinguisher within 5m',
      'Fire watch 1hr after completion',
      'Combustibles cleared 10m radius',
      'Spatter shields in place',
    ],
    ppe: ['Welding helmet', 'Fire-resistant gloves', 'Fire-resistant overalls', 'Safety boots', 'Respiratory protection'],
    checklist: [
      'Area inspected for combustibles',
      'Fire extinguisher checked and in date',
      'Smoke/heat detectors isolated (if applicable)',
      'Adjacent areas notified',
      'Hot work equipment inspected',
    ],
    requires_isolation: false,
  },
  {
    type: 'confined_space',
    name: 'Confined Space Entry Permit',
    description: 'Tanks, ducts, risers, ceiling voids',
    hazards: ['Asphyxiation', 'Toxic atmosphere', 'Engulfment'],
    precautions: [
      'Atmosphere tested before entry',
      'Rescue plan in place',
      'Standby person assigned',
      'Ventilation provided',
      'Communication system established',
    ],
    ppe: ['Hard hat', 'Safety harness', 'Gas detector', 'Breathing apparatus', 'Safety boots', 'Hi-vis vest'],
    checklist: [
      'Risk assessment reviewed',
      'Atmosphere monitoring equipment calibrated',
      'Rescue equipment available',
      'Standby person briefed',
      'Emergency services notified (if required)',
      'All entrants briefed on hazards',
    ],
    requires_isolation: true,
  },
  {
    type: 'working_at_height',
    name: 'Working at Height Permit',
    description: 'Scaffolding, MEWPs, ladders, edge protection',
    hazards: ['Falls from height', 'Falling objects', 'Scaffold collapse'],
    precautions: [
      'Edge protection in place',
      'Harness and lanyard worn',
      'Exclusion zone below',
      'Tooling tethered',
    ],
    ppe: ['Hard hat', 'Safety harness', 'Safety boots', 'Hi-vis vest', 'Gloves'],
    checklist: [
      'Scaffold inspection tag checked',
      'Harness inspection in date',
      'Weather conditions assessed',
      'Exclusion zone established below',
      'Rescue plan in place',
    ],
    requires_isolation: false,
  },
  {
    type: 'excavation',
    name: 'Excavation Permit',
    description: 'Trenching, breaking ground',
    hazards: ['Buried services', 'Trench collapse', 'Flooding'],
    precautions: [
      'CAT scan completed',
      'Service plans checked',
      'Shoring in place',
      'Barriers erected',
      'Banksman assigned',
    ],
    ppe: ['Hard hat', 'Safety boots', 'Hi-vis vest', 'Gloves'],
    checklist: [
      'CAT/Genny scan completed',
      'Utility service plans obtained and reviewed',
      'Trial holes dug where required',
      'Shoring/battering adequate',
      'Safe means of access/egress',
      'Barriers and signage in place',
    ],
    requires_isolation: false,
  },
  {
    type: 'electrical',
    name: 'Electrical Isolation Permit',
    description: 'Working on live/dead circuits',
    hazards: ['Electrocution', 'Arc flash', 'Burns'],
    precautions: [
      'Isolated and proved dead',
      'Lock-out/tag-out applied',
      'Voltage tested at point of work',
      'Permits displayed at isolation point',
    ],
    ppe: ['Insulated gloves', 'Safety boots', 'Arc flash visor', 'Fire-resistant clothing', 'Hard hat'],
    checklist: [
      'Circuit identified and isolated',
      'Lock-out/tag-out applied',
      'Voltage tested with approved device',
      'Adjacent live parts protected',
      'Warning notices displayed',
      'Competent person confirmed',
    ],
    requires_isolation: true,
  },
  {
    type: 'roof_work',
    name: 'Roof Work Permit',
    description: 'Any work on or near fragile roofs',
    hazards: ['Falls through fragile surfaces', 'Edge falls', 'Weather exposure'],
    precautions: [
      'Crawling boards in place',
      'Edge protection installed',
      'Weather check completed',
      'Exclusion zone below established',
    ],
    ppe: ['Hard hat', 'Safety harness', 'Safety boots', 'Hi-vis vest', 'Gloves'],
    checklist: [
      'Fragile surface assessment completed',
      'Crawling boards/staging in place',
      'Edge protection checked',
      'Weather conditions suitable',
      'Exclusion zone established below',
      'Emergency rescue plan in place',
    ],
    requires_isolation: false,
  },
]

// ── Helpers ──
function formatDateTime(d) {
  if (!d) return '\u2014'
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDate(d) {
  if (!d) return '\u2014'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function timeRemaining(validTo) {
  if (!validTo) return { text: '\u2014', fraction: 0, expired: false }
  const now = new Date()
  const end = new Date(validTo)
  const diff = end - now
  if (diff <= 0) {
    const ago = Math.abs(diff)
    const mins = Math.floor(ago / 60000)
    if (mins < 60) return { text: `Expired ${mins}m ago`, fraction: 1, expired: true }
    const hrs = Math.floor(mins / 60)
    const remMins = mins % 60
    return { text: `Expired ${hrs}h ${remMins}m ago`, fraction: 1, expired: true }
  }
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return { text: `${mins}m remaining`, fraction: 0, expired: false }
  const hrs = Math.floor(mins / 60)
  const remMins = mins % 60
  return { text: `${hrs}h ${remMins}m remaining`, fraction: 0, expired: false }
}

function timeProgress(validFrom, validTo) {
  if (!validFrom || !validTo) return 0
  const now = new Date()
  const start = new Date(validFrom)
  const end = new Date(validTo)
  const total = end - start
  if (total <= 0) return 1
  const elapsed = now - start
  return Math.max(0, Math.min(1, elapsed / total))
}

function parseJson(r) {
  if (!r) return []
  if (Array.isArray(r)) return r
  if (typeof r === 'string') { try { return JSON.parse(r) } catch { return [] } }
  return []
}


export default function PermitToWork() {
  const { user } = useCompany()
  const cid = user?.company_id
  const managerData = user || JSON.parse(getSession('manager_data') || '{}')
  const managerName = managerData.name || 'User'

  // Main state
  const [tab, setTab] = useState('permits')
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState([])
  const [permits, setPermits] = useState([])
  const [projects, setProjects] = useState([])
  const [operatives, setOperatives] = useState([])

  // Filters
  const [filterProject, setFilterProject] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [searchText, setSearchText] = useState('')

  // New permit form
  const [showNewPermit, setShowNewPermit] = useState(false)
  const [permitForm, setPermitForm] = useState({
    template_id: '', title: '', description: '', location: '',
    project_id: '', valid_from: '', duration_hours: 8,
    hazards: [], precautions: [], ppe: [], checklist: [],
    workers: [], isolation_details: '', photos: [],
    precaution_checks: {},
  })
  const [workerSearch, setWorkerSearch] = useState('')
  const [savingPermit, setSavingPermit] = useState(false)
  const [uploadingPhotos, setUploadingPhotos] = useState(false)

  // Permit detail
  const [selectedPermit, setSelectedPermit] = useState(null)
  const [signatures, setSignatures] = useState([])
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [extending, setExtending] = useState(false)
  const [extendHours, setExtendHours] = useState(2)
  const [showExtendForm, setShowExtendForm] = useState(false)
  const [showCloseForm, setShowCloseForm] = useState(false)
  const [closeNotes, setCloseNotes] = useState('')
  const [closureChecks, setClosureChecks] = useState({})
  const [actionLoading, setActionLoading] = useState(false)

  // Template editing
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [tplForm, setTplForm] = useState({ hazards: [], precautions: [], ppe: [], checklist: [] })
  const [newTplItem, setNewTplItem] = useState({ hazards: '', precautions: '', ppe: '', checklist: '' })
  const [showCustomTemplate, setShowCustomTemplate] = useState(false)
  const [customTplForm, setCustomTplForm] = useState({
    type: 'hot_works', name: '', description: '',
    hazards: [], precautions: [], ppe: [], checklist: [],
    requires_isolation: false,
  })
  const [savingTemplate, setSavingTemplate] = useState(false)

  // ── Data loading ──
  const loadData = useCallback(async () => {
    if (!cid) return
    setLoading(true)
    const [tRes, pRes, prRes, opRes] = await Promise.all([
      supabase.from('permit_templates').select('*').eq('company_id', cid).order('type'),
      supabase.from('permits').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name').eq('company_id', cid).order('name'),
      supabase.from('operatives').select('id, name, role').eq('company_id', cid).order('name'),
    ])
    setTemplates(tRes.data || [])
    setPermits(pRes.data || [])
    setProjects(prRes.data || [])
    setOperatives(opRes.data || [])
    setLoading(false)
  }, [cid])

  useEffect(() => {
    if (cid) loadData()
  }, [cid, loadData])

  // Auto-seed default templates (once only, skip in sandbox/demo mode)
  const seeded = useRef(false)
  useEffect(() => {
    if (!cid || loading || templates.length > 0 || seeded.current) return
    if (sessionStorage.getItem('sandbox_mode') === 'true') return
    seeded.current = true
    async function seed() {
      const rows = DEFAULT_TEMPLATES.map(t => ({
        company_id: cid,
        type: t.type,
        name: t.name,
        description: t.description,
        hazards: t.hazards,
        precautions: t.precautions,
        ppe: t.ppe,
        checklist: t.checklist,
        requires_isolation: t.requires_isolation,
      }))
      const { data, error } = await supabase.from('permit_templates').insert(rows).select()
      if (!error && data?.length) {
        toast.success('Default permit templates loaded')
        loadData()
      }
    }
    seed()
  }, [cid, loading, templates.length, loadData])

  // Auto-expire check
  useEffect(() => {
    const interval = setInterval(() => {
      setPermits(prev => prev.map(p => {
        if (p.status === 'active' && new Date(p.valid_to) < new Date()) {
          return { ...p, status: 'expired' }
        }
        return p
      }))
    }, 30000) // check every 30s
    return () => clearInterval(interval)
  }, [])

  // ── Generate permit number ──
  async function generatePermitNumber(type) {
    const prefix = PERMIT_TYPES[type]?.prefix || 'PT'
    const { count } = await supabase
      .from('permits')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', cid)
      .eq('type', type)
    const num = (count || 0) + 1
    return `${prefix}-${String(num).padStart(3, '0')}`
  }

  // ── Template selection for new permit ──
  function selectTemplate(templateId) {
    const tpl = templates.find(t => t.id === templateId)
    if (!tpl) return
    const hazards = parseJson(tpl.hazards)
    const precautions = parseJson(tpl.precautions)
    const ppe = parseJson(tpl.ppe)
    const checklist = parseJson(tpl.checklist)
    setPermitForm(prev => ({
      ...prev,
      template_id: templateId,
      hazards,
      precautions,
      ppe,
      checklist,
      precaution_checks: {},
    }))
  }

  // ── Submit new permit ──
  async function handleSubmitPermit() {
    if (!permitForm.template_id) return toast.error('Select a permit type')
    if (!permitForm.title.trim()) return toast.error('Enter a permit title')
    if (!permitForm.project_id) return toast.error('Select a project')
    if (!permitForm.location.trim()) return toast.error('Enter a location')
    if (!permitForm.valid_from) return toast.error('Set a start date/time')

    // Check all precautions are ticked
    const allPrecautionsTicked = permitForm.precautions.every((_, i) => permitForm.precaution_checks[i])
    if (!allPrecautionsTicked) return toast.error('All precautions must be confirmed')

    const tpl = templates.find(t => t.id === permitForm.template_id)
    if (tpl?.requires_isolation && !permitForm.isolation_details.trim()) {
      return toast.error('Isolation details are required for this permit type')
    }

    setSavingPermit(true)
    try {
      const validFrom = new Date(permitForm.valid_from)
      const validTo = new Date(validFrom.getTime() + permitForm.duration_hours * 3600000)
      const permitNumber = await generatePermitNumber(tpl.type)

      const { data: permit, error } = await supabase.from('permits').insert({
        company_id: cid,
        project_id: permitForm.project_id,
        template_id: permitForm.template_id,
        permit_number: permitNumber,
        type: tpl.type,
        title: permitForm.title.trim(),
        description: permitForm.description.trim(),
        location: permitForm.location.trim(),
        requested_by: managerName,
        valid_from: validFrom.toISOString(),
        valid_to: validTo.toISOString(),
        duration_hours: permitForm.duration_hours,
        hazards: permitForm.hazards,
        precautions: permitForm.precautions,
        ppe: permitForm.ppe,
        checklist: permitForm.checklist,
        workers: permitForm.workers,
        isolation_details: permitForm.isolation_details.trim() || null,
        photos: permitForm.photos,
        status: 'pending_approval',
      }).select().single()

      if (error) throw error

      // Add requestor signature
      await supabase.from('permit_signatures').insert({
        permit_id: permit.id,
        signer_name: managerName,
        role: 'requestor',
        action: 'submitted',
      })

      toast.success(`Permit ${permitNumber} submitted for approval`)
      resetPermitForm()
      loadData()
    } catch (err) {
      toast.error(err.message || 'Failed to create permit')
    }
    setSavingPermit(false)
  }

  function resetPermitForm() {
    setShowNewPermit(false)
    setPermitForm({
      template_id: '', title: '', description: '', location: '',
      project_id: '', valid_from: '', duration_hours: 8,
      hazards: [], precautions: [], ppe: [], checklist: [],
      workers: [], isolation_details: '', photos: [],
      precaution_checks: {},
    })
    setWorkerSearch('')
  }

  // ── Photo uploads ──
  async function handlePhotoUpload(files) {
    if (!files.length) return
    setUploadingPhotos(true)
    const uploaded = []
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) { toast.error('Photo must be under 10MB'); continue }
      const ext = file.name.split('.').pop()
      const path = `permits/temp/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(path, file, { contentType: file.type })
      if (!error) {
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        uploaded.push(urlData.publicUrl)
      }
    }
    setPermitForm(prev => ({ ...prev, photos: [...prev.photos, ...uploaded] }))
    setUploadingPhotos(false)
    if (uploaded.length) toast.success(`${uploaded.length} photo(s) uploaded`)
  }

  // ── Permit actions ──
  async function openPermitDetail(permit) {
    setSelectedPermit(permit)
    setRejectReason('')
    setShowRejectForm(false)
    setShowExtendForm(false)
    setShowCloseForm(false)
    setCloseNotes('')
    setClosureChecks({})
    const { data } = await supabase.from('permit_signatures')
      .select('*')
      .eq('permit_id', permit.id)
      .order('created_at')
    setSignatures(data || [])
  }

  async function approvePermit() {
    if (!selectedPermit) return
    setActionLoading(true)
    const { error } = await supabase.from('permits')
      .update({ status: 'active', approved_by: managerName, approved_at: new Date().toISOString() })
      .eq('id', selectedPermit.id)
    if (!error) {
      await supabase.from('permit_signatures').insert({
        permit_id: selectedPermit.id,
        signer_name: managerName,
        role: 'approver',
        action: 'approved',
      })
      toast.success('Permit approved')
      setSelectedPermit(null)
      loadData()
    } else {
      toast.error('Failed to approve')
    }
    setActionLoading(false)
  }

  async function rejectPermit() {
    if (!selectedPermit || !rejectReason.trim()) return toast.error('Enter a rejection reason')
    setActionLoading(true)
    const { error } = await supabase.from('permits')
      .update({ status: 'rejected', rejection_reason: rejectReason.trim(), rejected_by: managerName })
      .eq('id', selectedPermit.id)
    if (!error) {
      await supabase.from('permit_signatures').insert({
        permit_id: selectedPermit.id,
        signer_name: managerName,
        role: 'approver',
        action: 'rejected',
        notes: rejectReason.trim(),
      })
      toast.success('Permit rejected')
      setSelectedPermit(null)
      loadData()
    } else {
      toast.error('Failed to reject')
    }
    setActionLoading(false)
  }

  async function extendPermit() {
    if (!selectedPermit) return
    setExtending(true)
    const currentEnd = new Date(selectedPermit.valid_to)
    const newEnd = new Date(currentEnd.getTime() + extendHours * 3600000)
    const newDuration = (selectedPermit.duration_hours || 0) + extendHours
    const { error } = await supabase.from('permits')
      .update({ valid_to: newEnd.toISOString(), duration_hours: newDuration })
      .eq('id', selectedPermit.id)
    if (!error) {
      await supabase.from('permit_signatures').insert({
        permit_id: selectedPermit.id,
        signer_name: managerName,
        role: 'approver',
        action: 'extended',
        notes: `Extended by ${extendHours} hours`,
      })
      toast.success(`Permit extended by ${extendHours} hours`)
      setShowExtendForm(false)
      setSelectedPermit(null)
      loadData()
    } else {
      toast.error('Failed to extend')
    }
    setExtending(false)
  }

  async function closePermit() {
    if (!selectedPermit) return
    const tpl = templates.find(t => t.id === selectedPermit.template_id)
    const isHotWorks = selectedPermit.type === 'hot_works'
    const requiredChecks = ['area_reinspected', 'isolation_removed']
    if (isHotWorks) requiredChecks.push('fire_watch_completed')
    const allChecked = requiredChecks.every(k => closureChecks[k])
    if (!allChecked) return toast.error('Complete all closure checks')

    setActionLoading(true)
    const { error } = await supabase.from('permits')
      .update({
        status: 'closed',
        closed_by: managerName,
        closed_at: new Date().toISOString(),
        closure_notes: closeNotes.trim(),
        closure_checks: closureChecks,
      })
      .eq('id', selectedPermit.id)
    if (!error) {
      await supabase.from('permit_signatures').insert({
        permit_id: selectedPermit.id,
        signer_name: managerName,
        role: 'closer',
        action: 'closed',
        notes: closeNotes.trim(),
      })
      toast.success('Permit closed')
      setSelectedPermit(null)
      loadData()
    } else {
      toast.error('Failed to close')
    }
    setActionLoading(false)
  }

  // ── Template editing ──
  function startEditTemplate(tpl) {
    setEditingTemplate(tpl)
    setTplForm({
      hazards: parseJson(tpl.hazards),
      precautions: parseJson(tpl.precautions),
      ppe: parseJson(tpl.ppe),
      checklist: parseJson(tpl.checklist),
    })
    setNewTplItem({ hazards: '', precautions: '', ppe: '', checklist: '' })
  }

  function addTplItem(field) {
    const val = newTplItem[field]?.trim()
    if (!val) return
    setTplForm(prev => ({ ...prev, [field]: [...prev[field], val] }))
    setNewTplItem(prev => ({ ...prev, [field]: '' }))
  }

  function removeTplItem(field, idx) {
    setTplForm(prev => ({ ...prev, [field]: prev[field].filter((_, i) => i !== idx) }))
  }

  async function saveTemplateEdits() {
    if (!editingTemplate) return
    setSavingTemplate(true)
    const { error } = await supabase.from('permit_templates')
      .update({
        hazards: tplForm.hazards,
        precautions: tplForm.precautions,
        ppe: tplForm.ppe,
        checklist: tplForm.checklist,
      })
      .eq('id', editingTemplate.id)
    setSavingTemplate(false)
    if (error) return toast.error('Failed to save')
    toast.success('Template updated')
    setEditingTemplate(null)
    loadData()
  }

  async function saveCustomTemplate() {
    if (!customTplForm.name.trim()) return toast.error('Template name is required')
    if (customTplForm.hazards.length === 0) return toast.error('Add at least one hazard')
    setSavingTemplate(true)
    const { error } = await supabase.from('permit_templates').insert({
      company_id: cid,
      type: customTplForm.type,
      name: customTplForm.name.trim(),
      description: customTplForm.description.trim(),
      hazards: customTplForm.hazards,
      precautions: customTplForm.precautions,
      ppe: customTplForm.ppe,
      checklist: customTplForm.checklist,
      requires_isolation: customTplForm.requires_isolation,
    })
    setSavingTemplate(false)
    if (error) return toast.error('Failed to create template')
    toast.success('Custom template created')
    setShowCustomTemplate(false)
    setCustomTplForm({ type: 'hot_works', name: '', description: '', hazards: [], precautions: [], ppe: [], checklist: [], requires_isolation: false })
    loadData()
  }

  // ── Workers ──
  function addWorker(op) {
    if (permitForm.workers.find(w => w.id === op.id)) return
    setPermitForm(prev => ({ ...prev, workers: [...prev.workers, { id: op.id, name: op.name, role: op.role }] }))
    setWorkerSearch('')
  }

  function removeWorker(id) {
    setPermitForm(prev => ({ ...prev, workers: prev.workers.filter(w => w.id !== id) }))
  }

  // Hazards add/remove for new permit
  function addPermitHazard() {
    const val = prompt('Enter hazard:')
    if (val?.trim()) setPermitForm(prev => ({ ...prev, hazards: [...prev.hazards, val.trim()] }))
  }
  function removePermitHazard(idx) {
    setPermitForm(prev => ({ ...prev, hazards: prev.hazards.filter((_, i) => i !== idx) }))
  }

  // ── Filtering ──
  const filteredPermits = permits.filter(p => {
    // Auto-expire display
    const displayStatus = (p.status === 'active' && new Date(p.valid_to) < new Date()) ? 'expired' : p.status
    if (filterProject && p.project_id !== filterProject) return false
    if (filterStatus && displayStatus !== filterStatus) return false
    if (searchText) {
      const s = searchText.toLowerCase()
      const matchTitle = p.title?.toLowerCase().includes(s)
      const matchNumber = p.permit_number?.toLowerCase().includes(s)
      const matchLocation = p.location?.toLowerCase().includes(s)
      const matchType = PERMIT_TYPES[p.type]?.label.toLowerCase().includes(s)
      if (!matchTitle && !matchNumber && !matchLocation && !matchType) return false
    }
    return true
  })

  // ── Custom template add items ──
  const [newCustomItem, setNewCustomItem] = useState({ hazards: '', precautions: '', ppe: '', checklist: '' })

  function addCustomItem(field) {
    const val = newCustomItem[field]?.trim()
    if (!val) return
    setCustomTplForm(prev => ({ ...prev, [field]: [...prev[field], val] }))
    setNewCustomItem(prev => ({ ...prev, [field]: '' }))
  }

  function removeCustomItem(field, idx) {
    setCustomTplForm(prev => ({ ...prev, [field]: prev[field].filter((_, i) => i !== idx) }))
  }

  // ── Render ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--primary-color)' }} />
      </div>
    )
  }

  // ── Permit Detail View ──
  if (selectedPermit) {
    const p = selectedPermit
    const typeConfig = PERMIT_TYPES[p.type] || {}
    const TypeIcon = typeConfig.icon || Shield
    const displayStatus = (p.status === 'active' && new Date(p.valid_to) < new Date()) ? 'expired' : p.status
    const statusStyle = STATUS_STYLES[displayStatus] || STATUS_STYLES.draft
    const tr = timeRemaining(p.valid_to)
    const progress = timeProgress(p.valid_from, p.valid_to)
    const projectName = projects.find(pr => pr.id === p.project_id)?.name || '\u2014'
    const workers = parseJson(p.workers)
    const hazards = parseJson(p.hazards)
    const precautions = parseJson(p.precautions)
    const ppe = parseJson(p.ppe)
    const checklist = parseJson(p.checklist)
    const photos = parseJson(p.photos)

    return (
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Back button */}
        <button
          onClick={() => setSelectedPermit(null)}
          className="flex items-center gap-1.5 text-sm font-medium mb-2"
          style={{ color: 'var(--primary-color)' }}
        >
          <ChevronLeft size={16} /> Back to permits
        </button>

        {/* Expired banner */}
        {displayStatus === 'expired' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle size={20} className="text-red-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-800">This permit has expired</p>
              <p className="text-xs text-red-600">{tr.text}</p>
            </div>
          </div>
        )}

        {/* Header card */}
        <div className="rounded-xl border p-5 space-y-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: typeConfig.color + '18' }}>
                <TypeIcon size={20} style={{ color: typeConfig.color }} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded" style={{ backgroundColor: typeConfig.color + '18', color: typeConfig.color }}>{p.permit_number}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.text}`}>{statusStyle.label}</span>
                </div>
                <h2 className="text-lg font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{p.title}</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {typeConfig.label} &middot; {projectName}
                </p>
              </div>
            </div>
          </div>

          {/* Time bar */}
          {(displayStatus === 'active' || displayStatus === 'expired') && (
            <div>
              <div className="flex items-center justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                <span>{formatDateTime(p.valid_from)}</span>
                <span className={`font-medium ${tr.expired ? 'text-red-600' : 'text-green-600'}`}>{tr.text}</span>
                <span>{formatDateTime(p.valid_to)}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-color)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(progress * 100, 100)}%`,
                    backgroundColor: progress >= 1 ? '#DC2626' : progress > 0.75 ? '#D97706' : '#16A34A',
                  }}
                />
              </div>
            </div>
          )}

          {/* Detail grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Location</p>
              <p style={{ color: 'var(--text-primary)' }}>{p.location}</p>
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Requested By</p>
              <p style={{ color: 'var(--text-primary)' }}>{p.requested_by}</p>
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Valid From</p>
              <p style={{ color: 'var(--text-primary)' }}>{formatDateTime(p.valid_from)}</p>
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Valid To</p>
              <p style={{ color: 'var(--text-primary)' }}>{formatDateTime(p.valid_to)}</p>
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Duration</p>
              <p style={{ color: 'var(--text-primary)' }}>{p.duration_hours} hours</p>
            </div>
            {p.approved_by && (
              <div>
                <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Approved By</p>
                <p style={{ color: 'var(--text-primary)' }}>{p.approved_by}</p>
              </div>
            )}
          </div>
          {p.description && (
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Description</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>{p.description}</p>
            </div>
          )}
          {p.isolation_details && (
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Isolation Details</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>{p.isolation_details}</p>
            </div>
          )}
        </div>

        {/* Hazards */}
        {hazards.length > 0 && (
          <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <AlertTriangle size={16} className="text-red-500" /> Hazards
            </h3>
            <div className="flex flex-wrap gap-2">
              {hazards.map((h, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">{h}</span>
              ))}
            </div>
          </div>
        )}

        {/* Precautions */}
        {precautions.length > 0 && (
          <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <CheckCircle size={16} className="text-green-500" /> Precautions
            </h3>
            <ul className="space-y-1.5">
              {precautions.map((pr, i) => (
                <li key={i} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                  <Check size={14} className="text-green-500 shrink-0" /> {pr}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* PPE */}
        {ppe.length > 0 && (
          <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Shield size={16} style={{ color: 'var(--primary-color)' }} /> PPE Required
            </h3>
            <div className="flex flex-wrap gap-2">
              {ppe.map((item, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-main)' }}>{item}</span>
              ))}
            </div>
          </div>
        )}

        {/* Workers */}
        {workers.length > 0 && (
          <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Users size={16} style={{ color: 'var(--primary-color)' }} /> Workers on Permit ({workers.length})
            </h3>
            <div className="space-y-1.5">
              {workers.map((w, i) => (
                <div key={i} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                  <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                    {w.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <span>{w.name}</span>
                  {w.role && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({w.role})</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Photos</h3>
            <div className="flex gap-2 flex-wrap">
              {photos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt="" className="h-20 w-20 rounded-lg object-cover border" style={{ borderColor: 'var(--border-color)' }} />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Rejection reason */}
        {p.rejection_reason && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-red-800 mb-1">Rejection Reason</p>
            <p className="text-sm text-red-700">{p.rejection_reason}</p>
            {p.rejected_by && <p className="text-xs text-red-500 mt-1">Rejected by {p.rejected_by}</p>}
          </div>
        )}

        {/* Signatures */}
        {signatures.length > 0 && (
          <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Signature Chain</h3>
            <div className="space-y-2">
              {signatures.map((sig, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b pb-2" style={{ borderColor: 'var(--border-color)' }}>
                  <div className="flex items-center gap-2">
                    {sig.action === 'approved' || sig.action === 'submitted' ? (
                      <CheckCircle size={14} className="text-green-500" />
                    ) : sig.action === 'rejected' ? (
                      <XCircle size={14} className="text-red-500" />
                    ) : (
                      <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                    )}
                    <span style={{ color: 'var(--text-primary)' }}>{sig.signer_name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-muted)' }}>{sig.role}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{sig.action}</span>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{formatDateTime(sig.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-3">
          {/* Approve / Reject for pending */}
          {displayStatus === 'pending_approval' && (
            <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Approval Decision</h3>
              <div className="flex gap-2">
                <LoadingButton loading={actionLoading} onClick={approvePermit} className="flex-1 bg-green-600 text-white text-sm">
                  <Check size={16} /> Approve
                </LoadingButton>
                <button
                  onClick={() => setShowRejectForm(!showRejectForm)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
                >
                  <X size={16} /> Reject
                </button>
              </div>
              {showRejectForm && (
                <div className="space-y-2">
                  <textarea
                    rows={2}
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Reason for rejection..."
                    className="w-full text-sm rounded-lg border px-3 py-2 resize-none"
                    style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                  <LoadingButton loading={actionLoading} onClick={rejectPermit} className="w-full bg-red-600 text-white text-sm">
                    Confirm Rejection
                  </LoadingButton>
                </div>
              )}
            </div>
          )}

          {/* Extend for active */}
          {displayStatus === 'active' && (
            <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Permit Actions</h3>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowExtendForm(!showExtendForm)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-white transition-colors"
                  style={{ backgroundColor: 'var(--primary-color)' }}
                >
                  <Timer size={16} /> Extend
                </button>
                <button
                  onClick={() => setShowCloseForm(!showCloseForm)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium border transition-colors"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-card)' }}
                >
                  <CheckCircle size={16} /> Close Permit
                </button>
              </div>

              {showExtendForm && (
                <div className="space-y-2 border-t pt-3" style={{ borderColor: 'var(--border-color)' }}>
                  <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Extend by</label>
                  <select
                    value={extendHours}
                    onChange={e => setExtendHours(Number(e.target.value))}
                    className="w-full text-sm rounded-lg border px-3 py-2"
                    style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    {[1, 2, 4, 8, 12, 24].map(h => (
                      <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                  <LoadingButton loading={extending} onClick={extendPermit} className="w-full text-white text-sm" style={{ backgroundColor: 'var(--primary-color)' }}>
                    Confirm Extension
                  </LoadingButton>
                </div>
              )}

              {showCloseForm && (
                <div className="space-y-3 border-t pt-3" style={{ borderColor: 'var(--border-color)' }}>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Closure Checklist</p>
                  <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                    <input type="checkbox" checked={!!closureChecks.area_reinspected} onChange={e => setClosureChecks(p => ({ ...p, area_reinspected: e.target.checked }))} className="rounded" />
                    Area reinspected and safe
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                    <input type="checkbox" checked={!!closureChecks.isolation_removed} onChange={e => setClosureChecks(p => ({ ...p, isolation_removed: e.target.checked }))} className="rounded" />
                    Isolation removed (if applicable)
                  </label>
                  {selectedPermit.type === 'hot_works' && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                      <input type="checkbox" checked={!!closureChecks.fire_watch_completed} onChange={e => setClosureChecks(p => ({ ...p, fire_watch_completed: e.target.checked }))} className="rounded" />
                      Fire watch completed (1hr minimum)
                    </label>
                  )}
                  <textarea
                    rows={2}
                    value={closeNotes}
                    onChange={e => setCloseNotes(e.target.value)}
                    placeholder="Closure notes..."
                    className="w-full text-sm rounded-lg border px-3 py-2 resize-none"
                    style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                  <LoadingButton loading={actionLoading} onClick={closePermit} className="w-full bg-green-600 text-white text-sm">
                    <CheckCircle size={16} /> Confirm Closure
                  </LoadingButton>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── New Permit Form ──
  if (showNewPermit) {
    const selectedTpl = templates.find(t => t.id === permitForm.template_id)
    const filteredOps = operatives.filter(op => {
      if (!workerSearch) return false
      const s = workerSearch.toLowerCase()
      return op.name?.toLowerCase().includes(s) || op.role?.toLowerCase().includes(s)
    }).filter(op => !permitForm.workers.find(w => w.id === op.id))

    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={22} style={{ color: 'var(--primary-color)' }} />
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>New Permit to Work</h1>
          </div>
          <button onClick={resetPermitForm} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>

        {/* Step 1: Select type */}
        <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>1. Permit Type</h3>
          <select
            value={permitForm.template_id}
            onChange={e => selectTemplate(e.target.value)}
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            <option value="">Select permit type...</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} ({PERMIT_TYPES[t.type]?.label || t.type})
              </option>
            ))}
          </select>
          {selectedTpl && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{selectedTpl.description}</p>
          )}
        </div>

        {/* Step 2: Details */}
        <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>2. Permit Details</h3>
          <input
            type="text"
            placeholder="Permit title"
            value={permitForm.title}
            onChange={e => setPermitForm(f => ({ ...f, title: e.target.value }))}
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          />
          <textarea
            placeholder="Description (optional)"
            value={permitForm.description}
            onChange={e => setPermitForm(f => ({ ...f, description: e.target.value }))}
            rows={2}
            className="w-full text-sm rounded-lg border px-3 py-2 resize-none"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          />
          <input
            type="text"
            placeholder="Location (e.g. Block A, Level 3, Plant Room)"
            value={permitForm.location}
            onChange={e => setPermitForm(f => ({ ...f, location: e.target.value }))}
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          />
          <select
            value={permitForm.project_id}
            onChange={e => setPermitForm(f => ({ ...f, project_id: e.target.value }))}
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            <option value="">Select project...</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Step 3: Time */}
        <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>3. Validity Period</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Valid From</label>
              <input
                type="datetime-local"
                value={permitForm.valid_from}
                onChange={e => setPermitForm(f => ({ ...f, valid_from: e.target.value }))}
                className="w-full text-sm rounded-lg border px-3 py-2"
                style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Duration</label>
              <select
                value={permitForm.duration_hours}
                onChange={e => setPermitForm(f => ({ ...f, duration_hours: Number(e.target.value) }))}
                className="w-full text-sm rounded-lg border px-3 py-2"
                style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              >
                {DURATION_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          </div>
          {permitForm.valid_from && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Valid until: {formatDateTime(new Date(new Date(permitForm.valid_from).getTime() + permitForm.duration_hours * 3600000).toISOString())}
            </p>
          )}
        </div>

        {/* Step 4: Hazards */}
        <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <AlertTriangle size={16} className="text-red-500" /> 4. Hazards
            </h3>
            <button onClick={addPermitHazard} className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--primary-color)' }}>
              <Plus size={14} /> Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {permitForm.hazards.map((h, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 flex items-center gap-1">
                {h}
                <button onClick={() => removePermitHazard(i)} className="hover:text-red-900"><X size={12} /></button>
              </span>
            ))}
            {permitForm.hazards.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Select a permit type to auto-fill hazards</p>
            )}
          </div>
        </div>

        {/* Step 5: Precautions checklist */}
        <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <CheckCircle size={16} className="text-green-500" /> 5. Precautions (all must be confirmed)
          </h3>
          <div className="space-y-2">
            {permitForm.precautions.map((pr, i) => (
              <label key={i} className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                <input
                  type="checkbox"
                  checked={!!permitForm.precaution_checks[i]}
                  onChange={e => setPermitForm(f => ({ ...f, precaution_checks: { ...f.precaution_checks, [i]: e.target.checked } }))}
                  className="mt-0.5 rounded"
                />
                <span>{pr}</span>
              </label>
            ))}
            {permitForm.precautions.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Select a permit type to auto-fill precautions</p>
            )}
          </div>
        </div>

        {/* Step 6: PPE */}
        {permitForm.ppe.length > 0 && (
          <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Shield size={16} style={{ color: 'var(--primary-color)' }} /> 6. PPE Required
            </h3>
            <div className="flex flex-wrap gap-2">
              {permitForm.ppe.map((item, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full border flex items-center gap-1" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-main)' }}>
                  <Check size={12} className="text-green-500" /> {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Step 7: Workers */}
        <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Users size={16} style={{ color: 'var(--primary-color)' }} /> 7. Workers on Permit
          </h3>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search operatives..."
              value={workerSearch}
              onChange={e => setWorkerSearch(e.target.value)}
              className="w-full text-sm rounded-lg border pl-9 pr-3 py-2"
              style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
            {filteredOps.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border shadow-lg max-h-40 overflow-y-auto" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                {filteredOps.slice(0, 10).map(op => (
                  <button
                    key={op.id}
                    onClick={() => addWorker(op)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-black/5 flex items-center justify-between"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <span>{op.name}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{op.role}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {permitForm.workers.length > 0 && (
            <div className="space-y-1.5">
              {permitForm.workers.map(w => (
                <div key={w.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                      {w.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <span>{w.name}</span>
                    {w.role && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({w.role})</span>}
                  </div>
                  <button onClick={() => removeWorker(w.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Step 8: Isolation details (conditional) */}
        {selectedTpl?.requires_isolation && (
          <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Zap size={16} className="text-amber-500" /> 8. Isolation Details
            </h3>
            <textarea
              rows={3}
              value={permitForm.isolation_details}
              onChange={e => setPermitForm(f => ({ ...f, isolation_details: e.target.value }))}
              placeholder="Describe isolation point, method, and lock-out/tag-out details..."
              className="w-full text-sm rounded-lg border px-3 py-2 resize-none"
              style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
          </div>
        )}

        {/* Step 9: Photos */}
        <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {selectedTpl?.requires_isolation ? '9' : '8'}. Photos (optional)
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
              <Camera size={14} />
              {uploadingPhotos ? 'Uploading...' : 'Add Photos'}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => handlePhotoUpload(Array.from(e.target.files))}
                disabled={uploadingPhotos}
              />
            </label>
            {permitForm.photos.map((url, i) => (
              <div key={i} className="relative">
                <img src={url} alt="" className="h-16 w-16 rounded-lg object-cover border" style={{ borderColor: 'var(--border-color)' }} />
                <button
                  onClick={() => setPermitForm(f => ({ ...f, photos: f.photos.filter((_, idx) => idx !== i) }))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Submit */}
        <LoadingButton
          loading={savingPermit}
          onClick={handleSubmitPermit}
          className="w-full text-white text-sm"
          style={{ backgroundColor: 'var(--primary-color)' }}
        >
          <Shield size={16} /> Submit for Approval
        </LoadingButton>
      </div>
    )
  }

  // ── Template editing form ──
  if (editingTemplate) {
    const tType = PERMIT_TYPES[editingTemplate.type] || {}
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Edit2 size={20} style={{ color: 'var(--primary-color)' }} />
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Edit Template: {editingTemplate.name}</h1>
          </div>
          <button onClick={() => setEditingTemplate(null)} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>

        {['hazards', 'precautions', 'ppe', 'checklist'].map(field => (
          <div key={field} className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>{field}</h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={`Add ${field.slice(0, -1)}...`}
                value={newTplItem[field]}
                onChange={e => setNewTplItem(p => ({ ...p, [field]: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addTplItem(field)}
                className="flex-1 text-sm rounded-lg border px-3 py-2"
                style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
              <button onClick={() => addTplItem(field)} className="px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: 'var(--primary-color)' }}>Add</button>
            </div>
            <ul className="space-y-1">
              {tplForm[field].map((item, idx) => (
                <li key={idx} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                  <span>{item}</span>
                  <button onClick={() => removeTplItem(field, idx)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <LoadingButton loading={savingTemplate} onClick={saveTemplateEdits} className="w-full text-white text-sm" style={{ backgroundColor: 'var(--primary-color)' }}>
          Save Template
        </LoadingButton>
      </div>
    )
  }

  // ── Main Page ──
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={22} style={{ color: 'var(--primary-color)' }} />
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Permits to Work</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-color)' }}>
        {[{ key: 'permits', label: 'Active Permits' }, { key: 'templates', label: 'Templates' }].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex-1 py-2.5 text-sm font-medium transition-all"
            style={{
              backgroundColor: tab === t.key ? 'var(--primary-color)' : 'var(--bg-card)',
              color: tab === t.key ? '#fff' : 'var(--text-muted)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== Active Permits Tab ===== */}
      {tab === 'permits' && (
        <div className="space-y-3">
          {/* Actions bar */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowNewPermit(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--primary-color)' }}
            >
              <Plus size={16} /> New Permit
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <select
              value={filterProject}
              onChange={e => setFilterProject(e.target.value)}
              className="text-sm rounded-lg border px-3 py-2"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="text-sm rounded-lg border px-3 py-2"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              <option value="">All Statuses</option>
              {Object.entries(STATUS_STYLES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <div className="relative flex-1 min-w-[180px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search permits..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="w-full text-sm rounded-lg border pl-9 pr-3 py-2"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Active', count: permits.filter(p => p.status === 'active' && new Date(p.valid_to) > new Date()).length, color: '#16A34A' },
              { label: 'Pending', count: permits.filter(p => p.status === 'pending_approval').length, color: '#D97706' },
              { label: 'Expired', count: permits.filter(p => p.status === 'expired' || (p.status === 'active' && new Date(p.valid_to) < new Date())).length, color: '#DC2626' },
              { label: 'Closed', count: permits.filter(p => p.status === 'closed').length, color: '#64748B' },
            ].map(s => (
              <div key={s.label} className="rounded-xl border p-3 text-center" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                <p className="text-2xl font-bold" style={{ color: s.color }}>{s.count}</p>
                <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Permit list */}
          {filteredPermits.length === 0 && (
            <div className="text-center py-12 rounded-xl border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
              <Shield size={32} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {permits.length === 0 ? 'No permits yet. Create your first permit.' : 'No permits match your filters.'}
              </p>
            </div>
          )}

          {filteredPermits.map(p => {
            const typeConfig = PERMIT_TYPES[p.type] || {}
            const TypeIcon = typeConfig.icon || Shield
            const displayStatus = (p.status === 'active' && new Date(p.valid_to) < new Date()) ? 'expired' : p.status
            const statusStyle = STATUS_STYLES[displayStatus] || STATUS_STYLES.draft
            const tr = timeRemaining(p.valid_to)
            const progress = timeProgress(p.valid_from, p.valid_to)
            const workers = parseJson(p.workers)
            const projectName = projects.find(pr => pr.id === p.project_id)?.name || ''

            return (
              <button
                key={p.id}
                onClick={() => openPermitDetail(p)}
                className="w-full text-left rounded-xl border p-4 transition-all hover:shadow-sm"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
              >
                <div className="flex items-start gap-3">
                  {/* Type icon */}
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: typeConfig.color + '18' }}>
                    <TypeIcon size={20} style={{ color: typeConfig.color }} />
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Top row: number, type badge, status */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded" style={{ backgroundColor: typeConfig.color + '18', color: typeConfig.color }}>{p.permit_number}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: typeConfig.color + '18', color: typeConfig.color }}>{typeConfig.label}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.text}`}>{statusStyle.label}</span>
                    </div>

                    {/* Title */}
                    <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{p.title}</h3>

                    {/* Info row */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {p.location && <span>{p.location}</span>}
                      {projectName && <span>{projectName}</span>}
                      <span>{p.requested_by}</span>
                      <span>{formatDateTime(p.valid_from)} &rarr; {formatDateTime(p.valid_to)}</span>
                    </div>

                    {/* Time progress bar */}
                    {(displayStatus === 'active' || displayStatus === 'expired') && (
                      <div>
                        <div className="flex items-center justify-between text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
                          <span className={`font-medium ${tr.expired ? 'text-red-600' : 'text-green-600'}`}>{tr.text}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-color)' }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(progress * 100, 100)}%`,
                              backgroundColor: progress >= 1 ? '#DC2626' : progress > 0.75 ? '#D97706' : '#16A34A',
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Workers */}
                    {workers.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <Users size={12} style={{ color: 'var(--text-muted)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {workers.slice(0, 3).map(w => w.name).join(', ')}
                          {workers.length > 3 && ` +${workers.length - 3}`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right arrow */}
                  <ChevronRight size={18} className="shrink-0 mt-1" style={{ color: 'var(--text-muted)' }} />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ===== Templates Tab ===== */}
      {tab === 'templates' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setShowCustomTemplate(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--primary-color)' }}
            >
              <Plus size={16} /> Create Custom Template
            </button>
          </div>

          {/* Custom template form */}
          {showCustomTemplate && (
            <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>New Custom Template</h2>
                <button onClick={() => setShowCustomTemplate(false)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
              </div>
              <select
                value={customTplForm.type}
                onChange={e => setCustomTplForm(f => ({ ...f, type: e.target.value }))}
                className="w-full text-sm rounded-lg border px-3 py-2"
                style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              >
                {Object.entries(PERMIT_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Template name"
                value={customTplForm.name}
                onChange={e => setCustomTplForm(f => ({ ...f, name: e.target.value }))}
                className="w-full text-sm rounded-lg border px-3 py-2"
                style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
              <textarea
                placeholder="Description"
                value={customTplForm.description}
                onChange={e => setCustomTplForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full text-sm rounded-lg border px-3 py-2 resize-none"
                style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                <input
                  type="checkbox"
                  checked={customTplForm.requires_isolation}
                  onChange={e => setCustomTplForm(f => ({ ...f, requires_isolation: e.target.checked }))}
                  className="rounded"
                />
                Requires isolation details
              </label>

              {['hazards', 'precautions', 'ppe', 'checklist'].map(field => (
                <div key={field} className="space-y-2">
                  <label className="text-xs font-medium capitalize" style={{ color: 'var(--text-muted)' }}>{field}</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={`Add ${field.slice(0, -1)}...`}
                      value={newCustomItem[field]}
                      onChange={e => setNewCustomItem(p => ({ ...p, [field]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addCustomItem(field)}
                      className="flex-1 text-sm rounded-lg border px-3 py-2"
                      style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                    />
                    <button onClick={() => addCustomItem(field)} className="px-3 py-2 rounded-lg text-sm text-white" style={{ backgroundColor: 'var(--primary-color)' }}>Add</button>
                  </div>
                  {customTplForm[field].length > 0 && (
                    <ul className="space-y-1">
                      {customTplForm[field].map((item, idx) => (
                        <li key={idx} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                          <span>{item}</span>
                          <button onClick={() => removeCustomItem(field, idx)} className="text-red-500 hover:text-red-700"><Trash2 size={12} /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              <LoadingButton loading={savingTemplate} onClick={saveCustomTemplate} className="w-full text-white text-sm" style={{ backgroundColor: 'var(--primary-color)' }}>
                Create Template
              </LoadingButton>
            </div>
          )}

          {/* Template list */}
          {templates.length === 0 && !showCustomTemplate && (
            <div className="text-center py-12 rounded-xl border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
              <FileText size={32} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading default templates...</p>
            </div>
          )}

          {templates.map(tpl => {
            const typeConfig = PERMIT_TYPES[tpl.type] || {}
            const TypeIcon = typeConfig.icon || Shield
            const hazards = parseJson(tpl.hazards)
            const precautions = parseJson(tpl.precautions)
            const ppe = parseJson(tpl.ppe)
            const checklist = parseJson(tpl.checklist)

            return (
              <div key={tpl.id} className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: typeConfig.color + '18' }}>
                      <TypeIcon size={20} style={{ color: typeConfig.color }} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{tpl.name}</h3>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {typeConfig.label} &middot; {hazards.length} hazards &middot; {precautions.length} precautions &middot; {ppe.length} PPE &middot; {checklist.length} checklist items
                      </p>
                      {tpl.description && (
                        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{tpl.description}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => startEditTemplate(tpl)}
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border shrink-0"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <Edit2 size={12} /> Edit
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
