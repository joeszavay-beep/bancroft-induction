import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import { getSession } from '../lib/storage'
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  FileText, Download, Save, Plus, Trash2, ChevronRight, ChevronDown,
  Loader2, Settings, BookOpen, Users, Wrench, ClipboardList, Shield,
  Leaf, HardHat, FileCheck, Calendar, AlertTriangle, Check, X,
  RefreshCw, Eye
} from 'lucide-react'

// ── Constants ──
const NAVY = [26, 39, 68]       // #1A2744
const BLUE = [27, 111, 200]     // #1B6FC8
const WHITE = [255, 255, 255]
const LGRAY = [248, 249, 251]   // alternating rows
const BORDER = [226, 230, 234]  // table borders
const TXT = [26, 26, 46]        // body text
const MUTED = [107, 122, 153]   // secondary text
const GRN = [46, 160, 67]       // positive
const RED = [218, 54, 51]       // negative
const AMBER = [210, 153, 34]    // warning
const GRAY = [213, 216, 220]    // legacy compat

const PM_ITEMS = [
  'Housekeeping', 'Access / Egress', 'Scaffolding', 'Edge Protection',
  'Excavations', 'Electrical', 'Fire Precautions', 'Welfare Facilities',
  'PPE', 'Signage', 'Working at Height', 'Manual Handling',
  'COSHH', 'Noise', 'Confined Spaces', 'Lifting Operations',
]

const ENV_ITEMS = [
  'Waste Management', 'Dust Control', 'Noise Levels', 'Water Discharge',
  'Spill Kits Available', 'Storage of Materials', 'Vehicle Emissions',
  'Biodiversity Protection', 'Energy Use', 'Site Tidiness',
  'Pollution Prevention', 'Recycling',
]

const OP_ITEMS = [
  'RAMS Understood', 'PPE Worn Correctly', 'Access Equipment Checked',
  'Work Area Tidy', 'Correct Tools in Use', 'Permits Displayed',
  'Emergency Exits Clear', 'First Aid Kit Available',
  'Hazard Reporting', 'Welfare Facilities Clean',
]

const SS_ITEMS = [
  'RAMS Relevant', 'Operatives Briefed', 'Fire Alarm Isolated',
  'RAMS Displayed', 'Permit Issued', 'Access Equipment Checked',
  'Other Teams Risk Assessed', 'Tools Suitable', 'Training Adequate',
  'Environment Changed',
]

const SECTIONS = [
  { id: 'settings', label: 'Report Settings', icon: Settings },
  { id: 'cover', label: 'Cover Page', icon: FileText },
  { id: 'toolbox', label: 'Toolbox Talks', icon: BookOpen },
  { id: 'training', label: 'Training Matrix', icon: Users },
  { id: 'mgmt', label: 'Management Training', icon: Shield },
  { id: 'equipment', label: 'Equipment Register', icon: Wrench },
  { id: 'pm', label: 'PM Inspection', icon: ClipboardList },
  { id: 'env', label: 'Environmental Inspection', icon: Leaf },
  { id: 'operative', label: 'Operative Inspection', icon: HardHat },
  { id: 'rams', label: 'RAMS Matrix', icon: FileCheck },
  { id: 'labour', label: 'Labour Return', icon: Calendar },
  { id: 'safestart', label: 'Safe Start Cards', icon: AlertTriangle },
]

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── Helpers ──
function fmtUK(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
}

function mondayOfWeek(dateStr) {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const mon = new Date(d.setDate(diff))
  return mon.toISOString().split('T')[0]
}

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function draftKey(projectId, weekStart) {
  return `hs_report_draft_${projectId}_${weekStart}`
}

function getReportCounter() {
  const c = parseInt(localStorage.getItem('hs_report_counter') || '0', 10)
  return c + 1
}

function bumpReportCounter() {
  const next = getReportCounter()
  localStorage.setItem('hs_report_counter', String(next))
  return next
}

function isExpired(dateStr) {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

function isExpiringSoon(dateStr, days = 30) {
  if (!dateStr) return false
  const target = new Date(dateStr)
  const now = new Date()
  const diff = (target - now) / 86400000
  return diff >= 0 && diff <= days
}

function certCell(dateStr) {
  if (!dateStr) return { text: '', cls: '' }
  const text = fmtUK(dateStr)
  if (isExpired(dateStr)) return { text, cls: 'text-red-600 font-bold' }
  if (isExpiringSoon(dateStr)) return { text, cls: 'text-amber-600 font-semibold' }
  return { text, cls: 'text-green-700' }
}

function dayOfWeek(dateStr) {
  const d = new Date(dateStr)
  return d.getDay() // 0=Sun, 1=Mon...
}

// ── Main Component ──
export default function HSReportGenerator() {
  const { user, company } = useCompany()
  const cid = user?.company_id
  const managerData = user || JSON.parse(getSession('manager_data') || '{}')

  // ── Top-level state ──
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState('')
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(new Date().toISOString().split('T')[0]))
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [previewGenerating, setPreviewGenerating] = useState(false)
  const [activeSection, setActiveSection] = useState('settings')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const sectionRefs = useRef({})

  // ── Report Settings ──
  const [reportNumber, setReportNumber] = useState(() => getReportCounter())
  const [issuedBy, setIssuedBy] = useState(managerData.name || '')
  const [role, setRole] = useState(managerData.role || 'Project Manager')
  const [companyName, setCompanyName] = useState(company?.name || '')

  // ── Project data ──
  const [projectData, setProjectData] = useState(null)

  // ── Section Data ──
  // Toolbox Talks
  const [toolboxTalks, setToolboxTalks] = useState([])
  const rawTalksRef = useRef([])
  const rawRamsRef = useRef({ docs: [], signoffs: [] })
  const rawAttendanceRef = useRef([])
  const [manualTalks, setManualTalks] = useState([])

  // Training
  const [operatives, setOperatives] = useState([])
  const [manualTraining, setManualTraining] = useState([])

  // Equipment
  const [equipmentRows, setEquipmentRows] = useState([])

  // Inspections
  const [pmChecks, setPmChecks] = useState(() => PM_ITEMS.map(item => ({ label: item, value: '' })))
  const [pmComments, setPmComments] = useState('')
  const [pmInspector, setPmInspector] = useState(managerData.name || '')
  const [envChecks, setEnvChecks] = useState(() => ENV_ITEMS.map(item => ({ label: item, value: '' })))
  const [envComments, setEnvComments] = useState('')
  const [envInspector, setEnvInspector] = useState(managerData.name || '')
  const [opChecks, setOpChecks] = useState(() => OP_ITEMS.map(item => ({ label: item, value: '' })))
  const [opComments, setOpComments] = useState('')
  const [opInspector, setOpInspector] = useState(managerData.name || '')

  // RAMS
  const [ramsRows, setRamsRows] = useState([])

  // Labour
  const [labourRows, setLabourRows] = useState([])
  const [labourCompletedBy, setLabourCompletedBy] = useState(managerData.name || '')

  // Safe Start
  const [safeStartCards, setSafeStartCards] = useState([])
  const [ssCompany, setSsCompany] = useState(company?.name || '')
  const [ssSupervisor, setSsSupervisor] = useState(managerData.name || '')
  const [ssTrade, setSsTrade] = useState('')

  // ── Load projects ──
  useEffect(() => {
    async function load() {
      if (!cid) { setLoading(false); return }
      const { data } = await supabase.from('projects').select('*').eq('company_id', cid).order('name')
      setProjects(data || [])
      setLoading(false)
    }
    load()
  }, [cid])

  // ── Update company name when context loads ──
  useEffect(() => {
    if (company?.name && !companyName) setCompanyName(company.name)
    if (company?.name && !ssCompany) setSsCompany(company.name)
  }, [company])

  // ── Auto-load data when project + week change ──
  const loadReportData = useCallback(async () => {
    if (!selectedProject || !cid) return
    setDataLoading(true)

    const proj = projects.find(p => p.id === selectedProject)
    setProjectData(proj)

    const ws = new Date(weekStart)
    ws.setHours(0, 0, 0, 0)
    const we = new Date(weekEnd)
    we.setHours(23, 59, 59, 999)

    try {
      const [talksRes, opsRes, docsRes, signoffsRes, attendanceRes, diaryRes, inspRes] = await Promise.all([
        supabase.from('toolbox_talks').select('*, toolbox_signatures(*)').eq('project_id', selectedProject)
          .gte('created_at', ws.toISOString()).lte('created_at', we.toISOString()),
        supabase.from('operatives').select('*').eq('company_id', cid)
          .or(`project_id.eq.${selectedProject},project_id.is.null`).order('name'),
        supabase.from('document_hub').select('*').eq('company_id', cid).eq('project_id', selectedProject)
          .eq('category', 'RAMS'),
        Promise.resolve({ data: [] }), // signoffs loaded separately after docs
        supabase.from('site_attendance').select('*').eq('company_id', cid).eq('project_id', selectedProject)
          .gte('recorded_at', ws.toISOString()).lte('recorded_at', we.toISOString()),
        supabase.from('site_diary').select('*').eq('company_id', cid).eq('project_id', selectedProject)
          .gte('date', weekStart).lte('date', weekEnd),
        supabase.from('inspections').select('*').eq('company_id', cid).eq('project_id', selectedProject)
          .gte('created_at', ws.toISOString()).lte('created_at', we.toISOString()),
      ])

      // Toolbox Talks — store both flattened (for UI) and raw (for PDF with signatures)
      const rawTalks = talksRes.data || []
      const talks = rawTalks.map(t => ({
        date: fmtUK(t.created_at),
        topic: t.topic || t.title || '',
        attendees: (t.toolbox_signatures || []).length,
        notes: t.notes || '',
        fromDb: true,
      }))
      setToolboxTalks(talks)
      // Store raw talks with nested signatures for PDF generation
      rawTalksRef.current = rawTalks

      // Operatives
      setOperatives(opsRes.data || [])

      // RAMS — load signoffs scoped to these documents
      const docs = docsRes.data || []
      let soffs = []
      if (docs.length > 0) {
        const docIds = docs.map(d => d.id)
        const { data: soffData } = await supabase.from('document_signoffs').select('*').in('document_id', docIds)
        soffs = soffData || []
      }
      const ramsData = docs.map((d, i) => ({
        num: i + 1,
        title: d.title || '',
        reference: d.reference || d.subcategory || '',
        rev: d.version || '1',
        issuedBy: d.uploaded_by || managerData.name || '',
        approvedBy: soffs.find(s => s.document_id === d.id)?.signed_by || '',
        fromDb: true,
      }))
      setRamsRows(ramsData)
      // Store raw RAMS data for PDF component
      rawRamsRef.current = { docs, signoffs: soffs }

      // Attendance -> Labour Return
      const attendance = attendanceRes.data || []
      rawAttendanceRef.current = attendance
      const labourMap = {}
      attendance.forEach(rec => {
        const op = (opsRes.data || []).find(o => o.id === rec.operative_id)
        const trade = op?.role || rec.trade || 'General'
        const companyKey = op?.employer || trade
        const key = `${companyKey}__${trade}`
        if (!labourMap[key]) {
          labourMap[key] = { company: companyKey, trade, days: [0, 0, 0, 0, 0, 0, 0] }
        }
        const dow = dayOfWeek(rec.recorded_at)
        const idx = dow === 0 ? 6 : dow - 1
        labourMap[key].days[idx]++
      })
      setLabourRows(Object.values(labourMap).length > 0 ? Object.values(labourMap) : [{ company: '', trade: '', days: [0, 0, 0, 0, 0, 0, 0] }])

      // Site Diary -> Safe Start Cards
      const diary = diaryRes.data || []
      const cards = []
      for (let i = 0; i < 7; i++) {
        const dayDate = addDays(weekStart, i)
        const dayEntry = diary.find(e => e.date === dayDate)
        cards.push({
          date: dayDate,
          checks: SS_ITEMS.map(item => ({ label: item, value: dayEntry ? 'Y' : '' })),
          hasData: !!dayEntry,
        })
      }
      setSafeStartCards(cards)

      // Inspections -> pre-fill checklists
      const inspections = inspRes.data || []
      if (inspections.length > 0) {
        // Match inspections to checklists by type/template_name
        const pmInsp = inspections.find(i => (i.template_name || i.type || '').toLowerCase().includes('pm'))
        const envInsp = inspections.find(i => (i.template_name || i.type || '').toLowerCase().includes('env'))
        const opInsp = inspections.find(i => (i.template_name || i.type || '').toLowerCase().includes('oper'))

        function mapInspectionToChecklist(insp, defaultItems) {
          const items = insp?.results || insp?.items || []
          if (!Array.isArray(items) || items.length === 0) return null
          return defaultItems.map(label => {
            const match = items.find(it => ((it.item || it.label || '').toLowerCase()).includes(label.toLowerCase().slice(0, 15)))
            const val = match?.result || match?.value || ''
            // Normalize: pass->Y, fail->N, na->NA
            const norm = val.toLowerCase()
            const normalized = norm === 'pass' ? 'Y' : norm === 'fail' ? 'N' : norm === 'na' || norm === 'n/a' ? 'NA' : val.toUpperCase()
            return { label, value: normalized }
          })
        }

        const newPm = mapInspectionToChecklist(pmInsp, PM_ITEMS)
        if (newPm) setPmChecks(newPm)

        const newEnv = mapInspectionToChecklist(envInsp, ENV_ITEMS)
        if (newEnv) setEnvChecks(newEnv)

        const newOp = mapInspectionToChecklist(opInsp, OP_ITEMS)
        if (newOp) setOpChecks(newOp)
      }

      // Try to restore draft
      tryLoadDraft()
    } catch (err) {
      console.error('Failed to load report data:', err)
      toast.error('Failed to load some data')
    }

    setDataLoading(false)
  }, [selectedProject, weekStart, weekEnd, cid, projects])

  useEffect(() => {
    if (selectedProject && cid) loadReportData()
  }, [selectedProject, weekStart, cid])

  // ── Draft save/load ──
  function saveDraft() {
    if (!selectedProject || !weekStart) return toast.error('Select a project and week first')
    const draft = {
      reportNumber, issuedBy, role, companyName,
      manualTalks, equipmentRows,
      pmChecks, pmComments, pmInspector,
      envChecks, envComments, envInspector,
      opChecks, opComments, opInspector,
      labourRows, labourCompletedBy,
      safeStartCards, ssCompany, ssSupervisor, ssTrade,
      manualTraining,
    }
    localStorage.setItem(draftKey(selectedProject, weekStart), JSON.stringify(draft))
    toast.success('Draft saved')
  }

  function tryLoadDraft() {
    if (!selectedProject || !weekStart) return
    const raw = localStorage.getItem(draftKey(selectedProject, weekStart))
    if (!raw) return
    try {
      const d = JSON.parse(raw)
      if (d.reportNumber) setReportNumber(d.reportNumber)
      if (d.issuedBy) setIssuedBy(d.issuedBy)
      if (d.role) setRole(d.role)
      if (d.companyName) setCompanyName(d.companyName)
      if (d.manualTalks) setManualTalks(d.manualTalks)
      if (d.equipmentRows) setEquipmentRows(d.equipmentRows)
      if (d.pmChecks) setPmChecks(d.pmChecks)
      if (d.pmComments) setPmComments(d.pmComments)
      if (d.pmInspector) setPmInspector(d.pmInspector)
      if (d.envChecks) setEnvChecks(d.envChecks)
      if (d.envComments) setEnvComments(d.envComments)
      if (d.envInspector) setEnvInspector(d.envInspector)
      if (d.opChecks) setOpChecks(d.opChecks)
      if (d.opComments) setOpComments(d.opComments)
      if (d.opInspector) setOpInspector(d.opInspector)
      if (d.labourRows) setLabourRows(d.labourRows)
      if (d.labourCompletedBy) setLabourCompletedBy(d.labourCompletedBy)
      if (d.safeStartCards) setSafeStartCards(d.safeStartCards)
      if (d.ssCompany) setSsCompany(d.ssCompany)
      if (d.ssSupervisor) setSsSupervisor(d.ssSupervisor)
      if (d.ssTrade) setSsTrade(d.ssTrade)
      if (d.manualTraining) setManualTraining(d.manualTraining)
      toast.success('Draft restored')
    } catch { /* ignore */ }
  }

  // ── Section scroll ──
  function scrollToSection(id) {
    setActiveSection(id)
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── Computed ──
  const project = projectData || projects.find(p => p.id === selectedProject) || {}
  const allTalks = [...toolboxTalks, ...manualTalks]
  const allOperatives = operatives
  const supervisors = allOperatives.filter(o =>
    ['supervisor', 'manager', 'foreman', 'site manager', 'project manager'].some(r =>
      (o.role || '').toLowerCase().includes(r)
    )
  )
  const labourTotal = labourRows.reduce((sum, r) => sum + r.days.reduce((a, b) => a + b, 0), 0)

  // ── Checklist toggle ──
  function toggleCheck(setter, index, val) {
    setter(prev => prev.map((item, i) => i === index ? { ...item, value: val } : item))
  }

  // ── PDF Generation ──
  async function generatePDF() {
    if (!selectedProject) return toast.error('Select a project first')
    setGenerating(true)

    try {
      const doc = new jsPDF('p', 'mm', 'a4')
      const W = 210, H = 297, M = 18, CW = W - M * 2
      const coAbbr = (companyName || 'CO').substring(0, 3).toUpperCase()
      const pnAbbr = (project.name || 'PRJ').substring(0, 2).toUpperCase()
      const RC = `${pnAbbr}-${coAbbr}-XX-HS-X-${String(reportNumber).padStart(5, '0')}`

      const g = {
        rn: String(reportNumber),
        wc: fmtUK(weekStart),
        we: fmtUK(weekEnd),
        ib: issuedBy,
        role: role,
        pn: project.name || '',
        pa: project.address || project.location || '',
        pf: project.full_address || project.address || project.location || '',
        cl: project.client || '',
        jr: project.job_ref || project.reference || '',
        co: companyName,
      }

      // ── Logo loader — natural aspect ratio ──
      let logoImg = null
      if (company?.logo_url) {
        try {
          const resp = await fetch(company.logo_url)
          const blob = await resp.blob()
          const dataUrl = await new Promise(r => {
            const fr = new FileReader()
            fr.onload = () => r(fr.result)
            fr.readAsDataURL(blob)
          })
          const img = new Image()
          img.src = dataUrl
          await new Promise((resolve, reject) => {
            img.onload = resolve
            img.onerror = reject
            setTimeout(reject, 5000)
          })
          logoImg = { dataUrl, width: img.naturalWidth, height: img.naturalHeight }
        } catch { logoImg = null }
      }

      function drawLogo(x, y, targetWidth) {
        if (logoImg) {
          const ratio = logoImg.height / logoImg.width
          const h = targetWidth * ratio
          try {
            doc.addImage(logoImg.dataUrl, 'PNG', x, y, targetWidth, h)
          } catch {
            doc.setTextColor(...NAVY)
            doc.setFontSize(14)
            doc.setFont('helvetica', 'bold')
            doc.text(g.co, x, y + 8)
            return 10
          }
          return h
        }
        // Fallback: company name text (not abbreviation)
        doc.setTextColor(...NAVY)
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text(g.co, x, y + 8)
        return 10
      }

      // ── Page dimensions helper ──
      function pageDims() {
        const pw = doc.internal.pageSize.getWidth()
        const ph = doc.internal.pageSize.getHeight()
        return { W: pw, H: ph, CW: pw - M * 2 }
      }

      // ── Section header — clean typography, no circles ──
      function sectionHeader(y, num, title) {
        // Section number
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...BLUE)
        doc.text(String(num).padStart(2, '0'), M, y + 4)
        // Title
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...NAVY)
        doc.text(title.toUpperCase(), M + 10, y + 4)
        // Short blue underline (~40mm)
        doc.setDrawColor(...BLUE)
        doc.setLineWidth(0.5)
        doc.line(M, y + 8, M + 40, y + 8)
        doc.setTextColor(...TXT)
        return y + 14
      }

      // ── Page header (pages 2+) — minimal thin line ──
      function pageHeader() {
        const { W: pw } = pageDims()
        // Thin navy line at top
        doc.setDrawColor(...NAVY)
        doc.setLineWidth(0.4)
        doc.line(M, 12, pw - M, 12)
        // Company name (left, muted)
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...MUTED)
        doc.text(g.co, M, 10)
        // Page title (centre)
        doc.setFontSize(7)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...MUTED)
        doc.text('Weekly H&S Report', pw / 2, 10, { align: 'center' })
        // Ref (right)
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...MUTED)
        doc.text(RC, pw - M, 10, { align: 'right' })
        doc.setTextColor(...TXT)
        return 20
      }

      // ── Clean autoTable builder ──
      function cleanTable(opts) {
        const { startY, headers, rows, margin, columnStyles, didParseCell, bodyHalign, headFontSize, bodyFontSize } = opts
        autoTable(doc, {
          startY,
          margin: margin || { left: M, right: M },
          head: [headers],
          body: rows,
          theme: 'plain',
          headStyles: {
            fillColor: false,
            textColor: MUTED,
            fontSize: headFontSize || 7.5,
            fontStyle: 'bold',
            cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
            lineWidth: 0,
          },
          bodyStyles: {
            fontSize: bodyFontSize || 9,
            textColor: TXT,
            halign: bodyHalign || 'left',
            cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
            lineColor: [240, 240, 240],
            lineWidth: { bottom: 0.2 },
          },
          alternateRowStyles: { fillColor: [252, 252, 253] },
          columnStyles: columnStyles || {},
          didParseCell: function (data) {
            // Header bottom border
            if (data.section === 'head') {
              data.cell.styles.lineWidth = { bottom: 0.4 }
              data.cell.styles.lineColor = BORDER
            }
            // Custom callback
            if (didParseCell) didParseCell(data)
          },
        })
        return doc.lastAutoTable.finalY
      }

      // ── Inspection checklist cell colouring ──
      function inspectionCellParser(data) {
        if (data.section === 'body' && data.column.index === 1) {
          const v = (data.cell.raw || '').trim().toUpperCase()
          if (v === 'Y') {
            data.cell.styles.textColor = GRN
            data.cell.text = ['Yes']
          } else if (v === 'N') {
            data.cell.styles.textColor = RED
            data.cell.text = ['No']
          } else if (v === 'NA' || v === 'N/A') {
            data.cell.styles.textColor = MUTED
            data.cell.text = ['N/A']
          }
        }
      }

      // ── Cert date colour parser ──
      function certDateParser(minCol, maxCol) {
        return function (data) {
          if (data.section === 'body' && data.column.index >= minCol && data.column.index <= maxCol) {
            const val = data.cell.raw
            if (!val) return
            const isoDate = val.split('/').reverse().join('-')
            if (isExpired(isoDate)) {
              data.cell.styles.textColor = RED
              data.cell.styles.fontStyle = 'bold'
            } else if (isExpiringSoon(isoDate)) {
              data.cell.styles.textColor = AMBER
              data.cell.styles.fontStyle = 'bold'
            } else if (val) {
              data.cell.styles.textColor = GRN
            }
          }
        }
      }

      // ── Inspector row helper ──
      function drawInspectorRow(y, inspector, comments, commentsText) {
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...MUTED)
        doc.text('INSPECTOR', M, y)
        doc.text('DATE', M + 90, y)
        y += 4.5
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...TXT)
        doc.text(inspector || '-', M, y)
        doc.text(g.we, M + 90, y)
        if (commentsText) {
          y += 8
          doc.setFontSize(8)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(...MUTED)
          doc.text('COMMENTS', M, y)
          y += 4.5
          doc.setFontSize(8.5)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(...TXT)
          const cmLines = doc.splitTextToSize(commentsText, CW - 4)
          doc.text(cmLines, M, y)
          y += cmLines.length * 4
        }
        return y
      }

      // Track landscape pages
      const landscapePages = new Set()

      // =====================================================
      //  PAGE 1: COVER — clean, white, centred
      // =====================================================

      // Centred logo
      const coverLogoW = 55
      const coverLogoX = (W - coverLogoW) / 2
      const coverLogoH = drawLogo(coverLogoX, 38, coverLogoW)

      // Thin navy separator line (centred, ~60mm)
      let y = 38 + coverLogoH + 14
      doc.setDrawColor(...NAVY)
      doc.setLineWidth(0.4)
      doc.line(W / 2 - 30, y, W / 2 + 30, y)

      // Title
      y += 12
      doc.setTextColor(...NAVY)
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text('WEEKLY HEALTH & SAFETY REPORT', W / 2, y, { align: 'center', charSpace: 0.8 })

      // Project name
      y += 12
      doc.setTextColor(...BLUE)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'normal')
      doc.text(g.pn || 'Project', W / 2, y, { align: 'center' })

      // Week range
      y += 10
      doc.setTextColor(...MUTED)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      doc.text(`Week: ${g.wc} \u2014 ${g.we}`, W / 2, y, { align: 'center' })

      // ── Info grid — 2 columns x 3 rows, thin borders ──
      const gridTop = y + 18
      const gridLeft = M + 20
      const gridCellW = (CW - 40) / 2
      const gridRowH = 22
      const gridItems = [
        { label: 'REPORT NO.', value: g.rn },
        { label: 'ISSUED BY', value: g.ib },
        { label: 'CLIENT', value: g.cl },
        { label: 'ROLE', value: g.role },
        { label: 'JOB REF', value: g.jr },
        { label: 'ADDRESS', value: g.pf },
      ]

      // Draw grid border
      const gridRows = Math.ceil(gridItems.length / 2)
      const gridH = gridRows * gridRowH
      doc.setDrawColor(...BORDER)
      doc.setLineWidth(0.3)
      doc.rect(gridLeft, gridTop, gridCellW * 2, gridH)
      // Vertical divider
      doc.line(gridLeft + gridCellW, gridTop, gridLeft + gridCellW, gridTop + gridH)
      // Horizontal dividers
      for (let r = 1; r < gridRows; r++) {
        doc.line(gridLeft, gridTop + r * gridRowH, gridLeft + gridCellW * 2, gridTop + r * gridRowH)
      }

      gridItems.forEach((item, i) => {
        const col = i % 2
        const row = Math.floor(i / 2)
        const cx = gridLeft + col * gridCellW + 5
        const cy = gridTop + row * gridRowH + 6
        // Label — small muted caps
        doc.setFontSize(6.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...MUTED)
        doc.text(item.label, cx, cy)
        // Value
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...TXT)
        const valLines = doc.splitTextToSize(item.value || '-', gridCellW - 10)
        doc.text(valLines, cx, cy + 6)
      })

      // Reference (small, muted, centred at bottom of cover)
      const refY = gridTop + gridH + 14
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...MUTED)
      doc.text(`REF: ${RC}`, W / 2, refY, { align: 'center' })

      // =====================================================
      //  PAGE 2: TOOLBOX TALKS (Section 1)
      // =====================================================
      doc.addPage('p')
      y = pageHeader()
      y = sectionHeader(y, 1, 'Toolbox Talks')

      // Date field is already formatted by fmtUK() — use as-is
      const tbtBody = allTalks.map(t => [t.date || '', t.topic || '', String(t.attendees || ''), t.notes || ''])
      if (tbtBody.length === 0) tbtBody.push(['-', 'No talks recorded this week', '-', ''])
      cleanTable({
        startY: y,
        headers: ['DATE', 'TOPIC', 'ATTENDEES', 'NOTES'],
        rows: tbtBody,
        columnStyles: { 0: { cellWidth: 26 }, 2: { cellWidth: 22, halign: 'center' } },
      })

      // =====================================================
      //  PAGE 3: TRAINING MATRIX (Section 2) — Landscape
      // =====================================================
      doc.addPage('l')
      landscapePages.add(doc.internal.getNumberOfPages())
      y = pageHeader()
      y = sectionHeader(y, 2, 'Training Matrix')

      const trBody = allOperatives.filter(o => !supervisors.includes(o)).map((o, i) => [
        String(i + 1), o.name || '', o.employer || '', o.role || '',
        fmtUK(o.card_expiry), fmtUK(o.ipaf_expiry), fmtUK(o.pasma_expiry),
        fmtUK(o.sssts_expiry), fmtUK(o.smsts_expiry), fmtUK(o.first_aid_expiry),
        o.ap_number || o.cscs_number || '',
      ])
      manualTraining.forEach(t => {
        trBody.push([String(trBody.length + 1), t.name, t.company, t.role, t.cscs, t.ipaf, t.pasma, t.sssts, t.smsts, t.firstAid, t.apNumber])
      })
      if (trBody.length === 0) trBody.push(['1', 'No operatives recorded', '', '', '', '', '', '', '', '', ''])
      cleanTable({
        startY: y,
        headers: ['#', 'NAME', 'COMPANY', 'ROLE', 'CSCS', 'IPAF', 'PASMA', 'SSSTS', 'SMSTS', 'FIRST AID', 'AP'],
        rows: trBody,
        headFontSize: 6.5,
        bodyFontSize: 7,
        columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 30 }, 2: { cellWidth: 22 }, 3: { cellWidth: 22 } },
        didParseCell: certDateParser(4, 9),
      })

      // =====================================================
      //  PAGE 4: MANAGEMENT TRAINING (Section 3) — Landscape
      // =====================================================
      doc.addPage('l')
      landscapePages.add(doc.internal.getNumberOfPages())
      y = pageHeader()
      y = sectionHeader(y, 3, 'Management Training')

      const mgBody = supervisors.map((o, i) => [
        String(i + 1), o.name || '', o.employer || '', o.role || '',
        fmtUK(o.card_expiry), fmtUK(o.sssts_expiry), fmtUK(o.smsts_expiry),
        fmtUK(o.first_aid_expiry), '', fmtUK(o.pasma_expiry), fmtUK(o.ipaf_expiry), '', '',
      ])
      if (mgBody.length === 0) mgBody.push(['1', 'No management staff recorded', '', '', '', '', '', '', '', '', '', '', ''])
      cleanTable({
        startY: y,
        headers: ['#', 'NAME', 'COMPANY', 'POSITION', 'CSCS/JIB', 'SSSTS', 'SMSTS', 'FIRST AID (3D)', 'FIRST AID (1D)', 'PASMA', 'IPAF', 'PAV', 'OTHER'],
        rows: mgBody,
        headFontSize: 6.5,
        bodyFontSize: 7,
        columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 25 }, 2: { cellWidth: 18 }, 3: { cellWidth: 28 } },
        didParseCell: certDateParser(4, 10),
      })

      // =====================================================
      //  PAGE 5: EQUIPMENT REGISTER (Section 4) — Landscape
      // =====================================================
      doc.addPage('l')
      landscapePages.add(doc.internal.getNumberOfPages())
      y = pageHeader()
      y = sectionHeader(y, 4, 'Equipment Register')

      const eqBody = equipmentRows.map((r, i) => [
        String(i + 1), r.description || '', r.ref || r.serial || '', fmtUK(r.patExpiry || r.inspectionDate || ''),
        fmtUK(r.certExpiry || r.nextDue || ''), r.safe || r.status || '',
      ])
      if (eqBody.length === 0) eqBody.push(['1', 'No equipment recorded', '-', '-', '-', '-'])
      cleanTable({
        startY: y,
        headers: ['#', 'ITEM', 'SERIAL / ID', 'INSPECTION DATE', 'NEXT DUE', 'STATUS'],
        rows: eqBody,
        bodyFontSize: 8,
        columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 55 }, 2: { cellWidth: 35 } },
      })

      // =====================================================
      //  PAGE 6: PM INSPECTION (Section 5)
      // =====================================================
      doc.addPage('p')
      y = pageHeader()
      y = sectionHeader(y, 5, 'PM Inspection')

      const pmBody = pmChecks.map(item => [item.label, item.value || '-', ''])
      y = cleanTable({
        startY: y,
        headers: ['ITEM', 'RESULT', 'COMMENTS'],
        rows: pmBody,
        columnStyles: { 0: { cellWidth: 75 }, 1: { cellWidth: 22, halign: 'center' } },
        didParseCell: inspectionCellParser,
      })
      y += 8
      drawInspectorRow(y, pmInspector, 'pmComments', pmComments)

      // =====================================================
      //  PAGE 7: ENVIRONMENTAL INSPECTION (Section 6)
      // =====================================================
      doc.addPage('p')
      y = pageHeader()
      y = sectionHeader(y, 6, 'Environmental Inspection')

      const envBody = envChecks.map(item => [item.label, item.value || '-', ''])
      y = cleanTable({
        startY: y,
        headers: ['ITEM', 'RESULT', 'COMMENTS'],
        rows: envBody,
        columnStyles: { 0: { cellWidth: 75 }, 1: { cellWidth: 22, halign: 'center' } },
        didParseCell: inspectionCellParser,
      })
      y += 8
      drawInspectorRow(y, envInspector, 'envComments', envComments)

      // =====================================================
      //  PAGE 8: OPERATIVE INSPECTION (Section 7)
      // =====================================================
      doc.addPage('p')
      y = pageHeader()
      y = sectionHeader(y, 7, 'Operative Inspection')

      const opBody = opChecks.map(item => [item.label, item.value || '-', ''])
      y = cleanTable({
        startY: y,
        headers: ['ITEM', 'RESULT', 'COMMENTS'],
        rows: opBody,
        columnStyles: { 0: { cellWidth: 75 }, 1: { cellWidth: 22, halign: 'center' } },
        didParseCell: inspectionCellParser,
      })
      y += 8
      drawInspectorRow(y, opInspector, 'opComments', opComments)

      // =====================================================
      //  PAGE 9: RAMS MATRIX (Section 8)
      // =====================================================
      doc.addPage('p')
      y = pageHeader()
      y = sectionHeader(y, 8, 'RAMS Matrix')

      const raBody = ramsRows.map((r, i) => [
        String(r.num || i + 1), r.title || '', r.reference || '', r.rev || '', r.issuedBy || '', r.approvedBy || '',
      ])
      if (raBody.length === 0) raBody.push(['1', 'No RAMS recorded', '-', '-', '-', '-'])
      cleanTable({
        startY: y,
        headers: ['#', 'TITLE', 'REFERENCE', 'REV', 'ISSUED BY', 'APPROVED BY'],
        rows: raBody,
        columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 55 } },
      })

      // =====================================================
      //  PAGE 10: LABOUR RETURN (Section 9)
      // =====================================================
      doc.addPage('p')
      y = pageHeader()
      y = sectionHeader(y, 9, 'Labour Return')

      const laBody = labourRows.map(r => {
        const total = r.days.reduce((a, b) => a + b, 0)
        return [r.trade || r.company || '', ...r.days.map(String), String(total)]
      })
      if (laBody.length === 0) laBody.push(['No trades', '0', '0', '0', '0', '0', '0', '0', '0'])

      // Grand totals
      const dayTotals = [0, 0, 0, 0, 0, 0, 0]
      labourRows.forEach(r => r.days.forEach((d, i) => { dayTotals[i] += d }))
      const grandTotal = dayTotals.reduce((a, b) => a + b, 0)
      laBody.push(['TOTAL', ...dayTotals.map(String), String(grandTotal)])

      y = cleanTable({
        startY: y,
        headers: ['COMPANY / TRADE', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'TOTAL'],
        rows: laBody,
        bodyHalign: 'center',
        columnStyles: { 0: { halign: 'left', cellWidth: 50 }, 8: { fontStyle: 'bold' } },
        didParseCell: function (data) {
          // Totals row — bold text + thin top border, no heavy fill
          if (data.section === 'body' && data.row.index === laBody.length - 1) {
            data.cell.styles.fontStyle = 'bold'
            data.cell.styles.textColor = NAVY
            data.cell.styles.lineWidth = { top: 0.5, bottom: 0.2 }
            data.cell.styles.lineColor = NAVY
          }
        },
      })

      // Completed by + grand total (plain text)
      y += 8
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...MUTED)
      doc.text('COMPLETED BY', M, y)
      doc.text('WEEKLY TOTAL', W - M - 40, y)
      y += 5
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...TXT)
      doc.text(labourCompletedBy || '-', M, y)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...NAVY)
      doc.setFontSize(14)
      doc.text(String(grandTotal), W - M - 40, y)
      doc.setTextColor(...TXT)

      // =====================================================
      //  SAFE START CARDS (Section 10) — compact cards
      // =====================================================
      safeStartCards.forEach((card, ci) => {
        doc.addPage('p')
        y = pageHeader()
        if (ci === 0) y = sectionHeader(y, 10, 'Safe Start Cards')
        else y += 4

        const dayName = card.dayName || DAYS[ci] || ''
        const dateStr = fmtUK(card.date)

        // Card container
        const cardTop = y
        doc.setDrawColor(...BORDER)
        doc.setLineWidth(0.3)

        // Day header — light grey background, not navy
        doc.setFillColor(245, 246, 248)
        doc.rect(M, y, CW, 9, 'F')
        doc.setDrawColor(...BORDER)
        doc.rect(M, y, CW, 9, 'S')
        doc.setTextColor(...NAVY)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text(dayName.toUpperCase() + (dateStr ? '  \u2014  ' + dateStr : ''), M + 5, y + 6.5)
        y += 13

        // Company + supervisor + trade — clean labels
        doc.setFontSize(7)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...MUTED)
        doc.text('COMPANY', M + 2, y)
        doc.text('SUPERVISOR', M + 65, y)
        doc.text('TRADE', M + 130, y)
        y += 4.5
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...TXT)
        doc.text(ssCompany || '-', M + 2, y)
        doc.text(ssSupervisor || '-', M + 65, y)
        doc.text(ssTrade || '-', M + 130, y)
        y += 8

        // Checklist — two columns within the card
        const checks = card.checks || []
        if (checks.length === 0) {
          doc.setFontSize(8)
          doc.setTextColor(...MUTED)
          doc.text('No items', M + 4, y + 4)
          y += 10
        } else {
          const mid = Math.ceil(checks.length / 2)
          const col1 = checks.slice(0, mid)
          const col2 = checks.slice(mid)
          const colW = CW / 2 - 4
          const lineH = 6

          // Column headers
          doc.setFontSize(7)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(...MUTED)
          doc.text('ITEM', M + 4, y)
          doc.text('', M + colW - 2, y)
          doc.text('ITEM', M + CW / 2 + 4, y)
          y += 2
          doc.setDrawColor(...BORDER)
          doc.setLineWidth(0.2)
          doc.line(M + 2, y, M + CW - 2, y)
          y += 3

          const startCheckY = y
          // Draw each column
          ;[col1, col2].forEach((col, colIdx) => {
            let cy = startCheckY
            const offsetX = colIdx === 0 ? M + 4 : M + CW / 2 + 4
            const valX = offsetX + colW - 10
            col.forEach(item => {
              doc.setFontSize(8)
              doc.setFont('helvetica', 'normal')
              doc.setTextColor(...TXT)
              const label = doc.splitTextToSize(item.label || '', colW - 16)
              doc.text(label, offsetX, cy)
              // Value with colour
              const v = (item.value || '-').trim().toUpperCase()
              if (v === 'Y') {
                doc.setTextColor(...GRN)
                doc.text('Yes', valX, cy)
              } else if (v === 'N') {
                doc.setTextColor(...RED)
                doc.text('No', valX, cy)
              } else if (v === 'NA' || v === 'N/A') {
                doc.setTextColor(...MUTED)
                doc.text('N/A', valX, cy)
              } else {
                doc.setTextColor(...MUTED)
                doc.text(v || '-', valX, cy)
              }
              cy += Math.max(label.length, 1) * lineH
            })
            y = Math.max(y, cy)
          })
        }

        // Card outer border
        const cardBottom = y + 4
        doc.setDrawColor(...BORDER)
        doc.setLineWidth(0.3)
        doc.rect(M, cardTop, CW, cardBottom - cardTop)
      })

      // =====================================================
      //  TWO-PASS: Stamp page footers with "Page X of Y"
      // =====================================================
      const totalPages = doc.internal.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        const pw = doc.internal.pageSize.getWidth()
        const ph = doc.internal.pageSize.getHeight()

        // Thin footer line
        doc.setDrawColor(...BORDER)
        doc.setLineWidth(0.2)
        doc.line(M, ph - 15, pw - M, ph - 15)

        // Footer text — all 7pt muted
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...MUTED)
        doc.text(g.co, M, ph - 10)
        doc.text('CoreSite', pw / 2, ph - 10, { align: 'center' })
        doc.text(`Page ${i} of ${totalPages}`, pw - M, ph - 10, { align: 'right' })
      }

      // ── Save ──
      const filename = `${g.co}_${g.pn}_HS_Report_WE_${weekEnd.replace(/-/g, '')}.pdf`
      doc.save(filename)
      bumpReportCounter()
      toast.success('PDF generated successfully')
    } catch (err) {
      console.error('PDF generation failed:', err)
      toast.error('Failed to generate PDF: ' + err.message)
    }

    setGenerating(false)
  }

  // ── Preview PDF (react-pdf/renderer) ──
  async function previewPDF() {
    if (!selectedProject) return toast.error('Select a project first')
    setPreviewGenerating(true)
    try {
      const [{ pdf }, { default: HSReportDocument }, { hydrateSignatures }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../lib/hsReport/HSReportDocument'),
        import('../lib/hsReport/hydrateSignatures'),
      ])

      // Hydrate signatures for all raw talks
      const rawTalks = rawTalksRef.current || []
      const hydratedTalks = await Promise.all(rawTalks.map(async (talk) => {
        const sigs = talk.toolbox_signatures || []
        const hydrated = await hydrateSignatures(sigs)
        return { ...talk, toolbox_signatures: hydrated }
      }))

      const reportData = {
        allTalks: [...toolboxTalks, ...manualTalks],
        rawTalks: hydratedTalks,
        operatives,
        equipmentRows,
        pmChecklist: pmChecks,
        pmInspector: pmInspector || null,
        pmComments: pmComments || null,
        envChecklist: envChecks,
        envInspector: envInspector || null,
        envComments: envComments || null,
        opChecklist: opChecks,
        opInspector: opInspector || null,
        opComments: opComments || null,
        ramsRows,
        rawRams: rawRamsRef.current,
        labourData: labourRows,
        rawAttendance: rawAttendanceRef.current,
        safeStartCards,
        safeStartCompany: ssCompany || null,
        safeStartSupervisor: ssSupervisor || null,
        safeStartTrade: ssTrade || null,
        project: projectData || projects.find(p => p.id === selectedProject) || {},
        company,
        weekStart,
        weekEnd,
        reportNumber,
        issuedBy,
        role,
        companyName,
      }

      const rawBlob = await pdf(<HSReportDocument data={reportData} />).toBlob()

      // Post-process with pdf-lib: deduplicate byte-identical image XObjects.
      // react-pdf embeds one image XObject per <Image> node even when src is identical.
      // We hash each image stream, keep the first occurrence, and rewrite duplicates
      // to point at the canonical reference.
      let finalBlob = rawBlob
      try {
        const { PDFDocument, PDFName, PDFRef, PDFRawStream, PDFStream } = await import('pdf-lib')
        const rawBytes = new Uint8Array(await rawBlob.arrayBuffer())
        const pdfDoc = await PDFDocument.load(rawBytes, { ignoreEncryption: true, updateMetadata: false })

        // Build hash → canonical ref map across all pages
        const hashToRef = new Map()
        const refToHash = new Map()
        const refsToRewrite = [] // [{ page, resourceName, canonicalRef }]

        // Simple hash: sum first 256 bytes + length. Not crypto-grade but sufficient
        // for detecting byte-identical PNG streams within one document.
        function quickHash(bytes) {
          if (!bytes || bytes.length === 0) return 'empty'
          let h = bytes.length
          const len = Math.min(bytes.length, 256)
          for (let i = 0; i < len; i++) h = ((h << 5) - h + bytes[i]) | 0
          return `${h}_${bytes.length}`
        }

        function getStreamBytes(obj) {
          if (!obj) return null
          // Drill through indirect references
          if (obj instanceof PDFRef) obj = pdfDoc.context.lookup(obj)
          if (!obj) return null
          // PDFRawStream and PDFStream both have .contents or .getContents()
          if (typeof obj.getContents === 'function') return obj.getContents()
          if (obj.contents) return obj.contents instanceof Uint8Array ? obj.contents : null
          return null
        }

        const pages = pdfDoc.getPages()
        for (const page of pages) {
          const resources = page.node.Resources()
          if (!resources) continue
          const xobjectDict = resources.get(PDFName.of('XObject'))
          if (!xobjectDict) continue

          // Enumerate XObject entries
          const dict = pdfDoc.context.lookup(xobjectDict)
          if (!dict || typeof dict.entries !== 'function') continue

          for (const [name, ref] of dict.entries()) {
            if (!(ref instanceof PDFRef)) continue
            const obj = pdfDoc.context.lookup(ref)
            if (!obj) continue

            // Check if it's an image (Subtype /Image)
            const subtype = obj.dict?.get?.(PDFName.of('Subtype'))
            if (!subtype || subtype.toString() !== '/Image') continue

            // Get stream bytes and compute hash
            const streamBytes = getStreamBytes(obj)
            if (!streamBytes) continue

            // Include SMask bytes in hash if present
            const smaskRef = obj.dict?.get?.(PDFName.of('SMask'))
            let smaskBytes = null
            if (smaskRef) smaskBytes = getStreamBytes(smaskRef)

            const hash = quickHash(streamBytes) + (smaskBytes ? '_sm' + quickHash(smaskBytes) : '')

            if (hashToRef.has(hash)) {
              // Duplicate — schedule rewrite to canonical ref
              const canonicalRef = hashToRef.get(hash)
              if (canonicalRef !== ref) {
                refsToRewrite.push({ dict, name, canonicalRef })
              }
            } else {
              hashToRef.set(hash, ref)
            }
            refToHash.set(ref, hash)
          }
        }

        // Apply rewrites
        if (refsToRewrite.length > 0) {
          for (const { dict, name, canonicalRef } of refsToRewrite) {
            dict.set(name, canonicalRef)
          }
          const dedupedBytes = await pdfDoc.save()
          finalBlob = new Blob([dedupedBytes], { type: 'application/pdf' })
          console.log(`[PDF dedup] Merged ${refsToRewrite.length} duplicate image XObjects (${hashToRef.size} unique)`)
        }
      } catch (dedupErr) {
        // Dedup is best-effort — if it fails, use the original blob
        console.warn('[PDF dedup] Post-process failed, using original:', dedupErr.message)
      }

      const url = URL.createObjectURL(finalBlob)
      const link = document.createElement('a')
      link.href = url
      const pn = (reportData.project.name || 'Report').replace(/[^a-zA-Z0-9]/g, '_')
      link.download = `HS_Report_${pn}_${weekEnd}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success('PDF downloaded')
    } catch (err) {
      console.error('Preview PDF failed:', err)
      toast.error('Failed to generate preview: ' + err.message)
    }
    setPreviewGenerating(false)
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-[#1B6FC8] border-t-transparent rounded-full" />
      </div>
    )
  }

  // ── Render ──
  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>H&S Weekly Report</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Auto-populated from platform data</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={saveDraft} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors hover:bg-black/5" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
            <Save size={16} /> Save Draft
          </button>
          <LoadingButton loading={previewGenerating} onClick={previewPDF} className="bg-blue-600 hover:bg-blue-700 text-white text-sm">
            <Eye size={16} /> Preview PDF
          </LoadingButton>
          <LoadingButton loading={generating} onClick={generatePDF} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm">
            <Download size={16} /> Generate PDF
          </LoadingButton>
        </div>
      </div>

      {/* Project + Week Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Project</label>
          <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border text-sm" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
            <option value="">Select project...</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Week Commencing</label>
          <input type="date" value={weekStart} onChange={e => setWeekStart(mondayOfWeek(e.target.value))} className="w-full px-3 py-2.5 rounded-lg border text-sm" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Week Ending</label>
          <input type="date" value={weekEnd} readOnly className="w-full px-3 py-2.5 rounded-lg border text-sm opacity-70 cursor-not-allowed" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
        </div>
      </div>

      {dataLoading && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)' }}>
          <Loader2 size={16} className="animate-spin" /> Loading report data...
        </div>
      )}

      {/* Main Content: Sidebar + Sections */}
      <div className="flex gap-6">
        {/* Section Nav Sidebar */}
        <div className="hidden lg:block w-52 shrink-0">
          <div className="sticky top-4 rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <div className="px-3 py-2.5 border-b text-xs font-semibold uppercase tracking-wider" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
              Sections
            </div>
            <nav className="py-1">
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => scrollToSection(s.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors ${activeSection === s.id ? 'bg-[#1560AA]/10 text-[#1560AA] font-semibold border-l-2 border-[#1560AA]' : 'hover:bg-black/5'}`}
                  style={activeSection !== s.id ? { color: 'var(--text-secondary)' } : undefined}
                >
                  <s.icon size={13} />
                  {s.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Mobile section selector */}
        <div className="lg:hidden w-full mb-4">
          <select
            value={activeSection}
            onChange={e => scrollToSection(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border text-sm"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            {SECTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        {/* Sections */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* 1. Report Settings */}
          <SectionCard id="settings" title="Report Settings" icon={Settings} refs={sectionRefs}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Report Number" value={reportNumber} onChange={e => setReportNumber(e.target.value)} />
              <Field label="Week Commencing" value={fmtUK(weekStart)} readOnly />
              <Field label="Week Ending" value={fmtUK(weekEnd)} readOnly />
              <Field label="Issued By" value={issuedBy} onChange={e => setIssuedBy(e.target.value)} />
              <Field label="Role" value={role} onChange={e => setRole(e.target.value)} />
              <Field label="Company Name" value={companyName} onChange={e => setCompanyName(e.target.value)} />
              <Field label="Project Name" value={project.name || ''} readOnly />
              <Field label="Address" value={project.address || project.location || ''} readOnly />
              <Field label="Client" value={project.client || ''} readOnly />
              <Field label="Job Ref" value={project.job_ref || project.reference || ''} readOnly />
            </div>
          </SectionCard>

          {/* 2. Cover Page Preview */}
          <SectionCard id="cover" title="Cover Page Preview" icon={FileText} refs={sectionRefs}>
            <div className="rounded-lg border p-6 text-center" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-main)' }}>
              <p className="text-sm font-bold mb-1" style={{ color: '#1560AA' }}>{companyName.toUpperCase()}</p>
              <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                {(project.name || 'PROJECT').toUpperCase()} WEEKLY HEALTH & SAFETY REPORT
              </h3>
              <div className="border-t my-3" style={{ borderColor: 'var(--border-color)' }} />
              <div className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                <p><strong>Report Number:</strong> {`${(project.name || 'PRJ').substring(0, 2).toUpperCase()}-${companyName.substring(0, 3).toUpperCase()}-XX-HS-X-${String(reportNumber).padStart(5, '0')}`}</p>
                <p><strong>Weekending:</strong> {fmtUK(weekEnd)}</p>
                <p><strong>Issued By:</strong> {issuedBy} ({role})</p>
              </div>
            </div>
          </SectionCard>

          {/* 3. Toolbox Talks */}
          <SectionCard id="toolbox" title="Toolbox Talks" icon={BookOpen} refs={sectionRefs} badge={allTalks.length > 0 ? `${allTalks.length} talks` : null}>
            <DataTable
              headers={['Date', 'Topic', 'Attendees', 'Notes']}
              rows={allTalks.map(t => [t.date, t.topic, String(t.attendees || ''), t.notes])}
              emptyText="No toolbox talks recorded this week"
            />
            <h4 className="text-xs font-semibold mt-4 mb-2" style={{ color: 'var(--text-muted)' }}>Manual Entries</h4>
            {manualTalks.map((t, i) => (
              <div key={i} className="grid grid-cols-4 gap-2 mb-2">
                <input value={t.date} onChange={e => { const n = [...manualTalks]; n[i].date = e.target.value; setManualTalks(n) }} placeholder="Date" className="px-2 py-1.5 rounded border text-xs" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
                <input value={t.topic} onChange={e => { const n = [...manualTalks]; n[i].topic = e.target.value; setManualTalks(n) }} placeholder="Topic" className="px-2 py-1.5 rounded border text-xs" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
                <input value={t.attendees} onChange={e => { const n = [...manualTalks]; n[i].attendees = e.target.value; setManualTalks(n) }} placeholder="Attendees" className="px-2 py-1.5 rounded border text-xs" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
                <div className="flex gap-1">
                  <input value={t.notes} onChange={e => { const n = [...manualTalks]; n[i].notes = e.target.value; setManualTalks(n) }} placeholder="Notes" className="flex-1 px-2 py-1.5 rounded border text-xs" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
                  <button onClick={() => setManualTalks(prev => prev.filter((_, j) => j !== i))} className="p-1.5 rounded hover:bg-red-50 text-red-500"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
            <button onClick={() => setManualTalks(prev => [...prev, { date: fmtUK(new Date().toISOString()), topic: '', attendees: '', notes: '' }])} className="flex items-center gap-1.5 text-xs font-medium text-[#1560AA] hover:text-[#1560AA]/80 mt-2">
              <Plus size={14} /> Add Row
            </button>
          </SectionCard>

          {/* 4. Training Matrix */}
          <SectionCard id="training" title="Training Matrix" icon={Users} refs={sectionRefs} badge={allOperatives.length > 0 ? `${allOperatives.filter(o => !supervisors.includes(o)).length} operatives` : null}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {['Name', 'Company', 'Role', 'CSCS Expiry', 'IPAF Expiry', 'PASMA Expiry', 'SSSTS Expiry', 'SMSTS Expiry', 'First Aid Expiry', 'AP Number'].map(h => (
                      <th key={h} className="px-2 py-2 text-left font-semibold border-b" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allOperatives.filter(o => !supervisors.includes(o)).map(o => (
                    <tr key={o.id} className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                      <td className="px-2 py-1.5 font-medium" style={{ color: 'var(--text-primary)' }}>{o.name}</td>
                      <td className="px-2 py-1.5" style={{ color: 'var(--text-secondary)' }}>{o.employer || ''}</td>
                      <td className="px-2 py-1.5" style={{ color: 'var(--text-secondary)' }}>{o.role || ''}</td>
                      <CertTd date={o.card_expiry} />
                      <CertTd date={o.ipaf_expiry} />
                      <CertTd date={o.pasma_expiry} />
                      <CertTd date={o.sssts_expiry} />
                      <CertTd date={o.smsts_expiry} />
                      <CertTd date={o.first_aid_expiry} />
                      <td className="px-2 py-1.5" style={{ color: 'var(--text-secondary)' }}>{o.ap_number || o.cscs_number || ''}</td>
                    </tr>
                  ))}
                  {allOperatives.filter(o => !supervisors.includes(o)).length === 0 && (
                    <tr><td colSpan={10} className="px-2 py-4 text-center" style={{ color: 'var(--text-muted)' }}>No operatives found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* 5. Management Training */}
          <SectionCard id="mgmt" title="Management Training" icon={Shield} refs={sectionRefs} badge={supervisors.length > 0 ? `${supervisors.length} staff` : null}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {['Name', 'Company', 'Position', 'CSCS Expiry', 'SSSTS', 'SMSTS', 'First Aid', 'PASMA', 'IPAF'].map(h => (
                      <th key={h} className="px-2 py-2 text-left font-semibold border-b" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {supervisors.map(o => (
                    <tr key={o.id} className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                      <td className="px-2 py-1.5 font-medium" style={{ color: 'var(--text-primary)' }}>{o.name}</td>
                      <td className="px-2 py-1.5" style={{ color: 'var(--text-secondary)' }}>{o.employer || ''}</td>
                      <td className="px-2 py-1.5" style={{ color: 'var(--text-secondary)' }}>{o.role || ''}</td>
                      <CertTd date={o.card_expiry} />
                      <CertTd date={o.sssts_expiry} />
                      <CertTd date={o.smsts_expiry} />
                      <CertTd date={o.first_aid_expiry} />
                      <CertTd date={o.pasma_expiry} />
                      <CertTd date={o.ipaf_expiry} />
                    </tr>
                  ))}
                  {supervisors.length === 0 && (
                    <tr><td colSpan={9} className="px-2 py-4 text-center" style={{ color: 'var(--text-muted)' }}>No supervisors/managers found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* 6. Equipment Register */}
          <SectionCard id="equipment" title="Equipment Register" icon={Wrench} refs={sectionRefs}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {['#', 'Item', 'Serial/ID', 'Inspection Date', 'Next Due', 'Status', ''].map(h => (
                      <th key={h} className="px-2 py-2 text-left font-semibold border-b" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {equipmentRows.map((r, i) => (
                    <tr key={i} className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                      <td className="px-2 py-1">{i + 1}</td>
                      <td className="px-1 py-1"><input value={r.description || ''} onChange={e => { const n = [...equipmentRows]; n[i].description = e.target.value; setEquipmentRows(n) }} className="w-full px-1.5 py-1 rounded border text-xs" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} /></td>
                      <td className="px-1 py-1"><input value={r.ref || ''} onChange={e => { const n = [...equipmentRows]; n[i].ref = e.target.value; setEquipmentRows(n) }} className="w-full px-1.5 py-1 rounded border text-xs" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} /></td>
                      <td className="px-1 py-1"><input value={r.certExpiry || ''} onChange={e => { const n = [...equipmentRows]; n[i].certExpiry = e.target.value; setEquipmentRows(n) }} className="w-full px-1.5 py-1 rounded border text-xs" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} /></td>
                      <td className="px-1 py-1"><input value={r.patExpiry || ''} onChange={e => { const n = [...equipmentRows]; n[i].patExpiry = e.target.value; setEquipmentRows(n) }} className="w-full px-1.5 py-1 rounded border text-xs" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} /></td>
                      <td className="px-1 py-1">
                        <select value={r.safe || ''} onChange={e => { const n = [...equipmentRows]; n[i].safe = e.target.value; setEquipmentRows(n) }} className="w-full px-1.5 py-1 rounded border text-xs" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                          <option value="">--</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </td>
                      <td className="px-1 py-1">
                        <button onClick={() => setEquipmentRows(prev => prev.filter((_, j) => j !== i))} className="p-1 rounded hover:bg-red-50 text-red-500"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => setEquipmentRows(prev => [...prev, { ref: String(prev.length + 1), description: '', patExpiry: '', certExpiry: '', defects: '', safe: '', inspectedBy: issuedBy, comments: '' }])} className="flex items-center gap-1.5 text-xs font-medium text-[#1560AA] hover:text-[#1560AA]/80 mt-3">
              <Plus size={14} /> Add Row
            </button>
          </SectionCard>

          {/* 7. PM Inspection */}
          <SectionCard id="pm" title="PM Inspection" icon={ClipboardList} refs={sectionRefs}>
            <InspectionChecklist items={pmChecks} onToggle={(i, v) => toggleCheck(setPmChecks, i, v)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Comments</label>
                <textarea value={pmComments} onChange={e => setPmComments(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Inspector Name</label>
                <input value={pmInspector} onChange={e => setPmInspector(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
            </div>
          </SectionCard>

          {/* 8. Environmental Inspection */}
          <SectionCard id="env" title="Environmental Inspection" icon={Leaf} refs={sectionRefs}>
            <InspectionChecklist items={envChecks} onToggle={(i, v) => toggleCheck(setEnvChecks, i, v)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Comments</label>
                <textarea value={envComments} onChange={e => setEnvComments(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Inspector Name</label>
                <input value={envInspector} onChange={e => setEnvInspector(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
            </div>
          </SectionCard>

          {/* 9. Operative Inspection */}
          <SectionCard id="operative" title="Operative Inspection" icon={HardHat} refs={sectionRefs}>
            <InspectionChecklist items={opChecks} onToggle={(i, v) => toggleCheck(setOpChecks, i, v)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Comments</label>
                <textarea value={opComments} onChange={e => setOpComments(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Inspector Name</label>
                <input value={opInspector} onChange={e => setOpInspector(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
            </div>
          </SectionCard>

          {/* 10. RAMS Matrix */}
          <SectionCard id="rams" title="RAMS Matrix" icon={FileCheck} refs={sectionRefs} badge={ramsRows.length > 0 ? `${ramsRows.length} docs` : null}>
            <DataTable
              headers={['#', 'RAMS Title', 'Reference', 'Rev', 'Issued By', 'Approved By']}
              rows={ramsRows.map(r => [String(r.num), r.title, r.reference, r.rev, r.issuedBy, r.approvedBy])}
              emptyText="No RAMS documents found"
            />
          </SectionCard>

          {/* 11. Labour Return */}
          <SectionCard id="labour" title="Labour Return" icon={Calendar} refs={sectionRefs} badge={labourTotal > 0 ? `${labourTotal} total` : null}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold border-b" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>Company / Trade</th>
                    {DAYS.map(d => <th key={d} className="px-2 py-2 text-center font-semibold border-b" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>{d}</th>)}
                    <th className="px-2 py-2 text-center font-semibold border-b" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>Total</th>
                    <th className="px-2 py-2 border-b" style={{ borderColor: 'var(--border-color)' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {labourRows.map((r, i) => {
                    const total = r.days.reduce((a, b) => a + b, 0)
                    return (
                      <tr key={i} className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                        <td className="px-1 py-1">
                          <input value={r.trade || r.company || ''} onChange={e => { const n = [...labourRows]; n[i] = { ...n[i], trade: e.target.value, company: e.target.value }; setLabourRows(n) }} className="w-full px-1.5 py-1 rounded border text-xs" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} placeholder="Trade" />
                        </td>
                        {r.days.map((d, di) => (
                          <td key={di} className="px-1 py-1">
                            <input type="number" value={d} onChange={e => { const n = [...labourRows]; n[i] = { ...n[i], days: [...n[i].days] }; n[i].days[di] = parseInt(e.target.value) || 0; setLabourRows(n) }} className="w-full px-1.5 py-1 rounded border text-xs text-center" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} min={0} />
                          </td>
                        ))}
                        <td className="px-2 py-1 text-center font-bold" style={{ color: 'var(--text-primary)' }}>{total}</td>
                        <td className="px-1 py-1">
                          <button onClick={() => setLabourRows(prev => prev.filter((_, j) => j !== i))} className="p-1 rounded hover:bg-red-50 text-red-500"><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    )
                  })}
                  {/* Summary row */}
                  <tr style={{ backgroundColor: 'var(--bg-main)' }}>
                    <td className="px-2 py-2 font-bold text-xs" style={{ color: 'var(--text-primary)' }}>TOTAL</td>
                    {DAYS.map((_, di) => (
                      <td key={di} className="px-2 py-2 text-center font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                        {labourRows.reduce((sum, r) => sum + (r.days[di] || 0), 0)}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center font-bold text-xs" style={{ color: '#1560AA' }}>{labourTotal}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4 mt-3">
              <button onClick={() => setLabourRows(prev => [...prev, { company: '', trade: '', days: [0, 0, 0, 0, 0, 0, 0] }])} className="flex items-center gap-1.5 text-xs font-medium text-[#1560AA] hover:text-[#1560AA]/80">
                <Plus size={14} /> Add Row
              </button>
              <div className="flex items-center gap-2 ml-auto">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Completed by:</label>
                <input value={labourCompletedBy} onChange={e => setLabourCompletedBy(e.target.value)} className="px-2 py-1 rounded border text-xs w-40" style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
              </div>
            </div>
          </SectionCard>

          {/* 12. Safe Start Cards */}
          <SectionCard id="safestart" title="Safe Start Cards" icon={AlertTriangle} refs={sectionRefs}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <Field label="Company" value={ssCompany} onChange={e => setSsCompany(e.target.value)} />
              <Field label="Supervisor" value={ssSupervisor} onChange={e => setSsSupervisor(e.target.value)} />
              <Field label="Trade Description" value={ssTrade} onChange={e => setSsTrade(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {safeStartCards.map((card, ci) => {
                const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(card.date).getDay()]
                return (
                  <div key={ci} className="rounded-lg border p-3" style={{ borderColor: card.hasData ? '#99CC00' : 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
                    <p className="text-xs font-bold mb-2" style={{ color: card.hasData ? '#669900' : 'var(--text-muted)' }}>
                      {dayName} - {fmtUK(card.date)} {card.hasData && '(data found)'}
                    </p>
                    {card.checks.map((item, ii) => (
                      <div key={ii} className="flex items-center justify-between py-0.5">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                        <div className="flex gap-1">
                          {['Y', 'N', 'N/A'].map(v => (
                            <button key={v} onClick={() => {
                              setSafeStartCards(prev => prev.map((c, cIdx) =>
                                cIdx === ci ? { ...c, checks: c.checks.map((ch, chIdx) => chIdx === ii ? { ...ch, value: ch.value === v ? '' : v } : ch) } : c
                              ))
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${item.value === v ? (v === 'Y' ? 'bg-green-100 border-green-400 text-green-700' : v === 'N' ? 'bg-red-100 border-red-400 text-red-700' : 'bg-gray-100 border-gray-400 text-gray-700') : 'border-transparent hover:bg-black/5'}`}
                            style={item.value !== v ? { color: 'var(--text-muted)' } : undefined}
                            >{v}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </SectionCard>

        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──

function SectionCard({ id, title, icon: Icon, children, refs, badge }) {
  return (
    <div ref={el => { if (refs?.current) refs.current[id] = el }} id={`section-${id}`} className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
      <div className="flex items-center gap-2.5 px-4 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <Icon size={16} style={{ color: '#1560AA' }} />
        <h3 className="text-sm font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        {badge && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#1560AA]/10 text-[#1560AA]">{badge}</span>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Field({ label, value, onChange, readOnly, ...props }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <input value={value} onChange={onChange} readOnly={readOnly} className={`w-full px-3 py-2 rounded-lg border text-sm ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`} style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} {...props} />
    </div>
  )
}

function CertTd({ date }) {
  const c = certCell(date)
  return <td className={`px-2 py-1.5 text-xs ${c.cls}`}>{c.text}</td>
}

function DataTable({ headers, rows, emptyText }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h} className="px-2 py-2 text-left font-semibold border-b" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? rows.map((row, i) => (
            <tr key={i} className="border-b" style={{ borderColor: 'var(--border-color)' }}>
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1.5" style={{ color: 'var(--text-primary)' }}>{cell}</td>
              ))}
            </tr>
          )) : (
            <tr><td colSpan={headers.length} className="px-2 py-4 text-center" style={{ color: 'var(--text-muted)' }}>{emptyText}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function InspectionChecklist({ items, onToggle }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
      {items.map((item, i) => (
        <div key={i} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <span className="text-xs" style={{ color: 'var(--text-primary)' }}>{item.label}</span>
          <div className="flex gap-1 shrink-0">
            {['Y', 'N', 'N/A'].map(v => (
              <button key={v} onClick={() => onToggle(i, item.value === v ? '' : v)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  item.value === v
                    ? v === 'Y' ? 'bg-green-100 border-green-400 text-green-700'
                    : v === 'N' ? 'bg-red-100 border-red-400 text-red-700'
                    : 'bg-gray-200 border-gray-400 text-gray-700'
                    : 'border-transparent'
                }`}
                style={item.value !== v ? { color: 'var(--text-muted)' } : undefined}
              >{v}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
