import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { authFetch } from '../lib/authFetch'
import { useCompany } from '../lib/CompanyContext'
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import { UserPlus, Upload } from 'lucide-react'
import AddressLookup from '../components/AddressLookup'
import DateOfBirthPicker from '../components/DateOfBirthPicker'
import { getSession } from '../lib/storage'

const ROLES = ['Electrician', 'Apprentice', 'Supervisor', 'Engineer', 'Labourer', 'Other']
const TRADES = ['Electrical', 'Fire Alarm', 'Sound Masking', 'Pipework', 'Ductwork', 'BMS', 'Other']

export default function AddNewWorker() {
  const navigate = useNavigate()
  const { company } = useCompany()
  const cid = JSON.parse(getSession('manager_data') || '{}').company_id
  const [saving, setSaving] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)

  // Personal
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [role, setRole] = useState('')
  const [trade, setTrade] = useState('')
  const [dob, setDob] = useState('')
  const [niNumber, setNiNumber] = useState('')
  const [postcode, setPostcode] = useState('')
  const [mobile, setMobile] = useState('')
  const [email, setEmail] = useState('')
  const [employmentType, setEmploymentType] = useState('')

  // Certifications
  const [cscsNumber, setCscsNumber] = useState('')
  const [cscsExpiry, setCscsExpiry] = useState('')
  const [cscsType, setCscsType] = useState('')
  const [ipafExpiry, setIpafExpiry] = useState('')
  const [pasmaExpiry, setPasmaExpiry] = useState('')
  const [ssstsExpiry, setSsstsExpiry] = useState('')
  const [firstAidExpiry, setFirstAidExpiry] = useState('')

  // Emergency
  const [nokName, setNokName] = useState('')
  const [nokRelation, setNokRelation] = useState('')
  const [nokPhone, setNokPhone] = useState('')

  // Site
  const [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState([])

  useEffect(() => {
    if (!cid) return
    supabase.from('projects').select('*').eq('company_id', cid).order('name')
      .then(({ data }) => setProjects(data || []))
  }, [cid])

  function handlePhotoChange(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File must be under 10MB')
      return
    }
    setPhoto(file)
    const reader = new FileReader()
    reader.onload = () => setPhotoPreview(reader.result)
    reader.readAsDataURL(file)
  }

  async function handleSave(e, sendInvite = false) {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim()) {
      toast.error('First and last name are required')
      return
    }
    setSaving(true)

    let photoUrl = null
    if (photo) {
      const filePath = `photos/${crypto.randomUUID()}.jpg`
      const { error: upErr } = await supabase.storage.from('documents').upload(filePath, photo, { contentType: photo.type })
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)
        photoUrl = urlData.publicUrl
      }
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`
    const { data, error } = await supabase.from('operatives').insert({
      name: fullName,
      role: role || null,
      date_of_birth: dob || null,
      ni_number: niNumber.trim().toUpperCase() || null,
      address: postcode.trim() || null,
      mobile: mobile.trim() || null,
      email: email.trim() || null,
      next_of_kin: nokName.trim() || null,
      next_of_kin_phone: nokPhone.trim() || null,
      project_id: projectId || null,
      photo_url: photoUrl,
      company_id: cid,
      cscs_number: cscsNumber.trim() || null,
      cscs_expiry: cscsExpiry || null,
      cscs_type: cscsType || null,
      ipaf_expiry: ipafExpiry || null,
      pasma_expiry: pasmaExpiry || null,
      sssts_expiry: ssstsExpiry || null,
      first_aid_expiry: firstAidExpiry || null,
    }).select().single()

    if (error) {
      setSaving(false)
      toast.error('Failed to add worker')
      return
    }

    if (sendInvite && email.trim() && data) {
      const proj = projects.find(p => p.id === projectId)
      try {
        const inviteRes = await authFetch('/api/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operativeId: data.id,
            operativeName: fullName,
            email: email.trim(),
            projectName: proj?.name || company?.name || 'CoreSite',
          }),
        })
        const inviteData = await inviteRes.json()
        if (inviteData.results?.email === 'sent') {
          toast.success('Worker added & invitation sent')
        } else if (inviteData.results?.email === 'no_api_key') {
          toast.error('Worker saved but email not configured on server')
        } else {
          toast.error('Worker saved but email failed to send')
        }
      } catch (err) {
        console.error('Invite error:', err)
        toast.error('Worker saved but invitation failed')
      }
      setSaving(false)
      navigate('/app/workers')
      return
    }

    setSaving(false)
    toast.success('Worker saved')
    navigate('/app/workers')
  }

  const inputCls = "w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]"
  const labelCls = "text-xs text-[#6B7A99] font-medium mb-1 block"

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[#2EA043]/10 flex items-center justify-center">
          <UserPlus size={20} className="text-[#2EA043]" />
        </div>
        <h1 className="text-2xl font-bold text-[#1A1A2E]">Add a New Worker</h1>
      </div>

      <form onSubmit={e => handleSave(e, false)}>
        {/* Personal Details */}
        <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm mb-4">
          <div className="px-5 py-3 border-b border-[#E2E6EA] bg-[#F5F6F8]">
            <p className="text-sm font-semibold text-[#1A1A2E]">Personal Details</p>
          </div>
          <div className="p-5">
            <div className="flex flex-col-reverse sm:flex-row gap-6">
              <div className="flex-1 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>First Name *</label>
                    <input value={firstName} onChange={e => setFirstName(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Last Name *</label>
                    <input value={lastName} onChange={e => setLastName(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Contractor</label>
                  <input value={company?.name || 'Company'} readOnly className={`${inputCls} bg-[#F5F6F8]`} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Role *</label>
                    <select value={role} onChange={e => setRole(e.target.value)} className={inputCls}>
                      <option value="">Please Select</option>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Trade</label>
                    <select value={trade} onChange={e => setTrade(e.target.value)} className={inputCls}>
                      <option value="">Please Select</option>
                      {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Date of Birth *</label>
                    <DateOfBirthPicker value={dob} onChange={setDob} />
                  </div>
                  <div>
                    <label className={labelCls}>NI Number</label>
                    <input value={niNumber} onChange={e => setNiNumber(e.target.value)} className={`${inputCls} uppercase`} />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Home Address *</label>
                  <AddressLookup
                    value={postcode}
                    onChange={setPostcode}
                    placeholder="Enter postcode to find address..."
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Contact Number</label>
                    <input type="tel" value={mobile} onChange={e => setMobile(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Email Address</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Part Time or Full Time</label>
                  <select value={employmentType} onChange={e => setEmploymentType(e.target.value)} className={inputCls}>
                    <option value="">Please Select</option>
                    <option value="Full Time">Full Time</option>
                    <option value="Part Time">Part Time</option>
                  </select>
                </div>
              </div>

              {/* Photo */}
              <div className="shrink-0 flex flex-col items-center">
                <label className="cursor-pointer group">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Photo" className="w-32 h-32 rounded-full object-cover border-4 border-[#E2E6EA]" />
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-[#F5F6F8] border-4 border-[#E2E6EA] flex items-center justify-center group-hover:border-[#1B6FC8]/30 transition-colors">
                      <Upload size={28} className="text-[#B0B8C9]" />
                    </div>
                  )}
                  <input type="file" accept="image/*" capture="user" onChange={handlePhotoChange} className="hidden" />
                </label>
                <p className="text-[10px] text-[#6B7A99] mt-2">Click to upload photo</p>
              </div>
            </div>
          </div>
        </div>

        {/* Site Association */}
        <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm mb-4">
          <div className="px-5 py-3 border-b border-[#E2E6EA] bg-[#F5F6F8]">
            <p className="text-sm font-semibold text-[#1A1A2E]">Manage Site Association</p>
          </div>
          <div className="p-5">
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inputCls}>
              <option value="">No Site Association</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* Certifications */}
        <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm mb-4">
          <div className="px-5 py-3 border-b border-[#E2E6EA] bg-[#F5F6F8]">
            <p className="text-sm font-semibold text-[#1A1A2E]">Certifications & Qualifications</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>CSCS Card Number</label>
                <input value={cscsNumber} onChange={e => setCscsNumber(e.target.value)} className={inputCls} placeholder="e.g. 1234567890" />
              </div>
              <div>
                <label className={labelCls}>CSCS Card Type</label>
                <select value={cscsType} onChange={e => setCscsType(e.target.value)} className={inputCls}>
                  <option value="">Select type</option>
                  <option value="Green - Labourer">Green - Labourer</option>
                  <option value="Blue - Skilled Worker">Blue - Skilled Worker</option>
                  <option value="Gold - Supervisor">Gold - Supervisor</option>
                  <option value="Black - Manager">Black - Manager</option>
                  <option value="White - Professionally Qualified">White - Prof. Qualified</option>
                  <option value="Red - Trainee">Red - Trainee</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>CSCS Expiry</label>
                <input type="date" value={cscsExpiry} onChange={e => setCscsExpiry(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>IPAF Expiry</label>
                <input type="date" value={ipafExpiry} onChange={e => setIpafExpiry(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>PASMA Expiry</label>
                <input type="date" value={pasmaExpiry} onChange={e => setPasmaExpiry(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>SSSTS/SMSTS Expiry</label>
                <input type="date" value={ssstsExpiry} onChange={e => setSsstsExpiry(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>First Aid Expiry</label>
                <input type="date" value={firstAidExpiry} onChange={e => setFirstAidExpiry(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm mb-4">
          <div className="px-5 py-3 border-b border-[#E2E6EA] bg-[#F5F6F8]">
            <p className="text-sm font-semibold text-[#1A1A2E]">Emergency Contact Details</p>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Contact Name</label>
              <input value={nokName} onChange={e => setNokName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Relationship</label>
              <input value={nokRelation} onChange={e => setNokRelation(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone Number</label>
              <input type="tel" value={nokPhone} onChange={e => setNokPhone(e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Save buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:justify-end">
          <button type="button" onClick={() => navigate('/app/workers')} className="px-5 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#6B7A99] hover:bg-[#F5F6F8] w-full sm:w-auto">
            Cancel
          </button>
          <LoadingButton loading={saving} type="submit" className="px-5 bg-[#6B7A99] hover:bg-[#5A6978] text-white text-sm rounded-md w-full sm:w-auto">
            Save Don't Send
          </LoadingButton>
          <LoadingButton loading={saving} type="button" onClick={e => handleSave(e, true)} className="px-5 bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm rounded-md w-full sm:w-auto">
            Save & Send
          </LoadingButton>
        </div>
      </form>
    </div>
  )
}
