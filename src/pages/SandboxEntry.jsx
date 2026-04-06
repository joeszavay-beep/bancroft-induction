import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/**
 * Sandbox entry point — sets up a read-only demo session
 * using the ABC Construction demo data, then redirects to /app.
 * No password needed. All mutations are blocked by the supabase proxy.
 */
export default function SandboxEntry() {
  const navigate = useNavigate()

  useEffect(() => {
    async function enter() {
      // Load the demo company and profile data directly
      const { data: profile } = await supabase
        .from('profiles')
        .select('*, companies(id, name, logo_url, primary_colour, secondary_colour, features)')
        .eq('email', 'demo@coresite.io')
        .single()

      if (!profile) {
        navigate('/login')
        return
      }

      const company = profile.companies

      // Set up session data as if logged in
      const userData = {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        company_id: profile.company_id,
      }

      sessionStorage.setItem('pm_auth', 'true')
      sessionStorage.setItem('manager_data', JSON.stringify({ ...userData, project_ids: [] }))
      sessionStorage.setItem('sandbox_mode', 'true')

      // Apply company branding
      if (company) {
        const root = document.documentElement
        root.style.setProperty('--primary-color', company.primary_colour || '#1B6FC8')
        root.style.setProperty('--sidebar-color', company.secondary_colour || '#0D1526')
        document.title = `${company.name} | CoreSite (Demo)`
      }

      navigate('/app')
    }

    enter()
  }, [])

  return (
    <div className="min-h-dvh bg-[#0D1526] flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full mx-auto mb-4" />
        <p className="text-white/50 text-sm">Loading demo...</p>
      </div>
    </div>
  )
}
