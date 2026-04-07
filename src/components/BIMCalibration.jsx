import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import Modal from './Modal'
import LoadingButton from './LoadingButton'
import { Crosshair, RotateCcw, Check } from 'lucide-react'
import { getSession } from '../lib/storage'

/**
 * Two-point calibration modal.
 * User clicks two points on the drawing, enters their IFC world coordinates,
 * and we save the mapping so BIM elements can be projected onto the drawing.
 */
export default function BIMCalibration({ open, onClose, drawingId, modelId, companyId, imageUrl, existingCalibration, onSaved }) {
  const imgRef = useRef(null)
  const [step, setStep] = useState(existingCalibration ? 'review' : 'point1_draw')
  const [saving, setSaving] = useState(false)

  // Point 1: drawing click + IFC coords
  const [p1Draw, setP1Draw] = useState(existingCalibration ? { x: existingCalibration.point1_draw_x, y: existingCalibration.point1_draw_y } : null)
  const [p1IfcX, setP1IfcX] = useState(existingCalibration?.point1_ifc_x?.toString() || '')
  const [p1IfcY, setP1IfcY] = useState(existingCalibration?.point1_ifc_y?.toString() || '')

  // Point 2: drawing click + IFC coords
  const [p2Draw, setP2Draw] = useState(existingCalibration ? { x: existingCalibration.point2_draw_x, y: existingCalibration.point2_draw_y } : null)
  const [p2IfcX, setP2IfcX] = useState(existingCalibration?.point2_ifc_x?.toString() || '')
  const [p2IfcY, setP2IfcY] = useState(existingCalibration?.point2_ifc_y?.toString() || '')

  const [floorName, setFloorName] = useState(existingCalibration?.floor_name || '')

  function handleImageClick(e) {
    if (!imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    const point = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }

    if (step === 'point1_draw') {
      setP1Draw(point)
      setStep('point1_ifc')
    } else if (step === 'point2_draw') {
      setP2Draw(point)
      setStep('point2_ifc')
    }
  }

  async function handleSave() {
    const p1x = parseFloat(p1IfcX), p1y = parseFloat(p1IfcY)
    const p2x = parseFloat(p2IfcX), p2y = parseFloat(p2IfcY)
    if ([p1x, p1y, p2x, p2y].some(isNaN)) {
      toast.error('Enter valid IFC coordinates for both points')
      return
    }
    if (!p1Draw || !p2Draw) {
      toast.error('Click both calibration points on the drawing')
      return
    }

    setSaving(true)
    const managerData = JSON.parse(getSession('manager_data') || '{}')

    const record = {
      drawing_id: drawingId,
      model_id: modelId,
      company_id: companyId,
      point1_ifc_x: p1x,
      point1_ifc_y: p1y,
      point1_draw_x: p1Draw.x,
      point1_draw_y: p1Draw.y,
      point2_ifc_x: p2x,
      point2_ifc_y: p2y,
      point2_draw_x: p2Draw.x,
      point2_draw_y: p2Draw.y,
      floor_name: floorName || null,
      created_by: managerData.name || 'Unknown',
      updated_at: new Date().toISOString(),
    }

    let result
    if (existingCalibration?.id) {
      result = await supabase.from('bim_drawing_calibration').update(record).eq('id', existingCalibration.id)
    } else {
      result = await supabase.from('bim_drawing_calibration').insert(record).select().single()
    }

    setSaving(false)
    if (result.error) {
      toast.error('Failed to save calibration')
      console.error(result.error)
      return
    }

    toast.success('Calibration saved')
    onSaved?.(result.data || { ...existingCalibration, ...record })
    onClose()
  }

  function reset() {
    setP1Draw(null); setP2Draw(null)
    setP1IfcX(''); setP1IfcY('')
    setP2IfcX(''); setP2IfcY('')
    setStep('point1_draw')
  }

  const isPlacingPoint = step === 'point1_draw' || step === 'point2_draw'
  const inputCls = "w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:border-blue-400"

  return (
    <Modal open={open} onClose={onClose} title="BIM Calibration" wide>
      <div className="space-y-4">
        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-700">
            {step === 'point1_draw' && '🎯 Click the first reference point on the drawing (e.g. a column or corner you can identify in both the drawing and IFC model).'}
            {step === 'point1_ifc' && '📐 Enter the IFC world X,Y coordinates for Point 1 (from your BIM software).'}
            {step === 'point2_draw' && '🎯 Click the second reference point on the drawing (choose a point far from Point 1 for best accuracy).'}
            {step === 'point2_ifc' && '📐 Enter the IFC world X,Y coordinates for Point 2.'}
            {step === 'review' && '✅ Calibration is set. You can recalibrate or save changes.'}
          </p>
        </div>

        {/* Drawing image for clicking */}
        {isPlacingPoint && (
          <div className="relative border border-slate-200 rounded-lg overflow-hidden bg-slate-100" style={{ maxHeight: '300px' }}>
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Drawing"
              className="w-full cursor-crosshair"
              onClick={handleImageClick}
              draggable={false}
            />
            {/* Show placed points */}
            {p1Draw && (
              <div className="absolute w-4 h-4 bg-red-500 border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2 z-10 shadow"
                style={{ left: `${p1Draw.x}%`, top: `${p1Draw.y}%` }}>
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] bg-red-500 text-white px-1 rounded">P1</span>
              </div>
            )}
            {p2Draw && (
              <div className="absolute w-4 h-4 bg-blue-500 border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2 z-10 shadow"
                style={{ left: `${p2Draw.x}%`, top: `${p2Draw.y}%` }}>
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] bg-blue-500 text-white px-1 rounded">P2</span>
              </div>
            )}
          </div>
        )}

        {/* IFC coordinate inputs */}
        {(step === 'point1_ifc' || step === 'review') && (
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <p className="text-xs font-bold text-red-600 mb-2 flex items-center gap-1">
              <Crosshair size={12} /> Point 1 — Drawing ({p1Draw?.x?.toFixed(1)}%, {p1Draw?.y?.toFixed(1)}%)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">IFC X (mm)</label>
                <input type="number" step="any" value={p1IfcX} onChange={e => setP1IfcX(e.target.value)} className={inputCls} placeholder="e.g. 15000" />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">IFC Y (mm)</label>
                <input type="number" step="any" value={p1IfcY} onChange={e => setP1IfcY(e.target.value)} className={inputCls} placeholder="e.g. 8000" />
              </div>
            </div>
            {step === 'point1_ifc' && (
              <button onClick={() => setStep('point2_draw')}
                disabled={!p1IfcX || !p1IfcY}
                className="mt-2 text-xs text-blue-600 hover:underline disabled:opacity-40">
                Next → Place Point 2
              </button>
            )}
          </div>
        )}

        {(step === 'point2_ifc' || step === 'review') && (
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <p className="text-xs font-bold text-blue-600 mb-2 flex items-center gap-1">
              <Crosshair size={12} /> Point 2 — Drawing ({p2Draw?.x?.toFixed(1)}%, {p2Draw?.y?.toFixed(1)}%)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">IFC X (mm)</label>
                <input type="number" step="any" value={p2IfcX} onChange={e => setP2IfcX(e.target.value)} className={inputCls} placeholder="e.g. 45000" />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">IFC Y (mm)</label>
                <input type="number" step="any" value={p2IfcY} onChange={e => setP2IfcY(e.target.value)} className={inputCls} placeholder="e.g. 22000" />
              </div>
            </div>
            {step === 'point2_ifc' && (
              <button onClick={() => setStep('review')}
                disabled={!p2IfcX || !p2IfcY}
                className="mt-2 text-xs text-blue-600 hover:underline disabled:opacity-40">
                Next → Review
              </button>
            )}
          </div>
        )}

        {/* Floor name */}
        {step === 'review' && (
          <div>
            <label className="text-[10px] text-slate-400 block mb-0.5">Floor / Level (optional)</label>
            <input value={floorName} onChange={e => setFloorName(e.target.value)} className={inputCls} placeholder="e.g. Level 01" />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button onClick={reset} className="flex items-center gap-1 px-3 py-2 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg">
            <RotateCcw size={12} /> Reset
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 text-xs text-slate-500 hover:text-slate-700">
            Cancel
          </button>
          {step === 'review' && (
            <LoadingButton loading={saving} onClick={handleSave}
              className="bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm">
              <Check size={14} /> Save Calibration
            </LoadingButton>
          )}
        </div>
      </div>
    </Modal>
  )
}
