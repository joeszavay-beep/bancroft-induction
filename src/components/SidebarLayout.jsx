import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import { useTheme } from '../lib/ThemeContext'
import OfflineIndicator from './OfflineIndicator'
import HelpWidget from './HelpWidget'
import SyncBadge from './SyncBadge'
import NotificationBell from './NotificationBell'
import DemoBanner from './DemoBanner'
import {
  Menu, ChevronDown, ChevronRight, LogOut, Home, UserPlus, Mail, Users,
  BarChart3, FolderOpen, MapPin, MessageSquare, FileText, ClipboardList, Sun, Moon,
  Globe, Settings, User, Shield, Layers, BookOpen, CheckSquare, Activity, Box, CalendarRange,
  Briefcase, PlusCircle, CalendarCheck, Building2, Calendar, Star, Link2, PoundSterling, Scissors
} from 'lucide-react'
import { getSession } from '../lib/storage'

const NAV_SECTIONS = [
  {
    title: 'People',
    items: [
      { label: 'All Workers', path: '/app/workers', icon: Users },
      { label: 'Invite Workers', path: '/app/invite-workers', icon: Mail },
      { label: 'Pipeline', path: '/app/pipeline', icon: BarChart3 },
      { label: 'Site Attendance', path: '/app/attendance', icon: Activity },
    ],
  },
  {
    title: 'Projects',
    items: [
      { label: 'All Projects', path: '/app/projects', icon: FolderOpen },
      { label: 'Site Diary', path: '/app/diary', icon: BookOpen },
      { label: 'Inspections', path: '/app/inspections', icon: CheckSquare, feature: 'inspections' },
    ],
  },
  {
    title: 'Documents',
    items: [
      { label: 'Document Hub', path: '/app/document-hub', icon: FolderOpen },
      { label: 'PDF Tools', path: '/app/pdf-tools', icon: Scissors },
      { label: 'Sign-off Portal', path: '/app/portal', icon: Globe, feature: 'portal' },
    ],
  },
  {
    title: 'Drawings & Snags',
    items: [
      { label: 'Progress Drawings', path: '/app/progress', icon: Layers, feature: 'progress_drawings' },
      { label: 'Snag Overview', path: '/app/snags', icon: MapPin, feature: 'snagging' },
      { label: 'Performance', path: '/app/performance', icon: BarChart3, feature: 'snagging' },
      { label: 'BIM Models', path: '/app/bim', icon: Box, feature: 'bim_models' },
    ],
  },
  {
    title: 'Programme',
    feature: 'programme_tracking',
    items: [
      { label: 'Dashboard', path: '/app/programme', icon: CalendarRange },
      { label: 'Master Programme', path: '/app/master-programme', icon: CalendarRange },
    ],
  },
  {
    title: 'Commercial',
    feature: 'commercial_module',
    items: [
      { label: 'Dashboard', path: '/app/sub-dashboard', icon: PoundSterling },
      { label: 'Jobs', path: '/app/jobs', icon: Briefcase },
      { label: 'Worker Invoices', path: '/app/worker-invoices', icon: FileText },
    ],
  },
  {
    title: 'Labour',
    feature: 'labour_marketplace',
    items: [
      { label: 'Requests', path: '/app/labour-requests', icon: Briefcase },
      { label: 'Agency Network', path: '/app/agency-connections', icon: Link2, hideForAgency: true },
      { label: 'Bookings', path: '/app/bookings', icon: CalendarCheck },
    ],
  },
  {
    title: 'H&S',
    items: [
      { label: 'Toolbox Talks', path: '/app/toolbox', icon: MessageSquare },
      { label: 'Permits to Work', path: '/app/permits', icon: Shield, feature: 'permits_to_work' },
      { label: 'H&S Reports', path: '/app/hs-reports', icon: ClipboardList },
    ],
  },
  {
    title: 'Agency',
    role: 'agency',
    items: [
      { label: 'Dashboard', path: '/app/agency', icon: Building2 },
      { label: 'Operatives', path: '/app/agency/operatives', icon: Users },
      { label: 'Requests', path: '/app/agency/requests', icon: FileText },
      { label: 'Bookings', path: '/app/agency/bookings', icon: Calendar },
    ],
  },
]

const ADMIN_SECTION = {
  title: 'Admin',
  items: [
    { label: 'User Accounts', path: '/app/admin/accounts', icon: Shield },
    { label: 'System Settings', path: '/app/admin/settings', icon: Settings },
  ],
}

function loadFavourites() {
  try { return JSON.parse(localStorage.getItem('coresite_nav_favourites') || '[]') } catch { return [] }
}

export default function SidebarLayout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [favourites, setFavourites] = useState(loadFavourites)
  const [expandedSections, setExpandedSections] = useState(['People', 'Projects', 'Documents', 'Drawings & Snags', 'Programme', 'Commercial', 'Labour', 'H&S', 'Agency', 'Admin'])

  function toggleFavourite(path) {
    setFavourites(prev => {
      const next = prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
      localStorage.setItem('coresite_nav_favourites', JSON.stringify(next))
      return next
    })
  }

  const [isAgencyUser, setIsAgencyUser] = useState(false)

  const { company, user, logout: ctxLogout } = useCompany()
  const { isDark, toggleTheme } = useTheme()
  const managerData = user || JSON.parse(getSession('manager_data') || '{}')
  const isAdmin = managerData.role === 'admin' || managerData.role === 'super_admin'
  const isSuperAdmin = managerData.role === 'super_admin'
  const userName = managerData.name || 'User'
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const companyName = company?.name || 'Company'
  const companyLogo = company?.logo_url || null
  const sidebarColor = company?.secondary_colour || '#1A2744'

  // Check if user is linked to an agency
  useEffect(() => {
    async function checkAgency() {
      const email = managerData.email
      if (!email) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user?.email) {
          const { data } = await supabase.from('agency_users').select('id').eq('email', session.user.email).limit(1)
          setIsAgencyUser(data?.length > 0)
          return
        }
      }
      if (email) {
        const { data } = await supabase.from('agency_users').select('id').eq('email', email).limit(1)
        setIsAgencyUser(data?.length > 0)
      }
    }
    checkAgency()
  }, [managerData.email])

  function toggleSection(title) {
    setExpandedSections(prev =>
      prev.includes(title) ? prev.filter(s => s !== title) : [...prev, title]
    )
  }

  function handleLogout() {
    ctxLogout()
    navigate('/')
  }

  function isActive(path) {
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  const companyFeatures = company?.features || {}
  const isDemo = typeof window !== 'undefined' && sessionStorage.getItem('sandbox_mode') === 'true'
  // Filter sections by enabled features and user role (agency vs subcontractor)
  const filteredSections = (isAdmin ? [...NAV_SECTIONS, ADMIN_SECTION] : NAV_SECTIONS)
    .filter(section => !section.feature || companyFeatures[section.feature] !== false)
    .filter(section => {
      if (!section.role) return true // no role restriction
      if (isDemo) return true // demo users see everything
      if (section.role === 'agency') return isAgencyUser
      if (section.role === 'subcontractor') return !isAgencyUser
      return true
    })
    .map(section => ({
      ...section,
      items: section.items
        .filter(item => !item.feature || companyFeatures[item.feature] !== false)
        .filter(item => !item.hideForAgency || !isAgencyUser),
    }))
    .filter(section => section.items.length > 0)
  const allSections = filteredSections

  const sidebar = (
    <aside className="w-[280px] sm:w-[280px] lg:w-[220px] flex flex-col h-full shrink-0" style={{ backgroundColor: sidebarColor }}>
      {/* Logo */}
      <div
        onClick={() => { navigate('/app'); setMobileOpen(false) }}
        style={{ cursor: 'pointer' }}
        className="px-4 pt-5 pb-3 border-b border-white/10 hover:bg-white/5 transition-colors"
      >
        {companyLogo ? (
          <img src={companyLogo} alt={companyName} className="h-8" style={{ cursor: 'pointer' }} onError={e => { e.target.style.display = 'none'; e.target.parentElement.querySelector('.fallback-name').style.display = 'block' }} />
        ) : null}
        <span className={`text-white font-bold text-base tracking-wide ${companyLogo ? 'fallback-name hidden' : ''}`} style={{ cursor: 'pointer' }}>
          {companyName}
        </span>
      </div>

      {/* User */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[var(--primary-color)] flex items-center justify-center text-white text-xs font-bold shrink-0">
          {userInitials}
        </div>
        <div className="min-w-0">
          <p className="text-white text-sm font-medium truncate">{userName}</p>
          <p className="text-white/40 text-[10px] truncate">{managerData.role || 'Manager'}</p>
        </div>
      </div>

      {/* Nav sections — scrollable independently */}
      <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto min-h-0">
        {/* Home */}
        <button
          onClick={() => { navigate('/app'); setMobileOpen(false) }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors ${
            location.pathname === '/app'
              ? 'bg-white/10 text-white border-l-2 border-[#1B6FC8]'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <Home size={16} />
          <span>Home</span>
        </button>

        {/* Messages — standalone, always visible */}
        <button
          onClick={() => { navigate('/app/messages'); setMobileOpen(false) }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors ${
            isActive('/app/messages')
              ? 'bg-white/10 text-white border-l-2 border-[#1B6FC8]'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <MessageSquare size={16} />
          <span>Messages</span>
        </button>

        {/* Favourites section */}
        {favourites.length > 0 && (() => {
          const favItems = allSections.flatMap(s => s.items).filter(i => favourites.includes(i.path))
          if (favItems.length === 0) return null
          return (
            <div className="mb-1">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400/70 flex items-center gap-1.5">
                <Star size={10} className="fill-amber-400/70" /> Favourites
              </div>
              <div className="space-y-0.5 ml-1">
                {favItems.map(item => (
                  <button
                    key={`fav-${item.path}`}
                    onClick={() => { navigate(item.path); setMobileOpen(false) }}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[12.5px] transition-colors ${
                      isActive(item.path)
                        ? 'bg-white/10 text-white border-l-2 border-[#1B6FC8]'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <item.icon size={14} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
              <div className="border-b border-white/10 mx-3 mt-1.5 mb-0.5" />
            </div>
          )
        })()}

        {allSections.map(section => {
          const expanded = expandedSections.includes(section.title)
          const sectionActive = section.items.some(i => isActive(i.path))
          return (
            <div key={section.title}>
              <button
                onClick={() => toggleSection(section.title)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-[13px] mt-1 transition-colors ${
                  sectionActive ? 'text-white' : 'text-white/50 hover:text-white/80'
                }`}
              >
                <span className="font-semibold text-[11px] uppercase tracking-wider">{section.title}</span>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {expanded && (
                <div className="space-y-0.5 ml-1">
                  {section.items.map(item => {
                    const isFav = favourites.includes(item.path)
                    return (
                      <div key={item.path} className="flex items-center group">
                        <button
                          onClick={() => { navigate(item.path); setMobileOpen(false) }}
                          className={`flex-1 flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[12.5px] transition-colors ${
                            isActive(item.path)
                              ? 'bg-white/10 text-white border-l-2 border-[#1B6FC8] ml-0'
                              : 'text-white/50 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <item.icon size={14} />
                          <span>{item.label}</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavourite(item.path) }}
                          className={`p-1 rounded transition-all shrink-0 ${
                            isFav
                              ? 'text-amber-400 opacity-100'
                              : 'text-white/20 opacity-0 group-hover:opacity-100 hover:text-amber-400'
                          }`}
                          title={isFav ? 'Remove from favourites' : 'Add to favourites'}
                        >
                          <Star size={11} className={isFav ? 'fill-amber-400' : ''} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Sync status */}
      <SyncBadge />

      {/* Bottom */}
      <div className="px-2 py-3 border-t border-white/10 space-y-1">
        {isSuperAdmin && (
          <button
            onClick={() => { navigate('/superadmin'); setMobileOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[12.5px] text-amber-400/70 hover:text-amber-400 hover:bg-white/5 transition-colors"
          >
            <Shield size={14} />
            <span>Super Admin</span>
          </button>
        )}
        <button onClick={toggleTheme}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[12.5px] text-white/50 hover:text-white hover:bg-white/5 transition-colors">
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
          <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <button
          onClick={() => { navigate('/app/settings'); setMobileOpen(false) }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[12.5px] transition-colors ${
            isActive('/app/settings') ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'
          }`}
        >
          <Settings size={14} />
          <span>Settings</span>
        </button>
        <button
          onClick={() => { navigate('/app/account'); setMobileOpen(false) }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[12.5px] transition-colors ${
            isActive('/app/account') ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'
          }`}
        >
          <User size={14} />
          <span>My Account</span>
        </button>
        <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[12.5px] text-white/40 hover:text-red-400 hover:bg-white/5 transition-colors">
          <LogOut size={14} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )

  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: 'var(--bg-main)' }}>
      <DemoBanner />
      <div className="flex-1 flex min-h-0">
      <OfflineIndicator />
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">{sidebar}</div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full">{sidebar}</div>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-12 flex items-center justify-between px-4 shrink-0 lg:hidden" style={{ backgroundColor: sidebarColor }}>
          <button onClick={() => setMobileOpen(true)} className="p-2 -ml-1 text-white min-w-[44px] min-h-[44px] flex items-center justify-center">
            <Menu size={22} />
          </button>
          {companyLogo ? (
            <img src={companyLogo} alt={companyName} className="h-6 sm:h-7" onClick={() => navigate('/app')} style={{ cursor: 'pointer' }} />
          ) : (
            <button onClick={() => navigate('/app')} className="text-white text-xs sm:text-sm font-semibold">{companyName.toUpperCase()}</button>
          )}
          <div className="w-7 h-7 rounded-full bg-[var(--primary-color)] flex items-center justify-center text-white text-[10px] font-bold">
            {userInitials}
          </div>
        </header>

        {/* Desktop top bar */}
        <header className="hidden lg:flex h-11 items-center justify-between px-6 shrink-0" style={{ backgroundColor: sidebarColor }}>
          <button onClick={() => navigate('/app')} className="text-white/70 text-xs font-medium tracking-wider hover:text-white transition-colors">{companyName.toUpperCase()}</button>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <span className="text-white/50 text-xs">{userName}</span>
            <div className="w-7 h-7 rounded-full bg-[var(--primary-color)] flex items-center justify-center text-white text-[10px] font-bold">
              {userInitials}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-6">
          {children}
        </main>

        {/* Footer */}
        <footer className="px-4 py-2 text-[10px] flex flex-wrap items-center justify-between gap-1" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)' }}>
          <span>&copy; {new Date().getFullYear()} CoreSite</span>
          <div className="flex items-center gap-2">
            <a href="/policies/privacy" target="_blank" className="hover:underline" style={{ color: 'var(--text-muted)' }}>Privacy</a>
            <a href="/policies/terms" target="_blank" className="hover:underline" style={{ color: 'var(--text-muted)' }}>Terms</a>
            <a href="/policies/cookies" target="_blank" className="hover:underline" style={{ color: 'var(--text-muted)' }}>Cookies</a>
          </div>
        </footer>
      </div>
      </div>
      <HelpWidget />
    </div>
  )
}
