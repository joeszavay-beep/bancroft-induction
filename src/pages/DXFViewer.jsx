import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import { calculateProgress } from '../lib/progressEngine'
import PDFRenderer, { isPDF } from '../components/PDFRenderer'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Pencil, Check, Undo2, Trash2, ZoomIn, ZoomOut,
  Loader2, AlertCircle, Ruler, X
} from 'lucide-react'

const MARKUP_COLORS = {
  green: { hex: '#22C55E', label: 'Installed' },
  amber: { hex: '#F59E0B', label: 'In Progress' },
  red:   { hex: '#EF4444', label: 'Issue' },
}

// --- Calibration helpers (localStorage) ---

function getCalibration(drawingId) {
  try {
    const raw = localStorage.getItem(`programme_cal_${drawingId}`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveCalibration(drawingId, cal) {
  localStorage.setItem(`programme_cal_${drawingId}`, JSON.stringify(cal))
}

function calcMetresPerPercent(cal) {
  if (!cal?.point1 || !cal?.point2 || !cal?.distanceMetres) return null
  const dx = cal.point2.x - cal.point1.x
  const dy = cal.point2.y - cal.point1.y
  const percentDist = Math.sqrt(dx * dx + dy * dy)
  if (percentDist < 0.001) return null
  return cal.distanceMetres / percentDist
}

function calcPolylineLengthMetres(points, metresPerPercent) {
  if (!points || points.length < 2 || !metresPerPercent) return 0
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x
    const dy = points[i + 1].y - points[i].y
    total += Math.sqrt(dx * dx + dy * dy)
  }
  return Math.round(total * metresPerPercent * 100) / 100
}

export default function DXFViewer() {
  const { drawingId } = useParams()
  const navigate = useNavigate()
  const managerData = JSON.parse(getSession('manager_data') || '{}')
  const imageRef = useRef(null)

  const [drawing, setDrawing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)

  // Activities
  const [activities, setActivities] = useState([])
  const [selectedActivity, setSelectedActivity] = useState('')

  // Markup
  const [markupLines, setMarkupLines] = useState([])
  const [drawMode, setDrawMode] = useState(false)
  const [activeColour, setActiveColour] = useState('green')
  const [currentPoints, setCurrentPoints] = useState([])

  // Calibration
  const [calibration, setCalibration] = useState(null)
  const [calibrating, setCalibrating] = useState(false)
  const [calPoints, setCalPoints] = useState([])
  const [calDistanceInput, setCalDistanceInput] = useState('')
  const [calScale, setCalScale] = useState(100) // default 1:100
  const [calDimInput, setCalDimInput] = useState('')

  // Track pointer for tap detection (avoid marking on pan)
  const tapRef = useRef(null)

  useEffect(() => { loadData() }, [drawingId])

  useEffect(() => {
    const cal = getCalibration(drawingId)
    if (cal) setCalibration(cal)
  }, [drawingId])

  async function loadData() {
    setLoading(true)
    try {
      const { data: drawingData, error: drawErr } = await supabase
        .from('design_drawings')
        .select('*')
        .eq('id', drawingId)
        .single()

      if (drawErr || !drawingData) {
        setError('Drawing not found')
        setLoading(false)
        return
      }

      setDrawing(drawingData)

      // Load activities for this drawing
      const { data: acts } = await supabase
        .from('programme_activities')
        .select('*')
        .eq('design_drawing_id', drawingId)
        .order('name')
      setActivities(acts || [])
      if (acts?.length > 0) setSelectedActivity(acts[0].id)

      // Load markup lines
      if (acts?.length > 0) {
        const actIds = acts.map(a => a.id)
        const { data: lines } = await supabase
          .from('markup_lines')
          .select('*')
          .in('programme_activity_id', actIds)
          .order('created_at', { ascending: true })
        setMarkupLines(lines || [])
      }
    } catch (err) {
      console.error('loadData error:', err)
      setError(err.message)
    }
    setLoading(false)
  }

  // Metres per percent from calibration
  const metresPerPercent = useMemo(() => calcMetresPerPercent(calibration), [calibration])

  // Current activity + progress
  const currentActivity = useMemo(() =>
    activities.find(a => a.id === selectedActivity), [activities, selectedActivity])

  const activityLines = useMemo(() =>
    markupLines.filter(l => l.programme_activity_id === selectedActivity), [markupLines, selectedActivity])

  const progress = useMemo(() => {
    if (!currentActivity) return { installedLength: 0, percentage: 0, status: 'not_started' }
    return calculateProgress(currentActivity, activityLines)
  }, [currentActivity, activityLines])

  // Convert a pointer event to image percentage coordinates
  function pointerToPercent(e) {
    const img = imageRef.current
    if (!img) return null
    const rect = img.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }
  }

  function handlePointerDown(e) {
    tapRef.current = { x: e.clientX, y: e.clientY, time: Date.now() }
  }

  function handlePointerUp(e) {
    if (!tapRef.current) return
    const dx = Math.abs(e.clientX - tapRef.current.x)
    const dy = Math.abs(e.clientY - tapRef.current.y)
    const dt = Date.now() - tapRef.current.time
    tapRef.current = null

    // Only count as a tap if minimal movement and quick
    if (dx > 8 || dy > 8 || dt > 400) return

    const pt = pointerToPercent(e)
    if (!pt) return

    if (calibrating) {
      handleCalibrationClick(pt)
      return
    }

    if (drawMode && selectedActivity) {
      setCurrentPoints(prev => [...prev, pt])
    }
  }

  function handleDoubleClick(e) {
    e.preventDefault()
    e.stopPropagation()
    if (drawMode && currentPoints.length >= 2) {
      finishPolyline()
    }
  }

  // --- Calibration ---

  function handleCalibrationClick(pt) {
    if (calPoints.length < 2) {
      const next = [...calPoints, pt]
      setCalPoints(next)
      if (next.length === 2) {
        // Now prompt for distance
        toast.success('Two points set — enter the known distance')
      }
    }
  }

  function confirmCalibration() {
    const dist = parseFloat(calDistanceInput)
    if (!dist || dist <= 0 || calPoints.length !== 2) {
      toast.error('Enter a valid distance in metres')
      return
    }
    const cal = {
      point1: calPoints[0],
      point2: calPoints[1],
      distanceMetres: dist,
    }
    saveCalibration(drawingId, cal)
    setCalibration(cal)
    setCalibrating(false)
    setCalPoints([])
    setCalDistanceInput('')
    toast.success(`Scale set: ${calcMetresPerPercent(cal)?.toFixed(4)} m/%`)
  }

  function confirmCalibrationWithScale() {
    const dim = parseFloat(calDimInput)
    if (!dim || dim <= 0 || !calScale || calPoints.length !== 2) {
      toast.error('Pick a scale and enter the dimension shown on the drawing')
      return
    }
    // Real distance = dimension on drawing (mm) × scale factor, converted to metres
    // At 1:100, a 7200mm dimension on the drawing represents 7200mm in real life
    // The dimension IS the real-world dimension (it's what's written on the drawing)
    // So real distance = calDimInput mm / 1000 = metres
    const realMetres = dim / 1000
    const cal = {
      point1: calPoints[0],
      point2: calPoints[1],
      distanceMetres: realMetres,
      scale: calScale,
      dimensionMm: dim,
    }
    saveCalibration(drawingId, cal)
    setCalibration(cal)
    setCalibrating(false)
    setCalPoints([])
    setCalDimInput('')
    toast.success(`Scale set at 1:${calScale} — ${realMetres}m between calibration points`)
  }

  function cancelCalibration() {
    setCalibrating(false)
    setCalPoints([])
    setCalDistanceInput('')
  }

  // --- Markup drawing ---

  async function finishPolyline() {
    if (currentPoints.length < 2) {
      setCurrentPoints([])
      return
    }

    if (!selectedActivity || !metresPerPercent) {
      if (!metresPerPercent) toast.error('Set scale calibration first')
      setCurrentPoints([])
      return
    }

    const length = calcPolylineLengthMetres(currentPoints, metresPerPercent)

    try {
      const { data, error: insertErr } = await supabase.from('markup_lines').insert({
        company_id: managerData.company_id,
        programme_activity_id: selectedActivity,
        design_drawing_id: drawingId,
        coordinates: currentPoints,
        colour: activeColour,
        real_world_length_metres: length,
        created_by: managerData.name || 'Unknown',
      }).select().single()

      if (insertErr) throw new Error(insertErr.message)

      setMarkupLines(prev => [...prev, data])
      toast.success(`${MARKUP_COLORS[activeColour].label} line: ${length}m`)
    } catch (err) {
      console.error(err)
      toast.error('Failed to save markup line')
    }

    setCurrentPoints([])
  }

  async function handleUndo() {
    const actLines = markupLines
      .filter(l => l.programme_activity_id === selectedActivity)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    if (actLines.length === 0) {
      toast.error('Nothing to undo')
      return
    }

    const lastLine = actLines[0]
    const { error: delErr } = await supabase.from('markup_lines').delete().eq('id', lastLine.id)
    if (delErr) {
      toast.error('Failed to undo')
      return
    }

    setMarkupLines(prev => prev.filter(l => l.id !== lastLine.id))
    toast.success('Line removed')
  }

  async function handleClearAll() {
    if (!selectedActivity) return
    const actLines = markupLines.filter(l => l.programme_activity_id === selectedActivity)
    if (actLines.length === 0) return

    if (!confirm(`Clear all ${actLines.length} markup lines for this activity?`)) return

    const ids = actLines.map(l => l.id)
    const { error: delErr } = await supabase.from('markup_lines').delete().in('id', ids)
    if (delErr) {
      toast.error('Failed to clear')
      return
    }

    setMarkupLines(prev => prev.filter(l => !ids.includes(l.id)))
    toast.success('All markup cleared')
  }

  // Visual URL — prefer visual_url, fall back to nothing (no raw DXF rendering)
  const visualUrl = drawing?.visual_url || null
  const hasVisual = !!visualUrl

  // Determine if drawing mode or calibration mode should block panning
  const blockPan = drawMode || calibrating

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-3">
        <Loader2 size={32} className="text-blue-500 animate-spin" />
        <p className="text-sm text-slate-500">Loading drawing...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-3">
        <AlertCircle size={32} className="text-red-400" />
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={() => navigate(-1)} className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg">
          Go Back
        </button>
      </div>
    )
  }

  if (!hasVisual) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-4">
        <AlertCircle size={32} className="text-amber-400" />
        <p className="text-sm text-slate-600 font-medium">No visual drawing uploaded</p>
        <p className="text-xs text-slate-400 max-w-sm text-center">
          Go to Programme Setup and upload a PNG/JPG of the issued drawing before marking up progress.
        </p>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/programme/setup/${drawingId}`)} className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg">
            Go to Setup
          </button>
          <button onClick={() => navigate('/app/programme')} className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg">
            Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <header className="h-12 flex items-center justify-between px-4 bg-white border-b border-slate-200 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/app/programme')} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <ArrowLeft size={18} className="text-slate-600" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-slate-900">{drawing?.name || 'Drawing Viewer'}</h1>
            <p className="text-[11px] text-slate-400">Programme Drawing Viewer</p>
          </div>
        </div>

        {/* Activity selector */}
        <div className="flex items-center gap-3">
          {activities.length > 0 && (
            <select
              value={selectedActivity}
              onChange={e => setSelectedActivity(e.target.value)}
              className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-400 max-w-[200px]"
            >
              {activities.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      {/* Activity info bar */}
      {currentActivity && (
        <div className="h-10 flex items-center gap-4 px-4 bg-slate-50 border-b border-slate-200 shrink-0 text-xs">
          <span className="font-medium text-slate-700">{currentActivity.name}</span>
          <span className="text-slate-400">
            Baseline: <strong className="text-slate-600">{currentActivity.baseline_length_metres}m</strong>
          </span>
          <span className="text-slate-400">
            Installed: <strong className="text-slate-600">{Math.round(progress.installedLength * 100) / 100}m</strong>
          </span>
          <div className="flex items-center gap-2 flex-1 max-w-[200px]">
            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all ${
                  progress.percentage >= 100 ? 'bg-green-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(100, progress.percentage)}%` }}
              />
            </div>
            <span className="text-slate-600 font-semibold tabular-nums">{progress.percentage}%</span>
          </div>
          {metresPerPercent && (
            <span className="text-slate-400 ml-auto">
              Scale: {metresPerPercent.toFixed(3)} m/%
            </span>
          )}
        </div>
      )}

      {/* Calibration prompt bar */}
      {!calibration && !calibrating && (
        <div className="flex items-center gap-3 px-4 py-2 bg-amber-50 border-b border-amber-200 shrink-0">
          <Ruler size={14} className="text-amber-600 shrink-0" />
          <p className="text-xs text-amber-700 font-medium flex-1">
            Scale not set — calibrate before drawing markup so lengths are accurate.
          </p>
          <button
            onClick={() => { setCalibrating(true); setCalPoints([]); setCalDistanceInput('') }}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Set Scale
          </button>
        </div>
      )}

      {/* Calibration mode bar */}
      {calibrating && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-blue-50 border-b border-blue-200 shrink-0">
          <Ruler size={14} className="text-blue-600 shrink-0" />
          {calPoints.length < 2 ? (
            <p className="text-xs text-blue-700 font-medium flex-1">
              Click point {calPoints.length + 1} of 2 on a known dimension (e.g. two gridlines)
              {calPoints.length === 1 && ' — click the second point'}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 flex-1">
              {/* Drawing scale presets */}
              <p className="text-xs text-blue-700 font-medium shrink-0">Drawing scale:</p>
              <div className="flex items-center gap-1">
                {[
                  { label: '1:1', scale: 1 },
                  { label: '1:5', scale: 5 },
                  { label: '1:10', scale: 10 },
                  { label: '1:20', scale: 20 },
                  { label: '1:50', scale: 50 },
                  { label: '1:100', scale: 100 },
                  { label: '1:200', scale: 200 },
                  { label: '1:500', scale: 500 },
                ].map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => setCalScale(preset.scale)}
                    className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                      calScale === preset.scale
                        ? 'bg-blue-500 text-white'
                        : 'bg-white border border-blue-200 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Dimension input — what does the drawing say between your two points? */}
              <p className="text-xs text-blue-700 font-medium shrink-0 ml-2">Dimension on drawing:</p>
              <input
                type="number"
                step="any"
                min="1"
                value={calDimInput}
                onChange={e => setCalDimInput(e.target.value)}
                placeholder="e.g. 7200"
                className="w-20 px-2 py-1 bg-white border border-blue-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-400"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') confirmCalibrationWithScale() }}
              />
              <span className="text-[10px] text-blue-600">mm</span>

              {/* Calculated real distance */}
              {calScale && calDimInput && (
                <span className="text-xs text-green-600 font-semibold ml-1">
                  = {(parseFloat(calDimInput) * calScale / 1000).toFixed(2)}m real
                </span>
              )}

              <button
                onClick={confirmCalibrationWithScale}
                disabled={!calScale || !calDimInput}
                className={`px-3 py-1.5 text-white text-xs font-semibold rounded-lg transition-colors ml-1 ${
                  calScale && calDimInput ? 'bg-blue-500 hover:bg-blue-600' : 'bg-slate-300 cursor-not-allowed'
                }`}
              >
                Confirm
              </button>
            </div>
          )}
          <button onClick={cancelCalibration} className="p-1 text-blue-400 hover:text-blue-600 transition-colors">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main drawing area */}
      <div className="flex-1 relative overflow-hidden">
        <TransformWrapper
          initialScale={0.3}
          minScale={0.1}
          maxScale={30}
          centerOnInit
          wheel={{ step: 0.08 }}
          panning={{ disabled: blockPan }}
        >
          {({ zoomIn, zoomOut }) => (
          <>
          {/* Zoom controls */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
            <button onClick={() => zoomIn()} className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors">
              <ZoomIn size={16} className="text-slate-600" />
            </button>
            <button onClick={() => zoomOut()} className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors">
              <ZoomOut size={16} className="text-slate-600" />
            </button>
          </div>

          {/* Calibration re-do button */}
          {calibration && !calibrating && (
            <button
              onClick={() => { setCalibrating(true); setCalPoints([]) }}
              className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 bg-white/90 border border-slate-200 rounded-lg text-[10px] text-slate-600 font-medium hover:bg-white transition-colors shadow-sm"
            >
              <Ruler size={12} /> Re-calibrate
            </button>
          )}

          {/* Live measurement while drawing */}
          {drawMode && currentPoints.length >= 1 && metresPerPercent && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-slate-900/80 backdrop-blur rounded-lg text-white text-sm font-semibold shadow-lg">
              Current line: {calcPolylineLengthMetres(currentPoints, metresPerPercent)}m
              <span className="text-white/50 ml-2">({currentPoints.length} points — double-click to finish)</span>
            </div>
          )}

          <TransformComponent
            wrapperStyle={{ width: '100%', height: '100%' }}
            contentStyle={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <div
              className="relative inline-block"
              style={{ cursor: blockPan ? 'crosshair' : 'grab' }}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onDoubleClick={handleDoubleClick}
            >
              {imgError ? (
                <div className="w-[800px] h-[600px] bg-white flex items-center justify-center">
                  <p className="text-slate-400 text-sm">Failed to load drawing</p>
                </div>
              ) : isPDF(visualUrl) ? (
                <PDFRenderer
                  ref={imageRef}
                  src={visualUrl}
                  alt={drawing?.name}
                  className="select-none"
                  style={{}}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImgError(true)}
                  draggable={false}
                />
              ) : (
                <img
                  ref={imageRef}
                  src={visualUrl}
                  alt={drawing?.name}
                  className="select-none"
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImgError(true)}
                  draggable={false}
                />
              )}

                  {/* SVG overlay for markup lines + calibration points */}
                  {imageLoaded && (
                    <svg
                      className="absolute inset-0 w-full h-full"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      style={{ pointerEvents: 'none' }}
                    >
                      {/* Calibration points */}
                      {calibrating && calPoints.map((pt, i) => (
                        <g key={`cal-${i}`}>
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r="0.6"
                            fill="#3B82F6"
                            stroke="white"
                            strokeWidth="0.2"
                          />
                          <text
                            x={pt.x + 1}
                            y={pt.y - 1}
                            fontSize="1.8"
                            fill="#3B82F6"
                            fontWeight="bold"
                          >
                            {i + 1}
                          </text>
                        </g>
                      ))}
                      {/* Calibration line */}
                      {calibrating && calPoints.length === 2 && (
                        <line
                          x1={calPoints[0].x}
                          y1={calPoints[0].y}
                          x2={calPoints[1].x}
                          y2={calPoints[1].y}
                          stroke="#3B82F6"
                          strokeWidth="0.3"
                          strokeDasharray="1 0.5"
                        />
                      )}

                      {/* Saved calibration indicator */}
                      {!calibrating && calibration?.point1 && calibration?.point2 && (
                        <line
                          x1={calibration.point1.x}
                          y1={calibration.point1.y}
                          x2={calibration.point2.x}
                          y2={calibration.point2.y}
                          stroke="#3B82F6"
                          strokeWidth="0.15"
                          strokeDasharray="0.8 0.4"
                          opacity="0.3"
                        />
                      )}

                      {/* Existing markup lines */}
                      {markupLines.map(line => {
                        const coords = line.coordinates || []
                        if (coords.length < 2) return null
                        const d = coords.map((pt, i) =>
                          `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`
                        ).join(' ')
                        const color = MARKUP_COLORS[line.colour]?.hex || '#FFFFFF'
                        const isCurrentActivity = line.programme_activity_id === selectedActivity
                        return (
                          <path
                            key={line.id}
                            d={d}
                            fill="none"
                            stroke={color}
                            strokeWidth={isCurrentActivity ? 0.5 : 0.25}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={isCurrentActivity ? 1 : 0.4}
                          />
                        )
                      })}

                      {/* Current drawing polyline */}
                      {currentPoints.length > 0 && (
                        <>
                          <path
                            d={currentPoints.map((pt, i) =>
                              `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`
                            ).join(' ')}
                            fill="none"
                            stroke={MARKUP_COLORS[activeColour]?.hex || '#FFFFFF'}
                            strokeWidth="0.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray="1 0.5"
                          />
                          {/* Vertex dots */}
                          {currentPoints.map((pt, i) => (
                            <circle
                              key={i}
                              cx={pt.x}
                              cy={pt.y}
                              r="0.5"
                              fill={MARKUP_COLORS[activeColour]?.hex || '#FFFFFF'}
                              stroke="white"
                              strokeWidth="0.15"
                            />
                          ))}
                        </>
                      )}
                    </svg>
                  )}
                </div>
          </TransformComponent>
          </>
          )}
        </TransformWrapper>
      </div>

      {/* Bottom toolbar */}
      <div className="h-14 flex items-center justify-between px-4 bg-white border-t border-slate-200 shrink-0 z-20">
        <div className="flex items-center gap-2">
          {/* Draw toggle */}
          <button
            onClick={() => {
              if (calibrating) {
                toast.error('Finish calibration first')
                return
              }
              setDrawMode(d => !d)
              setCurrentPoints([])
            }}
            disabled={!metresPerPercent}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              drawMode
                ? 'bg-blue-500 text-white'
                : !metresPerPercent
                  ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            title={!metresPerPercent ? 'Set scale calibration first' : ''}
          >
            <Pencil size={14} /> {drawMode ? 'Drawing' : 'Draw'}
          </button>

          {/* Colour selector */}
          {drawMode && (
            <div className="flex items-center gap-1 ml-2">
              {Object.entries(MARKUP_COLORS).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setActiveColour(key)}
                  className={`w-8 h-8 rounded-lg border-2 transition-all flex items-center justify-center ${
                    activeColour === key ? 'border-white ring-2 ring-offset-1 ring-blue-500 scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: val.hex }}
                  title={val.label}
                >
                  {activeColour === key && <Check size={14} className="text-white" />}
                </button>
              ))}
            </div>
          )}

          {/* Finish / cancel polyline */}
          {drawMode && currentPoints.length >= 2 && (
            <button
              onClick={finishPolyline}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg transition-colors ml-2"
            >
              <Check size={14} /> Done ({currentPoints.length} pts
              {metresPerPercent ? ` · ${calcPolylineLengthMetres(currentPoints, metresPerPercent)}m` : ''})
            </button>
          )}
          {drawMode && currentPoints.length > 0 && (
            <button
              onClick={() => setCurrentPoints([])}
              className="px-2 py-2 text-slate-400 hover:text-red-500 transition-colors"
              title="Cancel current line"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Running total */}
          {currentActivity && (
            <span className="text-xs text-slate-500 mr-3">
              {Math.round(progress.installedLength)}m / {currentActivity.baseline_length_metres}m
            </span>
          )}

          {/* Undo */}
          <button
            onClick={handleUndo}
            className="flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg transition-colors"
          >
            <Undo2 size={14} /> Undo
          </button>

          {/* Clear all */}
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 text-xs font-semibold rounded-lg transition-colors"
          >
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </div>
    </div>
  )
}

