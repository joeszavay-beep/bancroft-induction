import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  TRADES, TRADE_OPTIONS, TRADE_CATEGORIES, CARD_TYPES, CERT_TYPES,
  SKILL_LEVELS, BOOKING_STATUSES, formatDate
} from '../lib/marketplace'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Save, Plus, Trash2, X, Upload, Star, AlertTriangle,
  Calendar, CheckCircle2, Clock, Loader2, User, Shield, CalendarDays,
  BarChart3, ChevronLeft, ChevronRight
} from 'lucide-react'

const TABS = ['Profile', 'Certifications', 'Availability', 'Bookings', 'Performance']

export default function AgencyOperativeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('Profile')
  const [operative, setOperative] = useState(null)
  const [form, setForm] = useState({})
  const [certifications, setCertifications] = useState([])
  const [availability, setAvailability] = useState([])
  const [bookings, setBookings] = useState([])

  // Cert form
  const [showCertForm, setShowCertForm] = useState(false)
  const [certForm, setCertForm] = useState({
    certification_type: '', certificate_number: '', issuing_body: '',
    date_issued: '', expiry_date: '',
  })
  const [certFile, setCertFile] = useState(null)
  const [savingCert, setSavingCert] = useState(false)
  const [editingCertId, setEditingCertId] = useState(null)

  // Calendar state
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  async function loadAll() {
    setLoading(true)
    try {
      const [opRes, certRes, availRes, bookRes] = await Promise.all([
        supabase.from('agency_operatives').select('*').eq('id', id).single(),
        supabase.from('operative_certifications').select('*').eq('operative_id', id).order('expiry_date'),
        supabase.from('operative_availability').select('*').eq('operative_id', id).order('date'),
        supabase.from('labour_bookings').select('*').eq('operative_id', id).order('start_date', { ascending: false }),
      ])
      if (opRes.data) {
        setOperative(opRes.data)
        setForm({ ...opRes.data, day_rate_display: opRes.data.day_rate ? (opRes.data.day_rate / 100).toFixed(2) : '' })
      }
      setCertifications(certRes.data || [])
      setAvailability(availRes.data || [])
      setBookings(bookRes.data || [])
    } catch (loadErr) {
      console.error(loadErr)
      toast.error('Failed to load operative')
    }
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [id])

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function toggleSecondaryTrade(trade) {
    setForm(prev => {
      const trades = (prev.secondary_trades || []).includes(trade)
        ? (prev.secondary_trades || []).filter(t => t !== trade)
        : [...(prev.secondary_trades || []), trade]
      return { ...prev, secondary_trades: trades }
    })
  }

  async function handleSaveProfile() {
    setSaving(true)
    try {
      const update = {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email || null,
        phone: form.phone || null,
        date_of_birth: form.date_of_birth || null,
        address_line_1: form.address_line_1 || null,
        address_line_2: form.address_line_2 || null,
        city: form.city || null,
        postcode: form.postcode || null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
        emergency_contact_relationship: form.emergency_contact_relationship || null,
        primary_trade: form.primary_trade,
        secondary_trades: (form.secondary_trades || []).length > 0 ? form.secondary_trades : null,
        experience_years: form.experience_years ? parseInt(form.experience_years) : null,
        skill_level: form.skill_level || null,
        cscs_card_type: form.cscs_card_type || null,
        cscs_card_number: form.cscs_card_number || null,
        cscs_registration_number: form.cscs_registration_number || null,
        cscs_expiry_date: form.cscs_expiry_date || null,
        day_rate: form.day_rate_display ? Math.round(parseFloat(form.day_rate_display) * 100) : null,
        willing_to_travel_miles: form.willing_to_travel_miles ? parseInt(form.willing_to_travel_miles) : null,
        has_own_transport: form.has_own_transport || false,
        has_own_tools: form.has_own_tools || false,
        notes: form.notes || null,
      }
      const { error } = await supabase.from('agency_operatives').update(update).eq('id', id)
      if (error) throw new Error(error.message)
      toast.success('Profile saved')
      await loadAll()
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    }
    setSaving(false)
  }

  // Certifications
  function openAddCert() {
    setEditingCertId(null)
    setCertForm({ certification_type: '', certificate_number: '', issuing_body: '', date_issued: '', expiry_date: '' })
    setCertFile(null)
    setShowCertForm(true)
  }

  function openEditCert(cert) {
    setEditingCertId(cert.id)
    setCertForm({
      certification_type: cert.certification_type || '',
      certificate_number: cert.certificate_number || '',
      issuing_body: cert.issuing_body || '',
      date_issued: cert.date_issued || '',
      expiry_date: cert.expiry_date || '',
    })
    setCertFile(null)
    setShowCertForm(true)
  }

  async function handleSaveCert() {
    if (!certForm.certification_type) {
      toast.error('Select a certification type')
      return
    }
    setSavingCert(true)
    try {
      let document_url = null
      if (certFile) {
        if (certFile.size > 10 * 1024 * 1024) throw new Error('File must be under 10MB')
        const path = `agency/${operative.agency_id}/certs/${crypto.randomUUID()}-${certFile.name}`
        const { error: upErr } = await supabase.storage.from('documents').upload(path, certFile)
        if (upErr) throw new Error(upErr.message)
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        document_url = urlData.publicUrl
      }

      const record = {
        operative_id: id,
        agency_id: operative.agency_id,
        certification_type: certForm.certification_type,
        certificate_number: certForm.certificate_number || null,
        issuing_body: certForm.issuing_body || null,
        date_issued: certForm.date_issued || null,
        expiry_date: certForm.expiry_date || null,
        ...(document_url && { document_url }),
      }

      if (editingCertId) {
        const { error } = await supabase.from('operative_certifications').update(record).eq('id', editingCertId)
        if (error) throw new Error(error.message)
        toast.success('Certification updated')
      } else {
        const { error } = await supabase.from('operative_certifications').insert(record)
        if (error) throw new Error(error.message)
        toast.success('Certification added')
      }
      setShowCertForm(false)
      const { data } = await supabase.from('operative_certifications').select('*').eq('operative_id', id).order('expiry_date')
      setCertifications(data || [])
    } catch (err) {
      toast.error(err.message || 'Failed to save certification')
    }
    setSavingCert(false)
  }

  async function handleDeleteCert(certId) {
    if (!confirm('Delete this certification?')) return
    const { error } = await supabase.from('operative_certifications').delete().eq('id', certId)
    if (error) {
      toast.error('Failed to delete')
      return
    }
    toast.success('Certification deleted')
    setCertifications(prev => prev.filter(c => c.id !== certId))
  }

  // Availability
  const calendarDays = useMemo(() => {
    const year = calMonth.getFullYear()
    const month = calMonth.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const offset = firstDay === 0 ? 6 : firstDay - 1 // Monday start

    const days = []
    for (let i = 0; i < offset; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const avail = availability.find(a => a.date === dateStr)
      days.push({ day: d, date: dateStr, status: avail?.status || 'available' })
    }
    return days
  }, [calMonth, availability])

  async function toggleDay(dateStr, currentStatus) {
    const cycle = { available: 'unavailable', unavailable: 'booked', booked: 'available' }
    const next = cycle[currentStatus] || 'available'

    const existing = availability.find(a => a.date === dateStr)
    try {
      if (existing) {
        if (next === 'available') {
          await supabase.from('operative_availability').delete().eq('id', existing.id)
          setAvailability(prev => prev.filter(a => a.id !== existing.id))
        } else {
          await supabase.from('operative_availability').update({ status: next }).eq('id', existing.id)
          setAvailability(prev => prev.map(a => a.id === existing.id ? { ...a, status: next } : a))
        }
      } else {
        if (next !== 'available') {
          const { data } = await supabase.from('operative_availability').insert({
            operative_id: id, date: dateStr, status: next, agency_id: operative.agency_id,
          }).select().single()
          if (data) setAvailability(prev => [...prev, data])
        }
      }
    } catch {
      toast.error('Failed to update availability')
    }
  }

  async function bulkSetWeekdays() {
    const dates = []
    const now = new Date()
    // Find next Monday (or today if Monday)
    const dayOfWeek = now.getDay() // 0=Sun, 1=Mon...
    const daysUntilMon = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek
    const nextMon = new Date(now)
    nextMon.setDate(now.getDate() + daysUntilMon)
    nextMon.setHours(0, 0, 0, 0)
    for (let w = 0; w < 4; w++) {
      for (let d = 0; d < 5; d++) {
        const date = new Date(nextMon)
        date.setDate(nextMon.getDate() + (w * 7) + d)
        dates.push(date.toISOString().split('T')[0])
      }
    }

    try {
      // Remove existing availability for these dates
      await supabase.from('operative_availability').delete().eq('operative_id', id).in('date', dates)
      // All these dates become 'available' — which means no record needed (available is default)
      setAvailability(prev => prev.filter(a => !dates.includes(a.date)))
      toast.success(`Marked ${dates.length} weekdays as available`)
    } catch {
      toast.error('Failed to bulk update')
    }
  }

  // Performance stats
  const perfStats = useMemo(() => {
    const completed = bookings.filter(b => b.status === 'completed')
    const totalBookings = bookings.length
    const daysWorked = completed.reduce((sum, b) => {
      if (!b.start_date || !b.end_date) return sum
      const days = Math.ceil((new Date(b.end_date) - new Date(b.start_date)) / (1000 * 60 * 60 * 24)) + 1
      return sum + days
    }, 0)
    const noShows = bookings.filter(b => b.status === 'no_show').length
    const attendance = totalBookings > 0 ? Math.round(((totalBookings - noShows) / totalBookings) * 100) : 0
    const lastBooking = bookings[0] || null

    return { totalBookings, daysWorked, attendance, rating: operative?.rating || 0, lastBooking }
  }, [bookings, operative])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!operative) {
    return (
      <div className="max-w-lg mx-auto p-4 mt-16 text-center">
        <p className="text-slate-500">Operative not found</p>
        <button onClick={() => navigate('/app/agency/operatives')} className="mt-4 text-blue-500 text-sm hover:text-blue-700">Back to Operatives</button>
      </div>
    )
  }

  const inputCls = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400'
  const labelCls = 'block text-xs font-medium text-slate-600 mb-1'

  const DAY_COLORS = {
    available: 'bg-green-100 text-green-700 hover:bg-green-200',
    unavailable: 'bg-red-100 text-red-700 hover:bg-red-200',
    booked: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/app/agency/operatives')} className="p-1 text-slate-400 hover:text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-lg font-bold shrink-0">
          {operative.first_name?.[0]}{operative.last_name?.[0]}
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">{operative.first_name} {operative.last_name}</h1>
          <p className="text-sm text-slate-500">{TRADES[operative.primary_trade]?.label || operative.primary_trade} &middot; {operative.skill_level}</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
          operative.status === 'available' ? 'bg-green-100 text-green-700' :
          operative.status === 'booked' ? 'bg-blue-100 text-blue-700' :
          'bg-slate-100 text-slate-600'
        }`}>
          {operative.status?.charAt(0).toUpperCase() + operative.status?.slice(1)}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'Profile' && (
        <div className="space-y-6">
          <Section title="Personal Details">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>First Name</label>
                <input type="text" value={form.first_name || ''} onChange={e => updateForm('first_name', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Last Name</label>
                <input type="text" value={form.last_name || ''} onChange={e => updateForm('last_name', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={form.email || ''} onChange={e => updateForm('email', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input type="tel" value={form.phone || ''} onChange={e => updateForm('phone', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Date of Birth</label>
                <input type="date" value={form.date_of_birth || ''} onChange={e => updateForm('date_of_birth', e.target.value)} className={inputCls} />
              </div>
            </div>
          </Section>

          <Section title="Address">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Address Line 1</label>
                <input type="text" value={form.address_line_1 || ''} onChange={e => updateForm('address_line_1', e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Address Line 2</label>
                <input type="text" value={form.address_line_2 || ''} onChange={e => updateForm('address_line_2', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>City</label>
                <input type="text" value={form.city || ''} onChange={e => updateForm('city', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Postcode</label>
                <input type="text" value={form.postcode || ''} onChange={e => updateForm('postcode', e.target.value)} className={inputCls} />
              </div>
            </div>
          </Section>

          <Section title="Emergency Contact">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Contact Name</label>
                <input type="text" value={form.emergency_contact_name || ''} onChange={e => updateForm('emergency_contact_name', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Contact Phone</label>
                <input type="tel" value={form.emergency_contact_phone || ''} onChange={e => updateForm('emergency_contact_phone', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Relationship</label>
                <input type="text" value={form.emergency_contact_relationship || ''} onChange={e => updateForm('emergency_contact_relationship', e.target.value)} className={inputCls} />
              </div>
            </div>
          </Section>

          <Section title="Trade & Skills">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Primary Trade</label>
                <select value={form.primary_trade || ''} onChange={e => updateForm('primary_trade', e.target.value)} className={inputCls}>
                  <option value="">Select...</option>
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
                <label className={labelCls}>Skill Level</label>
                <select value={form.skill_level || ''} onChange={e => updateForm('skill_level', e.target.value)} className={inputCls}>
                  {SKILL_LEVELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Experience (years)</label>
                <input type="number" min="0" value={form.experience_years || ''} onChange={e => updateForm('experience_years', e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="mt-3">
              <label className={labelCls}>Secondary Trades</label>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-2">
                {TRADE_OPTIONS.filter(t => t.value !== form.primary_trade).map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => toggleSecondaryTrade(t.value)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                      (form.secondary_trades || []).includes(t.value) ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          <Section title="CSCS / ECS Card">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Card Type</label>
                <select value={form.cscs_card_type || ''} onChange={e => updateForm('cscs_card_type', e.target.value)} className={inputCls}>
                  <option value="">Select...</option>
                  {Object.entries(CARD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Card Number</label>
                <input type="text" value={form.cscs_card_number || ''} onChange={e => updateForm('cscs_card_number', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Registration Number</label>
                <input type="text" value={form.cscs_registration_number || ''} onChange={e => updateForm('cscs_registration_number', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Expiry Date</label>
                <input type="date" value={form.cscs_expiry_date || ''} onChange={e => updateForm('cscs_expiry_date', e.target.value)} className={inputCls} />
              </div>
            </div>
          </Section>

          <Section title="Rates & Preferences">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Day Rate (GBP)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">£</span>
                  <input type="number" min="0" step="0.01" value={form.day_rate_display || ''} onChange={e => updateForm('day_rate_display', e.target.value)} className={`${inputCls} pl-7`} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Willing to Travel (miles)</label>
                <input type="number" min="0" value={form.willing_to_travel_miles || ''} onChange={e => updateForm('willing_to_travel_miles', e.target.value)} className={inputCls} />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={form.has_own_transport || false} onChange={e => updateForm('has_own_transport', e.target.checked)} className="rounded border-slate-300" />
                Own Transport
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={form.has_own_tools || false} onChange={e => updateForm('has_own_tools', e.target.checked)} className="rounded border-slate-300" />
                Own Tools
              </label>
            </div>
          </Section>

          <Section title="Internal Notes">
            <textarea value={form.notes || ''} onChange={e => updateForm('notes', e.target.value)} rows={3} className={inputCls} placeholder="Notes visible only to your agency..." />
          </Section>

          <div className="flex justify-end">
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>
      )}

      {/* Certifications Tab */}
      {activeTab === 'Certifications' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{certifications.length} certifications</p>
            <button onClick={openAddCert} className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors">
              <Plus size={14} /> Add Certification
            </button>
          </div>

          {certifications.length === 0 ? (
            <div className="text-center py-12 bg-white border border-slate-200 rounded-xl">
              <Shield size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No certifications recorded</p>
            </div>
          ) : (
            <div className="space-y-2">
              {certifications.map(cert => {
                const daysLeft = cert.expiry_date ? Math.ceil((new Date(cert.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)) : null
                const expiryColor = daysLeft === null ? '' : daysLeft < 0 ? 'bg-red-100 text-red-700' : daysLeft < 7 ? 'bg-red-100 text-red-700' : daysLeft < 30 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                return (
                  <div key={cert.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">{CERT_TYPES[cert.certification_type] || cert.certification_type}</p>
                      <p className="text-xs text-slate-500">
                        {cert.certificate_number && `#${cert.certificate_number} `}
                        {cert.issuing_body && `by ${cert.issuing_body} `}
                        {cert.date_issued && `issued ${formatDate(cert.date_issued)}`}
                      </p>
                    </div>
                    {daysLeft !== null && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${expiryColor}`}>
                        {daysLeft < 0 ? `Expired ${Math.abs(daysLeft)}d ago` : `${daysLeft}d left`}
                      </span>
                    )}
                    {cert.document_url && (
                      <a href={cert.document_url} target="_blank" rel="noopener" className="text-blue-500 hover:text-blue-700 text-xs font-medium">View</a>
                    )}
                    <button onClick={() => openEditCert(cert)} className="p-1 text-slate-400 hover:text-slate-600"><Save size={14} /></button>
                    <button onClick={() => handleDeleteCert(cert.id)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Cert Form Modal */}
          {showCertForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/50" onClick={() => setShowCertForm(false)} />
              <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">{editingCertId ? 'Edit' : 'Add'} Certification</h3>
                  <button onClick={() => setShowCertForm(false)} className="p-1 text-slate-400 hover:text-slate-600"><X size={18} /></button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className={labelCls}>Type *</label>
                    <select value={certForm.certification_type} onChange={e => setCertForm(p => ({ ...p, certification_type: e.target.value }))} className={inputCls}>
                      <option value="">Select...</option>
                      {Object.entries(CERT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Certificate Number</label>
                    <input type="text" value={certForm.certificate_number} onChange={e => setCertForm(p => ({ ...p, certificate_number: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Issuing Body</label>
                    <input type="text" value={certForm.issuing_body} onChange={e => setCertForm(p => ({ ...p, issuing_body: e.target.value }))} className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Date Issued</label>
                      <input type="date" value={certForm.date_issued} onChange={e => setCertForm(p => ({ ...p, date_issued: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Expiry Date</label>
                      <input type="date" value={certForm.expiry_date} onChange={e => setCertForm(p => ({ ...p, expiry_date: e.target.value }))} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Document</label>
                    <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 cursor-pointer hover:bg-slate-100">
                      <Upload size={14} />
                      {certFile ? certFile.name : 'Upload document...'}
                      <input type="file" onChange={e => setCertFile(e.target.files?.[0] || null)} className="hidden" />
                    </label>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setShowCertForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                  <button onClick={handleSaveCert} disabled={savingCert} className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                    {savingCert && <Loader2 size={14} className="animate-spin" />}
                    {editingCertId ? 'Update' : 'Add'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Availability Tab */}
      {activeTab === 'Availability' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button onClick={() => setCalMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} className="p-1 text-slate-400 hover:text-slate-600">
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm font-bold text-slate-800 w-36 text-center">
                {calMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </span>
              <button onClick={() => setCalMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} className="p-1 text-slate-400 hover:text-slate-600">
                <ChevronRight size={18} />
              </button>
            </div>
            <button onClick={bulkSetWeekdays} className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg transition-colors">
              Mark Mon-Fri Available (4 weeks)
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200" /> Available</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200" /> Unavailable</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-200" /> Booked</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                <div key={d} className="text-center text-[10px] font-medium text-slate-400 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((cell, i) => {
                if (!cell) return <div key={`empty-${i}`} />
                const color = DAY_COLORS[cell.status] || DAY_COLORS.available
                return (
                  <button
                    key={cell.date}
                    onClick={() => toggleDay(cell.date, cell.status)}
                    className={`aspect-square rounded-lg text-xs font-medium transition-colors ${color}`}
                  >
                    {cell.day}
                  </button>
                )
              })}
            </div>
          </div>
          <p className="text-[11px] text-slate-400">Click a day to cycle: Available &rarr; Unavailable &rarr; Booked &rarr; Available</p>
        </div>
      )}

      {/* Bookings Tab */}
      {activeTab === 'Bookings' && (
        <div className="space-y-3">
          {bookings.length === 0 ? (
            <div className="text-center py-12 bg-white border border-slate-200 rounded-xl">
              <Calendar size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No bookings yet</p>
            </div>
          ) : (
            bookings.map(b => {
              const st = BOOKING_STATUSES[b.status] || { label: b.status, color: 'slate' }
              return (
                <div key={b.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{b.project_name || 'Project'}</p>
                    <p className="text-xs text-slate-500">{formatDate(b.start_date)} - {formatDate(b.end_date)}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-${st.color}-100 text-${st.color}-700`}>
                    {st.label}
                  </span>
                  {b.rating && (
                    <span className="flex items-center gap-1 text-xs text-amber-600">
                      <Star size={12} className="fill-amber-400" /> {b.rating.toFixed(1)}
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Performance Tab */}
      {activeTab === 'Performance' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <PerfCard icon={Calendar} label="Total Bookings" value={perfStats.totalBookings} color="blue" />
          <PerfCard icon={Clock} label="Days Worked" value={perfStats.daysWorked} color="green" />
          <PerfCard icon={CheckCircle2} label="Attendance" value={`${perfStats.attendance}%`} color={perfStats.attendance >= 90 ? 'green' : 'amber'} />
          <PerfCard icon={Star} label="Rating" value={perfStats.rating ? perfStats.rating.toFixed(1) : 'N/A'} color="amber" />
          {perfStats.lastBooking && (
            <div className="col-span-2 md:col-span-4 bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-medium text-slate-500 mb-1">Last Booking</p>
              <p className="text-sm font-medium text-slate-800">{perfStats.lastBooking.project_name || 'Project'}</p>
              <p className="text-xs text-slate-500">{formatDate(perfStats.lastBooking.start_date)} - {formatDate(perfStats.lastBooking.end_date)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  )
}

// eslint-disable-next-line no-unused-vars
function PerfCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-100',
  }
  const c = colors[color] || colors.slate
  return (
    <div className={`border rounded-xl p-3 ${c}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} />
        <span className="text-[11px] font-medium opacity-70">{label}</span>
      </div>
      <p className="text-lg font-bold">{value}</p>
    </div>
  )
}
