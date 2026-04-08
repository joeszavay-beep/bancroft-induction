import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/storage'
import { parseDXF, entitiesToSVGPaths, calculateLayerLength } from '../lib/dxfParser'
import PDFRenderer, { isPDF } from '../components/PDFRenderer'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Layers, Plus, Check, ChevronRight,
  ZoomIn, ZoomOut, Loader2, AlertCircle, Trash2, Upload, Image as ImageIcon
} from 'lucide-react'

export default function ProgrammeSetup() {
  const { drawingId } = useParams()
  const navigate = useNavigate()
  const managerData = JSON.parse(getSession('manager_data') || '{}')

  const [drawing, setDrawing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState(null)

  // DXF data
  const [dxfData, setDxfData] = useState(null)
  const [layerVisibility, setLayerVisibility] = useState({})
  const [selectedLayer, setSelectedLayer] = useState(null)
  const [layerLengths, setLayerLengths] = useState({})

  // Visual upload
  const [uploadingVisual, setUploadingVisual] = useState(false)
  const [visualPreviewUrl, setVisualPreviewUrl] = useState(null)

  // Activity form
  const [activityName, setActivityName] = useState('')
  const [packageName, setPackageName] = useState('')
  const [floor, setFloor] = useState('')
  const [zone, setZone] = useState('')
  const [subcontractor, setSubcontractor] = useState('')
  const [plannedStart, setPlannedStart] = useState('')
  const [plannedCompletion, setPlannedCompletion] = useState('')
  const [saving, setSaving] = useState(false)

  // Created activities
  const [createdActivities, setCreatedActivities] = useState([])
  const [layerPanelOpen, setLayerPanelOpen] = useState(true)

  useEffect(() => { loadDrawing() }, [drawingId])

  async function loadDrawing() {
    setLoading(true)
    try {
      const { data, error: fetchErr } = await supabase
        .from('design_drawings')
        .select('*')
        .eq('id', drawingId)
        .single()

      if (fetchErr || !data) {
        setError('Drawing not found')
        setLoading(false)
        return
      }

      setDrawing(data)
      if (data.visual_url) setVisualPreviewUrl(data.visual_url)
      await parseDXFFile(data.file_url)
    } catch (err) {
      console.error('loadDrawing error:', err)
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

      // Initialize layer visibility
      const vis = {}
      for (const layer of parsed.layers) {
        vis[layer.name] = layer.visible
      }
      setLayerVisibility(vis)

      // Calculate lengths for all layers
      const lengths = {}
      for (const layer of parsed.layers) {
        const entities = parsed.entitiesByLayer[layer.name] || []
        lengths[layer.name] = calculateLayerLength(entities, parsed.scaleFactor)
      }
      setLayerLengths(lengths)
    } catch (err) {
      console.error('DXF parse error:', err)
      setError('Failed to parse DXF file: ' + err.message)
    }
    setParsing(false)
  }

  // Upload a visual drawing (PNG/JPG/PDF)
  async function handleUploadVisual(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split('.').pop().toLowerCase()
    if (!['png', 'jpg', 'jpeg', 'pdf'].includes(ext)) {
      toast.error('Please upload a PNG, JPG or PDF file')
      return
    }

    setUploadingVisual(true)
    try {
      const storagePath = `programme/${drawing.project_id}/${crypto.randomUUID()}.${ext}`
      const contentType = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`

      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(storagePath, file, { contentType })
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`)

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(storagePath)
      const publicUrl = urlData.publicUrl

      // Save to design_drawings.visual_url
      const { error: updateErr } = await supabase
        .from('design_drawings')
        .update({ visual_url: publicUrl })
        .eq('id', drawingId)

      if (updateErr) throw new Error(updateErr.message)

      setVisualPreviewUrl(publicUrl)
      setDrawing(prev => ({ ...prev, visual_url: publicUrl }))
      toast.success('Visual drawing uploaded')
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Failed to upload visual drawing')
    }
    setUploadingVisual(false)
    e.target.value = ''
  }

  // Compute SVG paths grouped by layer
  const svgPathsByLayer = useMemo(() => {
    if (!dxfData) return {}
    const result = {}
    for (const [layerName, entities] of Object.entries(dxfData.entitiesByLayer)) {
      result[layerName] = entitiesToSVGPaths(entities, dxfData.bounds)
    }
    return result
  }, [dxfData])

  // SVG viewBox
  const viewBox = useMemo(() => {
    if (!dxfData?.bounds) return '0 0 1000 1000'
    const { minX, minY, maxX, maxY } = dxfData.bounds
    const w = maxX - minX || 1000
    const h = maxY - minY || 1000
    const pad = Math.max(w, h) * 0.05
    return `${minX - pad} ${-(maxY + pad)} ${w + pad * 2} ${h + pad * 2}`
  }, [dxfData])

  function toggleLayer(layerName) {
    setLayerVisibility(prev => ({ ...prev, [layerName]: !prev[layerName] }))
  }

  function selectLayer(layerName) {
    setSelectedLayer(prev => prev === layerName ? null : layerName)
    // Pre-fill activity name from layer name
    if (selectedLayer !== layerName) {
      setActivityName(layerName.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
    }
  }

  async function handleCreateActivity() {
    if (!selectedLayer || !activityName.trim()) {
      toast.error('Select a layer and enter an activity name')
      return
    }

    const layerLen = layerLengths[selectedLayer]
    if (!layerLen || layerLen.totalLengthMetres === 0) {
      toast.error('Selected layer has no measurable geometry')
      return
    }

    setSaving(true)
    try {
      const { data, error: insertErr } = await supabase.from('programme_activities').insert({
        company_id: managerData.company_id,
        project_id: drawing.project_id,
        drawing_id: drawingId,
        activity_name: activityName.trim(),
        package: packageName.trim() || null,
        floor: floor.trim() || null,
        zone: zone.trim() || null,
        subcontractor: subcontractor.trim() || null,
        baseline_length_metres: layerLen.totalLengthMetres,
        baseline_layer: selectedLayer,
        planned_start: plannedStart || null,
        planned_completion: plannedCompletion || null,
        created_by: managerData.name || 'Unknown',
      }).select().single()

      if (insertErr) throw new Error(insertErr.message)

      setCreatedActivities(prev => [...prev, { ...data, _entityCount: layerLen.entityCount }])
      toast.success(`Activity "${activityName}" created — ${layerLen.totalLengthMetres}m baseline`)

      // Reset form
      setActivityName('')
      setPackageName('')
      setFloor('')
      setZone('')
      setSubcontractor('')
      setPlannedStart('')
      setPlannedCompletion('')
      setSelectedLayer(null)
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Failed to create activity')
    }
    setSaving(false)
  }

  async function handleDeleteActivity(actId) {
    const { error: delErr } = await supabase.from('programme_activities').delete().eq('id', actId)
    if (delErr) {
      toast.error('Failed to delete')
      return
    }
    setCreatedActivities(prev => prev.filter(a => a.id !== actId))
    toast.success('Activity deleted')
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

  const isVisualPdf = visualPreviewUrl?.toLowerCase().endsWith('.pdf')

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <header className="h-12 flex items-center justify-between px-4 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/app/programme')} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <ArrowLeft size={18} className="text-slate-600" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-slate-900">Programme Setup</h1>
            <p className="text-[11px] text-slate-400">{drawing?.name || 'Drawing'}</p>
          </div>
        </div>
        {createdActivities.length > 0 && (
          <button
            onClick={() => navigate('/app/programme')}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Check size={16} /> Done ({createdActivities.length})
          </button>
        )}
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Left panel — visual upload + layers + form */}
        <div className={`${layerPanelOpen ? 'w-80' : 'w-0'} shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden transition-all`}>
          {layerPanelOpen && (
            <>
              {/* Visual drawing upload section */}
              <div className="border-b border-slate-200 p-3 space-y-2 shrink-0">
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <ImageIcon size={13} /> Visual Drawing
                </h2>
                <p className="text-[10px] text-slate-400">
                  Upload the issued drawing (PNG/JPG/PDF) for markup
                </p>

                {visualPreviewUrl ? (
                  <div className="space-y-2">
                    {isPDF(visualPreviewUrl) ? (
                      <PDFRenderer
                        src={visualPreviewUrl}
                        alt="Visual drawing preview"
                        className="w-full h-auto max-h-40 object-contain rounded-lg border border-slate-200 bg-white"
                        style={{ maxHeight: '160px' }}
                      />
                    ) : (
                      <img
                        src={visualPreviewUrl}
                        alt="Visual drawing preview"
                        className="w-full h-auto max-h-40 object-contain rounded-lg border border-slate-200 bg-white"
                      />
                    )}
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-[10px] text-green-600 font-medium">
                        <Check size={10} /> Visual uploaded
                      </span>
                      <label className="text-[10px] text-blue-500 hover:text-blue-700 cursor-pointer font-medium">
                        Replace
                        <input type="file" accept=".png,.jpg,.jpeg,.pdf" onChange={handleUploadVisual} className="hidden" />
                      </label>
                    </div>
                  </div>
                ) : (
                  <label className={`flex items-center justify-center gap-2 w-full px-3 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                    uploadingVisual
                      ? 'border-blue-300 bg-blue-50 text-blue-500'
                      : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50 text-slate-500'
                  }`}>
                    {uploadingVisual ? (
                      <span className="flex items-center gap-2 text-xs font-medium">
                        <Loader2 size={14} className="animate-spin" /> Uploading...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 text-xs font-medium">
                        <Upload size={14} /> Upload PNG / JPG / PDF
                      </span>
                    )}
                    <input type="file" accept=".png,.jpg,.jpeg,.pdf" onChange={handleUploadVisual} disabled={uploadingVisual} className="hidden" />
                  </label>
                )}
              </div>

              {/* Layer list */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers size={13} /> DXF Layers
                  </h2>
                  <span className="text-[10px] text-slate-400">{dxfData?.layers.length || 0} layers</span>
                </div>

                {(dxfData?.layers || []).map(layer => {
                  const ll = layerLengths[layer.name]
                  const isSelected = selectedLayer === layer.name
                  return (
                    <div
                      key={layer.name}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={layerVisibility[layer.name] ?? true}
                        onChange={() => toggleLayer(layer.name)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-blue-500 focus:ring-blue-500 shrink-0"
                      />
                      <button
                        onClick={() => selectLayer(layer.name)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <p className={`text-xs font-medium truncate ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                          {layer.name}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {ll?.entityCount || 0} entities
                          {ll?.totalLengthMetres ? ` · ${ll.totalLengthMetres}m` : ''}
                        </p>
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Activity form */}
              {selectedLayer && (
                <div className="border-t border-slate-200 p-3 space-y-2 bg-slate-50 shrink-0">
                  <h3 className="text-xs font-bold text-slate-700">
                    Create Activity from "{selectedLayer}"
                  </h3>
                  <p className="text-[10px] text-blue-600 font-medium">
                    Baseline: {layerLengths[selectedLayer]?.totalLengthMetres || 0}m
                    ({layerLengths[selectedLayer]?.entityCount || 0} entities)
                  </p>

                  <input
                    type="text"
                    value={activityName}
                    onChange={e => setActivityName(e.target.value)}
                    placeholder="Activity name *"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-400"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={packageName}
                      onChange={e => setPackageName(e.target.value)}
                      placeholder="Package"
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-400"
                    />
                    <input
                      type="text"
                      value={floor}
                      onChange={e => setFloor(e.target.value)}
                      placeholder="Floor"
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-400"
                    />
                    <input
                      type="text"
                      value={zone}
                      onChange={e => setZone(e.target.value)}
                      placeholder="Zone"
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-400"
                    />
                    <input
                      type="text"
                      value={subcontractor}
                      onChange={e => setSubcontractor(e.target.value)}
                      placeholder="Subcontractor"
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Planned Start</label>
                      <input
                        type="date"
                        value={plannedStart}
                        onChange={e => setPlannedStart(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Planned Completion</label>
                      <input
                        type="date"
                        value={plannedCompletion}
                        onChange={e => setPlannedCompletion(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-400"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleCreateActivity}
                    disabled={saving || !activityName.trim()}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    Create Activity
                  </button>
                </div>
              )}

              {/* Created activities summary */}
              {createdActivities.length > 0 && (
                <div className="border-t border-slate-200 p-3 space-y-1.5 max-h-48 overflow-y-auto shrink-0">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Created Activities ({createdActivities.length})
                  </h3>
                  {createdActivities.map(act => (
                    <div key={act.id} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-green-50 border border-green-100 rounded-lg">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-green-800 truncate">{act.activity_name}</p>
                        <p className="text-[10px] text-green-600">{act.baseline_length_metres}m baseline</p>
                      </div>
                      <button
                        onClick={() => handleDeleteActivity(act.id)}
                        className="p-1 text-green-400 hover:text-red-500 transition-colors shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Toggle layer panel */}
        <button
          onClick={() => setLayerPanelOpen(p => !p)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white border border-slate-200 rounded-r-lg px-1 py-3 shadow-sm hover:bg-slate-50 transition-colors"
          style={{ left: layerPanelOpen ? '320px' : '0' }}
        >
          {layerPanelOpen ? <ChevronRight size={14} className="text-slate-400 rotate-180" /> : <ChevronRight size={14} className="text-slate-400" />}
        </button>

        {/* Drawing area — small DXF preview */}
        <div className="flex-1 bg-slate-100 relative overflow-hidden">
          <TransformWrapper
            initialScale={1}
            minScale={0.1}
            maxScale={20}
            wheel={{ step: 0.1 }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                {/* Zoom controls */}
                <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
                  <button onClick={() => zoomIn()} className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors">
                    <ZoomIn size={16} className="text-slate-600" />
                  </button>
                  <button onClick={() => zoomOut()} className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors">
                    <ZoomOut size={16} className="text-slate-600" />
                  </button>
                  <button onClick={() => resetTransform()} className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors text-[10px] font-bold text-slate-500">
                    1:1
                  </button>
                </div>

                {/* Units info */}
                {dxfData && (
                  <div className="absolute bottom-3 right-3 z-10 px-2 py-1 bg-white/90 border border-slate-200 rounded-lg text-[10px] text-slate-500">
                    Units: {dxfData.unitsLabel} · Scale: 1 unit = {dxfData.scaleFactor}m
                  </div>
                )}

                {/* DXF preview label */}
                <div className="absolute top-3 left-3 z-10 px-2 py-1 bg-white/90 border border-slate-200 rounded-lg text-[10px] text-slate-500 font-medium">
                  DXF Preview (data only)
                </div>

                <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%' }}>
                  {dxfData && (
                    <svg
                      viewBox={viewBox}
                      className="w-full h-full"
                      style={{ background: '#1a1a2e' }}
                    >
                      {Object.entries(svgPathsByLayer).map(([layerName, paths]) => {
                        if (!layerVisibility[layerName]) return null
                        const isHighlighted = selectedLayer === layerName
                        return (
                          <g key={layerName} opacity={isHighlighted ? 1 : 0.4}>
                            {paths.map((p, i) => (
                              <path
                                key={i}
                                d={p.d}
                                fill="none"
                                stroke={isHighlighted ? '#3B82F6' : (p.color || '#AAAAAA')}
                                strokeWidth={isHighlighted ? 2 : 0.5}
                                vectorEffect="non-scaling-stroke"
                              />
                            ))}
                          </g>
                        )
                      })}
                    </svg>
                  )}
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        </div>
      </div>
    </div>
  )
}
