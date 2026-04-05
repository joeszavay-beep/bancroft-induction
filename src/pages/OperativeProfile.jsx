import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import { ArrowLeft, User, Shield, Phone, Home, Users } from 'lucide-react'

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

  useEffect(() => {
    loadOperative()
  }, [])

  async function loadOperative() {
    const { data } = await supabase
      .from('operatives')
      .select('*, projects(name), companies(name, logo_url)')
      .eq('id', operativeId)
      .single()
    if (!data) {
      navigate('/operative')
      return
    }
    setOperative(data)
    const trades = ['Labourer', 'Apprentice', 'Electrician', 'Plumber', 'BMS Engineer', 'Lighting Control']
    if (data.role && !trades.includes(data.role)) {
      setRole('Other')
      setOtherRole(data.role)
    } else {
      setRole(data.role || '')
    }
    setDob(data.date_of_birth || '')
    setNiNumber(data.ni_number || '')
    setAddress(data.address || '')
    setMobile(data.mobile || '')
    setEmail(data.email || '')
    setNextOfKin(data.next_of_kin || '')
    setNextOfKinPhone(data.next_of_kin_phone || '')
    setLoading(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('operatives').update({
      role: (role === 'Other' ? otherRole.trim() : role.trim()) || null,
      date_of_birth: dob || null,
      ni_number: niNumber.trim().toUpperCase() || null,
      address: address.trim() || null,
      mobile: mobile.trim() || null,
      email: email.trim() || null,
      next_of_kin: nextOfKin.trim() || null,
      next_of_kin_phone: nextOfKinPhone.trim() || null,
    }).eq('id', operativeId)
    setSaving(false)
    if (error) {
      toast.error('Failed to save profile')
      return
    }
    toast.success('Profile saved')
    navigate(`/operative/${operativeId}/documents`)
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const isComplete = dob && niNumber && address && nextOfKin && nextOfKinPhone

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col">
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate(`/operative/${operativeId}/documents`)} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft size={22} />
        </button>
        {operative?.companies?.logo_url ? (
          <img src={operative.companies.logo_url} alt={operative.companies.name} className="h-7" />
        ) : (
          <span className="text-sm font-semibold text-slate-700">{operative?.companies?.name || <><span className="font-light tracking-widest">CORE</span><span className="font-bold">SITE</span></>}</span>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-slate-900 truncate">My Profile</h1>
          <p className="text-xs text-slate-500 truncate">{operative?.name}</p>
        </div>
      </header>

      <form onSubmit={handleSave} className="flex-1 p-4 space-y-4 overflow-y-auto pb-8">
        {!isComplete && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
            <Shield size={20} className="text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-slate-900 font-semibold">Complete your profile</p>
              <p className="text-xs text-slate-500 mt-1">Please fill in all fields below. This information is required for site induction compliance.</p>
            </div>
          </div>
        )}

        {/* Personal Details */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <User size={16} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-600">Personal Details</h3>
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Role / Trade</label>
            <select
              value={role}
              onChange={e => { setRole(e.target.value); if (e.target.value !== 'Other') setOtherRole('') }}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
            >
              <option value="">Select trade</option>
              <option value="Labourer">Labourer</option>
              <option value="Apprentice">Apprentice</option>
              <option value="Electrician">Electrician</option>
              <option value="Plumber">Plumber</option>
              <option value="BMS Engineer">BMS Engineer</option>
              <option value="Lighting Control">Lighting Control</option>
              <option value="Other">Other (Specify)</option>
            </select>
            {role === 'Other' && (
              <input
                value={otherRole}
                onChange={e => setOtherRole(e.target.value)}
                placeholder="Specify your trade"
                className="w-full mt-2 px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
              />
            )}
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Date of Birth *</label>
            <input
              type="date"
              value={dob}
              onChange={e => setDob(e.target.value)}
              onClick={e => e.target.showPicker?.()}
              max={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10 appearance-none"
              style={{ colorScheme: 'light' }}
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">National Insurance Number *</label>
            <input
              value={niNumber}
              onChange={e => setNiNumber(e.target.value)}
              placeholder="e.g. AB 12 34 56 C"
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10 uppercase"
            />
          </div>
        </div>

        {/* Contact Details */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Phone size={16} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-600">Contact Details</h3>
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Mobile Number</label>
            <input
              type="tel"
              value={mobile}
              onChange={e => setMobile(e.target.value)}
              placeholder="07..."
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Home Address *</label>
            <textarea
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Full address including postcode"
              rows={3}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10 resize-none"
            />
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Users size={16} className="text-danger" />
            <h3 className="text-sm font-semibold text-slate-600">Emergency Contact / Next of Kin</h3>
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Next of Kin Name *</label>
            <input
              value={nextOfKin}
              onChange={e => setNextOfKin(e.target.value)}
              placeholder="Full name"
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Next of Kin Phone *</label>
            <input
              type="tel"
              value={nextOfKinPhone}
              onChange={e => setNextOfKinPhone(e.target.value)}
              placeholder="Phone number"
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10"
            />
          </div>
        </div>

        <LoadingButton loading={saving} type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white text-lg py-4">
          Save Profile
        </LoadingButton>
      </form>
    </div>
  )
}
