import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import {
  MapPin, FileText, Users, CheckSquare, BookOpen, MessageSquare,
  AlertTriangle, Clock, CheckCircle2, ChevronRight, Shield, Activity,
  LogIn, TrendingUp, FolderOpen, Layers
} from 'lucide-react'
import OnboardingChecklist from '../components/OnboardingChecklist'
import TrialBanner from '../components/TrialBanner'

export default function AppHome() {
  const navigate = useNavigate()
  const { user, company } = useCompany()
  const cid = user?.company_id
  const [loading, setLoading] = useState(true)
  const [s, setS] = useState({})

  useEffect(() => { if (cid) loadDashboard() }, [cid])

  async function loadDashboard() {
    setLoading(true)
    const today = new Date()
    const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0)
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7)

    const [projects, operatives, snags, sigs, attendance, diary, inspections, chats] = await Promise.all([
      supabase.from('projects').select('id').eq('company_id', cid),
      supabase.from('operatives').select('id, cscs_expiry, ipaf_expiry, pasma_expiry, sssts_expiry, first_aid_expiry').eq('company_id', cid),
      supabase.from('snags').select('id, status, due_date, created_at').eq('company_id', cid),
      supabase.from('signatures').select('id').eq('company_id', cid),
      supabase.from('site_attendance').select('id, type, operative_id').eq('company_id', cid).gte('recorded_at', todayStart.toISOString()),
      supabase.from('site_diary').select('id, date').eq('company_id', cid).order('date', { ascending: false }).limit(1),
      supabase.from('inspections').select('id, status').eq('company_id', cid),
      supabase.from('chat_messages').select('id').eq('company_id', cid).eq('read_by_manager', false).eq('sender_type', 'operative'),
    ])

    const allSnags = snags.data || []
    const open = allSnags.filter(s => s.status === 'open')
    const overdue = open.filter(s => s.due_date && new Date(s.due_date) < today)
    const closedWeek = allSnags.filter(s => s.status === 'completed' && new Date(s.created_at) >= weekAgo)
    const raisedWeek = allSnags.filter(s => new Date(s.created_at) >= weekAgo)

    const ops = operatives.data || []
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
      projects: projects.data?.length || 0,
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

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: 'var(--primary-color)' }} /></div>
  }

  // Collect alerts
  const alerts = []
  if (s.overdue > 0) alerts.push({ msg: `${s.overdue} overdue snag${s.overdue !== 1 ? 's' : ''}`, icon: AlertTriangle, color: '#DA3633', bg: '#FEF2F2', border: '#FECACA', path: '/app/snags' })
  if (s.expiredCerts > 0) alerts.push({ msg: `${s.expiredCerts} expired certification${s.expiredCerts !== 1 ? 's' : ''}`, icon: Shield, color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', path: '/app/workers' })
  if (s.failedInsp > 0) alerts.push({ msg: `${s.failedInsp} failed inspection${s.failedInsp !== 1 ? 's' : ''}`, icon: CheckSquare, color: '#DA3633', bg: '#FEF2F2', border: '#FECACA', path: '/app/inspections' })
  if (s.unreadChats > 0) alerts.push({ msg: `${s.unreadChats} unread message${s.unreadChats !== 1 ? 's' : ''}`, icon: MessageSquare, color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', path: '/app/messages' })

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── Trial Banner + Onboarding Checklist ── */}
      <TrialBanner />
      <OnboardingChecklist />

      {/* ── Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{greeting}, {user?.name?.split(' ')[0]}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
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

      {/* ── Top row: Site + Snags ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Site today */}
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Site Today</p>
            <button onClick={() => navigate('/app/attendance')} className="text-[10px] font-medium" style={{ color: 'var(--primary-color)' }}>View attendance →</button>
          </div>
          <div className="p-5 grid grid-cols-3 gap-4">
            <button onClick={() => navigate('/app/attendance')} className="text-center hover:opacity-70 transition-opacity">
              <div className="w-12 h-12 rounded-full bg-[#2EA043]/10 flex items-center justify-center mx-auto mb-2">
                <Users size={20} className="text-[#2EA043]" />
              </div>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{s.onSite}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>On site now</p>
            </button>
            <button onClick={() => navigate('/app/attendance')} className="text-center hover:opacity-70 transition-opacity">
              <div className="w-12 h-12 rounded-full bg-[#1B6FC8]/10 flex items-center justify-center mx-auto mb-2">
                <LogIn size={20} className="text-[#1B6FC8]" />
              </div>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{s.signIns}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Sign-ins today</p>
            </button>
            <button onClick={() => navigate('/app/workers')} className="text-center hover:opacity-70 transition-opacity">
              <div className="w-12 h-12 rounded-full bg-[#7C3AED]/10 flex items-center justify-center mx-auto mb-2">
                <Users size={20} className="text-[#7C3AED]" />
              </div>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{s.workers}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Total workers</p>
            </button>
          </div>
        </div>

        {/* Snags */}
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Snags</p>
            <button onClick={() => navigate('/app/snags')} className="text-[10px] font-medium" style={{ color: 'var(--primary-color)' }}>View all →</button>
          </div>
          <div className="p-5 grid grid-cols-3 gap-4">
            <button onClick={() => navigate('/app/snags')} className="text-center hover:opacity-70 transition-opacity">
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{s.openSnags}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Open</p>
            </button>
            <button onClick={() => navigate('/app/snags')} className="text-center hover:opacity-70 transition-opacity">
              <p className={`text-2xl font-bold ${s.overdue > 0 ? 'text-[#DA3633]' : ''}`} style={s.overdue === 0 ? { color: 'var(--text-primary)' } : {}}>{s.overdue}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Overdue</p>
            </button>
            <button onClick={() => navigate('/app/performance')} className="text-center hover:opacity-70 transition-opacity">
              <p className="text-2xl font-bold text-[#2EA043]">{s.closedWeek}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Closed this week</p>
            </button>
          </div>
          {s.raisedWeek > 0 && (
            <button onClick={() => navigate('/app/performance')} className="px-5 pb-4 w-full text-left hover:opacity-70 transition-opacity">
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-main)' }}>
                <div className="h-full bg-[#2EA043] rounded-full transition-all" style={{ width: `${Math.min(100, s.raisedWeek > 0 ? (s.closedWeek / s.raisedWeek) * 100 : 0)}%` }} />
              </div>
              <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                {s.closedWeek} of {s.raisedWeek} raised this week resolved ({s.raisedWeek > 0 ? Math.round((s.closedWeek / s.raisedWeek) * 100) : 0}%)
              </p>
            </button>
          )}
        </div>
      </div>

      {/* ── Navigation grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {[
          { label: 'Projects', icon: FolderOpen, value: s.projects, path: '/app/projects', color: '#1B6FC8' },
          { label: 'Snag Drawings', icon: MapPin, path: '/app/drawings', color: '#DA3633' },
          { label: 'Progress', icon: Layers, path: '/app/progress', color: '#2EA043' },
          { label: 'Site Diary', icon: BookOpen, path: '/app/diary', color: '#0891B2', dot: !s.diaryToday },
          { label: 'Inspections', icon: CheckSquare, value: s.totalInsp, path: '/app/inspections', color: '#059669' },
          { label: 'Performance', icon: Activity, path: '/app/performance', color: '#4F46E5' },
        ].map(item => (
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

      {/* ── Bottom row: Certs + Diary ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Certifications */}
        <button onClick={() => navigate('/app/workers')} className="rounded-xl border p-5 text-left transition-all hover:shadow-md"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Certifications</p>
            <Shield size={16} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div className="flex items-end gap-6">
            <div>
              <p className={`text-3xl font-bold ${s.expiredCerts > 0 ? 'text-[#DA3633]' : 'text-[#2EA043]'}`}>{s.expiredCerts}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Expired</p>
            </div>
            <div>
              <p className={`text-3xl font-bold ${s.expiringCerts > 0 ? 'text-[#D97706]' : ''}`} style={s.expiringCerts === 0 ? { color: 'var(--text-primary)' } : {}}>{s.expiringCerts}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Expiring in 30 days</p>
            </div>
            <div>
              <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{s.workers}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total workers</p>
            </div>
          </div>
        </button>

        {/* Signatures */}
        <button onClick={() => navigate('/app/portal')} className="rounded-xl border p-5 text-left transition-all hover:shadow-md"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Document Sign-Off</p>
            <FileText size={16} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div className="flex items-end gap-6">
            <div>
              <p className="text-3xl font-bold text-[#2EA043]">{s.sigs}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Signatures</p>
            </div>
            <div>
              <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{s.projects}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Projects</p>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
