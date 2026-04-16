import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import toast from 'react-hot-toast'
import { Building2, Upload, Loader2, CheckCircle2 } from 'lucide-react'

export default function AgencyRegister() {
  const navigate = useNavigate()
  const managerData = JSON.parse(getSession('manager_data') || '{}')

  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    company_name: '',
    trading_name: '',
    company_registration_number: '',
    vat_number: '',
    registered_address: '',
    primary_contact_name: managerData.name || '',
    primary_contact_email: managerData.email || '',
    primary_contact_phone: '',
  })
  const [logoFile, setLogoFile] = useState(null)
  const [insuranceFile, setInsuranceFile] = useState(null)
  const [insuranceExpiry, setInsuranceExpiry] = useState('')

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!form.company_name || !form.primary_contact_name || !form.primary_contact_email) {
      toast.error('Company name, contact name, and email are required')
      return
    }

    setSaving(true)
    try {
      let logo_url = null
      let insurance_document_url = null

      if (logoFile) {
        if (logoFile.size > 5 * 1024 * 1024) throw new Error('Logo must be under 5MB')
        const path = `agencies/logos/${crypto.randomUUID()}-${logoFile.name}`
        const { error: upErr } = await supabase.storage.from('documents').upload(path, logoFile)
        if (upErr) throw new Error(`Logo upload failed: ${upErr.message}`)
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        logo_url = urlData.publicUrl
      }

      if (insuranceFile) {
        if (insuranceFile.size > 10 * 1024 * 1024) throw new Error('Insurance document must be under 10MB')
        const path = `agencies/insurance/${crypto.randomUUID()}-${insuranceFile.name}`
        const { error: upErr } = await supabase.storage.from('documents').upload(path, insuranceFile)
        if (upErr) throw new Error(`Insurance upload failed: ${upErr.message}`)
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        insurance_document_url = urlData.publicUrl
      }

      const { data: agency, error } = await supabase.from('agencies').insert({
        company_name: form.company_name,
        trading_name: form.trading_name || null,
        company_registration_number: form.company_registration_number || null,
        vat_number: form.vat_number || null,
        registered_address: form.registered_address || null,
        primary_contact_name: form.primary_contact_name,
        primary_contact_email: form.primary_contact_email,
        primary_contact_phone: form.primary_contact_phone || null,
        logo_url,
        insurance_document_url,
        insurance_expiry_date: insuranceExpiry || null,
        status: 'pending_verification',
      }).select().single()

      if (error) throw new Error(error.message)

      // Link the current user to the agency
      await supabase.from('agency_users').insert({
        agency_id: agency.id,
        email: managerData.email,
        name: managerData.name || form.primary_contact_name,
        role: 'admin',
      })

      setSubmitted(true)
      toast.success('Agency registration submitted')
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Registration failed')
    }
    setSaving(false)
  }

  if (submitted) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4" style={{ backgroundColor: '#f8fafc' }}>
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md w-full text-center">
          <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-900 mb-2">Registration Submitted</h2>
          <p className="text-sm text-slate-500 mb-6">
            We will verify your account within 24 hours. You will receive an email confirmation once your agency is approved.
          </p>
          <button
            onClick={() => navigate('/app/agency')}
            className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const inputCls = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400'
  const labelCls = 'block text-xs font-medium text-slate-600 mb-1'

  return (
    <div className="min-h-dvh flex items-center justify-center p-4" style={{ backgroundColor: '#f8fafc' }}>
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg">
        <div className="px-6 py-5 border-b border-slate-200 text-center">
          <Building2 size={32} className="text-blue-500 mx-auto mb-2" />
          <h1 className="text-lg font-bold text-slate-900">Register Your Agency</h1>
          <p className="text-sm text-slate-500">Join the CoreSite labour marketplace</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Company Details */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Company Details</h3>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Company Name *</label>
                <input type="text" value={form.company_name} onChange={e => updateForm('company_name', e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Trading Name</label>
                <input type="text" value={form.trading_name} onChange={e => updateForm('trading_name', e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Company Reg No.</label>
                  <input type="text" value={form.company_registration_number} onChange={e => updateForm('company_registration_number', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>VAT Number</label>
                  <input type="text" value={form.vat_number} onChange={e => updateForm('vat_number', e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Registered Address</label>
                <textarea value={form.registered_address} onChange={e => updateForm('registered_address', e.target.value)} rows={2} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Primary Contact</h3>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Contact Name *</label>
                <input type="text" value={form.primary_contact_name} onChange={e => updateForm('primary_contact_name', e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Email *</label>
                <input type="email" value={form.primary_contact_email} onChange={e => updateForm('primary_contact_email', e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input type="tel" value={form.primary_contact_phone} onChange={e => updateForm('primary_contact_phone', e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Uploads */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Documents</h3>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Company Logo</label>
                <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors">
                  <Upload size={14} />
                  {logoFile ? logoFile.name : 'Upload logo...'}
                  <input type="file" accept="image/*" onChange={e => setLogoFile(e.target.files?.[0] || null)} className="hidden" />
                </label>
              </div>
              <div>
                <label className={labelCls}>Insurance Document</label>
                <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors">
                  <Upload size={14} />
                  {insuranceFile ? insuranceFile.name : 'Upload insurance document...'}
                  <input type="file" accept=".pdf,image/*" onChange={e => setInsuranceFile(e.target.files?.[0] || null)} className="hidden" />
                </label>
              </div>
              <div>
                <label className={labelCls}>Insurance Expiry Date</label>
                <input type="date" value={insuranceExpiry} onChange={e => setInsuranceExpiry(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? 'Submitting...' : 'Register Agency'}
          </button>
        </form>
      </div>
    </div>
  )
}
