import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import toast from 'react-hot-toast'
import Modal from './Modal'
import LoadingButton from './LoadingButton'
import { Upload, Layers, Crosshair, Eye, Check, RotateCcw } from 'lucide-react'

export default function DWGAutoDetect({ open, onClose, drawing, companyId, onComplete }) {
  const [step, setStep] = useState('upload') // upload | parsing | layers | cal_p1_draw | cal_p1_coords | cal_p2_draw | cal_p2_coords | preview | inserting | done
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')

  // DWG data
  const [dwgData, setDwgData] = useState(null) // { layers, insertsByLayer, bounds }
  const [selectedLayers, setSelectedLayers] = useState([])

  // Calibration
  const [p1Draw, setP1Draw] = useState(null) // { x, y } percentage
  const [p1DwgX, setP1DwgX] = useState('')
  const [p1DwgY, setP1DwgY] = useState('')
  const [p2Draw, setP2Draw] = useState(null)
  const [p2DwgX, setP2DwgX] = useState('')
  const [p2DwgY, setP2DwgY] = useState('')
  const imgRef = useRef(null)

  // Preview
  const [mappedPoints, setMappedPoints] = useState([])

  // Insert
  const [insertCount, setInsertCount] = useState(0)

  const fileRef = useRef(null)
  const mgr = JSON.parse(getSession('manager_data') || '{}')

  function reset() {
    setStep('upload')
    setProgress(0)
    setProgressLabel('')
    setDwgData(null)
    setSelectedLayers([])
    setP1Draw(null); setP2Draw(null)
    setP1DwgX(''); setP1DwgY('')
    setP2DwgX(''); setP2DwgY('')
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
      setProgressLabel('Done')
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

  // ── Step 3-4: Calibration ──
  function handleImageClick(e) {
    if (!imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    const point = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }

    if (step === 'cal_p1_draw') {
      setP1Draw(point)
      setStep('cal_p1_coords')
    } else if (step === 'cal_p2_draw') {
      setP2Draw(point)
      setStep('cal_p2_coords')
    }
  }

  // ── Step 5: Preview ──
  async function generatePreview() {
    const { dwgToDrawingPercent } = await import('../lib/dwgParser')

    const calibration = {
      point1_dwg_x: parseFloat(p1DwgX),
      point1_dwg_y: parseFloat(p1DwgY),
      point1_draw_x: p1Draw.x,
      point1_draw_y: p1Draw.y,
      point2_dwg_x: parseFloat(p2DwgX),
      point2_dwg_y: parseFloat(p2DwgY),
      point2_draw_x: p2Draw.x,
      point2_draw_y: p2Draw.y,
    }

    const points = []
    for (const layerName of selectedLayers) {
      const inserts = dwgData.insertsByLayer[layerName] || []
      for (const ins of inserts) {
        const mapped = dwgToDrawingPercent({ x: ins.x, y: ins.y }, calibration)
        if (mapped) {
          points.push({ ...mapped, layer: ins.layer, blockName: ins.blockName })
        }
      }
    }

    setMappedPoints(points)
    setStep('preview')
  }

  // ── Step 6: Batch Insert ──
  async function batchInsert() {
    setStep('inserting')
    setProgress(0)
    setProgressLabel('Preparing items...')

    // Get current max item_number
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

    // Save calibration to drawing
    const calibration = {
      layers_selected: selectedLayers,
      point1_draw_x: p1Draw.x, point1_draw_y: p1Draw.y,
      point1_dwg_x: parseFloat(p1DwgX), point1_dwg_y: parseFloat(p1DwgY),
      point2_draw_x: p2Draw.x, point2_draw_y: p2Draw.y,
      point2_dwg_x: parseFloat(p2DwgX), point2_dwg_y: parseFloat(p2DwgY),
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

  // ── Render ──
  const isCalStep = step.startsWith('cal_p1_draw') || step.startsWith('cal_p2_draw')

  return (
    <Modal open={open} onClose={handleClose} title="DWG Auto-Detect" wide>
      <div className="space-y-4">

        {/* ── Upload ── */}
        {step === 'upload' && (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-700">Upload the DWG file that matches this drawing. Fixture blocks (INSERT entities) will be detected and auto-placed as progress dots.</p>
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
              <p className="text-xs text-blue-700">Select the layer(s) that contain the fixtures you want to track. Typically named with "Lighting", "Fire", "Power" etc.</p>
            </div>
            <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {dwgData.layers.map(layer => (
                <label key={layer.name} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedLayers.includes(layer.name)}
                    onChange={() => toggleLayer(layer.name)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{layer.name}</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    {layer.insertCount} fixture{layer.insertCount !== 1 ? 's' : ''}
                  </span>
                </label>
              ))}
            </div>
            {selectedLayers.length > 0 && (
              <p className="text-xs font-medium text-blue-600">{totalSelected()} fixtures selected across {selectedLayers.length} layer{selectedLayers.length !== 1 ? 's' : ''}</p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setStep('upload')} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Back</button>
              <button onClick={() => setStep('cal_p1_draw')} disabled={selectedLayers.length === 0}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg disabled:opacity-40">
                <Layers size={14} className="inline mr-1.5" />Next — Calibrate
              </button>
            </div>
          </div>
        )}

        {/* ── Calibration: Point 1 Draw ── */}
        {step === 'cal_p1_draw' && (
          <div className="space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs text-red-700"><Crosshair size={12} className="inline mr-1" />Click a recognisable point on the drawing (e.g. a grid intersection like "A/1"). This is Point 1.</p>
            </div>
            <div className="relative border border-slate-200 rounded-lg overflow-hidden">
              <img ref={imgRef} src={drawing.image_url} alt="Drawing" className="w-full cursor-crosshair" onClick={handleImageClick} />
            </div>
            <button onClick={() => setStep('layers')} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Back</button>
          </div>
        )}

        {/* ── Calibration: Point 1 Coords ── */}
        {step === 'cal_p1_coords' && (
          <div className="space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs text-red-700">Point 1 placed at ({p1Draw?.x?.toFixed(1)}%, {p1Draw?.y?.toFixed(1)}%). Now enter the matching DWG coordinates for this point.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase text-slate-500">DWG X</label>
                <input type="number" step="any" value={p1DwgX} onChange={e => setP1DwgX(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" placeholder="e.g. 15000" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase text-slate-500">DWG Y</label>
                <input type="number" step="any" value={p1DwgY} onChange={e => setP1DwgY(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" placeholder="e.g. 8000" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setP1Draw(null); setStep('cal_p1_draw') }} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Re-pick</button>
              <button onClick={() => setStep('cal_p2_draw')} disabled={!p1DwgX || !p1DwgY}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg disabled:opacity-40">
                Next — Point 2
              </button>
            </div>
          </div>
        )}

        {/* ── Calibration: Point 2 Draw ── */}
        {step === 'cal_p2_draw' && (
          <div className="space-y-3">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-xs text-purple-700"><Crosshair size={12} className="inline mr-1" />Click a second reference point, ideally far from Point 1 (e.g. opposite corner grid intersection). This is Point 2.</p>
            </div>
            <div className="relative border border-slate-200 rounded-lg overflow-hidden">
              <img ref={imgRef} src={drawing.image_url} alt="Drawing" className="w-full cursor-crosshair" onClick={handleImageClick} />
              {p1Draw && (
                <div className="absolute w-4 h-4 bg-red-500 border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2 z-10 shadow pointer-events-none"
                  style={{ left: `${p1Draw.x}%`, top: `${p1Draw.y}%` }}>
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] bg-red-500 text-white px-1 rounded whitespace-nowrap">P1</span>
                </div>
              )}
            </div>
            <button onClick={() => setStep('cal_p1_coords')} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Back</button>
          </div>
        )}

        {/* ── Calibration: Point 2 Coords ── */}
        {step === 'cal_p2_coords' && (
          <div className="space-y-3">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-xs text-purple-700">Point 2 placed at ({p2Draw?.x?.toFixed(1)}%, {p2Draw?.y?.toFixed(1)}%). Enter the matching DWG coordinates.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase text-slate-500">DWG X</label>
                <input type="number" step="any" value={p2DwgX} onChange={e => setP2DwgX(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" placeholder="e.g. 45000" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase text-slate-500">DWG Y</label>
                <input type="number" step="any" value={p2DwgY} onChange={e => setP2DwgY(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" placeholder="e.g. 22000" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setP2Draw(null); setStep('cal_p2_draw') }} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Re-pick</button>
              <button onClick={generatePreview} disabled={!p2DwgX || !p2DwgY}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg disabled:opacity-40">
                <Eye size={14} className="inline mr-1.5" />Preview
              </button>
            </div>
          </div>
        )}

        {/* ── Preview ── */}
        {step === 'preview' && (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs text-green-700"><Check size={12} className="inline mr-1" />{mappedPoints.length} fixtures mapped. Check the dots look correct on the drawing, then confirm to insert.</p>
            </div>
            <div className="relative border border-slate-200 rounded-lg overflow-hidden">
              <img src={drawing.image_url} alt="Drawing" className="w-full" />
              {mappedPoints.map((pt, i) => (
                <div key={i} className="absolute w-2 h-2 bg-red-500 rounded-full -translate-x-1/2 -translate-y-1/2 opacity-80 pointer-events-none"
                  style={{ left: `${pt.x}%`, top: `${pt.y}%` }} />
              ))}
              {/* Calibration markers */}
              {p1Draw && (
                <div className="absolute w-3 h-3 bg-red-600 border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
                  style={{ left: `${p1Draw.x}%`, top: `${p1Draw.y}%` }} />
              )}
              {p2Draw && (
                <div className="absolute w-3 h-3 bg-purple-600 border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
                  style={{ left: `${p2Draw.x}%`, top: `${p2Draw.y}%` }} />
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep('cal_p1_draw')} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 flex items-center gap-1.5">
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
