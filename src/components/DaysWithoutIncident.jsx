import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { daysBetween as daysBetweenDates, todayDateStr } from '../lib/dates'
import { getSession } from '../lib/storage'
import { ShieldCheck, CheckCircle2, ChevronDown, ChevronUp, Plus } from 'lucide-react'

function formatDateShort(dateStr) {
  if (!dateStr) return '--'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function daysSinceIncident(dateStr) {
  if (!dateStr) return null
  return daysBetweenDates(dateStr.split('T')[0], todayDateStr())
}

const MILESTONES = [30, 90, 180, 365]

export default function DaysWithoutIncident({ projects, projectId, onLogIncident }) {
  const [loading, setLoading] = useState(true)
  const [incidents, setIncidents] = useState([])
  const [expanded, setExpanded] = useState(false)

  const cid = useMemo(() => {
    try { return JSON.parse(getSession('manager_data') || '{}').company_id } catch { return null }
  }, [])

  async function fetchIncidents() {
    if (!cid) { setLoading(false); return }

    let query = supabase
      .from('incidents')
      .select('id, project_id, incident_date, incident_type, severity')
      .eq('company_id', cid)
      .order('incident_date', { ascending: false })

    if (projectId) query = query.eq('project_id', projectId)

    const { data } = await query
    setIncidents(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchIncidents() // eslint-disable-line react-hooks/exhaustive-deps
  }, [cid, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const projectMap = useMemo(() => {
    const m = {}
    if (projects) projects.forEach(p => { m[p.id] = p.name || p.title || 'Unnamed' })
    return m
  }, [projects])

  // Compute days for current scope
  const { days, lastDate, cleanRecord } = useMemo(() => {
    if (!incidents.length) return { days: null, lastDate: null, cleanRecord: true }
    const latest = incidents[0].incident_date
    return { days: daysSinceIncident(latest), lastDate: latest, cleanRecord: false }
  }, [incidents])

  // Per-project breakdown for "All projects" view
  const perProject = useMemo(() => {
    if (projectId || !projects?.length || !incidents.length) return []
    const byProject = {}
    for (const inc of incidents) {
      if (!byProject[inc.project_id]) byProject[inc.project_id] = inc.incident_date
    }
    // Projects with no incidents get null (clean)
    const results = projects.map(p => ({
      id: p.id,
      name: p.name || p.title || 'Unnamed',
      lastDate: byProject[p.id] || null,
      days: byProject[p.id] ? daysSinceIncident(byProject[p.id]) : null,
      clean: !byProject[p.id],
    }))
    // Sort: lowest days first, clean records last
    results.sort((a, b) => {
      if (a.clean && b.clean) return 0
      if (a.clean) return 1
      if (b.clean) return -1
      return (a.days ?? Infinity) - (b.days ?? Infinity)
    })
    return results
  }, [incidents, projects, projectId])

  const lowestProject = perProject.length > 0 && !perProject[0].clean ? perProject[0] : null

  const isGreen = cleanRecord || (days != null && days > 90)
  const isMilestone = days != null && MILESTONES.includes(days)

  if (loading) {
    return (
      <div
        className="rounded-xl border overflow-hidden animate-pulse"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
      >
        <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="h-3 w-36 rounded" style={{ backgroundColor: 'var(--border-color)' }} />
        </div>
        <div className="p-5 space-y-3">
          <div className="h-10 w-20 rounded" style={{ backgroundColor: 'var(--border-color)' }} />
          <div className="h-3 w-44 rounded" style={{ backgroundColor: 'var(--border-color)' }} />
          <div className="h-3 w-32 rounded" style={{ backgroundColor: 'var(--border-color)' }} />
        </div>
      </div>
    )
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
    >
      {/* Header */}
      <div
        className="px-5 py-3 border-b flex items-center justify-between"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} style={{ color: 'var(--text-muted)' }} />
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Safety Record
          </p>
        </div>
        {onLogIncident && (
          <button
            onClick={(e) => { e.stopPropagation(); onLogIncident() }}
            className="flex items-center gap-1 text-[10px] font-medium hover:opacity-70 transition-opacity"
            style={{ color: 'var(--primary-color)' }}
          >
            <Plus size={12} /> Log incident
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-5">
        {cleanRecord ? (
          /* Clean safety record */
          <div className="mb-2">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 size={22} className="text-[#2EA043]" />
              <p className="text-2xl font-bold text-[#2EA043]">Clean safety record</p>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              No incidents recorded
            </p>
          </div>
        ) : (
          <>
            {/* Big number */}
            <div className="mb-1">
              <p
                className="text-3xl font-bold"
                style={{ color: isGreen ? '#2EA043' : 'var(--text-primary)' }}
              >
                {days}
              </p>
              <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                days since last incident
              </p>
            </div>

            {/* Milestone pill */}
            {isMilestone && (
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#2EA043]/10 text-[#2EA043] mb-2">
                <ShieldCheck size={12} />
                {days} days without incident!
              </div>
            )}

            {/* Last incident line */}
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Last incident: {formatDateShort(lastDate)}
            </p>

            {/* "All projects" mode: show lowest counter with project name */}
            {!projectId && lowestProject && perProject.length > 1 && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  Lowest
                </p>
                <p className="text-xs" style={{ color: 'var(--text-primary)' }}>
                  <span className="font-semibold">{lowestProject.name}</span>
                  {' '}&mdash; {lowestProject.days} day{lowestProject.days !== 1 ? 's' : ''}
                </p>

                {/* Expand to see all projects */}
                <button
                  onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
                  className="flex items-center gap-1 mt-1.5 text-[10px] font-medium hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--primary-color)' }}
                >
                  {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {expanded ? 'Hide' : 'View all'}
                </button>

                {expanded && (
                  <div className="mt-2 space-y-1.5">
                    {perProject.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="truncate mr-2" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                        {p.clean ? (
                          <span className="flex items-center gap-1 text-[#2EA043] font-medium whitespace-nowrap">
                            <CheckCircle2 size={12} /> Clean
                          </span>
                        ) : (
                          <span
                            className="font-semibold whitespace-nowrap"
                            style={{ color: p.days > 90 ? '#2EA043' : 'var(--text-primary)' }}
                          >
                            {p.days}d
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
