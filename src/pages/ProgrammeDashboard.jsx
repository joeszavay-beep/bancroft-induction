import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import { calculateProgress, calculateRate, calculateForecast, generateCSVExport } from '../lib/progressEngine'
import toast from 'react-hot-toast'
import {
  Upload, Download, ChevronDown, ChevronUp, ArrowUpDown, Filter,
  Activity, BarChart3, CheckCircle2, AlertTriangle, Clock, XCircle,
  Loader2
} from 'lucide-react'

const STATUS_CONFIG = {
  complete:  { label: 'Complete',  bg: 'bg-green-100',  text: 'text-green-700' },
  ahead:     { label: 'Ahead',    bg: 'bg-green-100',  text: 'text-green-700' },
  on_track:  { label: 'On Track', bg: 'bg-green-100',  text: 'text-green-700' },
  behind:    { label: 'Behind',   bg: 'bg-amber-100',  text: 'text-amber-700' },
  critical:  { label: 'Critical', bg: 'bg-red-100',    text: 'text-red-700' },
  stalled:   { label: 'Stalled',  bg: 'bg-red-100',    text: 'text-red-700' },
  not_started: { label: 'Not Started', bg: 'bg-slate-100', text: 'text-slate-500' },
  unknown:   { label: 'Unknown',  bg: 'bg-slate-100',  text: 'text-slate-500' },
}

export default function ProgrammeDashboard() {
  const navigate = useNavigate()
  const managerData = JSON.parse(getSession('manager_data') || '{}')

  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState('')
  const [activities, setActivities] = useState([])
  const [markupLines, setMarkupLines] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  // Filters
  const [floorFilter, setFloorFilter] = useState('')
  const [packageFilter, setPackageFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Sorting
  const [sortField, setSortField] = useState('activity_name')
  const [sortDir, setSortDir] = useState('asc')

  useEffect(() => { loadProjects() }, [])
  useEffect(() => { if (selectedProject) loadActivities() }, [selectedProject])

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

  async function loadActivities() {
    setLoading(true)
    try {
      const { data: acts } = await supabase
        .from('programme_activities')
        .select('*')
        .eq('project_id', selectedProject)
        .order('activity_name')
      setActivities(acts || [])

      if (acts?.length) {
        const actIds = acts.map(a => a.id)
        const { data: lines } = await supabase
          .from('markup_lines')
          .select('*')
          .in('programme_activity_id', actIds)
        setMarkupLines(lines || [])

        const { data: snaps } = await supabase
          .from('programme_snapshots')
          .select('*')
          .in('programme_activity_id', actIds)
          .order('date', { ascending: true })
        setSnapshots(snaps || [])
      } else {
        setMarkupLines([])
        setSnapshots([])
      }
    } catch (err) {
      console.error('loadActivities error:', err)
    }
    setLoading(false)
  }

  // Compute progress for each activity
  const enrichedActivities = useMemo(() => {
    return activities.map(act => {
      const actLines = markupLines.filter(l => l.programme_activity_id === act.id)
      const actSnaps = snapshots.filter(s => s.programme_activity_id === act.id)
      const progress = calculateProgress(act, actLines)
      const rate = calculateRate(actSnaps)
      const forecast = calculateForecast(act, progress.installedLength, rate.ratePerWeek)
      const varianceDays = forecast.varianceDays === Infinity ? null : forecast.varianceDays

      return {
        ...act,
        installed_length: progress.installedLength,
        percentage: progress.percentage,
        status: progress.status,
        rate_per_week: rate.ratePerWeek,
        forecast_date: forecast.forecastDate,
        variance_days: varianceDays,
      }
    })
  }, [activities, markupLines, snapshots])

  // Filter options
  const floors = useMemo(() => [...new Set(activities.map(a => a.floor).filter(Boolean))].sort(), [activities])
  const packages = useMemo(() => [...new Set(activities.map(a => a.package).filter(Boolean))].sort(), [activities])

  // Filtered & sorted
  const displayActivities = useMemo(() => {
    let filtered = enrichedActivities
    if (floorFilter) filtered = filtered.filter(a => a.floor === floorFilter)
    if (packageFilter) filtered = filtered.filter(a => a.package === packageFilter)
    if (statusFilter) filtered = filtered.filter(a => a.status === statusFilter)

    return [...filtered].sort((a, b) => {
      let va = a[sortField]
      let vb = b[sortField]
      if (va == null) va = ''
      if (vb == null) vb = ''
      if (typeof va === 'string') va = va.toLowerCase()
      if (typeof vb === 'string') vb = vb.toLowerCase()
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [enrichedActivities, floorFilter, packageFilter, statusFilter, sortField, sortDir])

  // Aggregates
  const aggregates = useMemo(() => {
    const total = enrichedActivities.length
    const totalBaseline = enrichedActivities.reduce((s, a) => s + (a.baseline_length_metres || 0), 0)
    const totalInstalled = enrichedActivities.reduce((s, a) => s + (a.installed_length || 0), 0)
    const weightedPct = totalBaseline > 0 ? Math.round((totalInstalled / totalBaseline) * 10000) / 100 : 0

    const onTrack = enrichedActivities.filter(a => ['on_track', 'ahead', 'complete'].includes(a.status)).length
    const behind = enrichedActivities.filter(a => a.status === 'behind').length
    const critical = enrichedActivities.filter(a => ['critical', 'stalled'].includes(a.status)).length

    return { total, totalBaseline, totalInstalled, weightedPct, onTrack, behind, critical }
  }, [enrichedActivities])

  function handleSort(field) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function SortIcon({ field }) {
    if (sortField !== field) return <ArrowUpDown size={12} className="text-slate-300" />
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-blue-500" />
      : <ChevronDown size={12} className="text-blue-500" />
  }

  async function handleUploadDXF(e) {
    const file = e.target.files?.[0]
    if (!file || !selectedProject) return
    if (!file.name.toLowerCase().endsWith('.dxf')) {
      toast.error('Please upload a DXF file')
      return
    }

    setUploading(true)
    try {
      const filePath = `programme/${selectedProject}/${crypto.randomUUID()}.dxf`
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(filePath, file, { contentType: 'application/dxf' })
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`)

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)

      const { data: drawing, error: drawErr } = await supabase.from('design_drawings').insert({
        company_id: managerData.company_id,
        project_id: selectedProject,
        name: file.name.replace(/\.dxf$/i, ''),
        file_url: urlData.publicUrl,
        file_type: 'dxf',
        uploaded_by: managerData.name || 'Unknown',
      }).select().single()

      if (drawErr) throw new Error(drawErr.message)

      toast.success('DXF uploaded — set up programme activities')
      navigate(`/programme/setup/${drawing.id}`)
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Failed to upload DXF')
    }
    setUploading(false)
    e.target.value = ''
  }

  function handleCSVExport() {
    const csv = generateCSVExport(displayActivities)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `programme-export-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported')
  }

  if (loading && !activities.length) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Programme Dashboard</h1>
        <p className="text-sm text-slate-500">Track M&E installation progress against programme baselines</p>
      </div>

      {/* Project selector + actions */}
      <div className="flex items-center gap-3 flex-wrap">
        {projects.length > 0 ? (
          <select
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400"
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <p className="text-sm text-slate-400">No projects found</p>
        )}

        {selectedProject && (
          <>
            <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              uploading ? 'bg-blue-100 text-blue-600' : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}>
              {uploading ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> Uploading...
                </span>
              ) : (
                <>
                  <Upload size={16} /> Upload DXF
                </>
              )}
              <input type="file" accept=".dxf" onChange={handleUploadDXF} disabled={uploading} className="hidden" />
            </label>

            {enrichedActivities.length > 0 && (
              <button
                onClick={handleCSVExport}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-semibold text-slate-700 transition-colors"
              >
                <Download size={16} /> Export CSV
              </button>
            )}
          </>
        )}
      </div>

      {/* Aggregate summary */}
      {enrichedActivities.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <SummaryCard icon={Activity} label="Activities" value={aggregates.total} color="blue" />
          <SummaryCard icon={BarChart3} label="Overall %" value={`${aggregates.weightedPct}%`} color="blue" />
          <SummaryCard icon={CheckCircle2} label="On Track" value={aggregates.onTrack} color="green" />
          <SummaryCard icon={AlertTriangle} label="Behind" value={aggregates.behind} color="amber" />
          <SummaryCard icon={XCircle} label="Critical" value={aggregates.critical} color="red" />
          <SummaryCard
            icon={Clock}
            label="Installed / Baseline"
            value={`${Math.round(aggregates.totalInstalled)}m / ${Math.round(aggregates.totalBaseline)}m`}
            color="slate"
          />
        </div>
      )}

      {/* Filters */}
      {enrichedActivities.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowFilters(f => !f)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Filter size={14} /> Filters
            {(floorFilter || packageFilter || statusFilter) && (
              <span className="w-2 h-2 rounded-full bg-blue-500" />
            )}
          </button>

          {showFilters && (
            <>
              <select
                value={floorFilter}
                onChange={e => setFloorFilter(e.target.value)}
                className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-400"
              >
                <option value="">All Floors</option>
                {floors.map(f => <option key={f} value={f}>{f}</option>)}
              </select>

              <select
                value={packageFilter}
                onChange={e => setPackageFilter(e.target.value)}
                className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-400"
              >
                <option value="">All Packages</option>
                {packages.map(p => <option key={p} value={p}>{p}</option>)}
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-400"
              >
                <option value="">All Statuses</option>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>

              {(floorFilter || packageFilter || statusFilter) && (
                <button
                  onClick={() => { setFloorFilter(''); setPackageFilter(''); setStatusFilter('') }}
                  className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                >
                  Clear all
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Activity table */}
      {activities.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <Activity size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No programme activities yet</p>
          <p className="text-xs text-slate-400 mt-1">Upload a DXF file to set up your programme baseline</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {[
                    { key: 'activity_name', label: 'Activity Name' },
                    { key: 'package', label: 'Package' },
                    { key: 'floor', label: 'Floor' },
                    { key: 'baseline_length_metres', label: 'Baseline (m)' },
                    { key: 'installed_length', label: 'Installed (m)' },
                    { key: 'percentage', label: '% Complete' },
                    { key: 'status', label: 'Status' },
                    { key: 'rate_per_week', label: 'Rate (m/wk)' },
                    { key: 'forecast_date', label: 'Forecast' },
                    { key: 'planned_completion', label: 'Planned' },
                    { key: 'variance_days', label: 'Variance' },
                  ].map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap"
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        <SortIcon field={col.key} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayActivities.map(act => {
                  const sc = STATUS_CONFIG[act.status] || STATUS_CONFIG.unknown
                  return (
                    <tr
                      key={act.id}
                      onClick={() => {
                        if (act.drawing_id) navigate(`/programme/drawing/${act.drawing_id}`)
                      }}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2.5 text-slate-800 font-medium max-w-[200px] truncate">
                        {act.activity_name}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{act.package || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-600">{act.floor || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-600 tabular-nums">
                        {act.baseline_length_metres != null ? Math.round(act.baseline_length_metres) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 tabular-nums">
                        {Math.round(act.installed_length)}
                      </td>
                      <td className="px-3 py-2.5 w-32">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                act.percentage >= 100 ? 'bg-green-500' :
                                act.percentage >= 50 ? 'bg-blue-500' : 'bg-blue-400'
                              }`}
                              style={{ width: `${Math.min(100, act.percentage)}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-500 tabular-nums w-10 text-right">
                            {act.percentage}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 tabular-nums">
                        {act.rate_per_week > 0 ? act.rate_per_week : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 text-xs">
                        {act.forecast_date ? new Date(act.forecast_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 text-xs">
                        {act.planned_completion ? new Date(act.planned_completion).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {act.variance_days != null ? (
                          <span className={`text-xs font-medium tabular-nums ${
                            act.variance_days > 7 ? 'text-red-600' :
                            act.variance_days > 0 ? 'text-amber-600' :
                            act.variance_days < 0 ? 'text-green-600' : 'text-slate-500'
                          }`}>
                            {act.variance_days > 0 ? `+${act.variance_days}d` :
                             act.variance_days < 0 ? `${act.variance_days}d` : '0d'}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-xs font-bold text-blue-700 mb-1">How the Programme Pipeline Works</p>
        <ol className="text-xs text-blue-600 space-y-1 list-decimal ml-4">
          <li>Upload a DXF drawing and create activities from layers (each layer = a baseline)</li>
          <li>Open a drawing and mark up installed lengths with green/amber/red polylines</li>
          <li>The dashboard automatically calculates progress, rates and forecasts</li>
          <li>Export to CSV for Asta Power Project or MS Project import</li>
        </ol>
      </div>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, color }) {
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
