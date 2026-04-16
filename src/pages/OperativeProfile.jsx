import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import { ArrowLeft, User, Shield, Phone, Users, CreditCard, Camera, ZoomIn, X, CheckCircle2, ExternalLink, Lock, Eye, EyeOff } from 'lucide-react'
import AddressLookup from '../components/AddressLookup'
import DateOfBirthPicker from '../components/DateOfBirthPicker'
import { getSession, setSession } from '../lib/storage'

const inputCls = "w-full px-3.5 py-2.5 border border-[#E2E6EA] rounded-lg text-[#1A1A2E] placeholder-[#B0B8C9] text-sm focus:outline-none focus:border-[#1B6FC8] focus:ring-2 focus:ring-[#1B6FC8]/10 bg-white"
const labelCls = "text-[11px] text-[#6B7A99] font-medium mb-1 block uppercase tracking-wider"

export default function OperativeProfile() {
  const { operativeId } = useParams()
  const navigate = useNavigate()
  const [operative, setOperative] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [role, setRole] = useState('')
  const [otherRole, setOtherRole] = useState('')
  const [dob, setDob] = useState('')
  const [niNumber, setNiNumber] = useState('')
  const [address, setAddress] = useState('')
  const [mobile, setMobile] = useState('')
  const [email, setEmail] = useState('')
  const [nextOfKin, setNextOfKin] = useState('')
  const [nextOfKinPhone, setNextOfKinPhone] = useState('')

  // Password (first-time setup only)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Card
  const [cardType, setCardType] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardFrontUrl, setCardFrontUrl] = useState('')
  const [cardBackUrl, setCardBackUrl] = useState('')
  const [uploadingFront, setUploadingFront] = useState(false)
  const [uploadingBack, setUploadingBack] = useState(false)
  const [lightbox, setLightbox] = useState(null)

  async function loadOperative() {
    const { data } = await supabase
      .from('operatives')
      .select('*, projects(name), companies(name, logo_url, primary_colour)')
      .eq('id', operativeId)
      .single()
    if (!data) { navigate('/worker'); return }
    setOperative(data)
    const trades = ['Labourer', 'Apprentice', 'Electrician', 'Plumber', 'BMS Engineer', 'Lighting Control', 'Supervisor', 'Engineer']
    if (data.role && !trades.includes(data.role)) { setRole('Other'); setOtherRole(data.role) } else { setRole(data.role || '') }
    setDob(data.date_of_birth || '')
    setNiNumber(data.ni_number || '')
    setAddress(data.address || '')
    setMobile(data.mobile || '')
    setEmail(data.email || '')
    setNextOfKin(data.next_of_kin || '')
    setNextOfKinPhone(data.next_of_kin_phone || '')
    setCardType(data.card_type || '')
    setCardNumber(data.card_number || '')
    setCardExpiry(data.card_expiry || '')
    setCardFrontUrl(data.card_front_url || '')
    setCardBackUrl(data.card_back_url || '')
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadOperative() }, [])

  async function uploadCardPhoto(file, side) {
    if (!file) return null
    const setter = side === 'front' ? setUploadingFront : setUploadingBack
    setter(true)
    const filePath = `cards/${operativeId}/${side}_${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage.from('documents').upload(filePath, file, { contentType: file.type })
    if (error) { setter(false); toast.error(`Upload failed: ${error.message}`); return null }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)
    setter(false)
    return urlData.publicUrl
  }

  async function handleCardFront(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await uploadCardPhoto(file, 'front')
    if (url) { setCardFrontUrl(url); toast.success('Front uploaded') }
  }

  async function handleCardBack(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await uploadCardPhoto(file, 'back')
    if (url) { setCardBackUrl(url); toast.success('Back uploaded') }
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!cardType) { toast.error('Please select your card type'); return }
    if (!cardNumber.trim()) { toast.error('Please enter your card number'); return }
    if (!cardFrontUrl) { toast.error('Please upload a photo of the front of your card'); return }
    if (!dob) { toast.error('Date of birth is required'); return }

    // Password required on first-time setup
    if (isFirstTime) {
      if (!password.trim()) { toast.error('Please create a password so you can log back in'); return }
      if (password.length < 8) { toast.error('Password must be at least 8 characters'); return }
      if (password !== confirmPassword) { toast.error('Passwords do not match'); return }
    }

    setSaving(true)

    // Create Supabase Auth account on first-time setup
    if (isFirstTime && password.trim()) {
      const opEmail = (email.trim() || operative.email).toLowerCase()
      const { error: signUpErr } = await supabase.auth.signUp({
        email: opEmail,
        password: password.trim(),
        options: { data: { role: 'operative', operative_id: operativeId } },
      })
      if (signUpErr && !signUpErr.message?.includes('already registered')) {
        toast.error(`Account creation failed: ${signUpErr.message}`)
        setSaving(false)
        return
      }
    }

    const { error } = await supabase.from('operatives').update({
      role: (role === 'Other' ? otherRole.trim() : role.trim()) || null,
      date_of_birth: dob || null,
      ni_number: niNumber.trim().toUpperCase() || null,
      address: address.trim() || null,
      mobile: mobile.trim() || null,
      email: email.trim() || null,
      next_of_kin: nextOfKin.trim() || null,
      next_of_kin_phone: nextOfKinPhone.trim() || null,
      card_type: cardType || null,
      card_number: cardNumber.trim() || null,
      card_expiry: cardExpiry || null,
      card_front_url: cardFrontUrl || null,
      card_back_url: cardBackUrl || null,
      card_verified: null,
      card_verified_by: null,
      card_verified_at: null,
    }).eq('id', operativeId)
    setSaving(false)
    if (error) { toast.error('Failed to save'); return }
    toast.success('Profile saved')

    if (!getSession('operative_session')) {
      setSession('operative_session', JSON.stringify({
        id: operative.id, name: operative.name, email: email.trim() || operative.email,
        role: (role === 'Other' ? otherRole.trim() : role.trim()) || operative.role,
        photo_url: operative.photo_url, project_id: operative.project_id,
        project_name: operative.projects?.name, company_id: operative.company_id,
        company_name: operative.companies?.name, company_logo: operative.companies?.logo_url,
        primary_colour: operative.companies?.primary_colour || '#1B6FC8',
      }))
      navigate(`/operative/${operativeId}/documents`)
    } else {
      navigate('/worker')
    }
  }

  const goBack = () => navigate(getSession('operative_session') ? '/worker' : `/operative/${operativeId}/documents`)

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ backgroundColor: '#1A2744' }}>
        <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full" />
      </div>
    )
  }

  const primaryColour = operative?.companies?.primary_colour || '#1B6FC8'
  const isComplete = dob && niNumber && address && nextOfKin && nextOfKinPhone && cardType && cardNumber && cardFrontUrl
  const isFirstTime = !operative?.date_of_birth

  return (
    <div className="min-h-dvh flex flex-col" style={{ backgroundColor: '#F5F6F8' }}>
      {/* Dark header */}
      <header className="bg-[#1A2744] text-white px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={goBack} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{isFirstTime ? 'Complete Your Profile' : 'My Profile'}</p>
          <p className="text-[11px] text-white/50 truncate">
            {operative?.companies?.name || 'CoreSite'} {operative?.projects?.name ? `· ${operative.projects.name}` : ''}
          </p>
        </div>
        {operative?.companies?.logo_url && (
          <img src={operative.companies.logo_url} alt="" className="h-6 opacity-70" />
        )}
      </header>

      <form onSubmit={handleSave} className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto p-4 space-y-4 pb-8">

          {/* Welcome banner for first-time */}
          {isFirstTime && (
            <div className="rounded-xl p-4 text-white" style={{ backgroundColor: primaryColour }}>
              <p className="text-sm font-semibold">Welcome, {operative?.name?.split(' ')[0]}</p>
              <p className="text-xs opacity-80 mt-1">Please complete all sections below to get started on site. Your CSCS/ECS card will be verified by your manager.</p>
            </div>
          )}

          {/* Incomplete warning for returning users */}
          {!isFirstTime && !isComplete && (
            <div className="bg-[#FEF3C7] border border-[#FCD34D] rounded-xl p-3.5 flex items-start gap-3">
              <Shield size={18} className="text-[#D29922] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-[#92400E] font-semibold">Profile incomplete</p>
                <p className="text-xs text-[#A16207] mt-0.5">Fill in all required fields to remain compliant.</p>
              </div>
            </div>
          )}

          {/* ─── SECTION 1: CSCS / ECS Card ─── */}
          <Section icon={CreditCard} title="CSCS / ECS Card" colour="#D29922" required>
            <div className="bg-[#FEF3C7] border border-[#FCD34D] rounded-lg p-2.5 mb-3">
              <p className="text-[11px] text-[#92400E]">Upload a clear photo of your valid card. It will be verified by your site manager.</p>
            </div>

            <div>
              <label className={labelCls}>Card Type *</label>
              <select value={cardType} onChange={e => setCardType(e.target.value)} className={inputCls}>
                <option value="">Select card type</option>
                <optgroup label="CSCS Cards">
                  <option value="CSCS Green - Labourer">CSCS Green — Labourer</option>
                  <option value="CSCS Blue - Skilled Worker">CSCS Blue — Skilled Worker</option>
                  <option value="CSCS Gold - Supervisor">CSCS Gold — Supervisor</option>
                  <option value="CSCS Black - Manager">CSCS Black — Manager</option>
                  <option value="CSCS White - Prof. Qualified">CSCS White — Prof. Qualified</option>
                  <option value="CSCS Red - Trainee">CSCS Red — Trainee</option>
                </optgroup>
                <optgroup label="ECS Cards">
                  <option value="ECS Gold - Electrician">ECS Gold — Electrician</option>
                  <option value="ECS Blue - Approved Electrician">ECS Blue — Approved Electrician</option>
                  <option value="ECS Black - Senior/Manager">ECS Black — Senior / Manager</option>
                  <option value="ECS White - Trainee">ECS White — Trainee</option>
                  <option value="ECS Green - Labourer">ECS Green — Labourer</option>
                </optgroup>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Card Number *</label>
                <input value={cardNumber} onChange={e => setCardNumber(e.target.value)} placeholder="e.g. 1234567890" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Expiry Date</label>
                <input type="date" value={cardExpiry} onChange={e => setCardExpiry(e.target.value)} className={inputCls} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <CardPhotoUpload label="Front of Card *" url={cardFrontUrl} uploading={uploadingFront}
                onUpload={handleCardFront} onClear={() => setCardFrontUrl('')} onView={() => setLightbox(cardFrontUrl)} />
              <CardPhotoUpload label="Back of Card" url={cardBackUrl} uploading={uploadingBack}
                onUpload={handleCardBack} onClear={() => setCardBackUrl('')} onView={() => setLightbox(cardBackUrl)} />
            </div>

            {operative?.card_verified === true && (
              <div className="flex items-center gap-2 p-2.5 bg-[#ECFDF5] border border-[#A7F3D0] rounded-lg">
                <CheckCircle2 size={14} className="text-[#059669]" />
                <span className="text-xs text-[#065F46] font-medium">Verified by {operative.card_verified_by} · {new Date(operative.card_verified_at).toLocaleDateString('en-GB')}</span>
              </div>
            )}
            {operative?.card_verified === false && (
              <div className="flex items-center gap-2 p-2.5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg">
                <Shield size={14} className="text-[#DC2626]" />
                <span className="text-xs text-[#991B1B] font-medium">Card rejected — please upload a valid card</span>
              </div>
            )}
          </Section>

          {/* ─── SECTION 2: Personal Details ─── */}
          <Section icon={User} title="Personal Details" colour="#1B6FC8">
            <div>
              <label className={labelCls}>Role / Trade</label>
              <select value={role} onChange={e => { setRole(e.target.value); if (e.target.value !== 'Other') setOtherRole('') }} className={inputCls}>
                <option value="">Select trade</option>
                {['Labourer', 'Apprentice', 'Electrician', 'Plumber', 'BMS Engineer', 'Lighting Control', 'Supervisor', 'Engineer'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
                <option value="Other">Other (Specify)</option>
              </select>
              {role === 'Other' && (
                <input value={otherRole} onChange={e => setOtherRole(e.target.value)} placeholder="Specify your trade" className={`${inputCls} mt-2`} />
              )}
            </div>

            <div>
              <label className={labelCls}>Date of Birth *</label>
              <DateOfBirthPicker value={dob} onChange={setDob} />
            </div>

            <div>
              <label className={labelCls}>National Insurance Number *</label>
              <input value={niNumber} onChange={e => setNiNumber(e.target.value)} placeholder="e.g. AB 12 34 56 C" className={`${inputCls} uppercase`} />
            </div>
          </Section>

          {/* ─── SECTION 3: Contact ─── */}
          <Section icon={Phone} title="Contact Details" colour="#1B6FC8">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Mobile</label>
                <input type="tel" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="07..." className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Home Address *</label>
              <AddressLookup value={address} onChange={setAddress} placeholder="Enter postcode..." />
            </div>
          </Section>

          {/* ─── SECTION 4: Create Password (first-time only) ─── */}
          {isFirstTime && (
            <Section icon={Lock} title="Create Password" colour="#059669" required>
              <div className="bg-[#ECFDF5] border border-[#A7F3D0] rounded-lg p-2.5 mb-1">
                <p className="text-[11px] text-[#065F46]">Create a password so you can sign back in at <strong>worker login</strong>. Minimum 8 characters.</p>
              </div>
              <div>
                <label className={labelCls}>Password *</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B0B8C9]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Create a password"
                    className={`${inputCls} !pl-10 !pr-10`}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B0B8C9] hover:text-[#6B7A99]">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className={labelCls}>Confirm Password *</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B0B8C9]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    className={`${inputCls} !pl-10`}
                  />
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                )}
                {password.length > 0 && password.length < 8 && (
                  <p className="text-xs text-amber-600 mt-1">Must be at least 8 characters</p>
                )}
              </div>
            </Section>
          )}

          {/* ─── SECTION 5: Emergency Contact ─── */}
          <Section icon={Users} title="Emergency Contact" colour="#DC2626">
            <div>
              <label className={labelCls}>Next of Kin Name *</label>
              <input value={nextOfKin} onChange={e => setNextOfKin(e.target.value)} placeholder="Full name" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Next of Kin Phone *</label>
              <input type="tel" value={nextOfKinPhone} onChange={e => setNextOfKinPhone(e.target.value)} placeholder="Phone number" className={inputCls} />
            </div>
          </Section>

          <LoadingButton loading={saving} type="submit" className="w-full text-white text-sm font-semibold rounded-xl py-3.5" style={{ backgroundColor: primaryColour }}>
            {isFirstTime ? 'Complete Profile & Continue' : 'Save Profile'}
          </LoadingButton>
        </div>
      </form>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Card" className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white hover:bg-white/20"><X size={24} /></button>
        </div>
      )}
    </div>
  )
}

// eslint-disable-next-line no-unused-vars
function Section({ icon: Icon, title, colour, required, children }) {
  return (
    <div className="bg-white border border-[#E2E6EA] rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#E2E6EA] flex items-center gap-2" style={{ backgroundColor: `${colour}08` }}>
        <Icon size={15} style={{ color: colour }} />
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: colour }}>{title}</h3>
        {required && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#92400E]">Required</span>}
      </div>
      <div className="p-4 space-y-3">
        {children}
      </div>
    </div>
  )
}

function CardPhotoUpload({ label, url, uploading, onUpload, onClear, onView }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {url ? (
        <div className="relative group rounded-lg overflow-hidden border border-[#E2E6EA]">
          <img src={url} alt="" className="w-full h-24 object-cover cursor-pointer" onClick={onView} />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <ZoomIn size={18} className="text-white opacity-0 group-hover:opacity-100 drop-shadow" />
          </div>
          <button type="button" onClick={onClear} className="absolute top-1 right-1 w-5 h-5 bg-black/50 text-white rounded-full flex items-center justify-center"><X size={10} /></button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center h-24 bg-[#F5F6F8] border-2 border-dashed border-[#E2E6EA] rounded-lg cursor-pointer hover:border-[#1B6FC8] transition-colors">
          {uploading ? (
            <div className="w-5 h-5 border-2 border-[#1B6FC8] border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Camera size={20} className="text-[#B0B8C9] mb-0.5" />
              <span className="text-[10px] text-[#B0B8C9]">Take photo</span>
            </>
          )}
          <input type="file" accept="image/*" onChange={onUpload} className="hidden" />
        </label>
      )}
    </div>
  )
}
