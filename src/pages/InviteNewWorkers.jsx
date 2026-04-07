import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { authFetch } from '../lib/authFetch'
import toast from 'react-hot-toast'
import LoadingButton from '../components/LoadingButton'
import { Mail, Plus, Minus } from 'lucide-react'
import { getSession } from '../lib/storage'

export default function InviteNewWorkers() {
  const cid = JSON.parse(getSession('manager_data') || '{}').company_id
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSend(e) {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast.error('First name, last name and email are required')
      return
    }
    setSaving(true)
    const fullName = `${firstName.trim()} ${lastName.trim()}`

    // Create operative record
    const { data, error } = await supabase.from('operatives').insert({
      name: fullName,
      email: email.trim(),
      mobile: mobile.trim() || null,
      company_id: cid,
    }).select().single()

    if (error) {
      setSaving(false)
      toast.error('Failed to create worker')
      return
    }

    // Send invite email
    if (data) {
      await authFetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operativeId: data.id,
          operativeName: fullName,
          email: email.trim(),
          mobile: mobile.trim() || null,
          projectName: 'CoreSite',
        }),
      }).catch(() => {})
    }

    setSaving(false)
    toast.success(`Invitation sent to ${fullName}`)
    setFirstName(''); setLastName(''); setEmail(''); setMobile('')
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[#1B6FC8]/10 flex items-center justify-center">
          <Mail size={20} className="text-[#1B6FC8]" />
        </div>
        <h1 className="text-2xl font-bold text-[#1A1A2E]">Invite New Workers</h1>
      </div>

      {/* Individual */}
      <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm">
        <div className="px-5 py-3 border-b border-[#E2E6EA] bg-[#F5F6F8]">
          <p className="text-sm font-semibold text-[#1A1A2E] flex items-center gap-1"><Minus size={14} /> Individual</p>
        </div>
        <form onSubmit={handleSend} className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">First Name *</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder=""
                className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]" />
            </div>
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Last Name *</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder=""
                className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]" />
            </div>
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Email Address *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder=""
                className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]" />
            </div>
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Mobile Number</label>
              <input type="tel" value={mobile} onChange={e => setMobile(e.target.value)} placeholder=""
                className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]" />
            </div>
          </div>
          <div className="flex justify-end">
            <LoadingButton loading={saving} type="submit" className="px-6 bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm rounded-md w-full sm:w-auto">
              Send
            </LoadingButton>
          </div>
        </form>
      </div>

      {/* Bulk */}
      <div className="bg-white border border-[#E2E6EA] rounded-lg shadow-sm mt-4">
        <div className="px-5 py-3 border-b border-[#E2E6EA] bg-[#F5F6F8]">
          <p className="text-sm font-semibold text-[#1A1A2E] flex items-center gap-1"><Plus size={14} /> Bulk</p>
        </div>
        <div className="p-5">
          <p className="text-sm text-[#6B7A99] mb-3">Upload a CSV file with columns: First Name, Last Name, Email, Mobile</p>
          <label className="flex items-center justify-center gap-2 w-full px-4 py-6 border-2 border-dashed border-[#E2E6EA] rounded-lg cursor-pointer hover:border-[#1B6FC8] transition-colors">
            <span className="text-sm text-[#6B7A99]">Click to upload CSV file</span>
            <input type="file" accept=".csv" className="hidden" onChange={() => toast('CSV import coming soon')} />
          </label>
        </div>
      </div>
    </div>
  )
}
