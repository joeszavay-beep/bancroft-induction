import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'

const CompanyContext = createContext(null)

export function CompanyProvider({ children }) {
  const [company, setCompany] = useState(null)
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadSession()
  }, [])

  async function loadSession() {
    const raw = sessionStorage.getItem('manager_data')
    if (!raw) {
      setIsLoading(false)
      return
    }
    const userData = JSON.parse(raw)
    setUser(userData)

    if (userData.company_id) {
      const { data } = await supabase
        .from('companies')
        .select('*')
        .eq('id', userData.company_id)
        .single()
      if (data) {
        setCompany(data)
        applyBranding(data)
      }
    }
    setIsLoading(false)
  }

  function applyBranding(companyData) {
    if (!companyData) return
    const root = document.documentElement
    root.style.setProperty('--primary-color', companyData.primary_colour || '#1B6FC8')
    root.style.setProperty('--sidebar-color', companyData.secondary_colour || '#0D1526')
    document.title = `${companyData.name} | CoreSite`
  }

  function login(userData, companyData) {
    setUser(userData)
    setCompany(companyData)
    if (companyData) applyBranding(companyData)
    sessionStorage.setItem('pm_auth', 'true')
    sessionStorage.setItem('manager_data', JSON.stringify(userData))
  }

  function logout() {
    setUser(null)
    setCompany(null)
    sessionStorage.removeItem('pm_auth')
    sessionStorage.removeItem('manager_data')
    document.title = 'CoreSite — Site Compliance Platform'
    document.documentElement.style.setProperty('--primary-color', '#1B6FC8')
    document.documentElement.style.setProperty('--sidebar-color', '#0D1526')
  }

  function refreshCompany(updatedCompany) {
    setCompany(updatedCompany)
    applyBranding(updatedCompany)
  }

  return (
    <CompanyContext.Provider value={{ company, user, isLoading, login, logout, refreshCompany }}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompany() {
  const ctx = useContext(CompanyContext)
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider')
  return ctx
}
