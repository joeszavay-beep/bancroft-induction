import { useState, useEffect, useRef } from 'react'
import { useCompany } from '../lib/CompanyContext'
import { supabase } from '../lib/supabase'
import { getSession, setSession } from '../lib/storage'
import LoadingButton from '../components/LoadingButton'
import toast from 'react-hot-toast'
import {
  Palette, Bell, Clock, PoundSterling, ToggleLeft, ShieldCheck,
  Upload, CheckCircle2, AlertTriangle, Lock, Trash2, Image, Building2,
  ChevronRight, Eye, FileText
} from 'lucide-react'

const PRIMARY_PRESETS = [
  { hex: '#1B6FC8', label: 'Blue' },
  { hex: '#2EA043', label: 'Green' },
  { hex: '#7C3AED', label: 'Purple' },
  { hex: '#DC2626', label: 'Red' },
  { hex: '#D29922', label: 'Gold' },
  { hex: '#0891B2', label: 'Teal' },
  { hex: '#4F46E5', label: 'Indigo' },
  { hex: '#EA580C', label: 'Orange' },
  { hex: '#1A2744', label: 'Navy' },
]

const SIDEBAR_PRESETS = [
  { hex: '#1A2744', label: 'Navy' },
  { hex: '#0F172A', label: 'Dark Slate' },
  { hex: '#1E293B', label: 'Slate' },
  { hex: '#18181B', label: 'Zinc' },
  { hex: '#1C1917', label: 'Stone' },
  { hex: '#052E16', label: 'Forest' },
  { hex: '#1E1B4B', label: 'Indigo' },
  { hex: '#2D0A0A', label: 'Maroon' },
]

const CIS_OPTIONS = [
  { value: 20, label: '20% — Standard' },
  { value: 30, label: '30% — Unverified' },
  { value: 0, label: '0% — Gross' },
]

const REPORT_SECTION_DEFAULTS = [
  { id: 'toolbox',   defaultName: 'Toolbox Talks' },
  { id: 'training',  defaultName: 'Operative Training Matrix' },
  { id: 'mgmt',      defaultName: 'Management Training' },
  { id: 'equipment', defaultName: 'Equipment Register' },
  { id: 'pm',        defaultName: 'PM Inspection' },
  { id: 'env',       defaultName: 'Environmental Inspection' },
  { id: 'operative', defaultName: 'Operative Inspection' },
  { id: 'rams',      defaultName: 'RAMS Register' },
  { id: 'labour',    defaultName: 'Labour Return' },
  { id: 'safestart', defaultName: 'Safe Start Cards' },
]

const SECTIONS = [
  { id: 'branding', label: 'Company Branding', icon: Palette },
  { id: 'pdf-templates', label: 'PDF Templates', icon: FileText },
  { id: 'hs-report', label: 'H&S Report Settings', icon: FileText },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'site-defaults', label: 'Site Defaults', icon: Clock },
  { id: 'commercial', label: 'Commercial Defaults', icon: PoundSterling },
  { id: 'features', label: 'Feature Toggles', icon: ToggleLeft },
  { id: 'security', label: 'Account & Security', icon: ShieldCheck },
]

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
        checked ? 'bg-[var(--primary-color)]' : 'bg-slate-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
        checked ? 'translate-x-5' : ''
      }`} />
    </button>
  )
}

function SectionCard({ id, icon: Icon, title, children }) {
  return (
    <div id={id} className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 scroll-mt-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
          <Icon size={20} className="text-[var(--primary-color)]" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function ColourPresets({ presets, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map(p => (
        <button
          key={p.hex}
          type="button"
          onClick={() => onChange(p.hex)}
          className={`w-9 h-9 rounded-lg border-2 transition-all ${
            value === p.hex ? 'border-slate-900 scale-110 shadow-md' : 'border-transparent hover:border-slate-300'
          }`}
          style={{ backgroundColor: p.hex }}
          title={p.label}
        />
      ))}
    </div>
  )
}

export default function CompanySettings() {
  const { company, refreshCompany } = useCompany()
  const [loading, setLoading] = useState(true)
  const [companyData, setCompanyData] = useState(null)
  const [activeSection, setActiveSection] = useState('branding')

  // Branding state
  const [companyName, setCompanyName] = useState('')
  const [primaryColour, setPrimaryColour] = useState('#1B6FC8')
  const [sidebarColour, setSidebarColour] = useState('#1A2744')
  const [logoPreview, setLogoPreview] = useState(null)
  const [logoFile, setLogoFile] = useState(null)
  const [savingBranding, setSavingBranding] = useState(false)
  const logoInputRef = useRef(null)

  // Notification state
  const [notifEmail, setNotifEmail] = useState('')
  const [emailNotificationsOn, setEmailNotificationsOn] = useState(true)
  const [autoChaseOn, setAutoChaseOn] = useState(false)
  const [autoChaseDays, setAutoChaseDays] = useState(7)
  const [certExpiryWarnOn, setCertExpiryWarnOn] = useState(true)
  const [certExpiryDays, setCertExpiryDays] = useState(30)
  const [savingNotif, setSavingNotif] = useState(false)

  // Site defaults state
  const [siteStartTime, setSiteStartTime] = useState('07:30')
  const [siteEndTime, setSiteEndTime] = useState('17:00')
  const [autoSignOutTime, setAutoSignOutTime] = useState('23:59')
  const [requireGPS, setRequireGPS] = useState(false)
  const [requireDOB, setRequireDOB] = useState(true)
  const [savingSite, setSavingSite] = useState(false)

  // Commercial state
  const [retentionPct, setRetentionPct] = useState(5)
  const [paymentTermsDays, setPaymentTermsDays] = useState(30)
  const [cisRate, setCisRate] = useState(20)
  const [savingCommercial, setSavingCommercial] = useState(false)

  // Features state
  const [features, setFeatures] = useState({
    bim_models: true,
    programme_tracking: true,
    labour_marketplace: true,
    commercial_module: true,
    inspections: true,
    aftercare_portal: true,
    permits_to_work: true,
  })
  const [savingFeatures, setSavingFeatures] = useState(false)

  // PDF Template state
  const [pdfHeaderStyle, setPdfHeaderStyle] = useState('modern')
  const [pdfFooterText, setPdfFooterText] = useState('')
  const [pdfShowCoreSite, setPdfShowCoreSite] = useState(true)
  const [savingPdf, setSavingPdf] = useState(false)

  // H&S Report Settings state
  const [companyPrefix, setCompanyPrefix] = useState('')
  const [sectionConfig, setSectionConfig] = useState(
    REPORT_SECTION_DEFAULTS.map(s => ({ id: s.id, name: s.defaultName, included: true }))
  )
  const [numberingTemplate, setNumberingTemplate] = useState('{project_prefix}-{company_prefix}-XX-HS-X-{seq:05d}')
  const [savingReport, setSavingReport] = useState(false)

  // Load company data
  useEffect(() => {
    async function load() {
      let cid = company?.id
      if (!cid) {
        const stored = getSession('manager_data')
        if (stored) {
          try { cid = JSON.parse(stored).company_id } catch { /* ignore */ }
        }
      }
      if (!cid) { setLoading(false); return }

      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', cid)
        .single()

      if (error || !data) {
        setLoading(false)
        return
      }

      setCompanyData(data)
      setCompanyName(data.name || '')
      setPrimaryColour(data.primary_colour || '#1B6FC8')
      setSidebarColour(data.secondary_colour || '#1A2744')
      if (data.logo_url) setLogoPreview(data.logo_url)

      // Load settings from JSONB or individual columns
      const s = data.settings || {}
      setNotifEmail(s.notification_email || '')
      setEmailNotificationsOn(s.email_notifications !== false)
      setAutoChaseOn(!!s.auto_chase_enabled)
      setAutoChaseDays(s.auto_chase_days || 7)
      setCertExpiryWarnOn(s.cert_expiry_warn !== false)
      setCertExpiryDays(s.cert_expiry_days || 30)
      setSiteStartTime(s.site_start_time || '07:30')
      setSiteEndTime(s.site_end_time || '17:00')
      setAutoSignOutTime(s.auto_sign_out_time || '23:59')
      setRequireGPS(!!s.require_gps)
      setRequireDOB(s.require_dob !== false)
      setRetentionPct(s.retention_pct ?? 5)
      setPaymentTermsDays(s.payment_terms_days ?? 30)
      setCisRate(s.cis_rate ?? 20)

      // Features
      const f = data.features || {}
      setFeatures({
        bim_models: f.bim_models !== false,
        programme_tracking: f.programme_tracking !== false,
        labour_marketplace: f.labour_marketplace !== false,
        commercial_module: f.commercial_module !== false,
        inspections: f.inspections !== false,
        aftercare_portal: f.aftercare_portal !== false,
        permits_to_work: f.permits_to_work !== false,
      })

      // PDF Template settings
      const pdf = s.pdf_template || {}
      setPdfHeaderStyle(pdf.header_style || 'modern')
      setPdfFooterText(pdf.footer_text || '')
      setPdfShowCoreSite(pdf.show_coresite_branding !== false)

      // H&S Report settings
      const rpt = s.report || {}
      setCompanyPrefix(rpt.company_prefix || (data.name || '').substring(0, 3).toUpperCase())
      if (Array.isArray(rpt.section_config) && rpt.section_config.length > 0) {
        setSectionConfig(rpt.section_config)
      } else {
        setSectionConfig(REPORT_SECTION_DEFAULTS.map(sec => ({ id: sec.id, name: sec.defaultName, included: true })))
      }
      setNumberingTemplate(rpt.numbering_template || '{project_prefix}-{company_prefix}-XX-HS-X-{seq:05d}')

      // Also load notification email from settings table (existing functionality)
      const { data: settingsRow } = await supabase.from('settings').select('*').eq('key', 'pm_email').single()
      if (settingsRow?.value) setNotifEmail(settingsRow.value)

      setLoading(false)
    }
    load()
  }, [company?.id])

  // Track active section on scroll
  useEffect(() => {
    function onScroll() {
      const scrollContainer = document.querySelector('main')
      if (!scrollContainer) return
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id)
        if (el) {
          const rect = el.getBoundingClientRect()
          if (rect.top <= 160) setActiveSection(s.id)
        }
      }
    }
    const main = document.querySelector('main')
    if (main) main.addEventListener('scroll', onScroll, { passive: true })
    return () => { if (main) main.removeEventListener('scroll', onScroll) }
  }, [])

  const cid = companyData?.id

  // Save branding
  async function saveBranding() {
    if (!cid) return
    if (!companyName.trim()) { toast.error('Company name is required'); return }
    setSavingBranding(true)
    try {
      let logoUrl = companyData.logo_url
      if (logoFile) {
        const ext = logoFile.name.split('.').pop()
        const path = `logos/${cid}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('documents').upload(path, logoFile, { upsert: true })
        if (upErr) throw upErr
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        logoUrl = urlData.publicUrl
      }

      const { data, error } = await supabase.from('companies').update({
        name: companyName.trim(),
        logo_url: logoUrl,
        primary_colour: primaryColour,
        secondary_colour: sidebarColour,
      }).eq('id', cid).select().single()

      if (error) throw error

      setCompanyData(data)
      refreshCompany(data)

      // Update sessionStorage so sidebar reflects immediately
      const stored = getSession('manager_data')
      if (stored) {
        try {
          const md = JSON.parse(stored)
          md.company_name = data.name
          setSession('manager_data', JSON.stringify(md))
        } catch { /* ignore */ }
      }

      // Apply CSS variables immediately
      document.documentElement.style.setProperty('--primary-color', primaryColour)
      document.documentElement.style.setProperty('--sidebar-color', sidebarColour)

      toast.success('Branding saved')
    } catch (err) {
      toast.error(err.message || 'Failed to save branding')
    }
    setSavingBranding(false)
  }

  // Save notifications
  async function saveNotifications() {
    if (!cid) return
    setSavingNotif(true)
    try {
      const currentSettings = companyData.settings || {}
      const newSettings = {
        ...currentSettings,
        notification_email: notifEmail.trim(),
        email_notifications: emailNotificationsOn,
        auto_chase_enabled: autoChaseOn,
        auto_chase_days: autoChaseDays,
        cert_expiry_warn: certExpiryWarnOn,
        cert_expiry_days: certExpiryDays,
      }

      const { data, error } = await supabase.from('companies').update({
        settings: newSettings,
      }).eq('id', cid).select().single()
      if (error) throw error

      // Also save to settings table for backward compatibility
      if (notifEmail.trim()) {
        await supabase.from('settings').upsert({
          key: 'pm_email',
          value: notifEmail.trim(),
        }, { onConflict: 'key' })
      }

      setCompanyData(data)
      toast.success('Notification preferences saved')
    } catch (err) {
      toast.error(err.message || 'Failed to save notifications')
    }
    setSavingNotif(false)
  }

  // Save site defaults
  async function saveSiteDefaults() {
    if (!cid) return
    setSavingSite(true)
    try {
      const currentSettings = companyData.settings || {}
      const newSettings = {
        ...currentSettings,
        site_start_time: siteStartTime,
        site_end_time: siteEndTime,
        auto_sign_out_time: autoSignOutTime,
        require_gps: requireGPS,
        require_dob: requireDOB,
      }

      const { data, error } = await supabase.from('companies').update({
        settings: newSettings,
      }).eq('id', cid).select().single()
      if (error) throw error

      setCompanyData(data)
      toast.success('Site defaults saved')
    } catch (err) {
      toast.error(err.message || 'Failed to save site defaults')
    }
    setSavingSite(false)
  }

  // Save commercial defaults
  async function saveCommercial() {
    if (!cid) return
    setSavingCommercial(true)
    try {
      const currentSettings = companyData.settings || {}
      const newSettings = {
        ...currentSettings,
        retention_pct: retentionPct,
        payment_terms_days: paymentTermsDays,
        cis_rate: cisRate,
      }

      const { data, error } = await supabase.from('companies').update({
        settings: newSettings,
      }).eq('id', cid).select().single()
      if (error) throw error

      setCompanyData(data)
      toast.success('Commercial defaults saved')
    } catch (err) {
      toast.error(err.message || 'Failed to save commercial defaults')
    }
    setSavingCommercial(false)
  }

  // Save features
  async function saveFeatures() {
    if (!cid) return
    setSavingFeatures(true)
    try {
      const { data, error } = await supabase.from('companies').update({
        features,
      }).eq('id', cid).select().single()
      if (error) throw error

      setCompanyData(data)
      refreshCompany(data)
      toast.success('Feature toggles saved')
    } catch (err) {
      toast.error(err.message || 'Failed to save features')
    }
    setSavingFeatures(false)
  }

  // Save PDF template settings
  async function savePdfTemplate() {
    if (!cid) return
    setSavingPdf(true)
    try {
      const currentSettings = companyData.settings || {}
      const newSettings = {
        ...currentSettings,
        pdf_template: {
          header_style: pdfHeaderStyle,
          footer_text: pdfFooterText || '',
          show_coresite_branding: pdfShowCoreSite,
        },
      }

      const { data, error } = await supabase.from('companies').update({
        settings: newSettings,
      }).eq('id', cid).select().single()
      if (error) throw error

      setCompanyData(data)
      toast.success('PDF template settings saved')
    } catch (err) {
      toast.error(err.message || 'Failed to save PDF settings')
    }
    setSavingPdf(false)
  }

  async function saveReportSettings() {
    if (!cid) return
    setSavingReport(true)
    try {
      const currentSettings = companyData.settings || {}
      const newSettings = {
        ...currentSettings,
        report: {
          company_prefix: companyPrefix.trim().toUpperCase().slice(0, 5) || (companyData.name || '').substring(0, 3).toUpperCase(),
          section_config: sectionConfig,
          numbering_template: numberingTemplate.trim() || '{project_prefix}-{company_prefix}-XX-HS-X-{seq:05d}',
        },
      }

      const { data, error } = await supabase.from('companies').update({
        settings: newSettings,
      }).eq('id', cid).select().single()
      if (error) throw error

      setCompanyData(data)
      toast.success('H&S report settings saved')
    } catch (err) {
      toast.error(err.message || 'Failed to save report settings')
    }
    setSavingReport(false)
  }

  // Password reset
  async function handlePasswordReset() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const email = session?.user?.email
      if (!email) { toast.error('No email found for current user'); return }
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      toast.success('Password reset email sent — check your inbox')
    } catch (err) {
      toast.error(err.message || 'Failed to send reset email')
    }
  }

  function handleLogoSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo must be under 5MB')
      return
    }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  function scrollToSection(id) {
    setActiveSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--primary-color)] border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!companyData) {
    return (
      <div className="text-center py-20 text-slate-500">
        <p>Could not load company data.</p>
      </div>
    )
  }

  const inputCls = "w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[var(--primary-color)] focus:ring-2 focus:ring-[var(--primary-color)]/10 text-sm bg-white"
  const labelCls = "block text-sm font-medium text-slate-700 mb-1.5"

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Company Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your company branding, preferences and features</p>
      </div>

      <div className="flex gap-6">
        {/* Section navigation — desktop */}
        <nav className="hidden lg:block w-52 shrink-0">
          <div className="sticky top-6 space-y-0.5">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                  activeSection === s.id
                    ? 'bg-[var(--primary-color)]/10 text-[var(--primary-color)] font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <s.icon size={16} />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Mobile section nav — horizontal scroll */}
        <div className="lg:hidden fixed top-12 left-0 right-0 z-10 bg-white border-b border-slate-200 px-3 py-2 overflow-x-auto flex gap-2 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => scrollToSection(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors ${
                activeSection === s.id
                  ? 'bg-[var(--primary-color)] text-white font-medium'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <s.icon size={12} />
              {s.label}
            </button>
          ))}
        </div>

        {/* Settings cards */}
        <div className="flex-1 space-y-6 min-w-0 lg:pt-0 pt-14">

          {/* Section 1: Branding */}
          <SectionCard id="branding" icon={Palette} title="Company Branding">
            <div className="space-y-5">
              {/* Company Name */}
              <div>
                <label className={labelCls}>Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="Your company name"
                  className={inputCls}
                />
              </div>

              {/* Logo Upload */}
              <div>
                <label className={labelCls}>Logo</label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 border border-slate-200 rounded-xl flex items-center justify-center overflow-hidden bg-slate-50 shrink-0">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-2" />
                    ) : (
                      <Image size={24} className="text-slate-300" />
                    )}
                  </div>
                  <div>
                    <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoSelect} className="hidden" />
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 transition-colors"
                    >
                      <Upload size={14} />
                      Upload New Logo
                    </button>
                    <p className="text-xs text-slate-400 mt-1.5">PNG, SVG or JPG. Max 5MB.</p>
                  </div>
                </div>
              </div>

              {/* Primary Colour */}
              <div>
                <label className={labelCls}>Primary Colour</label>
                <p className="text-xs text-slate-400 mb-2">Used for buttons, links and accents throughout the app</p>
                <ColourPresets presets={PRIMARY_PRESETS} value={primaryColour} onChange={setPrimaryColour} />
                <div className="flex items-center gap-3 mt-3">
                  <input
                    type="color"
                    value={primaryColour}
                    onChange={e => setPrimaryColour(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={primaryColour}
                    onChange={e => setPrimaryColour(e.target.value)}
                    className="w-28 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 font-mono"
                    maxLength={7}
                  />
                  <div className="h-10 px-4 rounded-lg flex items-center text-white text-sm font-medium" style={{ backgroundColor: primaryColour }}>
                    Button Preview
                  </div>
                </div>
              </div>

              {/* Sidebar Colour */}
              <div>
                <label className={labelCls}>Sidebar Colour</label>
                <p className="text-xs text-slate-400 mb-2">Background colour for the navigation sidebar</p>
                <ColourPresets presets={SIDEBAR_PRESETS} value={sidebarColour} onChange={setSidebarColour} />
                <div className="flex items-center gap-3 mt-3">
                  <input
                    type="color"
                    value={sidebarColour}
                    onChange={e => setSidebarColour(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={sidebarColour}
                    onChange={e => setSidebarColour(e.target.value)}
                    className="w-28 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 font-mono"
                    maxLength={7}
                  />
                </div>
              </div>

              {/* Sidebar Preview */}
              <div>
                <label className={labelCls}>
                  <Eye size={14} className="inline mr-1" />
                  Sidebar Preview
                </label>
                <div className="w-56 rounded-xl overflow-hidden shadow-lg border border-slate-200" style={{ backgroundColor: sidebarColour }}>
                  <div className="px-4 py-3 border-b border-white/10">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Logo" className="h-6" />
                    ) : (
                      <span className="text-white font-bold text-sm">{companyName || 'Company'}</span>
                    )}
                  </div>
                  <div className="px-3 py-2 space-y-1">
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/10 text-white text-xs">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: primaryColour }} />
                      <span>Active Item</span>
                    </div>
                    <div className="flex items-center gap-2 px-2 py-1.5 text-white/50 text-xs">
                      <div className="w-3 h-3 rounded-sm bg-white/20" />
                      <span>Menu Item</span>
                    </div>
                    <div className="flex items-center gap-2 px-2 py-1.5 text-white/50 text-xs">
                      <div className="w-3 h-3 rounded-sm bg-white/20" />
                      <span>Menu Item</span>
                    </div>
                  </div>
                  <div className="px-4 py-2 border-t border-white/10">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ backgroundColor: primaryColour }}>
                        AB
                      </div>
                      <span className="text-white/60 text-[10px]">User Name</span>
                    </div>
                  </div>
                </div>
              </div>

              <LoadingButton
                loading={savingBranding}
                onClick={saveBranding}
                className="bg-[var(--primary-color)] hover:opacity-90 text-white"
              >
                Save Branding
              </LoadingButton>
            </div>
          </SectionCard>

          {/* Section 2: PDF Templates */}
          <SectionCard id="pdf-templates" icon={FileText} title="PDF Templates">
            <p className="text-xs text-slate-500 mb-5">Customise the look of exported PDF reports (sign-off sheets, snag reports, audit trails, etc.)</p>
            <div className="space-y-5">
              {/* Header Style */}
              <div>
                <label className={labelCls}>Header Style</label>
                <p className="text-xs text-slate-400 mb-2">Choose how the header appears on PDF reports</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { value: 'modern', label: 'Modern', desc: 'Full header with logo, company name centred, status badge' },
                    { value: 'classic', label: 'Classic', desc: 'Company logo and name left, document type right' },
                    { value: 'minimal', label: 'Minimal', desc: 'Thin header bar with logo and document type' },
                  ].map(style => (
                    <button
                      key={style.value}
                      type="button"
                      onClick={() => setPdfHeaderStyle(style.value)}
                      className={`text-left p-3 rounded-lg border-2 transition-all ${
                        pdfHeaderStyle === style.value
                          ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/5'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{style.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{style.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Footer Text */}
              <div>
                <label className={labelCls}>Footer Text</label>
                <p className="text-xs text-slate-400 mb-1.5">Custom text shown at the bottom of each PDF page</p>
                <input
                  type="text"
                  value={pdfFooterText}
                  onChange={e => setPdfFooterText(e.target.value)}
                  placeholder={`Generated by ${companyName || 'Your Company'}`}
                  className={inputCls}
                />
              </div>

              {/* Show CoreSite branding */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Show "Powered by CoreSite"</p>
                  <p className="text-xs text-slate-500">Appends CoreSite branding after your footer text</p>
                </div>
                <Toggle checked={pdfShowCoreSite} onChange={setPdfShowCoreSite} />
              </div>

              {/* Preview */}
              <div>
                <label className={labelCls}>
                  <Eye size={14} className="inline mr-1" />
                  PDF Header Preview
                </label>
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  {/* Header preview */}
                  {pdfHeaderStyle === 'modern' && (
                    <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: sidebarColour }}>
                      <div className="flex items-center gap-2">
                        {logoPreview ? (
                          <img src={logoPreview} alt="" className="h-7 w-7 object-contain rounded" />
                        ) : (
                          <div className="w-7 h-7 rounded border border-white/30 flex items-center justify-center">
                            <span className="text-white text-[8px] font-bold">LOGO</span>
                          </div>
                        )}
                      </div>
                      <div className="text-center">
                        <p className="text-white text-xs font-bold">{companyName || 'Company Name'}</p>
                        <p className="text-white/70 text-[10px]">Document type</p>
                      </div>
                      <div className="px-2 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: `${primaryColour}33`, color: primaryColour }}>
                        Status
                      </div>
                    </div>
                  )}
                  {pdfHeaderStyle === 'classic' && (
                    <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: sidebarColour }}>
                      <div className="flex items-center gap-2">
                        {logoPreview ? (
                          <img src={logoPreview} alt="" className="h-6 w-6 object-contain rounded" />
                        ) : null}
                        <span className="text-white text-sm font-bold">{companyName || 'Company Name'}</span>
                      </div>
                      <span className="text-white/70 text-xs">Document type</span>
                    </div>
                  )}
                  {pdfHeaderStyle === 'minimal' && (
                    <div className="px-4 py-1.5 flex items-center justify-between" style={{ backgroundColor: sidebarColour }}>
                      <div className="flex items-center gap-2">
                        {logoPreview ? (
                          <img src={logoPreview} alt="" className="h-4 w-4 object-contain rounded" />
                        ) : null}
                        <span className="text-white text-xs font-bold">{companyName || 'Company Name'}</span>
                      </div>
                      <span className="text-white/60 text-[10px]">Document type</span>
                    </div>
                  )}
                  {/* Content placeholder */}
                  <div className="px-4 py-3 bg-white">
                    <div className="h-2 bg-slate-100 rounded w-3/4 mb-1.5" />
                    <div className="h-1.5 bg-slate-50 rounded w-1/2 mb-3" />
                    <div className="flex gap-3 mb-2">
                      <div className="h-1 bg-slate-100 rounded w-16" />
                      <div className="h-1 bg-slate-100 rounded w-20" />
                      <div className="h-1 bg-slate-100 rounded w-12" />
                    </div>
                  </div>
                  {/* Footer preview */}
                  <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      {pdfFooterText || `Generated by ${companyName || 'Your Company'}`}
                      {pdfShowCoreSite && companyName ? ' \u00B7 Powered by CoreSite' : ''}
                    </span>
                    <span className="text-[10px] text-slate-400">16/04/2026 09:30</span>
                  </div>
                </div>
              </div>

              <LoadingButton
                loading={savingPdf}
                onClick={savePdfTemplate}
                className="bg-[var(--primary-color)] hover:opacity-90 text-white"
              >
                Save PDF Settings
              </LoadingButton>
            </div>
          </SectionCard>

          {/* Section: H&S Report Settings */}
          <SectionCard id="hs-report" icon={FileText} title="H&S Report Settings">
            <div className="space-y-6">
              {/* (a) Company prefix */}
              <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-1">Company prefix</h4>
                <p className="text-xs text-slate-500 mb-2">Used in the report reference. For example &apos;ABC&apos; produces reports like RI-ABC-XX-HS-X-00001.</p>
                <input
                  value={companyPrefix}
                  onChange={e => setCompanyPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
                  onBlur={e => setCompanyPrefix(e.target.value.trim().toUpperCase())}
                  placeholder="ABC"
                  maxLength={5}
                  className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 font-mono tracking-widest uppercase focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
                />
              </div>

              {/* (b) Section config */}
              <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-1">Report sections</h4>
                <p className="text-xs text-slate-500 mb-3">Customise section names and toggle sections on or off. Excluded sections won&apos;t appear in the generated PDF.</p>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left">
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 w-12">#</th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500">Section name</th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 w-20 text-center">Include</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionConfig.map((sec, i) => {
                        // Compute sequential number for included sections
                        const includedBefore = sectionConfig.slice(0, i).filter(s => s.included).length
                        const displayNum = sec.included ? String(includedBefore + 1).padStart(2, '0') : '\u2014'
                        return (
                          <tr key={sec.id} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-xs text-slate-400 font-mono">{displayNum}</td>
                            <td className="px-3 py-1.5">
                              <input
                                value={sec.name}
                                onChange={e => {
                                  const updated = [...sectionConfig]
                                  updated[i] = { ...updated[i], name: e.target.value }
                                  setSectionConfig(updated)
                                }}
                                className={`w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-blue-400 ${sec.included ? 'text-slate-900' : 'text-slate-400'}`}
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Toggle
                                checked={sec.included}
                                onChange={v => {
                                  const updated = [...sectionConfig]
                                  updated[i] = { ...updated[i], included: v }
                                  setSectionConfig(updated)
                                }}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <button
                    onClick={() => setSectionConfig(REPORT_SECTION_DEFAULTS.map(s => ({ id: s.id, name: s.defaultName, included: true })))}
                    className="text-xs text-slate-500 hover:text-slate-700 underline"
                  >
                    Reset to defaults
                  </button>
                  <span className="text-xs text-slate-400">
                    {sectionConfig.filter(s => s.included).length} of {sectionConfig.length} sections included
                  </span>
                </div>
              </div>

              {/* (c) Numbering template */}
              <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-1">Report numbering</h4>
                <p className="text-xs text-slate-500 mb-2">
                  Template for the report reference code. Available tokens: <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">{'{project_prefix}'}</code> <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">{'{company_prefix}'}</code> <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">{'{seq:05d}'}</code>
                </p>
                <input
                  value={numberingTemplate}
                  onChange={e => setNumberingTemplate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
                />
                <div className="mt-2 px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg">
                  <span className="text-xs text-slate-500">Preview: </span>
                  <span className="text-xs font-mono text-slate-800">
                    {numberingTemplate
                      .replace('{project_prefix}', 'RI')
                      .replace('{company_prefix}', companyPrefix || 'ABC')
                      .replace('{seq:05d}', '00001')
                    }
                  </span>
                </div>
              </div>

              <LoadingButton
                loading={savingReport}
                onClick={saveReportSettings}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold"
              >
                Save Report Settings
              </LoadingButton>
            </div>
          </SectionCard>

          {/* Section: Notifications */}
          <SectionCard id="notifications" icon={Bell} title="Notification Preferences">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Email Notifications</p>
                  <p className="text-xs text-slate-500">Receive email when operatives complete documents</p>
                </div>
                <Toggle checked={emailNotificationsOn} onChange={setEmailNotificationsOn} />
              </div>

              {emailNotificationsOn && (
                <div>
                  <label className={labelCls}>Notification Email</label>
                  <input
                    type="email"
                    value={notifEmail}
                    onChange={e => setNotifEmail(e.target.value)}
                    placeholder="notifications@company.com"
                    className={inputCls}
                  />
                </div>
              )}

              <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Auto-chase Overdue Documents</p>
                  <p className="text-xs text-slate-500">Automatically remind operatives about overdue documents</p>
                </div>
                <Toggle checked={autoChaseOn} onChange={setAutoChaseOn} />
              </div>

              {autoChaseOn && (
                <div className="flex items-center gap-3">
                  <label className="text-sm text-slate-600 whitespace-nowrap">Chase after</label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={autoChaseDays}
                    onChange={e => setAutoChaseDays(parseInt(e.target.value) || 7)}
                    className="w-20 px-3 py-2 border border-slate-200 rounded-lg text-sm text-center"
                  />
                  <span className="text-sm text-slate-600">days</span>
                </div>
              )}

              <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Cert Expiry Warning</p>
                  <p className="text-xs text-slate-500">Warn before a certificate expires</p>
                </div>
                <Toggle checked={certExpiryWarnOn} onChange={setCertExpiryWarnOn} />
              </div>

              {certExpiryWarnOn && (
                <div className="flex items-center gap-3">
                  <label className="text-sm text-slate-600 whitespace-nowrap">Warn</label>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={certExpiryDays}
                    onChange={e => setCertExpiryDays(parseInt(e.target.value) || 30)}
                    className="w-20 px-3 py-2 border border-slate-200 rounded-lg text-sm text-center"
                  />
                  <span className="text-sm text-slate-600">days before expiry</span>
                </div>
              )}

              <LoadingButton
                loading={savingNotif}
                onClick={saveNotifications}
                className="bg-[var(--primary-color)] hover:opacity-90 text-white"
              >
                Save Notifications
              </LoadingButton>
            </div>
          </SectionCard>

          {/* Section 3: Site Defaults */}
          <SectionCard id="site-defaults" icon={Clock} title="Site Defaults">
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Default Start Time</label>
                  <input type="time" value={siteStartTime} onChange={e => setSiteStartTime(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Default End Time</label>
                  <input type="time" value={siteEndTime} onChange={e => setSiteEndTime(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Auto Sign-out Time</label>
                  <input type="time" value={autoSignOutTime} onChange={e => setAutoSignOutTime(e.target.value)} className={inputCls} />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Require GPS on Sign-in</p>
                  <p className="text-xs text-slate-500">Workers must enable location services when signing in to site</p>
                </div>
                <Toggle checked={requireGPS} onChange={setRequireGPS} />
              </div>

              <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Require DOB Verification</p>
                  <p className="text-xs text-slate-500">Workers must confirm date of birth when signing documents</p>
                </div>
                <Toggle checked={requireDOB} onChange={setRequireDOB} />
              </div>

              <LoadingButton
                loading={savingSite}
                onClick={saveSiteDefaults}
                className="bg-[var(--primary-color)] hover:opacity-90 text-white"
              >
                Save Site Defaults
              </LoadingButton>
            </div>
          </SectionCard>

          {/* Section 4: Commercial Defaults */}
          <SectionCard id="commercial" icon={PoundSterling} title="Commercial Defaults">
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Default Retention (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={retentionPct}
                      onChange={e => setRetentionPct(parseFloat(e.target.value) || 0)}
                      className={inputCls + ' pr-8'}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Default Payment Terms</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={paymentTermsDays}
                      onChange={e => setPaymentTermsDays(parseInt(e.target.value) || 30)}
                      className={inputCls + ' pr-14'}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">days</span>
                  </div>
                </div>
              </div>

              <div>
                <label className={labelCls}>Default CIS Rate</label>
                <select
                  value={cisRate}
                  onChange={e => setCisRate(parseInt(e.target.value))}
                  className={inputCls}
                >
                  {CIS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <LoadingButton
                loading={savingCommercial}
                onClick={saveCommercial}
                className="bg-[var(--primary-color)] hover:opacity-90 text-white"
              >
                Save Commercial Defaults
              </LoadingButton>
            </div>
          </SectionCard>

          {/* Section 5: Feature Toggles */}
          <SectionCard id="features" icon={ToggleLeft} title="Feature Toggles">
            <p className="text-xs text-slate-500 mb-4">Enable or disable major feature modules. Disabled modules will be hidden from the sidebar.</p>
            <div className="space-y-3">
              {[
                { key: 'bim_models', label: 'BIM Models', desc: '3D model viewing and collaboration' },
                { key: 'programme_tracking', label: 'Programme Tracking', desc: 'DXF-based progress tracking and Gantt charts' },
                { key: 'labour_marketplace', label: 'Labour Marketplace', desc: 'Request and manage labour through agencies' },
                { key: 'commercial_module', label: 'Commercial Module', desc: 'Jobs, invoices and payment tracking' },
                { key: 'inspections', label: 'Inspections', desc: 'Site inspections and checklists' },
                { key: 'aftercare_portal', label: 'Aftercare Portal', desc: 'Post-completion defect management' },
                { key: 'permits_to_work', label: 'Permits to Work', desc: 'Hot works, confined spaces and other permits' },
              ].map(f => (
                <div key={f.key} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{f.label}</p>
                    <p className="text-xs text-slate-500">{f.desc}</p>
                  </div>
                  <Toggle
                    checked={features[f.key]}
                    onChange={v => setFeatures(prev => ({ ...prev, [f.key]: v }))}
                  />
                </div>
              ))}
            </div>
            <div className="mt-5">
              <LoadingButton
                loading={savingFeatures}
                onClick={saveFeatures}
                className="bg-[var(--primary-color)] hover:opacity-90 text-white"
              >
                Save Feature Toggles
              </LoadingButton>
            </div>
          </SectionCard>

          {/* Section 6: Account & Security */}
          <SectionCard id="security" icon={ShieldCheck} title="Account & Security">
            <div className="space-y-5">
              {/* Security features */}
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-3">Active Security Features</p>
                <div className="space-y-2 text-sm">
                  {[
                    'DOB identity verification on sign-off',
                    'IP address captured with every signature',
                    'Document version control with re-sign flags',
                    'In-app PDF viewer — operatives must read before signing',
                    'Encrypted data at rest and in transit',
                    'Role-based access control',
                  ].map(feature => (
                    <div key={feature} className="flex items-center gap-2 text-slate-600">
                      <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>

              {/* Change password */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-sm font-semibold text-slate-700 mb-1">Password</p>
                <p className="text-xs text-slate-500 mb-3">Send a password reset link to your email</p>
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 transition-colors"
                >
                  <Lock size={14} />
                  Change Password
                </button>
              </div>

              {/* Danger zone */}
              <div className="border-t border-red-100 pt-4">
                <div className="border border-red-200 rounded-lg p-4 bg-red-50/50">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={16} className="text-red-500" />
                    <p className="text-sm font-semibold text-red-700">Danger Zone</p>
                  </div>
                  <p className="text-xs text-red-600/70 mb-3">
                    Deleting your account is permanent and cannot be undone. All company data, projects, workers and documents will be removed.
                  </p>
                  <button
                    type="button"
                    onClick={() => toast.error('Contact support to delete your account')}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-red-300 rounded-lg text-red-600 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={14} />
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          </SectionCard>

        </div>
      </div>
    </div>
  )
}
