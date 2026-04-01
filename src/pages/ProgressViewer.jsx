import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { ArrowLeft, ZoomIn, ZoomOut, X, Clock, Trash2, Undo2, Redo2 } from 'lucide-react'

const STATUS_COLORS = { green: '#2EA043', yellow: '#D29922', red: '#DA3633' }
const STATUS_LABELS = { green: 'Installed', yellow: 'Available', red: 'Blocked' }

export default function ProgressViewer() {
  const { drawingId } = useParams()
  const navigate = useNavigate()
  const imageRef = useRef(null)
  const cid = JSON.parse(sessionStorage.getItem('manager_data') || '{}').company_id
  const mgr = JSON.parse(sessionStorage.getItem('manager_data') || '{}')

  const [drawing, setDrawing] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [activeColour, setActiveColour] = useState(null) // null = view mode, 'green'/'yellow'/'red' = mark mode
  const [drawMode, setDrawMode] = useState('dot') // 'dot', 'line', 'polyline', 'photo'
  const [dotSize, setDotSize] = useState(16) // px diameter
  const [lineStart, setLineStart] = useState(null) // first tap for line mode
  const [polyPoints, setPolyPoints] = useState([]) // points for polyline
  const [pendingPhoto, setPendingPhoto] = useState(null) // { x, y } waiting for photo upload
  const [selectedItem, setSelectedItem] = useState(null)
  const [history, setHistory] = useState([])
  const [undoStack, setUndoStack] = useState([]) // array of item ids that were placed
  const [redoStack, setRedoStack] = useState([]) // array of items that were undone
  const [photoLightbox, setPhotoLightbox] = useState(null) // url for enlarged photo
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    loadData()
    const channel = supabase
      .channel(`progress-${drawingId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'progress_items', filter: `drawing_id=eq.${drawingId}` },
        () => { loadItems() }
      ).subscribe((status) => { setIsLive(status === 'SUBSCRIBED') })
    return () => { supabase.removeChannel(channel) }
  }, [drawingId])

  async function loadData() {
    setLoading(true)
    const { data: d } = await supabase.from('progress_drawings').select('*').eq('id', drawingId).single()
    if (!d) { navigate('/app/progress'); return }
    setDrawing(d)
    await loadItems()
    setLoading(false)
  }

  async function loadItems() {
    const { data } = await supabase.from('progress_items').select('*').eq('drawing_id', drawingId).order('item_number')
    setItems(data || [])
  }

  // Place item on tap
  async function handleDrawingTap(e) {
    if (!imageRef.current) return
    const rect = imageRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    if (x < 0 || x > 100 || y < 0 || y > 100) return

    // Photo pin mode — doesn't need a colour selected
    if (drawMode === 'photo') {
      setPendingPhoto({ x, y })
      return
    }

    if (!activeColour) return

    if (drawMode === 'line') {
      if (!lineStart) {
        setLineStart({ x, y })
        return
      }
      await placeLineItem(lineStart.x, lineStart.y, x, y)
      setLineStart(null)
      return
    }

    if (drawMode === 'polyline') {
      setPolyPoints(prev => [...prev, { x, y }])
      return
    }

    // Dot mode
    await placeDotItem(x, y)
  }

  async function finishPolyline() {
    if (polyPoints.length < 2) { setPolyPoints([]); return }
    const nextNum = items.length > 0 ? Math.max(...items.map(i => i.item_number)) + 1 : 1
    const midX = polyPoints.reduce((s, p) => s + p.x, 0) / polyPoints.length
    const midY = polyPoints.reduce((s, p) => s + p.y, 0) / polyPoints.length
    const polyData = JSON.stringify({ points: polyPoints })

    const { data, error } = await supabase.from('progress_items').insert({
      company_id: cid, drawing_id: drawingId, item_number: nextNum,
      pin_x: midX, pin_y: midY, status: activeColour,
      label: 'polyline', notes: polyData,
      created_by: mgr.name, updated_by: mgr.name,
    }).select().single()

    if (error) { toast.error('Failed to save polyline'); setPolyPoints([]); return }

    await supabase.from('progress_item_history').insert({
      item_id: data.id, company_id: cid, drawing_id: drawingId,
      previous_status: null, new_status: activeColour,
      changed_by: mgr.id, changed_by_name: mgr.name,
    })
    setPolyPoints([])
    setUndoStack(prev => [...prev, data.id])
    setRedoStack([])
    loadItems()
  }

  async function handlePhotoUpload(file) {
    if (!pendingPhoto || !file) return
    const filePath = `${cid || 'default'}/${drawingId}/${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage.from('progress-photos').upload(filePath, file, { contentType: file.type })
    if (upErr) { toast.error('Failed to upload photo'); return }
    const { data: urlData } = supabase.storage.from('progress-photos').getPublicUrl(filePath)

    const nextNum = items.length > 0 ? Math.max(...items.map(i => i.item_number)) + 1 : 1
    const now = new Date()
    const timestamp = now.toLocaleDateString('en-GB') + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    const { data, error } = await supabase.from('progress_items').insert({
      company_id: cid, drawing_id: drawingId, item_number: nextNum,
      pin_x: pendingPhoto.x, pin_y: pendingPhoto.y, status: 'green',
      label: 'photo', notes: timestamp, photo_url: urlData.publicUrl,
      created_by: mgr.name, updated_by: mgr.name,
    }).select().single()

    if (error) { toast.error('Failed to save photo pin'); setPendingPhoto(null); return }

    await supabase.from('progress_item_history').insert({
      item_id: data.id, company_id: cid, drawing_id: drawingId,
      previous_status: null, new_status: 'green',
      changed_by: mgr.id, changed_by_name: mgr.name,
      notes: 'Photo added', photo_url: urlData.publicUrl,
    })
    setPendingPhoto(null)
    toast.success('Photo pinned')
    setUndoStack(prev => [...prev, data.id])
    setRedoStack([])
    loadItems()
  }

  async function placeDotItem(x, y) {
    const nextNum = items.length > 0 ? Math.max(...items.map(i => i.item_number)) + 1 : 1
    const tempItem = { id: `temp-${Date.now()}`, item_number: nextNum, pin_x: x, pin_y: y, status: activeColour, item_type: 'dot', created_by: mgr.name }
    setItems(prev => [...prev, tempItem])

    const { data, error } = await supabase.from('progress_items').insert({
      company_id: cid, drawing_id: drawingId, item_number: nextNum,
      pin_x: x, pin_y: y, status: activeColour,
      label: 'dot',
      created_by: mgr.name, updated_by: mgr.name,
    }).select().single()

    if (error) {
      toast.error('Failed to place item')
      setItems(prev => prev.filter(i => i.id !== tempItem.id))
      return
    }

    await supabase.from('progress_item_history').insert({
      item_id: data.id, company_id: cid, drawing_id: drawingId,
      previous_status: null, new_status: activeColour,
      changed_by: mgr.id, changed_by_name: mgr.name,
    })
    setItems(prev => prev.map(i => i.id === tempItem.id ? data : i))
    setUndoStack(prev => [...prev, data.id])
    setRedoStack([])
  }

  async function placeLineItem(x1, y1, x2, y2) {
    const nextNum = items.length > 0 ? Math.max(...items.map(i => i.item_number)) + 1 : 1
    // Store line as: pin_x/pin_y = midpoint, notes = JSON of start/end coords
    const midX = (x1 + x2) / 2
    const midY = (y1 + y2) / 2
    const lineData = JSON.stringify({ x1, y1, x2, y2 })

    const tempItem = { id: `temp-${Date.now()}`, item_number: nextNum, pin_x: midX, pin_y: midY, status: activeColour, label: 'line', notes: lineData, created_by: mgr.name }
    setItems(prev => [...prev, tempItem])

    const { data, error } = await supabase.from('progress_items').insert({
      company_id: cid, drawing_id: drawingId, item_number: nextNum,
      pin_x: midX, pin_y: midY, status: activeColour,
      label: 'line', notes: lineData,
      created_by: mgr.name, updated_by: mgr.name,
    }).select().single()

    if (error) {
      toast.error('Failed to place line')
      setItems(prev => prev.filter(i => i.id !== tempItem.id))
      return
    }

    await supabase.from('progress_item_history').insert({
      item_id: data.id, company_id: cid, drawing_id: drawingId,
      previous_status: null, new_status: activeColour,
      changed_by: mgr.id, changed_by_name: mgr.name,
    })
    setItems(prev => prev.map(i => i.id === tempItem.id ? data : i))
  }

  async function updateItemStatus(item, newStatus) {
    if (item.status === newStatus) return
    await supabase.from('progress_items').update({
      status: newStatus, updated_at: new Date().toISOString(), updated_by: mgr.name,
    }).eq('id', item.id)

    await supabase.from('progress_item_history').insert({
      item_id: item.id, company_id: cid, drawing_id: drawingId,
      previous_status: item.status, new_status: newStatus,
      changed_by: mgr.id, changed_by_name: mgr.name,
    })

    toast.success(`Item #${item.item_number} → ${STATUS_LABELS[newStatus]}`)
    setSelectedItem(null)
    loadItems()
  }

  async function deleteItem(item) {
    if (!confirm(`Delete item #${item.item_number}?`)) return
    await supabase.from('progress_item_history').delete().eq('item_id', item.id)
    await supabase.from('progress_items').delete().eq('id', item.id)
    setSelectedItem(null)
    toast.success('Item deleted')
    loadItems()
  }

  async function handleUndo() {
    if (undoStack.length === 0) return
    const lastId = undoStack[undoStack.length - 1]
    const item = items.find(i => i.id === lastId)
    if (!item) return

    // Delete from DB
    await supabase.from('progress_item_history').delete().eq('item_id', lastId)
    await supabase.from('progress_items').delete().eq('id', lastId)

    // Move to redo stack
    setRedoStack(prev => [...prev, item])
    setUndoStack(prev => prev.slice(0, -1))
    setItems(prev => prev.filter(i => i.id !== lastId))
  }

  async function handleRedo() {
    if (redoStack.length === 0) return
    const item = redoStack[redoStack.length - 1]
    const nextNum = items.length > 0 ? Math.max(...items.map(i => i.item_number)) + 1 : 1

    const { data, error } = await supabase.from('progress_items').insert({
      company_id: cid, drawing_id: drawingId, item_number: nextNum,
      pin_x: item.pin_x, pin_y: item.pin_y, status: item.status,
      label: item.label, notes: item.notes, photo_url: item.photo_url,
      created_by: mgr.name, updated_by: mgr.name,
    }).select().single()

    if (error) { toast.error('Redo failed'); return }

    await supabase.from('progress_item_history').insert({
      item_id: data.id, company_id: cid, drawing_id: drawingId,
      previous_status: null, new_status: item.status,
      changed_by: mgr.id, changed_by_name: mgr.name, notes: 'Redo',
    })

    setRedoStack(prev => prev.slice(0, -1))
    setUndoStack(prev => [...prev, data.id])
    loadItems()
  }

  async function loadItemHistory(itemId) {
    const { data } = await supabase.from('progress_item_history').select('*').eq('item_id', itemId).order('changed_at', { ascending: false })
    setHistory(data || [])
  }

  const total = items.length
  const counts = { green: 0, yellow: 0, red: 0 }
  items.forEach(i => { if (counts[i.status] !== undefined) counts[i.status]++ })

  if (loading) return <div className="min-h-dvh flex items-center justify-center bg-slate-100"><div className="animate-spin w-8 h-8 border-2 border-[#1B6FC8] border-t-transparent rounded-full" /></div>

  const isMarking = activeColour !== null || drawMode === 'photo'

  return (
    <>
    {/* Photo lightbox */}
    {photoLightbox && (
      <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4" onClick={() => setPhotoLightbox(null)}>
        <img src={photoLightbox} alt="Enlarged" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        <button onClick={() => setPhotoLightbox(null)} className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white hover:bg-white/20">
          <X size={24} />
        </button>
      </div>
    )}

    <div className="min-h-dvh bg-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-[#0D1526] text-white px-3 py-2 flex items-center justify-between shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/app/progress')} className="p-1.5 hover:bg-white/10 rounded-lg"><ArrowLeft size={18} /></button>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{drawing?.name}</p>
            <p className="text-[10px] text-white/40 truncate">{drawing?.drawing_number} {drawing?.revision && `Rev ${drawing.revision}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isLive && <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-1" title="Live" />}
          <button onClick={handleUndo} disabled={undoStack.length === 0}
            className={`p-2 rounded-lg transition-colors ${undoStack.length > 0 ? 'hover:bg-white/10 text-white' : 'text-white/20'}`} title="Undo">
            <Undo2 size={16} />
          </button>
          <button onClick={handleRedo} disabled={redoStack.length === 0}
            className={`p-2 rounded-lg transition-colors ${redoStack.length > 0 ? 'hover:bg-white/10 text-white' : 'text-white/20'}`} title="Redo">
            <Redo2 size={16} />
          </button>
          {isMarking && (
            <button onClick={() => { setActiveColour(null); setDrawMode('dot'); setLineStart(null); setPolyPoints([]); setPendingPhoto(null) }} className="p-2 bg-red-500 rounded-lg" title="Exit mark mode">
              <X size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Stats bar */}
      {total > 0 && (
        <div className="bg-white border-b border-[#E2E6EA] px-3 py-2 flex items-center gap-3 shrink-0">
          <div className="flex h-2.5 flex-1 rounded-full overflow-hidden bg-[#F5F6F8] min-w-[80px]">
            {Object.entries(counts).filter(([,v]) => v > 0).map(([status, count]) => (
              <div key={status} style={{ width: `${(count / total) * 100}%`, backgroundColor: STATUS_COLORS[status] }} />
            ))}
          </div>
          <div className="flex gap-2 text-[10px] text-[#6B7A99] shrink-0">
            {Object.entries(counts).map(([status, count]) => (
              <span key={status} className="flex items-center gap-1 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
                {count > 0 ? `${Math.round((count / total) * 100)}%` : '0%'} ({count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Colour selector bar - always visible */}
      <div className="bg-white border-b border-[#E2E6EA] px-3 py-2 flex items-center gap-2 shrink-0 flex-wrap">
        {/* Mode toggle */}
        <div className="flex bg-[#F5F6F8] rounded-md p-0.5 mr-1">
          {[
            { id: 'dot', label: 'Dot' },
            { id: 'line', label: 'Line' },
            { id: 'polyline', label: 'Poly' },
            { id: 'photo', label: '📷' },
          ].map(m => (
            <button key={m.id} onClick={() => { setDrawMode(m.id); setLineStart(null); setPolyPoints([]); setPendingPhoto(null) }}
              className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors ${drawMode === m.id ? 'bg-white shadow-sm text-[#1A1A2E]' : 'text-[#6B7A99]'}`}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Colour buttons */}
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <button key={status} onClick={() => { setActiveColour(activeColour === status ? null : status); setLineStart(null) }}
            className={`w-8 h-8 rounded-full border-2 transition-all ${activeColour === status ? 'border-[#1A1A2E] scale-110 shadow-md' : 'border-[#E2E6EA] hover:border-[#1A1A2E]'}`}
            style={{ backgroundColor: color }}
            title={STATUS_LABELS[status]} />
        ))}

        {/* Size slider - dot mode only */}
        {drawMode === 'dot' && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[9px] text-[#B0B8C9]">Size</span>
            <input type="range" min="6" max="40" value={dotSize} onChange={e => setDotSize(Number(e.target.value))}
              className="w-16 h-1 accent-[#1B6FC8]" />
            <span className="text-[9px] text-[#6B7A99] w-5 text-right">{dotSize}</span>
          </div>
        )}

        {/* Line width slider - line mode only */}
        {drawMode === 'line' && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[9px] text-[#B0B8C9]">Width</span>
            <input type="range" min="2" max="12" value={dotSize > 12 ? 4 : dotSize} onChange={e => setDotSize(Number(e.target.value))}
              className="w-16 h-1 accent-[#1B6FC8]" />
          </div>
        )}

        {/* Finish polyline button */}
        {drawMode === 'polyline' && polyPoints.length >= 2 && (
          <button onClick={finishPolyline} className="px-3 py-1 bg-[#1B6FC8] text-white text-[10px] font-semibold rounded-md hover:bg-[#1558A0] transition-colors">
            Finish ({polyPoints.length} pts)
          </button>
        )}

        {/* Help text */}
        {(isMarking || drawMode === 'photo') && (
          <span className="text-[10px] text-[#1B6FC8]">
            {drawMode === 'photo' ? 'Tap to drop a photo pin'
              : drawMode === 'polyline' ? `Tap points then Finish (${polyPoints.length} pts)`
              : drawMode === 'line' ? (lineStart ? 'Tap end point' : 'Tap start of line')
              : 'Tap to place'}
          </span>
        )}
      </div>

      {/* Drawing viewer */}
      <div className="flex-1 overflow-hidden bg-slate-200 relative">
        {/* Click overlay for marking */}
        {isMarking && (
          <div className="absolute inset-0 z-30" style={{ cursor: 'crosshair' }} onClick={handleDrawingTap} />
        )}

        <TransformWrapper
          initialScale={1}
          minScale={0.3}
          maxScale={10}
          disabled={isMarking}
          panning={{ disabled: isMarking, velocityDisabled: false }}
          pinch={{ disabled: isMarking }}
          wheel={{ disabled: isMarking, step: 0.08, smoothStep: 0.004 }}
          doubleClick={{ disabled: true }}
          velocityAnimation={{ sensitivity: 1, animationTime: 200 }}
        >
          {({ zoomIn, zoomOut }) => (
            <>
              {!isMarking && (
                <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1">
                  <button onClick={() => zoomIn()} className="w-9 h-9 bg-white border border-slate-300 rounded-lg shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 active:bg-slate-100"><ZoomIn size={16} /></button>
                  <button onClick={() => zoomOut()} className="w-9 h-9 bg-white border border-slate-300 rounded-lg shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 active:bg-slate-100"><ZoomOut size={16} /></button>
                </div>
              )}

              <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%', touchAction: 'none' }}
                contentStyle={{ width: '100%', touchAction: 'none' }}
              >
                <div className="relative inline-block">
                  <img ref={imageRef} src={drawing?.image_url} alt={drawing?.name}
                    className="max-w-none select-none" style={{ width: '100%', minWidth: '800px' }}
                    onLoad={() => setImageLoaded(true)} draggable={false} />

                  {/* Items: dots, lines, polylines, photos */}
                  {imageLoaded && items.map(item => {
                    const color = STATUS_COLORS[item.status] || '#B0B8C9'
                    const clickHandler = (e) => { e.stopPropagation(); if (!isMarking) { setSelectedItem(item); loadItemHistory(item.id) } }

                    // Line
                    if (item.label === 'line' && item.notes) {
                      try {
                        const { x1, y1, x2, y2 } = JSON.parse(item.notes)
                        return (
                          <svg key={item.id} className="absolute top-0 left-0 w-full h-full z-10 pointer-events-none">
                            <line x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`}
                              stroke={color} strokeWidth={dotSize > 12 ? 4 : dotSize} strokeLinecap="round" strokeOpacity="0.6"
                              style={{ cursor: 'pointer', pointerEvents: isMarking ? 'none' : 'stroke' }} onClick={clickHandler} />
                          </svg>
                        )
                      } catch { return null }
                    }

                    // Polyline — render as connected line segments
                    if (item.label === 'polyline' && item.notes) {
                      try {
                        const { points } = JSON.parse(item.notes)
                        return (
                          <svg key={item.id} className="absolute top-0 left-0 w-full h-full z-10 pointer-events-none">
                            {points.map((p, idx) => {
                              if (idx === 0) return null
                              const prev = points[idx - 1]
                              return <line key={idx} x1={`${prev.x}%`} y1={`${prev.y}%`} x2={`${p.x}%`} y2={`${p.y}%`}
                                stroke={color} strokeWidth={dotSize > 12 ? 4 : dotSize} strokeLinecap="round" strokeOpacity="0.6"
                                style={{ cursor: 'pointer', pointerEvents: isMarking ? 'none' : 'stroke' }} onClick={clickHandler} />
                            })}
                          </svg>
                        )
                      } catch { return null }
                    }

                    // Photo pin
                    if (item.label === 'photo') {
                      return (
                        <button key={item.id} onClick={clickHandler}
                          className="absolute -translate-x-1/2 -translate-y-1/2 z-10 transition-transform hover:scale-125"
                          style={{ left: `${item.pin_x}%`, top: `${item.pin_y}%`, pointerEvents: isMarking ? 'none' : 'auto' }}>
                          {item.photo_url ? (
                            <img src={item.photo_url} alt="" className="w-6 h-6 rounded-full object-cover border-2 border-white shadow-md" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-[#1B6FC8] border-2 border-white shadow-md flex items-center justify-center text-white text-[8px]">📷</div>
                          )}
                        </button>
                      )
                    }

                    // Default: dot
                    return (
                      <button key={item.id} onClick={clickHandler}
                        className="absolute -translate-x-1/2 -translate-y-1/2 z-10 transition-transform hover:scale-150"
                        style={{ left: `${item.pin_x}%`, top: `${item.pin_y}%`, pointerEvents: isMarking ? 'none' : 'auto' }}>
                        <div className="rounded-full border border-white/60"
                          style={{ width: `${dotSize}px`, height: `${dotSize}px`, backgroundColor: `${color}99` }} />
                      </button>
                    )
                  })}

                  {/* Line start indicator */}
                  {lineStart && (
                    <div className="absolute -translate-x-1/2 -translate-y-1/2 z-20 animate-pulse"
                      style={{ left: `${lineStart.x}%`, top: `${lineStart.y}%` }}>
                      <div className="w-3 h-3 rounded-full border-2 border-white shadow-lg" style={{ backgroundColor: STATUS_COLORS[activeColour] }} />
                    </div>
                  )}

                  {/* Polyline preview */}
                  {polyPoints.length > 0 && (
                    <svg className="absolute top-0 left-0 w-full h-full z-15 pointer-events-none">
                      {polyPoints.map((p, i) => {
                        if (i === 0) return null
                        const prev = polyPoints[i - 1]
                        return <line key={i} x1={`${prev.x}%`} y1={`${prev.y}%`} x2={`${p.x}%`} y2={`${p.y}%`}
                          stroke={STATUS_COLORS[activeColour] || '#1B6FC8'} strokeWidth="3" strokeLinecap="round" strokeOpacity="0.8" strokeDasharray="6 3" />
                      })}
                      {polyPoints.map((p, i) => (
                        <circle key={`c${i}`} cx={`${p.x}%`} cy={`${p.y}%`} r="4" fill="white" stroke={STATUS_COLORS[activeColour] || '#1B6FC8'} strokeWidth="2" />
                      ))}
                    </svg>
                  )}

                  {/* Pending photo pin */}
                  {pendingPhoto && (
                    <div className="absolute -translate-x-1/2 -translate-y-1/2 z-20 animate-bounce"
                      style={{ left: `${pendingPhoto.x}%`, top: `${pendingPhoto.y}%` }}>
                      <div className="w-8 h-8 rounded-full bg-[#1B6FC8] border-2 border-white shadow-lg flex items-center justify-center text-white text-xs">📷</div>
                    </div>
                  )}
                </div>
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>

      {/* Photo upload popup */}
      {pendingPhoto && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E2E6EA] shadow-xl p-4">
          <p className="text-xs text-[#6B7A99] text-center mb-3">Take a photo or choose from gallery</p>
          <div className="flex gap-2 justify-center">
            <label className="flex items-center gap-2 px-5 py-3 bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-sm font-medium rounded-lg cursor-pointer transition-colors">
              📷 Take Photo
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { if (e.target.files[0]) handlePhotoUpload(e.target.files[0]) }} />
            </label>
            <label className="flex items-center gap-2 px-5 py-3 bg-[#F5F6F8] hover:bg-[#E2E6EA] text-[#1A1A2E] text-sm font-medium rounded-lg cursor-pointer transition-colors border border-[#E2E6EA]">
              Upload Image
              <input type="file" accept="image/*" className="hidden"
                onChange={e => { if (e.target.files[0]) handlePhotoUpload(e.target.files[0]) }} />
            </label>
          </div>
          <button onClick={() => setPendingPhoto(null)} className="w-full mt-2 py-2 text-xs text-[#6B7A99] hover:bg-[#F5F6F8] rounded-md">Cancel</button>
        </div>
      )}

      {/* Item detail panel */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedItem(null)}>
          <div className="bg-white w-full sm:max-w-md max-h-[70vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-[#E2E6EA] px-4 py-3 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: STATUS_COLORS[selectedItem.status] }} />
                <h3 className="text-base font-bold text-[#1A1A2E]">Item #{selectedItem.item_number}</h3>
                <span className="text-[10px] px-2 py-0.5 rounded font-semibold capitalize"
                  style={{ backgroundColor: `${STATUS_COLORS[selectedItem.status]}20`, color: STATUS_COLORS[selectedItem.status] }}>
                  {STATUS_LABELS[selectedItem.status]}
                </span>
              </div>
              <button onClick={() => setSelectedItem(null)} className="p-1 text-[#6B7A99] hover:text-[#1A1A2E]"><X size={18} /></button>
            </div>

            <div className="p-4 space-y-4">
              {/* Photo */}
              {selectedItem.photo_url && (
                <img src={selectedItem.photo_url} alt="Photo" className="w-full h-40 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setPhotoLightbox(selectedItem.photo_url)} />
              )}
              {selectedItem.label === 'photo' && selectedItem.notes && (
                <p className="text-[10px] text-[#6B7A99]">📷 Taken: {selectedItem.notes}</p>
              )}

              {/* Change status */}
              <div>
                <p className="text-[10px] text-[#6B7A99] uppercase font-semibold mb-2">Change Status</p>
                <div className="flex gap-3">
                  {Object.entries(STATUS_COLORS).map(([status, color]) => (
                    <button key={status} onClick={() => updateItemStatus(selectedItem, status)}
                      className="flex flex-col items-center gap-1 group">
                      <div className={`w-10 h-10 rounded-full border-2 transition-all ${selectedItem.status === status ? 'border-[#1A1A2E] scale-110' : 'border-[#E2E6EA] group-hover:border-[#1A1A2E]'}`}
                        style={{ backgroundColor: color }} />
                      <span className="text-[9px] text-[#6B7A99] capitalize">{STATUS_LABELS[status]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Meta */}
              <div className="text-xs text-[#6B7A99] space-y-1">
                {selectedItem.label && <p><span className="font-medium text-[#1A1A2E]">Label:</span> {selectedItem.label}</p>}
                {selectedItem.notes && <p><span className="font-medium text-[#1A1A2E]">Notes:</span> {selectedItem.notes}</p>}
                {selectedItem.stl_date && (
                  <p>
                    <span className="font-medium text-[#1A1A2E]">STL Date:</span> {new Date(selectedItem.stl_date).toLocaleDateString('en-GB')}
                    {new Date(selectedItem.stl_date) < new Date() && selectedItem.status !== 'green' && (
                      <span className="ml-1 text-[10px] bg-red-100 text-[#DA3633] px-1.5 py-0.5 rounded font-bold">STL MISSED</span>
                    )}
                  </p>
                )}
                <p>Created by {selectedItem.created_by} · {new Date(selectedItem.created_at).toLocaleString()}</p>
              </div>

              {/* History */}
              {history.length > 0 && (
                <div>
                  <p className="text-[10px] text-[#6B7A99] uppercase font-semibold mb-2 flex items-center gap-1"><Clock size={10} /> History</p>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {history.map(h => (
                      <div key={h.id} className="flex items-center gap-2 text-[11px] text-[#6B7A99]">
                        {h.previous_status && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[h.previous_status] || '#B0B8C9' }} />}
                        <span>→</span>
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[h.new_status] }} />
                        <span className="flex-1">{h.changed_by_name} · {new Date(h.changed_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => deleteItem(selectedItem)} className="flex items-center gap-1.5 px-3 py-2 text-xs text-[#DA3633] hover:bg-red-50 rounded-md transition-colors">
                <Trash2 size={12} /> Delete Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
