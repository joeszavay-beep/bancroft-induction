import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Menu, X, ChevronDown, ChevronRight, LogOut, Home, FileText,
  MapPin, MessageSquare, User, Sun, Moon
} from 'lucide-react'
import { useTheme } from '../lib/ThemeContext'
import { removeSession } from '../lib/storage'

/**
 * Sidebar layout for worker portal — mirrors the manager SidebarLayout
 * but with operative-specific navigation.
 */
export default function WorkerSidebarLayout({ children, op }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { isDark, toggleTheme } = useTheme()

  if (!op) return children

  const primaryColor = op.primary_colour || '#1B6FC8'
  const sidebarColor = '#1A2744'
  const userName = op.name || 'Worker'
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  const navItems = [
    { label: 'Home', path: '/worker', icon: Home },
    { label: 'Documents', path: '/worker/documents', icon: FileText },
    { label: 'Snags', path: '/worker/snags', icon: MapPin },
    { label: 'Chat', path: '/worker/chat', icon: MessageSquare },
    { label: 'Profile', path: '/worker/profile', icon: User },
  ]

  function handleLogout() {
    removeSession('operative_session')
    navigate('/worker-login')
  }

  function isActive(path) {
    if (path === '/worker') return location.pathname === '/worker'
    return location.pathname.startsWith(path)
  }

  const sidebar = (
    <aside className="w-[280px] sm:w-[280px] lg:w-[220px] flex flex-col h-full shrink-0 overflow-y-auto" style={{ backgroundColor: sidebarColor }}>
      {/* Logo */}
      <div onClick={() => { navigate('/worker'); setMobileOpen(false) }}
        className="px-4 pt-5 pb-3 border-b border-white/10 hover:bg-white/5 transition-colors cursor-pointer">
        {op.company_logo ? (
          <img src={op.company_logo} alt={op.company_name} className="h-8" onError={e => { e.target.style.display = 'none' }} />
        ) : null}
        <span className={`text-white font-bold text-base tracking-wide ${op.company_logo ? 'hidden' : ''}`}>
          {op.company_name || 'CoreSite'}
        </span>
      </div>

      {/* User */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: primaryColor }}>
          {userInitials}
        </div>
        <div className="min-w-0">
          <p className="text-white text-sm font-medium truncate">{userName}</p>
          <p className="text-white/40 text-[10px] truncate">{op.role || 'Operative'}</p>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {navItems.map(item => (
          <button
            key={item.path}
            onClick={() => { navigate(item.path); setMobileOpen(false) }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors ${
              isActive(item.path)
                ? 'bg-white/10 text-white border-l-2 border-[#1B6FC8]'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <item.icon size={16} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-2 py-3 border-t border-white/10 space-y-1">
        <button onClick={toggleTheme}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[12.5px] text-white/50 hover:text-white hover:bg-white/5 transition-colors">
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
          <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[12.5px] text-white/40 hover:text-red-400 hover:bg-white/5 transition-colors">
          <LogOut size={14} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )

  return (
    <div className="min-h-dvh flex" style={{ backgroundColor: 'var(--bg-main)' }}>
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
        {/* Mobile top bar */}
        <header className="h-12 flex items-center justify-between px-4 shrink-0 lg:hidden" style={{ backgroundColor: sidebarColor }}>
          <button onClick={() => setMobileOpen(true)} className="p-2 -ml-1 text-white min-w-[44px] min-h-[44px] flex items-center justify-center">
            <Menu size={22} />
          </button>
          {op.company_logo ? (
            <img src={op.company_logo} alt={op.company_name} className="h-6" onClick={() => navigate('/worker')} style={{ cursor: 'pointer' }} />
          ) : (
            <button onClick={() => navigate('/worker')} className="text-white text-xs font-semibold">{(op.company_name || 'CORESITE').toUpperCase()}</button>
          )}
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: primaryColor }}>
            {userInitials}
          </div>
        </header>

        {/* Desktop top bar */}
        <header className="hidden lg:flex h-11 items-center justify-between px-6 shrink-0" style={{ backgroundColor: sidebarColor }}>
          <button onClick={() => navigate('/worker')} className="text-white/70 text-xs font-medium tracking-wider hover:text-white transition-colors">
            {(op.company_name || 'CORESITE').toUpperCase()}
          </button>
          <div className="flex items-center gap-3">
            <span className="text-white/50 text-xs">{userName}</span>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: primaryColor }}>
              {userInitials}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-6">
          {children}
        </main>

        {/* Footer */}
        <footer className="px-4 py-2 text-[10px] flex items-center justify-between" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)' }}>
          <span>&copy; {new Date().getFullYear()} CoreSite</span>
        </footer>
      </div>
    </div>
  )
}
