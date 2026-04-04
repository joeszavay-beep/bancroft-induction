import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'

const CompanyContext = createContext(null)

export function CompanyProvider({ children }) {
  const [company, setCompany] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check for existing session on mount
    checkSession()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        await loadProfile(session.user)
      } else if (event === 'SIGNED_OUT') {
        clearState()
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await loadProfile(session.user)
    }
    setIsLoading(false)
  }

  async function loadProfile(authUser) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single()

    if (!prof) {
      setIsLoading(false)
      return
    }

    setProfile(prof)
    setUser({
      id: prof.id,
      name: prof.name,
      email: prof.email,
      role: prof.role,
      company_id: prof.company_id,
    })

    // Also store in sessionStorage for backward compatibility with existing components
    sessionStorage.setItem('pm_auth', 'true')
    sessionStorage.setItem('manager_data', JSON.stringify({
      id: prof.id,
      name: prof.name,
      email: prof.email,
      role: prof.role,
      company_id: prof.company_id,
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
      await loadProfile(data.user)
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
