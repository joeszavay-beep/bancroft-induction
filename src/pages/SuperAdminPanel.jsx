import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import LoadingButton from '../components/LoadingButton'
import {
  Building2, Plus, Edit3, Trash2, Users, FolderOpen, MapPin, FileText,
  CheckCircle2, XCircle, LogOut, Shield, Eye
} from 'lucide-react'

export default function SuperAdminPanel() {
  const navigate = useNavigate()
  const [companies, setCompanies] = useState([])
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
    const mgr = JSON.parse(sessionStorage.getItem('manager_data') || '{}')
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
    const tempPassword = `Welcome${Math.random().toString(36).slice(2, 8)}`
    await supabase.from('managers').insert({
      name: contactName.trim() || name.trim() + ' Admin',
      email: contactEmail.trim(),
      password: tempPassword,
      role: 'admin',
      company_id: co.id,
      is_active: true,
      must_change_password: true,
    })

    // Send welcome email
    await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operativeId: 'welcome',
        operativeName: contactName.trim() || 'Admin',
        email: contactEmail.trim(),
        projectName: `${name.trim()} on CoreSite`,
      }),
    }).catch(() => {})

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
    // Delete in order of dependencies
    const tables = ['snag_comments', 'snags', 'toolbox_signatures', 'toolbox_talks', 'signatures', 'documents', 'drawings', 'operatives', 'projects', 'managers', 'settings']
    for (const table of tables) {
      await supabase.from(table).delete().eq('company_id', co.id)
    }
    await supabase.from('companies').delete().eq('id', co.id)
    toast.success(`${co.name} deleted`)
    loadData()
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
      <header className="bg-[#0D1526] px-6 py-3 flex items-center justify-between">
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
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[#1A1A2E]">Companies ({companies.length})</h2>
          <button onClick={() => { setShowCreate(true); resetForm() }} className="flex items-center gap-1.5 px-4 py-2 bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm font-medium rounded-md transition-colors">
            <Plus size={14} /> New Company
          </button>
        </div>

        {/* Companies list */}
        <div className="space-y-3">
          {companies.map(co => {
            const s = stats[co.id] || {}
            return (
              <div key={co.id} className={`bg-white border rounded-lg shadow-sm p-5 ${co.is_active ? 'border-[#E2E6EA]' : 'border-red-200 bg-red-50/20'}`}>
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

                  <div className="flex items-center gap-1 shrink-0">
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
