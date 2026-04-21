import { useState, useEffect } from 'react'
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
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkRows, setBulkRows] = useState(null)
  const [bulkFileName, setBulkFileName] = useState('')
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState('')
  const [bulkProject, setBulkProject] = useState('')

  useEffect(() => {
    if (!cid) return
    supabase.from('projects').select('id, name').eq('company_id', cid).order('name')
      .then(({ data }) => setProjects(data || []))
  }, [])

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

    if (selectedProject && data) {
      await supabase.from('operative_projects').insert({ operative_id: data.id, project_id: selectedProject })
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
          projectName: projects.find(p => p.id === selectedProject)?.name || 'CoreSite',
        }),
      }).catch(() => {})
    }

    setSaving(false)
    toast.success(`Invitation sent to ${fullName}`)
    setFirstName(''); setLastName(''); setEmail(''); setMobile(''); setSelectedProject('')
  }

  function handleCsvUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBulkFileName(file.name)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target.result
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) {
        toast.error('CSV must have a header row and at least one data row')
        setBulkRows(null)
        return
      }
      // Parse header to find column indices
      const header = lines[0].split(',').map(h => h.trim().toLowerCase())
      const fnIdx = header.findIndex(h => h.includes('first'))
      const lnIdx = header.findIndex(h => h.includes('last'))
      const emIdx = header.findIndex(h => h.includes('email'))
      const mbIdx = header.findIndex(h => h.includes('mobile') || h.includes('phone'))
      if (fnIdx === -1 || lnIdx === -1 || emIdx === -1) {
        toast.error('CSV must have First Name, Last Name, and Email columns')
        setBulkRows(null)
        return
      }
      const rows = []
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim())
        const fn = cols[fnIdx] || ''
        const ln = cols[lnIdx] || ''
        const em = cols[emIdx] || ''
        if (!fn || !ln || !em) continue
        rows.push({ firstName: fn, lastName: ln, email: em, mobile: mbIdx !== -1 ? cols[mbIdx] || '' : '' })
      }
      if (rows.length === 0) {
        toast.error('No valid rows found in CSV')
        setBulkRows(null)
        return
      }
      setBulkRows(rows)
    }
    reader.readAsText(file)
  }

  async function handleBulkSend() {
    if (!bulkRows || bulkRows.length === 0) return
    setBulkSaving(true)
    let successCount = 0
    let failCount = 0
    for (const row of bulkRows) {
      const fullName = `${row.firstName} ${row.lastName}`
      const { data, error } = await supabase.from('operatives').insert({
        name: fullName,
        email: row.email,
        mobile: row.mobile || null,
        company_id: cid,
      }).select().single()
      if (error) {
        failCount++
        continue
      }
      if (bulkProject && data) {
        await supabase.from('operative_projects').insert({ operative_id: data.id, project_id: bulkProject })
      }
      if (data) {
        await authFetch('/api/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operativeId: data.id,
            operativeName: fullName,
            email: row.email,
            mobile: row.mobile || null,
            projectName: projects.find(p => p.id === bulkProject)?.name || 'CoreSite',
          }),
        }).catch(() => { failCount++ })
        successCount++
      }
    }
    setBulkSaving(false)
    if (successCount > 0) toast.success(`${successCount} invitation${successCount !== 1 ? 's' : ''} sent`)
    if (failCount > 0) toast.error(`${failCount} failed to send`)
    setBulkRows(null)
    setBulkFileName('')
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
            <div>
              <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Project</label>
              <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
                className="w-full px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]">
                <option value="">— No project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
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
          <div className="mb-3">
            <label className="text-xs text-[#6B7A99] font-medium mb-1 block">Assign all to project</label>
            <select value={bulkProject} onChange={e => setBulkProject(e.target.value)}
              className="w-full sm:w-64 px-3 py-2.5 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]">
              <option value="">— No project —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <label className="flex items-center justify-center gap-2 w-full px-4 py-6 border-2 border-dashed border-[#E2E6EA] rounded-lg cursor-pointer hover:border-[#1B6FC8] transition-colors">
            <span className="text-sm text-[#6B7A99]">{bulkFileName || 'Click to upload CSV file'}</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          </label>

          {bulkRows && bulkRows.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-[#1A1A2E] font-medium mb-2">{bulkRows.length} worker{bulkRows.length !== 1 ? 's' : ''} found in CSV:</p>
              <div className="max-h-48 overflow-y-auto border border-[#E2E6EA] rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-[#F5F6F8] sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-1.5 text-[#6B7A99]">First Name</th>
                      <th className="text-left px-3 py-1.5 text-[#6B7A99]">Last Name</th>
                      <th className="text-left px-3 py-1.5 text-[#6B7A99]">Email</th>
                      <th className="text-left px-3 py-1.5 text-[#6B7A99]">Mobile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.map((r, i) => (
                      <tr key={i} className="border-t border-[#E2E6EA]">
                        <td className="px-3 py-1.5 text-[#1A1A2E]">{r.firstName}</td>
                        <td className="px-3 py-1.5 text-[#1A1A2E]">{r.lastName}</td>
                        <td className="px-3 py-1.5 text-[#1A1A2E]">{r.email}</td>
                        <td className="px-3 py-1.5 text-[#1A1A2E]">{r.mobile || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end mt-3">
                <LoadingButton loading={bulkSaving} onClick={handleBulkSend} className="px-6 bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm rounded-md">
                  Send All Invites
                </LoadingButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
