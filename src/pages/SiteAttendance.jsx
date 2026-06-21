import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { startOfDayUK, todayDateStr, formatDate, formatTime, formatDuration } from '../lib/dates'
import { useCompany } from '../lib/CompanyContext'
import { useProject } from '../lib/ProjectContext'
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import { QRCodeSVG } from 'qrcode.react'
import {
  Users, Clock, LogIn, LogOut, Search, Download, Printer, Shield,
  MapPin, Calendar, AlertTriangle, QrCode, ChevronDown,
  ChevronRight, X, Check, UserX, SunMedium
} from 'lucide-react'




function getTodayStart() {
  return startOfDayUK()
}

export default function SiteAttendance() {
  const { user, company } = useCompany()
  const { projectId } = useProject()
  const cid = user?.company_id

  const [projects, setProjects] = useState([])
  const [operatives, setOperatives] = useState([])
  const [todayRecords, setTodayRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Fire muster
  const [showMuster, setShowMuster] = useState(false)
  const [musterChecked, setMusterChecked] = useState({})

  // History — default to last 30 days
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyFrom, setHistoryFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0] })
  const [historyTo, setHistoryTo] = useState(() => new Date().toISOString().split('T')[0])
  const [historyRecords, setHistoryRecords] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Manual sign-out
  const [manualSignOut, setManualSignOut] = useState(null) // { operative_id, operative_name, project_id, sign_in_time }
  const [manualTime, setManualTime] = useState('')
  const [manualSaving, setManualSaving] = useState(false)

  // Weekly register
  const [registerOpen, setRegisterOpen] = useState(false)
  const [registerOffset, setRegisterOffset] = useState(0)
  const [registerRecords, setRegisterRecords] = useState([])
  const [loadingRegister, setLoadingRegister] = useState(false)

  // QR
  const [qrProject, setQrProject] = useState(null)
  const qrRef = useRef(null)

  async function loadHistoryAuto() {
    const fromDate = new Date(); fromDate.setDate(fromDate.getDate() - 30)
    const toDate = new Date(); toDate.setHours(23, 59, 59)
    const { data } = await supabase.from('site_attendance').select('*')
      .eq('company_id', cid)
      .gte('recorded_at', fromDate)
      .lte('recorded_at', toDate)
      .order('recorded_at', { ascending: false })
    setHistoryRecords(data || [])
  }

  async function loadData() {
    setLoading(true)
    const todayStart = getTodayStart()
    const [p, o, a] = await Promise.all([
      supabase.from('projects').select('id, name').eq('company_id', cid),
      supabase.from('operatives').select('id, name, role, photo_url').eq('company_id', cid).is('left_at', null),
      supabase.from('site_attendance').select('*').eq('company_id', cid)
        .gte('recorded_at', todayStart)
        .order('recorded_at', { ascending: false }),
    ])

    // Also load cross-company operatives linked to our projects
    const projectIds = (p.data || []).map(pr => pr.id)
    let allOps = [...(o.data || [])]
    if (projectIds.length > 0) {
      const { data: linked } = await supabase
        .from('operative_projects')
        .select('operatives(id, name, role, photo_url)')
        .in('project_id', projectIds)
      const existingIds = new Set(allOps.map(op => op.id))
      for (const row of (linked || [])) {
        if (row.operatives && !existingIds.has(row.operatives.id)) {
          allOps.push(row.operatives)
          existingIds.add(row.operatives.id)
        }
      }
    }

    setProjects(p.data || [])
    setOperatives(allOps)
    setTodayRecords(a.data || [])
    setLoading(false)
  }

  async function handleManualSignOut() {
    if (!manualSignOut || !manualTime) return
    setManualSaving(true)
    // Use the sign-in date for the sign-out (handles past-day corrections from weekly register)
    const signInDate = manualSignOut.sign_in_time ? new Date(manualSignOut.sign_in_time).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
    const timeParts = manualTime.split(':')
    const recorded_at = new Date(`${signInDate}T${timeParts[0]}:${timeParts[1]}:00`).toISOString()
    let error
    if (manualSignOut.correct_record_id) {
      // Correcting an existing auto sign-out — UPDATE the record
      const result = await supabase.from('site_attendance')
        .update({ recorded_at, notes: `Corrected sign-out — ${manualTime}`, method: 'manual' })
        .eq('id', manualSignOut.correct_record_id)
      error = result.error
    } else {
      // New manual sign-out — INSERT
      const result = await supabase.from('site_attendance').insert({
        company_id: manualSignOut.company_id || cid,
        project_id: manualSignOut.project_id,
        operative_id: manualSignOut.operative_id,
        operative_name: manualSignOut.operative_name,
        type: 'sign_out',
        method: 'manual',
        recorded_at,
        notes: `Manual sign-out by manager — ${manualTime}`,
      })
      error = result.error
    }
    setManualSaving(false)
    if (error) {
      toast.error('Failed to record sign-out')
    } else {
      toast.success(`${manualSignOut.operative_name} signed out at ${manualTime}`)
      setManualSignOut(null)
      setManualTime('')
      loadData()
      if (registerOpen) loadRegister()
    }
  }

  function getRegisterWeekDates(offset = 0) {
    const now = new Date()
    const day = now.getDay()
    const mondayOff = day === 0 ? -6 : 1 - day
    const monday = new Date(now)
    monday.setDate(now.getDate() + mondayOff + offset * 7)
    monday.setHours(12, 0, 0, 0) // noon to avoid DST edge
    const days = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      days.push(d)
    }
    return days
  }

  const [registerHolidays, setRegisterHolidays] = useState([])

  async function loadRegister() {
    setLoadingRegister(true)
    const days = getRegisterWeekDates(registerOffset)
    const from = days[0].toISOString()
    const fromDate = days[0].toISOString().split('T')[0]
    const toDate = days[6].toISOString().split('T')[0]
    const to = new Date(days[6].getTime() + 86400000 - 1).toISOString()
    let q = supabase.from('site_attendance').select('*').eq('company_id', cid)
      .gte('recorded_at', from).lte('recorded_at', to).order('recorded_at')
    if (projectId) q = q.eq('project_id', projectId)

    // Also fetch approved holidays overlapping this week
    const holQ = supabase.from('holiday_requests').select('operative_id, start_date, end_date, working_days')
      .eq('company_id', cid).eq('status', 'approved')
      .lte('start_date', toDate).gte('end_date', fromDate)

    const [attResult, holResult] = await Promise.all([q, holQ])
    setRegisterRecords(attResult.data || [])
    setRegisterHolidays(holResult.data || [])
    setLoadingRegister(false)
  }

  useEffect(() => {
    if (registerOpen && cid) loadRegister()
  }, [registerOpen, registerOffset, projectId])

  // Helper: check if a date falls within any approved holiday for an operative
  function isOnHoliday(opId, dayStr) {
    return registerHolidays.some(h =>
      h.operative_id === opId && dayStr >= h.start_date && dayStr <= h.end_date
    )
  }

  const registerWeek = useMemo(() => {
    const days = getRegisterWeekDates(registerOffset)
    // Group attendance records by operative
    const byOp = {}
    for (const rec of registerRecords) {
      if (!byOp[rec.operative_id]) byOp[rec.operative_id] = { name: rec.operative_name || 'Unknown', records: [] }
      byOp[rec.operative_id].records.push(rec)
    }
    // Also add operatives who have holidays this week but no attendance
    for (const hol of registerHolidays) {
      if (!byOp[hol.operative_id]) {
        const op = operatives.find(o => o.id === hol.operative_id)
        byOp[hol.operative_id] = { name: op?.name || 'Unknown', records: [] }
      }
    }
    // Build grid rows
    return Object.entries(byOp).map(([opId, { name, records }]) => {
      const dayCells = days.map(day => {
        const dayStr = day.toISOString().split('T')[0]
        const holiday = isOnHoliday(opId, dayStr)
        const dayRecs = records.filter(r => r.recorded_at?.startsWith(dayStr)).sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
        const firstIn = dayRecs.find(r => r.type === 'sign_in')
        const lastOut = [...dayRecs].reverse().find(r => r.type === 'sign_out')
        let hours = null
        let autoSignOut = false
        if (firstIn && lastOut) {
          hours = Math.round((new Date(lastOut.recorded_at) - new Date(firstIn.recorded_at)) / 3600000 * 100) / 100
          // Flag shifts over 12h as likely missed sign-out (auto-signout at 23:59)
          if (hours > 12) {
            autoSignOut = true
            const lastOutRec = [...dayRecs].reverse().find(r => r.type === 'sign_out')
            if (lastOutRec?.method === 'auto') autoSignOut = true
          }
        }
        return { dayStr, firstIn: firstIn?.recorded_at, lastOut: lastOut?.recorded_at, hours, autoSignOut, operative_id: opId, holiday }
      })
      const totalHours = dayCells.reduce((sum, c) => sum + (c.hours || 0), 0)
      return { opId, name, dayCells, totalHours }
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [registerRecords, registerOffset, registerHolidays, operatives])

  useEffect(() => {
    if (cid) { loadData(); loadHistoryAuto() } // eslint-disable-line react-hooks/set-state-in-effect
  }, [cid])

  // Determine who is currently on site
  const onSiteOperatives = useMemo(() => {
    const filtered = !projectId
      ? todayRecords
      : todayRecords.filter(r => r.project_id === projectId)

    // Group by operative, find last record
    const lastByOp = {}
    // Records are already ordered desc by recorded_at
    for (const rec of filtered) {
      if (!lastByOp[rec.operative_id]) {
        lastByOp[rec.operative_id] = rec
      }
    }

    return Object.values(lastByOp)
      .filter(r => r.type === 'sign_in')
      .map(r => {
        const op = operatives.find(o => o.id === r.operative_id)
        return { ...r, operative: op }
      })
  }, [todayRecords, operatives, projectId])

  // Today's activity filtered
  const filteredActivity = useMemo(() => {
    let records = !projectId
      ? todayRecords
      : todayRecords.filter(r => r.project_id === projectId)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      records = records.filter(r => {
        const op = operatives.find(o => o.id === r.operative_id)
        return op?.name?.toLowerCase().includes(term)
      })
    }
    return records
  }, [todayRecords, projectId, searchTerm, operatives])

  // All-time attendance for per-operative summary
  const [allTimeRecords, setAllTimeRecords] = useState([])
  const [loadingAllTime, setLoadingAllTime] = useState(false)

  async function loadAllTimeSummary() {
    if (allTimeRecords.length > 0) return // already loaded
    setLoadingAllTime(true)
    let q = supabase.from('site_attendance').select('operative_id, operative_name, type, recorded_at, notes')
      .eq('company_id', cid)
      .order('recorded_at')
    if (projectId) q = q.eq('project_id', projectId)
    const { data } = await q
    setAllTimeRecords(data || [])
    setLoadingAllTime(false)
  }

  // Load all-time data on mount
  useEffect(() => {
    if (cid) loadAllTimeSummary()
  }, [cid, projectId])

  // Per-operative summary from ALL-TIME data
  const operativeSummary = useMemo(() => {
    if (allTimeRecords.length === 0) return []
    const byOp = {}
    for (const rec of allTimeRecords) {
      if (!byOp[rec.operative_id]) byOp[rec.operative_id] = []
      byOp[rec.operative_id].push(rec)
    }

    return Object.entries(byOp).map(([opId, recs]) => {
      const op = operatives.find(o => o.id === opId)
      const fallbackName = recs[0]?.operative_name
      // Sort ascending for pairing
      const sorted = [...recs].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
      const days = new Set(sorted.map(r => new Date(r.recorded_at).toDateString()))
      let totalMinutes = 0
      let lateArrivals = 0

      // Find first sign-in date
      const firstSignIn = sorted.find(r => r.type === 'sign_in')

      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].type === 'sign_in') {
          const signIn = new Date(sorted[i].recorded_at)
          const hour = signIn.getHours()
          const min = signIn.getMinutes()
          if (hour > 7 || (hour === 7 && min > 40)) lateArrivals++

          // Find next sign_out for this operative
          const nextOut = sorted.slice(i + 1).find(r => r.type === 'sign_out')
          if (nextOut) {
            totalMinutes += (new Date(nextOut.recorded_at) - signIn) / 60000
          }
        }
      }

      const totalHours = Math.round((totalMinutes / 60) * 10) / 10
      const avgHours = days.size > 0 ? Math.round((totalHours / days.size) * 10) / 10 : 0

      return {
        id: opId,
        name: op?.name || fallbackName || 'Unknown',
        daysAttended: days.size,
        totalHours,
        avgHours,
        lateArrivals,
        firstDate: firstSignIn ? new Date(firstSignIn.recorded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
      }
    })
  }, [allTimeRecords, operatives])

  // Sort state for summary
  const [summarySort, setSummarySort] = useState({ col: 'name', asc: true })
  const sortedSummary = useMemo(() => {
    const arr = [...operativeSummary]
    arr.sort((a, b) => {
      const av = a[summarySort.col]
      const bv = b[summarySort.col]
      if (typeof av === 'string') return summarySort.asc ? av.localeCompare(bv) : bv.localeCompare(av)
      return summarySort.asc ? av - bv : bv - av
    })
    return arr
  }, [operativeSummary, summarySort])

  // History with computed durations
  const historyWithDuration = useMemo(() => {
    if (!historyRecords.length) return []
    const byOp = {}
    for (const rec of historyRecords) {
      if (!byOp[rec.operative_id]) byOp[rec.operative_id] = []
      byOp[rec.operative_id].push(rec)
    }
    return historyRecords.map(rec => {
      if (rec.type !== 'sign_in') return { ...rec, duration: null }
      const opRecs = byOp[rec.operative_id] || []
      const sorted = [...opRecs].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
      const idx = sorted.findIndex(r => r.id === rec.id)
      const nextOut = sorted.slice(idx + 1).find(r => r.type === 'sign_out')
      if (!nextOut) return { ...rec, duration: null }
      return { ...rec, duration: (new Date(nextOut.recorded_at) - new Date(rec.recorded_at)) / 60000 }
    })
  }, [historyRecords])

  async function loadHistory() {
    if (!historyFrom || !historyTo) {
      toast.error('Select both from and to dates')
      return
    }
    setLoadingHistory(true)
    const fromDate = startOfDayUK(new Date(historyFrom + 'T12:00:00Z'))
    const toDate = historyTo + 'T23:59:59.999Z'

    const { data, error } = await supabase
      .from('site_attendance')
      .select('*')
      .eq('company_id', cid)
      .gte('recorded_at', fromDate)
      .lte('recorded_at', toDate)
      .order('recorded_at', { ascending: false })

    if (error) {
      toast.error('Failed to load history')
    } else {
      setHistoryRecords(data || [])
      toast.success(`Loaded ${(data || []).length} records`)
    }
    setLoadingHistory(false)
  }

  function exportCSV() {
    const records = historyRecords.length > 0 ? historyWithDuration : filteredActivity
    if (!records.length) {
      toast.error('No records to export')
      return
    }
    const headers = ['Date', 'Time', 'Operative', 'Project', 'Type', 'Duration', 'Method', 'IP', 'GPS']
    const rows = records.map(r => {
      const op = operatives.find(o => o.id === r.operative_id)
      const proj = projects.find(p => p.id === r.project_id)
      return [
        formatDate(r.recorded_at),
        formatTime(r.recorded_at),
        op?.name || r.operative_name || r.operative_id,
        proj?.name || r.project_id || '',
        r.type === 'sign_in' ? 'IN' : 'OUT',
        r.duration ? formatDuration(r.duration) : '',
        r.method || '',
        r.ip_address || '',
        (r.latitude && r.longitude) ? `${r.latitude},${r.longitude}` : '',
      ]
    })
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `site-attendance-${todayDateStr()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported')
  }

  function handleMusterToggle(opId) {
    setMusterChecked(prev => ({ ...prev, [opId]: !prev[opId] }))
  }

  function openMuster() {
    const checked = {}
    onSiteOperatives.forEach(o => { checked[o.operative_id] = false })
    setMusterChecked(checked)
    setShowMuster(true)
  }

  function handleSortSummary(col) {
    setSummarySort(prev => ({
      col,
      asc: prev.col === col ? !prev.asc : true,
    }))
  }

  function getOpName(id, fallback) {
    return operatives.find(o => o.id === id)?.name || fallback || 'Unknown'
  }

  function getProjectName(id) {
    return projects.find(p => p.id === id)?.name || ''
  }

  function printQR() {
    const content = qrRef.current
    if (!content) return
    const primaryColour = company?.primary_colour || '#1B6FC8'
    const win = window.open('', '_blank')
    win.document.write(`
      <html><head><title>QR Sign-In — ${qrProject?.name || 'Site'}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: A4 portrait; margin: 0; }
        body { width: 210mm; height: 297mm; font-family: -apple-system, 'Segoe UI', Arial, sans-serif; background: white; }
        .poster { width: 100%; height: 100%; display: flex; flex-direction: column; }
        .header { background: ${primaryColour}; padding: 28mm 20mm 22mm; text-align: center; }
        .header img { max-height: 18mm; max-width: 60mm; margin-bottom: 6mm; }
        .header h1 { color: white; font-size: 28pt; font-weight: 800; letter-spacing: -0.5px; }
        .header p { color: rgba(255,255,255,0.8); font-size: 12pt; margin-top: 3mm; }
        .body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 15mm 20mm; }
        .qr-frame { border: 3px solid ${primaryColour}; border-radius: 6mm; padding: 8mm; display: inline-block; }
        .qr-frame svg { display: block; }
        .instructions { margin-top: 12mm; text-align: center; }
        .instructions h2 { font-size: 20pt; font-weight: 700; color: #1A1A2E; }
        .instructions p { font-size: 11pt; color: #6B7A99; margin-top: 3mm; max-width: 120mm; }
        .steps { display: flex; gap: 12mm; margin-top: 10mm; justify-content: center; }
        .step { text-align: center; width: 36mm; }
        .step-num { width: 10mm; height: 10mm; border-radius: 50%; background: ${primaryColour}; color: white; font-size: 11pt; font-weight: 700; display: flex; align-items: center; justify-content: center; margin: 0 auto 3mm; }
        .step-label { font-size: 9pt; color: #1A1A2E; font-weight: 600; }
        .step-desc { font-size: 8pt; color: #6B7A99; margin-top: 1mm; }
        .footer { border-top: 1px solid #E2E6EA; padding: 6mm 20mm; display: flex; align-items: center; justify-content: space-between; }
        .footer-left { font-size: 8pt; color: #B0B8C9; }
        .footer-right { font-size: 8pt; color: #B0B8C9; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style>
      </head><body>
        <div class="poster">
          <div class="header">
            ${company?.logo_url ? `<img src="${company.logo_url}" alt="" /><br/>` : ''}
            <h1>${company?.name || 'Site Sign-In'}</h1>
            <p>${qrProject?.name || ''}</p>
          </div>
          <div class="body">
            <div class="qr-frame">${content.querySelector('svg')?.outerHTML || ''}</div>
            <div class="instructions">
              <h2>Scan to Sign In / Out</h2>
              <p>All operatives must sign in when arriving and sign out when leaving site.</p>
            </div>
            <div class="steps">
              <div class="step"><div class="step-num">1</div><div class="step-label">Open Camera</div><div class="step-desc">Point your phone at the QR code</div></div>
              <div class="step"><div class="step-num">2</div><div class="step-label">Tap the Link</div><div class="step-desc">Open the sign-in page</div></div>
              <div class="step"><div class="step-num">3</div><div class="step-label">Confirm</div><div class="step-desc">Tap Sign In or Sign Out</div></div>
            </div>
          </div>
          <div class="footer">
            <div class="footer-left">Powered by CoreSite</div>
            <div class="footer-right">${qrProject?.name || ''} · ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</div>
          </div>
        </div>
      </body></html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--primary-color)] border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--primary-color)', opacity: 0.1 }}>
            <Users size={24} style={{ color: 'var(--primary-color)' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Site Attendance
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search operative..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-lg border text-sm w-48"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Date display */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
            <Calendar size={14} />
            <span>{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* Live Panel — Who's On Site Now */}
      <div className="rounded-xl border p-5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Who's On Site Now
            </h2>
            <span className="px-3 py-1 rounded-full text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--primary-color)' }}>
              {onSiteOperatives.length} on site
            </span>
          </div>

          <button
            onClick={openMuster}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
          >
            <Shield size={14} />
            Fire Muster
          </button>
        </div>

        {onSiteOperatives.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No operatives currently signed in.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {onSiteOperatives.map(r => (
              <div key={r.operative_id}
                className="flex flex-col items-center gap-2 p-3 rounded-lg border text-center"
                style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-main)' }}>
                {r.operative?.photo_url ? (
                  <img src={r.operative.photo_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                    style={{ backgroundColor: 'var(--primary-color)' }}>
                    {(r.operative?.name || r.operative_name || '?').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium truncate max-w-[120px]" style={{ color: 'var(--text-primary)' }}>
                    {r.operative?.name || r.operative_name || 'Unknown'}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {r.operative?.role || ''}
                  </p>
                  <p className="text-xs flex items-center justify-center gap-1 mt-1" style={{ color: 'var(--text-muted)' }}>
                    <Clock size={10} /> {formatTime(r.recorded_at)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setManualSignOut({
                      operative_id: r.operative_id,
                      operative_name: r.operative?.name || r.operative_name || 'Unknown',
                      project_id: r.project_id,
                      company_id: r.company_id,
                      sign_in_time: r.recorded_at,
                    })
                    // Default to current time
                    const now = new Date()
                    setManualTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
                  }}
                  className="mt-1 flex items-center justify-center gap-1 w-full text-[10px] font-semibold px-2 py-1 rounded-md bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-200"
                >
                  <LogOut size={10} /> Sign Out
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Today's Activity Log */}
      <div className="rounded-xl border p-5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Today's Activity Log
          </h2>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {filteredActivity.length} events
          </span>
        </div>

        {filteredActivity.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No activity recorded today.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Time</th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Operative</th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Type</th>
                  <th className="text-left py-2 px-3 font-medium hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>Method</th>
                  <th className="text-left py-2 px-3 font-medium hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>IP</th>
                </tr>
              </thead>
              <tbody>
                {filteredActivity.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:opacity-80"
                    style={{ borderColor: 'var(--border-color)' }}>
                    <td className="py-2.5 px-3" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center gap-1.5">
                        <Clock size={13} style={{ color: 'var(--text-muted)' }} />
                        {formatTime(r.recorded_at)}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {getOpName(r.operative_id, r.operative_name)}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        {r.type === 'sign_in' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                            <LogIn size={11} /> IN
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                            <LogOut size={11} /> OUT
                          </span>
                        )}
                        {r.notes?.includes('Late') && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600">LATE</span>}
                        {r.notes?.includes('Early') && r.type === 'sign_out' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600">EARLY</span>}
                        {r.notes?.includes('Overtime') && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600">OT</span>}
                        {r.notes?.includes('Off-site') && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-50 text-orange-600">OFF-SITE</span>}
                        {r.method === 'auto' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">AUTO</span>}
                        {(r.latitude && r.longitude) && (
                          <a href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noopener noreferrer"
                            title="View location on map"
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors cursor-pointer">
                            <MapPin size={10} className="mr-0.5" /> GPS
                          </a>
                        )}
                      </div>
                      {r.notes?.includes('|') && (
                        <p className="text-[10px] mt-1 italic" style={{ color: 'var(--text-muted)' }}>
                          {r.notes.split('|').slice(1).join('|').trim()}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 px-3 hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>
                      {r.method || '--'}
                    </td>
                    <td className="py-2.5 px-3 hidden md:table-cell text-xs" style={{ color: 'var(--text-muted)' }}>
                      {r.ip_address || '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Weekly Register */}
      <div className="rounded-xl border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <button
          onClick={() => setRegisterOpen(!registerOpen)}
          className="flex items-center justify-between w-full p-5 text-left"
        >
          <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Calendar size={18} />
            Weekly Register
          </h2>
          {registerOpen ? <ChevronDown size={20} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={20} style={{ color: 'var(--text-muted)' }} />}
        </button>

        {registerOpen && (
          <div className="px-5 pb-5 space-y-4">
            {/* Week nav */}
            <div className="flex items-center justify-between">
              <button onClick={() => setRegisterOffset(o => o - 1)} className="px-3 py-1.5 rounded-lg border text-sm" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                ← Prev
              </button>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {getRegisterWeekDates(registerOffset)[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — {getRegisterWeekDates(registerOffset)[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                {registerOffset === 0 && <span className="text-xs font-medium ml-2" style={{ color: 'var(--primary-color)' }}>This Week</span>}
              </p>
              <button onClick={() => setRegisterOffset(o => Math.min(o + 1, 0))} disabled={registerOffset >= 0}
                className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-30" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                Next →
              </button>
            </div>

            {!projectId && (
              <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)' }}>Select a project from the sidebar for the most accurate view</p>
            )}

            {loadingRegister ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-t-transparent rounded-full" style={{ borderColor: 'var(--primary-color)' }} />
              </div>
            ) : registerWeek.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>No attendance records for this week.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                      <th className="text-left py-2 px-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Operative</th>
                      {getRegisterWeekDates(registerOffset).map((d, i) => (
                        <th key={i} className="text-center py-2 px-1 font-medium" style={{ color: 'var(--text-muted)', minWidth: 80 }}>
                          <div className="text-[10px]">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</div>
                          <div className="text-[10px]">{d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                        </th>
                      ))}
                      <th className="text-center py-2 px-2 font-semibold" style={{ color: 'var(--text-primary)' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registerWeek.map(row => (
                      <tr key={row.opId} className="border-b last:border-0" style={{ borderColor: 'var(--border-color)' }}>
                        <td className="py-2.5 px-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{row.name}</td>
                        {row.dayCells.map((cell, i) => (
                          <td key={i} className="py-2.5 px-1 text-center">
                            {cell.hours !== null ? (
                              <div>
                                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                  {formatTime(cell.firstIn)}–{formatTime(cell.lastOut)}
                                </div>
                                {cell.autoSignOut ? (
                                  <div>
                                    <div className="text-[10px] font-medium text-amber-500">Missed sign-out</div>
                                    <button
                                      onClick={() => {
                                        setManualSignOut({
                                          operative_id: cell.operative_id,
                                          operative_name: row.name,
                                          project_id: registerRecords.find(r => r.operative_id === cell.operative_id)?.project_id,
                                          company_id: registerRecords.find(r => r.operative_id === cell.operative_id)?.company_id,
                                          sign_in_time: cell.firstIn,
                                          correct_record_id: registerRecords.find(r => r.operative_id === cell.operative_id && r.type === 'sign_out' && r.recorded_at === cell.lastOut)?.id,
                                        })
                                        setManualTime('15:30')
                                      }}
                                      className="text-[9px] text-blue-500 hover:underline mt-0.5"
                                    >
                                      Correct time
                                    </button>
                                  </div>
                                ) : (
                                  <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{cell.hours.toFixed(1)}h</div>
                                )}
                              </div>
                            ) : cell.firstIn ? (
                              <div>
                                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{formatTime(cell.firstIn)}–?</div>
                                <div className="text-[10px] font-medium text-amber-500">No sign-out</div>
                                <button
                                  onClick={() => {
                                    setManualSignOut({
                                      operative_id: cell.operative_id,
                                      operative_name: row.name,
                                      project_id: registerRecords.find(r => r.operative_id === cell.operative_id)?.project_id,
                                      company_id: registerRecords.find(r => r.operative_id === cell.operative_id)?.company_id,
                                      sign_in_time: cell.firstIn,
                                    })
                                    setManualTime('15:30')
                                  }}
                                  className="text-[9px] text-blue-500 hover:underline mt-0.5"
                                >
                                  Add sign-out
                                </button>
                              </div>
                            ) : cell.holiday ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <SunMedium size={13} className="text-amber-500" />
                                <span className="text-[10px] font-semibold text-amber-600">Holiday</span>
                              </div>
                            ) : (
                              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>
                        ))}
                        <td className="py-2.5 px-2 text-center font-bold" style={{ color: 'var(--text-primary)' }}>{row.totalHours.toFixed(1)}h</td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr style={{ borderTop: '2px solid var(--border-color)' }}>
                      <td className="py-2.5 px-2 font-bold text-xs uppercase" style={{ color: 'var(--text-muted)' }}>Daily Total</td>
                      {getRegisterWeekDates(registerOffset).map((_, i) => {
                        const dayTotal = registerWeek.reduce((sum, row) => sum + (row.dayCells[i]?.hours || 0), 0)
                        return <td key={i} className="py-2.5 px-1 text-center text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{dayTotal > 0 ? `${dayTotal.toFixed(1)}h` : '—'}</td>
                      })}
                      <td className="py-2.5 px-2 text-center font-bold" style={{ color: 'var(--primary-color)' }}>
                        {registerWeek.reduce((sum, row) => sum + row.totalHours, 0).toFixed(1)}h
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {registerWeek.length > 0 && (
              <button onClick={() => {
                const days = getRegisterWeekDates(registerOffset)
                const headers = ['Operative', ...days.map((d, i) => `${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]} ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`), 'Total Hours']
                const rows = registerWeek.map(row => [
                  row.name,
                  ...row.dayCells.map(c => c.hours !== null ? c.hours.toFixed(1) : c.firstIn ? 'No sign-out' : ''),
                  row.totalHours.toFixed(1),
                ])
                const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
                const blob = new Blob([csv], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `weekly-register-${days[0].toISOString().split('T')[0]}.csv`
                a.click()
                URL.revokeObjectURL(url)
                toast.success('CSV exported')
              }} className="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors hover:opacity-80"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                <Download size={15} /> Export Weekly Register
              </button>
            )}
          </div>
        )}
      </div>

      {/* Attendance History (expandable) */}
      <div className="rounded-xl border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <button
          onClick={() => setHistoryOpen(!historyOpen)}
          className="flex items-center justify-between w-full p-5 text-left"
        >
          <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Calendar size={18} />
            Attendance History
          </h2>
          {historyOpen ? <ChevronDown size={20} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={20} style={{ color: 'var(--text-muted)' }} />}
        </button>

        {historyOpen && (
          <div className="px-5 pb-5 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>From</label>
                <input
                  type="date"
                  value={historyFrom}
                  onChange={e => setHistoryFrom(e.target.value)}
                  className="px-3 py-2 rounded-lg border text-sm"
                  style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>To</label>
                <input
                  type="date"
                  value={historyTo}
                  onChange={e => setHistoryTo(e.target.value)}
                  className="px-3 py-2 rounded-lg border text-sm"
                  style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <LoadingButton
                loading={loadingHistory}
                onClick={loadHistory}
                className="bg-[var(--primary-color)] text-white text-sm"
              >
                Load History
              </LoadingButton>
              <button
                onClick={exportCSV}
                className="flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-colors hover:opacity-80"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              >
                <Download size={15} />
                Export CSV
              </button>
            </div>

            {historyRecords.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                      <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Date</th>
                      <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Time</th>
                      <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Operative</th>
                      <th className="text-left py-2 px-3 font-medium hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>Project</th>
                      <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Type</th>
                      <th className="text-left py-2 px-3 font-medium hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>Duration</th>
                      <th className="text-left py-2 px-3 font-medium hidden lg:table-cell" style={{ color: 'var(--text-muted)' }}>IP</th>
                      <th className="text-left py-2 px-3 font-medium hidden lg:table-cell" style={{ color: 'var(--text-muted)' }}>GPS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyWithDuration.map(r => (
                      <tr key={r.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-color)' }}>
                        <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{formatDate(r.recorded_at)}</td>
                        <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{formatTime(r.recorded_at)}</td>
                        <td className="py-2 px-3 font-medium" style={{ color: 'var(--text-primary)' }}>{getOpName(r.operative_id, r.operative_name)}</td>
                        <td className="py-2 px-3 hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>{getProjectName(r.project_id)}</td>
                        <td className="py-2 px-3">
                          {r.type === 'sign_in' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                              <LogIn size={11} /> IN
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                              <LogOut size={11} /> OUT
                            </span>
                          )}
                          {r.notes?.includes('|') && (
                            <p className="text-[10px] mt-1 italic" style={{ color: 'var(--text-muted)' }}>
                              {r.notes.split('|').slice(1).join('|').trim()}
                            </p>
                          )}
                        </td>
                        <td className="py-2 px-3 hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>{r.duration ? formatDuration(r.duration) : '--'}</td>
                        <td className="py-2 px-3 hidden lg:table-cell text-xs" style={{ color: 'var(--text-muted)' }}>{r.ip_address || '--'}</td>
                        <td className="py-2 px-3 hidden lg:table-cell text-xs">
                          {(r.latitude && r.longitude) ? (
                            <a href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-blue-500 hover:text-blue-700 hover:underline transition-colors"
                              title="View location on map">
                              <MapPin size={11} />{Number(r.latitude).toFixed(4)}, {Number(r.longitude).toFixed(4)}
                            </a>
                          ) : <span style={{ color: 'var(--text-muted)' }}>--</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Per-Operative Summary */}
      <div className="rounded-xl border p-5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Per-Operative Summary
        </h2>

        {sortedSummary.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{loadingAllTime ? 'Loading summary...' : 'No attendance data yet.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                  {[
                    { key: 'name', label: 'Operative' },
                    { key: 'firstDate', label: 'First Seen' },
                    { key: 'daysAttended', label: 'Days Attended' },
                    { key: 'totalHours', label: 'Total Hours' },
                    { key: 'avgHours', label: 'Avg Hours/Day' },
                    { key: 'lateArrivals', label: 'Late Arrivals' },
                  ].map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSortSummary(col.key)}
                      className="text-left py-2 px-3 font-medium cursor-pointer select-none hover:opacity-70"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span className="flex items-center gap-1">
                        {col.label}
                        {summarySort.col === col.key && (
                          <span className="text-xs">{summarySort.asc ? '\u25B2' : '\u25BC'}</span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedSummary.map(row => (
                  <tr key={row.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-color)' }}>
                    <td className="py-2.5 px-3 font-medium" style={{ color: 'var(--text-primary)' }}>{row.name}</td>
                    <td className="py-2.5 px-3 text-xs" style={{ color: 'var(--text-muted)' }}>{row.firstDate}</td>
                    <td className="py-2.5 px-3" style={{ color: 'var(--text-primary)' }}>{row.daysAttended}</td>
                    <td className="py-2.5 px-3" style={{ color: 'var(--text-primary)' }}>{row.totalHours}h</td>
                    <td className="py-2.5 px-3" style={{ color: 'var(--text-primary)' }}>{row.avgHours}h</td>
                    <td className="py-2.5 px-3">
                      {row.lateArrivals > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                          <AlertTriangle size={13} /> {row.lateArrivals}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* QR Code Section */}
      <div className="rounded-xl border p-5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <QrCode size={18} />
          QR Code Sign-In Posters
        </h2>

        <div className="flex flex-wrap gap-3">
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => setQrProject(qrProject?.id === p.id ? null : p)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors hover:opacity-80"
              style={{
                borderColor: qrProject?.id === p.id ? 'var(--primary-color)' : 'var(--border-color)',
                backgroundColor: qrProject?.id === p.id ? 'var(--primary-color)' : 'transparent',
                color: qrProject?.id === p.id ? 'white' : 'var(--text-primary)',
              }}
            >
              <QrCode size={15} />
              {p.name}
            </button>
          ))}
        </div>

        {qrProject && (
          <div className="mt-5 space-y-4">
            {/* Poster preview */}
            <div ref={qrRef} className="mx-auto max-w-md rounded-xl overflow-hidden border shadow-sm"
              style={{ borderColor: 'var(--border-color)' }}>
              {/* Header band */}
              <div className="px-6 py-5 text-center" style={{ backgroundColor: 'var(--primary-color)' }}>
                {company?.logo_url && (
                  <img src={company.logo_url} alt="" className="h-8 max-w-[160px] object-contain mx-auto mb-3" />
                )}
                <p className="text-lg font-bold text-white">{company?.name || 'Site Sign-In'}</p>
                <p className="text-xs text-white/70 mt-1">{qrProject.name}</p>
              </div>
              {/* QR */}
              <div className="bg-white px-6 py-6 flex flex-col items-center">
                <div className="p-3 border-2 rounded-xl" style={{ borderColor: 'var(--primary-color)' }}>
                  <QRCodeSVG
                    value={`${window.location.origin}/site/${qrProject.id}`}
                    size={200}
                    level="H"
                    includeMargin={false}
                  />
                </div>
                <p className="text-base font-bold text-[#1A1A2E] mt-4">Scan to Sign In / Out</p>
                <p className="text-xs text-[#6B7A99] mt-1 text-center max-w-[260px]">All operatives must sign in when arriving and sign out when leaving site.</p>
                {/* Steps */}
                <div className="flex gap-6 mt-4">
                  {[['1', 'Open Camera'], ['2', 'Tap Link'], ['3', 'Confirm']].map(([n, label]) => (
                    <div key={n} className="text-center">
                      <div className="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center mx-auto"
                        style={{ backgroundColor: 'var(--primary-color)' }}>{n}</div>
                      <p className="text-[10px] font-semibold text-[#1A1A2E] mt-1">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
              {/* Footer */}
              <div className="bg-[#F5F6F8] px-6 py-2.5 flex items-center justify-between border-t border-[#E2E6EA]">
                <p className="text-[10px] text-[#B0B8C9]">Powered by CoreSite</p>
                <p className="text-[10px] text-[#B0B8C9]">{qrProject.name}</p>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={printQR}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: 'var(--primary-color)' }}
              >
                <Printer size={16} />
                Print Poster
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fire Muster Modal */}
      {showMuster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl"
            style={{ backgroundColor: 'var(--bg-card)' }}>
            <div className="sticky top-0 z-10 flex items-center justify-between p-5 border-b bg-red-600 rounded-t-xl">
              <div className="flex items-center gap-3 text-white">
                <AlertTriangle size={24} />
                <h2 className="text-xl font-bold">Emergency Roll Call</h2>
              </div>
              <button onClick={() => setShowMuster(false)} className="text-white/80 hover:text-white">
                <X size={22} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {(() => {
                const selectedProj = projectId ? projects.find(p => p.id === projectId) : null
                const musterPoint = selectedProj?.muster_point
                return musterPoint ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
                    <MapPin size={16} className="text-amber-600 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-amber-800 uppercase">Muster Point</p>
                      <p className="text-sm font-bold text-amber-900">{musterPoint}</p>
                    </div>
                  </div>
                ) : null
              })()}
              <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                {onSiteOperatives.length} personnel currently on site.
                Check off each person as accounted for.
              </p>

              {onSiteOperatives.map(r => {
                const checked = musterChecked[r.operative_id]
                return (
                  <button
                    key={r.operative_id}
                    onClick={() => handleMusterToggle(r.operative_id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      checked ? 'border-emerald-400 bg-emerald-50' : ''
                    }`}
                    style={!checked ? { borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-main)' } : {}}
                  >
                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                      checked ? 'bg-emerald-500 border-emerald-500 text-white' : ''
                    }`}
                      style={!checked ? { borderColor: 'var(--border-color)' } : {}}
                    >
                      {checked && <Check size={14} />}
                    </div>
                    {r.operative?.photo_url ? (
                      <img src={r.operative.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-xs"
                        style={{ backgroundColor: 'var(--primary-color)' }}>
                        {(r.operative?.name || r.operative_name || '?').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="text-left">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {r.operative?.name || r.operative_name || 'Unknown'}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {r.operative?.role || ''} — signed in {formatTime(r.recorded_at)}
                      </p>
                    </div>
                    {checked && (
                      <span className="ml-auto text-xs font-semibold text-emerald-600">ACCOUNTED</span>
                    )}
                  </button>
                )
              })}

              <div className="pt-4 flex items-center justify-between border-t" style={{ borderColor: 'var(--border-color)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {Object.values(musterChecked).filter(Boolean).length} / {onSiteOperatives.length} accounted for
                </p>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: 'var(--primary-color)' }}
                >
                  <Printer size={15} />
                  Print Roll Call
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Sign-Out Modal */}
      {manualSignOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl shadow-2xl" style={{ backgroundColor: 'var(--bg-card)' }}>
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-2">
                <UserX size={18} style={{ color: 'var(--primary-color)' }} />
                <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Manual Sign-Out</h2>
              </div>
              <button onClick={() => { setManualSignOut(null); setManualTime('') }} style={{ color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{manualSignOut.operative_name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Signed in at {formatTime(manualSignOut.sign_in_time)}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>Sign-out time</label>
                <input
                  type="time"
                  value={manualTime}
                  onChange={e => setManualTime(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm"
                  style={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setManualSignOut(null); setManualTime('') }}
                  className="flex-1 py-2.5 text-sm font-medium rounded-lg border transition-colors"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                  Cancel
                </button>
                <button onClick={handleManualSignOut} disabled={!manualTime || manualSaving}
                  className="flex-1 py-2.5 text-sm font-semibold rounded-lg text-white transition-colors flex items-center justify-center gap-2"
                  style={{ backgroundColor: '#DA3633', opacity: (!manualTime || manualSaving) ? 0.5 : 1 }}>
                  {manualSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <LogOut size={14} />}
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
