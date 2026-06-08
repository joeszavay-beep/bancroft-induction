import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { authFetch } from '../lib/authFetch'
import { AlertTriangle, CheckCircle2, XCircle, Wrench, ArrowLeft, Home } from 'lucide-react'
import { DEFAULT_CHECKLISTS, DEFECT_SEVERITIES } from '../lib/equipmentChecklists'
import { getOperativeSession, setSession } from '../lib/storage'
import toast from 'react-hot-toast'

export default function EquipmentCheck() {
  const { equipmentId } = useParams()
  const navigate = useNavigate()
  const [equipment, setEquipment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState('loading')
  const [operative, setOperative] = useState(null)

  // Checklist
  const [checklistItems, setChecklistItems] = useState([])
  const [checkResults, setCheckResults] = useState({})
  const [floor, setFloor] = useState('')
  const [location, setLocation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [projectFloors, setProjectFloors] = useState([])
  const [floorPlansEnabled, setFloorPlansEnabled] = useState(false)
  const [pinX, setPinX] = useState(null)
  const [pinY, setPinY] = useState(null)
  const pinImgRef = useRef(null)
  const pinMouseDown = useRef(null)

  // Defect
  const [defectDesc, setDefectDesc] = useState('')
  const [defectSeverity, setDefectSeverity] = useState('Major')

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

      // Load project floors (for structured floor selection)
      if (data.project_id) {
        const [floorsRes, projRes] = await Promise.all([
          supabase.from('project_floors').select('*').eq('project_id', data.project_id).order('sort_order'),
          supabase.from('projects').select('floor_plans_enabled').eq('id', data.project_id).single(),
        ])
        setProjectFloors(floorsRes.data || [])
        setFloorPlansEnabled(projRes.data?.floor_plans_enabled || false)
      }

      if (data.status === 'Defective') { setPhase('lockout'); setLoading(false); return }
      if (data.status === 'Off-Hire' || data.status === 'Off-Site') { setPhase('unavailable'); setLoading(false); return }

      // Check for operative session
      const sess = getOperativeSession()
      if (sess?.id && sess?.name) {
        setOperative(sess)
        await loadChecklist(data.type, data.company_id)
        setPhase('checklist')
      } else {
        // Redirect to worker login — set return URL so login redirects back here
        setSession('operative_return_url', `/equipment-check/${equipmentId}`)
        navigate('/worker-login', { replace: true })
        return
      }
      setLoading(false)
    })()
  }, [equipmentId])

  async function loadChecklist(type, companyId) {
    try {
      const res = await fetch(`/api/plant-equipment?action=checklist-template&equipmentType=${encodeURIComponent(type)}&companyId=${companyId || ''}`)
      const data = await res.json()
      if (data.items?.length > 0) { setChecklistItems(data.items); return }
    } catch { /* fall through */ }
    setChecklistItems(DEFAULT_CHECKLISTS[type] || DEFAULT_CHECKLISTS['Other'] || ['General visual inspection passed', 'No visible damage', 'Safe to use'])
  }

  async function handleSubmitCheck() {
    const allChecked = checklistItems.every((_, i) => checkResults[i] !== undefined)
    if (!allChecked) return toast.error('Please complete all checklist items')

    setSubmitting(true)
    try {
      const checklist = checklistItems.map((item, i) => ({ item, passed: checkResults[i] === true }))
      const allPassed = checklist.every(c => c.passed)

      const res = await fetch('/api/plant-equipment?action=check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipmentId: equipment.id,
          operativeId: operative.id,
          operativeName: operative.name,
          checklist,
          allPassed,
          floor: floor || null,
          location: location || null,
          pinX: pinX ?? null,
          pinY: pinY ?? null,
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
  const companyName = equipment?.companies?.name || ''
  const logoUrl = equipment?.companies?.logo_url

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--bg-main)' }}>
        <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: primary }} />
      </div>
    )
  }

  // ── Not found ──
  if (phase === 'not-found') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center" style={{ background: 'var(--bg-main)' }}>
        <Wrench size={48} className="mb-4 opacity-30" style={{ color: 'var(--text-muted)' }} />
        <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Equipment not found</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>This QR code may be invalid or the equipment has been removed.</p>
        <button onClick={() => navigate('/worker')} className="mt-6 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: primary }}>
          <Home size={15} /> Go to Home
        </button>
      </div>
    )
  }

  // ── Lockout (Defective) ──
  if (phase === 'lockout') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center" style={{ background: '#DC2626' }}>
        <XCircle size={64} className="text-white mb-4" />
        <h1 className="text-3xl font-bold text-white mb-2">OUT OF SERVICE</h1>
        <p className="text-xl text-red-100 mb-6">DO NOT USE</p>
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 w-full max-w-sm">
          <p className="text-white font-semibold text-lg">{equipment?.type}</p>
          <p className="text-red-200 text-sm mt-1">{equipment?.description}</p>
          {equipment?.serial_number && <p className="text-red-200 text-xs mt-1">{equipment.serial_number}</p>}
        </div>
        <p className="text-red-200 text-xs mt-8">This equipment has been reported as defective.<br />Contact your site manager.</p>
        <button onClick={() => navigate('/worker')} className="mt-6 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white/20 text-white">
          <Home size={15} /> Go to Home
        </button>
      </div>
    )
  }

  // ── Unavailable ──
  if (phase === 'unavailable') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center" style={{ background: 'var(--bg-main)' }}>
        <AlertTriangle size={48} className="mb-4" style={{ color: '#D29922' }} />
        <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Equipment Not Available</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{equipment?.description} is currently {equipment?.status?.toLowerCase()}.</p>
        <button onClick={() => navigate('/worker')} className="mt-6 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: primary }}>
          <Home size={15} /> Go to Home
        </button>
      </div>
    )
  }

  // ── Checklist ──
  if (phase === 'checklist') {
    const allChecked = checklistItems.every((_, i) => checkResults[i] !== undefined)
    return (
      <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg-main)' }}>
        {/* Header */}
        <div className="shrink-0" style={{ background: primary }}>
          <div className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => navigate('/worker')} className="p-1.5 text-white/60 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </button>
            {logoUrl && <img src={logoUrl} alt="" className="h-7 object-contain" />}
            <div className="flex-1 min-w-0">
              <p className="text-white/60 text-[10px] uppercase tracking-wider">Pre-Use Check</p>
              <p className="text-white font-bold text-sm truncate">{equipment?.type} — {equipment?.description}</p>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-2 bg-black/10">
            <span className="text-white/80 text-xs">{operative?.name}</span>
            <span className="text-white/60 text-xs">{equipment?.projects?.name}</span>
          </div>
        </div>

        <div className="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full pb-8">
          {/* Checklist */}
          <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-main)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Inspection Checklist</h3>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Tap pass or fail for each item</p>
            </div>
            {checklistItems.map((item, i) => {
              const result = checkResults[i]
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-b last:border-0" style={{ borderColor: 'var(--border-color)' }}>
                  <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{item}</span>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => setCheckResults(prev => ({ ...prev, [i]: true }))}
                      className="w-10 h-10 flex items-center justify-center rounded-lg border-2 transition-all"
                      style={{
                        background: result === true ? '#E7F5EC' : 'var(--bg-card)',
                        borderColor: result === true ? '#2C9C5E' : 'var(--border-color)',
                        color: result === true ? '#2C9C5E' : 'var(--text-muted)',
                      }}>
                      <CheckCircle2 size={20} />
                    </button>
                    <button onClick={() => setCheckResults(prev => ({ ...prev, [i]: false }))}
                      className="w-10 h-10 flex items-center justify-center rounded-lg border-2 transition-all"
                      style={{
                        background: result === false ? '#FDECEC' : 'var(--bg-card)',
                        borderColor: result === false ? '#D93E3E' : 'var(--border-color)',
                        color: result === false ? '#D93E3E' : 'var(--text-muted)',
                      }}>
                      <XCircle size={20} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Location */}
          <div className="rounded-xl border p-4 space-y-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Location</h3>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Level / Floor</label>
              {projectFloors.length > 0 ? (
                <select value={floor} onChange={e => { setFloor(e.target.value); setPinX(null); setPinY(null) }}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
                  <option value="">Select floor...</option>
                  {projectFloors.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                </select>
              ) : (
                <input type="text" value={floor} onChange={e => setFloor(e.target.value)} placeholder="e.g. Level 3"
                  className="w-full px-3 py-2.5 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }} />
              )}
            </div>

            {/* Floor plan pin drop */}
            {(() => {
              const selectedFloor = projectFloors.find(f => f.name === floor)
              if (!floorPlansEnabled || !selectedFloor?.image_url) return null
              return (
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
                    Tap the plan to mark where this equipment is {pinX !== null && <button onClick={() => { setPinX(null); setPinY(null) }} className="text-red-500 underline ml-2">Clear pin</button>}
                  </label>
                  <div className="relative rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-color)', maxHeight: 300 }}>
                    <img ref={pinImgRef} src={selectedFloor.image_url} alt={selectedFloor.name}
                      className="w-full cursor-crosshair" draggable={false}
                      onPointerDown={e => { pinMouseDown.current = { x: e.clientX, y: e.clientY } }}
                      onPointerUp={e => {
                        if (!pinMouseDown.current || !pinImgRef.current) return
                        const dx = Math.abs(e.clientX - pinMouseDown.current.x)
                        const dy = Math.abs(e.clientY - pinMouseDown.current.y)
                        pinMouseDown.current = null
                        if (dx > 5 || dy > 5) return
                        const rect = pinImgRef.current.getBoundingClientRect()
                        setPinX(Math.round(((e.clientX - rect.left) / rect.width) * 10000) / 100)
                        setPinY(Math.round(((e.clientY - rect.top) / rect.height) * 10000) / 100)
                      }} />
                    {pinX !== null && pinY !== null && (
                      <div className="absolute w-4 h-4 bg-blue-500 border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2 z-10 shadow-lg pointer-events-none"
                        style={{ left: `${pinX}%`, top: `${pinY}%` }} />
                    )}
                  </div>
                </div>
              )
            })()}

            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Location (optional)</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Zone B corridor"
                className="w-full px-3 py-2.5 rounded-lg border text-sm"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }} />
            </div>
          </div>

          {/* Submit */}
          <button onClick={handleSubmitCheck} disabled={submitting || !allChecked}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all"
            style={{ background: allChecked ? primary : 'var(--text-muted)', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Submitting...' : 'Submit Check'}
          </button>

          {/* Report defect */}
          <button onClick={() => setPhase('defect-form')}
            className="w-full py-2.5 rounded-xl text-sm font-medium border transition-colors"
            style={{ color: '#D93E3E', borderColor: '#D93E3E40', background: '#D93E3E08' }}>
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
        <button onClick={() => navigate('/worker')} className="mt-8 flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-white/20 text-white hover:bg-white/30 transition-colors">
          <Home size={15} /> Go to Home
        </button>
      </div>
    )
  }

  // ── Defect Report Form ──
  if (phase === 'defect-form') {
    return (
      <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg-main)' }}>
        <div className="shrink-0 p-4" style={{ background: '#DC2626' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setPhase('checklist')} className="p-1.5 text-white/60 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div>
              <p className="text-white/60 text-[10px] uppercase tracking-wider">Report Defect</p>
              <p className="text-white font-bold text-sm">{equipment?.type} — {equipment?.description}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full">
          <div className="rounded-xl border p-3" style={{ background: '#FEF2F2', borderColor: '#FECACA' }}>
            <p className="text-sm font-medium" style={{ color: '#991B1B' }}>This will immediately lock the equipment and notify all site managers.</p>
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>What's wrong? *</label>
            <textarea value={defectDesc} onChange={e => setDefectDesc(e.target.value)} rows={3} placeholder="Describe the defect..."
              className="w-full px-3 py-2.5 rounded-lg border text-sm resize-none"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }} />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Severity *</label>
            <div className="flex gap-2">
              {DEFECT_SEVERITIES.map(s => (
                <button key={s.value} onClick={() => setDefectSeverity(s.value)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-all"
                  style={{
                    background: defectSeverity === s.value ? s.color + '18' : 'var(--bg-card)',
                    borderColor: defectSeverity === s.value ? s.color : 'var(--border-color)',
                    color: defectSeverity === s.value ? s.color : 'var(--text-muted)',
                  }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleDefectReport} disabled={submitting}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all"
            style={{ background: '#DC2626', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Reporting...' : 'Report Defect & Lock Equipment'}
          </button>

          <button onClick={() => setPhase('checklist')}
            className="w-full py-2.5 text-sm transition-colors" style={{ color: 'var(--text-muted)' }}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return null
}
