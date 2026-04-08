import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import { parseDXF, entitiesToSVGPaths, calculateMarkupLength } from '../lib/dxfParser'
import { calculateProgress } from '../lib/progressEngine'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Layers, Pencil, Check, Undo2, Trash2, ZoomIn, ZoomOut,
  ChevronRight, ChevronDown, Loader2, AlertCircle
} from 'lucide-react'

const MARKUP_COLORS = {
  green: { hex: '#22C55E', label: 'Installed' },
  amber: { hex: '#F59E0B', label: 'In Progress' },
  red:   { hex: '#EF4444', label: 'Issue' },
}

export default function DXFViewer() {
  const { drawingId } = useParams()
  const navigate = useNavigate()
  const managerData = JSON.parse(getSession('manager_data') || '{}')
  const svgRef = useRef(null)

  const [drawing, setDrawing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState(null)

  // DXF data
  const [dxfData, setDxfData] = useState(null)
  const [layerVisibility, setLayerVisibility] = useState({})
  const [layerPanelOpen, setLayerPanelOpen] = useState(false)

  // Activities
  const [activities, setActivities] = useState([])
  const [selectedActivity, setSelectedActivity] = useState('')

  // Markup
  const [markupLines, setMarkupLines] = useState([])
  const [drawMode, setDrawMode] = useState(false)
  const [activeColour, setActiveColour] = useState('green')
  const [currentPoints, setCurrentPoints] = useState([])

  // Transform ref for coordinate conversion
  const transformRef = useRef(null)

  useEffect(() => { loadData() }, [drawingId])

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
        .eq('drawing_id', drawingId)
        .order('activity_name')
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

      // Parse DXF
      await parseDXFFile(drawingData.file_url)
    } catch (err) {
      console.error('loadData error:', err)
      setError(err.message)
    }
    setLoading(false)
  }

  async function parseDXFFile(fileUrl) {
    setParsing(true)
    try {
      const response = await fetch(fileUrl)
      if (!response.ok) throw new Error('Failed to fetch DXF file')
      const dxfText = await response.text()
      const parsed = parseDXF(dxfText)
      setDxfData(parsed)

      const vis = {}
      for (const layer of parsed.layers) {
        vis[layer.name] = layer.visible
      }
      setLayerVisibility(vis)
    } catch (err) {
      console.error('DXF parse error:', err)
      setError('Failed to parse DXF file: ' + err.message)
    }
    setParsing(false)
  }

  // SVG paths by layer
  const svgPathsByLayer = useMemo(() => {
    if (!dxfData) return {}
    const result = {}
    for (const [layerName, entities] of Object.entries(dxfData.entitiesByLayer)) {
      result[layerName] = entitiesToSVGPaths(entities, dxfData.bounds)
    }
    return result
  }, [dxfData])

  // ViewBox
  const viewBox = useMemo(() => {
    if (!dxfData?.bounds) return '0 0 1000 1000'
    const { minX, minY, maxX, maxY } = dxfData.bounds
    const w = maxX - minX || 1000
    const h = maxY - minY || 1000
    const pad = Math.max(w, h) * 0.05
    return `${minX - pad} ${-(maxY + pad)} ${w + pad * 2} ${h + pad * 2}`
  }, [dxfData])

  // Parse viewBox values
  const vbValues = useMemo(() => {
    const parts = viewBox.split(' ').map(Number)
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] }
  }, [viewBox])

  // Current activity + progress
  const currentActivity = useMemo(() =>
    activities.find(a => a.id === selectedActivity), [activities, selectedActivity])

  const activityLines = useMemo(() =>
    markupLines.filter(l => l.programme_activity_id === selectedActivity), [markupLines, selectedActivity])

  const progress = useMemo(() => {
    if (!currentActivity) return { installedLength: 0, percentage: 0, status: 'not_started' }
    return calculateProgress(currentActivity, activityLines)
  }, [currentActivity, activityLines])

  // Layer entity counts
  const layerInfo = useMemo(() => {
    if (!dxfData) return []
    return dxfData.layers.map(layer => ({
      ...layer,
      entityCount: (dxfData.entitiesByLayer[layer.name] || []).length,
      isBaseline: activities.some(a => a.baseline_layer === layer.name),
    }))
  }, [dxfData, activities])

  // Convert screen coordinates to SVG/DXF coordinates
  function screenToDXF(clientX, clientY) {
    if (!svgRef.current) return null
    const svgEl = svgRef.current
    const pt = svgEl.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svgEl.getScreenCTM()
    if (!ctm) return null
    const svgPt = pt.matrixTransform(ctm.inverse())
    return { x: svgPt.x, y: -svgPt.y } // flip Y back to DXF space
  }

  function handleSVGClick(e) {
    if (!drawMode || !selectedActivity) return

    const pt = screenToDXF(e.clientX, e.clientY)
    if (!pt) return

    setCurrentPoints(prev => [...prev, pt])
  }

  function handleSVGDoubleClick(e) {
    e.preventDefault()
    e.stopPropagation()
    if (drawMode && currentPoints.length >= 2) {
      finishPolyline()
    }
  }

  async function finishPolyline() {
    if (currentPoints.length < 2) {
      setCurrentPoints([])
      return
    }

    if (!selectedActivity || !dxfData) {
      setCurrentPoints([])
      return
    }

    const length = calculateMarkupLength(currentPoints, dxfData.scaleFactor)

    try {
      const { data, error: insertErr } = await supabase.from('markup_lines').insert({
        company_id: managerData.company_id,
        programme_activity_id: selectedActivity,
        drawing_id: drawingId,
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
    // Remove most recent line for current activity
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

  if (loading || parsing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-3">
        <Loader2 size={32} className="text-blue-500 animate-spin" />
        <p className="text-sm text-slate-500">{parsing ? 'Parsing DXF file...' : 'Loading drawing...'}</p>
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

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <header className="h-12 flex items-center justify-between px-4 bg-white border-b border-slate-200 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/app/programme')} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <ArrowLeft size={18} className="text-slate-600" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-slate-900">{drawing?.name || 'DXF Viewer'}</h1>
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
                <option key={a.id} value={a.id}>{a.activity_name}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      {/* Activity info bar */}
      {currentActivity && (
        <div className="h-10 flex items-center gap-4 px-4 bg-slate-50 border-b border-slate-200 shrink-0 text-xs">
          <span className="font-medium text-slate-700">{currentActivity.activity_name}</span>
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
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* Layer panel (left) */}
        {layerPanelOpen && (
          <div className="w-64 bg-white border-r border-slate-200 flex flex-col overflow-hidden shrink-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={13} /> Layers
              </h2>
              <button onClick={() => setLayerPanelOpen(false)} className="p-1 hover:bg-slate-100 rounded transition-colors">
                <ChevronRight size={14} className="text-slate-400 rotate-180" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {layerInfo.map(layer => (
                <label
                  key={layer.name}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors ${
                    layer.isBaseline ? 'bg-blue-50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={layerVisibility[layer.name] ?? true}
                    onChange={() => setLayerVisibility(prev => ({ ...prev, [layer.name]: !prev[layer.name] }))}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-500 focus:ring-blue-500 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs truncate ${layer.isBaseline ? 'font-medium text-blue-700' : 'text-slate-700'}`}>
                      {layer.name}
                      {layer.isBaseline && <span className="ml-1 text-[9px] text-blue-500">(baseline)</span>}
                    </p>
                    <p className="text-[10px] text-slate-400">{layer.entityCount} entities</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Main drawing area */}
        <div className="flex-1 relative overflow-hidden">
          {/* Left toolbar toggle */}
          {!layerPanelOpen && (
            <button
              onClick={() => setLayerPanelOpen(true)}
              className="absolute top-3 left-3 z-10 p-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors"
            >
              <Layers size={16} className="text-slate-600" />
            </button>
          )}

          {/* Zoom controls */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
            <ZoomButton id="zoom-in">
              <ZoomIn size={16} className="text-slate-600" />
            </ZoomButton>
            <ZoomButton id="zoom-out">
              <ZoomOut size={16} className="text-slate-600" />
            </ZoomButton>
          </div>

          <TransformWrapper
            initialScale={1}
            minScale={0.1}
            maxScale={30}
            wheel={{ step: 0.1 }}
            panning={{ disabled: drawMode }}
            ref={transformRef}
          >
            {({ zoomIn, zoomOut }) => {
              // Wire zoom buttons
              useEffect(() => {
                const inBtn = document.getElementById('zoom-in')
                const outBtn = document.getElementById('zoom-out')
                const handleIn = () => zoomIn()
                const handleOut = () => zoomOut()
                inBtn?.addEventListener('click', handleIn)
                outBtn?.addEventListener('click', handleOut)
                return () => {
                  inBtn?.removeEventListener('click', handleIn)
                  outBtn?.removeEventListener('click', handleOut)
                }
              }, [zoomIn, zoomOut])

              return (
                <TransformComponent
                  wrapperStyle={{ width: '100%', height: '100%' }}
                  contentStyle={{ width: '100%', height: '100%' }}
                >
                  {dxfData && (
                    <svg
                      ref={svgRef}
                      viewBox={viewBox}
                      className="w-full h-full"
                      style={{ background: '#1a1a2e', cursor: drawMode ? 'crosshair' : 'grab' }}
                      onClick={handleSVGClick}
                      onDoubleClick={handleSVGDoubleClick}
                    >
                      {/* DXF layers */}
                      {Object.entries(svgPathsByLayer).map(([layerName, paths]) => {
                        if (!layerVisibility[layerName]) return null
                        return (
                          <g key={layerName}>
                            {paths.map((p, i) => (
                              <path
                                key={i}
                                d={p.d}
                                fill="none"
                                stroke={p.color || '#AAAAAA'}
                                strokeWidth={0.5}
                                vectorEffect="non-scaling-stroke"
                              />
                            ))}
                          </g>
                        )
                      })}

                      {/* Existing markup lines */}
                      {markupLines.map(line => {
                        const coords = line.coordinates || []
                        if (coords.length < 2) return null
                        const d = coords.map((pt, i) =>
                          `${i === 0 ? 'M' : 'L'} ${pt.x} ${-pt.y}`
                        ).join(' ')
                        const color = MARKUP_COLORS[line.colour]?.hex || '#FFFFFF'
                        const isCurrentActivity = line.programme_activity_id === selectedActivity
                        return (
                          <path
                            key={line.id}
                            d={d}
                            fill="none"
                            stroke={color}
                            strokeWidth={isCurrentActivity ? 3 : 1.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                            opacity={isCurrentActivity ? 1 : 0.4}
                          />
                        )
                      })}

                      {/* Current drawing polyline */}
                      {currentPoints.length > 0 && (
                        <>
                          <path
                            d={currentPoints.map((pt, i) =>
                              `${i === 0 ? 'M' : 'L'} ${pt.x} ${-pt.y}`
                            ).join(' ')}
                            fill="none"
                            stroke={MARKUP_COLORS[activeColour]?.hex || '#FFFFFF'}
                            strokeWidth={3}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray="8 4"
                            vectorEffect="non-scaling-stroke"
                          />
                          {/* Vertex dots */}
                          {currentPoints.map((pt, i) => (
                            <circle
                              key={i}
                              cx={pt.x}
                              cy={-pt.y}
                              r={4}
                              fill={MARKUP_COLORS[activeColour]?.hex || '#FFFFFF'}
                              stroke="white"
                              strokeWidth={1}
                              vectorEffect="non-scaling-stroke"
                            />
                          ))}
                        </>
                      )}
                    </svg>
                  )}
                </TransformComponent>
              )
            }}
          </TransformWrapper>
        </div>
      </div>

      {/* Bottom toolbar */}
      <div className="h-14 flex items-center justify-between px-4 bg-white border-t border-slate-200 shrink-0 z-20">
        <div className="flex items-center gap-2">
          {/* Draw toggle */}
          <button
            onClick={() => {
              setDrawMode(d => !d)
              setCurrentPoints([])
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              drawMode
                ? 'bg-blue-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
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
              <Check size={14} /> Done ({currentPoints.length} pts)
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

function ZoomButton({ id, children }) {
  return (
    <button id={id} className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors">
      {children}
    </button>
  )
}
