import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import {
  Activity, UserCheck, UserMinus, AlertTriangle, Eye,
  ChevronDown, Loader2
} from 'lucide-react'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'sign_in', label: 'Sign-ins' },
  { key: 'snag', label: 'Snags' },
  { key: 'safety', label: 'Safety' },
  { key: 'other', label: 'Other' },
]

const ICON_MAP = {
  sign_in: { Icon: UserCheck, color: '#2EA043' },
  sign_out: { Icon: UserMinus, color: '#6B7280' },
  snag: { Icon: AlertTriangle, color: '#D29922' },
  safety: { Icon: Eye, color: '#DC2626' },
  incident: { Icon: AlertTriangle, color: '#DC2626' },
  other: { Icon: Activity, color: '#2563EB' },
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return ''
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now - date
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)

  const pad = (n) => String(n).padStart(2, '0')
  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`

  if (diffSec < 60) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return `Yesterday ${timeStr}`
  }

  const day = pad(date.getDate())
  const month = pad(date.getMonth() + 1)
  return `${day}/${month} ${timeStr}`
}

function formatAbsoluteTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function mapTypeToFilter(type) {
  if (type === 'sign_in' || type === 'sign_out') return 'sign_in'
  if (type === 'snag') return 'snag'
  if (type === 'safety' || type === 'observation' || type === 'incident') return 'safety'
  return 'other'
}

export default function ActivityFeed({ projects, projectId }) {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [visibleCount, setVisibleCount] = useState(20)
  const [loadingMore, setLoadingMore] = useState(false)
  const intervalRef = useRef(null)

  const managerData = JSON.parse(getSession('manager_data') || '{}')
  const cid = managerData.company_id

  const projectMap = {}
  if (projects) {
    projects.forEach(p => { projectMap[p.id] = p.name })
  }

  const fetchFeed = useCallback(async () => {
    if (!cid) return

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    // Build activity_feed query
    let activityQuery = supabase
      .from('activity_feed')
      .select('*')
      .eq('company_id', cid)
      .order('created_at', { ascending: false })
      .limit(20)
    if (projectId) activityQuery = activityQuery.eq('project_id', projectId)

    // Build site_attendance query (today)
    let attendanceQuery = supabase
      .from('site_attendance')
      .select('id, operative_name, type, project_id, recorded_at')
      .eq('company_id', cid)
      .gte('recorded_at', todayStart.toISOString())
      .order('recorded_at', { ascending: false })
    if (projectId) attendanceQuery = attendanceQuery.eq('project_id', projectId)

    // Build snags query (last 7 days)
    let snagsQuery = supabase
      .from('snags')
      .select('id, snag_number, status, project_id, raised_by, created_at, updated_at')
      .eq('company_id', cid)
      .gte('created_at', weekAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(20)
    if (projectId) snagsQuery = snagsQuery.eq('project_id', projectId)

    // Build hs_observations query (last 7 days)
    let obsQuery = supabase
      .from('hs_observations')
      .select('id, project_id, observer_name, category, created_at')
      .eq('company_id', cid)
      .gte('created_at', weekAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(20)
    if (projectId) obsQuery = obsQuery.eq('project_id', projectId)

    const [activityRes, attendanceRes, snagsRes, obsRes] = await Promise.all([
      activityQuery,
      attendanceQuery,
      snagsQuery,
      obsQuery,
    ])

    const merged = []

    // Map activity_feed rows
    if (activityRes.data) {
      activityRes.data.forEach(row => {
        const iconInfo = ICON_MAP[row.event_type] || ICON_MAP.other
        merged.push({
          id: `af-${row.id}`,
          Icon: iconInfo.Icon,
          iconColor: iconInfo.color,
          title: row.title || row.event_type,
          description: row.description || '',
          actorName: row.actor_name || '',
          actorPhoto: row.actor_photo || null,
          timestamp: row.created_at,
          link: row.link || null,
          type: mapTypeToFilter(row.event_type),
        })
      })
    }

    // Map site_attendance rows
    if (attendanceRes.data) {
      attendanceRes.data.forEach(row => {
        const isSignIn = row.type === 'sign_in'
        merged.push({
          id: `att-${row.id}`,
          Icon: isSignIn ? UserCheck : UserMinus,
          iconColor: isSignIn ? '#2EA043' : '#6B7280',
          title: `${row.operative_name || 'Worker'} signed ${isSignIn ? 'in' : 'out'}`,
          description: projectMap[row.project_id] || '',
          actorName: row.operative_name || '',
          actorPhoto: null,
          timestamp: row.recorded_at,
          link: '/app/attendance',
          type: 'sign_in',
        })
      })
    }

    // Map snags rows
    if (snagsRes.data) {
      snagsRes.data.forEach(row => {
        const isClosed = row.status === 'completed' || row.status === 'closed'
        merged.push({
          id: `snag-${row.id}`,
          Icon: AlertTriangle,
          iconColor: '#D29922',
          title: `Snag #${row.snag_number || row.id} ${isClosed ? 'closed' : 'raised'} on ${projectMap[row.project_id] || 'project'}`,
          description: isClosed ? 'Snag resolved' : 'New snag raised',
          actorName: row.raised_by || '',
          actorPhoto: null,
          timestamp: isClosed ? (row.updated_at || row.created_at) : row.created_at,
          link: '/app/snags',
          type: 'snag',
        })
      })
    }

    // Map hs_observations rows
    if (obsRes.data) {
      obsRes.data.forEach(row => {
        merged.push({
          id: `obs-${row.id}`,
          Icon: Eye,
          iconColor: '#DC2626',
          title: `Observation reported on ${projectMap[row.project_id] || 'project'}`,
          description: row.category || '',
          actorName: row.observer_name || '',
          actorPhoto: null,
          timestamp: row.created_at,
          link: '/app/observations',
          type: 'safety',
        })
      })
    }

    // Sort by timestamp DESC
    merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

    setItems(merged)
    setLoading(false)
  }, [cid, projectId, projects])

  useEffect(() => {
    fetchFeed()
    // Auto-refresh every 30 seconds
    intervalRef.current = setInterval(fetchFeed, 30000)
    return () => clearInterval(intervalRef.current)
  }, [fetchFeed])

  function handleLoadMore() {
    setLoadingMore(true)
    setVisibleCount(prev => prev + 20)
    // Simulate brief delay for UX
    setTimeout(() => setLoadingMore(false), 300)
  }

  const filtered = filter === 'all'
    ? items
    : items.filter(item => item.type === filter)

  const visible = filtered.slice(0, visibleCount)
  const hasMore = filtered.length > visibleCount

  return (
    <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#1B6FC8]/10 flex items-center justify-center">
            <Activity size={16} className="text-[#1B6FC8]" />
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Recent Activity</p>
        </div>
      </div>

      {/* Filter chips */}
      <div className="px-4 py-2 flex gap-1.5 overflow-x-auto" style={{ borderBottom: '1px solid var(--border-color)' }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setVisibleCount(20) }}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors ${
              filter === f.key
                ? 'bg-[#1B6FC8] text-white'
                : 'hover:bg-black/5'
            }`}
            style={filter !== f.key ? { color: 'var(--text-muted)', backgroundColor: 'transparent' } : undefined}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-start gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-lg bg-gray-200 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-3/4" />
                <div className="h-2.5 bg-gray-100 rounded w-1/2" />
              </div>
              <div className="h-2.5 bg-gray-100 rounded w-12 shrink-0" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="px-4 py-10 text-center">
          <Activity size={28} className="mx-auto mb-2 opacity-30" style={{ color: 'var(--text-muted)' }} />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Activity will appear here as things happen
          </p>
        </div>
      )}

      {/* Feed list */}
      {!loading && visible.length > 0 && (
        <div>
          {visible.map((item, idx) => {
            const ItemIcon = item.Icon
            return (
              <button
                key={item.id}
                onClick={() => item.link && navigate(item.link)}
                className="w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-black/[0.03]"
                style={{
                  backgroundColor: idx % 2 === 1 ? 'rgba(0,0,0,0.015)' : 'transparent',
                  borderBottom: '1px solid var(--border-color)',
                  cursor: item.link ? 'pointer' : 'default',
                }}
                title={formatAbsoluteTime(item.timestamp)}
              >
                {/* Icon */}
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${item.iconColor}15` }}
                >
                  <ItemIcon size={15} style={{ color: item.iconColor }} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                      {item.description}
                    </p>
                  )}
                </div>

                {/* Actor + time */}
                <div className="text-right shrink-0 ml-2">
                  {item.actorName && (
                    <p className="text-[11px] font-medium truncate max-w-[80px]" style={{ color: 'var(--text-primary)' }}>
                      {item.actorName}
                    </p>
                  )}
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {formatRelativeTime(item.timestamp)}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Load more */}
      {!loading && hasMore && (
        <div className="px-4 py-3 text-center" style={{ borderTop: '1px solid var(--border-color)' }}>
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold rounded-lg transition-colors hover:bg-black/5"
            style={{ color: 'var(--primary-color, #1B6FC8)' }}
          >
            {loadingMore ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <ChevronDown size={13} />
            )}
            Load more
          </button>
        </div>
      )}
    </div>
  )
}
