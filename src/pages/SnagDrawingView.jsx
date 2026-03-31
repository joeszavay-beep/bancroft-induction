import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import SnagDetail from '../components/SnagDetail'
import SnagForm from '../components/SnagForm'
import { generateSnagPDF } from '../lib/generateSnagPDF'
import {
  ArrowLeft, List, Map, Plus, Download, X, ZoomIn, ZoomOut, Crosshair
} from 'lucide-react'

const STATUS_COLORS = {
  open: { bg: '#ef4444', ring: '#fca5a5' },
  completed: { bg: '#22c55e', ring: '#86efac' },
  closed: { bg: '#9ca3af', ring: '#d1d5db' },
  reassigned: { bg: '#f59e0b', ring: '#fcd34d' },
}

export default function SnagDrawingView() {
  const { drawingId } = useParams()
  const navigate = useNavigate()
  const imageRef = useRef(null)
  const transformRef = useRef(null)

  const [drawing, setDrawing] = useState(null)
  const [project, setProject] = useState(null)
  const [snags, setSnags] = useState([])
  const [operatives, setOperatives] = useState([])
  const [loading, setLoading] = useState(true)
  const [placingPin, setPlacingPin] = useState(false)
  const [pendingPin, setPendingPin] = useState(null)
  const [selectedSnag, setSelectedSnag] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [showList, setShowList] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)

  useEffect(() => { loadData() }, [drawingId])

  async function loadData() {
    setLoading(true)
    const { data: d } = await supabase.from('drawings').select('*').eq('id', drawingId).single()
    if (!d) { navigate('/pm'); return }
    setDrawing(d)
    console.log('Drawing loaded, file_url:', d.file_url)

    const [p, s, o] = await Promise.all([
      supabase.from('projects').select('*').eq('id', d.project_id).single(),
      supabase.from('snags').select('*').eq('drawing_id', drawingId).order('snag_number'),
      supabase.from('operatives').select('*').eq('project_id', d.project_id).order('name'),
    ])
    setProject(p.data)
    setSnags(s.data || [])
    setOperatives(o.data || [])
    setLoading(false)
  }

  function handleImageClick(e) {
    if (!placingPin || !imageRef.current) return
    const rect = imageRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setPendingPin({ x, y })
    setPlacingPin(false)
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
    <div className="min-h-dvh bg-slate-100 flex flex-col">
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
        <div className="flex-1 overflow-hidden bg-slate-200" style={{ cursor: placingPin ? 'crosshair' : 'grab' }}>
          <TransformWrapper
            ref={transformRef}
            initialScale={0.8}
            minScale={0.2}
            maxScale={8}
            disabled={placingPin}
            panning={{ disabled: placingPin }}
            wheel={{ step: 0.1 }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                {/* Zoom controls */}
                <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1">
                  <button onClick={() => zoomIn()} className="w-9 h-9 bg-white border border-slate-300 rounded-lg shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50">
                    <ZoomIn size={16} />
                  </button>
                  <button onClick={() => zoomOut()} className="w-9 h-9 bg-white border border-slate-300 rounded-lg shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50">
                    <ZoomOut size={16} />
                  </button>
                </div>

                <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%' }}>
                  <div className="relative inline-block" style={{ touchAction: placingPin ? 'none' : 'auto' }}>
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
                        style={{ width: '100%', minWidth: '800px' }}
                        onLoad={() => { setImageLoaded(true); console.log('Image loaded successfully') }}
                        onError={(e) => { console.error('Image load error:', e); setImgError(true) }}
                        onClick={handleImageClick}
                        draggable={false}
                      />
                    )}

                    {/* Snag pins */}
                    {imageLoaded && filteredSnags.map(snag => {
                      const color = STATUS_COLORS[snag.status] || STATUS_COLORS.open
                      return (
                        <button
                          key={snag.id}
                          onClick={(e) => { e.stopPropagation(); setSelectedSnag(snag) }}
                          className="absolute -translate-x-1/2 -translate-y-full z-10 group"
                          style={{ left: `${snag.pin_x}%`, top: `${snag.pin_y}%` }}
                          title={`#${snag.snag_number}: ${snag.description?.slice(0, 40)}`}
                        >
                          {/* Teardrop pin shape */}
                          <svg width="28" height="36" viewBox="0 0 28 36" className="drop-shadow-md group-hover:scale-110 transition-transform">
                            <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill={color.bg} />
                            <circle cx="14" cy="13" r="8" fill="white" fillOpacity="0.3" />
                            <text x="14" y="17" textAnchor="middle" fontSize="10" fontWeight="700" fill="white">{snag.snag_number}</text>
                          </svg>
                        </button>
                      )
                    })}

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
          onClose={() => { setShowForm(false); setPendingPin(null) }}
          drawingId={drawingId}
          projectId={drawing.project_id}
          pinX={pendingPin.x}
          pinY={pendingPin.y}
          nextNumber={(snags.length > 0 ? Math.max(...snags.map(s => s.snag_number)) : 0) + 1}
          operatives={operatives}
          onCreated={handleSnagCreated}
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
    </div>
  )
}
