import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'

const CompanyContext = createContext(null)

export function CompanyProvider({ children }) {
  const [company, setCompany] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const profileLoaded = useRef(false)

  useEffect(() => {
    checkSession()
  }, [])

  async function checkSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        await loadProfile(session.user)
      }
    } catch (err) {
      console.error('Session check failed:', err)
    }
    setIsLoading(false)
  }

  async function loadProfile(authUser) {
    if (profileLoaded.current && user?.id === authUser.id) return

    try {
      const { data: prof, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      if (error || !prof) {
        console.error('Profile load failed:', error)
        return false
      }

      profileLoaded.current = true
      setProfile(prof)

      const userData = {
        id: prof.id,
        name: prof.name,
        email: prof.email,
        role: prof.role,
        company_id: prof.company_id,
      }
      setUser(userData)

      // Store in sessionStorage for backward compatibility
      sessionStorage.setItem('pm_auth', 'true')
      sessionStorage.setItem('manager_data', JSON.stringify({
        ...userData,
        project_ids: [],
      }))

      // Load company
      if (prof.company_id) {
        const { data: co } = await supabase
          .from('companies')
          .select('*')
          .eq('id', prof.company_id)
          .single()
        if (co) {
          setCompany(co)
          applyBranding(co)
        }
      }
      return true
    } catch (err) {
      console.error('loadProfile error:', err)
      return false
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
    profileLoaded.current = false
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
      const success = await loadProfile(data.user)
      if (!success) throw new Error('Failed to load profile')
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
