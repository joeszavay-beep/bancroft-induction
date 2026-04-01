import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { ArrowLeft, ZoomIn, ZoomOut, X, Clock, Trash2 } from 'lucide-react'

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
  const [drawMode, setDrawMode] = useState('dot') // 'dot' or 'line'
  const [lineStart, setLineStart] = useState(null) // first tap for line mode
  const [selectedItem, setSelectedItem] = useState(null)
  const [history, setHistory] = useState([])
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
    if (!activeColour || !imageRef.current) return
    const rect = imageRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    if (x < 0 || x > 100 || y < 0 || y > 100) return

    if (drawMode === 'line') {
      if (!lineStart) {
        // First tap — set start point
        setLineStart({ x, y })
        return
      }
      // Second tap — save line from lineStart to this point
      await placeLineItem(lineStart.x, lineStart.y, x, y)
      setLineStart(null)
      return
    }

    // Dot mode
    await placeDotItem(x, y)
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

  async function loadItemHistory(itemId) {
    const { data } = await supabase.from('progress_item_history').select('*').eq('item_id', itemId).order('changed_at', { ascending: false })
    setHistory(data || [])
  }

  const total = items.length
  const counts = { green: 0, yellow: 0, red: 0 }
  items.forEach(i => { if (counts[i.status] !== undefined) counts[i.status]++ })

  if (loading) return <div className="min-h-dvh flex items-center justify-center bg-slate-100"><div className="animate-spin w-8 h-8 border-2 border-[#1B6FC8] border-t-transparent rounded-full" /></div>

  const isMarking = activeColour !== null

  return (
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
          {isMarking && (
            <button onClick={() => setActiveColour(null)} className="p-2 bg-red-500 rounded-lg" title="Exit mark mode">
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
          <button onClick={() => { setDrawMode('dot'); setLineStart(null) }}
            className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors ${drawMode === 'dot' ? 'bg-white shadow-sm text-[#1A1A2E]' : 'text-[#6B7A99]'}`}>
            Dot
          </button>
          <button onClick={() => { setDrawMode('line'); setLineStart(null) }}
            className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors ${drawMode === 'line' ? 'bg-white shadow-sm text-[#1A1A2E]' : 'text-[#6B7A99]'}`}>
            Line
          </button>
        </div>

        {/* Colour buttons */}
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <button key={status} onClick={() => { setActiveColour(activeColour === status ? null : status); setLineStart(null) }}
            className={`w-8 h-8 rounded-full border-2 transition-all ${activeColour === status ? 'border-[#1A1A2E] scale-110 shadow-md' : 'border-[#E2E6EA] hover:border-[#1A1A2E]'}`}
            style={{ backgroundColor: color }}
            title={STATUS_LABELS[status]} />
        ))}

        {/* Help text */}
        {isMarking && (
          <span className="text-[10px] text-[#1B6FC8] ml-1">
            {drawMode === 'line'
              ? (lineStart ? 'Now tap the end point' : 'Tap start of line')
              : 'Tap to place dots'}
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

                  {/* Items: dots and lines */}
                  {imageLoaded && items.map(item => {
                    const isLine = item.label === 'line' && item.notes
                    if (isLine) {
                      try {
                        const { x1, y1, x2, y2 } = JSON.parse(item.notes)
                        return (
                          <svg key={item.id} className="absolute top-0 left-0 w-full h-full z-10 pointer-events-none" style={{ pointerEvents: isMarking ? 'none' : 'auto' }}>
                            <line
                              x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`}
                              stroke={`${STATUS_COLORS[item.status] || '#B0B8C9'}`}
                              strokeWidth="4" strokeLinecap="round" strokeOpacity="0.6"
                              style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                              onClick={(e) => { e.stopPropagation(); if (!isMarking) { setSelectedItem(item); loadItemHistory(item.id) } }}
                            />
                          </svg>
                        )
                      } catch { return null }
                    }
                    return (
                      <button key={item.id}
                        onClick={(e) => { e.stopPropagation(); if (!isMarking) { setSelectedItem(item); loadItemHistory(item.id) } }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 z-10 transition-transform hover:scale-150"
                        style={{ left: `${item.pin_x}%`, top: `${item.pin_y}%`, pointerEvents: isMarking ? 'none' : 'auto' }}>
                        <div className="w-4 h-4 rounded-full border border-white/60"
                          style={{ backgroundColor: `${STATUS_COLORS[item.status] || '#B0B8C9'}99` }} />
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
                </div>
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>

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
  )
}
