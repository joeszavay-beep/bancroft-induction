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
      // Sign out any existing session first
      await supabase.auth.signOut().catch(() => {})

      // Actually sign in as the demo account so RLS works
      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'demo@coresite.io',
        password: 'Demo2026!',
      })

      if (error || !data?.user) {
        navigate('/login')
        return
      }

      // Load profile and company
      const { data: profile } = await supabase
        .from('profiles')
        .select('*, companies(id, name, logo_url, primary_colour, secondary_colour, features)')
        .eq('id', data.user.id)
        .single()

      const company = profile?.companies

      const userData = {
        id: profile?.id || data.user.id,
        name: profile?.name || 'Demo User',
        email: 'demo@coresite.io',
        role: profile?.role || 'manager',
        company_id: profile?.company_id,
      }

      sessionStorage.setItem('pm_auth', 'true')
      sessionStorage.setItem('manager_data', JSON.stringify({ ...userData, project_ids: [] }))
      sessionStorage.setItem('sandbox_mode', 'true')

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
