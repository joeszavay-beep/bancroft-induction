import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import { TRADES, TRADE_OPTIONS, TRADE_CATEGORIES, SKILL_LEVELS, CARD_TYPES, CERT_TYPES, URGENCY_LABELS, formatDayRate } from '../lib/marketplace'
import toast from 'react-hot-toast'
import { ArrowLeft, ArrowRight, Check, Loader2, Send } from 'lucide-react'

const STEPS = ['What do you need?', 'When and where?', 'Rates and details', 'Review']

export default function LabourRequestForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const managerData = JSON.parse(getSession('manager_data') || '{}')
  const initialProjectId = location.state?.projectId || ''

  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [projects, setProjects] = useState([])

  // Step 1 — What do you need?
  const [tradeRequired, setTradeRequired] = useState('')
  const [numberOfOperatives, setNumberOfOperatives] = useState(1)
  const [skillLevelMinimum, setSkillLevelMinimum] = useState('')
  const [cscsCardTypeRequired, setCscsCardTypeRequired] = useState('')
  const [certificationsRequired, setCertificationsRequired] = useState([])

  // Step 2 — When and where?
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [workingDays, setWorkingDays] = useState('mon_fri')
  const [workingHours, setWorkingHours] = useState('07:30 - 17:00')
  const [siteName, setSiteName] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  const [sitePostcode, setSitePostcode] = useState('')
  const [selectedProject, setSelectedProject] = useState(initialProjectId)

  // Step 3 — Rates and details
  const [dayRateOffered, setDayRateOffered] = useState('')
  const [overtimeRate, setOvertimeRate] = useState('')
  const [accommodationProvided, setAccommodationProvided] = useState(false)
  const [travelExpenses, setTravelExpenses] = useState(false)
  const [description, setDescription] = useState('')
  const [ppeRequirements, setPpeRequirements] = useState('')
  const [urgency, setUrgency] = useState('standard')

  useEffect(() => { loadProjects() }, [])

  async function loadProjects() {
    try {
      let query = supabase.from('projects').select('id, name, site_name, site_address, site_postcode').order('name')
      if (managerData.company_id) query = query.eq('company_id', managerData.company_id)
      const { data } = await query
      setProjects(data || [])
      // Pre-fill site info from initial project
      if (initialProjectId && data) {
        const proj = data.find(p => p.id === initialProjectId)
        if (proj) {
          if (proj.site_name) setSiteName(proj.site_name)
          if (proj.site_address) setSiteAddress(proj.site_address)
          if (proj.site_postcode) setSitePostcode(proj.site_postcode)
        }
      }
    } catch (err) {
      console.error('loadProjects error:', err)
    }
  }

  function handleProjectChange(projectId) {
    setSelectedProject(projectId)
    const proj = projects.find(p => p.id === projectId)
    if (proj) {
      if (proj.site_name) setSiteName(proj.site_name)
      if (proj.site_address) setSiteAddress(proj.site_address)
      if (proj.site_postcode) setSitePostcode(proj.site_postcode)
    }
  }

  function toggleCert(cert) {
    setCertificationsRequired(prev =>
      prev.includes(cert) ? prev.filter(c => c !== cert) : [...prev, cert]
    )
  }

  function canProceed() {
    if (step === 0) return tradeRequired && numberOfOperatives >= 1
    if (step === 1) return startDate && endDate && siteName
    if (step === 2) return true
    return true
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const payload = {
        company_id: managerData.company_id,
        project_id: selectedProject || null,
        created_by: managerData.id || managerData.name,
        trade_required: tradeRequired,
        number_of_operatives: numberOfOperatives,
        skill_level_minimum: skillLevelMinimum || null,
        cscs_card_type_required: cscsCardTypeRequired || null,
        certifications_required: certificationsRequired.length > 0 ? certificationsRequired : null,
        start_date: startDate,
        end_date: endDate,
        working_days: workingDays,
        working_hours: workingHours,
        site_name: siteName,
        site_address: siteAddress || null,
        site_postcode: sitePostcode || null,
        day_rate_offered: dayRateOffered ? Math.round(parseFloat(dayRateOffered) * 100) : null,
        overtime_rate: overtimeRate || null,
        accommodation_provided: accommodationProvided,
        travel_expenses: travelExpenses,
        description: description || null,
        ppe_requirements: ppeRequirements || null,
        urgency,
        status: 'open',
        filled_count: 0,
      }

      const { error } = await supabase.from('labour_requests').insert(payload)
      if (error) throw error

      toast.success('Labour request posted to agencies')
      navigate('/app/labour-requests')
    } catch (err) {
      console.error('Submit error:', err)
      toast.error(err.message || 'Failed to post request')
    }
    setSubmitting(false)
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => navigate('/app/labour-requests')} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-2">
          <ArrowLeft size={16} /> Back to Requests
        </button>
        <h1 className="text-xl font-bold text-slate-900">New Labour Request</h1>
        <p className="text-sm text-slate-500">Post a request to agencies for operatives</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                i === step ? 'bg-blue-500 text-white' :
                i < step ? 'bg-green-100 text-green-700 cursor-pointer hover:bg-green-200' :
                'bg-slate-100 text-slate-400'
              }`}
            >
              {i < step ? <Check size={12} /> : <span>{i + 1}</span>}
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < STEPS.length - 1 && <div className="w-4 h-px bg-slate-200" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        {step === 0 && (
          <>
            <h2 className="text-base font-semibold text-slate-800">What do you need?</h2>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Trade Required *</label>
              <select
                value={tradeRequired}
                onChange={e => setTradeRequired(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400"
              >
                <option value="">Select trade...</option>
                {TRADE_CATEGORIES.map(cat => (
                  <optgroup key={cat} label={cat}>
                    {TRADE_OPTIONS.filter(t => t.category === cat).map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Number of Operatives *</label>
              <input
                type="number"
                min={1}
                value={numberOfOperatives}
                onChange={e => setNumberOfOperatives(parseInt(e.target.value) || 1)}
                className="w-32 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Minimum Skill Level</label>
              <select
                value={skillLevelMinimum}
                onChange={e => setSkillLevelMinimum(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400"
              >
                <option value="">Any level</option>
                {SKILL_LEVELS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">CSCS / ECS Card Required</label>
              <select
                value={cscsCardTypeRequired}
                onChange={e => setCscsCardTypeRequired(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400"
              >
                <option value="">Any card</option>
                {Object.entries(CARD_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Certifications Required</label>
              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg p-3 space-y-1.5">
                {Object.entries(CERT_TYPES).map(([k, v]) => (
                  <label key={k} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 px-1 py-0.5 rounded">
                    <input
                      type="checkbox"
                      checked={certificationsRequired.includes(k)}
                      onChange={() => toggleCert(k)}
                      className="rounded border-slate-300 text-blue-500 focus:ring-blue-400"
                    />
                    {v}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-base font-semibold text-slate-800">When and where?</h2>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
              <select
                value={selectedProject}
                onChange={e => handleProjectChange(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400"
              >
                <option value="">Select project...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Start Date *</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">End Date *</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Working Days *</label>
              <div className="flex gap-4">
                {[
                  { value: 'mon_fri', label: 'Mon - Fri' },
                  { value: 'mon_sat', label: 'Mon - Sat' },
                  { value: 'seven_days', label: '7 Days' },
                ].map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="workingDays"
                      value={opt.value}
                      checked={workingDays === opt.value}
                      onChange={e => setWorkingDays(e.target.value)}
                      className="text-blue-500 focus:ring-blue-400"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Working Hours</label>
              <input
                type="text"
                value={workingHours}
                onChange={e => setWorkingHours(e.target.value)}
                placeholder="e.g. 07:30 - 17:00"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Site Name *</label>
              <input
                type="text"
                value={siteName}
                onChange={e => setSiteName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Site Address</label>
              <input
                type="text"
                value={siteAddress}
                onChange={e => setSiteAddress(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Site Postcode</label>
              <input
                type="text"
                value={sitePostcode}
                onChange={e => setSitePostcode(e.target.value)}
                className="w-48 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400"
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-base font-semibold text-slate-800">Rates and details</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Day Rate Offered</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">£</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={dayRateOffered}
                    onChange={e => setDayRateOffered(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Overtime Rate</label>
                <input
                  type="text"
                  value={overtimeRate}
                  onChange={e => setOvertimeRate(e.target.value)}
                  placeholder="e.g. 1.5x after 8hrs"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>

            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={accommodationProvided}
                  onChange={e => setAccommodationProvided(e.target.checked)}
                  className="rounded border-slate-300 text-blue-500 focus:ring-blue-400"
                />
                Accommodation provided
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={travelExpenses}
                  onChange={e => setTravelExpenses(e.target.checked)}
                  className="rounded border-slate-300 text-blue-500 focus:ring-blue-400"
                />
                Travel expenses covered
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description / Scope of Work</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                placeholder="Describe the work required, any specific requirements..."
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400 resize-y"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">PPE Requirements</label>
              <textarea
                value={ppeRequirements}
                onChange={e => setPpeRequirements(e.target.value)}
                rows={2}
                placeholder="e.g. Hard hat, hi-vis, steel toe boots, safety glasses..."
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400 resize-y"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Urgency</label>
              <div className="flex gap-4">
                {Object.entries(URGENCY_LABELS).map(([k, v]) => (
                  <label key={k} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="urgency"
                      value={k}
                      checked={urgency === k}
                      onChange={e => setUrgency(e.target.value)}
                      className="text-blue-500 focus:ring-blue-400"
                    />
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-${v.color}-100 text-${v.color}-700`}>
                      {v.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-base font-semibold text-slate-800">Review your request</h2>

            <div className="space-y-4">
              <ReviewSection title="Trade & Skills">
                <ReviewRow label="Trade" value={TRADES[tradeRequired]?.label || tradeRequired} />
                <ReviewRow label="Number of operatives" value={numberOfOperatives} />
                <ReviewRow label="Minimum skill level" value={SKILL_LEVELS.find(s => s.value === skillLevelMinimum)?.label || 'Any'} />
                <ReviewRow label="Card required" value={cscsCardTypeRequired ? CARD_TYPES[cscsCardTypeRequired] : 'Any'} />
                {certificationsRequired.length > 0 && (
                  <ReviewRow label="Certifications" value={certificationsRequired.map(c => CERT_TYPES[c] || c).join(', ')} />
                )}
              </ReviewSection>

              <ReviewSection title="When & Where">
                <ReviewRow label="Dates" value={`${startDate} to ${endDate}`} />
                <ReviewRow label="Working days" value={workingDays === 'mon_fri' ? 'Mon - Fri' : workingDays === 'mon_sat' ? 'Mon - Sat' : '7 Days'} />
                <ReviewRow label="Hours" value={workingHours || '—'} />
                <ReviewRow label="Site" value={siteName} />
                {siteAddress && <ReviewRow label="Address" value={siteAddress} />}
                {sitePostcode && <ReviewRow label="Postcode" value={sitePostcode} />}
              </ReviewSection>

              <ReviewSection title="Rates & Details">
                <ReviewRow label="Day rate" value={dayRateOffered ? `£${parseFloat(dayRateOffered).toFixed(2)}` : 'Not specified'} />
                {overtimeRate && <ReviewRow label="Overtime rate" value={overtimeRate} />}
                <ReviewRow label="Accommodation" value={accommodationProvided ? 'Provided' : 'Not provided'} />
                <ReviewRow label="Travel expenses" value={travelExpenses ? 'Covered' : 'Not covered'} />
                <ReviewRow label="Urgency" value={URGENCY_LABELS[urgency]?.label || urgency} />
                {description && <ReviewRow label="Description" value={description} />}
                {ppeRequirements && <ReviewRow label="PPE" value={ppeRequirements} />}
              </ReviewSection>
            </div>
          </>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => step > 0 ? setStep(step - 1) : navigate('/app/labour-requests')}
          className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-semibold text-slate-700 transition-colors"
        >
          <ArrowLeft size={16} /> {step > 0 ? 'Back' : 'Cancel'}
        </button>

        {step < 3 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            Next <ArrowRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 px-6 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Post to Agencies
          </button>
        )}
      </div>
    </div>
  )
}

function ReviewSection({ title, children }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="p-4 space-y-2">{children}</div>
    </div>
  )
}

function ReviewRow({ label, value }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="text-slate-500 w-36 shrink-0">{label}</span>
      <span className="text-slate-800">{value}</span>
    </div>
  )
}
