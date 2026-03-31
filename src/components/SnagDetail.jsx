import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import {
  X, MapPin, Calendar, User, MessageSquare, Send,
  CheckCircle2, XCircle, RefreshCw, Trash2, ZoomIn, Edit3, Save
} from 'lucide-react'

const TRADES = ['Electrical', 'Fire Alarm', 'Sound Masking', 'Pipework', 'Ductwork', 'BMS', 'Other']
const TYPES = ['General', 'Installation', 'Commissioning', 'Design', 'Other']
const PRIORITIES = ['high', 'medium', 'low']

const STATUS_BADGE = {
  open: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-600',
  reassigned: 'bg-amber-100 text-amber-700',
}

function LocationMap({ drawing, pinX, pinY }) {
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!drawing?.file_url) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const size = 300
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')

      // Calculate crop area: 20% of image centred on pin
      const cropW = img.width * 0.2
      const cropH = img.height * 0.2
      let sx = (pinX / 100) * img.width - cropW / 2
      let sy = (pinY / 100) * img.height - cropH / 2
      // Clamp to image bounds
      sx = Math.max(0, Math.min(sx, img.width - cropW))
      sy = Math.max(0, Math.min(sy, img.height - cropH))

      ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, size, size)

      // Draw pin marker
      const markerX = ((pinX / 100) * img.width - sx) / cropW * size
      const markerY = ((pinY / 100) * img.height - sy) / cropH * size

      // Crosshair
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(markerX, markerY, 12, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(markerX - 18, markerY)
      ctx.lineTo(markerX + 18, markerY)
      ctx.moveTo(markerX, markerY - 18)
      ctx.lineTo(markerX, markerY + 18)
      ctx.stroke()

      // Red dot centre
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.arc(markerX, markerY, 3, 0, Math.PI * 2)
      ctx.fill()

      setReady(true)
    }
    img.onerror = () => console.error('Failed to load drawing for location map')
    img.src = drawing.file_url
  }, [drawing, pinX, pinY])

  if (!drawing?.file_url) return null

  return (
    <div className="bg-slate-50 rounded-xl overflow-hidden border border-slate-200">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-200">
        <MapPin size={12} className="text-blue-500" />
        <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Location on Drawing</p>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ display: ready ? 'block' : 'none', aspectRatio: '1' }}
      />
      {!ready && (
        <div className="w-full aspect-square bg-slate-100 flex items-center justify-center">
          <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      )}
      <p className="text-[10px] text-slate-400 text-center py-1.5">{drawing.name}{drawing.level_ref ? ` — ${drawing.level_ref}` : ''}</p>
    </div>
  )
}

export default function SnagDetail({ snag, onClose, onUpdated, isPM, operatives, drawing }) {
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [sending, setSending] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [reassignTo, setReassignTo] = useState('')
  const [showReassign, setShowReassign] = useState(false)
  const [photoZoom, setPhotoZoom] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTrade, setEditTrade] = useState(snag.trade || '')
  const [editType, setEditType] = useState(snag.type || '')
  const [editDesc, setEditDesc] = useState(snag.description || '')
  const [editPriority, setEditPriority] = useState(snag.priority || 'medium')
  const [editDueDate, setEditDueDate] = useState(snag.due_date || '')
  const [editAssigned, setEditAssigned] = useState(snag.assigned_to || '')

  useEffect(() => {
    loadComments()
  }, [snag.id])

  async function loadComments() {
    const { data } = await supabase
      .from('snag_comments')
      .select('*')
      .eq('snag_id', snag.id)
      .order('created_at')
    setComments(data || [])
  }

  async function addComment(e) {
    e.preventDefault()
    if (!newComment.trim()) return
    setSending(true)
    const managerData = JSON.parse(sessionStorage.getItem('manager_data') || '{}')
    const { error } = await supabase.from('snag_comments').insert({
      snag_id: snag.id,
      comment: newComment.trim(),
      author_name: managerData.name || 'User',
      author_role: isPM ? 'PM' : 'Operative',
    })
    setSending(false)
    if (error) { toast.error('Failed to add comment'); return }
    setNewComment('')
    loadComments()
  }

  async function updateStatus(status) {
    setUpdating(true)
    const updates = { status, updated_at: new Date().toISOString() }
    if (status === 'reassigned' && reassignTo) {
      updates.assigned_to = reassignTo
    }
    const { error } = await supabase.from('snags').update(updates).eq('id', snag.id)
    setUpdating(false)
    if (error) { toast.error('Failed to update snag'); return }
    toast.success(`Snag #${snag.snag_number} ${status}`)
    setShowReassign(false)
    onUpdated()
  }

  async function deleteSnag() {
    if (!confirm(`Delete snag #${snag.snag_number}? This cannot be undone.`)) return
    const { error } = await supabase.from('snags').delete().eq('id', snag.id)
    if (error) { toast.error('Failed to delete'); return }
    toast.success('Snag deleted')
    onUpdated()
  }

  async function saveEdit() {
    setUpdating(true)
    const { error } = await supabase.from('snags').update({
      trade: editTrade || null,
      type: editType || null,
      description: editDesc.trim(),
      priority: editPriority,
      due_date: editDueDate || null,
      assigned_to: editAssigned || null,
      updated_at: new Date().toISOString(),
    }).eq('id', snag.id)
    setUpdating(false)
    if (error) { toast.error('Failed to save changes'); return }
    toast.success('Snag updated')
    setEditing(false)
    onUpdated()
  }

  const isOverdue = snag.due_date && new Date(snag.due_date) < new Date() && snag.status === 'open'
  const inputCls = "w-full px-3 py-2 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8]"

  return (
    <>
      {/* Photo zoom overlay */}
      {photoZoom && snag.photo_url && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setPhotoZoom(false)}>
          <img src={snag.photo_url} alt="Snag" className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setPhotoZoom(false)} className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white hover:bg-white/20">
            <X size={24} />
          </button>
        </div>
      )}

      {/* Main modal */}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white w-full sm:max-w-xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between z-10">
            <div className="flex items-center gap-2.5">
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${STATUS_BADGE[snag.status]}`}>
                {snag.status.toUpperCase()}
              </span>
              <h3 className="text-lg font-bold text-slate-900">Snag #{snag.snag_number}</h3>
            </div>
            <div className="flex items-center gap-1">
              {isPM && !editing && (
                <button onClick={() => setEditing(true)} className="p-1.5 text-slate-400 hover:text-[#1B6FC8] hover:bg-blue-50 rounded-lg transition-colors" title="Edit snag">
                  <Edit3 size={18} />
                </button>
              )}
              {editing && (
                <button onClick={() => setEditing(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title="Cancel editing">
                  <X size={18} />
                </button>
              )}
              <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Photo - full width, tappable */}
            {snag.photo_url && (
              <button onClick={() => setPhotoZoom(true)} className="relative w-full group">
                <img src={snag.photo_url} alt="Snag photo" className="w-full h-56 object-cover rounded-xl" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-xl transition-colors flex items-center justify-center">
                  <ZoomIn size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            )}

            {editing ? (
              /* ===== EDIT MODE ===== */
              <div className="space-y-3 bg-blue-50/50 border border-blue-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-[#1B6FC8] uppercase tracking-wider">Editing Snag #{snag.snag_number}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-500 mb-0.5 block">Trade</label>
                    <select value={editTrade} onChange={e => setEditTrade(e.target.value)} className={inputCls}>
                      <option value="">None</option>
                      {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 mb-0.5 block">Type</label>
                    <select value={editType} onChange={e => setEditType(e.target.value)} className={inputCls}>
                      <option value="">None</option>
                      {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 mb-0.5 block">Priority</label>
                    <select value={editPriority} onChange={e => setEditPriority(e.target.value)} className={inputCls}>
                      {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 mb-0.5 block">Due Date</label>
                    <input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 mb-0.5 block">Assigned To</label>
                  <select value={editAssigned} onChange={e => setEditAssigned(e.target.value)} className={inputCls}>
                    <option value="">Unassigned</option>
                    {operatives.map(op => <option key={op.id} value={op.name}>{op.name}{op.role ? ` — ${op.role}` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 mb-0.5 block">Description</label>
                  <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3}
                    className={`${inputCls} resize-none`} />
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditing(false)} className="px-4 py-2 text-xs text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                    Cancel
                  </button>
                  <button onClick={saveEdit} disabled={updating}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
                    <Save size={14} /> Save Changes
                  </button>
                </div>
              </div>
            ) : (
              /* ===== VIEW MODE ===== */
              <>
                {/* Info cards */}
                <div className="grid grid-cols-2 gap-2.5">
                  {snag.trade && (
                    <div className="bg-slate-50 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">Trade</p>
                      <p className="text-sm text-slate-900 font-semibold mt-0.5">{snag.trade}</p>
                    </div>
                  )}
                  {snag.type && (
                    <div className="bg-slate-50 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">Type</p>
                      <p className="text-sm text-slate-900 font-semibold mt-0.5">{snag.type}</p>
                    </div>
                  )}
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Priority</p>
                    <p className={`text-sm font-semibold mt-0.5 ${
                      snag.priority === 'high' ? 'text-red-600' : snag.priority === 'medium' ? 'text-amber-600' : 'text-blue-600'
                    }`}>{snag.priority}{snag.priority === 'high' ? ' (2 day)' : snag.priority === 'medium' ? ' (5 day)' : ' (10 day)'}</p>
                  </div>
                  <div className={`rounded-lg p-2.5 ${isOverdue ? 'bg-red-50 border border-red-200' : 'bg-slate-50'}`}>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Due Date</p>
                    <p className={`text-sm font-semibold mt-0.5 ${isOverdue ? 'text-red-600' : 'text-slate-900'}`}>
                      {snag.due_date ? new Date(snag.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not set'}
                    </p>
                    {isOverdue && <p className="text-[10px] text-red-500 font-bold mt-0.5">OVERDUE</p>}
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Created</p>
                    <p className="text-sm text-slate-900 font-medium mt-0.5">{new Date(snag.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Assigned To</p>
                    <p className="text-sm text-slate-900 font-medium mt-0.5">{snag.assigned_to || 'Unassigned'}</p>
                  </div>
                </div>

                {/* Description */}
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Description</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{snag.description || 'No description'}</p>
                </div>

                {/* Raised by */}
                {snag.raised_by && (
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <User size={11} />
                    <span>Raised by <span className="text-slate-600 font-medium">{snag.raised_by}</span></span>
                  </div>
                )}
              </>
            )}

            {/* Location map */}
            <LocationMap drawing={drawing} pinX={snag.pin_x} pinY={snag.pin_y} />

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              {(snag.status === 'open' || snag.status === 'reassigned') && (
                <button onClick={() => updateStatus('completed')} disabled={updating}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg transition-colors">
                  <CheckCircle2 size={14} /> Mark Complete
                </button>
              )}
              {isPM && snag.status !== 'closed' && (
                <>
                  <button onClick={() => updateStatus('closed')} disabled={updating}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-500 hover:bg-slate-600 text-white text-xs font-semibold rounded-lg transition-colors">
                    <XCircle size={14} /> Close
                  </button>
                  <button onClick={() => setShowReassign(!showReassign)} disabled={updating}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors">
                    <RefreshCw size={14} /> Reassign
                  </button>
                  <button onClick={deleteSnag}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg transition-colors ml-auto">
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>

            {/* Reassign */}
            {showReassign && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                <select value={reassignTo} onChange={e => setReassignTo(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400">
                  <option value="">Select person/company</option>
                  {operatives.map(op => <option key={op.id} value={op.name}>{op.name}{op.role ? ` — ${op.role}` : ''}</option>)}
                </select>
                <button onClick={() => updateStatus('reassigned')} disabled={!reassignTo || updating}
                  className="w-full px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                  Confirm Reassign
                </button>
              </div>
            )}

            {/* Comments */}
            <div className="pt-2">
              <div className="flex items-center gap-1.5 mb-3">
                <MessageSquare size={14} className="text-blue-500" />
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Comments ({comments.length})</p>
              </div>

              {comments.length > 0 && (
                <div className="space-y-2 mb-3">
                  {comments.map(c => (
                    <div key={c.id} className="bg-slate-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-slate-700">
                          {c.author_name} <span className="text-slate-400 font-normal">({c.author_role})</span>
                        </p>
                        <p className="text-[10px] text-slate-400">{new Date(c.created_at).toLocaleString()}</p>
                      </div>
                      <p className="text-sm text-slate-600">{c.comment}</p>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={addComment} className="flex gap-2">
                <input
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400"
                />
                <button type="submit" disabled={sending || !newComment.trim()}
                  className="px-3 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50 transition-colors">
                  <Send size={16} />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
