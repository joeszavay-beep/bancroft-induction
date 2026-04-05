import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import {
  MapPin, FileText, Users, CheckSquare, BookOpen, MessageSquare,
  AlertTriangle, Clock, CheckCircle2, TrendingUp, TrendingDown,
  ArrowRight, Calendar, Shield, CloudSun, ChevronRight, Activity
} from 'lucide-react'

export default function AppHome() {
  const navigate = useNavigate()
  const { user, company } = useCompany()
  const cid = user?.company_id
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({})

  useEffect(() => { if (cid) loadDashboard() }, [cid])

  async function loadDashboard() {
    setLoading(true)
    const today = new Date()
    const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0)
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7)

    const [projects, operatives, snags, docs, sigs, attendance, diary, inspections, chats] = await Promise.all([
      supabase.from('projects').select('id').eq('company_id', cid),
      supabase.from('operatives').select('id, cscs_expiry, ipaf_expiry, pasma_expiry, sssts_expiry, first_aid_expiry').eq('company_id', cid),
      supabase.from('snags').select('id, status, due_date, created_at').eq('company_id', cid),
      supabase.from('documents').select('id').eq('company_id', cid),
      supabase.from('signatures').select('id, signed_at').eq('company_id', cid),
      supabase.from('site_attendance').select('id, type, recorded_at').eq('company_id', cid).gte('recorded_at', todayStart.toISOString()),
      supabase.from('site_diary').select('id, date').eq('company_id', cid).order('date', { ascending: false }).limit(1),
      supabase.from('inspections').select('id, status, created_at').eq('company_id', cid),
      supabase.from('chat_messages').select('id').eq('company_id', cid).eq('read_by_manager', false).eq('sender_type', 'operative'),
    ])

    const allSnags = snags.data || []
    const openSnags = allSnags.filter(s => s.status === 'open')
    const overdueSnags = openSnags.filter(s => s.due_date && new Date(s.due_date) < today)
    const completedThisWeek = allSnags.filter(s => s.status === 'completed' && new Date(s.created_at) >= weekAgo)
    const raisedThisWeek = allSnags.filter(s => new Date(s.created_at) >= weekAgo)

    const allOps = operatives.data || []
    const thirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
    const expiringCerts = allOps.filter(op => {
      const dates = [op.cscs_expiry, op.ipaf_expiry, op.pasma_expiry, op.sssts_expiry, op.first_aid_expiry].filter(Boolean)
      return dates.some(d => new Date(d) <= thirtyDays)
    })
    const expiredCerts = allOps.filter(op => {
      const dates = [op.cscs_expiry, op.ipaf_expiry, op.pasma_expiry, op.sssts_expiry, op.first_aid_expiry].filter(Boolean)
      return dates.some(d => new Date(d) < today)
    })

    const todayAttendance = attendance.data || []
    const signIns = todayAttendance.filter(a => a.type === 'sign_in')
    const signOuts = todayAttendance.filter(a => a.type === 'sign_out')
    const onSiteCount = new Set(signIns.map(a => a.operative_id || a.id)).size - new Set(signOuts.map(a => a.operative_id || a.id)).size

    const allInspections = inspections.data || []
    const failedInspections = allInspections.filter(i => i.status === 'failed')

    const lastDiary = diary.data?.[0]
    const diaryToday = lastDiary?.date === today.toISOString().split('T')[0]

    const unreadChats = chats.data?.length || 0

    const pendingSigs = (docs.data?.length || 0) * (allOps.length || 0) - (sigs.data?.length || 0)

    setStats({
      projects: projects.data?.length || 0,
      operatives: allOps.length,
      openSnags: openSnags.length,
      overdueSnags: overdueSnags.length,
      completedThisWeek: completedThisWeek.length,
      raisedThisWeek: raisedThisWeek.length,
      totalSnags: allSnags.length,
      expiringCerts: expiringCerts.length,
      expiredCerts: expiredCerts.length,
      onSiteToday: Math.max(0, onSiteCount),
      signInsToday: signIns.length,
      diaryToday,
      failedInspections: failedInspections.length,
      totalInspections: allInspections.length,
      unreadChats,
      pendingSigs: Math.max(0, pendingSigs),
      totalSigs: sigs.data?.length || 0,
    })
    setLoading(false)
  }

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: 'var(--primary-color)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{greeting}, {user?.name?.split(' ')[0]}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          {company?.name} — {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Alerts */}
      {(stats.overdueSnags > 0 || stats.expiredCerts > 0 || stats.failedInspections > 0) && (
        <div className="space-y-2">
          {stats.overdueSnags > 0 && (
            <button onClick={() => navigate('/app/snags')} className="w-full flex items-center gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-left hover:bg-red-100 transition-colors">
              <AlertTriangle size={18} className="text-red-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">{stats.overdueSnags} overdue snag{stats.overdueSnags !== 1 ? 's' : ''}</p>
                <p className="text-xs text-red-600">Require immediate attention</p>
              </div>
              <ChevronRight size={16} className="text-red-400" />
            </button>
          )}
          {stats.expiredCerts > 0 && (
            <button onClick={() => navigate('/app/workers')} className="w-full flex items-center gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-left hover:bg-amber-100 transition-colors">
              <Shield size={18} className="text-amber-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">{stats.expiredCerts} worker{stats.expiredCerts !== 1 ? 's' : ''} with expired certifications</p>
                <p className="text-xs text-amber-600">{stats.expiringCerts > stats.expiredCerts ? `${stats.expiringCerts - stats.expiredCerts} more expiring within 30 days` : 'Check All Workers page'}</p>
              </div>
              <ChevronRight size={16} className="text-amber-400" />
            </button>
          )}
          {stats.failedInspections > 0 && (
            <button onClick={() => navigate('/app/inspections')} className="w-full flex items-center gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-left hover:bg-red-100 transition-colors">
              <CheckSquare size={18} className="text-red-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">{stats.failedInspections} failed inspection{stats.failedInspections !== 1 ? 's' : ''}</p>
                <p className="text-xs text-red-600">Remedial work required</p>
              </div>
              <ChevronRight size={16} className="text-red-400" />
            </button>
          )}
        </div>
      )}

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard icon={Users} label="On Site Today" value={stats.onSiteToday} sub={`${stats.signInsToday} sign-ins`} color="#2EA043" onClick={() => navigate('/app/attendance')} />
        <MetricCard icon={MapPin} label="Open Snags" value={stats.openSnags} sub={`${stats.overdueSnags} overdue`} color={stats.overdueSnags > 0 ? '#DA3633' : '#1B6FC8'} onClick={() => navigate('/app/snags')} />
        <MetricCard icon={FileText} label="Signatures" value={stats.totalSigs} sub={stats.pendingSigs > 0 ? `${stats.pendingSigs} pending` : 'All signed'} color="#7C3AED" onClick={() => navigate('/app/portal')} />
        <MetricCard icon={MessageSquare} label="Messages" value={stats.unreadChats} sub={stats.unreadChats > 0 ? 'Unread' : 'All read'} color={stats.unreadChats > 0 ? '#DC2626' : '#6B7A99'} onClick={() => navigate('/app/messages')} />
      </div>

      {/* Snag activity this week */}
      <div className="rounded-xl border p-5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Snags This Week</h3>
          <button onClick={() => navigate('/app/snags')} className="text-xs font-medium hover:underline" style={{ color: 'var(--primary-color)' }}>View all →</button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{stats.raisedThisWeek}</p>
            <p className="text-xs flex items-center justify-center gap-1 mt-1" style={{ color: 'var(--text-muted)' }}>
              <TrendingUp size={10} /> Raised
            </p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-[#2EA043]">{stats.completedThisWeek}</p>
            <p className="text-xs flex items-center justify-center gap-1 mt-1" style={{ color: 'var(--text-muted)' }}>
              <CheckCircle2 size={10} /> Closed
            </p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-bold ${stats.overdueSnags > 0 ? 'text-[#DA3633]' : ''}`} style={stats.overdueSnags === 0 ? { color: 'var(--text-primary)' } : {}}>{stats.overdueSnags}</p>
            <p className="text-xs flex items-center justify-center gap-1 mt-1" style={{ color: 'var(--text-muted)' }}>
              <Clock size={10} /> Overdue
            </p>
          </div>
        </div>
      </div>

      {/* Quick actions grid */}
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Add Worker', icon: Users, path: '/app/workers/new', color: '#1B6FC8' },
            { label: 'Site Diary', icon: BookOpen, path: '/app/diary', color: '#0891B2', alert: !stats.diaryToday },
            { label: 'Inspections', icon: CheckSquare, path: '/app/inspections', color: '#059669' },
            { label: 'Performance', icon: Activity, path: '/app/performance', color: '#4F46E5' },
          ].map(a => (
            <button key={a.path} onClick={() => navigate(a.path)}
              className="relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all hover:shadow-md"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              {a.alert && <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />}
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${a.color}10` }}>
                <a.icon size={20} style={{ color: a.color }} />
              </div>
              <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <OverviewCard label="Projects" value={stats.projects} icon={MapPin} onClick={() => navigate('/app/projects')} />
        <OverviewCard label="Workers" value={stats.operatives} icon={Users} sub={stats.expiringCerts > 0 ? `${stats.expiringCerts} cert warnings` : null} onClick={() => navigate('/app/workers')} />
        <OverviewCard label="Inspections" value={stats.totalInspections} icon={CheckSquare} sub={stats.failedInspections > 0 ? `${stats.failedInspections} failed` : null} onClick={() => navigate('/app/inspections')} />
      </div>

      {/* Diary prompt */}
      {!stats.diaryToday && (
        <button onClick={() => navigate('/app/diary')} className="w-full flex items-center gap-3 p-4 rounded-xl border border-dashed transition-colors hover:border-[#0891B2]"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          <div className="w-10 h-10 rounded-lg bg-[#0891B2]/10 flex items-center justify-center shrink-0">
            <BookOpen size={20} className="text-[#0891B2]" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Today's diary not recorded</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Tap to create today's site diary entry</p>
          </div>
          <ArrowRight size={16} style={{ color: 'var(--text-muted)' }} />
        </button>
      )}
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, sub, color, onClick }) {
  return (
    <button onClick={onClick} className="rounded-xl border p-4 text-left transition-all hover:shadow-md"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
      <Icon size={18} style={{ color }} className="mb-2" />
      <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
      <p className="text-xs font-medium mt-0.5" style={{ color }}>{label}</p>
      {sub && <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </button>
  )
}

function OverviewCard({ label, value, icon: Icon, sub, onClick }) {
  return (
    <button onClick={onClick} className="rounded-xl border p-4 text-left transition-all hover:shadow-md flex items-center gap-3"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--bg-main)' }}>
        <Icon size={18} style={{ color: 'var(--text-muted)' }} />
      </div>
      <div>
        <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
        {sub && <p className="text-[10px] text-[#DA3633] font-medium">{sub}</p>}
      </div>
    </button>
  )
}
