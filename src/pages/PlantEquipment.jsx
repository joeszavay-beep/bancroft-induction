import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wrench, Plus, Search, ChevronDown, AlertTriangle, CheckCircle2, Clock, XCircle, QrCode, Printer, Eye, Shield, RefreshCw, Trash2, X, Camera, Map, List } from 'lucide-react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { QRCodeSVG } from 'qrcode.react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useCompany } from '../lib/CompanyContext'
import { useProject } from '../lib/ProjectContext'
import { authFetch } from '../lib/authFetch'
import { EQUIPMENT_TYPES, EQUIPMENT_STATUSES, DEFECT_SEVERITIES } from '../lib/equipmentChecklists'
import { printEquipmentLabels } from '../lib/equipmentLabels'

const STATUS_COLORS = { 'In Service': '#2C9C5E', 'Defective': '#D93E3E', 'Off-Site': '#D29922', 'Off-Hire': '#7C828F' }

export default function PlantEquipment() {
  const { user, company } = useCompany()
  const { projectId, projectName } = useProject()
  const cid = user?.company_id
  const navigate = useNavigate()

  const [items, setItems] = useState([])
  const [dashboard, setDashboard] = useState({ total: 0, onSite: 0, defective: 0, checkedToday: 0, overdue: 0 })
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [showQR, setShowQR] = useState(null)
  const [showDefects, setShowDefects] = useState(null)
  const [defects, setDefects] = useState([])
  const [checks, setChecks] = useState([])
  const [showChecks, setShowChecks] = useState(null)
  const [showDefectReport, setShowDefectReport] = useState(null)
  const [showResolve, setShowResolve] = useState(null)
  const [selected, setSelected] = useState(new Set())

  // Map view state
  const [viewMode, setViewMode] = useState('table')
  const [projectFloors, setProjectFloors] = useState([])
  const [floorPlansEnabled, setFloorPlansEnabled] = useState(false)
  const [selectedMapFloor, setSelectedMapFloor] = useState('')
  const [mapPins, setMapPins] = useState([])
  const [selectedPin, setSelectedPin] = useState(null)
  const [loadingMap, setLoadingMap] = useState(false)

  // Form state
  const [form, setForm] = useState({ description: '', type: '', serialNumber: '', hireCompany: '', onHireDate: '', offHireDate: '', dailyHireRate: '', inspectionIntervalDays: 7 })
  const [defectForm, setDefectForm] = useState({ description: '', severity: 'Major', reporterName: '' })
  const [resolveForm, setResolveForm] = useState({ notes: '' })
  const [saving, setSaving] = useState(false)

  const managerData = JSON.parse(localStorage.getItem('manager_data') || sessionStorage.getItem('manager_data') || '{}')

  // ── Load ──
  const loadItems = useCallback(async () => {
    if (!cid) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ action: 'items' })
      if (projectId) params.set('projectId', projectId)
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search.trim()) params.set('search', search.trim())
      const res = await authFetch(`/api/plant-equipment?${params}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setItems(data.items || [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [cid, projectId, typeFilter, statusFilter, search])

  const loadDashboard = useCallback(async () => {
    if (!cid) return
    try {
      const params = new URLSearchParams({ action: 'dashboard' })
      if (projectId) params.set('projectId', projectId)
      const res = await authFetch(`/api/plant-equipment?${params}`)
      const data = await res.json()
      if (!data.error) setDashboard(data)
    } catch { /* ignore */ }
  }, [cid, projectId])

  useEffect(() => { loadItems(); loadDashboard() }, [loadItems, loadDashboard])

  // Load project floors for map view
  useEffect(() => {
    if (!projectId || !cid) return
    ;(async () => {
      const [floorsRes, projRes] = await Promise.all([
        supabase.from('project_floors').select('*').eq('project_id', projectId).order('sort_order'),
        supabase.from('projects').select('floor_plans_enabled').eq('id', projectId).single(),
      ])
      setProjectFloors(floorsRes.data || [])
      const enabled = projRes.data?.floor_plans_enabled || false
      setFloorPlansEnabled(enabled)
      // Auto-select first floor with an image
      const firstWithImage = (floorsRes.data || []).find(f => f.image_url)
      if (firstWithImage) setSelectedMapFloor(firstWithImage.name)
    })()
  }, [projectId, cid])

  // Load map pins when floor changes or map view opens
  useEffect(() => {
    if (!selectedMapFloor || !projectId || viewMode !== 'map') return
    ;(async () => {
      setLoadingMap(true)
      try {
        const params = new URLSearchParams({ action: 'equipment-map', projectId, floor: selectedMapFloor })
        const res = await authFetch(`/api/plant-equipment?${params}`)
        const data = await res.json()
        setMapPins(data.pins || [])
      } catch { setMapPins([]) }
      setLoadingMap(false)
    })()
  }, [selectedMapFloor, projectId, viewMode])

  // ── CRUD ──
  async function handleSave() {
    if (!form.description.trim() || !form.type) return toast.error('Description and type required')
    setSaving(true)
    try {
      const method = editItem ? 'PATCH' : 'POST'
      const body = {
        ...(editItem ? { id: editItem.id } : {}),
        projectId: projectId || null,
        description: form.description.trim(),
        type: form.type,
        serialNumber: form.serialNumber,
        hireCompany: form.hireCompany,
        onHireDate: form.onHireDate || null,
        offHireDate: form.offHireDate || null,
        dailyHireRate: form.dailyHireRate ? parseFloat(form.dailyHireRate) : null,
        inspectionIntervalDays: parseInt(form.inspectionIntervalDays) || 7,
      }
      const res = await authFetch(`/api/plant-equipment?action=item`, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success(editItem ? 'Updated' : 'Equipment added')
      setShowAdd(false); setEditItem(null)
      setForm({ description: '', type: '', serialNumber: '', hireCompany: '', onHireDate: '', offHireDate: '', dailyHireRate: '', inspectionIntervalDays: 7 })
      loadItems(); loadDashboard()
    } catch (e) { toast.error(e.message) }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this equipment?')) return
    try {
      const res = await authFetch(`/api/plant-equipment?action=item&id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success('Deleted')
      loadItems(); loadDashboard()
    } catch (e) { toast.error(e.message) }
  }

  async function handleDefectReport() {
    if (!defectForm.description.trim()) return toast.error('Describe the defect')
    setSaving(true)
    try {
      const res = await authFetch('/api/plant-equipment?action=defect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipmentId: showDefectReport.id,
          description: defectForm.description.trim(),
          severity: defectForm.severity,
          reporterName: managerData.name || user?.email || 'Manager',
          reporterId: user?.id,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success('Defect reported — equipment locked')
      setShowDefectReport(null)
      setDefectForm({ description: '', severity: 'Major', reporterName: '' })
      loadItems(); loadDashboard()
    } catch (e) { toast.error(e.message) }
    setSaving(false)
  }

  async function handleResolve() {
    setSaving(true)
    try {
      const res = await authFetch('/api/plant-equipment?action=resolve-defect', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defectId: showResolve.id,
          resolverName: managerData.name || user?.email || 'Manager',
          notes: resolveForm.notes,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.success('Defect resolved')
      setShowResolve(null); setResolveForm({ notes: '' })
      if (showDefects) loadDefects(showDefects.id)
      loadItems(); loadDashboard()
    } catch (e) { toast.error(e.message) }
    setSaving(false)
  }

  async function loadDefects(equipmentId) {
    const res = await authFetch(`/api/plant-equipment?action=defects&equipmentId=${equipmentId}`)
    const data = await res.json()
    setDefects(data.defects || [])
  }

  async function loadChecks(equipmentId) {
    const res = await authFetch(`/api/plant-equipment?action=checks&equipmentId=${equipmentId}`)
    const data = await res.json()
    setChecks(data.checks || [])
  }

  function openEdit(item) {
    const isOwned = !item.hire_company && !item.on_hire_date && !item.daily_hire_rate
    setForm({
      description: item.description, type: item.type, serialNumber: item.serial_number || '',
      owned: isOwned, hireCompany: item.hire_company || '', onHireDate: item.on_hire_date || '',
      offHireDate: item.off_hire_date || '', dailyHireRate: item.daily_hire_rate || '',
      inspectionIntervalDays: item.inspection_interval_days || 7,
    })
    setEditItem(item); setShowAdd(true)
  }

  function handlePrintLabels() {
    const toPrint = selected.size > 0 ? items.filter(i => selected.has(i.id)) : items
    if (toPrint.length === 0) return toast.error('No items to print')
    printEquipmentLabels(toPrint, company)
  }

  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '\u2014'
  const fmtTime = d => d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: 'var(--primary-color)', color: '#fff' }}><Wrench size={20} /></div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Plant & Equipment</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{projectName || 'All Projects'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {floorPlansEnabled && projectId && (
            <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-color)' }}>
              <button onClick={() => setViewMode('table')} className="flex items-center gap-1 px-3 py-2 text-xs font-medium transition-colors"
                style={{ backgroundColor: viewMode === 'table' ? 'var(--primary-color)' : 'transparent', color: viewMode === 'table' ? '#fff' : 'var(--text-muted)' }}>
                <List size={14} /> Table
              </button>
              <button onClick={() => setViewMode('map')} className="flex items-center gap-1 px-3 py-2 text-xs font-medium transition-colors"
                style={{ backgroundColor: viewMode === 'map' ? 'var(--primary-color)' : 'transparent', color: viewMode === 'map' ? '#fff' : 'var(--text-muted)' }}>
                <Map size={14} /> Map
              </button>
            </div>
          )}
          <button onClick={handlePrintLabels}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-black/[0.02]"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
            <Printer size={15} /> Print Labels {selected.size > 0 && `(${selected.size})`}
          </button>
          <button onClick={() => { setEditItem(null); setForm({ description: '', type: '', serialNumber: '', hireCompany: '', onHireDate: '', offHireDate: '', dailyHireRate: '', inspectionIntervalDays: 7 }); setShowAdd(true) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: 'var(--primary-color)' }}>
            <Plus size={15} /> Add Equipment
          </button>
        </div>
      </div>

      {/* Dashboard cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: dashboard.total, icon: Wrench, color: 'var(--primary-color)' },
          { label: 'In Service', value: dashboard.onSite, icon: CheckCircle2, color: '#2C9C5E' },
          { label: 'Checked Today', value: dashboard.checkedToday, icon: Clock, color: 'var(--primary-color)' },
          { label: 'Overdue', value: dashboard.overdue, icon: AlertTriangle, color: '#D29922' },
          { label: 'Defective', value: dashboard.defective, icon: XCircle, color: '#D93E3E' },
        ].map(c => (
          <div key={c.label} className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center justify-between mb-2">
              <c.icon size={16} style={{ color: c.color }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{c.label}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      {viewMode === 'table' && <div className="rounded-xl border p-4 flex flex-wrap items-center gap-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search equipment..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border text-sm"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
        </div>
        <div className="relative">
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="pl-3 pr-8 py-2 rounded-lg border text-sm appearance-none"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
            <option value="all">All Types</option>
            {EQUIPMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
        </div>
        <div className="relative">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="pl-3 pr-8 py-2 rounded-lg border text-sm appearance-none"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
            <option value="all">All Statuses</option>
            {EQUIPMENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>}

      {/* Table */}
      {viewMode === 'table' && <div className="rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wider border-b" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-color)' }}>
                <th className="px-3 py-2.5 text-left w-8"><input type="checkbox" onChange={e => setSelected(e.target.checked ? new Set(items.map(i => i.id)) : new Set())} checked={selected.size > 0 && selected.size === items.length} /></th>
                <th className="px-3 py-2.5 text-left">Description</th>
                <th className="px-3 py-2.5 text-left">Type</th>
                <th className="px-3 py-2.5 text-left">Serial</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-3 py-2.5 text-left">Last Checked</th>
                <th className="px-3 py-2.5 text-left">Hire Co.</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center" style={{ color: 'var(--text-muted)' }}>
                  {loading ? 'Loading...' : 'No equipment registered — click "Add Equipment" to start'}
                </td></tr>
              )}
              {items.map(item => {
                const sc = STATUS_COLORS[item.status] || '#7C828F'
                const overdue = item.status === 'In Service' && item.latest_check
                  ? (new Date() - new Date(item.latest_check.checked_at)) / (1000 * 60 * 60 * 24) > item.inspection_interval_days
                  : item.status === 'In Service' && !item.latest_check
                return (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-black/[0.02] transition-colors" style={{ borderColor: 'var(--border-color)' }}>
                    <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(item.id)} onChange={e => { const n = new Set(selected); e.target.checked ? n.add(item.id) : n.delete(item.id); setSelected(n) }} /></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {overdue && <AlertTriangle size={13} color="#D29922" />}
                        {item.open_defects > 0 && <XCircle size={13} color="#D93E3E" />}
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{item.description}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{item.type}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>{item.serial_number || '\u2014'}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold" style={{ background: sc + '18', color: sc }}>{item.status}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: item.latest_check ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {item.latest_check ? `${fmtDate(item.latest_check.checked_at)} by ${item.latest_check.operative_name}` : 'Never'}
                      {item.latest_check?.floor && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-muted)' }}>{item.latest_check.floor}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>{item.hire_company || '\u2014'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Tip label="QR Code"><button onClick={() => setShowQR(item)} className="p-1.5 hover:bg-black/5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}><QrCode size={14} /></button></Tip>
                        <Tip label="Check History"><button onClick={() => { setShowChecks(item); loadChecks(item.id) }} className="p-1.5 hover:bg-black/5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}><Eye size={14} /></button></Tip>
                        <Tip label={item.open_defects > 0 ? `${item.open_defects} open defect${item.open_defects > 1 ? 's' : ''}` : 'Defects'}><button onClick={() => { setShowDefects(item); loadDefects(item.id) }} className="p-1.5 hover:bg-black/5 rounded-lg transition-colors" style={{ color: item.open_defects > 0 ? '#D93E3E' : 'var(--text-muted)' }}><Shield size={14} /></button></Tip>
                        <Tip label="Edit"><button onClick={() => openEdit(item)} className="p-1.5 hover:bg-black/5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}><RefreshCw size={14} /></button></Tip>
                        <Tip label="Delete"><button onClick={() => handleDelete(item.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}><Trash2 size={14} /></button></Tip>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>}

      {/* ═══ Equipment Map View ═══ */}
      {viewMode === 'map' && floorPlansEnabled && (
        <div className="rounded-xl border p-4 space-y-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Floor:</label>
            <select value={selectedMapFloor} onChange={e => { setSelectedMapFloor(e.target.value); setSelectedPin(null) }}
              className="px-3 py-1.5 rounded-lg border text-sm"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
              {projectFloors.filter(f => f.image_url).map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
            </select>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{mapPins.length} item{mapPins.length !== 1 ? 's' : ''} on this floor</span>
          </div>

          {(() => {
            const floorObj = projectFloors.find(f => f.name === selectedMapFloor)
            if (!floorObj?.image_url) return <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>No floor plan uploaded for this floor.</p>
            return (
              <div className="relative rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-color)', height: 500 }}>
                {loadingMap && (
                  <div className="absolute inset-0 z-20 bg-white/60 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--primary-color)' }} />
                  </div>
                )}
                <TransformWrapper initialScale={0.15} minScale={0.05} maxScale={8} centerOnInit limitToBounds={false} wheel={{ step: 0.08 }} doubleClick={{ disabled: true }}>
                  {({ zoomIn, zoomOut, resetTransform }) => (
                  <>
                    <div className="absolute top-2 right-2 z-20 flex gap-1">
                      <button onClick={() => zoomIn()} className="w-8 h-8 bg-white border border-slate-300 rounded-lg shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 text-xs font-bold">+</button>
                      <button onClick={() => zoomOut()} className="w-8 h-8 bg-white border border-slate-300 rounded-lg shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 text-xs font-bold">-</button>
                      <button onClick={() => resetTransform()} className="w-8 h-8 bg-white border border-slate-300 rounded-lg shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 text-[10px] font-medium">Fit</button>
                    </div>
                  <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                    <div className="relative inline-block">
                      <img src={floorObj.image_url} alt={floorObj.name} className="max-w-none select-none" draggable={false} />
                      {mapPins.map(pin => (
                        <button key={pin.equipment_id || pin.id} onClick={(e) => { e.stopPropagation(); setSelectedPin(selectedPin?.equipment_id === pin.equipment_id ? null : pin) }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 z-10 hover:scale-125 transition-transform"
                          style={{ left: `${pin.pin_x}%`, top: `${pin.pin_y}%` }}>
                          <div className="relative">
                            <div className="rounded-full border-4 border-white shadow-lg"
                              style={{ width: 100, height: 100, backgroundColor: STATUS_COLORS[pin.status] || '#7C828F' }} />
                            <div className="absolute inset-0 rounded-full animate-ping opacity-30"
                              style={{ backgroundColor: STATUS_COLORS[pin.status] || '#7C828F' }} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </TransformComponent>
                  </>
                  )}
                </TransformWrapper>

                {/* Pin popup */}
                {selectedPin && (
                  <div className="absolute top-3 left-3 z-30 bg-white rounded-xl shadow-lg border p-3 max-w-[260px]"
                    style={{ borderColor: 'var(--border-color)' }}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{selectedPin.description}</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{selectedPin.type}</p>
                      </div>
                      <button onClick={() => setSelectedPin(null)} className="p-0.5 shrink-0" style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
                    </div>
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[selectedPin.status] || '#7C828F' }} />
                        <span className="text-xs font-medium" style={{ color: STATUS_COLORS[selectedPin.status] }}>{selectedPin.status}</span>
                      </div>
                      {selectedPin.operative_name && (
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          Checked by <strong>{selectedPin.operative_name}</strong>
                        </p>
                      )}
                      {selectedPin.checked_at && (
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {new Date(selectedPin.checked_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                      {selectedPin.serial_number && (
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>SN: {selectedPin.serial_number}</p>
                      )}
                    </div>
                    <button onClick={() => { setShowChecks(selectedPin); loadChecks(selectedPin.equipment_id || selectedPin.id) }}
                      className="mt-2 text-[11px] font-medium underline" style={{ color: 'var(--primary-color)' }}>
                      View check history
                    </button>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* ═══ Add/Edit Modal ═══ */}
      {showAdd && (
        <Modal title={editItem ? 'Edit Equipment' : 'Add Equipment'} onClose={() => { setShowAdd(false); setEditItem(null) }}>
          <div className="space-y-4">
            <TypeField value={form.type} onChange={v => setForm(p => ({ ...p, type: v }))} existingTypes={items.map(i => i.type)} />
            <Field label="Description *" value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} placeholder="e.g. Red podium - 1.2m platform height" />
            <Field label="Serial Number" value={form.serialNumber} onChange={v => setForm(p => ({ ...p, serialNumber: v }))} />
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={form.owned || false}
                onChange={e => setForm(p => ({ ...p, owned: e.target.checked, hireCompany: '', onHireDate: '', offHireDate: '', dailyHireRate: '' }))}
                className="w-4 h-4" />
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Company owned (not hired)</span>
            </label>
            {!form.owned && (
              <>
                <Field label="Hire Company" value={form.hireCompany} onChange={v => setForm(p => ({ ...p, hireCompany: v }))} />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="On-Hire Date" type="date" value={form.onHireDate} onChange={v => setForm(p => ({ ...p, onHireDate: v }))} />
                  <Field label="Off-Hire Date" type="date" value={form.offHireDate} onChange={v => setForm(p => ({ ...p, offHireDate: v }))} />
                </div>
                <Field label="Daily Hire Rate (£)" type="number" value={form.dailyHireRate} onChange={v => setForm(p => ({ ...p, dailyHireRate: v }))} />
              </>
            )}
            <Field label="Inspection Interval (days)" type="number" value={form.inspectionIntervalDays} onChange={v => setForm(p => ({ ...p, inspectionIntervalDays: v }))} />
            <button onClick={handleSave} disabled={saving}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ background: 'var(--primary-color)', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : editItem ? 'Update' : 'Add Equipment'}
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ QR Modal ═══ */}
      {showQR && (
        <Modal title="Equipment QR Code" onClose={() => setShowQR(null)}>
          <div className="text-center space-y-4">
            <QRCodeSVG value={`${window.location.origin}/equipment-check/${showQR.id}`} size={200} level="H" includeMargin={false} />
            <div>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{showQR.type}</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{showQR.description}</p>
              {showQR.serial_number && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{showQR.serial_number}</p>}
            </div>
            <button onClick={() => printEquipmentLabels([showQR], company)}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold border transition-colors hover:bg-black/[0.02]"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
              <Printer size={15} /> Print Label
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ Defects Modal ═══ */}
      {showDefects && (
        <Modal title={`Defects — ${showDefects.description}`} onClose={() => setShowDefects(null)} wide>
          <div className="space-y-3">
            <button onClick={() => setShowDefectReport(showDefects)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ background: '#D93E3E' }}>
              <AlertTriangle size={14} /> Report New Defect
            </button>
            {defects.length === 0 && <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>No defects recorded</p>}
            {defects.map(d => (
              <div key={d.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border-color)', background: d.status === 'Open' ? '#FDECEC' : 'var(--bg-card)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5" style={{ background: d.status === 'Open' ? '#D93E3E18' : '#2C9C5E18', color: d.status === 'Open' ? '#D93E3E' : '#2C9C5E' }}>{d.status}</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5" style={{ background: (DEFECT_SEVERITIES.find(s => s.value === d.severity)?.color || '#7C828F') + '18', color: DEFECT_SEVERITIES.find(s => s.value === d.severity)?.color }}>{d.severity}</span>
                    </div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{d.description}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Reported by {d.reported_by_name} · {fmtDate(d.created_at)} {fmtTime(d.created_at)}</p>
                    {d.resolution_notes && <p className="text-xs mt-1" style={{ color: '#2C9C5E' }}>Resolved: {d.resolution_notes} — {d.resolved_by_name}</p>}
                  </div>
                  {d.status === 'Open' && (
                    <button onClick={() => setShowResolve(d)} className="text-xs px-3 py-1.5 rounded-lg font-medium text-white shrink-0" style={{ background: '#2C9C5E' }}>Resolve</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* ═══ Check History Modal ═══ */}
      {showChecks && (
        <Modal title={`Check History — ${showChecks.description}`} onClose={() => setShowChecks(null)} wide>
          {checks.length === 0 && <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>No checks recorded</p>}
          {checks.map(c => (
            <div key={c.id} className="border-b py-3 last:border-0" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{c.operative_name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtDate(c.checked_at)} {fmtTime(c.checked_at)}{c.floor ? ` · Level ${c.floor}` : ''}{c.location ? ` · ${c.location}` : ''}</p>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5" style={{ background: c.all_passed ? '#2C9C5E18' : '#D93E3E18', color: c.all_passed ? '#2C9C5E' : '#D93E3E' }}>
                  {c.all_passed ? 'Pass' : 'Fail'}
                </span>
              </div>
              {c.checklist?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.checklist.map((item, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5" style={{ background: item.passed ? '#2C9C5E10' : '#D93E3E10', color: item.passed ? '#2C9C5E' : '#D93E3E' }}>
                      {item.passed ? '✓' : '✗'} {item.item}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </Modal>
      )}

      {/* ═══ Defect Report Modal ═══ */}
      {showDefectReport && (
        <Modal title="Report Defect" onClose={() => setShowDefectReport(null)}>
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Reporting defect on <strong style={{ color: 'var(--text-primary)' }}>{showDefectReport.description}</strong>. This will immediately lock the equipment.
            </p>
            <Field label="Defect Description *" value={defectForm.description} onChange={v => setDefectForm(p => ({ ...p, description: v }))} multiline />
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Severity *</label>
              <select value={defectForm.severity} onChange={e => setDefectForm(p => ({ ...p, severity: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
                {DEFECT_SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <button onClick={handleDefectReport} disabled={saving}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ background: '#D93E3E', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Reporting...' : 'Report Defect & Lock Equipment'}
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ Resolve Modal ═══ */}
      {showResolve && (
        <Modal title="Resolve Defect" onClose={() => setShowResolve(null)}>
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Defect: <strong style={{ color: 'var(--text-primary)' }}>{showResolve.description}</strong></p>
            <Field label="Resolution Notes" value={resolveForm.notes} onChange={v => setResolveForm(p => ({ ...p, notes: v }))} multiline />
            <button onClick={handleResolve} disabled={saving}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ background: '#2C9C5E', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Resolving...' : 'Resolve & Return to Service'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Reusable components ──

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-auto`}
        style={{ background: 'var(--bg-card)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-black/5 rounded-lg" style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', multiline, placeholder }) {
  return (
    <div>
      <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>{label}</label>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg border text-sm"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }} />
      )}
    </div>
  )
}

function Tip({ label, children }) {
  return (
    <div className="relative group">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[11px] font-medium text-white whitespace-nowrap rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: '#0D1426', zIndex: 50 }}>
        {label}
      </div>
    </div>
  )
}

function TypeField({ value, onChange, existingTypes = [] }) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState(value || '')

  const defaults = ['Scissor Lift', 'Boom Lift', 'Cherry Picker', 'Spider Lift', 'Scaffold Tower', 'Podium', 'Step Ladder', 'Extension Ladder', 'Hop-Up Platform', 'Trestle', 'Hoist', 'Chain Block', 'Sling', 'Shackle', 'Drill', 'Angle Grinder', 'Circular Saw', 'SDS Drill', 'Chop Saw', 'Peco Lift', 'Eco Lift', 'PAV', 'Site Box', 'Tool Chest', 'Transformer', 'Extension Lead', 'Festoon Lighting', 'Temp Distribution Board', 'Fire Extinguisher', 'First Aid Kit', 'Safety Harness', 'Lanyard', 'Generator', 'Compressor', 'Dehumidifier', 'Fan', 'Pump']
  const all = [...new Set([...existingTypes.filter(Boolean), ...defaults])].sort()
  const filtered = draft ? all.filter(s => s.toLowerCase().includes(draft.toLowerCase()) && s !== draft) : all

  useEffect(() => { setDraft(value || '') }, [value])

  return (
    <div>
      <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>Type *</label>
      <div className="relative">
        <input type="text" value={draft}
          onChange={e => { setDraft(e.target.value); onChange(e.target.value) }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="e.g. Scissor Lift, Podium, Site Box..."
          className="w-full px-3 py-2 rounded-lg border text-sm"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-card)' }} />
        {focused && filtered.length > 0 && (
          <div className="absolute left-0 top-full w-full z-50 border shadow-lg max-h-[200px] overflow-auto mt-1 rounded-lg"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            {filtered.slice(0, 15).map(s => (
              <button key={s} type="button"
                onMouseDown={() => { setDraft(s); onChange(s) }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-black/[0.03] transition-colors"
                style={{ color: 'var(--text-primary)' }}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
