import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import { QRCodeSVG } from 'qrcode.react'
import {
  Users, Clock, LogIn, LogOut, Search, Download, Printer, Shield,
  MapPin, Calendar, Filter, AlertTriangle, QrCode, ChevronDown,
  ChevronRight, X, Check
} from 'lucide-react'

function formatTime(dateStr) {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr) {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDuration(minutes) {
  if (!minutes || minutes < 0) return '--'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${h}h ${m}m`
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function getTodayStart() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export default function SiteAttendance() {
  const { user, company } = useCompany()
  const cid = user?.company_id

  const [projects, setProjects] = useState([])
  const [operatives, setOperatives] = useState([])
  const [todayRecords, setTodayRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterProject, setFilterProject] = useState('all')
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

  // QR
  const [qrProject, setQrProject] = useState(null)
  const qrRef = useRef(null)

  useEffect(() => {
    if (cid) { loadData(); loadHistoryAuto() }
  }, [cid])

  async function loadHistoryAuto() {
    const fromDate = new Date(); fromDate.setDate(fromDate.getDate() - 30)
    const toDate = new Date(); toDate.setHours(23, 59, 59)
    const { data } = await supabase.from('site_attendance').select('*')
      .eq('company_id', cid)
      .gte('recorded_at', fromDate.toISOString())
      .lte('recorded_at', toDate.toISOString())
      .order('recorded_at', { ascending: false })
    setHistoryRecords(data || [])
  }

  async function loadData() {
    setLoading(true)
    const todayStart = getTodayStart()
    const [p, o, a] = await Promise.all([
      supabase.from('projects').select('id, name').eq('company_id', cid),
      supabase.from('operatives').select('id, name, role, photo_url').eq('company_id', cid),
      supabase.from('site_attendance').select('*').eq('company_id', cid)
        .gte('recorded_at', todayStart)
        .order('recorded_at', { ascending: false }),
    ])
    setProjects(p.data || [])
    setOperatives(o.data || [])
    setTodayRecords(a.data || [])
    setLoading(false)
  }

  // Determine who is currently on site
  const onSiteOperatives = useMemo(() => {
    const filtered = filterProject === 'all'
      ? todayRecords
      : todayRecords.filter(r => r.project_id === filterProject)

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
  }, [todayRecords, operatives, filterProject])

  // Today's activity filtered
  const filteredActivity = useMemo(() => {
    let records = filterProject === 'all'
      ? todayRecords
      : todayRecords.filter(r => r.project_id === filterProject)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      records = records.filter(r => {
        const op = operatives.find(o => o.id === r.operative_id)
        return op?.name?.toLowerCase().includes(term)
      })
    }
    return records
  }, [todayRecords, filterProject, searchTerm, operatives])

  // Per-operative summary for history
  const operativeSummary = useMemo(() => {
    const records = historyRecords.length > 0 ? historyRecords : todayRecords
    const byOp = {}
    for (const rec of records) {
      if (!byOp[rec.operative_id]) byOp[rec.operative_id] = []
      byOp[rec.operative_id].push(rec)
    }

    return Object.entries(byOp).map(([opId, recs]) => {
      const op = operatives.find(o => o.id === opId)
      // Sort ascending for pairing
      const sorted = [...recs].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
      const days = new Set(sorted.map(r => new Date(r.recorded_at).toDateString()))
      let totalMinutes = 0
      let lateArrivals = 0

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
        name: op?.name || 'Unknown',
        daysAttended: days.size,
        totalHours,
        avgHours,
        lateArrivals,
      }
    })
  }, [historyRecords, todayRecords, operatives])

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
    const fromDate = new Date(historyFrom)
    fromDate.setHours(0, 0, 0, 0)
    const toDate = new Date(historyTo)
    toDate.setHours(23, 59, 59, 999)

    const { data, error } = await supabase
      .from('site_attendance')
      .select('*')
      .eq('company_id', cid)
      .gte('recorded_at', fromDate.toISOString())
      .lte('recorded_at', toDate.toISOString())
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
        op?.name || r.operative_id,
        proj?.name || r.project_id || '',
        r.type === 'sign_in' ? 'IN' : 'OUT',
        r.duration ? formatDuration(r.duration) : '',
        r.method || '',
        r.ip_address || '',
        r.gps ? `${r.gps.lat},${r.gps.lng}` : '',
      ]
    })
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `site-attendance-${todayISO()}.csv`
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

  function getOpName(id) {
    return operatives.find(o => o.id === id)?.name || 'Unknown'
  }

  function getProjectName(id) {
    return projects.find(p => p.id === id)?.name || ''
  }

  function printQR() {
    const content = qrRef.current
    if (!content) return
    const win = window.open('', '_blank')
    win.document.write(`
      <html><head><title>QR Poster</title>
      <style>
        body { margin: 0; padding: 40px; font-family: Arial, sans-serif; text-align: center; }
        @media print { body { padding: 20mm; } }
      </style>
      </head><body>${content.innerHTML}</body></html>
    `)
    win.document.close()
    win.focus()
    win.print()
    win.close()
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
          {/* Project filter */}
          <div className="relative">
            <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <select
              value={filterProject}
              onChange={e => setFilterProject(e.target.value)}
              className="pl-9 pr-8 py-2 rounded-lg border text-sm appearance-none"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="all">All Projects</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          </div>

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
                    {(r.operative?.name || '?').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium truncate max-w-[120px]" style={{ color: 'var(--text-primary)' }}>
                    {r.operative?.name || 'Unknown'}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {r.operative?.role || ''}
                  </p>
                  <p className="text-xs flex items-center justify-center gap-1 mt-1" style={{ color: 'var(--text-muted)' }}>
                    <Clock size={10} /> {formatTime(r.recorded_at)}
                  </p>
                </div>
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
                      {getOpName(r.operative_id)}
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
                        {r.notes?.startsWith('Late') && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600">LATE</span>}
                        {r.notes?.startsWith('Early') && r.type === 'sign_out' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600">EARLY</span>}
                        {r.notes?.startsWith('Overtime') && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600">OT</span>}
                        {r.method === 'auto' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">AUTO</span>}
                      </div>
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
                        <td className="py-2 px-3 font-medium" style={{ color: 'var(--text-primary)' }}>{getOpName(r.operative_id)}</td>
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
                        </td>
                        <td className="py-2 px-3 hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>{r.duration ? formatDuration(r.duration) : '--'}</td>
                        <td className="py-2 px-3 hidden lg:table-cell text-xs" style={{ color: 'var(--text-muted)' }}>{r.ip_address || '--'}</td>
                        <td className="py-2 px-3 hidden lg:table-cell text-xs" style={{ color: 'var(--text-muted)' }}>
                          {r.gps ? (
                            <span className="flex items-center gap-1"><MapPin size={11} />{r.gps.lat?.toFixed(4)}, {r.gps.lng?.toFixed(4)}</span>
                          ) : '--'}
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
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No data for the selected period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                  {[
                    { key: 'name', label: 'Operative' },
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
            <div ref={qrRef} className="mx-auto max-w-md p-8 rounded-xl border text-center space-y-6"
              style={{ backgroundColor: 'white', borderColor: 'var(--border-color)' }}>
              <div>
                <p className="text-lg font-bold text-gray-800">{company?.name || 'Company'}</p>
                <p className="text-sm text-gray-500 mt-1">{qrProject.name}</p>
              </div>
              <div className="flex justify-center">
                <QRCodeSVG
                  value={`https://coresite.io/site/${qrProject.id}`}
                  size={220}
                  level="H"
                  includeMargin
                />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-700">Scan this QR code to sign in or out</p>
                <p className="text-xs text-gray-400 mt-3">Powered by CoreSite</p>
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
                const selectedProj = filterProject !== 'all' ? projects.find(p => p.id === filterProject) : null
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
                        {(r.operative?.name || '?').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="text-left">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {r.operative?.name || 'Unknown'}
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
    </div>
  )
}
