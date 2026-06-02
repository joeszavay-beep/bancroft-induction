import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { authFetch } from '../lib/authFetch'
import { Shield, AlertTriangle, CheckCircle2, XCircle, ChevronDown, Wrench } from 'lucide-react'
import { DEFAULT_CHECKLISTS, DEFECT_SEVERITIES } from '../lib/equipmentChecklists'
import toast from 'react-hot-toast'

export default function EquipmentCheck() {
  const { equipmentId } = useParams()
  const [equipment, setEquipment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState('loading') // loading, lockout, login, checklist, success, defect-form
  const [operative, setOperative] = useState(null)

  // Login
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  // Checklist
  const [checklistItems, setChecklistItems] = useState([])
  const [checkResults, setCheckResults] = useState({})
  const [floor, setFloor] = useState('')
  const [location, setLocation] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Defect
  const [defectDesc, setDefectDesc] = useState('')
  const [defectSeverity, setDefectSeverity] = useState('Major')

  // Load equipment data
  useEffect(() => {
    if (!equipmentId) return
    ;(async () => {
      const { data } = await supabase
        .from('equipment')
        .select('id, description, type, serial_number, status, inspection_interval_days, company_id, project_id, projects(name, location), companies(name, logo_url, primary_colour)')
        .eq('id', equipmentId)
        .single()

      if (!data) { setPhase('not-found'); setLoading(false); return }
      setEquipment(data)

      if (data.status === 'Defective') { setPhase('lockout'); setLoading(false); return }
      if (data.status === 'Off-Hire' || data.status === 'Off-Site') { setPhase('unavailable'); setLoading(false); return }

      // Check for existing operative session
      const sessionRaw = localStorage.getItem('operative_session') || sessionStorage.getItem('operative_session')
      if (sessionRaw) {
        try {
          const sess = JSON.parse(sessionRaw)
          if (sess?.id && sess?.name) {
            setOperative(sess)
            await loadChecklist(data.type, data.company_id)
            setPhase('checklist')
            setLoading(false)
            return
          }
        } catch { /* invalid session */ }
      }

      setPhase('login')
      setLoading(false)
    })()
  }, [equipmentId])

  async function loadChecklist(type, companyId) {
    // Try API for company-specific or default template
    try {
      const res = await fetch(`/api/plant-equipment?action=checklist-template&equipmentType=${encodeURIComponent(type)}&companyId=${companyId || ''}`)
      const data = await res.json()
      if (data.items?.length > 0) { setChecklistItems(data.items); return }
    } catch { /* fall through */ }
    // Fallback to hardcoded defaults
    setChecklistItems(DEFAULT_CHECKLISTS[type] || DEFAULT_CHECKLISTS['Other'])
  }

  async function handleLogin(e) {
    e.preventDefault()
    setLoggingIn(true)
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(), password: password.trim(),
      })
      if (error) throw error

      const { data: ops } = await supabase.from('operatives')
        .select('id, name, email, role, photo_url, company_id')
        .ilike('email', email.trim().toLowerCase())
        .limit(1)
      const op = ops?.[0]
      if (!op) throw new Error('Operative not found')

      const session = { id: op.id, name: op.name, email: op.email, role: op.role, company_id: op.company_id }
      localStorage.setItem('operative_session', JSON.stringify(session))
      setOperative(session)
      await loadChecklist(equipment.type, equipment.company_id)
      setPhase('checklist')
    } catch (err) {
      toast.error(err.message || 'Login failed')
    }
    setLoggingIn(false)
  }

  async function handleSubmitCheck() {
    // Validate all items checked
    const allChecked = checklistItems.every((_, i) => checkResults[i] !== undefined)
    if (!allChecked) return toast.error('Please complete all checklist items')

    setSubmitting(true)
    try {
      const checklist = checklistItems.map((item, i) => ({ item, passed: checkResults[i] === true }))
      const allPassed = checklist.every(c => c.passed)

      const res = await authFetch('/api/plant-equipment?action=check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipmentId: equipment.id,
          operativeId: operative.id,
          operativeName: operative.name,
          checklist,
          allPassed,
          floor: floor || null,
          location: location || null,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPhase('success')
    } catch (err) {
      toast.error(err.message || 'Failed to submit check')
    }
    setSubmitting(false)
  }

  async function handleDefectReport() {
    if (!defectDesc.trim()) return toast.error('Describe the defect')
    setSubmitting(true)
    try {
      const res = await authFetch('/api/plant-equipment?action=defect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipmentId: equipment.id,
          description: defectDesc.trim(),
          severity: defectSeverity,
          reporterName: operative?.name || 'Unknown',
          reporterId: operative?.id,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setEquipment(prev => ({ ...prev, status: 'Defective' }))
      setPhase('lockout')
      toast.success('Defect reported — equipment locked')
    } catch (err) {
      toast.error(err.message || 'Failed to report defect')
    }
    setSubmitting(false)
  }

  const primary = equipment?.companies?.primary_colour || '#1B6FC8'
  const companyName = equipment?.companies?.name || 'CoreSite'

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: primary }} />
      </div>
    )
  }

  // ── Not found ──
  if (phase === 'not-found') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <Wrench size={48} className="mb-4 opacity-30 text-slate-400" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">Equipment not found</h1>
        <p className="text-sm text-slate-500">This QR code may be invalid or the equipment has been removed.</p>
      </div>
    )
  }

  // ── Lockout (Defective) ──
  if (phase === 'lockout') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-red-600 p-6 text-center">
        <XCircle size={64} className="text-white mb-4" />
        <h1 className="text-3xl font-bold text-white mb-2">OUT OF SERVICE</h1>
        <p className="text-xl text-red-100 mb-6">DO NOT USE</p>
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 w-full max-w-sm">
          <p className="text-white font-semibold">{equipment?.type}</p>
          <p className="text-red-200 text-sm">{equipment?.description}</p>
          {equipment?.serial_number && <p className="text-red-200 text-xs mt-1">{equipment.serial_number}</p>}
        </div>
        <p className="text-red-200 text-xs mt-6">This equipment has been reported as defective.<br />Contact your site manager.</p>
      </div>
    )
  }

  // ── Unavailable (Off-Site / Off-Hire) ──
  if (phase === 'unavailable') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-amber-50 p-6 text-center">
        <AlertTriangle size={48} className="text-amber-500 mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">Equipment Not Available</h1>
        <p className="text-sm text-slate-500">{equipment?.description} is currently {equipment?.status?.toLowerCase()}.</p>
      </div>
    )
  }

  // ── Login ──
  if (phase === 'login') {
    return (
      <div className="min-h-dvh flex flex-col bg-slate-50">
        {/* Header */}
        <div className="p-4 text-center" style={{ background: primary }}>
          <p className="text-white/70 text-xs uppercase tracking-wider mb-1">Equipment Check</p>
          <p className="text-white font-bold text-lg">{equipment?.type}</p>
          <p className="text-white/80 text-sm">{equipment?.description}</p>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900 text-center">Sign in to continue</h2>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email"
              className="w-full px-4 py-3 rounded-lg border text-sm border-slate-200" autoFocus required />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password"
              className="w-full px-4 py-3 rounded-lg border text-sm border-slate-200" required />
            <button type="submit" disabled={loggingIn}
              className="w-full py-3 rounded-lg text-sm font-semibold text-white" style={{ background: primary, opacity: loggingIn ? 0.6 : 1 }}>
              {loggingIn ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Checklist ──
  if (phase === 'checklist') {
    const allChecked = checklistItems.every((_, i) => checkResults[i] !== undefined)
    return (
      <div className="min-h-dvh flex flex-col bg-slate-50">
        {/* Header */}
        <div className="p-4" style={{ background: primary }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-xs uppercase tracking-wider mb-0.5">Pre-Use Check</p>
              <p className="text-white font-bold">{equipment?.type}</p>
              <p className="text-white/80 text-sm">{equipment?.description}</p>
            </div>
            <div className="text-right">
              <p className="text-white text-sm font-medium">{operative?.name}</p>
              <p className="text-white/60 text-xs">{equipment?.projects?.name}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full">
          {/* Checklist */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">Inspection Checklist</h3>
            </div>
            {checklistItems.map((item, i) => {
              const result = checkResults[i]
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
                  <span className="flex-1 text-sm text-slate-700">{item}</span>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setCheckResults(prev => ({ ...prev, [i]: true }))}
                      className="w-9 h-9 flex items-center justify-center rounded-lg border transition-colors"
                      style={{ background: result === true ? '#E7F5EC' : 'white', borderColor: result === true ? '#2C9C5E' : '#e2e8f0', color: result === true ? '#2C9C5E' : '#cbd5e1' }}>
                      <CheckCircle2 size={18} />
                    </button>
                    <button onClick={() => setCheckResults(prev => ({ ...prev, [i]: false }))}
                      className="w-9 h-9 flex items-center justify-center rounded-lg border transition-colors"
                      style={{ background: result === false ? '#FDECEC' : 'white', borderColor: result === false ? '#D93E3E' : '#e2e8f0', color: result === false ? '#D93E3E' : '#cbd5e1' }}>
                      <XCircle size={18} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Location */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Location</h3>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Level / Floor</label>
              <input type="text" value={floor} onChange={e => setFloor(e.target.value)} placeholder="e.g. Level 3"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Location (optional)</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Zone B corridor"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm" />
            </div>
          </div>

          {/* Submit */}
          <button onClick={handleSubmitCheck} disabled={submitting || !allChecked}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-colors"
            style={{ background: allChecked ? primary : '#94a3b8', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Submitting...' : 'Submit Check'}
          </button>

          {/* Report defect */}
          <button onClick={() => setPhase('defect-form')}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-red-600 border border-red-200 bg-red-50 transition-colors hover:bg-red-100">
            <AlertTriangle size={14} className="inline mr-1.5 -mt-0.5" /> Report Defect
          </button>
        </div>
      </div>
    )
  }

  // ── Success ──
  if (phase === 'success') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center" style={{ background: '#2C9C5E' }}>
        <CheckCircle2 size={64} className="text-white mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Check Complete</h1>
        <p className="text-green-100 text-sm mb-1">{operative?.name}</p>
        <p className="text-green-200 text-sm">{equipment?.type} — {equipment?.description}</p>
        <p className="text-green-200 text-xs mt-4">{new Date().toLocaleString('en-GB')}</p>
      </div>
    )
  }

  // ── Defect Report Form ──
  if (phase === 'defect-form') {
    return (
      <div className="min-h-dvh flex flex-col bg-slate-50">
        <div className="p-4 bg-red-600">
          <p className="text-white/70 text-xs uppercase tracking-wider mb-0.5">Report Defect</p>
          <p className="text-white font-bold">{equipment?.type} — {equipment?.description}</p>
        </div>

        <div className="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-sm text-red-800 font-medium">This will immediately lock the equipment and notify all site managers.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-900 block mb-1">What's wrong? *</label>
            <textarea value={defectDesc} onChange={e => setDefectDesc(e.target.value)} rows={3} placeholder="Describe the defect..."
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm resize-none" />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-900 block mb-1">Severity *</label>
            <div className="flex gap-2">
              {DEFECT_SEVERITIES.map(s => (
                <button key={s.value} onClick={() => setDefectSeverity(s.value)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors"
                  style={{
                    background: defectSeverity === s.value ? s.color + '18' : 'white',
                    borderColor: defectSeverity === s.value ? s.color : '#e2e8f0',
                    color: defectSeverity === s.value ? s.color : '#64748b',
                  }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleDefectReport} disabled={submitting}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-colors"
            style={{ background: '#D93E3E', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Reporting...' : 'Report Defect & Lock Equipment'}
          </button>

          <button onClick={() => setPhase('checklist')}
            className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return null
}
