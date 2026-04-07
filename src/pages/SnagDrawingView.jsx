import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { supabase } from '../lib/supabase'
import { fetchAndCache } from '../hooks/useOfflineData'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import SnagDetail from '../components/SnagDetail'
import SnagForm from '../components/SnagForm'
import { generateSnagPDF } from '../lib/generateSnagPDF'
import PrefetchButton from '../components/PrefetchButton'
import BIMOverlay, { BIMToggle } from '../components/BIMOverlay'
import BIMCalibration from '../components/BIMCalibration'
import BIMUpload from '../components/BIMUpload'
import BIMAssetLink from '../components/BIMAssetLink'
import BIMElementPanel from '../components/BIMElementPanel'
import BIMElementPopup from '../components/BIMElementPopup'
import { findNearbyElements, ifcToDrawingPercent } from '../lib/bimUtils'
import {
  ArrowLeft, List, Map, Plus, Download, X, ZoomIn, ZoomOut, Crosshair, Upload, Settings
} from 'lucide-react'
import { getSession } from '../lib/storage'

const STATUS_COLORS = {
  open: { bg: '#ef4444', ring: '#fca5a5' },
  completed: { bg: '#22c55e', ring: '#86efac' },
  closed: { bg: '#9ca3af', ring: '#d1d5db' },
  reassigned: { bg: '#f59e0b', ring: '#fcd34d' },
  pending_review: { bg: '#a855f7', ring: '#c4b5fd' },
}

export default function SnagDrawingView() {
  const { drawingId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const imageRef = useRef(null)
  const transformRef = useRef(null)
  const pinTapRef = useRef(null)

  const [drawing, setDrawing] = useState(null)
  const [project, setProject] = useState(null)
  const [snags, setSnags] = useState([])
  const [operatives, setOperatives] = useState([])
  const [loading, setLoading] = useState(true)
  const [replacingDrawing, setReplacingDrawing] = useState(false)
  const [placingPin, setPlacingPin] = useState(false)
  const [pendingPin, setPendingPin] = useState(null)
  const [selectedSnag, setSelectedSnag] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [showList, setShowList] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)

  // BIM state
  const [bimModels, setBimModels] = useState([])
  const [bimElements, setBimElements] = useState([])
  const [bimCalibration, setBimCalibration] = useState(null)
  const [bimVisible, setBimVisible] = useState(false)
  const [bimCategoryFilter, setBimCategoryFilter] = useState(null)
  const [showBimUpload, setShowBimUpload] = useState(false)
  const [showBimCalibrate, setShowBimCalibrate] = useState(false)
  const [selectedBimElement, setSelectedBimElement] = useState(null)
  const [nearbyBimElements, setNearbyBimElements] = useState([])
  const [linkedBimElement, setLinkedBimElement] = useState(null)
  const [bimFloors, setBimFloors] = useState([])
  const [selectedBimFloor, setSelectedBimFloor] = useState(null)
  const [bimPanelOpen, setBimPanelOpen] = useState(false)
  const [bimPopupElement, setBimPopupElement] = useState(null)
  const [bimPopupPosition, setBimPopupPosition] = useState(null)
  const [bimPopupSnags, setBimPopupSnags] = useState([])
  const [hoveredBimElementId, setHoveredBimElementId] = useState(null)

  useEffect(() => {
    loadData()
    loadBimData()
    if (searchParams.get('add') === 'true') setPlacingPin(true)
  }, [drawingId])

  async function loadBimData() {
    if (!drawingId) return
    // Get drawing to find project_id
    const { data: d } = await supabase.from('drawings').select('project_id').eq('id', drawingId).single()
    if (!d) return

    // Load BIM models for this project
    const { data: models } = await supabase.from('bim_models').select('*').eq('project_id', d.project_id).eq('status', 'ready')
    setBimModels(models || [])

    if (!models?.length) return

    // Load calibration for this drawing
    const { data: cal } = await supabase.from('bim_drawing_calibration').select('*').eq('drawing_id', drawingId).single()
    setBimCalibration(cal || null)

    // Load elements from all models on this project
    const modelIds = models.map(m => m.id)
    const { data: elements } = await supabase.from('bim_elements').select('*').in('model_id', modelIds)
    setBimElements(elements || [])

    // Extract unique floor names
    const floors = [...new Set((elements || []).map(e => e.floor_name).filter(Boolean))].sort()
    setBimFloors(floors)
  }

  async function loadData() {
    setLoading(true)

    // Fetch drawing with offline cache
    const drawings = await fetchAndCache('drawings', (sb) =>
      sb.from('drawings').select('*').eq('id', drawingId).single()
    )
    const d = Array.isArray(drawings) ? drawings.find(r => r.id === drawingId) : drawings
    if (!d) { navigate('/pm'); return }
    setDrawing(d)

    // Fetch project, snags, operatives in parallel — all cached
    const [proj, snagsList, opsList] = await Promise.all([
      fetchAndCache('projects', (sb) => sb.from('projects').select('*').eq('id', d.project_id).single()),
      fetchAndCache('snags', (sb) => sb.from('snags').select('*').eq('drawing_id', drawingId).order('snag_number')),
      fetchAndCache('operatives', (sb) => sb.from('operatives').select('*').eq('project_id', d.project_id).order('name')),
    ])

    setProject(Array.isArray(proj) ? proj.find(r => r.id === d.project_id) : proj)
    const snags = Array.isArray(snagsList) ? snagsList.filter(s => s.drawing_id === drawingId) : (snagsList || [])
    setSnags(snags.sort((a, b) => (a.snag_number || 0) - (b.snag_number || 0)))
    const ops = Array.isArray(opsList) ? opsList.filter(o => o.project_id === d.project_id) : (opsList || [])
    setOperatives(ops.sort((a, b) => (a.name || '').localeCompare(b.name || '')))
    setLoading(false)
  }

  function handleOverlayClick(e) {
    if (!placingPin || !imageRef.current) return
    const rect = imageRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setPendingPin({ x, y })
    setPlacingPin(false)

    // Find nearby BIM elements if calibration exists
    if (bimCalibration && bimElements.length > 0) {
      const mapped = bimElements.map(el => {
        if (el.x == null || el.y == null) return el
        const pos = ifcToDrawingPercent({ x: el.x, y: el.y }, bimCalibration)
        return pos ? { ...el, draw_x: pos.x, draw_y: pos.y } : el
      })
      const nearby = findNearbyElements(mapped, { x, y }, 5)
      setNearbyBimElements(nearby)
      setLinkedBimElement(null)
    }

    setShowForm(true)
  }

  async function handleSnagCreated() {
    setShowForm(false)
    setPendingPin(null)
    await loadData()
  }

  async function handleSnagUpdated() {
    setSelectedSnag(null)
    await loadData()
  }

  async function handleExport() {
    setExporting(true)
    try {
      await generateSnagPDF({ drawing, project, snags, imageUrl: drawing.file_url })
      toast.success('PDF exported')
    } catch (err) {
      console.error(err)
      toast.error('Failed to export PDF')
    }
    setExporting(false)
  }

  async function handleReplaceDrawing(file) {
    if (!file) return
    setReplacingDrawing(true)
    let fileToUpload = file
    let fileExt = file.name.split('.').pop().toLowerCase()

    if (fileExt === 'pdf') {
      try {
        const { pdfToImage } = await import('../lib/pdfToImage')
        fileToUpload = await pdfToImage(file)
        fileExt = 'png'
      } catch { setReplacingDrawing(false); toast.error('Failed to convert PDF'); return }
    }

    if (fileExt === 'svg') {
      try {
        const svgText = await file.text()
        const img = new Image()
        const svgBlob = new Blob([svgText], { type: 'image/svg+xml' })
        const svgUrl = URL.createObjectURL(svgBlob)
        fileToUpload = await new Promise((resolve, reject) => {
          img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = Math.max(img.width, 2000); canvas.height = Math.max(img.height, 1400)
            const ctx = canvas.getContext('2d')
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            URL.revokeObjectURL(svgUrl)
            canvas.toBlob(blob => blob ? resolve(blob) : reject(), 'image/png')
          }
          img.onerror = () => { URL.revokeObjectURL(svgUrl); reject() }
          img.src = svgUrl
        })
        fileExt = 'png'
      } catch { setReplacingDrawing(false); toast.error('Failed to convert SVG'); return }
    }

    const filePath = `${drawing.project_id}/${Date.now()}.${fileExt}`
    const { error: upErr } = await supabase.storage.from('drawings').upload(filePath, fileToUpload, {
      contentType: fileExt === 'png' ? 'image/png' : fileToUpload.type || 'image/jpeg',
    })
    if (upErr) { setReplacingDrawing(false); toast.error('Upload failed'); return }

    const { data: urlData } = supabase.storage.from('drawings').getPublicUrl(filePath)
    await supabase.from('drawings').update({ file_url: urlData.publicUrl }).eq('id', drawingId)

    setReplacingDrawing(false)
    toast.success('Drawing updated — reloading')
    setImageLoaded(false)
    setImgError(false)
    setDrawing(prev => ({ ...prev, file_url: urlData.publicUrl }))
  }

  const filteredSnags = statusFilter === 'all' ? snags : snags.filter(s => s.status === statusFilter)
  const openCount = snags.filter(s => s.status === 'open').length
  const completedCount = snags.filter(s => s.status === 'completed').length
  const closedCount = snags.filter(s => s.status === 'closed').length
  const reassignedCount = snags.filter(s => s.status === 'reassigned').length

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-100">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="h-dvh bg-slate-100 flex flex-col overflow-hidden">
      {/* Dark header bar */}
      <header className="bg-slate-800 text-white px-3 py-2.5 flex items-center justify-between shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/pm')} className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors shrink-0">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{drawing?.name}</p>
            <p className="text-[10px] text-slate-400 truncate">{drawing?.drawing_number} {drawing?.revision && `Rev ${drawing.revision}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setPlacingPin(!placingPin)}
            className={`p-2 rounded-lg transition-colors ${placingPin ? 'bg-red-500' : 'hover:bg-slate-700'}`}
            title={placingPin ? 'Cancel' : 'Add snag'}
          >
            {placingPin ? <X size={16} /> : <Plus size={16} />}
          </button>
          <button onClick={() => setShowList(!showList)} className={`p-2 rounded-lg transition-colors ${showList ? 'bg-blue-500' : 'hover:bg-slate-700'}`}>
            {showList ? <Map size={16} /> : <List size={16} />}
          </button>
          <label className="p-2 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer" title="Replace drawing image">
            {replacingDrawing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Upload size={16} />}
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.svg" className="hidden" onChange={e => { if (e.target.files[0]) handleReplaceDrawing(e.target.files[0]) }} />
          </label>
          {/* BIM toggle */}
          {bimModels.length > 0 && bimCalibration && (
            <BIMToggle
              visible={bimVisible}
              onToggle={setBimVisible}
              elements={bimElements}
              categoryFilter={bimCategoryFilter}
              onCategoryChange={setBimCategoryFilter}
              floors={bimFloors}
              selectedFloor={selectedBimFloor}
              onFloorChange={setSelectedBimFloor}
              onOpenList={() => setBimPanelOpen(!bimPanelOpen)}
              listOpen={bimPanelOpen}
            />
          )}
          {/* BIM settings (upload / calibrate) */}
          <button onClick={() => {
            if (bimModels.length > 0) setShowBimCalibrate(true)
            else setShowBimUpload(true)
          }}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors relative"
            title="BIM Settings"
          >
            <Settings size={16} />
            {bimModels.length > 0 && !bimCalibration && (
              <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-amber-400 rounded-full" title="Calibration needed" />
            )}
          </button>
          <PrefetchButton drawingId={drawingId} projectId={drawing?.project_id} className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-white" />
          <button onClick={handleExport} disabled={exporting} className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
            {exporting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Download size={16} />}
          </button>
        </div>
      </header>

      {/* Status filter pills */}
      <div className="bg-white border-b border-slate-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0">
        {[
          { key: 'all', label: 'All', count: snags.length, dot: 'bg-slate-500' },
          { key: 'open', label: 'Open', count: openCount, dot: 'bg-red-500' },
          { key: 'completed', label: 'Done', count: completedCount, dot: 'bg-green-500' },
          { key: 'closed', label: 'Closed', count: closedCount, dot: 'bg-gray-400' },
          { key: 'reassigned', label: 'Reassigned', count: reassignedCount, dot: 'bg-amber-500' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all whitespace-nowrap ${
              statusFilter === f.key
                ? 'bg-slate-800 text-white shadow-sm'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${statusFilter === f.key ? 'bg-white' : f.dot}`} />
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Pin placement banner */}
      {placingPin && (
        <div className="bg-red-500 text-white px-4 py-2 text-center flex items-center justify-center gap-2 shrink-0">
          <Crosshair size={14} />
          <p className="text-xs font-semibold">Tap on the drawing to place a snag pin</p>
        </div>
      )}

      {/* Drawing viewer or list */}
      {showList ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {filteredSnags.length === 0 ? (
            <p className="text-center py-12 text-slate-400 text-sm">No snags match filter</p>
          ) : (
            filteredSnags.map(snag => {
              const color = STATUS_COLORS[snag.status]
              const isOverdue = snag.due_date && new Date(snag.due_date) < new Date() && snag.status === 'open'
              return (
                <button key={snag.id} onClick={() => { setSelectedSnag(snag); setShowList(false) }}
                  className="w-full bg-white border border-slate-200 rounded-xl p-3 text-left hover:shadow-md transition-all active:scale-[0.99]">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ background: color.bg }}>
                      {snag.snag_number}
                    </div>
                    {snag.photo_url && <img src={snag.photo_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900 font-medium truncate">{snag.description || 'No description'}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] font-semibold uppercase" style={{ color: color.bg }}>{snag.status}</span>
                        {snag.trade && <span className="text-[10px] text-slate-400">{snag.trade}</span>}
                        {snag.priority && <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          snag.priority === 'high' ? 'bg-red-50 text-red-600' : snag.priority === 'medium' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                        }`}>{snag.priority}</span>}
                        {isOverdue && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">OVERDUE</span>}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      ) : (
        <div className={`flex-1 min-h-0 bg-slate-200 relative transition-all duration-200 ${bimPanelOpen ? 'mr-[400px] max-md:mr-0' : ''}`}>
          <TransformWrapper
            ref={transformRef}
            initialScale={1}
            minScale={0.3}
            maxScale={10}
            centerOnInit
            panning={{ velocityDisabled: false }}
            wheel={{ step: 0.08, smoothStep: 0.004 }}
            doubleClick={{ disabled: true }}
            velocityAnimation={{ sensitivity: 1, animationTime: 200 }}
          >
            {({ zoomIn, zoomOut }) => (
              <>
                {/* Zoom controls */}
                {!placingPin && (
                  <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1">
                    <button onClick={() => zoomIn()} className="w-9 h-9 bg-white border border-slate-300 rounded-lg shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50">
                      <ZoomIn size={16} />
                    </button>
                    <button onClick={() => zoomOut()} className="w-9 h-9 bg-white border border-slate-300 rounded-lg shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50">
                      <ZoomOut size={16} />
                    </button>
                  </div>
                )}

                <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="relative inline-block"
                    style={{ cursor: placingPin ? 'crosshair' : 'grab' }}
                    onPointerDown={(e) => { if (placingPin) pinTapRef.current = { x: e.clientX, y: e.clientY, time: Date.now() } }}
                    onPointerUp={(e) => {
                      if (!placingPin || !pinTapRef.current) return
                      const dx = Math.abs(e.clientX - pinTapRef.current.x)
                      const dy = Math.abs(e.clientY - pinTapRef.current.y)
                      const dt = Date.now() - pinTapRef.current.time
                      pinTapRef.current = null
                      if (dx < 8 && dy < 8 && dt < 400) handleOverlayClick(e)
                    }}>
                    {imgError ? (
                      <div className="w-[800px] h-[600px] bg-white flex items-center justify-center">
                        <p className="text-slate-400 text-sm">Failed to load drawing image</p>
                      </div>
                    ) : (
                      <img
                        ref={imageRef}
                        src={drawing?.file_url}
                        alt={drawing?.name}
                        className="max-w-none select-none"
                        style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '100%' }}
                        onLoad={() => setImageLoaded(true)}
                        onError={(e) => { console.error('Image load error:', e); setImgError(true) }}
                        draggable={false}
                      />
                    )}

                    {/* Snag pins */}
                    {imageLoaded && filteredSnags.map(snag => {
                      const color = STATUS_COLORS[snag.status] || STATUS_COLORS.open
                      const isPending = snag._pending
                      return (
                        <button
                          key={snag.id}
                          onClick={(e) => { e.stopPropagation(); if (!placingPin) setSelectedSnag(snag) }}
                          className={`absolute -translate-x-1/2 -translate-y-full z-10 group ${isPending ? 'opacity-75' : ''}`}
                          style={{ left: `${snag.pin_x}%`, top: `${snag.pin_y}%`, pointerEvents: placingPin ? 'none' : 'auto' }}
                          title={`#${snag.snag_number}: ${snag.description?.slice(0, 40)}${isPending ? ' (pending sync)' : ''}`}
                        >
                          <svg width="28" height="36" viewBox="0 0 28 36" className="drop-shadow-md group-hover:scale-110 transition-transform">
                            <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill={color.bg} />
                            {isPending && (
                              <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z"
                                fill="none" stroke="white" strokeWidth="2" strokeDasharray="4 3" />
                            )}
                            <circle cx="14" cy="13" r="8" fill="white" fillOpacity="0.3" />
                            <text x="14" y="17" textAnchor="middle" fontSize="10" fontWeight="700" fill="white">{snag.snag_number}</text>
                          </svg>
                        </button>
                      )
                    })}

                    {/* BIM element overlay */}
                    {imageLoaded && (
                      <BIMOverlay
                        elements={bimElements.filter(el => {
                          if (bimCategoryFilter && !bimCategoryFilter.includes(el.category)) return false
                          if (selectedBimFloor && el.floor_name !== selectedBimFloor) return false
                          return true
                        })}
                        calibration={bimCalibration}
                        visible={bimVisible}
                        onElementClick={async (el, e) => {
                          // Fetch linked snags for popup
                          const { data: elSnags } = await supabase.from('snags').select('id, snag_number, description, status').eq('bim_element_id', el.id)
                          setBimPopupSnags(elSnags || [])
                          setBimPopupElement(el)
                          setBimPopupPosition({ x: e.clientX, y: e.clientY })
                          setSelectedBimElement(el)
                        }}
                        selectedElementId={bimPopupElement?.id || selectedBimElement?.id}
                        hoveredElementId={hoveredBimElementId}
                      />
                    )}

                    {/* Pending pin */}
                    {pendingPin && (
                      <div className="absolute -translate-x-1/2 -translate-y-full z-10 animate-bounce" style={{ left: `${pendingPin.x}%`, top: `${pendingPin.y}%` }}>
                        <svg width="28" height="36" viewBox="0 0 28 36">
                          <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="#ef4444" />
                          <text x="14" y="17" textAnchor="middle" fontSize="10" fontWeight="700" fill="white">?</text>
                        </svg>
                      </div>
                    )}
                  </div>
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        </div>
      )}

      {/* Snag form */}
      {showForm && pendingPin && (
        <SnagForm
          open={showForm}
          onClose={() => { setShowForm(false); setPendingPin(null); setNearbyBimElements([]); setLinkedBimElement(null) }}
          drawingId={drawingId}
          projectId={drawing.project_id}
          pinX={pendingPin.x}
          pinY={pendingPin.y}
          nextNumber={(snags.length > 0 ? Math.max(...snags.map(s => s.snag_number)) : 0) + 1}
          operatives={operatives}
          onCreated={handleSnagCreated}
          nearbyBimElements={nearbyBimElements}
          linkedBimElement={linkedBimElement}
          onBimElementLink={setLinkedBimElement}
        />
      )}

      {/* Snag detail */}
      {selectedSnag && (
        <SnagDetail
          snag={selectedSnag}
          onClose={() => setSelectedSnag(null)}
          onUpdated={handleSnagUpdated}
          isPM={true}
          operatives={operatives}
          drawing={drawing}
        />
      )}

      {/* BIM Upload modal */}
      {showBimUpload && (
        <BIMUpload
          open={showBimUpload}
          onClose={() => setShowBimUpload(false)}
          projectId={drawing?.project_id}
          companyId={JSON.parse(getSession('manager_data') || '{}').company_id}
          models={bimModels}
          onModelsChanged={() => { loadBimData(); setShowBimUpload(false) }}
        />
      )}

      {/* BIM Calibration modal */}
      {showBimCalibrate && (
        <BIMCalibration
          open={showBimCalibrate}
          onClose={() => setShowBimCalibrate(false)}
          drawingId={drawingId}
          modelId={bimModels[0]?.id}
          companyId={JSON.parse(getSession('manager_data') || '{}').company_id}
          imageUrl={drawing?.file_url}
          existingCalibration={bimCalibration}
          onSaved={(cal) => { setBimCalibration(cal); loadBimData() }}
        />
      )}

      {/* BIM Element Popup */}
      {bimPopupElement && bimPopupPosition && (
        <BIMElementPopup
          element={bimPopupElement}
          position={bimPopupPosition}
          linkedSnags={bimPopupSnags}
          onClose={() => { setBimPopupElement(null); setBimPopupPosition(null); setSelectedBimElement(null) }}
          onRaiseSnag={(el) => {
            // Close popup, place pin at element position, pre-link element
            setBimPopupElement(null)
            setBimPopupPosition(null)
            if (bimCalibration && el.x != null && el.y != null) {
              const pos = ifcToDrawingPercent({ x: el.x, y: el.y }, bimCalibration)
              if (pos) {
                setPendingPin({ x: pos.x, y: pos.y })
                setLinkedBimElement(el)
                setShowForm(true)
              }
            }
          }}
        />
      )}

      {/* BIM Element List Panel */}
      <BIMElementPanel
        open={bimPanelOpen}
        onClose={() => setBimPanelOpen(false)}
        elements={bimElements.filter(el => {
          if (bimCategoryFilter && !bimCategoryFilter.includes(el.category)) return false
          if (selectedBimFloor && el.floor_name !== selectedBimFloor) return false
          return true
        })}
        onElementClick={(el) => {
          // Zoom to element and show popup
          if (bimCalibration && el.x != null && el.y != null && transformRef.current) {
            const pos = ifcToDrawingPercent({ x: el.x, y: el.y }, bimCalibration)
            if (pos && imageRef.current) {
              const rect = imageRef.current.getBoundingClientRect()
              const targetX = rect.left + (pos.x / 100) * rect.width
              const targetY = rect.top + (pos.y / 100) * rect.height
              setBimPopupElement(el)
              setBimPopupPosition({ x: targetX, y: targetY })
              setSelectedBimElement(el)
            }
          }
        }}
        onElementHover={(id) => setHoveredBimElementId(id)}
        onStatusUpdate={async (ids, newStatus) => {
          // Optimistic update — immediately reflect in UI
          setBimElements(prev => prev.map(el => ids.includes(el.id) ? { ...el, status: newStatus } : el))
          const { error } = await supabase.from('bim_elements').update({ status: newStatus }).in('id', ids)
          if (error) {
            toast.error('Failed to update status — is the status column added?')
            loadBimData() // revert
          } else {
            toast.success(`${ids.length} element${ids.length > 1 ? 's' : ''} marked as ${newStatus}`)
          }
        }}
        drawingId={drawingId}
      />
    </div>
  )
}
