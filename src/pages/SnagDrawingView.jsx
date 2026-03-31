import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import LoadingButton from '../components/LoadingButton'
import SnagDetail from '../components/SnagDetail'
import SnagForm from '../components/SnagForm'
import { generateSnagPDF } from '../lib/generateSnagPDF'
import {
  ArrowLeft, List, Map, Plus, Download, Filter,
  ZoomIn, ZoomOut, RotateCcw, X
} from 'lucide-react'

const STATUS_COLORS = {
  open: { bg: 'bg-red-500', ring: 'ring-red-300', text: 'text-red-600' },
  completed: { bg: 'bg-green-500', ring: 'ring-green-300', text: 'text-green-600' },
  closed: { bg: 'bg-gray-400', ring: 'ring-gray-300', text: 'text-gray-500' },
  reassigned: { bg: 'bg-amber-500', ring: 'ring-amber-300', text: 'text-amber-600' },
}

export default function SnagDrawingView() {
  const { drawingId } = useParams()
  const [searchParams] = useSearchParams()
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

  const isPM = true // will be checked by session

  useEffect(() => {
    loadData()
  }, [drawingId])

  async function loadData() {
    setLoading(true)
    const { data: d } = await supabase.from('drawings').select('*').eq('id', drawingId).single()
    if (!d) { navigate('/pm'); return }
    setDrawing(d)

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
    const naturalW = imageRef.current.naturalWidth
    const naturalH = imageRef.current.naturalHeight
    const displayW = imageRef.current.clientWidth
    const displayH = imageRef.current.clientHeight

    // Get click position relative to the displayed image
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
      <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm border-b border-slate-200 px-3 py-2 flex items-center justify-between shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/pm')} className="p-1 text-slate-400 hover:text-slate-600 transition-colors shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{drawing?.name}</p>
            <p className="text-[10px] text-slate-400 truncate">{drawing?.drawing_number} Rev {drawing?.revision}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isPM && (
            <button
              onClick={() => setPlacingPin(!placingPin)}
              className={`p-2 rounded-lg transition-colors ${placingPin ? 'bg-red-500 text-white' : 'text-slate-400 hover:text-blue-500 hover:bg-blue-50'}`}
              title={placingPin ? 'Cancel pin placement' : 'Place new snag pin'}
            >
              {placingPin ? <X size={18} /> : <Plus size={18} />}
            </button>
          )}
          <button onClick={() => setShowList(!showList)} className={`p-2 rounded-lg transition-colors ${showList ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-blue-500'}`}>
            <List size={18} />
          </button>
          <button onClick={handleExport} disabled={exporting} className="p-2 text-slate-400 hover:text-blue-500 transition-colors">
            {exporting ? <div className="w-4.5 h-4.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : <Download size={18} />}
          </button>
        </div>
      </header>

      {/* Status bar */}
      <div className="bg-white border-b border-slate-200 px-3 py-2 flex items-center gap-2 overflow-x-auto shrink-0">
        {[
          { key: 'all', label: 'All', count: snags.length, color: 'bg-slate-500' },
          { key: 'open', label: 'Open', count: openCount, color: 'bg-red-500' },
          { key: 'completed', label: 'Done', count: completedCount, color: 'bg-green-500' },
          { key: 'closed', label: 'Closed', count: closedCount, color: 'bg-gray-400' },
          { key: 'reassigned', label: 'Reassigned', count: reassignedCount, color: 'bg-amber-500' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap ${
              statusFilter === f.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${f.color}`} />
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {placingPin && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-center">
          <p className="text-xs text-red-600 font-semibold">Tap on the drawing to place a snag pin</p>
        </div>
      )}

      {/* Drawing viewer or list */}
      {showList ? (
        <SnagListPanel
          snags={filteredSnags}
          onSelect={s => { setSelectedSnag(s); setShowList(false) }}
          project={project}
        />
      ) : (
        <div className="flex-1 overflow-hidden bg-slate-200">
          <TransformWrapper
            ref={transformRef}
            initialScale={1}
            minScale={0.3}
            maxScale={5}
            disabled={placingPin}
            panning={{ disabled: placingPin }}
          >
            <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%' }}>
              <div className="relative inline-block" style={{ touchAction: placingPin ? 'none' : 'auto' }}>
                <img
                  ref={imageRef}
                  src={drawing?.file_url}
                  alt={drawing?.name}
                  className="max-w-none"
                  style={{ width: '100%', minWidth: '800px' }}
                  onLoad={() => setImageLoaded(true)}
                  onClick={handleImageClick}
                />
                {imageLoaded && filteredSnags.map(snag => {
                  const colors = STATUS_COLORS[snag.status] || STATUS_COLORS.open
                  return (
                    <button
                      key={snag.id}
                      onClick={(e) => { e.stopPropagation(); setSelectedSnag(snag) }}
                      className={`absolute ${colors.bg} text-white rounded-full w-7 h-7 flex items-center justify-center text-[10px] font-bold ring-2 ${colors.ring} shadow-lg hover:scale-125 transition-transform -translate-x-1/2 -translate-y-1/2 z-10`}
                      style={{ left: `${snag.pin_x}%`, top: `${snag.pin_y}%` }}
                      title={`#${snag.snag_number}: ${snag.description?.slice(0, 50)}`}
                    >
                      {snag.snag_number}
                    </button>
                  )
                })}
                {pendingPin && (
                  <div
                    className="absolute bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center text-[10px] font-bold ring-2 ring-red-300 shadow-lg animate-pulse -translate-x-1/2 -translate-y-1/2 z-10"
                    style={{ left: `${pendingPin.x}%`, top: `${pendingPin.y}%` }}
                  >
                    ?
                  </div>
                )}
              </div>
            </TransformComponent>
          </TransformWrapper>
        </div>
      )}

      {/* Snag form modal */}
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

      {/* Snag detail panel */}
      {selectedSnag && (
        <SnagDetail
          snag={selectedSnag}
          onClose={() => setSelectedSnag(null)}
          onUpdated={handleSnagUpdated}
          isPM={isPM}
          operatives={operatives}
          drawing={drawing}
        />
      )}
    </div>
  )
}

/* ==================== LIST PANEL ==================== */
function SnagListPanel({ snags, onSelect, project }) {
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
      {snags.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p>No snags match the current filter</p>
        </div>
      ) : (
        snags.map(snag => {
          const colors = STATUS_COLORS[snag.status] || STATUS_COLORS.open
          const isOverdue = snag.due_date && new Date(snag.due_date) < new Date() && snag.status === 'open'
          return (
            <button
              key={snag.id}
              onClick={() => onSelect(snag)}
              className="w-full bg-white border border-slate-200 rounded-xl p-3 text-left hover:shadow-md transition-all active:scale-[0.99]"
            >
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 ${colors.bg} rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                  {snag.snag_number}
                </div>
                {snag.photo_url && (
                  <img src={snag.photo_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900 font-medium truncate">{snag.description || 'No description'}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-[10px] ${colors.text} font-semibold uppercase`}>{snag.status}</span>
                    {snag.trade && <span className="text-[10px] text-slate-400">{snag.trade}</span>}
                    {snag.priority && <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      snag.priority === 'high' ? 'bg-red-50 text-red-600' :
                      snag.priority === 'medium' ? 'bg-amber-50 text-amber-600' :
                      'bg-blue-50 text-blue-600'
                    }`}>{snag.priority}</span>}
                    {isOverdue && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-semibold">OVERDUE</span>}
                  </div>
                  {snag.assigned_to && <p className="text-[11px] text-slate-400 mt-0.5">→ {snag.assigned_to}</p>}
                </div>
                {snag.due_date && (
                  <p className={`text-[10px] shrink-0 ${isOverdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                    {new Date(snag.due_date).toLocaleDateString()}
                  </p>
                )}
              </div>
            </button>
          )
        })
      )}
    </div>
  )
}
