import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import {
  Building2, Palette, FolderPlus, FileUp, UserPlus,
  Check, ChevronRight, ChevronLeft, Upload, X, Plus, Loader2, PartyPopper
} from 'lucide-react'
import toast from 'react-hot-toast'

const STEPS = [
  { label: 'Company Details', icon: Building2 },
  { label: 'Branding', icon: Palette },
  { label: 'First Project', icon: FolderPlus },
  { label: 'First Drawing', icon: FileUp },
  { label: 'Invite Team', icon: UserPlus },
]

const INDUSTRIES = ['M&E', 'Fit-out', 'Civils', 'General', 'Other']

export default function Onboarding() {
  const navigate = useNavigate()
  const { user, company, refreshCompany, isAuthenticated, isLoading } = useCompany()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(false)

  // Step 1: Company Details
  const [companyName, setCompanyName] = useState('')
  const [address, setAddress] = useState('')
  const [website, setWebsite] = useState('')
  const [industry, setIndustry] = useState('General')

  // Step 2: Branding
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [primaryColour, setPrimaryColour] = useState('#1B6FC8')
  const [sidebarColour, setSidebarColour] = useState('#1A2744')
  const logoInputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  // Step 3: First Project
  const [projectName, setProjectName] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  const [clientName, setClientName] = useState('')
  const [projectCreated, setProjectCreated] = useState(null)

  // Step 4: First Drawing
  const [drawingFile, setDrawingFile] = useState(null)
  const [drawingUploaded, setDrawingUploaded] = useState(false)

  // Step 5: Invite Team
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitedPeople, setInvitedPeople] = useState([])
  const [inviting, setInviting] = useState(false)

  // Auth guard
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login')
    }
  }, [isLoading, isAuthenticated, navigate])

  // Load existing state
  useEffect(() => {
    if (company) {
      setCompanyName(company.name || '')
      setAddress(company.address || '')
      setWebsite(company.website || '')
      setPrimaryColour(company.primary_colour || '#1B6FC8')
      setSidebarColour(company.secondary_colour || '#1A2744')
      if (company.logo_url) setLogoPreview(company.logo_url)
      // Resume from saved step
      if (company.onboarding_step && company.onboarding_step > 0) {
        setStep(Math.min(company.onboarding_step, 4))
      }
      if (company.onboarding_complete) {
        navigate('/app')
      }
    }
  }, [company, navigate])

  const inputCls = "w-full px-3.5 py-2.5 border border-[#E2E6EA] rounded-lg text-[#1A1A2E] placeholder-[#B0B8C9] focus:outline-none focus:border-[#1B6FC8] focus:ring-2 focus:ring-[#1B6FC8]/10 text-sm"

  async function saveStep(nextStep) {
    if (!company) return
    await supabase.from('companies').update({ onboarding_step: nextStep }).eq('id', company.id)
  }

  // Step 1: Save company details
  async function handleStep1Next() {
    if (!companyName.trim()) { toast.error('Company name is required'); return }
    setSaving(true)
    try {
      const { data, error } = await supabase.from('companies').update({
        name: companyName.trim(),
        address: address.trim() || null,
        website: website.trim() || null,
      }).eq('id', company.id).select().single()
      if (error) throw error
      refreshCompany(data)
      await saveStep(1)
      setStep(1)
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    }
    setSaving(false)
  }

  // Step 2: Save branding
  async function handleStep2Next() {
    setSaving(true)
    try {
      let logoUrl = company.logo_url
      if (logoFile) {
        const ext = logoFile.name.split('.').pop()
        const path = `logos/${company.id}.${ext}`
        const { error: upErr } = await supabase.storage.from('documents').upload(path, logoFile, { upsert: true })
        if (upErr) throw upErr
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        logoUrl = urlData.publicUrl
      }

      const { data, error } = await supabase.from('companies').update({
        logo_url: logoUrl,
        primary_colour: primaryColour,
        secondary_colour: sidebarColour,
      }).eq('id', company.id).select().single()
      if (error) throw error
      refreshCompany(data)
      await saveStep(2)
      setStep(2)
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    }
    setSaving(false)
  }

  // Step 3: Create project
  async function handleCreateProject() {
    if (!projectName.trim()) { toast.error('Project name is required'); return }
    setSaving(true)
    try {
      const { data: project, error } = await supabase.from('projects').insert({
        name: projectName.trim(),
        site_address: siteAddress.trim() || null,
        client_name: clientName.trim() || null,
        company_id: company.id,
      }).select().single()
      if (error) throw error
      setProjectCreated(project)
      toast.success('Project created!')
      await saveStep(3)
    } catch (err) {
      toast.error(err.message || 'Failed to create project')
    }
    setSaving(false)
  }

  function handleStep3Next() {
    setStep(projectCreated ? 3 : 4) // skip drawing step if no project
    if (projectCreated) saveStep(3)
    else { saveStep(4); setStep(4) }
  }

  function handleStep3Skip() {
    saveStep(4)
    setStep(4)
  }

  // Step 4: Upload drawing
  async function handleUploadDrawing() {
    if (!drawingFile || !projectCreated) return
    setSaving(true)
    try {
      const uuid = crypto.randomUUID()
      const ext = drawingFile.name.split('.').pop()
      const path = `drawings/${projectCreated.id}/${uuid}.${ext}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, drawingFile)
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)

      const { error } = await supabase.from('drawings').insert({
        project_id: projectCreated.id,
        company_id: company.id,
        name: drawingFile.name.replace(/\.[^.]+$/, ''),
        image_url: urlData.publicUrl,
        original_url: urlData.publicUrl,
      })
      if (error) throw error
      setDrawingUploaded(true)
      toast.success('Drawing uploaded!')
      await saveStep(4)
    } catch (err) {
      toast.error(err.message || 'Failed to upload')
    }
    setSaving(false)
  }

  // Step 5: Invite team member
  async function handleInvite() {
    if (!inviteName.trim() || !inviteEmail.trim()) { toast.error('Name and email are required'); return }
    setInviting(true)
    try {
      // Create profile
      const { error } = await supabase.from('profiles').insert({
        company_id: company.id,
        name: inviteName.trim(),
        email: inviteEmail.trim().toLowerCase(),
        role: 'manager',
        is_active: true,
        must_change_password: true,
      })
      if (error) throw error

      // Try to send invite email
      await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: inviteName.trim(),
          email: inviteEmail.trim().toLowerCase(),
          company_id: company.id,
          company_name: company.name,
        }),
      }).catch(() => {})

      setInvitedPeople(prev => [...prev, { name: inviteName.trim(), email: inviteEmail.trim().toLowerCase() }])
      setInviteName('')
      setInviteEmail('')
      toast.success(`Invite sent to ${inviteEmail.trim()}`)
    } catch (err) {
      toast.error(err.message || 'Failed to invite')
    }
    setInviting(false)
  }

  // Finish
  async function handleFinish() {
    setSaving(true)
    try {
      const { data, error } = await supabase.from('companies').update({
        onboarding_complete: true,
        onboarding_step: 5,
      }).eq('id', company.id).select().single()
      if (error) throw error
      refreshCompany(data)
      setCompleted(true)
    } catch (err) {
      toast.error(err.message || 'Failed to complete')
    }
    setSaving(false)
  }

  // Logo drag & drop handlers
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer?.files?.[0]
    if (file && file.type.startsWith('image/')) {
      setLogoFile(file)
      setLogoPreview(URL.createObjectURL(file))
    }
  }, [])

  const handleLogoSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      setLogoPreview(URL.createObjectURL(file))
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F8FAFC]">
        <div className="animate-spin w-8 h-8 border-2 border-[#1B6FC8] border-t-transparent rounded-full" />
      </div>
    )
  }

  // Celebration screen
  if (completed) {
    return (
      <div className="min-h-dvh bg-[#F8FAFC] flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-[#ECFDF5] rounded-full flex items-center justify-center mx-auto mb-6">
            <PartyPopper size={40} className="text-[#2EA043]" />
          </div>
          <h1 className="text-3xl font-bold text-[#1A1A2E] mb-3">You're all set!</h1>
          <p className="text-[#6B7A99] mb-8">CoreSite is ready for your team. Start managing your site digitally.</p>
          <button onClick={() => navigate('/app')}
            className="px-8 py-4 bg-[#1B6FC8] hover:bg-[#1558A0] text-white font-semibold rounded-xl text-base transition-colors shadow-lg shadow-[#1B6FC8]/20">
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#F8FAFC]">
      {/* Header */}
      <div className="bg-white border-b border-[#E2E6EA] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <span className="text-lg text-[#1A2744] font-light tracking-[3px]">CORE<span className="font-bold tracking-normal">SITE</span></span>
          <button onClick={() => { handleFinish() }} className="text-xs text-[#6B7A99] hover:text-[#1A1A2E] transition-colors">
            Skip setup
          </button>
        </div>
      </div>

      {/* Step progress */}
      <div className="bg-white border-b border-[#E2E6EA] px-6 py-5">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    i < step ? 'bg-[#2EA043] text-white' :
                    i === step ? 'bg-[#1B6FC8] text-white ring-4 ring-[#1B6FC8]/20' :
                    'bg-[#E2E6EA] text-[#B0B8C9]'
                  }`}>
                    {i < step ? <Check size={16} /> : i + 1}
                  </div>
                  <span className={`text-[10px] mt-1.5 font-medium hidden sm:block ${
                    i <= step ? 'text-[#1A1A2E]' : 'text-[#B0B8C9]'
                  }`}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 rounded-full transition-all ${
                    i < step ? 'bg-[#2EA043]' : 'bg-[#E2E6EA]'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="px-6 py-10">
        <div className="max-w-xl mx-auto">

          {/* ── Step 1: Company Details ── */}
          {step === 0 && (
            <div className="bg-white rounded-xl border border-[#E2E6EA] p-6 shadow-sm">
              <h2 className="text-xl font-bold text-[#1A1A2E] mb-1">Company Details</h2>
              <p className="text-sm text-[#6B7A99] mb-6">Tell us a bit about your company</p>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Company Name *</label>
                  <input value={companyName} onChange={e => setCompanyName(e.target.value)} className={inputCls} placeholder="Your company name" />
                </div>
                <div>
                  <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Address</label>
                  <input value={address} onChange={e => setAddress(e.target.value)} className={inputCls} placeholder="Office or site address" />
                </div>
                <div>
                  <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Website</label>
                  <input value={website} onChange={e => setWebsite(e.target.value)} className={inputCls} placeholder="https://yourcompany.co.uk" />
                </div>
                <div>
                  <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Industry Focus</label>
                  <select value={industry} onChange={e => setIndustry(e.target.value)} className={inputCls}>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex justify-end mt-6">
                <button onClick={handleStep1Next} disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#1B6FC8] hover:bg-[#1558A0] text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Branding ── */}
          {step === 1 && (
            <div className="bg-white rounded-xl border border-[#E2E6EA] p-6 shadow-sm">
              <h2 className="text-xl font-bold text-[#1A1A2E] mb-1">Branding</h2>
              <p className="text-sm text-[#6B7A99] mb-6">Make CoreSite look like your own platform</p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  {/* Logo upload */}
                  <div>
                    <label className="text-xs text-[#6B7A99] font-medium mb-2 block">Company Logo</label>
                    <div
                      onDragOver={e => { e.preventDefault(); setDragging(true) }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={handleDrop}
                      onClick={() => logoInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                        dragging ? 'border-[#1B6FC8] bg-[#1B6FC8]/5' : 'border-[#E2E6EA] hover:border-[#B0B8C9]'
                      }`}
                    >
                      {logoPreview ? (
                        <div className="flex flex-col items-center gap-2">
                          <img src={logoPreview} alt="Logo" className="w-16 h-16 object-contain" />
                          <p className="text-xs text-[#6B7A99]">Click to change</p>
                        </div>
                      ) : (
                        <>
                          <Upload size={24} className="mx-auto text-[#B0B8C9] mb-2" />
                          <p className="text-sm text-[#6B7A99]">Drag & drop or click to upload</p>
                          <p className="text-xs text-[#B0B8C9] mt-1">PNG, JPG, SVG</p>
                        </>
                      )}
                      <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoSelect} className="hidden" />
                    </div>
                  </div>

                  {/* Colours */}
                  <div>
                    <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Primary Colour</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={primaryColour} onChange={e => setPrimaryColour(e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-[#E2E6EA]" />
                      <input value={primaryColour} onChange={e => setPrimaryColour(e.target.value)}
                        className={`${inputCls} flex-1`} placeholder="#1B6FC8" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Sidebar Colour</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={sidebarColour} onChange={e => setSidebarColour(e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-[#E2E6EA]" />
                      <input value={sidebarColour} onChange={e => setSidebarColour(e.target.value)}
                        className={`${inputCls} flex-1`} placeholder="#1A2744" />
                    </div>
                  </div>
                </div>

                {/* Sidebar preview */}
                <div>
                  <label className="text-xs text-[#6B7A99] font-medium mb-2 block">Preview</label>
                  <div className="rounded-xl overflow-hidden border border-[#E2E6EA] h-64">
                    <div className="h-full flex">
                      <div className="w-16 h-full flex flex-col items-center pt-4 gap-3" style={{ backgroundColor: sidebarColour }}>
                        {logoPreview ? (
                          <img src={logoPreview} alt="" className="w-8 h-8 object-contain rounded" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-white/20" />
                        )}
                        {[1, 2, 3, 4, 5].map(i => (
                          <div key={i} className={`w-8 h-8 rounded-lg ${i === 1 ? '' : 'bg-white/5'}`}
                            style={i === 1 ? { backgroundColor: `${primaryColour}30` } : {}}>
                            {i === 1 && <div className="w-full h-full rounded-lg flex items-center justify-center">
                              <div className="w-3 h-3 rounded" style={{ backgroundColor: primaryColour }} />
                            </div>}
                          </div>
                        ))}
                      </div>
                      <div className="flex-1 bg-[#F8FAFC] p-3">
                        <div className="h-3 w-24 rounded bg-[#E2E6EA] mb-3" />
                        <div className="grid grid-cols-2 gap-2">
                          <div className="h-16 rounded-lg bg-white border border-[#E2E6EA]" />
                          <div className="h-16 rounded-lg bg-white border border-[#E2E6EA]" />
                        </div>
                        <div className="mt-2 h-2 w-16 rounded" style={{ backgroundColor: primaryColour }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between mt-6">
                <button onClick={() => setStep(0)} className="flex items-center gap-1 text-sm text-[#6B7A99] hover:text-[#1A1A2E] transition-colors">
                  <ChevronLeft size={16} /> Back
                </button>
                <div className="flex gap-3">
                  <button onClick={() => { saveStep(2); setStep(2) }} className="px-5 py-2.5 text-sm text-[#6B7A99] hover:text-[#1A1A2E] transition-colors">
                    Skip
                  </button>
                  <button onClick={handleStep2Next} disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[#1B6FC8] hover:bg-[#1558A0] text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: First Project ── */}
          {step === 2 && (
            <div className="bg-white rounded-xl border border-[#E2E6EA] p-6 shadow-sm">
              <h2 className="text-xl font-bold text-[#1A1A2E] mb-1">Create Your First Project</h2>
              <p className="text-sm text-[#6B7A99] mb-6">Projects hold your drawings, snags, and documents</p>

              {projectCreated ? (
                <div className="flex items-center gap-3 p-4 bg-[#ECFDF5] border border-[#BBF7D0] rounded-xl mb-4">
                  <div className="w-9 h-9 bg-[#2EA043] rounded-full flex items-center justify-center shrink-0">
                    <Check size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#166534]">{projectCreated.name}</p>
                    <p className="text-xs text-[#22C55E]">Project created successfully</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Project Name *</label>
                    <input value={projectName} onChange={e => setProjectName(e.target.value)} className={inputCls} placeholder="e.g. Bancroft Phase 2" />
                  </div>
                  <div>
                    <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Site Address</label>
                    <input value={siteAddress} onChange={e => setSiteAddress(e.target.value)} className={inputCls} placeholder="Site location" />
                  </div>
                  <div>
                    <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Client Name</label>
                    <input value={clientName} onChange={e => setClientName(e.target.value)} className={inputCls} placeholder="Optional" />
                  </div>
                  <button onClick={handleCreateProject} disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#2EA043] hover:bg-[#27903A] text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />}
                    Create Project
                  </button>
                </div>
              )}

              <div className="flex justify-between mt-6">
                <button onClick={() => setStep(1)} className="flex items-center gap-1 text-sm text-[#6B7A99] hover:text-[#1A1A2E] transition-colors">
                  <ChevronLeft size={16} /> Back
                </button>
                <div className="flex gap-3">
                  {!projectCreated && (
                    <button onClick={handleStep3Skip} className="text-sm text-[#6B7A99] hover:text-[#1A1A2E] transition-colors">
                      Skip — I'll do this later
                    </button>
                  )}
                  <button onClick={handleStep3Next}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[#1B6FC8] hover:bg-[#1558A0] text-white font-semibold rounded-lg text-sm transition-colors">
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 4: First Drawing ── */}
          {step === 3 && (
            <div className="bg-white rounded-xl border border-[#E2E6EA] p-6 shadow-sm">
              <h2 className="text-xl font-bold text-[#1A1A2E] mb-1">Upload a Drawing</h2>
              <p className="text-sm text-[#6B7A99] mb-6">Add a floor plan or site drawing to your project</p>

              {!projectCreated ? (
                <div className="text-center py-8">
                  <p className="text-sm text-[#6B7A99] mb-4">No project created — skipping this step.</p>
                </div>
              ) : drawingUploaded ? (
                <div className="flex items-center gap-3 p-4 bg-[#ECFDF5] border border-[#BBF7D0] rounded-xl">
                  <div className="w-9 h-9 bg-[#2EA043] rounded-full flex items-center justify-center shrink-0">
                    <Check size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#166534]">Drawing uploaded</p>
                    <p className="text-xs text-[#22C55E]">Ready for snagging and progress tracking</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div
                    className="border-2 border-dashed border-[#E2E6EA] rounded-xl p-8 text-center cursor-pointer hover:border-[#B0B8C9] transition-colors"
                    onClick={() => document.getElementById('drawing-input')?.click()}
                  >
                    {drawingFile ? (
                      <div className="flex items-center justify-center gap-3">
                        <FileUp size={20} className="text-[#1B6FC8]" />
                        <span className="text-sm text-[#1A1A2E] font-medium">{drawingFile.name}</span>
                        <button onClick={e => { e.stopPropagation(); setDrawingFile(null) }} className="text-[#B0B8C9] hover:text-[#DA3633]">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Upload size={28} className="mx-auto text-[#B0B8C9] mb-2" />
                        <p className="text-sm text-[#6B7A99]">Click to select a drawing</p>
                        <p className="text-xs text-[#B0B8C9] mt-1">PDF or PNG</p>
                      </>
                    )}
                    <input id="drawing-input" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setDrawingFile(e.target.files?.[0] || null)} className="hidden" />
                  </div>
                  {drawingFile && (
                    <button onClick={handleUploadDrawing} disabled={saving}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#1B6FC8] hover:bg-[#1558A0] text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors">
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      Upload Drawing
                    </button>
                  )}
                </div>
              )}

              <div className="flex justify-between mt-6">
                <button onClick={() => setStep(2)} className="flex items-center gap-1 text-sm text-[#6B7A99] hover:text-[#1A1A2E] transition-colors">
                  <ChevronLeft size={16} /> Back
                </button>
                <div className="flex gap-3">
                  <button onClick={() => { saveStep(4); setStep(4) }} className="text-sm text-[#6B7A99] hover:text-[#1A1A2E] transition-colors">
                    Skip
                  </button>
                  <button onClick={() => { saveStep(4); setStep(4) }}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[#1B6FC8] hover:bg-[#1558A0] text-white font-semibold rounded-lg text-sm transition-colors">
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 5: Invite Team ── */}
          {step === 4 && (
            <div className="bg-white rounded-xl border border-[#E2E6EA] p-6 shadow-sm">
              <h2 className="text-xl font-bold text-[#1A1A2E] mb-1">Invite Your Team</h2>
              <p className="text-sm text-[#6B7A99] mb-6">Add your first team member to CoreSite</p>

              {/* Invited list */}
              {invitedPeople.length > 0 && (
                <div className="space-y-2 mb-5">
                  {invitedPeople.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-[#ECFDF5] border border-[#BBF7D0] rounded-lg">
                      <div className="w-7 h-7 bg-[#2EA043] rounded-full flex items-center justify-center shrink-0">
                        <Check size={14} className="text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#166534] truncate">{p.name}</p>
                        <p className="text-xs text-[#22C55E] truncate">{p.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Name</label>
                    <input value={inviteName} onChange={e => setInviteName(e.target.value)} className={inputCls} placeholder="Team member name" />
                  </div>
                  <div>
                    <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Email</label>
                    <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className={inputCls} placeholder="their@email.com" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleInvite} disabled={inviting}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#1B6FC8] hover:bg-[#1558A0] text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors">
                    {inviting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                    Send Invite
                  </button>
                  {invitedPeople.length > 0 && (
                    <button onClick={() => { setInviteName(''); setInviteEmail('') }}
                      className="flex items-center gap-1 px-3 py-2.5 text-sm text-[#6B7A99] hover:text-[#1A1A2E] transition-colors">
                      <Plus size={14} /> Add another
                    </button>
                  )}
                </div>
              </div>

              <div className="flex justify-between mt-8 pt-5 border-t border-[#E2E6EA]">
                <button onClick={() => setStep(projectCreated ? 3 : 2)} className="flex items-center gap-1 text-sm text-[#6B7A99] hover:text-[#1A1A2E] transition-colors">
                  <ChevronLeft size={16} /> Back
                </button>
                <button onClick={handleFinish} disabled={saving}
                  className="flex items-center gap-2 px-8 py-3 bg-[#2EA043] hover:bg-[#27903A] text-white font-bold rounded-lg text-sm disabled:opacity-50 transition-colors shadow-lg shadow-[#2EA043]/20">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                  Finish Setup
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
