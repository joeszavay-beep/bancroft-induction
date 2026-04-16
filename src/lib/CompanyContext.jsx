import { getSession, setSession, removeSession } from './storage'
import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'
import { cacheAuth, getCachedAuth, clearStore } from './offlineDb'

const CompanyContext = createContext(null)

export function CompanyProvider({ children }) {
  const [company, setCompany] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  async function checkSession() {
    let restored = false

    try {
      // 1. Try active Supabase session
      const sessionPromise = supabase.auth.getSession()
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Session check timeout')), 5000))
      const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise])
      if (session?.user) {
        setupFromAuth(session.user)
        loadFullProfile(session.user.id)
        cacheAuth('session', { access_token: session.access_token, refresh_token: session.refresh_token, user: session.user }).catch(() => {})
        restored = true
      }

      // 2. Try refreshing an expired token
      if (!restored) {
        try {
          const { data: { session: refreshed } } = await supabase.auth.refreshSession()
          if (refreshed?.user) {
            setupFromAuth(refreshed.user)
            loadFullProfile(refreshed.user.id)
            cacheAuth('session', { access_token: refreshed.access_token, refresh_token: refreshed.refresh_token, user: refreshed.user }).catch(() => {})
            restored = true
          }
        } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('Session check failed:', err)
    }

    // 3. Try IndexedDB offline cache
    if (!restored) {
      try {
        const cachedUser = await getCachedAuth('user')
        if (cachedUser) {
          setUser(cachedUser)
          setSession('pm_auth', 'true')
          setSession('manager_data', JSON.stringify({ ...cachedUser, project_ids: [] }))
          const cachedProfile = await getCachedAuth('profile')
          const cachedCompany = await getCachedAuth('company')
          if (cachedProfile) setProfile(cachedProfile)
          if (cachedCompany) { setCompany(cachedCompany); applyBranding(cachedCompany) }
          console.log('[cache] Restored auth from IndexedDB')
          restored = true
        }
      } catch { /* ignore */ }
    }

    // 4. Try stored session in localStorage (mobile persistent login)
    if (!restored) {
      const stored = getSession('manager_data')
      if (stored) {
        try {
          const data = JSON.parse(stored)
          setUser(data)
          setSession('pm_auth', 'true')
          if (data.id) loadFullProfile(data.id)
          console.log('[native] Restored auth from stored session')
          restored = true
        } catch { /* ignore */ }
      }
    }

    setIsLoading(false)
  }

  function setupFromAuth(authUser) {
    const meta = authUser.user_metadata || {}
    const userData = {
      id: authUser.id,
      name: meta.name || authUser.email?.split('@')[0] || 'User',
      email: authUser.email,
      role: meta.role || 'manager',
      company_id: meta.company_id || null,
    }
    setUser(userData)

    // Store in sessionStorage for backward compatibility
    setSession('pm_auth', 'true')
    setSession('manager_data', JSON.stringify({ ...userData, project_ids: [] }))
  }

  function applyBranding(companyData) {
    if (!companyData) return
    const root = document.documentElement
    root.style.setProperty('--primary-color', companyData.primary_colour || '#1B6FC8')
    root.style.setProperty('--sidebar-color', companyData.secondary_colour || '#1A2744')
    document.title = `${companyData.name} | CoreSite`
  }

  async function loadFullProfile(userId) {
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .limit(1)

      const prof = profiles?.[0]
      if (prof) {
        setProfile(prof)
        const userData = {
          id: prof.id,
          name: prof.name,
          email: prof.email,
          role: prof.role,
          company_id: prof.company_id,
        }
        setUser(userData)
        setSession('manager_data', JSON.stringify({ ...userData, project_ids: [] }))
        // Cache for offline
        cacheAuth('user', userData).catch(() => {})
        cacheAuth('profile', prof).catch(() => {})
      }

      // Load company — use prof data or the userId arg (not `user` state which may be stale)
      const companyId = prof?.company_id
      if (companyId) {
        const { data: companies } = await supabase
          .from('companies')
          .select('*')
          .eq('id', companyId)
          .limit(1)
        const co = companies?.[0]
        if (co) {
          setCompany(co)
          applyBranding(co)
          // Cache for offline
          cacheAuth('company', co).catch(() => {})
        }
      }
    } catch (err) {
      console.error('Full profile load failed:', err)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkSession()
  }, [])

  function clearState() {
    setUser(null)
    setProfile(null)
    setCompany(null)
    removeSession('pm_auth')
    removeSession('manager_data')
    removeSession('operative_session')
    removeSession('operative_return_url')
    document.title = 'CoreSite — Site Compliance Platform'
    document.documentElement.style.setProperty('--primary-color', '#1B6FC8')
    document.documentElement.style.setProperty('--sidebar-color', '#1A2744')
  }

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (data?.user) {
      setupFromAuth(data.user)
      loadFullProfile(data.user.id)
      // Cache session for offline
      if (data.session) {
        cacheAuth('session', { access_token: data.session.access_token, refresh_token: data.session.refresh_token, user: data.user }).catch(() => {})
      }
    }
    return data
  }

  async function logout() {
    await supabase.auth.signOut()
    clearState()
    // Clear IndexedDB auth cache so offline restore doesn't resurrect the session
    clearStore('authCache').catch(() => {})
  }

  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  }

  function refreshCompany(updatedCompany) {
    setCompany(updatedCompany)
    applyBranding(updatedCompany)
  }

  const isDemo = typeof window !== 'undefined' && sessionStorage.getItem('sandbox_mode') === 'true'

  return (
    <CompanyContext.Provider value={{
      company, user, profile, isLoading, isDemo,
      login, logout, resetPassword, refreshCompany,
      isAuthenticated: !!user,
    }}>
      {children}
    </CompanyContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCompany() {
  const ctx = useContext(CompanyContext)
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider')
  return ctx
}
