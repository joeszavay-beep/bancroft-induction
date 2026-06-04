import { useState, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import toast from 'react-hot-toast'
import Modal from './Modal'
import LoadingButton from './LoadingButton'
import { Upload, Layers, Crosshair, Eye, Check, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'

export default function DWGAutoDetect({ open, onClose, drawing, companyId, onComplete }) {
  const [step, setStep] = useState('upload')
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')

  // DWG data
  const [dwgData, setDwgData] = useState(null)
  const [selectedLayers, setSelectedLayers] = useState([])

  // Calibration — click on PDF then click same point on DWG dot map
  const [p1Draw, setP1Draw] = useState(null)  // { x, y } percentage on PDF image
  const [p1Dwg, setP1Dwg] = useState(null)    // { x, y } real DWG coordinates
  const [p2Draw, setP2Draw] = useState(null)
  const [p2Dwg, setP2Dwg] = useState(null)
  const imgRef = useRef(null)
  const dwgMapRef = useRef(null)
  const mouseDownPos = useRef(null)

  // Preview
  const [mappedPoints, setMappedPoints] = useState([])
  const [insertCount, setInsertCount] = useState(0)

  const fileRef = useRef(null)
  const mgr = JSON.parse(getSession('manager_data') || '{}')

  // Compute DWG bounds for selected layers (with padding)
  const dwgBounds = useMemo(() => {
    if (!dwgData || selectedLayers.length === 0) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const name of selectedLayers) {
      for (const ins of (dwgData.insertsByLayer[name] || [])) {
        if (ins.x < minX) minX = ins.x
        if (ins.y < minY) minY = ins.y
        if (ins.x > maxX) maxX = ins.x
        if (ins.y > maxY) maxY = ins.y
      }
    }
    if (minX === Infinity) return null
    const padX = (maxX - minX) * 0.05 || 100
    const padY = (maxY - minY) * 0.05 || 100
    return { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY }
  }, [dwgData, selectedLayers])

  // All inserts for selected layers (for rendering the dot map)
  const selectedInserts = useMemo(() => {
    if (!dwgData) return []
    return selectedLayers.flatMap(name => dwgData.insertsByLayer[name] || [])
  }, [dwgData, selectedLayers])

  function reset() {
    setStep('upload')
    setProgress(0)
    setProgressLabel('')
    setDwgData(null)
    setSelectedLayers([])
    setP1Draw(null); setP2Draw(null)
    setP1Dwg(null); setP2Dwg(null)
    setMappedPoints([])
    setInsertCount(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() {
    reset()
    onClose()
  }

  // ── Step 1: Upload & Parse ──
  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.dwg')) {
      toast.error('Please select a .dwg file')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error('DWG file must be under 50MB')
      return
    }

    setStep('parsing')
    setProgress(0)
    setProgressLabel('Reading file...')

    try {
      const buffer = await file.arrayBuffer()
      setProgress(5)
      setProgressLabel('Loading DWG parser...')

      const { parseDWG } = await import('../lib/dwgParser')
      setProgressLabel('Parsing DWG file...')

      const result = await parseDWG(buffer, (p) => {
        setProgress(5 + Math.floor(p * 0.9))
        if (p < 20) setProgressLabel('Initialising parser...')
        else if (p < 60) setProgressLabel('Extracting entities...')
        else if (p < 80) setProgressLabel('Grouping by layer...')
        else setProgressLabel('Finalising...')
      })

      if (!result.layers.length) {
        toast.error('No fixture blocks (INSERT entities) found in this DWG')
        setStep('upload')
        return
      }

      setDwgData(result)
      setProgress(100)
      setStep('layers')
    } catch (err) {
      console.error('DWG parse error:', err)
      toast.error('Failed to parse DWG file')
      setStep('upload')
    }
  }

  // ── Step 2: Layer Selection ──
  function toggleLayer(name) {
    setSelectedLayers(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    )
  }

  function totalSelected() {
    return selectedLayers.reduce((sum, name) => sum + (dwgData?.insertsByLayer[name]?.length || 0), 0)
  }

  // ── Calibration: click handlers ──
  function handlePdfPointerDown(e) {
    mouseDownPos.current = { x: e.clientX, y: e.clientY }
  }

  function handlePdfPointerUp(e) {
    if (!mouseDownPos.current || !imgRef.current) return
    // Ignore drags — only process clicks (< 5px movement)
    const dx = Math.abs(e.clientX - mouseDownPos.current.x)
    const dy = Math.abs(e.clientY - mouseDownPos.current.y)
    mouseDownPos.current = null
    if (dx > 5 || dy > 5) return

    const rect = imgRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    const point = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }

    if (step === 'cal_p1_pdf') {
      setP1Draw(point)
      setStep('cal_p1_dwg')
    } else if (step === 'cal_p2_pdf') {
      setP2Draw(point)
      setStep('cal_p2_dwg')
    }
  }

  // Convert DWG coord to percentage for rendering (Y flipped: DWG Y-up → screen Y-down)
  function dwgToPct(dwgX, dwgY) {
    if (!dwgBounds) return { x: 0, y: 0 }
    const x = ((dwgX - dwgBounds.minX) / (dwgBounds.maxX - dwgBounds.minX)) * 100
    const y = ((dwgBounds.maxY - dwgY) / (dwgBounds.maxY - dwgBounds.minY)) * 100
    return { x, y }
  }

  function handleDwgMapClick(e) {
    if (!dwgMapRef.current || !dwgBounds) return
    const rect = dwgMapRef.current.getBoundingClientRect()
    const pctX = (e.clientX - rect.left) / rect.width
    const pctY = (e.clientY - rect.top) / rect.height

    // Snap to nearest fixture using SCREEN distance (not DWG distance)
    // This ensures the visually closest dot is selected
    let nearest = null, nearestDist = Infinity
    for (const ins of selectedInserts) {
      const dot = dwgToPct(ins.x, ins.y)
      const dx = dot.x / 100 - pctX
      const dy = dot.y / 100 - pctY
      const dist = dx * dx + dy * dy
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = ins
      }
    }

    if (!nearest) return
    const point = { x: nearest.x, y: nearest.y }

    if (step === 'cal_p1_dwg') {
      setP1Dwg(point)
      setStep('cal_p2_pdf')
    } else if (step === 'cal_p2_dwg') {
      setP2Dwg(point)
      generatePreview(point)
    }
  }

  // ── Preview ──
  async function generatePreview(p2DwgPoint) {
    const p2 = p2DwgPoint || p2Dwg
    const { dwgToDrawingPercent } = await import('../lib/dwgParser')

    const calibration = {
      point1_dwg_x: p1Dwg.x,
      point1_dwg_y: p1Dwg.y,
      point1_draw_x: p1Draw.x,
      point1_draw_y: p1Draw.y,
      point2_dwg_x: p2.x,
      point2_dwg_y: p2.y,
      point2_draw_x: p2Draw.x,
      point2_draw_y: p2Draw.y,
    }

    const points = []
    for (const layerName of selectedLayers) {
      for (const ins of (dwgData.insertsByLayer[layerName] || [])) {
        const mapped = dwgToDrawingPercent({ x: ins.x, y: ins.y }, calibration)
        if (mapped) {
          points.push({ ...mapped, layer: ins.layer, blockName: ins.blockName })
        }
      }
    }

    setMappedPoints(points)
    setStep('preview')
  }

  // ── Batch Insert ──
  async function batchInsert() {
    setStep('inserting')
    setProgress(0)
    setProgressLabel('Preparing items...')

    const { data: existing } = await supabase.from('progress_items')
      .select('item_number')
      .eq('drawing_id', drawing.id)
      .order('item_number', { ascending: false })
      .limit(1)

    let nextNum = (existing?.[0]?.item_number || 0) + 1
    const now = new Date().toISOString()
    const batchSize = 200
    let inserted = 0

    for (let i = 0; i < mappedPoints.length; i += batchSize) {
      const batch = mappedPoints.slice(i, i + batchSize).map((pt, idx) => ({
        company_id: companyId,
        drawing_id: drawing.id,
        item_number: nextNum + i + idx,
        pin_x: pt.x,
        pin_y: pt.y,
        status: 'red',
        label: 'dot',
        notes: JSON.stringify({ size: 16, source: 'dwg', dwg_layer: pt.layer, dwg_block: pt.blockName }),
        created_by: mgr.name || 'Unknown',
        updated_by: mgr.name || 'Unknown',
        created_at: now,
        updated_at: now,
      }))

      const { error } = await supabase.from('progress_items').insert(batch)
      if (error) console.warn('Batch insert error:', error.message)

      inserted += batch.length
      setProgress(Math.floor((inserted / mappedPoints.length) * 100))
      setProgressLabel(`Inserting items... ${inserted} / ${mappedPoints.length}`)
    }

    const calibration = {
      layers_selected: selectedLayers,
      point1_draw_x: p1Draw.x, point1_draw_y: p1Draw.y,
      point1_dwg_x: p1Dwg.x, point1_dwg_y: p1Dwg.y,
      point2_draw_x: p2Draw.x, point2_draw_y: p2Draw.y,
      point2_dwg_x: p2Dwg.x, point2_dwg_y: p2Dwg.y,
      entity_count: mappedPoints.length,
      items_created: inserted,
      calibrated_at: now,
      calibrated_by: mgr.name || 'Unknown',
    }
    await supabase.from('progress_drawings').update({ dwg_calibration: calibration }).eq('id', drawing.id)

    setInsertCount(inserted)
    setStep('done')
    toast.success(`${inserted} items auto-placed`)
  }

  // ── DWG Dot Map (div-based, same approach as PDF markers) ──
  function DwgDotMap({ onClick, label }) {
    const aspectRatio = dwgBounds ? (dwgBounds.maxX - dwgBounds.minX) / (dwgBounds.maxY - dwgBounds.minY) : 1
    return (
      <div className="relative border border-slate-200 rounded-lg overflow-hidden bg-slate-900 cursor-crosshair"
        ref={dwgMapRef} onClick={onClick}
        style={{ aspectRatio, width: '100%' }}>
        {/* Fixture dots */}
        {selectedInserts.map((ins, i) => {
          const { x, y } = dwgToPct(ins.x, ins.y)
          return (
            <div key={i} className="absolute w-1.5 h-1.5 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${x}%`, top: `${y}%`, backgroundColor: '#4ade80', opacity: 0.7 }} />
          )
        })}
        {/* P1 marker */}
        {p1Dwg && (() => {
          const { x, y } = dwgToPct(p1Dwg.x, p1Dwg.y)
          return (
            <div className="absolute w-4 h-4 bg-red-500 border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
              style={{ left: `${x}%`, top: `${y}%` }}>
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] bg-red-500 text-white px-1 rounded whitespace-nowrap">P1</span>
            </div>
          )
        })()}
        <div className="absolute bottom-2 left-2 text-[10px] text-slate-400 bg-slate-800/80 px-2 py-1 rounded">
          {label} — click the same fixture here
        </div>
      </div>
    )
  }

  return (
    <Modal open={open} onClose={handleClose} title="DWG Auto-Detect" wide>
      <div className="space-y-4">

        {/* ── Upload ── */}
        {step === 'upload' && (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-700">Upload the DWG file that matches this drawing. Fixture blocks will be detected and auto-placed as progress dots.</p>
            </div>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-8 cursor-pointer hover:border-blue-400 transition-colors">
              <Upload size={28} className="text-slate-400 mb-2" />
              <span className="text-sm font-medium text-slate-600">Select DWG file</span>
              <span className="text-xs text-slate-400 mt-1">Max 50MB</span>
              <input ref={fileRef} type="file" accept=".dwg" onChange={handleFileSelect} className="hidden" />
            </label>
          </div>
        )}

        {/* ── Parsing ── */}
        {step === 'parsing' && (
          <div className="space-y-3 py-4">
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-slate-500 text-center">{progressLabel}</p>
            <p className="text-[10px] text-slate-400 text-center">{progress}%</p>
          </div>
        )}

        {/* ── Layer Selection ── */}
        {step === 'layers' && dwgData && (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-700">Select the layer(s) that contain the fixtures you want to track.</p>
            </div>
            <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {dwgData.layers.map(layer => (
                <label key={layer.name} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={selectedLayers.includes(layer.name)} onChange={() => toggleLayer(layer.name)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <p className="text-sm font-medium text-slate-900 truncate flex-1">{layer.name}</p>
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    {layer.insertCount} fixture{layer.insertCount !== 1 ? 's' : ''}
                  </span>
                </label>
              ))}
            </div>
            {selectedLayers.length > 0 && (
              <p className="text-xs font-medium text-blue-600">{totalSelected()} fixtures selected</p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setStep('upload')} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Back</button>
              <button onClick={() => setStep('cal_p1_pdf')} disabled={selectedLayers.length === 0}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg disabled:opacity-40">
                Next — Calibrate
              </button>
            </div>
          </div>
        )}

        {/* ── Calibration P1: Click on PDF ── */}
        {step === 'cal_p1_pdf' && (
          <div className="space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs text-red-700"><Crosshair size={12} className="inline mr-1" /><strong>Point 1:</strong> Pinch/scroll to zoom in, then click a recognisable point (e.g. a grid intersection like A/1).</p>
            </div>
            <div className="relative border border-slate-200 rounded-lg overflow-hidden" style={{ height: 400 }}>
              <TransformWrapper initialScale={1} minScale={0.5} maxScale={8} centerOnInit limitToBounds={false} wheel={{ step: 0.08 }} doubleClick={{ disabled: true }}>
                {({ zoomIn, zoomOut }) => (
                  <>
                    <div className="absolute top-2 right-2 z-10 flex gap-1">
                      <button onClick={() => zoomIn()} className="w-8 h-8 bg-white border border-slate-300 rounded-lg shadow-sm flex items-center justify-center text-slate-600"><ZoomIn size={14} /></button>
                      <button onClick={() => zoomOut()} className="w-8 h-8 bg-white border border-slate-300 rounded-lg shadow-sm flex items-center justify-center text-slate-600"><ZoomOut size={14} /></button>
                    </div>
                    <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                      <div className="relative" onPointerDown={handlePdfPointerDown} onPointerUp={handlePdfPointerUp}>
                        <img ref={imgRef} src={drawing.image_url} alt="Drawing" className="w-full cursor-crosshair" draggable={false} />
                      </div>
                    </TransformComponent>
                  </>
                )}
              </TransformWrapper>
            </div>
            <button onClick={() => setStep('layers')} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Back</button>
          </div>
        )}

        {/* ── Calibration P1: Click same point on DWG map ── */}
        {step === 'cal_p1_dwg' && dwgBounds && (
          <div className="space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs text-red-700"><Crosshair size={12} className="inline mr-1" /><strong>Point 1:</strong> Now click the <strong>same point</strong> on the DWG fixture map below. The green dots are your fixtures.</p>
            </div>
            <DwgDotMap onClick={handleDwgMapClick} label="Point 1" />
            <button onClick={() => { setP1Draw(null); setStep('cal_p1_pdf') }} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Back</button>
          </div>
        )}

        {/* ── Calibration P2: Click on PDF ── */}
        {step === 'cal_p2_pdf' && (
          <div className="space-y-3">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-xs text-purple-700"><Crosshair size={12} className="inline mr-1" /><strong>Point 2:</strong> Pinch/scroll to zoom, then click a second point far from Point 1.</p>
            </div>
            <div className="relative border border-slate-200 rounded-lg overflow-hidden" style={{ height: 400 }}>
              <TransformWrapper initialScale={1} minScale={0.5} maxScale={8} centerOnInit limitToBounds={false} wheel={{ step: 0.08 }} doubleClick={{ disabled: true }}>
                {({ zoomIn, zoomOut }) => (
                  <>
                    <div className="absolute top-2 right-2 z-10 flex gap-1">
                      <button onClick={() => zoomIn()} className="w-8 h-8 bg-white border border-slate-300 rounded-lg shadow-sm flex items-center justify-center text-slate-600"><ZoomIn size={14} /></button>
                      <button onClick={() => zoomOut()} className="w-8 h-8 bg-white border border-slate-300 rounded-lg shadow-sm flex items-center justify-center text-slate-600"><ZoomOut size={14} /></button>
                    </div>
                    <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                      <div className="relative" onPointerDown={handlePdfPointerDown} onPointerUp={handlePdfPointerUp}>
                        <img ref={imgRef} src={drawing.image_url} alt="Drawing" className="w-full cursor-crosshair" draggable={false} />
                        {p1Draw && (
                          <div className="absolute w-4 h-4 bg-red-500 border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2 z-10 shadow pointer-events-none"
                            style={{ left: `${p1Draw.x}%`, top: `${p1Draw.y}%` }}>
                            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] bg-red-500 text-white px-1 rounded whitespace-nowrap">P1</span>
                          </div>
                        )}
                      </div>
                    </TransformComponent>
                  </>
                )}
              </TransformWrapper>
            </div>
            <button onClick={() => { setP1Dwg(null); setStep('cal_p1_dwg') }} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Back</button>
          </div>
        )}

        {/* ── Calibration P2: Click same point on DWG map ── */}
        {step === 'cal_p2_dwg' && dwgBounds && (
          <div className="space-y-3">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-xs text-purple-700"><Crosshair size={12} className="inline mr-1" /><strong>Point 2:</strong> Click the <strong>same point</strong> on the DWG fixture map. P1 is shown in red.</p>
            </div>
            <DwgDotMap onClick={handleDwgMapClick} label="Point 2" />
            <button onClick={() => { setP2Draw(null); setStep('cal_p2_pdf') }} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Back</button>
          </div>
        )}

        {/* ── Preview ── */}
        {step === 'preview' && (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs text-green-700"><Check size={12} className="inline mr-1" />{mappedPoints.length} fixtures mapped. Check they look correct, then confirm.</p>
            </div>
            <div className="relative border border-slate-200 rounded-lg overflow-hidden">
              <img src={drawing.image_url} alt="Drawing" className="w-full" />
              {mappedPoints.map((pt, i) => (
                <div key={i} className="absolute w-1.5 h-1.5 bg-red-500 rounded-full -translate-x-1/2 -translate-y-1/2 opacity-80 pointer-events-none"
                  style={{ left: `${pt.x}%`, top: `${pt.y}%` }} />
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setP1Draw(null); setP1Dwg(null); setP2Draw(null); setP2Dwg(null); setStep('cal_p1_pdf') }}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 flex items-center gap-1.5">
                <RotateCcw size={13} /> Re-calibrate
              </button>
              <LoadingButton onClick={batchInsert} className="flex-1 bg-green-600 text-white text-sm">
                <Check size={14} className="inline mr-1.5" />Insert {mappedPoints.length} Items
              </LoadingButton>
            </div>
          </div>
        )}

        {/* ── Inserting ── */}
        {step === 'inserting' && (
          <div className="space-y-3 py-4">
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div className="bg-green-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-slate-500 text-center">{progressLabel}</p>
            <p className="text-[10px] text-slate-400 text-center">{progress}%</p>
          </div>
        )}

        {/* ── Done ── */}
        {step === 'done' && (
          <div className="space-y-3 py-4 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <Check size={28} className="text-green-600" />
            </div>
            <p className="text-lg font-bold text-slate-900">{insertCount} items placed</p>
            <p className="text-sm text-slate-500">All items set to red (Not Available). Open the drawing to start updating progress.</p>
            <button onClick={() => { handleClose(); onComplete?.(insertCount) }}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg">
              Open Drawing
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
