import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { authFetch } from '../lib/authFetch'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import LoadingButton from '../components/LoadingButton'
import {
  Building2, Plus, Edit3, Trash2, Users, FolderOpen, MapPin, FileText,
  CheckCircle2, XCircle, LogOut, Shield, Eye, ChevronDown, ArrowLeft, Key, UserPlus
} from 'lucide-react'
import { getSession } from '../lib/storage'

export default function SuperAdminPanel() {
  const navigate = useNavigate()
  const [companies, setCompanies] = useState([])
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const [saving, setSaving] = useState(false)

  // Create form
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [plan, setPlan] = useState('trial')
  const [trialEnds, setTrialEnds] = useState('')
  const [maxOps, setMaxOps] = useState('')
  const [primaryColour, setPrimaryColour] = useState('#1B6FC8')
  const [logo, setLogo] = useState(null)

  useEffect(() => {
    const mgr = JSON.parse(getSession('manager_data') || '{}')
    if (mgr.role !== 'admin' && mgr.role !== 'super_admin') {
      navigate('/app')
      return
    }
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const { data: cos } = await supabase.from('companies').select('*').order('created_at', { ascending: false })
    setCompanies(cos || [])

    // Fetch stats per company
    const s = {}
    for (const co of (cos || [])) {
      const [ops, projs, sigs, snags] = await Promise.all([
        supabase.from('operatives').select('id', { count: 'exact', head: true }).eq('company_id', co.id),
        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('company_id', co.id),
        supabase.from('signatures').select('id', { count: 'exact', head: true }).eq('company_id', co.id),
        supabase.from('snags').select('id', { count: 'exact', head: true }).eq('company_id', co.id),
      ])
      s[co.id] = {
        operatives: ops.count || 0,
        projects: projs.count || 0,
        signatures: sigs.count || 0,
        snags: snags.count || 0,
      }
    }
    setStats(s)
    setLoading(false)
  }

  function autoSlug(n) {
    return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function createCompany(e) {
    e.preventDefault()
    if (!name.trim() || !slug.trim() || !contactEmail.trim()) return
    setSaving(true)

    let logoUrl = null
    if (logo) {
      const path = `${slug}/${Date.now()}.${logo.name.split('.').pop()}`
      const { error: upErr } = await supabase.storage.from('company-assets').upload(path, logo)
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('company-assets').getPublicUrl(path)
        logoUrl = urlData.publicUrl
      }
    }

    const { data: co, error: coErr } = await supabase.from('companies').insert({
      name: name.trim(),
      slug: slug.trim(),
      contact_name: contactName.trim() || null,
      contact_email: contactEmail.trim(),
      subscription_plan: plan,
      trial_ends_at: plan === 'trial' && trialEnds ? trialEnds : null,
      max_operatives: maxOps ? parseInt(maxOps) : null,
      primary_colour: primaryColour,
      logo_url: logoUrl,
    }).select().single()

    if (coErr) {
      setSaving(false)
      toast.error(coErr.code === '23505' ? 'Slug already exists' : 'Failed to create company')
      return
    }

    // Create admin user for the company
    // NOTE: We don't call supabase.auth.signUp here because it would sign out the current super admin.
    // Instead, we create the profile and send a password reset link so the new user sets their own password.
    const adminName = contactName.trim() || name.trim() + ' Admin'
    const adminEmail = contactEmail.trim().toLowerCase()

    // Create profile record
    const profileId = crypto.randomUUID()
    await supabase.from('profiles').insert({
      id: profileId,
      company_id: co.id,
      name: adminName,
      email: adminEmail,
      role: 'admin',
      is_active: true,
    }).catch(err => console.error('Profile insert error:', err))

    // Create legacy managers record
    const tempPassword = `Welcome${Math.random().toString(36).slice(2, 8)}!A1`
    await supabase.from('managers').insert({
      name: adminName,
      email: adminEmail,
      password: tempPassword,
      role: 'admin',
      company_id: co.id,
      is_active: true,
      must_change_password: true,
    }).catch(() => {})

    // Send welcome email (fire and forget — don't block on it)
    const emailPromise = fetch('/api/welcome', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession())?.data?.session?.access_token || ''}`,
      },
      body: JSON.stringify({
        companyName: name.trim(),
        contactName: contactName.trim() || 'Admin',
        email: adminEmail,
        tempPassword,
      }),
    }).catch(() => {})

    // Don't await — let it send in background
    emailPromise.then(() => console.log('Welcome email sent')).catch(() => {})

    setSaving(false)
    toast.success(`${name.trim()} created — temp password: ${tempPassword}`)
    setShowCreate(false)
    resetForm()
    loadData()
  }

  async function toggleActive(co) {
    const newState = !co.is_active
    await supabase.from('companies').update({ is_active: newState }).eq('id', co.id)
    toast.success(newState ? `${co.name} reactivated` : `${co.name} suspended`)
    loadData()
  }

  async function deleteCompany(co) {
    if (!confirm(`Delete ${co.name} and ALL its data? This cannot be undone.`)) return
    try {
      // Delete in dependency order — deepest children first
      const companyTables = [
        'audit_logs', 'cis_records', 'timesheet_entries', 'sub_invoices',
        'job_variations', 'job_operatives', 'subcontractor_jobs',
        'operative_invoices', 'markup_lines', 'progress_snapshots',
        'programme_activities', 'drawing_layers', 'design_drawings',
        'master_activities', 'master_programme',
        'labour_proposals', 'labour_bookings', 'labour_requests',
        'agency_connections',
        'snag_comments', 'snags',
        'toolbox_signatures', 'toolbox_talks',
        'signatures', 'documents', 'drawings',
        'site_attendance', 'notifications',
        'inspection_templates', 'inspections',
        'aftercare_defects', 'chat_messages',
        'progress_items', 'progress_item_history', 'progress_zones', 'progress_drawings',
        'bim_drawing_calibration', 'bim_elements', 'bim_models',
        'operatives', 'projects', 'profiles', 'managers', 'settings',
      ]
      let errors = []
      for (const table of companyTables) {
        const { error } = await supabase.from(table).delete().eq('company_id', co.id)
        if (error && !error.message?.includes('does not exist')) {
          errors.push(`${table}: ${error.message}`)
        }
      }
      // Finally delete the company itself
      const { error: delErr } = await supabase.from('companies').delete().eq('id', co.id)
      if (delErr) {
        toast.error(`Failed to delete ${co.name}: ${delErr.message}`)
        if (errors.length) console.error('Cleanup errors:', errors)
        return
      }
      toast.success(`${co.name} deleted`)
      loadData()
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`)
    }
  }

  function resetForm() {
    setName(''); setSlug(''); setContactName(''); setContactEmail('')
    setPlan('trial'); setTrialEnds(''); setMaxOps(''); setPrimaryColour('#1B6FC8'); setLogo(null)
  }

  const planBadge = {
    trial: 'bg-amber-100 text-amber-700',
    starter: 'bg-blue-100 text-blue-700',
    pro: 'bg-green-100 text-green-700',
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#F5F6F8] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#1B6FC8] border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#F5F6F8]">
      {/* Header */}
      <header className="bg-[#1A2744] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield size={20} className="text-amber-400" />
          <div>
            <h1 className="text-white font-bold text-base">CoreSite Super Admin</h1>
            <p className="text-white/40 text-[10px]">Company Management</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/app')} className="px-3 py-1.5 text-xs text-white/60 hover:text-white bg-white/10 hover:bg-white/20 rounded-md transition-colors">
            Dashboard
          </button>
          <button onClick={() => { sessionStorage.clear(); navigate('/') }} className="p-2 text-white/40 hover:text-white">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        {selectedCompany ? (
          <CompanyDetailView company={selectedCompany} onBack={() => { setSelectedCompany(null); loadData() }} />
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#1A1A2E]">Companies ({companies.length})</h2>
              <button onClick={() => { setShowCreate(true); resetForm() }} className="flex items-center gap-1.5 px-4 py-2 bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm font-medium rounded-md transition-colors">
                <Plus size={14} /> New Company
              </button>
            </div>

            <div className="space-y-3">
              {companies.map(co => {
                const s = stats[co.id] || {}
                return (
                  <div key={co.id} onClick={() => setSelectedCompany(co)} className={`bg-white border rounded-lg shadow-sm p-5 cursor-pointer hover:shadow-md transition-all ${co.is_active ? 'border-[#E2E6EA]' : 'border-red-200 bg-red-50/20'}`}>
                    <div className="flex items-start gap-4">
                      {co.logo_url ? (
                        <img src={co.logo_url} alt="" className="w-12 h-12 rounded-lg object-contain border border-[#E2E6EA]" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: co.primary_colour || '#1B6FC8' }}>
                          {co.name.charAt(0)}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-base font-bold text-[#1A1A2E]">{co.name}</h3>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${planBadge[co.subscription_plan] || planBadge.trial}`}>
                            {co.subscription_plan?.toUpperCase()}
                          </span>
                          {!co.is_active && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-600">SUSPENDED</span>}
                        </div>
                        <p className="text-xs text-[#6B7A99] mb-2">/{co.slug} · {co.contact_email || 'No email'}</p>

                        <div className="flex flex-wrap gap-4 text-xs text-[#6B7A99]">
                          <span className="flex items-center gap-1"><Users size={12} /> {s.operatives || 0} workers</span>
                          <span className="flex items-center gap-1"><FolderOpen size={12} /> {s.projects || 0} projects</span>
                          <span className="flex items-center gap-1"><FileText size={12} /> {s.signatures || 0} signatures</span>
                          <span className="flex items-center gap-1"><MapPin size={12} /> {s.snags || 0} snags</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => toggleActive(co)} className={`p-2 rounded-md transition-colors ${co.is_active ? 'text-[#6B7A99] hover:text-amber-600 hover:bg-amber-50' : 'text-[#2EA043] hover:bg-green-50'}`} title={co.is_active ? 'Suspend' : 'Reactivate'}>
                          {co.is_active ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                        </button>
                        <button onClick={() => deleteCompany(co)} className="p-2 text-[#6B7A99] hover:text-[#DA3633] hover:bg-red-50 rounded-md transition-colors" title="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Create Company Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New Company">
        <form onSubmit={createCompany} className="space-y-3">
          <div>
            <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Company Name *</label>
            <input value={name} onChange={e => { setName(e.target.value); if (!slug || slug === autoSlug(name)) setSlug(autoSlug(e.target.value)) }}
              className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]" />
          </div>
          <div>
            <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Slug * <span className="text-[#B0B8C9]">(coresite.io/{slug})</span></label>
            <input value={slug} onChange={e => setSlug(autoSlug(e.target.value))}
              className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Contact Name *</label>
              <input value={contactName} onChange={e => setContactName(e.target.value)}
                className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]" />
            </div>
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Contact Email *</label>
              <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Plan</label>
              <select value={plan} onChange={e => setPlan(e.target.value)}
                className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]">
                <option value="trial">Trial</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Max Operatives</label>
              <input type="number" value={maxOps} onChange={e => setMaxOps(e.target.value)} placeholder="Unlimited"
                className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Primary Colour</label>
              <div className="flex items-center gap-2">
                <input type="color" value={primaryColour} onChange={e => setPrimaryColour(e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0" />
                <input value={primaryColour} onChange={e => setPrimaryColour(e.target.value)}
                  className="flex-1 px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]" />
              </div>
            </div>
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Logo</label>
              <label className="flex items-center justify-center px-3 py-2.5 border border-dashed border-[#E2E6EA] rounded-md text-sm text-[#6B7A99] cursor-pointer hover:border-[#1B6FC8]">
                {logo ? logo.name : 'Choose file'}
                <input type="file" accept="image/*" onChange={e => setLogo(e.target.files[0])} className="hidden" />
              </label>
            </div>
          </div>
          <LoadingButton loading={saving} type="submit" className="w-full bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm font-semibold rounded-md">
            Create Company & Send Welcome Email
          </LoadingButton>
        </form>
      </Modal>
    </div>
  )
}

/* ==================== COMPANY DETAIL VIEW ==================== */
function CompanyDetailView({ company: initialCompany, onBack }) {
  const [company, setCompany] = useState(initialCompany)
  const [tab, setTab] = useState('users')
  const [users, setUsers] = useState([])
  const [workers, setWorkers] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(null)
  const features = company.features || {}

  useEffect(() => { loadAll() }, [company.id])

  async function loadAll() {
    setLoading(true)
    const [u, w, p] = await Promise.all([
      supabase.from('managers').select('*').eq('company_id', company.id).order('name'),
      supabase.from('operatives').select('*, projects(name)').eq('company_id', company.id).order('name'),
      supabase.from('projects').select('*').eq('company_id', company.id).order('name'),
    ])
    setUsers(u.data || [])
    setWorkers(w.data || [])
    setProjects(p.data || [])
    setLoading(false)
  }

  async function resetPassword(user) {
    const newPw = `Reset${Math.random().toString(36).slice(2, 8)}`
    setResetting(user.id)
    await supabase.from('managers').update({ password: newPw, must_change_password: true }).eq('id', user.id)
    setResetting(null)
    toast.success(`Password reset for ${user.name}: ${newPw}`)
  }

  async function toggleUserActive(user) {
    await supabase.from('managers').update({ is_active: !user.is_active }).eq('id', user.id)
    toast.success(user.is_active ? `${user.name} deactivated` : `${user.name} activated`)
    loadAll()
  }

  async function toggleFeature(key) {
    const updated = { ...features, [key]: !features[key] }
    const { error } = await supabase.from('companies').update({ features: updated }).eq('id', company.id)
    if (error) { toast.error('Failed to update'); return }
    setCompany({ ...company, features: updated })
    toast.success(`${key.replace(/_/g, ' ')} ${updated[key] ? 'enabled' : 'disabled'}`)
  }

  const tabs = [
    { id: 'users', label: 'User Accounts', count: users.length },
    { id: 'workers', label: 'Workers', count: workers.length },
    { id: 'projects', label: 'Projects', count: projects.length },
    { id: 'features', label: 'Features' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="p-2 text-[#6B7A99] hover:text-[#1A1A2E] hover:bg-[#E2E6EA] rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        {company.logo_url ? (
          <img src={company.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain border border-[#E2E6EA]" />
        ) : (
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ backgroundColor: company.primary_colour || '#1B6FC8' }}>
            {company.name.charAt(0)}
          </div>
        )}
        <div>
          <h2 className="text-xl font-bold text-[#1A1A2E]">{company.name}</h2>
          <p className="text-xs text-[#6B7A99]">/{company.slug} · {company.contact_email} · {company.subscription_plan?.toUpperCase()}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-[#E2E6EA]">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id ? 'border-[#1B6FC8] text-[#1B6FC8]' : 'border-transparent text-[#6B7A99] hover:text-[#1A1A2E]'
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-[#1B6FC8] border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* Users tab */}
          {tab === 'users' && (
            <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F5F6F8] text-left">
                    <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Name</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Email</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Role</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Status</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-[#6B7A99]">No users</td></tr>
                  ) : users.map(u => (
                    <tr key={u.id} className="border-t border-[#E2E6EA] hover:bg-[#F5F6F8]/50">
                      <td className="px-4 py-3 font-medium text-[#1A1A2E]">{u.name}</td>
                      <td className="px-4 py-3 text-[#6B7A99]">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#F5F6F8] text-[#6B7A99]">{u.role}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${u.is_active ? 'bg-green-50 text-[#2EA043]' : 'bg-red-50 text-[#DA3633]'}`}>
                          {u.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => resetPassword(u)}
                            disabled={resetting === u.id}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] text-[#1B6FC8] hover:bg-blue-50 rounded transition-colors font-medium"
                            title="Reset password"
                          >
                            <Key size={11} /> {resetting === u.id ? 'Resetting...' : 'Reset PW'}
                          </button>
                          <button
                            onClick={() => toggleUserActive(u)}
                            className={`px-2 py-1 text-[10px] rounded transition-colors font-medium ${u.is_active ? 'text-[#DA3633] hover:bg-red-50' : 'text-[#2EA043] hover:bg-green-50'}`}
                          >
                            {u.is_active ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Workers tab */}
          {tab === 'workers' && (
            <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F5F6F8] text-left">
                    <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Name</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Role</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Email</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Mobile</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Project</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">DOB</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">NI</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Next of Kin</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-[#6B7A99]">No workers</td></tr>
                  ) : workers.map(w => (
                    <tr key={w.id} className="border-t border-[#E2E6EA] hover:bg-[#F5F6F8]/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {w.photo_url ? (
                            <img src={w.photo_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-[#1B6FC8]/10 flex items-center justify-center text-[#1B6FC8] text-[10px] font-bold">
                              {w.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="font-medium text-[#1A1A2E]">{w.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#6B7A99]">{w.role || '—'}</td>
                      <td className="px-4 py-3 text-[#6B7A99]">{w.email || '—'}</td>
                      <td className="px-4 py-3 text-[#6B7A99]">{w.mobile || '—'}</td>
                      <td className="px-4 py-3 text-[#6B7A99]">{w.projects?.name || '—'}</td>
                      <td className="px-4 py-3 text-[#6B7A99]">{w.date_of_birth || '—'}</td>
                      <td className="px-4 py-3 text-[#6B7A99] font-mono text-xs">{w.ni_number || '—'}</td>
                      <td className="px-4 py-3 text-[#6B7A99]">{w.next_of_kin ? `${w.next_of_kin} (${w.next_of_kin_phone || ''})` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Projects tab */}
          {tab === 'projects' && (
            <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F5F6F8] text-left">
                    <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Project Name</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Location</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-[#6B7A99]">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-[#6B7A99]">No projects</td></tr>
                  ) : projects.map(p => (
                    <tr key={p.id} className="border-t border-[#E2E6EA] hover:bg-[#F5F6F8]/50">
                      <td className="px-4 py-3 font-medium text-[#1A1A2E]">{p.name}</td>
                      <td className="px-4 py-3 text-[#6B7A99]">{p.location || '—'}</td>
                      <td className="px-4 py-3 text-[#6B7A99]">{new Date(p.created_at).toLocaleDateString('en-GB')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Features tab */}
          {tab === 'features' && (
            <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm p-5 space-y-4">
              <p className="text-sm text-[#6B7A99] mb-2">Toggle features on or off for this company. Disabled features will be hidden from their sidebar.</p>

              {[
                { key: 'hs_reports', label: 'H&S Report Generator', desc: 'Embedded H&S report builder tool' },
                { key: 'toolbox_talks', label: 'Toolbox Talks', desc: 'QR code based toolbox talk sign-off' },
                { key: 'progress_drawings', label: 'Progress Drawings', desc: 'Traffic light marking system for M&E installation progress' },
                { key: 'snagging', label: 'Snagging Module', desc: 'Drawing viewer with snag pin placement' },
                { key: 'portal', label: 'Sign-off Portal', desc: 'Public portal showing signature records' },
              ].map(f => (
                <div key={f.key} className="flex items-center justify-between py-3 border-b border-[#E2E6EA] last:border-0">
                  <div>
                    <p className="text-sm font-medium text-[#1A1A2E]">{f.label}</p>
                    <p className="text-xs text-[#6B7A99]">{f.desc}</p>
                  </div>
                  <button
                    onClick={() => toggleFeature(f.key)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${features[f.key] ? 'bg-[#2EA043]' : 'bg-[#E2E6EA]'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${features[f.key] ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
