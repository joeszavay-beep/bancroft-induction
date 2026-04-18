import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import { getSession } from '../lib/storage'
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import {
  FileText, Download, Save, Plus, Trash2, ChevronRight, ChevronDown,
  Loader2, Settings, BookOpen, Users, Wrench, ClipboardList, Shield,
  Leaf, HardHat, FileCheck, Calendar, AlertTriangle, Check, X,
  RefreshCw
} from 'lucide-react'

// ── Constants ──
const BLUE = [21, 96, 170] // #1560AA
const GRAY = [213, 216, 220]
const LGRAY = [230, 230, 230]
const GRN = [153, 204, 0]

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

      // Toolbox Talks
      const talks = (talksRes.data || []).map(t => ({
        date: fmtUK(t.created_at),
        topic: t.topic || t.title || '',
        attendees: (t.toolbox_signatures || []).length,
        notes: t.notes || '',
        fromDb: true,
      }))
      setToolboxTalks(talks)

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

      // Attendance -> Labour Return
      const attendance = attendanceRes.data || []
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
        const items = inspections[0].results || inspections[0].items || []
        if (Array.isArray(items)) {
          // Try to match inspection items to PM checklist
          const newPm = PM_ITEMS.map(label => {
            const match = items.find(it => (it.label || '').toLowerCase().includes(label.toLowerCase()))
            return { label, value: match?.result || match?.value || '' }
          })
          setPmChecks(newPm)
        }
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
      const W = 210, H = 297, M = 15, CW = W - M * 2
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

      // Logo helper
      let logoLoaded = false
      let logoImg = null
      if (company?.logo_url) {
        try {
          logoImg = new Image()
          logoImg.crossOrigin = 'anonymous'
          logoImg.src = company.logo_url
          await new Promise((resolve, reject) => {
            logoImg.onload = resolve
            logoImg.onerror = reject
            setTimeout(reject, 3000)
          })
          logoLoaded = true
        } catch { logoLoaded = false }
      }

      function addLogo(x, y, w) {
        const h = w * 0.243
        if (logoLoaded && logoImg) {
          try {
            doc.addImage(logoImg, 'PNG', x, y, w, h)
          } catch {
            drawFallbackLogo(x, y, w, h)
          }
        } else {
          drawFallbackLogo(x, y, w, h)
        }
        return h
      }

      function drawFallbackLogo(x, y, w, h) {
        doc.setFillColor(...BLUE)
        doc.rect(x, y, w, h, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text(g.co.toUpperCase(), x + w / 2, y + h * 0.7, { align: 'center' })
        doc.setTextColor(0, 0, 0)
      }

      function blueLine(y) {
        doc.setDrawColor(...BLUE)
        doc.setLineWidth(0.8)
        doc.line(M, y, W - M, y)
      }

      function refCode(txt) {
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(80, 80, 80)
        doc.text(txt, W - M, H - 10, { align: 'right' })
        doc.setTextColor(0, 0, 0)
      }

      function pageFooter(pageNum) {
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(120, 120, 120)
        doc.text(`Page ${pageNum}`, W / 2, H - 8, { align: 'center' })
        doc.text(RC, W - M, H - 8, { align: 'right' })
        doc.text(g.co, M, H - 8)
        doc.setTextColor(0, 0, 0)
      }

      function infoBox(y, proj, addr, iNum, date) {
        doc.setDrawColor(180, 180, 180)
        doc.setLineWidth(0.3)
        doc.rect(M, y, CW, 8)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.text('Project:', M + 2, y + 5.5)
        doc.setFont('helvetica', 'normal')
        doc.text(proj, M + 22, y + 5.5)
        doc.setFont('helvetica', 'bold')
        doc.text('Inspection No:', M + CW - 58, y + 5.5)
        doc.setFont('helvetica', 'normal')
        doc.text(iNum, M + CW - 28, y + 5.5)
        const y2 = y + 8
        doc.rect(M, y2, CW, 8)
        doc.setFont('helvetica', 'bold')
        doc.text('Address:', M + 2, y2 + 5.5)
        doc.setFont('helvetica', 'normal')
        doc.text(addr, M + 22, y2 + 5.5)
        doc.setFont('helvetica', 'bold')
        doc.text('Date:', M + CW - 58, y2 + 5.5)
        doc.setFont('helvetica', 'normal')
        doc.text(date, M + CW - 28, y2 + 5.5)
        return y2 + 12
      }

      function checkTable(y, items) {
        const half = Math.ceil(items.length / 2)
        doc.setLineWidth(0.2)
        doc.setDrawColor(180, 180, 180)
        doc.setFontSize(8.5)
        for (let i = 0; i < half; i++) {
          const yi = y + i * 7
          doc.rect(M, yi, 8, 7)
          doc.rect(M + 8, yi, 72, 7)
          doc.rect(M + 80, yi, 12, 7)
          doc.setFont('helvetica', 'bold')
          doc.text(String(i + 1), M + 4, yi + 5, { align: 'center' })
          doc.setFont('helvetica', 'normal')
          doc.text(items[i]?.label || '', M + 10, yi + 5)
          if (items[i]?.value === 'Y') {
            doc.setFont('helvetica', 'bold')
            doc.text('\u2713', M + 86, yi + 5, { align: 'center' })
          } else if (items[i]?.value === 'N') {
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(200, 0, 0)
            doc.text('\u2717', M + 86, yi + 5, { align: 'center' })
            doc.setTextColor(0, 0, 0)
          }
          const ri = i + half
          if (ri < items.length && items[ri]) {
            doc.rect(M + 95, yi, 8, 7)
            doc.rect(M + 103, yi, 72, 7)
            doc.rect(M + 175, yi, 12, 7)
            doc.setFont('helvetica', 'bold')
            doc.text(String(ri + 1), M + 99, yi + 5, { align: 'center' })
            doc.setFont('helvetica', 'normal')
            doc.text(items[ri]?.label || '', M + 105, yi + 5)
            if (items[ri]?.value === 'Y') {
              doc.setFont('helvetica', 'bold')
              doc.text('\u2713', M + 181, yi + 5, { align: 'center' })
            } else if (items[ri]?.value === 'N') {
              doc.setFont('helvetica', 'bold')
              doc.setTextColor(200, 0, 0)
              doc.text('\u2717', M + 181, yi + 5, { align: 'center' })
              doc.setTextColor(0, 0, 0)
            }
          }
        }
        return y + half * 7 + 4
      }

      function commentsBox(y, com, inspBy) {
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.text('If any area is inspected that is not listed above include in the comments section below.', M, y)
        y += 6
        doc.setDrawColor(180, 180, 180)
        doc.setLineWidth(0.3)
        doc.setFillColor(...LGRAY)
        doc.rect(M, y, CW, 6, 'FD')
        doc.setFontSize(8.5)
        doc.setFont('helvetica', 'bold')
        doc.text('Comments', M + 2, y + 4)
        y += 8
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        const lines = doc.splitTextToSize(com || 'No comments.', CW - 4)
        doc.rect(M, y - 2, CW, Math.max(lines.length * 5 + 6, 30))
        doc.text(lines, M + 2, y + 2)
        y += Math.max(lines.length * 5 + 8, 32)
        doc.setLineWidth(0.3)
        doc.setDrawColor(180, 180, 180)
        doc.rect(M, y, 20, 8)
        doc.rect(M + 20, y, 55, 8)
        doc.rect(M + 85, y, 18, 8)
        doc.rect(M + 103, y, 55, 8)
        doc.setFillColor(...LGRAY)
        doc.rect(M, y, 20, 8, 'FD')
        doc.rect(M + 85, y, 18, 8, 'FD')
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.text('Inspected by:', M + 2, y + 5.5)
        doc.text('Signed:', M + 87, y + 5.5)
        doc.setFont('helvetica', 'normal')
        doc.text(inspBy || '', M + 22, y + 5.5)
        doc.setFont('helvetica', 'italic')
        doc.text(inspBy ? inspBy.split(' ').map((n, i) => i === 0 ? n[0] + '.' : n).join(' ') : '', M + 105, y + 5.5)
        return y + 12
      }

      let pageNum = 1

      // ===== PAGE 1: COVER =====
      let lh = addLogo(M, M, 50)
      let y = M + lh + 18
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text((g.pn || 'PROJECT').toUpperCase() + ' WEEKLY HEALTH & SAFETY REPORT', W / 2, y, { align: 'center' })
      doc.setLineWidth(0.5)
      doc.setDrawColor(0, 0, 0)
      doc.line(M + 10, y + 2, W - M - 10, y + 2)
      y += 18
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bolditalic')
      doc.text('Report Number: ', M, y)
      doc.setFont('helvetica', 'bold')
      doc.text(RC, 52, y)
      y += 8
      doc.setFont('helvetica', 'bolditalic')
      doc.text('Weekending: ', M, y)
      doc.setFont('helvetica', 'bold')
      doc.text(g.we, 52, y)
      y += 8
      doc.setFont('helvetica', 'bolditalic')
      doc.text('Issued By:  ', M, y)
      doc.setFont('helvetica', 'bold')
      doc.text(g.ib, 52, y)
      doc.setFont('helvetica', 'normal')
      doc.text(' (' + g.role + ')', 52 + doc.getTextWidth(g.ib), y)
      y += 8
      doc.setFont('helvetica', 'bolditalic')
      doc.text('Signature: ', M, y)
      doc.setFont('helvetica', 'italic')
      doc.text(g.ib ? g.ib.split(' ').map((n, i) => i === 0 ? n[0] + '.' : n).join(' ') : '', 52, y)
      y += 18
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text('Please see attached the ' + g.co + ' weekly Health & Safety Report the contents of this report', M, y)
      y += 5
      doc.text('is as follows:', M, y)
      y += 10
      const tocItems = ['Toolbox Talks', 'Operative Safety Report', 'Environmental Inspection', 'Plant & Equipment Inspections', 'Training Matrix', 'RAMS Matrix', 'Induction Summary', 'Project Manager Weekly Inspection']
      tocItems.forEach(t => {
        doc.circle(M + 3, y - 1, 0.8, 'F')
        doc.text(t, M + 8, y)
        y += 6
      })
      y += 12
      doc.text('Kind Regards,', M, y)
      y += 6
      doc.text('The ' + g.co + ' Project Team.', M, y)
      pageFooter(pageNum)

      // ===== PAGE 2: TOOLBOX TALKS =====
      doc.addPage()
      pageNum++
      lh = addLogo(M, M, 50)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text('Tool Box Talk Register', M + 55, M + lh / 2 + 2)
      blueLine(M + lh + 4)
      y = M + lh + 10
      const tbtBody = allTalks.map((t, i) => [String(i + 1), t.topic, String(t.attendees || ''), t.notes])
      if (tbtBody.length === 0) tbtBody.push(['1', 'No talks recorded this week', '', ''])
      doc.autoTable({
        startY: y,
        head: [['TBT No', 'Description', 'Attendees', 'Notes']],
        body: tbtBody,
        margin: { left: M + 5, right: M + 5 },
        headStyles: { fillColor: GRAY, textColor: [0, 0, 0], fontSize: 8.5, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 8.5 },
        columnStyles: { 0: { cellWidth: 20, halign: 'center' }, 2: { cellWidth: 22, halign: 'center' } },
        styles: { cellPadding: 3, lineColor: [180, 180, 180], lineWidth: 0.2 },
        theme: 'grid',
      })
      refCode(coAbbr + '344_Rev(B)_Tool_Box_Talk_Register')
      pageFooter(pageNum)

      // ===== PAGE 3: TRAINING MATRIX =====
      doc.addPage('l')
      pageNum++
      lh = addLogo(M, M, 50)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text('Induction & Training Summary', M + 55, M + 4)
      doc.setFontSize(10)
      doc.text(g.pn + ' - ' + g.pa, 148, M + lh + 4, { align: 'center' })
      y = M + lh + 10
      const trBody = allOperatives.filter(o => !supervisors.includes(o)).map((o, i) => [
        String(i + 1), o.name || '', o.employer || '', o.role || '',
        fmtUK(o.card_expiry), fmtUK(o.ipaf_expiry), fmtUK(o.pasma_expiry),
        fmtUK(o.sssts_expiry), fmtUK(o.smsts_expiry), fmtUK(o.first_aid_expiry),
        o.ap_number || o.cscs_number || '',
      ])
      manualTraining.forEach((t, i) => {
        trBody.push([String(trBody.length + 1), t.name, t.company, t.role, t.cscs, t.ipaf, t.pasma, t.sssts, t.smsts, t.firstAid, t.apNumber])
      })
      if (trBody.length === 0) trBody.push(['1', 'No operatives recorded', '', '', '', '', '', '', '', '', ''])
      doc.autoTable({
        startY: y,
        head: [['No', 'Name', 'Company', 'Role', 'CSCS Expiry', 'IPAF Expiry', 'PASMA Expiry', 'SSSTS Expiry', 'SMSTS Expiry', 'First Aid Expiry', 'AP Number']],
        body: trBody,
        margin: { left: M, right: M },
        headStyles: { fillColor: GRAY, textColor: [0, 0, 0], fontSize: 6, fontStyle: 'bold', halign: 'center', cellPadding: 1.5 },
        bodyStyles: { fontSize: 6.5, halign: 'center', cellPadding: 1.5 },
        columnStyles: { 0: { cellWidth: 8 }, 1: { halign: 'left', cellWidth: 28 }, 2: { cellWidth: 18 }, 3: { cellWidth: 18 } },
        styles: { lineColor: [180, 180, 180], lineWidth: 0.2 },
        theme: 'grid',
        didParseCell: function (data) {
          if (data.section === 'body' && data.column.index >= 4 && data.column.index <= 9) {
            const val = data.cell.raw
            if (val && isExpired(val.split('/').reverse().join('-'))) {
              data.cell.styles.textColor = [220, 0, 0]
              data.cell.styles.fontStyle = 'bold'
            } else if (val && isExpiringSoon(val.split('/').reverse().join('-'))) {
              data.cell.styles.textColor = [200, 150, 0]
            }
          }
        },
      })
      refCode(coAbbr + '334_Rev(B)_Site_Training_Matrix')
      pageFooter(pageNum)

      // ===== PAGE 4: MANAGEMENT TRAINING =====
      doc.addPage('l')
      pageNum++
      lh = addLogo(M, M, 45)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text('Management Training Matrix', 148, M + 6, { align: 'center' })
      y = M + lh + 6
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text('Site:  ', M, y)
      doc.setFont('helvetica', 'normal')
      doc.text(g.pn, M + 10, y)
      y += 6
      const mgBody = supervisors.map((o, i) => [
        String(i + 1), o.name || '', o.employer || '', o.role || '',
        fmtUK(o.card_expiry), fmtUK(o.sssts_expiry), fmtUK(o.smsts_expiry),
        fmtUK(o.first_aid_expiry), '', fmtUK(o.pasma_expiry), fmtUK(o.ipaf_expiry), '', '',
      ])
      if (mgBody.length === 0) mgBody.push(['1', 'No management staff recorded', '', '', '', '', '', '', '', '', '', '', ''])
      doc.autoTable({
        startY: y,
        head: [['No', 'Name', 'Company', 'Position', 'CSCS/JIB', 'SSSTS', 'SMSTS', 'First Aider\n(3 day)', 'First Aider\n(1 day)', 'PASMA', 'IPAF', 'PAV', 'Other']],
        body: mgBody,
        margin: { left: M, right: M },
        headStyles: { fillColor: GRAY, textColor: [0, 0, 0], fontSize: 6.5, fontStyle: 'bold', halign: 'center', cellPadding: 1.5 },
        bodyStyles: { fontSize: 7, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 25 }, 2: { cellWidth: 16 }, 3: { cellWidth: 28 } },
        styles: { lineColor: [180, 180, 180], lineWidth: 0.2 },
        theme: 'grid',
      })
      pageFooter(pageNum)

      // ===== PAGE 5: EQUIPMENT REGISTER =====
      doc.addPage('l')
      pageNum++
      lh = addLogo(M, M, 50)
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bolditalic')
      doc.text('Weekly Work Equipment Inspection Report', W - M - 60, M + 6, { align: 'center' })
      blueLine(M + lh + 4)
      y = M + lh + 8
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'bold')
      doc.setDrawColor(180, 180, 180)
      doc.setLineWidth(0.3)
      doc.rect(M, y, 155, 8)
      doc.rect(M + 155, y, 18, 8)
      doc.rect(M + 173, y, W - 2 * M - 173, 8)
      doc.setFillColor(...LGRAY)
      doc.rect(M, y, 20, 8, 'FD')
      doc.rect(M + 155, y, 18, 8, 'FD')
      doc.text('Project / Site:', M + 2, y + 5.5)
      doc.setFont('helvetica', 'normal')
      doc.text(g.pn + ' \u2013 ' + g.pf, M + 26, y + 5.5)
      doc.setFont('helvetica', 'bold')
      doc.text('Company:', M + 157, y + 5.5)
      doc.setTextColor(255, 0, 0)
      doc.text(g.co, M + 175, y + 5.5)
      doc.setTextColor(0, 0, 0)
      y += 12
      const eqBody = equipmentRows.map(r => [r.ref || '', r.description || '', r.patExpiry || '', r.comments || '', r.certExpiry || '', r.defects || '', r.safe || '', r.inspectedBy || '', g.we])
      if (eqBody.length === 0) eqBody.push(['1', 'No equipment recorded', '', '', '', '', '', '', g.we])
      doc.autoTable({
        startY: y,
        head: [['Ref No', 'Description', 'PAT test\nexpiry', g.co + '\nComments', 'Cert\nexpiry', 'Defects', 'Safe to\nuse?', 'Inspected by', 'Date']],
        body: eqBody,
        margin: { left: M, right: M },
        headStyles: { fillColor: GRAY, textColor: [0, 0, 0], fontSize: 7, fontStyle: 'bold', halign: 'center', cellPadding: 2 },
        bodyStyles: { fontSize: 7.5, halign: 'center', cellPadding: 2.5 },
        columnStyles: { 0: { cellWidth: 18 }, 1: { halign: 'left', cellWidth: 30 } },
        styles: { lineColor: [180, 180, 180], lineWidth: 0.2 },
        theme: 'grid',
      })
      pageFooter(pageNum)

      // ===== PAGE 6: PM INSPECTION =====
      doc.addPage('p')
      pageNum++
      lh = addLogo(M, M, 50)
      doc.setFontSize(15)
      doc.setFont('helvetica', 'bolditalic')
      doc.text('Project Manager', W - M, M + 4, { align: 'right' })
      doc.setFontSize(10)
      doc.text('Health & Safety Inspection Report', W - M, M + 10, { align: 'right' })
      blueLine(M + lh + 4)
      y = infoBox(M + lh + 8, g.pn, g.pa, g.rn, g.we)
      doc.setFillColor(...GRAY)
      doc.rect(M, y + 4, CW, 7, 'F')
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text('TICK BOX IF INSPECTED', W / 2, y + 9, { align: 'center' })
      y = checkTable(y + 14, pmChecks)
      y = commentsBox(y + 2, pmComments, pmInspector)
      refCode(coAbbr + '314_Rev(B)_Project_Manager_Health_&_Safety_Inspection_Report')
      pageFooter(pageNum)

      // ===== PAGE 7: ENVIRONMENTAL =====
      doc.addPage('p')
      pageNum++
      lh = addLogo(M, M, 50)
      doc.setFontSize(15)
      doc.setFont('helvetica', 'bolditalic')
      doc.text('Environmental Inspection', W - M, M + 4, { align: 'right' })
      doc.setFontSize(13)
      doc.text('Report', W - M, M + 10, { align: 'right' })
      blueLine(M + lh + 4)
      y = infoBox(M + lh + 8, g.pn, g.pf, g.rn, g.we)
      doc.setFillColor(...GRAY)
      doc.rect(M, y + 4, CW, 7, 'F')
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text('TICK BOX IF INSPECTED', W / 2, y + 9, { align: 'center' })
      y = checkTable(y + 14, envChecks)
      y = commentsBox(y + 2, envComments, envInspector)
      refCode(coAbbr + '324_Rev(B)_Environmental_Inspection_Report')
      pageFooter(pageNum)

      // ===== PAGE 8: OPERATIVE INSPECTION =====
      doc.addPage('p')
      pageNum++
      lh = addLogo(M, M, 50)
      doc.setFontSize(15)
      doc.setFont('helvetica', 'bolditalic')
      doc.text('Operative/Safety Rep', W - M, M + 4, { align: 'right' })
      doc.setFontSize(10)
      doc.text('Health & Safety Inspection Report', W - M, M + 10, { align: 'right' })
      blueLine(M + lh + 4)
      y = infoBox(M + lh + 8, g.pn, g.pf, g.rn, g.we)
      doc.setFillColor(...GRAY)
      doc.rect(M, y + 4, CW, 7, 'F')
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text('TICK BOX IF INSPECTED', W / 2, y + 9, { align: 'center' })
      y = checkTable(y + 14, opChecks)
      y = commentsBox(y + 2, opComments, opInspector)
      refCode(coAbbr + '326_Rev(B)_Operative_Safety_Rep_Inspection_Report')
      pageFooter(pageNum)

      // ===== PAGE 9: RAMS MATRIX =====
      doc.addPage('p')
      pageNum++
      lh = addLogo(M, M, 50)
      doc.setFontSize(15)
      doc.setFont('helvetica', 'bolditalic')
      doc.setTextColor(255, 0, 0)
      doc.text('RAMS Matrix', W - M, M + 8, { align: 'right' })
      doc.setTextColor(0, 0, 0)
      y = M + lh + 8
      doc.setFontSize(8.5)
      doc.setDrawColor(180, 180, 180)
      doc.setLineWidth(0.3)
      doc.rect(M, y, 100, 7)
      doc.rect(M + 105, y, 15, 7)
      doc.rect(M + 120, y, 60, 7)
      doc.setFont('helvetica', 'bold')
      doc.text('Client:', M + 2, y + 5)
      doc.setFont('helvetica', 'normal')
      doc.text(g.cl, M + 16, y + 5)
      doc.setFont('helvetica', 'bold')
      doc.text('Job ref:', M + 107, y + 5)
      doc.setTextColor(255, 0, 0)
      doc.text(g.jr, M + 122, y + 5)
      doc.setTextColor(0, 0, 0)
      y += 8
      doc.rect(M, y, 100, 7)
      doc.rect(M + 105, y, 15, 7)
      doc.rect(M + 120, y, 60, 7)
      doc.setFont('helvetica', 'bold')
      doc.text('Project:', M + 2, y + 5)
      doc.setFont('helvetica', 'normal')
      doc.text(g.pn + ' \u2013 ' + g.pf, M + 18, y + 5)
      doc.setFont('helvetica', 'bold')
      doc.text('Issue date:', M + 107, y + 5)
      doc.setTextColor(255, 0, 0)
      doc.text(g.we, M + 127, y + 5)
      doc.setTextColor(0, 0, 0)
      y += 12
      const raBody = ramsRows.map(r => [String(r.num), r.title, '', r.issuedBy, '', '', r.approvedBy || ''])
      if (raBody.length === 0) raBody.push(['1', 'No RAMS recorded', '', '', '', '', ''])
      doc.autoTable({
        startY: y,
        head: [['Doc No', 'RAMS title', 'Submitted\nto', 'Submitted\nby', 'Forecast issue\ndate', 'Date\nsubmitted', 'Date returned\n& Status']],
        body: raBody,
        margin: { left: M, right: M },
        headStyles: { fillColor: GRAY, textColor: [0, 0, 0], fontSize: 7, fontStyle: 'bold', halign: 'center', cellPadding: 2 },
        bodyStyles: { fontSize: 7, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 55 } },
        styles: { lineColor: [180, 180, 180], lineWidth: 0.2 },
        theme: 'grid',
      })
      pageFooter(pageNum)

      // ===== PAGE 10: LABOUR RETURN =====
      doc.addPage('p')
      pageNum++
      lh = addLogo(M, M, 50)
      doc.setFontSize(15)
      doc.setFont('helvetica', 'bolditalic')
      doc.text('Weekly Labour Return', M + 55, M + lh / 2 + 2)
      y = M + lh + 8
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.text('This document must be completed on a weekly basis for all operatives on site including ' + g.co + ' Management,', M, y)
      y += 3.5
      doc.text('Operatives and Sub-Contractors and forwarded to the respective H&S Advisor by the end of each Monday for the previous week.', M, y)
      y += 8
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('Project: ', M + 30, y)
      doc.setFont('helvetica', 'normal')
      doc.text(g.pn, M + 50, y)
      y += 7
      doc.setFont('helvetica', 'bold')
      doc.text('Week commencing: ', M + 30, y)
      doc.setFont('helvetica', 'normal')
      doc.text(g.wc, M + 65, y)
      y += 8
      const laBody = labourRows.map(r => {
        const total = r.days.reduce((a, b) => a + b, 0)
        return [r.trade || r.company || '', ...r.days.map(String), String(total)]
      })
      if (laBody.length === 0) laBody.push(['No trades', '0', '0', '0', '0', '0', '0', '0', '0'])
      doc.autoTable({
        startY: y,
        head: [['TRADE', 'Mon', 'Tue', 'Wed', 'Thur', 'Fri', 'Sat', 'Sun', 'TOTAL']],
        body: laBody,
        margin: { left: M, right: M },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontSize: 9, fontStyle: 'bold', halign: 'center', cellPadding: 3 },
        bodyStyles: { fontSize: 9, halign: 'center', cellPadding: 3 },
        columnStyles: { 0: { halign: 'left', fontStyle: 'bold' }, 8: { fontStyle: 'bold' } },
        styles: { lineColor: [180, 180, 180], lineWidth: 0.3 },
        theme: 'grid',
      })
      y = doc.lastAutoTable.finalY + 8
      doc.setDrawColor(180, 180, 180)
      doc.setLineWidth(0.3)
      doc.rect(M, y, 35, 10)
      doc.rect(M + 35, y, 45, 10)
      doc.rect(M + 95, y, 30, 10)
      doc.rect(M + 125, y, 15, 10)
      doc.setFillColor(...LGRAY)
      doc.rect(M, y, 35, 10, 'FD')
      doc.rect(M + 95, y, 30, 10, 'FD')
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('Completed by:', M + 2, y + 7)
      doc.text('WEEKLY TOTAL:', M + 97, y + 7)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'normal')
      doc.text(labourCompletedBy, M + 37, y + 7)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(String(labourTotal), M + 127, y + 7)
      refCode(coAbbr + '322_Rev(B)_Weekly_Labour_Return')
      pageFooter(pageNum)

      // ===== SAFE START CARDS =====
      safeStartCards.forEach(card => {
        doc.addPage('p')
        pageNum++
        const L = M, T = M, TW = CW
        const RX = L + TW

        // Header
        doc.setFillColor(...GRN)
        doc.rect(L, T, TW, 14, 'F')
        doc.setFontSize(22)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(255, 255, 255)
        doc.text('SAFE START RECORD', L + TW / 2, T + 10, { align: 'center' })
        doc.setTextColor(0, 0, 0)
        doc.setDrawColor(0, 0, 0)
        doc.setLineWidth(1)
        doc.rect(L, T, TW, 14)

        // Company row
        let ry = T + 14
        doc.setLineWidth(0.5)
        doc.rect(L, ry, TW, 9)
        doc.setFontSize(11)
        doc.setFont('helvetica', 'normal')
        doc.text('Company Name: ' + ssCompany, L + 4, ry + 6.5)

        // Supervisor row
        ry += 9
        doc.rect(L, ry, TW / 2, 8)
        doc.rect(L + TW / 2, ry, TW / 2, 8)
        doc.setFontSize(9)
        doc.text('Supervisor: ' + ssSupervisor, L + 4, ry + 5.5)
        doc.text('Date: ' + fmtUK(card.date), L + TW / 2 + 4, ry + 5.5)

        // Trade row
        ry += 8
        doc.rect(L, ry, TW, 8)
        doc.text('Trade Description: ' + ssTrade, L + 4, ry + 5.5)

        // Checklist
        ry += 12
        card.checks.forEach((item, i) => {
          doc.setDrawColor(150, 150, 150)
          doc.setLineWidth(0.3)
          doc.rect(L, ry, TW - 30, 7)
          doc.rect(L + TW - 30, ry, 10, 7)
          doc.rect(L + TW - 20, ry, 10, 7)
          doc.rect(L + TW - 10, ry, 10, 7)
          doc.setFontSize(8)
          doc.setFont('helvetica', 'normal')
          doc.text(item.label, L + 2, ry + 5)
          doc.setFontSize(6)
          doc.setTextColor(120, 120, 120)
          doc.text('Y', L + TW - 25, ry + 5, { align: 'center' })
          doc.text('N', L + TW - 15, ry + 5, { align: 'center' })
          doc.text('N/A', L + TW - 5, ry + 5, { align: 'center' })
          doc.setTextColor(0, 0, 0)
          if (item.value === 'Y') {
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(10)
            doc.text('\u2713', L + TW - 25, ry + 5.5, { align: 'center' })
          } else if (item.value === 'N') {
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(10)
            doc.text('\u2717', L + TW - 15, ry + 5.5, { align: 'center' })
          }
          ry += 7
        })

        pageFooter(pageNum)
      })

      // Save
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
