import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import { useProject } from '../lib/ProjectContext'
import {
  MapPin, FileText, Users, CheckSquare, BookOpen, MessageSquare,
  AlertTriangle, Clock, CheckCircle2, ChevronRight, Shield, Activity,
  LogIn, TrendingUp, FolderOpen, Layers
} from 'lucide-react'
import OnboardingChecklist from '../components/OnboardingChecklist'
import TrialBanner from '../components/TrialBanner'
import PCCountdown from '../components/PCCountdown'
import WeatherWidget from '../components/WeatherWidget'
import TodayOnSite from '../components/TodayOnSite'
import ActivityFeed from '../components/ActivityFeed'
import DaysWithoutIncident from '../components/DaysWithoutIncident'
import IncidentForm from '../components/IncidentForm'

export default function AppHome() {
  const navigate = useNavigate()
  const { user } = useCompany()
  const { projectId, projectName, projects: ctxProjects } = useProject()
  const cid = user?.company_id
  const vs = user?.visible_sections || null
  const canSee = (section) => !vs || vs.length === 0 || vs.includes(section)
  const [loading, setLoading] = useState(true)
  const [s, setS] = useState({})
  const [fullProjects, setFullProjects] = useState([])
  const [showIncidentForm, setShowIncidentForm] = useState(false)

  async function loadDashboard() {
    setLoading(true)
    const today = new Date()
    const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0)
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7)

    const [projectsFull, operatives, snags, sigs, attendance, diary, inspections, chats] = await Promise.all([
      supabase.from('projects').select('*').eq('company_id', cid),
      projectId
        ? supabase.from('operative_projects').select('operatives(id, cscs_expiry, ipaf_expiry, pasma_expiry, sssts_expiry, first_aid_expiry)').eq('project_id', projectId)
        : supabase.from('operatives').select('id, cscs_expiry, ipaf_expiry, pasma_expiry, sssts_expiry, first_aid_expiry').eq('company_id', cid),
      (() => { let q = supabase.from('snags').select('id, status, due_date, created_at, updated_at, project_id').eq('company_id', cid); if (projectId) q = q.eq('project_id', projectId); return q })(),
      supabase.from('signatures').select('id').eq('company_id', cid),
      (() => { let q = supabase.from('site_attendance').select('id, type, operative_id, operative_name').eq('company_id', cid).gte('recorded_at', todayStart.toISOString()); if (projectId) q = q.eq('project_id', projectId); return q })(),
      (() => { let q = supabase.from('site_diary').select('id, date').eq('company_id', cid).order('date', { ascending: false }).limit(1); if (projectId) q = q.eq('project_id', projectId); return q })(),
      (() => { let q = supabase.from('inspections').select('id, status').eq('company_id', cid); if (projectId) q = q.eq('project_id', projectId); return q })(),
      supabase.from('chat_messages').select('id').eq('company_id', cid).eq('read_by_manager', false).eq('sender_type', 'operative'),
    ])

    setFullProjects(projectsFull.data || [])

    const allSnags = snags.data || []
    const open = allSnags.filter(s => s.status === 'open')
    const overdue = open.filter(s => s.due_date && new Date(s.due_date) < today)
    const closedWeek = allSnags.filter(s => s.status === 'completed' && new Date(s.updated_at || s.created_at) >= weekAgo)
    const raisedWeek = allSnags.filter(s => new Date(s.created_at) >= weekAgo)

    const ops = projectId
      ? (operatives.data || []).map(r => r.operatives).filter(Boolean)
      : (operatives.data || [])
    const thirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
    const expiredCerts = ops.filter(op => [op.cscs_expiry, op.ipaf_expiry, op.pasma_expiry, op.sssts_expiry, op.first_aid_expiry].filter(Boolean).some(d => new Date(d) < today)).length
    const expiringCerts = ops.filter(op => [op.cscs_expiry, op.ipaf_expiry, op.pasma_expiry, op.sssts_expiry, op.first_aid_expiry].filter(Boolean).some(d => { const dt = new Date(d); return dt >= today && dt <= thirtyDays })).length

    const att = attendance.data || []
    const signInIds = new Set(att.filter(a => a.type === 'sign_in').map(a => a.operative_id))
    const signOutIds = new Set(att.filter(a => a.type === 'sign_out').map(a => a.operative_id))
    const onSite = [...signInIds].filter(id => !signOutIds.has(id)).length

    const insp = inspections.data || []
    const diaryToday = diary.data?.[0]?.date === today.toISOString().split('T')[0]

    setS({
      projects: (projectsFull.data || []).length,
      workers: ops.length,
      onSite: Math.max(0, onSite),
      signIns: att.filter(a => a.type === 'sign_in').length,
      openSnags: open.length,
      overdue: overdue.length,
      closedWeek: closedWeek.length,
      raisedWeek: raisedWeek.length,
      totalSnags: allSnags.length,
      sigs: sigs.data?.length || 0,
      expiredCerts,
      expiringCerts,
      failedInsp: insp.filter(i => i.status === 'failed').length,
      totalInsp: insp.length,
      unreadChats: chats.data?.length || 0,
      diaryToday,
    })
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (cid) loadDashboard() }, [cid, projectId])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // Skeleton loader
  function Skeleton({ className = '' }) {
    return <div className={`animate-pulse rounded-lg ${className}`} style={{ backgroundColor: 'var(--border-color)' }} />
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-5 p-1">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-48" />
        <div className="flex gap-3 overflow-hidden">
          {[1,2,3].map(i => <Skeleton key={i} className="h-24 min-w-[200px] flex-1" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    )
  }

  // Alerts
  const alerts = []
  if (s.overdue > 0 && canSee('Drawings & Snags')) alerts.push({ msg: `${s.overdue} overdue snag${s.overdue !== 1 ? 's' : ''}`, icon: AlertTriangle, color: '#DA3633', bg: '#FEF2F2', border: '#FECACA', path: '/app/snags' })
  if (s.expiredCerts > 0 && canSee('People')) alerts.push({ msg: `${s.expiredCerts} expired certification${s.expiredCerts !== 1 ? 's' : ''}`, icon: Shield, color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', path: '/app/workers' })
  if (s.failedInsp > 0 && canSee('Projects')) alerts.push({ msg: `${s.failedInsp} failed inspection${s.failedInsp !== 1 ? 's' : ''}`, icon: CheckSquare, color: '#DA3633', bg: '#FEF2F2', border: '#FECACA', path: '/app/inspections' })
  if (s.unreadChats > 0 && canSee('People')) alerts.push({ msg: `${s.unreadChats} unread message${s.unreadChats !== 1 ? 's' : ''}`, icon: MessageSquare, color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', path: '/app/messages' })

  const visibleProjects = projectId ? fullProjects.filter(p => p.id === projectId) : fullProjects

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      <TrialBanner />
      <OnboardingChecklist />

      {/* ── Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{greeting}, {user?.name?.split(' ')[0]}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {projectName ? projectName + ' — ' : ''}{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        {!s.diaryToday && (
          <button onClick={() => navigate('/app/diary')} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0891B2]/10 text-[#0891B2] hover:bg-[#0891B2]/20 transition-colors">
            <BookOpen size={13} /> Record today's diary
          </button>
        )}
      </div>

      {/* ── Alerts ── */}
      {alerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {alerts.map((a, i) => (
            <button key={i} onClick={() => navigate(a.path)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors hover:opacity-80"
              style={{ backgroundColor: a.bg, border: `1px solid ${a.border}`, color: a.color }}>
              <a.icon size={13} /> {a.msg}
            </button>
          ))}
        </div>
      )}

      {/* ── PC Countdown ── */}
      <PCCountdown projects={visibleProjects} />

      {/* ── Live widgets row: Weather | Today on Site | Days Without Incident ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <WeatherWidget projects={visibleProjects} projectId={projectId} />
        {canSee('People') && <TodayOnSite projects={visibleProjects} projectId={projectId} />}
        <DaysWithoutIncident projects={visibleProjects} projectId={projectId} onLogIncident={() => setShowIncidentForm(true)} />
      </div>

      {/* ── Activity feed + stat cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Activity feed — 2/3 */}
        <div className="lg:col-span-2">
          <ActivityFeed projects={visibleProjects} projectId={projectId} />
        </div>

        {/* Stat cards — 1/3 stacked */}
        <div className="space-y-4">

          {/* Snags */}
          {canSee('Drawings & Snags') && <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Snags</p>
              <button onClick={() => navigate('/app/snags')} className="text-[10px] font-medium" style={{ color: 'var(--primary-color)' }}>View all →</button>
            </div>
            <div className="p-4 grid grid-cols-3 gap-3">
              <button onClick={() => navigate('/app/snags')} className="text-center hover:opacity-70 transition-opacity">
                <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{s.openSnags}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Open</p>
              </button>
              <button onClick={() => navigate('/app/snags')} className="text-center hover:opacity-70 transition-opacity">
                <p className={`text-xl font-bold ${s.overdue > 0 ? 'text-[#DA3633]' : ''}`} style={s.overdue === 0 ? { color: 'var(--text-primary)' } : {}}>{s.overdue}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Overdue</p>
              </button>
              <button onClick={() => navigate('/app/performance')} className="text-center hover:opacity-70 transition-opacity">
                <p className="text-xl font-bold text-[#2EA043]">{s.closedWeek}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Closed this week</p>
              </button>
            </div>
            {s.raisedWeek > 0 && (
              <div className="px-4 pb-3">
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-main)' }}>
                  <div className="h-full bg-[#2EA043] rounded-full transition-all" style={{ width: `${Math.min(100, s.raisedWeek > 0 ? (s.closedWeek / s.raisedWeek) * 100 : 0)}%` }} />
                </div>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  {s.closedWeek}/{s.raisedWeek} raised this week resolved
                </p>
              </div>
            )}
          </div>}

          {/* Certifications */}
          {canSee('People') && <button onClick={() => navigate('/app/workers')} className="w-full rounded-xl border p-4 text-left transition-all hover:shadow-md"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Certifications</p>
              <Shield size={14} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div className="flex items-end gap-4">
              <div>
                <p className={`text-xl font-bold ${s.expiredCerts > 0 ? 'text-[#DA3633]' : 'text-[#2EA043]'}`}>{s.expiredCerts}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Expired</p>
              </div>
              <div>
                <p className={`text-xl font-bold ${s.expiringCerts > 0 ? 'text-[#D97706]' : ''}`} style={s.expiringCerts === 0 ? { color: 'var(--text-primary)' } : {}}>{s.expiringCerts}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Expiring 30d</p>
              </div>
              <div>
                <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{s.workers}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Workers</p>
              </div>
            </div>
          </button>}

          {/* Document Sign-Off */}
          {canSee('Documents') && <button onClick={() => navigate('/app/portal')} className="w-full rounded-xl border p-4 text-left transition-all hover:shadow-md"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Document Sign-Off</p>
              <FileText size={14} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div className="flex items-end gap-4">
              <div>
                <p className="text-xl font-bold text-[#2EA043]">{s.sigs}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Signatures</p>
              </div>
              <div>
                <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{s.projects}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Projects</p>
              </div>
            </div>
          </button>}
        </div>
      </div>

      {/* ── Navigation grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {[
          { label: 'Projects', icon: FolderOpen, value: s.projects, path: '/app/projects', color: '#1B6FC8', section: 'Projects' },
          { label: 'Snag Drawings', icon: MapPin, path: '/app/drawings', color: '#DA3633', section: 'Drawings & Snags' },
          { label: 'Progress', icon: Layers, path: '/app/progress', color: '#2EA043', section: 'Drawings & Snags' },
          { label: 'Site Diary', icon: BookOpen, path: '/app/diary', color: '#0891B2', dot: !s.diaryToday, section: 'Projects' },
          { label: 'Inspections', icon: CheckSquare, value: s.totalInsp, path: '/app/inspections', color: '#059669', section: 'Projects' },
          { label: 'Performance', icon: Activity, path: '/app/performance', color: '#4F46E5', section: 'Drawings & Snags' },
        ].filter(item => canSee(item.section)).map(item => (
          <button key={item.path} onClick={() => navigate(item.path)}
            className="relative flex flex-col items-center gap-1.5 p-3.5 rounded-xl border transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            {item.dot && <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />}
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${item.color}10` }}>
              <item.icon size={18} style={{ color: item.color }} />
            </div>
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>{item.label}</span>
            {item.value != null && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{item.value}</span>}
          </button>
        ))}
      </div>

      {/* ── Incident form modal ── */}
      {showIncidentForm && (
        <IncidentForm
          projects={fullProjects}
          projectId={projectId}
          onClose={() => setShowIncidentForm(false)}
          onSaved={() => { /* DaysWithoutIncident will refresh via its own interval */ }}
        />
      )}
    </div>
  )
}
