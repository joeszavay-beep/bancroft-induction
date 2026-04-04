import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'

const CompanyContext = createContext(null)

export function CompanyProvider({ children }) {
  const [company, setCompany] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    checkSession()
  }, [])

  async function checkSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        // Set up basic user data immediately from session
        setupFromAuth(session.user)
        // Then try to load full profile in background
        loadFullProfile(session.user.id)
      }
    } catch (err) {
      console.error('Session check failed:', err)
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
    sessionStorage.setItem('pm_auth', 'true')
    sessionStorage.setItem('manager_data', JSON.stringify({ ...userData, project_ids: [] }))
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
        // Update user with profile data (more accurate than auth metadata)
        const userData = {
          id: prof.id,
          name: prof.name,
          email: prof.email,
          role: prof.role,
          company_id: prof.company_id,
        }
        setUser(userData)
        sessionStorage.setItem('manager_data', JSON.stringify({ ...userData, project_ids: [] }))
      }

      // Load company
      const companyId = prof?.company_id || user?.company_id
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
        }
      }
    } catch (err) {
      console.error('Full profile load failed:', err)
    }
  }

  function applyBranding(companyData) {
    if (!companyData) return
    const root = document.documentElement
    root.style.setProperty('--primary-color', companyData.primary_colour || '#1B6FC8')
    root.style.setProperty('--sidebar-color', companyData.secondary_colour || '#0D1526')
    document.title = `${companyData.name} | CoreSite`
  }

  function clearState() {
    setUser(null)
    setProfile(null)
    setCompany(null)
    sessionStorage.removeItem('pm_auth')
    sessionStorage.removeItem('manager_data')
    document.title = 'CoreSite — Site Compliance Platform'
    document.documentElement.style.setProperty('--primary-color', '#1B6FC8')
    document.documentElement.style.setProperty('--sidebar-color', '#0D1526')
  }

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (data?.user) {
      // Set up immediately from auth response — no waiting for profile query
      setupFromAuth(data.user)
      // Load full profile + company in background
      loadFullProfile(data.user.id)
    }
    return data
  }

  async function logout() {
    await supabase.auth.signOut()
    clearState()
  }

  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://coresite.io/reset-password',
    })
    if (error) throw error
  }

  function refreshCompany(updatedCompany) {
    setCompany(updatedCompany)
    applyBranding(updatedCompany)
  }

  return (
    <CompanyContext.Provider value={{
      company, user, profile, isLoading,
      login, logout, resetPassword, refreshCompany,
      isAuthenticated: !!user,
    }}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompany() {
  const ctx = useContext(CompanyContext)
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider')
  return ctx
}
