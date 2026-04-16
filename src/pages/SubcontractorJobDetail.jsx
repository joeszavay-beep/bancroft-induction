import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import {
  formatMoney, parseMoney, calculateHoursWorked, calculateCost,
  calculateProjections, checkCompliance, calculateInvoiceTotals,
  PAY_TYPES, EMPLOYMENT_STATUSES, CIS_RATES, JOB_STATUSES, INVOICE_STATUSES, TIMESHEET_STATUSES,
  TRAFFIC_LIGHT_COLORS,
} from '../lib/subcontractor'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Users, Clock, FileText, Eye, Plus, X, Loader2,
  ChevronLeft, ChevronRight, AlertTriangle, CheckCircle, Download,
  Edit2, Save, RefreshCw, PoundSterling, Calendar, Briefcase,
  Paperclip, Image, Trash2, Receipt, Ban, Hammer, FolderOpen, Calculator, TrendingUp, Bell
} from 'lucide-react'

const TABS = [
  { key: 'overview', label: 'Overview', icon: Eye },
  { key: 'operatives', label: 'Operatives', icon: Users },
  { key: 'timesheet', label: 'Timesheet', icon: Clock },
  { key: 'applications', label: 'Applications', icon: Receipt },
  { key: 'contras', label: 'Contras', icon: Ban },
  { key: 'dayworks', label: 'Dayworks', icon: Hammer },
  { key: 'documents', label: 'Documents', icon: FolderOpen },
  { key: 'invoices', label: 'Invoices', icon: FileText },
  { key: 'final-account', label: 'Final Account', icon: Calculator },
]

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getWeekStart(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function getWeekDates(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

// eslint-disable-next-line no-unused-vars
function formatDateShort(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SubcontractorJobDetail() {
  const { id: jobId } = useParams()
  const navigate = useNavigate()
  const { user } = useCompany()
  const cid = user?.company_id

  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  // Overview data
  const [variations, setVariations] = useState([])
  const [showVarForm, setShowVarForm] = useState(false)
  const [varForm, setVarForm] = useState({ description: '', value: '', date_agreed: '', status: 'pending', reference_number: '' })
  const [varFiles, setVarFiles] = useState([])
  const [uploadingVarFiles, setUploadingVarFiles] = useState(false)
  const [savingVar, setSavingVar] = useState(false)

  // Operatives data
  const [jobOperatives, setJobOperatives] = useState([])
  const [companyOperatives, setCompanyOperatives] = useState([])
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignForm, setAssignForm] = useState({
    operative_id: '', pay_type: 'daily', pay_rate: '', trade_role: '',
    employment_status: 'self_employed', cis_rate: '20',
  })
  const [complianceResult, setComplianceResult] = useState(null)
  const [savingAssign, setSavingAssign] = useState(false)
  const [editingOp, setEditingOp] = useState(null)

  // Timesheet data
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [timesheetEntries, setTimesheetEntries] = useState([])
  const [loadingTimesheet, setLoadingTimesheet] = useState(false)
  const [generatingQR, setGeneratingQR] = useState(false)
  const [approvingAll, setApprovingAll] = useState(false)
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [manualForm, setManualForm] = useState({ operative_id: '', date: '', hours: '', day_type: 'full', is_daywork: false, daywork_description: '', notes: '' })
  const [savingEntry, setSavingEntry] = useState(false)
  const [discrepancies, setDiscrepancies] = useState({ unassigned: [], missing: [] })
  const [editingCell, setEditingCell] = useState(null)
  const [editHours, setEditHours] = useState('')

  // Invoices data
  const [invoices, setInvoices] = useState([])
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState({
    period_from: '', period_to: '', gross_amount: '', status: 'draft',
  })
  const [savingInvoice, setSavingInvoice] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState(null)

  // Payment applications
  const [applications, setApplications] = useState([])
  const [showAppForm, setShowAppForm] = useState(false)
  const [appForm, setAppForm] = useState({ valuation_date: '', period_from: '', period_to: '', gross_amount: '', retention_held: '', notes: '' })
  const [savingApp, setSavingApp] = useState(false)

  // Contra charges
  const [contras, setContras] = useState([])
  const [showContraForm, setShowContraForm] = useState(false)
  const [contraForm, setContraForm] = useState({ description: '', amount: '', date_raised: '', raised_by: '', status: 'pending' })
  const [savingContra, setSavingContra] = useState(false)

  // Daywork sheets
  const [dayworks, setDayworks] = useState([])
  const [showDayworkForm, setShowDayworkForm] = useState(false)
  const [dayworkForm, setDayworkForm] = useState({ date: '', description: '', labour: [], plant: [], materials: [], signed_by: '' })
  const [savingDaywork, setSavingDaywork] = useState(false)

  // Job documents
  const [jobDocs, setJobDocs] = useState([])
  const [showDocForm, setShowDocForm] = useState(false)
  const [docForm, setDocForm] = useState({ category: 'subcontract', title: '', notes: '' })
  const [docFile, setDocFile] = useState(null)
  const [savingDoc, setSavingDoc] = useState(false)

  // Stats for overview
  const [totalSpend, setTotalSpend] = useState(0)
  const [weeklySpends, setWeeklySpends] = useState([])

  async function loadJob() {
    setLoading(true)
    try {
      const [jobRes, varRes, opRes, compOpRes] = await Promise.all([
        supabase.from('subcontractor_jobs').select('*').eq('id', jobId).single(),
        supabase.from('job_variations').select('*').eq('job_id', jobId).order('date_agreed', { ascending: false }),
        supabase.from('job_operatives').select('*, operatives(id, name, role, card_type, card_number, card_expiry, card_front_url, card_verified, cscs_number, cscs_expiry, cscs_type)')
          .eq('job_id', jobId).order('created_at', { ascending: false }),
        supabase.from('operatives').select('id, name, role, card_type, card_number, card_expiry, card_front_url, card_verified, cscs_number, cscs_expiry, cscs_type').eq('company_id', cid),
      ])
      if (jobRes.error) throw jobRes.error
      setJob(jobRes.data)
      setVariations(varRes.data || [])
      setJobOperatives(opRes.data || [])
      setCompanyOperatives(compOpRes.data || [])

      // Load commercial data
      const [appRes, contraRes, dayworkRes, docRes] = await Promise.all([
        supabase.from('payment_applications').select('*').eq('job_id', jobId).order('application_number', { ascending: false }),
        supabase.from('contra_charges').select('*').eq('job_id', jobId).order('created_at', { ascending: false }),
        supabase.from('daywork_sheets').select('*').eq('job_id', jobId).order('date', { ascending: false }),
        supabase.from('job_documents').select('*').eq('job_id', jobId).order('created_at', { ascending: false }),
      ])
      setApplications(appRes.data || [])
      setContras(contraRes.data || [])
      setDayworks(dayworkRes.data || [])
      setJobDocs(docRes.data || [])

      // Load spend data
      const { data: entries } = await supabase.from('timesheet_entries')
        .select('cost_calculated, date')
        .eq('job_id', jobId)
      const allEntries = entries || []
      const total = allEntries.reduce((s, e) => s + (e.cost_calculated || 0), 0)
      setTotalSpend(total)

      // Calculate weekly spends (last 4 weeks)
      const now = new Date()
      const ws = []
      for (let w = 0; w < 4; w++) {
        const wEnd = new Date(now)
        wEnd.setDate(wEnd.getDate() - w * 7)
        const wStart = new Date(wEnd)
        wStart.setDate(wStart.getDate() - 7)
        const weekTotal = allEntries
          .filter(e => { const d = new Date(e.date); return d >= wStart && d < wEnd })
          .reduce((s, e) => s + (e.cost_calculated || 0), 0)
        ws.push(weekTotal)
      }
      setWeeklySpends(ws)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load job')
    }
    setLoading(false)
  }

  // ── Variations ──
  async function uploadVariationFiles(variationId, files) {
    const uploaded = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `variations/${variationId}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(path, file, { contentType: file.type })
      if (!error) {
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        uploaded.push({ name: file.name, url: urlData.publicUrl, type: file.type, size: file.size })
      }
    }
    return uploaded
  }

  async function handleAddVariation(e) {
    e.preventDefault()
    setSavingVar(true)
    try {
      // Insert variation first to get the ID
      const { data: inserted, error } = await supabase.from('job_variations').insert({
        job_id: jobId,
        description: varForm.description.trim(),
        value: parseMoney(varForm.value),
        date_agreed: varForm.date_agreed || null,
        status: varForm.status,
        reference_number: varForm.reference_number.trim(),
        attachments: [],
      }).select().single()
      if (error) throw error

      // Upload files if any
      if (varFiles.length > 0 && inserted) {
        setUploadingVarFiles(true)
        const uploaded = await uploadVariationFiles(inserted.id, varFiles)
        if (uploaded.length > 0) {
          await supabase.from('job_variations').update({ attachments: uploaded }).eq('id', inserted.id)
        }
        setUploadingVarFiles(false)
      }

      toast.success('Variation added')
      setShowVarForm(false)
      setVarForm({ description: '', value: '', date_agreed: '', status: 'pending', reference_number: '' })
      setVarFiles([])
      loadJob()
    } catch (err) {
      toast.error(err.message)
    }
    setSavingVar(false)
  }

  async function handleAddFilesToVariation(variationId, files) {
    const existing = variations.find(v => v.id === variationId)?.attachments || []
    const uploaded = await uploadVariationFiles(variationId, files)
    if (uploaded.length > 0) {
      const updated = [...existing, ...uploaded]
      const { error } = await supabase.from('job_variations').update({ attachments: updated }).eq('id', variationId)
      if (!error) {
        toast.success(`${uploaded.length} file${uploaded.length > 1 ? 's' : ''} uploaded`)
        loadJob()
      } else {
        toast.error('Failed to save attachments')
      }
    }
  }

  async function handleRemoveAttachment(variationId, fileUrl) {
    const existing = variations.find(v => v.id === variationId)?.attachments || []
    const updated = existing.filter(a => a.url !== fileUrl)
    const { error } = await supabase.from('job_variations').update({ attachments: updated }).eq('id', variationId)
    if (!error) {
      toast.success('File removed')
      loadJob()
    }
  }

  // ── Payment Applications ──
  async function handleAddApplication(e) {
    e.preventDefault()
    setSavingApp(true)
    try {
      const gross = parseMoney(appForm.gross_amount)
      const retention = parseMoney(appForm.retention_held)
      const net = gross - retention
      const existingCount = applications.length
      const { error } = await supabase.from('payment_applications').insert({
        job_id: jobId,
        company_id: cid,
        application_number: existingCount + 1,
        valuation_date: appForm.valuation_date || null,
        period_from: appForm.period_from || null,
        period_to: appForm.period_to || null,
        gross_amount: gross,
        retention_held: retention,
        net_amount: net,
        notes: appForm.notes.trim(),
        status: 'draft',
      })
      if (error) throw error
      toast.success('Application added')
      setShowAppForm(false)
      setAppForm({ valuation_date: '', period_from: '', period_to: '', gross_amount: '', retention_held: '', notes: '' })
      loadJob()
    } catch (err) {
      toast.error(err.message)
    }
    setSavingApp(false)
  }

  async function handleUpdateApplicationStatus(id, status) {
    try {
      const updates = { status }
      const now = new Date().toISOString()
      if (status === 'submitted') updates.submitted_at = now
      if (status === 'certified') {
        updates.certified_at = now
        const app = applications.find(a => a.id === id)
        if (app) updates.amount_certified = app.net_amount
      }
      if (status === 'paid') {
        updates.paid_at = now
        const app = applications.find(a => a.id === id)
        if (app) updates.amount_paid = app.amount_certified || app.net_amount
      }
      const { error } = await supabase.from('payment_applications').update(updates).eq('id', id)
      if (error) throw error
      toast.success(`Application ${status}`)
      loadJob()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Contra Charges ──
  async function handleAddContra(e) {
    e.preventDefault()
    setSavingContra(true)
    try {
      const { error } = await supabase.from('contra_charges').insert({
        job_id: jobId,
        company_id: cid,
        description: contraForm.description.trim(),
        amount: parseMoney(contraForm.amount),
        date_raised: contraForm.date_raised || null,
        raised_by: contraForm.raised_by.trim(),
        status: 'pending',
        attachments: [],
      })
      if (error) throw error
      toast.success('Contra charge logged')
      setShowContraForm(false)
      setContraForm({ description: '', amount: '', date_raised: '', raised_by: '', status: 'pending' })
      loadJob()
    } catch (err) {
      toast.error(err.message)
    }
    setSavingContra(false)
  }

  async function handleUpdateContraStatus(id, status) {
    try {
      const { error } = await supabase.from('contra_charges').update({ status }).eq('id', id)
      if (error) throw error
      toast.success(`Contra ${status}`)
      loadJob()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleAddContraEvidence(contraId, files) {
    const existing = contras.find(c => c.id === contraId)?.attachments || []
    const uploaded = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `contras/${contraId}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(path, file, { contentType: file.type })
      if (!error) {
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        uploaded.push({ name: file.name, url: urlData.publicUrl, type: file.type, size: file.size })
      }
    }
    if (uploaded.length > 0) {
      const updated = [...existing, ...uploaded]
      const { error } = await supabase.from('contra_charges').update({ attachments: updated }).eq('id', contraId)
      if (!error) {
        toast.success(`${uploaded.length} file${uploaded.length > 1 ? 's' : ''} uploaded`)
        loadJob()
      } else {
        toast.error('Failed to save attachments')
      }
    }
  }

  async function handleRemoveContraAttachment(contraId, fileUrl) {
    const existing = contras.find(c => c.id === contraId)?.attachments || []
    const updated = existing.filter(a => a.url !== fileUrl)
    const { error } = await supabase.from('contra_charges').update({ attachments: updated }).eq('id', contraId)
    if (!error) { toast.success('File removed'); loadJob() }
  }

  // ── Daywork Sheets ──
  async function handleAddDaywork(e) {
    e.preventDefault()
    setSavingDaywork(true)
    try {
      const labourCost = dayworkForm.labour.reduce((s, l) => s + ((parseFloat(l.hours) || 0) * parseMoney(l.rate)), 0)
      const plantCost = dayworkForm.plant.reduce((s, p) => s + ((parseFloat(p.hours) || 0) * parseMoney(p.rate)), 0)
      const materialsCost = dayworkForm.materials.reduce((s, m) => s + ((parseFloat(m.quantity) || 0) * parseMoney(m.unit_cost)), 0)
      const totalCost = labourCost + plantCost + materialsCost
      const existingCount = dayworks.length
      const { error } = await supabase.from('daywork_sheets').insert({
        job_id: jobId,
        company_id: cid,
        sheet_number: existingCount + 1,
        date: dayworkForm.date || null,
        description: dayworkForm.description.trim(),
        labour: dayworkForm.labour,
        plant: dayworkForm.plant,
        materials: dayworkForm.materials,
        total_cost: totalCost,
        signed_by: dayworkForm.signed_by.trim(),
        status: 'draft',
      })
      if (error) throw error
      toast.success('Daywork sheet added')
      setShowDayworkForm(false)
      setDayworkForm({ date: '', description: '', labour: [], plant: [], materials: [], signed_by: '' })
      loadJob()
    } catch (err) {
      toast.error(err.message)
    }
    setSavingDaywork(false)
  }

  async function handleUpdateDayworkStatus(id, status) {
    try {
      const { error } = await supabase.from('daywork_sheets').update({ status }).eq('id', id)
      if (error) throw error
      toast.success(`Daywork ${status}`)
      loadJob()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Job Documents ──
  async function handleUploadJobDoc(e) {
    e.preventDefault()
    if (!docFile) { toast.error('Select a file'); return }
    setSavingDoc(true)
    try {
      const ext = docFile.name.split('.').pop()
      const path = `job-docs/${jobId}/${crypto.randomUUID()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('documents').upload(path, docFile, { contentType: docFile.type })
      if (uploadErr) throw uploadErr
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
      const { error } = await supabase.from('job_documents').insert({
        job_id: jobId,
        company_id: cid,
        category: docForm.category,
        title: docForm.title.trim() || docFile.name,
        file_url: urlData.publicUrl,
        file_name: docFile.name,
        file_type: docFile.type,
        file_size: docFile.size,
        notes: docForm.notes.trim(),
      })
      if (error) throw error
      toast.success('Document uploaded')
      setShowDocForm(false)
      setDocForm({ category: 'subcontract', title: '', notes: '' })
      setDocFile(null)
      loadJob()
    } catch (err) {
      toast.error(err.message)
    }
    setSavingDoc(false)
  }

  async function handleDeleteJobDoc(id) {
    if (!confirm('Delete this document?')) return
    try {
      const { error } = await supabase.from('job_documents').delete().eq('id', id)
      if (error) throw error
      toast.success('Document deleted')
      loadJob()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleUpdateFinalAccount(updates) {
    try {
      const { error } = await supabase.from('subcontractor_jobs').update(updates).eq('id', jobId)
      if (error) throw error
      toast.success('Final account updated')
      loadJob()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Operatives ──
  function handleOperativeSelect(opId) {
    setAssignForm(f => ({ ...f, operative_id: opId }))
    if (opId) {
      const op = companyOperatives.find(o => o.id === opId)
      if (op) setComplianceResult(checkCompliance(op))
      else setComplianceResult(null)
    } else {
      setComplianceResult(null)
    }
  }

  async function handleAssignOperative(e) {
    e.preventDefault()
    if (!assignForm.operative_id) { toast.error('Select an operative'); return }
    setSavingAssign(true)
    try {
      const payload = {
        job_id: jobId,
        operative_id: assignForm.operative_id,
        company_id: cid,
        pay_type: assignForm.pay_type,
        pay_rate: parseMoney(assignForm.pay_rate),
        trade_role: assignForm.trade_role.trim(),
        employment_status: assignForm.employment_status,
        cis_rate: parseFloat(assignForm.cis_rate) || 20,
        status: 'active',
        start_date: new Date().toISOString().split('T')[0],
      }
      if (editingOp) {
        const { error } = await supabase.from('job_operatives').update(payload).eq('id', editingOp.id)
        if (error) throw error
        toast.success('Operative updated')
      } else {
        const { error } = await supabase.from('job_operatives').insert(payload)
        if (error) throw error
        toast.success('Operative assigned')
      }
      setShowAssignModal(false)
      setEditingOp(null)
      setAssignForm({ operative_id: '', pay_type: 'daily', pay_rate: '', trade_role: '', employment_status: 'self_employed', cis_rate: '20' })
      setComplianceResult(null)
      loadJob()
    } catch (err) {
      toast.error(err.message)
    }
    setSavingAssign(false)
  }

  async function toggleOperativeStatus(jop) {
    const newStatus = jop.status === 'active' ? 'inactive' : 'active'
    const { error } = await supabase.from('job_operatives').update({ status: newStatus }).eq('id', jop.id)
    if (error) toast.error(error.message)
    else { toast.success(`Operative ${newStatus}`); loadJob() }
  }

  function openEditOperative(jop) {
    setEditingOp(jop)
    setAssignForm({
      operative_id: jop.operative_id,
      pay_type: jop.pay_type || 'daily',
      pay_rate: jop.pay_rate ? (jop.pay_rate / 100).toFixed(2) : '',
      trade_role: jop.trade_role || '',
      employment_status: jop.employment_status || 'self_employed',
      cis_rate: String(jop.cis_rate ?? 20),
    })
    if (jop.operatives) setComplianceResult(checkCompliance(jop.operatives))
    setShowAssignModal(true)
  }

  // ── Timesheet ──
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])

  async function loadTimesheet() {
    setLoadingTimesheet(true)
    const startStr = weekDates[0]
    const endStr = weekDates[6]
    try {
      const { data } = await supabase.from('timesheet_entries')
        .select('*')
        .eq('job_id', jobId)
        .gte('date', startStr)
        .lte('date', endStr)
      setTimesheetEntries(data || [])

      // Check for discrepancies
      if (job?.project_id) {
        const dayStart = new Date(startStr)
        dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(endStr)
        dayEnd.setHours(23, 59, 59, 999)
        const { data: attendance } = await supabase.from('site_attendance')
          .select('operative_id, operative_name')
          .eq('project_id', job.project_id)
          .gte('recorded_at', dayStart.toISOString())
          .lte('recorded_at', dayEnd.toISOString())
          .eq('type', 'sign_in')
        const scannedIds = [...new Set((attendance || []).map(a => a.operative_id))]
        const assignedIds = new Set(jobOperatives.filter(o => o.status === 'active').map(o => o.operative_id))
        const unassigned = (attendance || []).filter(a => a.operative_id && !assignedIds.has(a.operative_id))
        const unassignedUnique = [...new Map(unassigned.map(u => [u.operative_id, u])).values()]
        const missing = jobOperatives.filter(o => o.status === 'active' && !scannedIds.includes(o.operative_id))
        setDiscrepancies({ unassigned: unassignedUnique, missing })
      }
    } catch (err) {
      console.error(err)
    }
    setLoadingTimesheet(false)
  }

  function shiftWeek(dir) {
    setWeekStart(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + dir * 7)
      return d
    })
  }

  async function generateFromQR() {
    if (!job?.project_id) { toast.error('Job has no project linked'); return }
    setGeneratingQR(true)
    try {
      const dayStart = new Date(weekDates[0])
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(weekDates[6])
      dayEnd.setHours(23, 59, 59, 999)

      const { data: attendance } = await supabase.from('site_attendance')
        .select('*')
        .eq('project_id', job.project_id)
        .gte('recorded_at', dayStart.toISOString())
        .lte('recorded_at', dayEnd.toISOString())
        .order('recorded_at')

      if (!attendance?.length) { toast('No QR attendance data for this week'); setGeneratingQR(false); return }

      // Group by operative + date
      const grouped = {}
      for (const rec of attendance) {
        const dateKey = new Date(rec.recorded_at).toISOString().split('T')[0]
        const key = `${rec.operative_id}_${dateKey}`
        if (!grouped[key]) grouped[key] = { operative_id: rec.operative_id, date: dateKey, signIns: [], signOuts: [] }
        if (rec.type === 'sign_in') grouped[key].signIns.push(rec)
        else if (rec.type === 'sign_out') grouped[key].signOuts.push(rec)
      }

      const activeOps = new Map(jobOperatives.filter(o => o.status === 'active').map(o => [o.operative_id, o]))
      const entries = []

      for (const g of Object.values(grouped)) {
        const jop = activeOps.get(g.operative_id)
        if (!jop) continue

        const signIn = g.signIns[0]
        const signOut = g.signOuts[g.signOuts.length - 1]
        const hoursData = calculateHoursWorked(signIn?.recorded_at, signOut?.recorded_at)
        const cost = calculateCost(hoursData, jop.pay_type, jop.pay_rate)

        entries.push({
          job_operative_id: jop.id,
          job_id: jobId,
          operative_id: g.operative_id,
          company_id: cid,
          date: g.date,
          sign_in_id: signIn?.id || null,
          sign_out_id: signOut?.id || null,
          sign_in_time: signIn?.recorded_at || null,
          sign_out_time: signOut?.recorded_at || null,
          hours_calculated: hoursData.hours,
          hours_adjusted: hoursData.hours,
          day_type: hoursData.dayType,
          cost_calculated: cost,
          is_manual_entry: false,
          status: 'auto',
        })
      }

      if (entries.length > 0) {
        // Upsert: delete existing auto entries for this week, then insert
        await supabase.from('timesheet_entries')
          .delete()
          .eq('job_id', jobId)
          .eq('is_manual_entry', false)
          .gte('date', weekDates[0])
          .lte('date', weekDates[6])

        const { error } = await supabase.from('timesheet_entries').insert(entries)
        if (error) throw error
        toast.success(`Generated ${entries.length} timesheet entries from QR data`)
      } else {
        toast('No matching operatives found in attendance data')
      }
      loadTimesheet()
      loadJob()
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate timesheet')
    }
    setGeneratingQR(false)
  }

  async function approveAll() {
    setApprovingAll(true)
    try {
      const ids = timesheetEntries.filter(e => e.status !== 'approved').map(e => e.id)
      if (ids.length === 0) { toast('All entries already approved'); setApprovingAll(false); return }
      const { error } = await supabase.from('timesheet_entries')
        .update({ status: 'approved', approved_by: user?.name || 'Manager', approved_at: new Date().toISOString() })
        .in('id', ids)
      if (error) throw error
      toast.success(`${ids.length} entries approved`)
      loadTimesheet()
    } catch (err) {
      toast.error(err.message)
    }
    setApprovingAll(false)
  }

  async function handleSaveCellEdit(entryId) {
    const hours = parseFloat(editHours)
    if (isNaN(hours) || hours < 0) { toast.error('Invalid hours'); return }
    const entry = timesheetEntries.find(e => e.id === entryId)
    if (!entry) return
    const jop = jobOperatives.find(o => o.id === entry.job_operative_id)
    const hoursData = { hours, dayType: hours >= 8 ? 'full' : hours >= 4 ? 'half' : 'none' }
    const cost = jop ? calculateCost(hoursData, jop.pay_type, jop.pay_rate) : 0
    const { error } = await supabase.from('timesheet_entries')
      .update({ hours_adjusted: hours, cost_calculated: cost, day_type: hoursData.dayType })
      .eq('id', entryId)
    if (error) toast.error(error.message)
    else { toast.success('Updated'); setEditingCell(null); loadTimesheet(); loadJob() }
  }

  async function handleManualEntry(e) {
    e.preventDefault()
    if (!manualForm.operative_id || !manualForm.date) { toast.error('Operative and date required'); return }
    const jop = jobOperatives.find(o => o.operative_id === manualForm.operative_id)
    if (!jop) { toast.error('Operative not assigned to this job'); return }
    setSavingEntry(true)
    const hours = parseFloat(manualForm.hours) || 0
    const hoursData = { hours, dayType: manualForm.day_type }
    const cost = calculateCost(hoursData, jop.pay_type, jop.pay_rate)
    try {
      const { error } = await supabase.from('timesheet_entries').insert({
        job_operative_id: jop.id,
        job_id: jobId,
        operative_id: manualForm.operative_id,
        company_id: cid,
        date: manualForm.date,
        hours_calculated: hours,
        hours_adjusted: hours,
        day_type: manualForm.day_type,
        cost_calculated: cost,
        is_manual_entry: true,
        is_daywork: manualForm.is_daywork,
        daywork_description: manualForm.daywork_description,
        notes: manualForm.notes,
        status: 'auto',
      })
      if (error) throw error
      toast.success('Entry added')
      setShowManualEntry(false)
      setManualForm({ operative_id: '', date: '', hours: '', day_type: 'full', is_daywork: false, daywork_description: '', notes: '' })
      loadTimesheet()
      loadJob()
    } catch (err) {
      toast.error(err.message)
    }
    setSavingEntry(false)
  }

  // ── Invoices ──
  async function loadInvoices() {
    const { data } = await supabase.from('invoices')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
    setInvoices(data || [])
  }

  useEffect(() => { if (cid && jobId) loadJob() }, [cid, jobId])
  useEffect(() => { if (job && activeTab === 'timesheet') loadTimesheet() }, [job, weekStart, activeTab])
  useEffect(() => { if (job && activeTab === 'invoices') loadInvoices() }, [job, activeTab])

  const [invoicePeriodTotal, setInvoicePeriodTotal] = useState(0)

  useEffect(() => {
    async function calcInvoicePeriodTotal() {
      if (!invoiceForm.period_from || !invoiceForm.period_to) { setInvoicePeriodTotal(0); return }
      try {
        const { data } = await supabase.from('timesheet_entries')
          .select('cost_calculated')
          .eq('job_id', jobId)
          .eq('status', 'approved')
          .gte('date', invoiceForm.period_from)
          .lte('date', invoiceForm.period_to)
        setInvoicePeriodTotal((data || []).reduce((s, e) => s + (e.cost_calculated || 0), 0))
      } catch {
        setInvoicePeriodTotal(0)
      }
    }
    calcInvoicePeriodTotal()
  }, [invoiceForm.period_from, invoiceForm.period_to, jobId])

  async function handleCreateInvoice(e) {
    e.preventDefault()
    setSavingInvoice(true)
    try {
      const gross = parseMoney(invoiceForm.gross_amount) || invoicePeriodTotal
      const retPct = job?.retention_pct || 5
      const avgCisRate = jobOperatives.length > 0
        ? jobOperatives.reduce((s, o) => s + (o.cis_rate || 20), 0) / jobOperatives.length
        : 20
      const totals = calculateInvoiceTotals(gross, retPct, avgCisRate)

      const payload = {
        job_id: jobId,
        company_id: cid,
        period_from: invoiceForm.period_from,
        period_to: invoiceForm.period_to,
        gross_amount: gross,
        retention_amount: totals.retention,
        cis_deduction: totals.cisDeduction,
        net_amount: totals.netAmount,
        retention_pct: retPct,
        cis_rate: avgCisRate,
        status: invoiceForm.status || 'draft',
      }

      if (editingInvoice) {
        const { error } = await supabase.from('invoices').update(payload).eq('id', editingInvoice.id)
        if (error) throw error
        toast.success('Invoice updated')
      } else {
        const { error } = await supabase.from('invoices').insert(payload)
        if (error) throw error
        toast.success('Invoice created')
      }
      setShowInvoiceForm(false)
      setEditingInvoice(null)
      setInvoiceForm({ period_from: '', period_to: '', gross_amount: '', status: 'draft' })
      loadInvoices()
    } catch (err) {
      toast.error(err.message)
    }
    setSavingInvoice(false)
  }

  // ── Projections ──
  const projections = useMemo(() => {
    if (!job) return null
    const varsTotal = variations.filter(v => v.status === 'approved').reduce((s, v) => s + (v.value || 0), 0)
    const jobWithRevised = { ...job, revised_contract_value: (job.contract_value || 0) + varsTotal }
    return calculateProjections(jobWithRevised, totalSpend, weeklySpends)
  }, [job, variations, totalSpend, weeklySpends])

  const revisedValue = useMemo(() => {
    const varsTotal = variations.filter(v => v.status === 'approved').reduce((s, v) => s + (v.value || 0), 0)
    return (job?.contract_value || 0) + varsTotal
  }, [job, variations])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!job) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <p className="text-slate-500">Job not found</p>
        <button onClick={() => navigate('/app/jobs')} className="mt-4 text-blue-500 text-sm hover:underline">Back to Jobs</button>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/app/jobs')} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-900 truncate">{job.name}</h1>
          <p className="text-sm text-slate-500">{job.main_contractor || 'No main contractor'}</p>
        </div>
        <StatusChip status={job.status} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab
          job={job} variations={variations} projections={projections}
          revisedValue={revisedValue} totalSpend={totalSpend}
          jobOperatives={jobOperatives}
          showVarForm={showVarForm} setShowVarForm={setShowVarForm}
          varForm={varForm} setVarForm={setVarForm} varFiles={varFiles} setVarFiles={setVarFiles}
          handleAddVariation={handleAddVariation} savingVar={savingVar} uploadingVarFiles={uploadingVarFiles}
          handleAddFilesToVariation={handleAddFilesToVariation} handleRemoveAttachment={handleRemoveAttachment}
        />
      )}

      {activeTab === 'operatives' && (
        <OperativesTab
          jobOperatives={jobOperatives} companyOperatives={companyOperatives}
          showAssignModal={showAssignModal} setShowAssignModal={setShowAssignModal}
          assignForm={assignForm} setAssignForm={setAssignForm}
          handleOperativeSelect={handleOperativeSelect}
          complianceResult={complianceResult}
          handleAssignOperative={handleAssignOperative}
          savingAssign={savingAssign}
          toggleOperativeStatus={toggleOperativeStatus}
          openEditOperative={openEditOperative}
          editingOp={editingOp} setEditingOp={setEditingOp}
          setComplianceResult={setComplianceResult}
        />
      )}

      {activeTab === 'timesheet' && (
        <TimesheetTab
          jobOperatives={jobOperatives} weekDates={weekDates} weekStart={weekStart}
          timesheetEntries={timesheetEntries} loadingTimesheet={loadingTimesheet}
          shiftWeek={shiftWeek} generateFromQR={generateFromQR} generatingQR={generatingQR}
          approveAll={approveAll} approvingAll={approvingAll}
          editingCell={editingCell} setEditingCell={setEditingCell}
          editHours={editHours} setEditHours={setEditHours}
          handleSaveCellEdit={handleSaveCellEdit}
          showManualEntry={showManualEntry} setShowManualEntry={setShowManualEntry}
          manualForm={manualForm} setManualForm={setManualForm}
          handleManualEntry={handleManualEntry}
          savingEntry={savingEntry}
          discrepancies={discrepancies}
          job={job}
        />
      )}

      {activeTab === 'applications' && (
        <PaymentApplicationsTab
          applications={applications}
          showAppForm={showAppForm} setShowAppForm={setShowAppForm}
          appForm={appForm} setAppForm={setAppForm}
          handleAddApplication={handleAddApplication} savingApp={savingApp}
          handleUpdateApplicationStatus={handleUpdateApplicationStatus}
        />
      )}

      {activeTab === 'contras' && (
        <ContraChargesTab
          contras={contras}
          showContraForm={showContraForm} setShowContraForm={setShowContraForm}
          contraForm={contraForm} setContraForm={setContraForm}
          handleAddContra={handleAddContra} savingContra={savingContra}
          handleUpdateContraStatus={handleUpdateContraStatus}
          handleAddContraEvidence={handleAddContraEvidence}
          handleRemoveContraAttachment={handleRemoveContraAttachment}
        />
      )}

      {activeTab === 'dayworks' && (
        <DayworkSheetsTab
          dayworks={dayworks}
          showDayworkForm={showDayworkForm} setShowDayworkForm={setShowDayworkForm}
          dayworkForm={dayworkForm} setDayworkForm={setDayworkForm}
          handleAddDaywork={handleAddDaywork} savingDaywork={savingDaywork}
          handleUpdateDayworkStatus={handleUpdateDayworkStatus}
        />
      )}

      {activeTab === 'documents' && (
        <DocumentsTab
          jobDocs={jobDocs}
          showDocForm={showDocForm} setShowDocForm={setShowDocForm}
          docForm={docForm} setDocForm={setDocForm}
          docFile={docFile} setDocFile={setDocFile}
          handleUploadJobDoc={handleUploadJobDoc} savingDoc={savingDoc}
          handleDeleteJobDoc={handleDeleteJobDoc}
        />
      )}

      {activeTab === 'invoices' && (
        <InvoicesTab
          invoices={invoices} job={job}
          showInvoiceForm={showInvoiceForm} setShowInvoiceForm={setShowInvoiceForm}
          invoiceForm={invoiceForm} setInvoiceForm={setInvoiceForm}
          handleCreateInvoice={handleCreateInvoice} savingInvoice={savingInvoice}
          invoicePeriodTotal={invoicePeriodTotal}
          editingInvoice={editingInvoice} setEditingInvoice={setEditingInvoice}
          jobOperatives={jobOperatives}
        />
      )}

      {activeTab === 'final-account' && (
        <FinalAccountTab
          job={job} variations={variations} contras={contras}
          applications={applications}
          handleUpdateFinalAccount={handleUpdateFinalAccount}
        />
      )}

      <style>{`
        .input-field {
          width: 100%; padding: 0.5rem 0.75rem; background: white;
          border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.875rem;
          color: #1e293b; outline: none; transition: border-color 0.15s;
        }
        .input-field:focus { border-color: #3b82f6; }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════

function StatusChip({ status }) {
  const s = JOB_STATUSES.find(j => j.value === status) || { label: status, color: 'slate' }
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold bg-${s.color}-100 text-${s.color}-700`}>
      {s.label}
    </span>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

function Card({ title, action, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          {title && <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>}
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Overview Tab ──
function OverviewTab({ job, variations, projections, revisedValue, totalSpend, jobOperatives, showVarForm, setShowVarForm, varForm, setVarForm, varFiles, setVarFiles, handleAddVariation, savingVar, uploadingVarFiles, handleAddFilesToVariation, handleRemoveAttachment }) {
  return (
    <div className="space-y-6">
      {/* Quick stats */}
      {projections && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Operatives Assigned" value={jobOperatives.filter(o => o.status === 'active').length} />
          <StatCard label="Total Spend to Date" value={formatMoney(totalSpend)} />
          <StatCard label="Projected Margin" value={formatMoney(projections.projectedMargin)} sub={`${projections.projectedMarginPct}%`}
            color={projections.trafficLight === 'red' ? 'red' : projections.trafficLight === 'amber' ? 'amber' : 'green'} />
          <StatCard label="Weekly Burn Rate" value={formatMoney(projections.burnRate)} />
        </div>
      )}

      {/* Job details */}
      <Card title="Job Details">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <Detail label="Main Contractor" value={job.main_contractor || '—'} />
          <Detail label="Start Date" value={job.start_date ? new Date(job.start_date).toLocaleDateString('en-GB') : '—'} />
          <Detail label="Est. Completion" value={job.est_completion_date ? new Date(job.est_completion_date).toLocaleDateString('en-GB') : '—'} />
          <Detail label="Original Contract" value={formatMoney(job.contract_value)} />
          <Detail label="Revised Contract" value={formatMoney(revisedValue)} />
          <Detail label="Retention" value={`${job.retention_pct || 0}%`} />
          <Detail label="Payment Terms" value={`${job.payment_terms_days || 0} days`} />
          <Detail label="Status" value={job.status} />
        </div>
        {job.scope_description && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-1">Scope Description</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{job.scope_description}</p>
          </div>
        )}
      </Card>

      {/* Variations */}
      <Card
        title={`Variations (${variations.length})`}
        action={
          <button onClick={() => setShowVarForm(true)} className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-700 font-medium">
            <Plus size={14} /> Add Variation
          </button>
        }
      >
        {variations.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No variations yet</p>
        ) : (
          <div className="space-y-3">
            {variations.map(v => {
              const attachments = Array.isArray(v.attachments) ? v.attachments : []
              return (
                <div key={v.id} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{v.description}</p>
                      <p className="text-xs text-slate-400">{v.reference_number && `Ref: ${v.reference_number} · `}{v.date_agreed ? new Date(v.date_agreed).toLocaleDateString('en-GB') : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold tabular-nums ${v.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatMoney(v.value)}
                      </p>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        v.status === 'approved' ? 'bg-green-100 text-green-700' :
                        v.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>{v.status}</span>
                    </div>
                  </div>

                  {/* Attachments */}
                  {attachments.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-50 flex flex-wrap gap-2">
                      {attachments.map((att, i) => {
                        const isImage = att.type?.startsWith('image/')
                        return (
                          <div key={i} className="group relative">
                            {isImage ? (
                              <a href={att.url} target="_blank" rel="noopener noreferrer" className="block w-16 h-16 rounded-lg overflow-hidden border border-slate-200 hover:border-blue-300 transition-colors">
                                <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                              </a>
                            ) : (
                              <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg hover:border-blue-300 transition-colors">
                                <FileText size={14} className="text-slate-400 shrink-0" />
                                <span className="text-xs text-slate-600 truncate max-w-[120px]">{att.name}</span>
                              </a>
                            )}
                            <button onClick={() => handleRemoveAttachment(v.id, att.url)}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Remove file">
                              <X size={10} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Add files button */}
                  <div className="mt-2 pt-2 border-t border-slate-50">
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-500 cursor-pointer transition-colors">
                      <Paperclip size={12} />
                      <span>Attach file</span>
                      <input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden"
                        onChange={e => {
                          const files = Array.from(e.target.files || [])
                          if (files.some(f => f.size > 25 * 1024 * 1024)) { toast.error('Max file size is 25MB'); return }
                          if (files.length) handleAddFilesToVariation(v.id, files)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {showVarForm && (
          <form onSubmit={handleAddVariation} className="mt-4 pt-4 border-t border-slate-200 space-y-3">
            <Field label="Description *">
              <input type="text" value={varForm.description} onChange={e => setVarForm(f => ({ ...f, description: e.target.value }))} className="input-field" required />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Value">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">£</span>
                  <input type="text" value={varForm.value} onChange={e => setVarForm(f => ({ ...f, value: e.target.value }))} className="input-field" style={{ paddingLeft: '1.75rem' }} placeholder="0.00" />
                </div>
              </Field>
              <Field label="Date Agreed">
                <input type="date" value={varForm.date_agreed} onChange={e => setVarForm(f => ({ ...f, date_agreed: e.target.value }))} className="input-field" />
              </Field>
              <Field label="Status">
                <select value={varForm.status} onChange={e => setVarForm(f => ({ ...f, status: e.target.value }))} className="input-field">
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </Field>
            </div>
            <Field label="Reference Number">
              <input type="text" value={varForm.reference_number} onChange={e => setVarForm(f => ({ ...f, reference_number: e.target.value }))} className="input-field" />
            </Field>
            <Field label="Attachments">
              <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 transition-colors">
                <Paperclip size={14} className="text-slate-400" />
                <span className="text-sm text-slate-500">{varFiles.length ? `${varFiles.length} file${varFiles.length > 1 ? 's' : ''} selected` : 'Attach photos or documents...'}</span>
                <input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files || [])
                    if (files.some(f => f.size > 25 * 1024 * 1024)) { toast.error('Max file size is 25MB'); return }
                    setVarFiles(prev => [...prev, ...files])
                  }}
                />
              </label>
              {varFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {varFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
                      {f.type?.startsWith('image/') ? <Image size={12} /> : <FileText size={12} />}
                      <span className="truncate max-w-[120px]">{f.name}</span>
                      <button type="button" onClick={() => setVarFiles(prev => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500">
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Field>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowVarForm(false); setVarFiles([]) }} className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={savingVar || uploadingVarFiles} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">
                {(savingVar || uploadingVarFiles) && <Loader2 size={14} className="animate-spin" />} {uploadingVarFiles ? 'Uploading...' : 'Add'}
              </button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}

function StatCard({ label, value, sub, color = 'slate' }) {
  const colors = {
    green: 'border-green-200 bg-green-50',
    amber: 'border-amber-200 bg-amber-50',
    red: 'border-red-200 bg-red-50',
    slate: 'border-slate-200 bg-white',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.slate}`}>
      <p className="text-[11px] font-medium text-slate-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm text-slate-800 font-medium">{value}</p>
    </div>
  )
}

// ── Operatives Tab ──
function OperativesTab({
  jobOperatives, companyOperatives, showAssignModal, setShowAssignModal,
  assignForm, setAssignForm, handleOperativeSelect, complianceResult,
  handleAssignOperative, savingAssign, toggleOperativeStatus, openEditOperative,
  editingOp, setEditingOp, setComplianceResult,
}) {
  const activeOps = jobOperatives.filter(o => o.status === 'active')
  const inactiveOps = jobOperatives.filter(o => o.status !== 'active')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{activeOps.length} active, {inactiveOps.length} inactive</p>
        <button
          onClick={() => {
            setEditingOp(null)
            setAssignForm({ operative_id: '', pay_type: 'daily', pay_rate: '', trade_role: '', employment_status: 'self_employed', cis_rate: '20' })
            setComplianceResult(null)
            setShowAssignModal(true)
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus size={16} /> Assign Operative
        </button>
      </div>

      {jobOperatives.length === 0 ? (
        <div className="text-center py-12 bg-white border border-slate-200 rounded-xl">
          <Users size={36} className="text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">No operatives assigned yet</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Trade</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Pay Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Rate</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">CIS</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobOperatives.map(jop => {
                const op = jop.operatives || {}
                const payLabel = PAY_TYPES.find(p => p.value === jop.pay_type)?.label || jop.pay_type
                return (
                  <tr key={jop.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{op.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{jop.trade_role || op.role || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{payLabel}</td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums">{formatMoney(jop.pay_rate)}</td>
                    <td className="px-4 py-3 text-slate-600">{jop.cis_rate}%</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleOperativeStatus(jop)}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer ${
                          jop.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {jop.status}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEditOperative(jop)} className="text-blue-500 hover:text-blue-700 text-xs font-medium">
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Assign / Edit modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">{editingOp ? 'Edit Assignment' : 'Assign Operative'}</h2>
              <button onClick={() => { setShowAssignModal(false); setEditingOp(null); setComplianceResult(null) }} className="p-1 hover:bg-slate-100 rounded-lg">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleAssignOperative} className="p-5 space-y-4">
              <Field label="Operative *">
                <select
                  value={assignForm.operative_id}
                  onChange={e => handleOperativeSelect(e.target.value)}
                  className="input-field"
                  disabled={!!editingOp}
                >
                  <option value="">— Select operative —</option>
                  {companyOperatives.map(op => (
                    <option key={op.id} value={op.id}>{op.name} — {op.role || 'No role'}</option>
                  ))}
                </select>
              </Field>

              {/* Compliance warnings */}
              {complianceResult && complianceResult.issues.length > 0 && (
                <div className={`p-3 rounded-lg text-xs space-y-1 ${complianceResult.canAssign ? 'bg-amber-50 border border-amber-200' : 'bg-red-50 border border-red-200'}`}>
                  <p className={`font-semibold ${complianceResult.canAssign ? 'text-amber-700' : 'text-red-700'}`}>
                    <AlertTriangle size={13} className="inline mr-1" />
                    {complianceResult.canAssign ? 'Compliance Warnings' : 'Cannot Assign — Blocking Issues'}
                  </p>
                  {complianceResult.issues.map((issue, i) => (
                    <p key={i} className={complianceResult.blocking.includes(issue) ? 'text-red-600 font-medium' : 'text-amber-600'}>
                      {complianceResult.blocking.includes(issue) ? '✕' : '!'} {issue}
                    </p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Pay Type">
                  <select value={assignForm.pay_type} onChange={e => setAssignForm(f => ({ ...f, pay_type: e.target.value }))} className="input-field">
                    {PAY_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </Field>
                <Field label="Pay Rate">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">£</span>
                    <input type="text" value={assignForm.pay_rate} onChange={e => setAssignForm(f => ({ ...f, pay_rate: e.target.value }))} className="input-field" style={{ paddingLeft: '1.75rem' }} placeholder="0.00" />
                  </div>
                </Field>
              </div>
              <Field label="Trade / Role">
                <input type="text" value={assignForm.trade_role} onChange={e => setAssignForm(f => ({ ...f, trade_role: e.target.value }))} className="input-field" placeholder="e.g. Electrician" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Employment Status">
                  <select value={assignForm.employment_status} onChange={e => setAssignForm(f => ({ ...f, employment_status: e.target.value }))} className="input-field">
                    {EMPLOYMENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label="CIS Rate">
                  <select value={assignForm.cis_rate} onChange={e => setAssignForm(f => ({ ...f, cis_rate: e.target.value }))} className="input-field">
                    {CIS_RATES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Field>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => { setShowAssignModal(false); setEditingOp(null); setComplianceResult(null) }}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit"
                  disabled={savingAssign || (complianceResult && !complianceResult.canAssign)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-semibold">
                  {savingAssign && <Loader2 size={14} className="animate-spin" />}
                  {editingOp ? 'Update' : 'Assign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Timesheet Tab ──
function TimesheetTab({
  jobOperatives, weekDates, timesheetEntries, loadingTimesheet,
  shiftWeek, generateFromQR, generatingQR, approveAll, approvingAll,
  editingCell, setEditingCell, editHours, setEditHours, handleSaveCellEdit,
  showManualEntry, setShowManualEntry, manualForm, setManualForm, handleManualEntry, savingEntry,
  discrepancies,
}) {
  const activeOps = jobOperatives.filter(o => o.status === 'active')
  const weekLabel = `${new Date(weekDates[0]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — ${new Date(weekDates[6]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`

  // Build grid data
  const gridData = useMemo(() => {
    return activeOps.map(jop => {
      const op = jop.operatives || {}
      const days = weekDates.map(date => {
        const entry = timesheetEntries.find(e => e.operative_id === jop.operative_id && e.date === date)
        return entry || null
      })
      const totalHours = days.reduce((s, e) => s + (e?.hours_adjusted ?? e?.hours_calculated ?? 0), 0)
      const totalCost = days.reduce((s, e) => s + (e?.cost_calculated ?? 0), 0)
      return { jop, op, days, totalHours, totalCost }
    })
  }, [activeOps, weekDates, timesheetEntries])

  const weekTotalCost = gridData.reduce((s, r) => s + r.totalCost, 0)
  const weekTotalHours = gridData.reduce((s, r) => s + r.totalHours, 0)

  const statusColors = {
    approved: 'bg-green-50 text-green-800 border-green-200',
    reviewed: 'bg-blue-50 text-blue-800 border-blue-200',
    auto: 'bg-slate-50 text-slate-700 border-slate-200',
    queried: 'bg-amber-50 text-amber-800 border-amber-200',
  }

  return (
    <div className="space-y-4">
      {/* Week navigation */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => shiftWeek(-1)} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronLeft size={18} className="text-slate-600" /></button>
          <span className="text-sm font-semibold text-slate-800 min-w-[200px] text-center">{weekLabel}</span>
          <button onClick={() => shiftWeek(1)} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronRight size={18} className="text-slate-600" /></button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowManualEntry(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            <Plus size={14} /> Manual Entry
          </button>
          <button onClick={generateFromQR} disabled={generatingQR} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50">
            {generatingQR ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Generate from QR
          </button>
          <button onClick={approveAll} disabled={approvingAll} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-green-500 hover:bg-green-600 rounded-lg disabled:opacity-50">
            {approvingAll ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Approve All
          </button>
        </div>
      </div>

      {/* Timesheet grid */}
      {loadingTimesheet ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
      ) : activeOps.length === 0 ? (
        <div className="text-center py-12 bg-white border border-slate-200 rounded-xl">
          <Clock size={36} className="text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">No active operatives assigned — assign operatives first</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 sticky left-0 bg-slate-50 min-w-[140px]">Operative</th>
                  {weekDates.map((date, i) => (
                    <th key={date} className="text-center px-2 py-2.5 text-xs font-medium text-slate-500 min-w-[70px]">
                      <div>{DAY_NAMES[i]}</div>
                      <div className="text-[10px] text-slate-400">{new Date(date).getDate()}</div>
                    </th>
                  ))}
                  <th className="text-center px-3 py-2.5 text-xs font-medium text-slate-500 min-w-[60px]">Hours</th>
                  <th className="text-center px-3 py-2.5 text-xs font-medium text-slate-500 min-w-[80px]">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gridData.map(row => (
                  <tr key={row.jop.id} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2 font-medium text-slate-800 sticky left-0 bg-white truncate max-w-[140px]">
                      {row.op.name || '—'}
                      <span className="block text-[10px] text-slate-400 font-normal">{row.jop.trade_role || row.op.role || ''}</span>
                    </td>
                    {row.days.map((entry, i) => {
                      const isEditing = editingCell === entry?.id
                      const sc = entry ? (statusColors[entry.status] || statusColors.auto) : ''
                      const hours = entry?.hours_adjusted ?? entry?.hours_calculated ?? 0
                      return (
                        <td key={weekDates[i]} className="px-1 py-1 text-center">
                          {isEditing ? (
                            <div className="flex items-center gap-0.5">
                              <input
                                type="number" step="0.25" min="0" max="24"
                                value={editHours}
                                onChange={e => setEditHours(e.target.value)}
                                className="w-12 px-1 py-0.5 border border-blue-300 rounded text-xs text-center"
                                autoFocus
                                onKeyDown={e => { if (e.key === 'Enter') handleSaveCellEdit(entry.id); if (e.key === 'Escape') setEditingCell(null) }}
                              />
                              <button onClick={() => handleSaveCellEdit(entry.id)} className="text-green-500"><CheckCircle size={12} /></button>
                            </div>
                          ) : entry ? (
                            <button
                              onClick={() => { setEditingCell(entry.id); setEditHours(String(hours)) }}
                              className={`inline-block px-1.5 py-0.5 rounded border text-[11px] tabular-nums ${sc}`}
                              title={`${hours}h · ${formatMoney(entry.cost_calculated)} · ${entry.status}`}
                            >
                              {hours > 0 ? hours.toFixed(1) : '—'}
                            </button>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-center font-semibold text-slate-700 tabular-nums">{row.totalHours.toFixed(1)}</td>
                    <td className="px-3 py-2 text-center font-semibold text-slate-700 tabular-nums">{formatMoney(row.totalCost)}</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                  <td className="px-3 py-2 text-slate-700 sticky left-0 bg-slate-50">Weekly Total</td>
                  {weekDates.map(date => {
                    const dayTotal = timesheetEntries.filter(e => e.date === date).reduce((s, e) => s + (e.cost_calculated || 0), 0)
                    return <td key={date} className="px-2 py-2 text-center text-[11px] text-slate-600 tabular-nums">{dayTotal > 0 ? formatMoney(dayTotal) : '—'}</td>
                  })}
                  <td className="px-3 py-2 text-center text-slate-700 tabular-nums">{weekTotalHours.toFixed(1)}</td>
                  <td className="px-3 py-2 text-center text-slate-800 tabular-nums">{formatMoney(weekTotalCost)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Discrepancy alerts */}
      {(discrepancies.unassigned.length > 0 || discrepancies.missing.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5"><AlertTriangle size={14} /> Discrepancy Alerts</p>
          {discrepancies.unassigned.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-800 mb-1">Scanned in but not assigned to this job:</p>
              <div className="flex flex-wrap gap-1">
                {discrepancies.unassigned.map(u => (
                  <span key={u.operative_id} className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[11px] rounded-full">{u.operative_name || u.operative_id}</span>
                ))}
              </div>
            </div>
          )}
          {discrepancies.missing.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-800 mb-1">Assigned but did not scan in this week:</p>
              <div className="flex flex-wrap gap-1">
                {discrepancies.missing.map(m => (
                  <span key={m.id} className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[11px] rounded-full">{m.operatives?.name || m.operative_id}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual entry modal */}
      {showManualEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Manual Timesheet Entry</h2>
              <button onClick={() => setShowManualEntry(false)} className="p-1 hover:bg-slate-100 rounded-lg"><X size={20} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleManualEntry} className="p-5 space-y-4">
              <Field label="Operative *">
                <select value={manualForm.operative_id} onChange={e => setManualForm(f => ({ ...f, operative_id: e.target.value }))} className="input-field">
                  <option value="">— Select —</option>
                  {activeOps.map(jop => (
                    <option key={jop.operative_id} value={jop.operative_id}>{jop.operatives?.name || jop.operative_id}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date *">
                  <input type="date" value={manualForm.date} onChange={e => setManualForm(f => ({ ...f, date: e.target.value }))} className="input-field" required />
                </Field>
                <Field label="Hours">
                  <input type="number" step="0.25" value={manualForm.hours} onChange={e => setManualForm(f => ({ ...f, hours: e.target.value }))} className="input-field" placeholder="8" />
                </Field>
              </div>
              <Field label="Day Type">
                <select value={manualForm.day_type} onChange={e => setManualForm(f => ({ ...f, day_type: e.target.value }))} className="input-field">
                  <option value="full">Full Day</option>
                  <option value="half">Half Day</option>
                </select>
              </Field>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_daywork" checked={manualForm.is_daywork} onChange={e => setManualForm(f => ({ ...f, is_daywork: e.target.checked }))} className="rounded" />
                <label htmlFor="is_daywork" className="text-sm text-slate-700">Daywork</label>
              </div>
              {manualForm.is_daywork && (
                <Field label="Daywork Description">
                  <textarea value={manualForm.daywork_description} onChange={e => setManualForm(f => ({ ...f, daywork_description: e.target.value }))} rows={2} className="input-field" />
                </Field>
              )}
              <Field label="Notes">
                <input type="text" value={manualForm.notes} onChange={e => setManualForm(f => ({ ...f, notes: e.target.value }))} className="input-field" />
              </Field>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowManualEntry(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={savingEntry} className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold disabled:opacity-50">{savingEntry ? 'Adding...' : 'Add Entry'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Invoices Tab ──
function InvoicesTab({
  invoices, job, showInvoiceForm, setShowInvoiceForm,
  invoiceForm, setInvoiceForm, handleCreateInvoice, savingInvoice,
  invoicePeriodTotal, editingInvoice, setEditingInvoice, jobOperatives,
}) {
  const retPct = job?.retention_pct || 5
  const avgCisRate = jobOperatives.length > 0
    ? Math.round(jobOperatives.reduce((s, o) => s + (o.cis_rate || 20), 0) / jobOperatives.length)
    : 20

  const grossPence = parseMoney(invoiceForm.gross_amount) || invoicePeriodTotal
  const preview = calculateInvoiceTotals(grossPence, retPct, avgCisRate)

  function openEditInvoice(inv) {
    setEditingInvoice(inv)
    setInvoiceForm({
      period_from: inv.period_from || '',
      period_to: inv.period_to || '',
      gross_amount: inv.gross_amount ? (inv.gross_amount / 100).toFixed(2) : '',
      status: inv.status || 'draft',
    })
    setShowInvoiceForm(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => { setEditingInvoice(null); setInvoiceForm({ period_from: '', period_to: '', gross_amount: '', status: 'draft' }); setShowInvoiceForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus size={16} /> Create Invoice
        </button>
      </div>

      {invoices.length === 0 ? (
        <div className="text-center py-12 bg-white border border-slate-200 rounded-xl">
          <FileText size={36} className="text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">No invoices yet</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Period</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Gross</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Retention</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">CIS</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Net</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map(inv => {
                const st = INVOICE_STATUSES.find(s => s.value === inv.status) || { label: inv.status, color: 'slate' }
                return (
                  <tr key={inv.id} onClick={() => openEditInvoice(inv)} className="hover:bg-slate-50 cursor-pointer">
                    <td className="px-4 py-3 text-slate-700">
                      {inv.period_from && inv.period_to
                        ? `${new Date(inv.period_from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — ${new Date(inv.period_to).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{formatMoney(inv.gross_amount)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-500">{formatMoney(inv.retention_amount)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-500">{formatMoney(inv.cis_deduction)}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-slate-800">{formatMoney(inv.net_amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-${st.color}-100 text-${st.color}-700`}>
                        {st.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoice form modal */}
      {showInvoiceForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">{editingInvoice ? 'Edit Invoice' : 'Create Invoice'}</h2>
              <button onClick={() => { setShowInvoiceForm(false); setEditingInvoice(null) }} className="p-1 hover:bg-slate-100 rounded-lg"><X size={20} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleCreateInvoice} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Period From">
                  <input type="date" value={invoiceForm.period_from} onChange={e => setInvoiceForm(f => ({ ...f, period_from: e.target.value }))} className="input-field" />
                </Field>
                <Field label="Period To">
                  <input type="date" value={invoiceForm.period_to} onChange={e => setInvoiceForm(f => ({ ...f, period_to: e.target.value }))} className="input-field" />
                </Field>
              </div>
              <Field label="Gross Amount">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">£</span>
                  <input type="text" value={invoiceForm.gross_amount}
                    onChange={e => setInvoiceForm(f => ({ ...f, gross_amount: e.target.value }))}
                    className="input-field" style={{ paddingLeft: '1.75rem' }}
                    placeholder={invoicePeriodTotal > 0 ? `Auto: ${(invoicePeriodTotal / 100).toFixed(2)}` : '0.00'}
                  />
                </div>
                {invoicePeriodTotal > 0 && !invoiceForm.gross_amount && (
                  <p className="text-[10px] text-slate-400 mt-1">Auto-calculated from approved timesheet entries: {formatMoney(invoicePeriodTotal)}</p>
                )}
              </Field>

              {/* Preview breakdown */}
              <div className="bg-slate-50 rounded-lg p-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Gross</span><span className="text-slate-800 font-medium tabular-nums">{formatMoney(grossPence)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Retention ({retPct}%)</span><span className="text-red-600 tabular-nums">-{formatMoney(preview.retention)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">CIS ({avgCisRate}%)</span><span className="text-red-600 tabular-nums">-{formatMoney(preview.cisDeduction)}</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-1 mt-1"><span className="text-slate-700 font-semibold">Net Payable</span><span className="text-slate-900 font-bold tabular-nums">{formatMoney(preview.netAmount)}</span></div>
              </div>

              <Field label="Status">
                <select value={invoiceForm.status} onChange={e => setInvoiceForm(f => ({ ...f, status: e.target.value }))} className="input-field">
                  {INVOICE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>

              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => { setShowInvoiceForm(false); setEditingInvoice(null) }} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={savingInvoice} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-semibold">
                  {savingInvoice && <Loader2 size={14} className="animate-spin" />}
                  {editingInvoice ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Payment Applications Tab ──
const APP_STATUS_COLORS = { draft: 'slate', submitted: 'blue', certified: 'amber', paid: 'green' }

function PaymentApplicationsTab({
  applications, showAppForm, setShowAppForm, appForm, setAppForm,
  handleAddApplication, savingApp, handleUpdateApplicationStatus,
}) {
  const totalApplied = applications.reduce((s, a) => s + (a.gross_amount || 0), 0)
  const totalCertified = applications.reduce((s, a) => s + (a.amount_certified || 0), 0)
  const totalPaid = applications.reduce((s, a) => s + (a.amount_paid || 0), 0)
  const outstanding = totalCertified - totalPaid

  const netPreview = parseMoney(appForm.gross_amount) - parseMoney(appForm.retention_held)

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Applied" value={formatMoney(totalApplied)} />
        <StatCard label="Total Certified" value={formatMoney(totalCertified)} />
        <StatCard label="Total Paid" value={formatMoney(totalPaid)} color="green" />
        <StatCard label="Outstanding" value={formatMoney(outstanding)} color={outstanding > 0 ? 'amber' : 'slate'} />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{applications.length} application{applications.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setShowAppForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus size={16} /> New Application
        </button>
      </div>

      {applications.length === 0 ? (
        <div className="text-center py-12 bg-white border border-slate-200 rounded-xl">
          <Receipt size={36} className="text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">No payment applications yet</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Period</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Gross</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Retention</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Net</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Certified</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Paid</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.map(app => {
                  const sc = APP_STATUS_COLORS[app.status] || 'slate'
                  return (
                    <tr key={app.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700 font-medium">{app.application_number}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {app.period_from && app.period_to
                          ? `${new Date(app.period_from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — ${new Date(app.period_to).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{formatMoney(app.gross_amount)}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-500">{formatMoney(app.retention_held)}</td>
                      <td className="px-4 py-3 tabular-nums font-semibold text-slate-800">{formatMoney(app.net_amount)}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">{app.amount_certified ? formatMoney(app.amount_certified) : '—'}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">{app.amount_paid ? formatMoney(app.amount_paid) : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-${sc}-100 text-${sc}-700`}>
                          {app.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {app.status === 'draft' && (
                            <button onClick={() => handleUpdateApplicationStatus(app.id, 'submitted')} className="px-2 py-0.5 text-xs font-medium text-blue-600 border border-blue-200 rounded hover:bg-blue-50">Submit</button>
                          )}
                          {app.status === 'submitted' && (
                            <button onClick={() => handleUpdateApplicationStatus(app.id, 'certified')} className="px-2 py-0.5 text-xs font-medium text-amber-600 border border-amber-200 rounded hover:bg-amber-50">Certify</button>
                          )}
                          {app.status === 'certified' && (
                            <button onClick={() => handleUpdateApplicationStatus(app.id, 'paid')} className="px-2 py-0.5 text-xs font-medium text-green-600 border border-green-200 rounded hover:bg-green-50">Mark Paid</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Application form modal */}
      {showAppForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">New Payment Application</h2>
              <button onClick={() => setShowAppForm(false)} className="p-1 hover:bg-slate-100 rounded-lg"><X size={20} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleAddApplication} className="p-5 space-y-4">
              <Field label="Valuation Date">
                <input type="date" value={appForm.valuation_date} onChange={e => setAppForm(f => ({ ...f, valuation_date: e.target.value }))} className="input-field" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Period From">
                  <input type="date" value={appForm.period_from} onChange={e => setAppForm(f => ({ ...f, period_from: e.target.value }))} className="input-field" />
                </Field>
                <Field label="Period To">
                  <input type="date" value={appForm.period_to} onChange={e => setAppForm(f => ({ ...f, period_to: e.target.value }))} className="input-field" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Gross Amount *">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">£</span>
                    <input type="text" value={appForm.gross_amount} onChange={e => setAppForm(f => ({ ...f, gross_amount: e.target.value }))} className="input-field" style={{ paddingLeft: '1.75rem' }} placeholder="0.00" required />
                  </div>
                </Field>
                <Field label="Retention Held">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">£</span>
                    <input type="text" value={appForm.retention_held} onChange={e => setAppForm(f => ({ ...f, retention_held: e.target.value }))} className="input-field" style={{ paddingLeft: '1.75rem' }} placeholder="0.00" />
                  </div>
                </Field>
              </div>
              {(appForm.gross_amount || appForm.retention_held) && (
                <div className="bg-slate-50 rounded-lg p-3 text-xs">
                  <div className="flex justify-between"><span className="text-slate-500">Net Amount</span><span className="text-slate-900 font-bold tabular-nums">{formatMoney(netPreview)}</span></div>
                </div>
              )}
              <Field label="Notes">
                <textarea value={appForm.notes} onChange={e => setAppForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="input-field" />
              </Field>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowAppForm(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={savingApp} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-semibold">
                  {savingApp && <Loader2 size={14} className="animate-spin" />} Add Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Contra Charges Tab ──
const CONTRA_STATUS_COLORS = { pending: 'amber', disputed: 'red', accepted: 'slate', rejected: 'red' }

function ContraChargesTab({
  contras, showContraForm, setShowContraForm, contraForm, setContraForm,
  handleAddContra, savingContra, handleUpdateContraStatus,
  handleAddContraEvidence, handleRemoveContraAttachment,
}) {
  const totalContras = contras.reduce((s, c) => s + (c.amount || 0), 0)
  const disputedAmount = contras.filter(c => c.status === 'disputed').reduce((s, c) => s + (c.amount || 0), 0)
  const acceptedAmount = contras.filter(c => c.status === 'accepted').reduce((s, c) => s + (c.amount || 0), 0)

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Total Contras" value={formatMoney(totalContras)} />
        <StatCard label="Disputed" value={formatMoney(disputedAmount)} color="red" />
        <StatCard label="Accepted" value={formatMoney(acceptedAmount)} color="amber" />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{contras.length} contra charge{contras.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setShowContraForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus size={16} /> Log Contra Charge
        </button>
      </div>

      {contras.length === 0 ? (
        <div className="text-center py-12 bg-white border border-slate-200 rounded-xl">
          <Ban size={36} className="text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">No contra charges yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contras.map(contra => {
            const sc = CONTRA_STATUS_COLORS[contra.status] || 'slate'
            const attachments = Array.isArray(contra.attachments) ? contra.attachments : []
            return (
              <Card key={contra.id}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium text-slate-800 ${contra.status === 'rejected' ? 'line-through' : ''}`}>{contra.description}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {contra.date_raised ? new Date(contra.date_raised).toLocaleDateString('en-GB') : '—'}
                      {contra.raised_by ? ` · Raised by: ${contra.raised_by}` : ''}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className={`text-sm font-semibold tabular-nums ${contra.status === 'rejected' ? 'text-slate-400 line-through' : 'text-red-600'}`}>
                      {formatMoney(contra.amount)}
                    </p>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-${sc}-100 text-${sc}-700`}>{contra.status}</span>
                  </div>
                </div>

                {/* Attachments */}
                {attachments.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-50 flex flex-wrap gap-2">
                    {attachments.map((att, i) => {
                      const isImage = att.type?.startsWith('image/')
                      return (
                        <div key={i} className="group relative">
                          {isImage ? (
                            <a href={att.url} target="_blank" rel="noopener noreferrer" className="block w-16 h-16 rounded-lg overflow-hidden border border-slate-200 hover:border-blue-300 transition-colors">
                              <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                            </a>
                          ) : (
                            <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg hover:border-blue-300 transition-colors">
                              <FileText size={14} className="text-slate-400 shrink-0" />
                              <span className="text-xs text-slate-600 truncate max-w-[120px]">{att.name}</span>
                            </a>
                          )}
                          <button onClick={() => handleRemoveContraAttachment(contra.id, att.url)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove file">
                            <X size={10} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Actions row */}
                <div className="mt-2 pt-2 border-t border-slate-50 flex items-center justify-between">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-500 cursor-pointer transition-colors">
                    <Paperclip size={12} />
                    <span>Attach evidence</span>
                    <input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden"
                      onChange={e => {
                        const files = Array.from(e.target.files || [])
                        if (files.some(f => f.size > 25 * 1024 * 1024)) { toast.error('Max file size is 25MB'); return }
                        if (files.length) handleAddContraEvidence(contra.id, files)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <div className="flex items-center gap-1.5">
                    {contra.status === 'pending' && (
                      <>
                        <button onClick={() => handleUpdateContraStatus(contra.id, 'disputed')} className="px-2 py-0.5 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50">Dispute</button>
                        <button onClick={() => handleUpdateContraStatus(contra.id, 'accepted')} className="px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-50">Accept</button>
                      </>
                    )}
                    {contra.status === 'disputed' && (
                      <>
                        <button onClick={() => handleUpdateContraStatus(contra.id, 'accepted')} className="px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-50">Accept</button>
                        <button onClick={() => handleUpdateContraStatus(contra.id, 'rejected')} className="px-2 py-0.5 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50">Reject</button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* New Contra form modal */}
      {showContraForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Log Contra Charge</h2>
              <button onClick={() => setShowContraForm(false)} className="p-1 hover:bg-slate-100 rounded-lg"><X size={20} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleAddContra} className="p-5 space-y-4">
              <Field label="Description *">
                <input type="text" value={contraForm.description} onChange={e => setContraForm(f => ({ ...f, description: e.target.value }))} className="input-field" required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount *">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">£</span>
                    <input type="text" value={contraForm.amount} onChange={e => setContraForm(f => ({ ...f, amount: e.target.value }))} className="input-field" style={{ paddingLeft: '1.75rem' }} placeholder="0.00" required />
                  </div>
                </Field>
                <Field label="Date Raised">
                  <input type="date" value={contraForm.date_raised} onChange={e => setContraForm(f => ({ ...f, date_raised: e.target.value }))} className="input-field" />
                </Field>
              </div>
              <Field label="Raised By">
                <input type="text" value={contraForm.raised_by} onChange={e => setContraForm(f => ({ ...f, raised_by: e.target.value }))} className="input-field" placeholder="e.g. Main Contractor" />
              </Field>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowContraForm(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={savingContra} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-semibold">
                  {savingContra && <Loader2 size={14} className="animate-spin" />} Log Contra
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Daywork Sheets Tab ──
const DAYWORK_STATUS_COLORS = { draft: 'slate', submitted: 'blue', approved: 'green', rejected: 'red' }

function DayworkSheetsTab({
  dayworks, showDayworkForm, setShowDayworkForm, dayworkForm, setDayworkForm,
  handleAddDaywork, savingDaywork, handleUpdateDayworkStatus,
}) {
  function addLabourRow() {
    setDayworkForm(f => ({ ...f, labour: [...f.labour, { name: '', hours: '', rate: '' }] }))
  }
  function updateLabourRow(idx, field, val) {
    setDayworkForm(f => ({ ...f, labour: f.labour.map((r, i) => i === idx ? { ...r, [field]: val } : r) }))
  }
  function removeLabourRow(idx) {
    setDayworkForm(f => ({ ...f, labour: f.labour.filter((_, i) => i !== idx) }))
  }
  function addPlantRow() {
    setDayworkForm(f => ({ ...f, plant: [...f.plant, { item: '', hours: '', rate: '' }] }))
  }
  function updatePlantRow(idx, field, val) {
    setDayworkForm(f => ({ ...f, plant: f.plant.map((r, i) => i === idx ? { ...r, [field]: val } : r) }))
  }
  function removePlantRow(idx) {
    setDayworkForm(f => ({ ...f, plant: f.plant.filter((_, i) => i !== idx) }))
  }
  function addMaterialRow() {
    setDayworkForm(f => ({ ...f, materials: [...f.materials, { item: '', quantity: '', unit_cost: '' }] }))
  }
  function updateMaterialRow(idx, field, val) {
    setDayworkForm(f => ({ ...f, materials: f.materials.map((r, i) => i === idx ? { ...r, [field]: val } : r) }))
  }
  function removeMaterialRow(idx) {
    setDayworkForm(f => ({ ...f, materials: f.materials.filter((_, i) => i !== idx) }))
  }

  const formLabourTotal = dayworkForm.labour.reduce((s, l) => s + ((parseFloat(l.hours) || 0) * parseMoney(l.rate)), 0)
  const formPlantTotal = dayworkForm.plant.reduce((s, p) => s + ((parseFloat(p.hours) || 0) * parseMoney(p.rate)), 0)
  const formMaterialsTotal = dayworkForm.materials.reduce((s, m) => s + ((parseFloat(m.quantity) || 0) * parseMoney(m.unit_cost)), 0)
  const formTotal = formLabourTotal + formPlantTotal + formMaterialsTotal

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{dayworks.length} daywork sheet{dayworks.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setShowDayworkForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus size={16} /> New Daywork Sheet
        </button>
      </div>

      {dayworks.length === 0 ? (
        <div className="text-center py-12 bg-white border border-slate-200 rounded-xl">
          <Hammer size={36} className="text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">No daywork sheets yet</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Sheet #</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Description</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Total Cost</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Signed By</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dayworks.map(dw => {
                const sc = DAYWORK_STATUS_COLORS[dw.status] || 'slate'
                return (
                  <tr key={dw.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">{dw.sheet_number || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{dw.date ? new Date(dw.date).toLocaleDateString('en-GB') : '—'}</td>
                    <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate">{dw.description || '—'}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-slate-800">{formatMoney(dw.total_cost)}</td>
                    <td className="px-4 py-3 text-slate-600">{dw.signed_by || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-${sc}-100 text-${sc}-700`}>{dw.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {dw.status === 'draft' && (
                          <button onClick={() => handleUpdateDayworkStatus(dw.id, 'submitted')} className="px-2 py-0.5 text-xs font-medium text-blue-600 border border-blue-200 rounded hover:bg-blue-50">Submit</button>
                        )}
                        {dw.status === 'submitted' && (
                          <>
                            <button onClick={() => handleUpdateDayworkStatus(dw.id, 'approved')} className="px-2 py-0.5 text-xs font-medium text-green-600 border border-green-200 rounded hover:bg-green-50">Approve</button>
                            <button onClick={() => handleUpdateDayworkStatus(dw.id, 'rejected')} className="px-2 py-0.5 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50">Reject</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* New Daywork form modal */}
      {showDayworkForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">New Daywork Sheet</h2>
              <button onClick={() => setShowDayworkForm(false)} className="p-1 hover:bg-slate-100 rounded-lg"><X size={20} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleAddDaywork} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date *">
                  <input type="date" value={dayworkForm.date} onChange={e => setDayworkForm(f => ({ ...f, date: e.target.value }))} className="input-field" required />
                </Field>
                <Field label="Signed By">
                  <input type="text" value={dayworkForm.signed_by} onChange={e => setDayworkForm(f => ({ ...f, signed_by: e.target.value }))} className="input-field" placeholder="Site manager" />
                </Field>
              </div>
              <Field label="Description *">
                <textarea value={dayworkForm.description} onChange={e => setDayworkForm(f => ({ ...f, description: e.target.value }))} rows={2} className="input-field" required />
              </Field>

              {/* Labour section */}
              <div className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-700">Labour</p>
                  <button type="button" onClick={addLabourRow} className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1"><Plus size={12} /> Add Row</button>
                </div>
                {dayworkForm.labour.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-2">No labour rows</p>
                ) : (
                  <div className="space-y-2">
                    {dayworkForm.labour.map((row, i) => (
                      <div key={i} className="grid grid-cols-[1fr_60px_80px_24px] gap-2 items-center">
                        <input type="text" value={row.name} onChange={e => updateLabourRow(i, 'name', e.target.value)} className="input-field" placeholder="Name" />
                        <input type="number" step="0.5" value={row.hours} onChange={e => updateLabourRow(i, 'hours', e.target.value)} className="input-field" placeholder="Hrs" />
                        <input type="text" value={row.rate} onChange={e => updateLabourRow(i, 'rate', e.target.value)} className="input-field" placeholder="£/hr" />
                        <button type="button" onClick={() => removeLabourRow(i)} className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                      </div>
                    ))}
                    <p className="text-xs text-slate-500 text-right tabular-nums">Subtotal: {formatMoney(formLabourTotal)}</p>
                  </div>
                )}
              </div>

              {/* Plant section */}
              <div className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-700">Plant</p>
                  <button type="button" onClick={addPlantRow} className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1"><Plus size={12} /> Add Row</button>
                </div>
                {dayworkForm.plant.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-2">No plant rows</p>
                ) : (
                  <div className="space-y-2">
                    {dayworkForm.plant.map((row, i) => (
                      <div key={i} className="grid grid-cols-[1fr_60px_80px_24px] gap-2 items-center">
                        <input type="text" value={row.item} onChange={e => updatePlantRow(i, 'item', e.target.value)} className="input-field" placeholder="Item" />
                        <input type="number" step="0.5" value={row.hours} onChange={e => updatePlantRow(i, 'hours', e.target.value)} className="input-field" placeholder="Hrs" />
                        <input type="text" value={row.rate} onChange={e => updatePlantRow(i, 'rate', e.target.value)} className="input-field" placeholder="£/hr" />
                        <button type="button" onClick={() => removePlantRow(i)} className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                      </div>
                    ))}
                    <p className="text-xs text-slate-500 text-right tabular-nums">Subtotal: {formatMoney(formPlantTotal)}</p>
                  </div>
                )}
              </div>

              {/* Materials section */}
              <div className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-700">Materials</p>
                  <button type="button" onClick={addMaterialRow} className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1"><Plus size={12} /> Add Row</button>
                </div>
                {dayworkForm.materials.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-2">No materials rows</p>
                ) : (
                  <div className="space-y-2">
                    {dayworkForm.materials.map((row, i) => (
                      <div key={i} className="grid grid-cols-[1fr_60px_80px_24px] gap-2 items-center">
                        <input type="text" value={row.item} onChange={e => updateMaterialRow(i, 'item', e.target.value)} className="input-field" placeholder="Item" />
                        <input type="number" step="1" value={row.quantity} onChange={e => updateMaterialRow(i, 'quantity', e.target.value)} className="input-field" placeholder="Qty" />
                        <input type="text" value={row.unit_cost} onChange={e => updateMaterialRow(i, 'unit_cost', e.target.value)} className="input-field" placeholder="£/unit" />
                        <button type="button" onClick={() => removeMaterialRow(i)} className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                      </div>
                    ))}
                    <p className="text-xs text-slate-500 text-right tabular-nums">Subtotal: {formatMoney(formMaterialsTotal)}</p>
                  </div>
                )}
              </div>

              {/* Total */}
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <div className="flex justify-between font-semibold">
                  <span className="text-slate-700">Total Cost</span>
                  <span className="text-slate-900 tabular-nums">{formatMoney(formTotal)}</span>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowDayworkForm(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={savingDaywork} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-semibold">
                  {savingDaywork && <Loader2 size={14} className="animate-spin" />} Add Daywork
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Documents Tab ──
const DOC_CATEGORIES = [
  { value: 'subcontract', label: 'Subcontract' },
  { value: 'payment_notice', label: 'Payment Notice' },
  { value: 'pay_less_notice', label: 'Pay-Less Notice' },
  { value: 'cis_statement', label: 'CIS Statement' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'other', label: 'Other' },
]

function DocumentsTab({
  jobDocs, showDocForm, setShowDocForm, docForm, setDocForm,
  docFile, setDocFile, handleUploadJobDoc, savingDoc, handleDeleteJobDoc,
}) {
  const grouped = DOC_CATEGORIES.map(cat => ({
    ...cat,
    docs: jobDocs.filter(d => d.category === cat.value),
  })).filter(g => g.docs.length > 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{jobDocs.length} document{jobDocs.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => { setShowDocForm(true); setDocFile(null); setDocForm({ category: 'subcontract', title: '', notes: '' }) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus size={16} /> Upload Document
        </button>
      </div>

      {jobDocs.length === 0 ? (
        <div className="text-center py-12 bg-white border border-slate-200 rounded-xl">
          <FolderOpen size={36} className="text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">No documents yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(group => (
            <Card key={group.value} title={group.label}>
              <div className="space-y-2">
                {group.docs.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <FileText size={16} className="text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline truncate block">
                          {doc.title || doc.file_name}
                        </a>
                        <p className="text-xs text-slate-400">
                          {doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-GB') : ''}
                          {doc.notes ? ` · ${doc.notes}` : ''}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteJobDoc(doc.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          ))}

          {/* Show uncategorised docs if any */}
          {jobDocs.filter(d => !DOC_CATEGORIES.some(c => c.value === d.category)).length > 0 && (
            <Card title="Other">
              <div className="space-y-2">
                {jobDocs.filter(d => !DOC_CATEGORIES.some(c => c.value === d.category)).map(doc => (
                  <div key={doc.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <FileText size={16} className="text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline truncate block">
                          {doc.title || doc.file_name}
                        </a>
                        <p className="text-xs text-slate-400">
                          {doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-GB') : ''}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteJobDoc(doc.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Upload document modal */}
      {showDocForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Upload Document</h2>
              <button onClick={() => setShowDocForm(false)} className="p-1 hover:bg-slate-100 rounded-lg"><X size={20} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleUploadJobDoc} className="p-5 space-y-4">
              <Field label="Category">
                <select value={docForm.category} onChange={e => setDocForm(f => ({ ...f, category: e.target.value }))} className="input-field">
                  {DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="Title">
                <input type="text" value={docForm.title} onChange={e => setDocForm(f => ({ ...f, title: e.target.value }))} className="input-field" placeholder="Optional — defaults to file name" />
              </Field>
              <Field label="File *">
                <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 transition-colors">
                  <Paperclip size={14} className="text-slate-400" />
                  <span className="text-sm text-slate-500">{docFile ? docFile.name : 'Select file...'}</span>
                  <input type="file" className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file && file.size > 25 * 1024 * 1024) { toast.error('Max file size is 25MB'); return }
                      setDocFile(file || null)
                    }}
                  />
                </label>
              </Field>
              <Field label="Notes">
                <textarea value={docForm.notes} onChange={e => setDocForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="input-field" />
              </Field>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowDocForm(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={savingDoc || !docFile} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-semibold">
                  {savingDoc && <Loader2 size={14} className="animate-spin" />} Upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Final Account Tab ──
const FINAL_ACCOUNT_STATUSES = [
  { value: 'open', label: 'Open', color: 'slate' },
  { value: 'submitted', label: 'Submitted', color: 'blue' },
  { value: 'under_review', label: 'Under Review', color: 'amber' },
  { value: 'agreed', label: 'Agreed', color: 'green' },
]

function FinalAccountTab({ job, variations, contras, applications, handleUpdateFinalAccount }) {
  const [editingRetention, setEditingRetention] = useState(false)
  const [retentionForm, setRetentionForm] = useState({
    practical_completion_date: job?.practical_completion_date || '',
    defects_end_date: job?.defects_end_date || '',
    first_half_retention_status: job?.first_half_retention_status || 'held',
    second_half_retention_status: job?.second_half_retention_status || 'held',
  })
  const [faStatus, setFaStatus] = useState(job?.final_account_status || 'open')
  const [faNotes, setFaNotes] = useState(job?.final_account_notes || '')

  const originalContract = job?.contract_value || 0
  const approvedVariations = variations.filter(v => v.status === 'approved').reduce((s, v) => s + (v.value || 0), 0)
  const acceptedContras = contras.filter(c => c.status === 'accepted').reduce((s, c) => s + (c.amount || 0), 0)
  const finalAccountValue = originalContract + approvedVariations - acceptedContras

  const totalPaid = applications.filter(a => a.status === 'paid').reduce((s, a) => s + (a.amount_paid || 0), 0)
  const balanceOutstanding = finalAccountValue - totalPaid

  const retentionPct = job?.retention_pct || 5
  const totalRetention = Math.round(finalAccountValue * (retentionPct / 100))
  const halfRetention = Math.round(totalRetention / 2)

  function handleSaveRetention() {
    handleUpdateFinalAccount({
      practical_completion_date: retentionForm.practical_completion_date || null,
      defects_end_date: retentionForm.defects_end_date || null,
      first_half_retention_status: retentionForm.first_half_retention_status,
      second_half_retention_status: retentionForm.second_half_retention_status,
    })
    setEditingRetention(false)
  }

  function handleSaveFaStatus() {
    handleUpdateFinalAccount({
      final_account_status: faStatus,
      final_account_notes: faNotes,
    })
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card title="Final Account Summary">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1.5">
            <span className="text-slate-600">Original Contract Value</span>
            <span className="font-semibold text-slate-800 tabular-nums">{formatMoney(originalContract)}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-slate-600">Approved Variations ({variations.filter(v => v.status === 'approved').length})</span>
            <span className={`font-semibold tabular-nums ${approvedVariations >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {approvedVariations >= 0 ? '+' : ''}{formatMoney(approvedVariations)}
            </span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-slate-600">Contra Charges Accepted ({contras.filter(c => c.status === 'accepted').length})</span>
            <span className="font-semibold text-red-600 tabular-nums">-{formatMoney(acceptedContras)}</span>
          </div>
          <div className="flex justify-between py-2 border-t-2 border-slate-200 mt-1">
            <span className="font-bold text-slate-900">Final Account Value</span>
            <span className="font-bold text-slate-900 tabular-nums text-lg">{formatMoney(finalAccountValue)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-t border-slate-100">
            <span className="text-slate-600">Total Paid to Date</span>
            <span className="font-semibold text-green-600 tabular-nums">{formatMoney(totalPaid)}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="font-semibold text-slate-800">Balance Outstanding</span>
            <span className={`font-bold tabular-nums ${balanceOutstanding > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {formatMoney(balanceOutstanding)}
            </span>
          </div>
        </div>
      </Card>

      {/* Retention */}
      <Card
        title={`Retention (${retentionPct}% = ${formatMoney(totalRetention)})`}
        action={
          !editingRetention ? (
            <button onClick={() => setEditingRetention(true)} className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-700 font-medium">
              <Edit2 size={12} /> Edit
            </button>
          ) : null
        }
      >
        <div className="space-y-4">
          {/* First half */}
          <div className="border border-slate-100 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-slate-700">First Half Retention</p>
              <p className="text-sm font-semibold text-slate-800 tabular-nums">{formatMoney(halfRetention)}</p>
            </div>
            {editingRetention ? (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <Field label="Practical Completion Date">
                  <input type="date" value={retentionForm.practical_completion_date} onChange={e => setRetentionForm(f => ({ ...f, practical_completion_date: e.target.value }))} className="input-field" />
                </Field>
                <Field label="Status">
                  <select value={retentionForm.first_half_retention_status} onChange={e => setRetentionForm(f => ({ ...f, first_half_retention_status: e.target.value }))} className="input-field">
                    <option value="held">Held</option>
                    <option value="due">Due for Release</option>
                    <option value="released">Released</option>
                  </select>
                </Field>
              </div>
            ) : (
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>Release: {job?.practical_completion_date ? new Date(job.practical_completion_date).toLocaleDateString('en-GB') : 'Not set'}</span>
                <span className={`px-1.5 py-0.5 rounded-full font-medium ${
                  (job?.first_half_retention_status || 'held') === 'released' ? 'bg-green-100 text-green-700' :
                  (job?.first_half_retention_status || 'held') === 'due' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-600'
                }`}>{job?.first_half_retention_status || 'held'}</span>
              </div>
            )}
          </div>

          {/* Second half */}
          <div className="border border-slate-100 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-slate-700">Second Half Retention</p>
              <p className="text-sm font-semibold text-slate-800 tabular-nums">{formatMoney(halfRetention)}</p>
            </div>
            {editingRetention ? (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <Field label="Defects End Date">
                  <input type="date" value={retentionForm.defects_end_date} onChange={e => setRetentionForm(f => ({ ...f, defects_end_date: e.target.value }))} className="input-field" />
                </Field>
                <Field label="Status">
                  <select value={retentionForm.second_half_retention_status} onChange={e => setRetentionForm(f => ({ ...f, second_half_retention_status: e.target.value }))} className="input-field">
                    <option value="held">Held</option>
                    <option value="due">Due for Release</option>
                    <option value="released">Released</option>
                  </select>
                </Field>
              </div>
            ) : (
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>Release: {job?.defects_end_date ? new Date(job.defects_end_date).toLocaleDateString('en-GB') : 'Not set'}</span>
                <span className={`px-1.5 py-0.5 rounded-full font-medium ${
                  (job?.second_half_retention_status || 'held') === 'released' ? 'bg-green-100 text-green-700' :
                  (job?.second_half_retention_status || 'held') === 'due' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-600'
                }`}>{job?.second_half_retention_status || 'held'}</span>
              </div>
            )}
          </div>

          {editingRetention && (
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setEditingRetention(false)} className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={handleSaveRetention} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold">
                <Save size={14} /> Save
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* Final Account Status */}
      <Card title="Final Account Status">
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            {FINAL_ACCOUNT_STATUSES.map(s => (
              <button
                key={s.value}
                onClick={() => setFaStatus(s.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  faStatus === s.value
                    ? `bg-${s.color}-100 text-${s.color}-700 border-${s.color}-300`
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Field label="Notes / Timeline">
            <textarea value={faNotes} onChange={e => setFaNotes(e.target.value)} rows={3} className="input-field" placeholder="Add notes about the final account..." />
          </Field>
          <div className="flex justify-end">
            <button onClick={handleSaveFaStatus} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold">
              <Save size={14} /> Save Status
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
