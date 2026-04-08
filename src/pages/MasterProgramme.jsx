import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import { parseProgrammePDF } from '../lib/programmeParser'
import toast from 'react-hot-toast'
import {
  Upload, Download, Calendar, ChevronRight, Check, AlertTriangle,
  Clock, BarChart3, CalendarRange, Loader2, Activity
} from 'lucide-react'

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseDate(str) {
  if (!str) return null
  const d = new Date(str + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

function formatDate(str) {
  const d = parseDate(str)
  if (!d) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

function daysBetween(a, b) {
  return Math.round((b - a) / (1000 * 60 * 60 * 24))
}

function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function startOfWeek(d) {
  const r = new Date(d)
  const day = r.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday
  r.setDate(r.getDate() + diff)
  r.setHours(0, 0, 0, 0)
  return r
}

function isoDate(d) {
  return d.toISOString().split('T')[0]
}

// ── Status logic ──────────────────────────────────────────────────────────────

function computeStatus(activity) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = parseDate(activity.start_date)
  const finish = parseDate(activity.finish_date)
  const progress = activity.actual_progress || 0

  if (progress >= 100) return 'complete'
  if (!start || !finish) return 'not_started'
  if (start > today) return 'not_started'

  const totalDays = daysBetween(start, finish)
  const elapsed = daysBetween(start, today)
  const expected = totalDays > 0 ? Math.min(100, Math.max(0, (elapsed / totalDays) * 100)) : 100

  if (progress === 0 && start <= today) return 'behind'
  if (progress < expected) return 'at_risk'
  return 'on_track'
}

const STATUS_COLORS = {
  not_started: { bar: 'bg-slate-300', dot: 'bg-slate-400', label: 'Not Started' },
  on_track:    { bar: 'bg-blue-500',  dot: 'bg-blue-500',  label: 'On Track' },
  complete:    { bar: 'bg-green-500', dot: 'bg-green-500', label: 'Complete' },
  behind:      { bar: 'bg-red-500',   dot: 'bg-red-500',   label: 'Behind' },
  at_risk:     { bar: 'bg-amber-500', dot: 'bg-amber-500', label: 'At Risk' },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MasterProgramme() {
  const managerData = JSON.parse(getSession('manager_data') || '{}')

  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState('')
  const [programme, setProgramme] = useState(null)
  const [activities, setActivities] = useState([])
  const [linkedMap, setLinkedMap] = useState({}) // master_activity_id -> auto progress
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const editRef = useRef(null)
  const ganttRef = useRef(null)
  const tableBodyRef = useRef(null)

  // ── Load projects ─────────────────────────────────────────────────────────

  useEffect(() => { loadProjects() }, [])
  useEffect(() => { if (selectedProject) loadProgramme() }, [selectedProject])

  async function loadProjects() {
    try {
      let query = supabase.from('projects').select('id, name').order('name')
      if (managerData.company_id) query = query.eq('company_id', managerData.company_id)
      const { data } = await query
      setProjects(data || [])
      if (data?.length > 0) setSelectedProject(data[0].id)
    } catch (err) {
      console.error('loadProjects error:', err)
    }
    setLoading(false)
  }

  // ── Load programme & activities ───────────────────────────────────────────

  async function loadProgramme() {
    setLoading(true)
    try {
      // Get latest programme for this project
      const { data: prog } = await supabase
        .from('master_programme')
        .select('*')
        .eq('project_id', selectedProject)
        .order('imported_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setProgramme(prog || null)

      if (prog) {
        const { data: acts } = await supabase
          .from('master_activities')
          .select('*')
          .eq('programme_id', prog.id)
          .order('line_number')
        setActivities(acts || [])

        // Check for auto-linked programme_activities
        await loadLinkedProgress(acts || [])
      } else {
        setActivities([])
        setLinkedMap({})
      }
    } catch (err) {
      console.error('loadProgramme error:', err)
    }
    setLoading(false)
  }

  async function loadLinkedProgress(masterActs) {
    const linked = masterActs.filter(a => a.linked_programme_activity_id)
    if (!linked.length) { setLinkedMap({}); return }

    const paIds = linked.map(a => a.linked_programme_activity_id)
    const { data: progActs } = await supabase
      .from('programme_activities')
      .select('id, name')
      .in('id', paIds)

    if (!progActs?.length) { setLinkedMap({}); return }

    // Get markup lines for these activities to calculate progress
    const { data: lines } = await supabase
      .from('markup_lines')
      .select('programme_activity_id, measured_length')
      .in('programme_activity_id', paIds)

    const map = {}
    for (const ma of linked) {
      const pa = progActs.find(p => p.id === ma.linked_programme_activity_id)
      if (!pa) continue
      const actLines = (lines || []).filter(l => l.programme_activity_id === pa.id)
      const installed = actLines.reduce((s, l) => s + (l.measured_length || 0), 0)
      const baseline = ma.baseline_length || 0
      map[ma.id] = baseline > 0 ? Math.min(100, Math.round((installed / baseline) * 100)) : 0
    }
    setLinkedMap(map)
  }

  // ── Import PDF ────────────────────────────────────────────────────────────

  async function handleImportPDF(e) {
    const file = e.target.files?.[0]
    if (!file || !selectedProject) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Please upload a PDF file')
      return
    }

    setImporting(true)
    try {
      // 1. Parse the PDF
      const arrayBuffer = await file.arrayBuffer()
      const { activities: parsed, metadata } = await parseProgrammePDF(arrayBuffer)

      if (!parsed.length) {
        toast.error('No activities found in PDF')
        setImporting(false)
        return
      }

      // 2. Upload PDF to storage
      const uuid = crypto.randomUUID()
      const filePath = `programme/${selectedProject}/${uuid}.pdf`
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(filePath, file, { contentType: 'application/pdf' })
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`)
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)

      // 3. Create master_programme record
      const { data: prog, error: progErr } = await supabase.from('master_programme').insert({
        company_id: managerData.company_id,
        project_id: selectedProject,
        programme_name: file.name.replace(/\.pdf$/i, ''),
        file_url: urlData.publicUrl,
        imported_by: managerData.name || 'Unknown',
      }).select().single()
      if (progErr) throw new Error(progErr.message)

      // 4. Create master_activities
      const rows = parsed.map(act => ({
        programme_id: prog.id,
        company_id: managerData.company_id,
        project_id: selectedProject,
        line_number: act.line,
        name: act.name,
        section: act.section || null,
        start_date: act.startDate || null,
        duration: act.duration || null,
        finish_date: act.finishDate || null,
        is_summary: act.isSummary || false,
        indent_level: act.isSummary ? 0 : 1,
        actual_progress: 0,
        status: 'not_started',
      }))

      const { error: actErr } = await supabase.from('master_activities').insert(rows)
      if (actErr) throw new Error(actErr.message)

      toast.success(`Imported ${parsed.length} activities`)
      await loadProgramme()
    } catch (err) {
      console.error('Import error:', err)
      toast.error(err.message || 'Failed to import programme')
    }
    setImporting(false)
    e.target.value = ''
  }

  // ── Update progress ───────────────────────────────────────────────────────

  async function saveProgress(activityId, value) {
    const num = Math.max(0, Math.min(100, parseInt(value) || 0))
    // Optimistic update
    setActivities(prev => prev.map(a =>
      a.id === activityId ? { ...a, actual_progress: num } : a
    ))
    setEditingId(null)

    const { error } = await supabase
      .from('master_activities')
      .update({ actual_progress: num, status: num >= 100 ? 'complete' : undefined })
      .eq('id', activityId)

    if (error) {
      toast.error('Failed to save progress')
      await loadProgramme() // revert
    }
  }

  // ── CSV export ────────────────────────────────────────────────────────────

  function handleCSVExport() {
    const header = 'Line,Name,Section,Start,Finish,Duration,Progress %,Status\n'
    const rows = activities.map(a => {
      const status = computeStatus(a)
      return [
        a.line_number,
        `"${(a.name || '').replace(/"/g, '""')}"`,
        `"${(a.section || '').replace(/"/g, '""')}"`,
        a.start_date || '',
        a.finish_date || '',
        a.duration || '',
        linkedMap[a.id] != null ? linkedMap[a.id] : (a.actual_progress || 0),
        STATUS_COLORS[status]?.label || status,
      ].join(',')
    }).join('\n')

    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `master-programme-${isoDate(new Date())}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported')
  }

  // ── Enriched activities with computed status ──────────────────────────────

  const enriched = useMemo(() => {
    return activities.map(a => {
      const effectiveProgress = linkedMap[a.id] != null ? linkedMap[a.id] : (a.actual_progress || 0)
      const enrichedAct = { ...a, actual_progress: effectiveProgress, isAutoLinked: linkedMap[a.id] != null }
      return { ...enrichedAct, computedStatus: computeStatus(enrichedAct) }
    })
  }, [activities, linkedMap])

  // ── Summary stats ─────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const nonSummary = enriched.filter(a => !a.is_summary)
    const total = nonSummary.length
    const complete = nonSummary.filter(a => a.computedStatus === 'complete').length
    const inProgress = nonSummary.filter(a => ['on_track', 'at_risk'].includes(a.computedStatus)).length
    const behind = nonSummary.filter(a => a.computedStatus === 'behind').length
    const totalProgress = nonSummary.reduce((s, a) => s + (a.actual_progress || 0), 0)
    const weightedPct = total > 0 ? Math.round(totalProgress / total) : 0

    const finishDates = nonSummary.map(a => parseDate(a.finish_date)).filter(Boolean)
    const programmeEnd = finishDates.length > 0
      ? formatDate(isoDate(new Date(Math.max(...finishDates.map(d => d.getTime())))))
      : '—'

    return { total, complete, inProgress, behind, weightedPct, programmeEnd }
  }, [enriched])

  // ── Gantt date range ──────────────────────────────────────────────────────

  const { ganttStart, ganttEnd, totalDays, weeks, months } = useMemo(() => {
    const allDates = enriched.flatMap(a => [parseDate(a.start_date), parseDate(a.finish_date)]).filter(Boolean)
    if (!allDates.length) return { ganttStart: new Date(), ganttEnd: new Date(), totalDays: 1, weeks: [], months: [] }

    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())))

    const ganttStart = startOfWeek(addDays(minDate, -14))
    const ganttEnd = addDays(startOfWeek(addDays(maxDate, 14)), 7) // end of that week
    const totalDays = Math.max(1, daysBetween(ganttStart, ganttEnd))

    // Generate week columns
    const weeks = []
    let cursor = new Date(ganttStart)
    let weekNum = 1
    while (cursor < ganttEnd) {
      weeks.push({ start: new Date(cursor), num: weekNum })
      cursor = addDays(cursor, 7)
      weekNum++
    }

    // Generate month labels
    const months = []
    let currentMonth = -1
    for (const w of weeks) {
      const m = w.start.getMonth()
      const y = w.start.getFullYear()
      if (m !== currentMonth) {
        currentMonth = m
        months.push({
          label: w.start.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
          startIdx: weeks.indexOf(w),
        })
      }
    }
    // Calculate spans
    for (let i = 0; i < months.length; i++) {
      const nextIdx = i + 1 < months.length ? months[i + 1].startIdx : weeks.length
      months[i].span = nextIdx - months[i].startIdx
    }

    return { ganttStart, ganttEnd, totalDays, weeks, months }
  }, [enriched])

  const WEEK_WIDTH = 40
  const ganttTotalWidth = weeks.length * WEEK_WIDTH

  function dateToLeft(dateStr) {
    const d = parseDate(dateStr)
    if (!d) return 0
    const days = daysBetween(ganttStart, d)
    return (days / totalDays) * ganttTotalWidth
  }

  function dateToWidth(startStr, finishStr) {
    const s = parseDate(startStr)
    const f = parseDate(finishStr)
    if (!s || !f) return 0
    const days = Math.max(1, daysBetween(s, f))
    return (days / totalDays) * ganttTotalWidth
  }

  // Today line position
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayLeft = dateToLeft(isoDate(today))
  const showTodayLine = today >= ganttStart && today <= ganttEnd

  // Sync scrolling between gantt header and body
  const ganttHeaderRef = useRef(null)
  const ganttBodyRef = useRef(null)

  const handleGanttScroll = useCallback((e) => {
    if (ganttHeaderRef.current && e.target !== ganttHeaderRef.current) {
      ganttHeaderRef.current.scrollLeft = e.target.scrollLeft
    }
    if (ganttBodyRef.current && e.target !== ganttBodyRef.current) {
      ganttBodyRef.current.scrollLeft = e.target.scrollLeft
    }
  }, [])

  // Row height
  const ROW_H = 36

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading && !activities.length) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Master Programme</h1>
          <p className="text-sm text-slate-500">Gantt chart programme tracker with live progress</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {projects.length > 0 && (
            <select
              value={selectedProject}
              onChange={e => setSelectedProject(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400"
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          {selectedProject && (
            <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              importing ? 'bg-blue-100 text-blue-600' : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}>
              {importing ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> Importing...
                </span>
              ) : (
                <>
                  <Upload size={16} /> Import Programme PDF
                </>
              )}
              <input type="file" accept=".pdf" onChange={handleImportPDF} disabled={importing} className="hidden" />
            </label>
          )}

          {enriched.length > 0 && (
            <button
              onClick={handleCSVExport}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-semibold text-slate-700 transition-colors"
            >
              <Download size={16} /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Summary stats */}
      {enriched.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard icon={Activity} label="Total Activities" value={stats.total} color="blue" />
          <StatCard icon={Check} label="Complete" value={stats.complete} color="green" />
          <StatCard icon={Clock} label="In Progress" value={stats.inProgress} color="blue" />
          <StatCard icon={AlertTriangle} label="Behind" value={stats.behind} color="red" />
          <StatCard icon={BarChart3} label="Overall %" value={`${stats.weightedPct}%`} color="blue" />
          <StatCard icon={Calendar} label="Programme End" value={stats.programmeEnd} color="slate" />
        </div>
      )}

      {/* Gantt chart */}
      {activities.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <CalendarRange size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No programme imported yet</p>
          <p className="text-xs text-slate-400 mt-1">Upload an Asta Powerproject PDF export to get started</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Time scale header */}
          <div className="flex border-b border-slate-200">
            {/* Left header */}
            <div className="w-[350px] shrink-0 border-r border-slate-200">
              <div className="h-[28px] bg-slate-50 border-b border-slate-100 px-3 flex items-center">
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Activities</span>
              </div>
              <div className="h-[24px] bg-slate-50 flex items-center text-[10px] text-slate-400 font-medium">
                <span className="w-[40px] text-center shrink-0">#</span>
                <span className="flex-1 px-2">Name</span>
                <span className="w-[64px] text-center shrink-0">Start</span>
                <span className="w-[64px] text-center shrink-0">Finish</span>
                <span className="w-[50px] text-center shrink-0">%</span>
                <span className="w-[20px] shrink-0"></span>
              </div>
            </div>
            {/* Right header — time scale */}
            <div className="flex-1 overflow-hidden" ref={ganttHeaderRef}>
              <div style={{ width: ganttTotalWidth }}>
                {/* Month row */}
                <div className="h-[28px] bg-slate-50 border-b border-slate-100 flex">
                  {months.map((m, i) => (
                    <div
                      key={i}
                      className="text-[10px] font-semibold text-slate-500 flex items-center justify-center border-r border-slate-100"
                      style={{ width: m.span * WEEK_WIDTH }}
                    >
                      {m.label}
                    </div>
                  ))}
                </div>
                {/* Week row */}
                <div className="h-[24px] bg-slate-50 flex">
                  {weeks.map((w, i) => (
                    <div
                      key={i}
                      className="text-[9px] text-slate-400 flex items-center justify-center border-r border-slate-100"
                      style={{ width: WEEK_WIDTH }}
                    >
                      {w.num}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex" style={{ maxHeight: 'calc(100vh - 340px)' }}>
            {/* Left: activity list */}
            <div
              className="w-[350px] shrink-0 border-r border-slate-200 overflow-y-auto"
              ref={tableBodyRef}
              onScroll={(e) => {
                // Sync vertical scroll with gantt body
                if (ganttBodyRef.current) ganttBodyRef.current.scrollTop = e.target.scrollTop
              }}
            >
              {enriched.map(act => {
                const sc = STATUS_COLORS[act.computedStatus] || STATUS_COLORS.not_started
                const isEditing = editingId === act.id
                const progress = act.actual_progress || 0

                return (
                  <div
                    key={act.id}
                    className={`flex items-center border-b border-slate-100 ${
                      act.is_summary ? 'bg-slate-50' : 'bg-white hover:bg-slate-50/50'
                    }`}
                    style={{ height: ROW_H }}
                  >
                    {/* Line number */}
                    <span className="w-[40px] text-center shrink-0 text-[11px] text-slate-400 tabular-nums">
                      {act.line_number}
                    </span>

                    {/* Name */}
                    <div
                      className="flex-1 min-w-0 px-2 flex items-center gap-1"
                      style={{ paddingLeft: act.is_summary ? 8 : 8 + (act.indent_level || 0) * 12 }}
                    >
                      {act.is_summary && <ChevronRight size={12} className="text-slate-400 shrink-0" />}
                      <span className={`truncate text-[11px] ${
                        act.is_summary ? 'font-bold text-slate-800 text-[12px]' : 'text-slate-700'
                      }`}>
                        {act.name}
                      </span>
                      {act.isAutoLinked && (
                        <span className="shrink-0 text-[8px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded font-medium">
                          auto
                        </span>
                      )}
                    </div>

                    {/* Start */}
                    <span className="w-[64px] text-center shrink-0 text-[10px] text-slate-500 tabular-nums">
                      {formatDate(act.start_date)}
                    </span>

                    {/* Finish */}
                    <span className="w-[64px] text-center shrink-0 text-[10px] text-slate-500 tabular-nums">
                      {formatDate(act.finish_date)}
                    </span>

                    {/* Progress */}
                    <div className="w-[50px] shrink-0 flex items-center justify-center">
                      {act.is_summary ? (
                        <span className="text-[10px] text-slate-400">—</span>
                      ) : isEditing ? (
                        <input
                          ref={editRef}
                          type="number"
                          min="0"
                          max="100"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveProgress(act.id, editValue)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          onBlur={() => saveProgress(act.id, editValue)}
                          className="w-[40px] text-center text-[11px] border border-blue-400 rounded px-1 py-0.5 focus:outline-none"
                          autoFocus
                        />
                      ) : (
                        <button
                          onClick={() => {
                            if (!act.isAutoLinked) {
                              setEditingId(act.id)
                              setEditValue(String(progress))
                            }
                          }}
                          className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded transition-colors ${
                            act.isAutoLinked
                              ? 'text-blue-600 cursor-default'
                              : 'text-slate-600 hover:bg-slate-100 cursor-pointer'
                          }`}
                        >
                          {progress}%
                        </button>
                      )}
                    </div>

                    {/* Status dot */}
                    <div className="w-[20px] shrink-0 flex items-center justify-center">
                      <div className={`w-2 h-2 rounded-full ${sc.dot}`} title={sc.label} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Right: Gantt bars */}
            <div
              className="flex-1 overflow-x-auto overflow-y-auto"
              ref={ganttBodyRef}
              onScroll={(e) => {
                handleGanttScroll(e)
                // Sync vertical scroll with table body
                if (tableBodyRef.current) tableBodyRef.current.scrollTop = e.target.scrollTop
              }}
            >
              <div className="relative" style={{ width: ganttTotalWidth, height: enriched.length * ROW_H }}>
                {/* Week column lines */}
                {weeks.map((w, i) => (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 border-r border-slate-100"
                    style={{ left: i * WEEK_WIDTH, width: WEEK_WIDTH }}
                  />
                ))}

                {/* Alternating row stripes */}
                {enriched.map((act, i) => (
                  <div
                    key={act.id}
                    className={i % 2 === 0 ? '' : 'bg-slate-50/30'}
                    style={{
                      position: 'absolute',
                      top: i * ROW_H,
                      left: 0,
                      right: 0,
                      height: ROW_H,
                      borderBottom: '1px solid #f1f5f9',
                    }}
                  />
                ))}

                {/* Activity bars */}
                {enriched.map((act, i) => {
                  if (!act.start_date || !act.finish_date) return null
                  const sc = STATUS_COLORS[act.computedStatus] || STATUS_COLORS.not_started
                  const left = dateToLeft(act.start_date)
                  const width = dateToWidth(act.start_date, act.finish_date)
                  const progress = act.actual_progress || 0
                  const barHeight = act.is_summary ? 10 : 20
                  const topOffset = (ROW_H - barHeight) / 2

                  return (
                    <div
                      key={act.id}
                      className="absolute cursor-pointer hover:brightness-110 transition-all"
                      style={{ top: i * ROW_H + topOffset, left, width: Math.max(width, 4), height: barHeight }}
                      title={`${act.name}: ${progress}% — click to update`}
                      onClick={() => {
                        if (!act.is_summary && !act.isAutoLinked) {
                          setEditingId(act.id)
                          setEditValue(String(progress))
                          // Scroll the left table to show this row
                          if (tableBodyRef.current) {
                            tableBodyRef.current.scrollTop = i * ROW_H - 100
                          }
                        }
                      }}
                    >
                      {/* Background bar */}
                      <div className={`absolute inset-0 rounded-sm ${
                        act.is_summary ? 'bg-slate-400/40' : 'bg-slate-200'
                      }`} />
                      {/* Fill bar */}
                      {progress > 0 && (
                        <div
                          className={`absolute inset-y-0 left-0 rounded-sm ${
                            act.is_summary ? 'bg-slate-600' : sc.bar
                          }`}
                          style={{ width: `${Math.min(100, progress)}%` }}
                        />
                      )}
                      {/* Summary end markers */}
                      {act.is_summary && (
                        <>
                          <div className="absolute left-0 bottom-0 w-[3px] h-[6px] bg-slate-600 rounded-sm" />
                          <div className="absolute right-0 bottom-0 w-[3px] h-[6px] bg-slate-600 rounded-sm" />
                        </>
                      )}
                    </div>
                  )
                })}

                {/* Today line */}
                {showTodayLine && (
                  <div
                    className="absolute top-0 bottom-0 z-10"
                    style={{ left: todayLeft }}
                  >
                    <div className="absolute -top-0 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-b whitespace-nowrap">
                      Today
                    </div>
                    <div
                      className="absolute top-[16px] bottom-0 w-0"
                      style={{
                        borderLeft: '2px dashed #ef4444',
                        left: 0,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue:  'bg-blue-50 text-blue-600 border-blue-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    red:   'bg-red-50 text-red-600 border-red-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-100',
  }
  const c = colors[color] || colors.slate

  return (
    <div className={`border rounded-xl p-3 ${c}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} />
        <span className="text-[11px] font-medium opacity-70">{label}</span>
      </div>
      <p className="text-lg font-bold">{value}</p>
    </div>
  )
}
