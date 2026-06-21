import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import { startOfDayUK } from '../lib/dates'
import { Users, AlertTriangle } from 'lucide-react'

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function initialsColor(name) {
  const colors = ['#2563EB', '#7C3AED', '#0891B2', '#059669', '#D97706', '#DC2626', '#4F46E5', '#0D9488']
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function formatSignInTime(dateStr) {
  if (!dateStr) return '--'
  return new Date(dateStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function hoursSince(dateStr) {
  if (!dateStr) return 0
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60)
}

export default function TodayOnSite({ projects, projectId }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [attendance, setAttendance] = useState([])
  const [operatives, setOperatives] = useState([])
  const [tooltipId, setTooltipId] = useState(null)
  const intervalRef = useRef(null)

  const cid = useMemo(() => {
    try { return JSON.parse(getSession('manager_data') || '{}').company_id } catch { return null }
  }, [])

  async function fetchData() {
    if (!cid) { setLoading(false); return }

    const todayISO = startOfDayUK()

    let attQuery = supabase
      .from('site_attendance')
      .select('*')
      .eq('company_id', cid)
      .gte('recorded_at', todayISO)
    if (projectId) attQuery = attQuery.eq('project_id', projectId)

    const opQuery = supabase
      .from('operatives')
      .select('id, name, role, photo_url')
      .eq('company_id', cid)
      .is('left_at', null)

    const [attRes, opRes] = await Promise.all([attQuery, opQuery])

    setAttendance(attRes.data || [])
    setOperatives(opRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData() // eslint-disable-line react-hooks/exhaustive-deps
    intervalRef.current = setInterval(fetchData, 60_000)
    return () => clearInterval(intervalRef.current)
  }, [cid, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build operative lookup
  const opMap = useMemo(() => {
    const m = {}
    operatives.forEach(op => { m[op.id] = op })
    return m
  }, [operatives])

  // Group attendance by operative, determine who is on site
  const { onSite, totalSignedIn, projectBreakdown } = useMemo(() => {
    // Group by operative_id
    const grouped = {}
    for (const rec of attendance) {
      if (!grouped[rec.operative_id]) grouped[rec.operative_id] = []
      grouped[rec.operative_id].push(rec)
    }

    // Sort each group by recorded_at DESC, check latest
    const onSiteList = []
    const allSignedIn = new Set()

    for (const [opId, records] of Object.entries(grouped)) {
      const sorted = [...records].sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at))
      const hasSignIn = records.some(r => r.type === 'sign_in')
      if (hasSignIn) allSignedIn.add(opId)

      if (sorted[0].type === 'sign_in') {
        // Find their sign_in record for time display
        const signInRecord = sorted.find(r => r.type === 'sign_in')
        onSiteList.push({
          operative_id: opId,
          sign_in_time: signInRecord?.recorded_at,
          project_id: signInRecord?.project_id,
          op: opMap[opId] || { id: opId, name: records[0].operative_name || 'Unknown' },
        })
      }
    }

    // Per-project breakdown for "All projects" view
    const breakdown = {}
    if (!projectId && projects?.length) {
      for (const person of onSiteList) {
        const pid = person.project_id
        if (!breakdown[pid]) breakdown[pid] = { count: 0, name: '' }
        breakdown[pid].count++
      }
      for (const p of projects) {
        if (breakdown[p.id]) breakdown[p.id].name = p.name
      }
    }

    return { onSite: onSiteList, totalSignedIn: allSignedIn.size, projectBreakdown: breakdown }
  }, [attendance, opMap, projectId, projects])

  // Avatars: show up to 6
  const visibleAvatars = onSite.slice(0, 6)
  const extraCount = Math.max(0, onSite.length - 6)

  if (loading) {
    return (
      <div
        className="rounded-xl border overflow-hidden animate-pulse"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
      >
        <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="h-3 w-24 rounded" style={{ backgroundColor: 'var(--border-color)' }} />
        </div>
        <div className="p-5 space-y-3">
          <div className="h-8 w-32 rounded" style={{ backgroundColor: 'var(--border-color)' }} />
          <div className="flex gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="w-9 h-9 rounded-full" style={{ backgroundColor: 'var(--border-color)' }} />
            ))}
          </div>
          <div className="h-3 w-40 rounded" style={{ backgroundColor: 'var(--border-color)' }} />
        </div>
      </div>
    )
  }

  const count = onSite.length

  return (
    <div
      className="rounded-xl border overflow-hidden cursor-pointer transition-all hover:shadow-md"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
      onClick={() => navigate('/app/attendance')}
    >
      {/* Header */}
      <div
        className="px-5 py-3 border-b flex items-center justify-between"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div className="flex items-center gap-2">
          <Users size={14} style={{ color: 'var(--text-muted)' }} />
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            On Site Today
          </p>
        </div>
        <span className="text-[10px] font-medium" style={{ color: 'var(--primary-color)' }}>
          View attendance &rarr;
        </span>
      </div>

      {/* Body */}
      <div className="p-5">
        {/* Big number */}
        {count > 0 ? (
          <div className="mb-3">
            <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {count} <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>on site now</span>
            </p>
          </div>
        ) : (
          <div className="mb-3">
            <p className="text-2xl font-bold" style={{ color: 'var(--text-muted)' }}>Site quiet</p>
          </div>
        )}

        {/* Avatar row */}
        {count > 0 && (
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            {visibleAvatars.map((person) => {
              const op = person.op
              const isLong = hoursSince(person.sign_in_time) > 14
              return (
                <div
                  key={person.operative_id}
                  className="relative"
                  onMouseEnter={(e) => { e.stopPropagation(); setTooltipId(person.operative_id) }}
                  onMouseLeave={() => setTooltipId(null)}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Avatar */}
                  <div className="relative">
                    {op.photo_url ? (
                      <img
                        src={op.photo_url}
                        alt={op.name}
                        className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-sm"
                      />
                    ) : (
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white border-2 border-white shadow-sm"
                        style={{ backgroundColor: initialsColor(op.name) }}
                      >
                        {getInitials(op.name)}
                      </div>
                    )}
                    {isLong && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                        <AlertTriangle size={10} className="text-white" />
                      </div>
                    )}
                  </div>

                  {/* Tooltip */}
                  {tooltipId === person.operative_id && (
                    <div
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg shadow-lg text-xs whitespace-nowrap z-50 border"
                      style={{
                        backgroundColor: 'var(--bg-card)',
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <p className="font-semibold">{op.name}</p>
                      {op.role && (
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{op.role}</p>
                      )}
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        Signed in {formatSignInTime(person.sign_in_time)}
                      </p>
                      {isLong && (
                        <p className="text-[10px] text-amber-500 font-medium mt-0.5">
                          May have forgotten to sign out
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {extraCount > 0 && (
              <div
                className="h-9 px-3 rounded-full flex items-center text-[11px] font-semibold border"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-muted)',
                }}
              >
                +{extraCount} more
              </div>
            )}
          </div>
        )}

        {/* Sub-line: total signed in today */}
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {totalSignedIn > 0
            ? `${totalSignedIn} signed in today total`
            : 'No sign-ins recorded today'}
        </p>

        {/* Per-project breakdown for "All projects" mode */}
        {!projectId && Object.keys(projectBreakdown).length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(projectBreakdown)
              .filter(([, v]) => v.name)
              .sort((a, b) => b[1].count - a[1].count)
              .map(([pid, v]) => (
                <span
                  key={pid}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
                >
                  {v.name}: {v.count}
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
