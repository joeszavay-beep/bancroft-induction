import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { offlineUpdate, offlineInsert, offlineDelete } from '../lib/syncQueue'
import { fetchAndCache } from '../hooks/useOfflineData'
import { smartCompress } from '../lib/imageCompressor'
import toast from 'react-hot-toast'
import LoadingButton from './LoadingButton'
import {
  X, MapPin, Calendar, User, MessageSquare, Send,
  CheckCircle2, Trash2, ZoomIn, Camera
} from 'lucide-react'

const TRADES = ['Electrical', 'Fire Alarm', 'Sound Masking', 'Pipework', 'Ductwork', 'BMS', 'Other']
const TYPES = ['General', 'Installation', 'Commissioning', 'Design', 'Other']
const STATUSES = ['open', 'completed', 'closed', 'reassigned', 'pending_review']
const STATUS_COLORS = {
  pending_review: 'bg-purple-100 text-purple-700 border-purple-200',
  open: 'bg-red-100 text-red-700 border-red-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
  closed: 'bg-gray-100 text-gray-600 border-gray-200',
  reassigned: 'bg-amber-100 text-amber-700 border-amber-200',
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
      const size = 200
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      const cropW = img.width * 0.2
      const cropH = img.height * 0.2
      let sx = (pinX / 100) * img.width - cropW / 2
      let sy = (pinY / 100) * img.height - cropH / 2
      sx = Math.max(0, Math.min(sx, img.width - cropW))
      sy = Math.max(0, Math.min(sy, img.height - cropH))
      ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, size, size)
      const mx = ((pinX / 100) * img.width - sx) / cropW * size
      const my = ((pinY / 100) * img.height - sy) / cropH * size
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(mx, my, 10, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.arc(mx, my, 3, 0, Math.PI * 2)
      ctx.fill()
      setReady(true)
    }
    img.src = drawing.file_url
  }, [drawing, pinX, pinY])

  if (!drawing?.file_url) return null
  return (
    <div>
      <p className="text-[10px] text-[#6B7A99] uppercase font-semibold tracking-wider mb-1.5 flex items-center gap-1"><MapPin size={10} /> Location on Drawing</p>
      <canvas ref={canvasRef} className="w-full max-w-[180px] rounded-lg border border-[#E2E6EA]" style={{ display: ready ? 'block' : 'none', aspectRatio: '1' }} />
      {!ready && <div className="w-[180px] h-[180px] bg-[#F5F6F8] rounded-lg border border-[#E2E6EA] flex items-center justify-center"><div className="animate-spin w-4 h-4 border-2 border-[#1B6FC8] border-t-transparent rounded-full" /></div>}
      <p className="text-[9px] text-[#6B7A99] mt-1">{drawing.name}{drawing.level_ref ? ` — ${drawing.level_ref}` : ''}</p>
    </div>
  )
}

export default function SnagDetail({ snag, onClose, onUpdated, isPM, operatives, drawing }) {
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [snagPhoto, setSnagPhoto] = useState(snag.photo_url)

  // Editable fields
  const [status, setStatus] = useState(snag.status || 'open')
  const [trade, setTrade] = useState(snag.trade || '')
  const [type, setType] = useState(snag.type || '')
  const [description, setDescription] = useState(snag.description || '')
  const [priority, setPriority] = useState(snag.priority || 'medium')
  const [dueDate, setDueDate] = useState(snag.due_date || '')
  const [assignedTo, setAssignedTo] = useState(snag.assigned_to || '')
  const [reassignTo, setReassignTo] = useState('')

  useEffect(() => { loadComments() }, [snag.id])

  // Escape key handler
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') {
        if (lightbox) setLightbox(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightbox, onClose])

  async function loadComments() {
    const data = await fetchAndCache('snag_comments', (sb) =>
      sb.from('snag_comments').select('*').eq('snag_id', snag.id).order('created_at')
    )
    const filtered = Array.isArray(data) ? data.filter(c => c.snag_id === snag.id) : (data || [])
    setComments(filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)))
  }

  async function addComment(e) {
    e.preventDefault()
    if (!newComment.trim()) return
    setSending(true)
    const managerData = JSON.parse(sessionStorage.getItem('manager_data') || '{}')
    const { data, offline } = await offlineInsert('snag_comments', {
      snag_id: snag.id,
      comment: newComment.trim(),
      author_name: managerData.name || 'User',
      author_role: isPM ? 'PM' : 'Operative',
      created_at: new Date().toISOString(),
    })
    setSending(false)
    if (!data) { toast.error('Failed to add comment'); return }
    if (offline) toast.success('Comment saved offline')
    setNewComment('')
    loadComments()
  }

  async function handleSave() {
    setSaving(true)
    const updates = {
      trade: trade || null,
      type: type || null,
      description: description.trim(),
      priority,
      due_date: dueDate || null,
      status,
      assigned_to: status === 'reassigned' && reassignTo ? reassignTo : (assignedTo || null),
    }
    const { data, offline } = await offlineUpdate('snags', snag.id, updates)
    setSaving(false)
    if (!data) {
      toast.error('Failed to save changes')
      return
    }
    toast.success(offline ? 'Changes saved offline' : 'Snag updated')
    onUpdated()
  }

  async function handleDelete() {
    if (!confirm(`Delete snag #${snag.snag_number}? This cannot be undone.`)) return
    await supabase.from('snag_comments').delete().eq('snag_id', snag.id)
    const { error } = await supabase.from('snags').delete().eq('id', snag.id)
    if (error) { toast.error('Failed to delete'); return }
    toast.success('Snag deleted')
    onUpdated()
  }

  async function markComplete() {
    setSaving(true)
    const { data, offline } = await offlineUpdate('snags', snag.id, { status: 'completed' })
    setSaving(false)
    if (!data) { toast.error('Failed to update'); return }
    toast.success(offline ? `Snag #${snag.snag_number} marked complete (offline)` : `Snag #${snag.snag_number} marked complete`)
    onUpdated()
  }

  async function handlePhotoUpload(file) {
    if (!file) return
    setUploadingPhoto(true)

    let compressed = file
    try { compressed = await smartCompress(file) } catch {}

    const filePath = `snag-photos/${snag.id}/${Date.now()}.jpg`

    if (navigator.onLine) {
      const { error: upErr } = await supabase.storage.from('snag-photos').upload(filePath, compressed, { contentType: 'image/jpeg' })
      if (upErr) { setUploadingPhoto(false); toast.error('Failed to upload photo'); return }
      const { data: urlData } = supabase.storage.from('snag-photos').getPublicUrl(filePath)
      await offlineUpdate('snags', snag.id, { photo_url: urlData.publicUrl })
      setSnagPhoto(urlData.publicUrl)
      setUploadingPhoto(false)
      toast.success('Photo added')
    } else {
      // Queue the photo upload for when we're back online
      // Store blob in IDB and show local preview
      const { cacheBlob } = await import('../lib/offlineDb')
      const blobKey = `blob_photo_${snag.id}_${Date.now()}`
      const arrayBuffer = await compressed.arrayBuffer()
      await cacheBlob(blobKey, arrayBuffer, { contentType: 'image/jpeg' })

      // Show local preview from blob
      setSnagPhoto(URL.createObjectURL(compressed))
      setUploadingPhoto(false)

      // Queue the update with file upload reference
      const { enqueueMutation } = await import('../lib/offlineDb')
      await enqueueMutation({
        table: 'snags',
        operation: 'update',
        payload: { id: snag.id, updated_at: new Date().toISOString() },
        fileUpload: {
          bucket: 'snag-photos',
          path: filePath,
          blobKey,
          contentType: 'image/jpeg',
          field: 'photo_url',
        },
        clientId: blobKey,
      })

      toast.success('Photo saved offline — will upload when connected')
    }
  }

  async function updateStatus(newStatus) {
    setSaving(true)
    const { data, offline } = await offlineUpdate('snags', snag.id, { status: newStatus })
    setSaving(false)
    if (!data) { toast.error('Failed to update'); return }
    const label = newStatus === 'completed' ? 'approved' : newStatus === 'open' ? 'rejected — reopened' : newStatus
    toast.success(offline ? `Snag #${snag.snag_number} ${label} (offline)` : `Snag #${snag.snag_number} ${label}`)
    onUpdated()
  }

  const isOverdue = snag.due_date && new Date(snag.due_date) < new Date() && snag.status === 'open'
  const selectCls = "w-full px-2.5 py-2 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] focus:outline-none focus:border-[#1B6FC8] bg-white"
  const labelCls = "text-[10px] text-[#6B7A99] uppercase font-semibold tracking-wider mb-1 block"

  return (
    <>
      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Snag" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white hover:bg-white/20">
            <X size={24} />
          </button>
        </div>
      )}

      {/* Modal backdrop */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
        <div
          className="bg-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-[700px] sm:rounded-2xl shadow-2xl overflow-y-auto flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-[#E2E6EA] px-5 py-3 flex items-center justify-between z-10 shrink-0">
            <div className="flex items-center gap-2.5">
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-md border ${STATUS_COLORS[snag.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {snag.status.toUpperCase()}
              </span>
              <h3 className="text-lg font-bold text-[#1A1A2E]">Snag #{snag.snag_number}</h3>
              {isOverdue && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold">OVERDUE</span>}
            </div>
            <button onClick={onClose} className="p-1.5 text-[#6B7A99] hover:text-[#1A1A2E] hover:bg-[#F5F6F8] rounded-lg transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {/* Two column layout */}
            <div className="flex flex-col sm:flex-row">
              {/* Left — Photo */}
              <div className="sm:w-[280px] shrink-0 p-5 border-b sm:border-b-0 sm:border-r border-[#E2E6EA]">
                {snagPhoto ? (
                  <button onClick={() => setLightbox(snagPhoto)} className="relative w-full group rounded-xl overflow-hidden">
                    <img src={snagPhoto} alt="Snag" className="w-full h-52 sm:h-64 object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <ZoomIn size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                    </div>
                  </button>
                ) : (
                  <label className="w-full h-52 sm:h-64 bg-[#F5F6F8] rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-[#EEEEED] transition-colors group">
                    {uploadingPhoto ? (
                      <div className="w-8 h-8 border-2 border-[#3B7DD8] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Camera size={32} className="text-[#B0B8C9] mb-2 group-hover:text-[#3B7DD8] transition-colors" />
                        <p className="text-xs text-[#B0B8C9] group-hover:text-[#3B7DD8] transition-colors">Tap to add photo</p>
                      </>
                    )}
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => { if (e.target.files[0]) handlePhotoUpload(e.target.files[0]) }} />
                  </label>
                )}

                {/* Review photo — submitted by operative */}
                {snag.review_photo_url && (
                  <div className="mt-4">
                    <p className="text-[10px] text-purple-600 uppercase font-semibold tracking-wider mb-1.5">Completion Photo (Pending Review)</p>
                    <button onClick={() => setLightbox(snag.review_photo_url)} className="relative w-full group rounded-xl overflow-hidden">
                      <img src={snag.review_photo_url} alt="Review" className="w-full h-40 object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                      </div>
                    </button>
                    {snag.review_submitted_by && (
                      <p className="text-[10px] text-[#6B7A99] mt-1">Submitted by {snag.review_submitted_by}{snag.review_submitted_at ? ` · ${new Date(snag.review_submitted_at).toLocaleString()}` : ''}</p>
                    )}
                    {isPM && snag.status === 'pending_review' && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => updateStatus('completed')} disabled={saving}
                          className="flex-1 py-2 bg-[#2EA043] hover:bg-[#27903A] text-white text-xs font-semibold rounded-lg transition-colors">
                          Approve
                        </button>
                        <button onClick={() => updateStatus('open')} disabled={saving}
                          className="flex-1 py-2 bg-[#DA3633] hover:bg-[#c12f2c] text-white text-xs font-semibold rounded-lg transition-colors">
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Location map below photo */}
                <div className="mt-4">
                  <LocationMap drawing={drawing} pinX={snag.pin_x} pinY={snag.pin_y} />
                </div>
              </div>

              {/* Right — Details */}
              <div className="flex-1 p-5 space-y-3">
                {isPM ? (
                  <>
                    {/* Editable fields for PM */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Status</label>
                        <select value={status} onChange={e => setStatus(e.target.value)} className={selectCls}>
                          {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                        </select>
                      </div>
                      {status === 'reassigned' && (
                        <div>
                          <label className={labelCls}>Reassign To</label>
                          <select value={reassignTo} onChange={e => setReassignTo(e.target.value)} className={selectCls}>
                            <option value="">Select...</option>
                            {operatives.map(op => <option key={op.id} value={op.name}>{op.name}{op.role ? ` — ${op.role}` : ''}</option>)}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Trade</label>
                        <select value={trade} onChange={e => setTrade(e.target.value)} className={selectCls}>
                          <option value="">None</option>
                          {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Type</label>
                        <select value={type} onChange={e => setType(e.target.value)} className={selectCls}>
                          <option value="">None</option>
                          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className={labelCls}>Description</label>
                      <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                        className={`${selectCls} resize-none`} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Priority</label>
                        <select value={priority} onChange={e => setPriority(e.target.value)} className={selectCls}>
                          <option value="high">High (2 day fix)</option>
                          <option value="medium">Medium (5 day fix)</option>
                          <option value="low">Low (10 day fix)</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Due Date</label>
                        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={selectCls} />
                      </div>
                    </div>

                    <div>
                      <label className={labelCls}>Assigned To</label>
                      <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className={selectCls}>
                        <option value="">Unassigned</option>
                        {operatives.map(op => <option key={op.id} value={op.name}>{op.name}{op.role ? ` — ${op.role}` : ''}</option>)}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Read-only fields for operatives */}
                    <div className="grid grid-cols-2 gap-2.5">
                      {snag.trade && <div className="bg-[#F5F6F8] rounded-lg p-2.5"><p className="text-[10px] text-[#6B7A99] uppercase">Trade</p><p className="text-sm text-[#1A1A2E] font-semibold mt-0.5">{snag.trade}</p></div>}
                      {snag.type && <div className="bg-[#F5F6F8] rounded-lg p-2.5"><p className="text-[10px] text-[#6B7A99] uppercase">Type</p><p className="text-sm text-[#1A1A2E] font-semibold mt-0.5">{snag.type}</p></div>}
                      <div className="bg-[#F5F6F8] rounded-lg p-2.5"><p className="text-[10px] text-[#6B7A99] uppercase">Priority</p><p className={`text-sm font-semibold mt-0.5 ${priority === 'high' ? 'text-red-600' : priority === 'medium' ? 'text-amber-600' : 'text-blue-600'}`}>{snag.priority}</p></div>
                      <div className={`rounded-lg p-2.5 ${isOverdue ? 'bg-red-50' : 'bg-[#F5F6F8]'}`}><p className="text-[10px] text-[#6B7A99] uppercase">Due Date</p><p className={`text-sm font-semibold mt-0.5 ${isOverdue ? 'text-red-600' : 'text-[#1A1A2E]'}`}>{snag.due_date ? new Date(snag.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not set'}</p></div>
                    </div>
                    <div className="bg-[#F5F6F8] rounded-lg p-3">
                      <p className="text-[10px] text-[#6B7A99] uppercase mb-1">Description</p>
                      <p className="text-sm text-[#1A1A2E]">{snag.description || 'No description'}</p>
                    </div>
                    {snag.assigned_to && <div className="bg-[#F5F6F8] rounded-lg p-2.5"><p className="text-[10px] text-[#6B7A99] uppercase">Assigned To</p><p className="text-sm text-[#1A1A2E] font-medium mt-0.5">{snag.assigned_to}</p></div>}
                  </>
                )}

                {/* Read-only meta */}
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[#6B7A99] pt-1 border-t border-[#E2E6EA]">
                  {snag.raised_by && <span className="flex items-center gap-1"><User size={10} /> Raised by {snag.raised_by}</span>}
                  <span className="flex items-center gap-1"><Calendar size={10} /> {new Date(snag.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  {drawing && <span className="flex items-center gap-1"><MapPin size={10} /> {drawing.drawing_number || drawing.name}</span>}
                </div>
              </div>
            </div>

            {/* Comments section — full width */}
            <div className="border-t border-[#E2E6EA] px-5 py-4">
              <div className="flex items-center gap-1.5 mb-3">
                <MessageSquare size={14} className="text-[#1B6FC8]" />
                <p className="text-xs font-semibold text-[#1A1A2E] uppercase tracking-wider">Comments ({comments.length})</p>
              </div>

              {comments.length > 0 && (
                <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                  {comments.map(c => (
                    <div key={c.id} className="flex gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#1B6FC8]/10 flex items-center justify-center text-[#1B6FC8] text-[10px] font-bold shrink-0 mt-0.5">
                        {(c.author_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-[#1A1A2E]">{c.author_name}</p>
                          <span className="text-[10px] text-[#6B7A99]">{c.author_role}</span>
                          <span className="text-[10px] text-[#B0B8C9] ml-auto">{new Date(c.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-[#3D4F6F] mt-0.5">{c.comment}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={addComment} className="flex gap-2">
                <input
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 px-3 py-2 border border-[#E2E6EA] rounded-md text-sm text-[#1A1A2E] placeholder-[#B0B8C9] focus:outline-none focus:border-[#1B6FC8]"
                />
                <button type="submit" disabled={sending || !newComment.trim()}
                  className="px-3 py-2 bg-[#1B6FC8] hover:bg-[#1558A0] text-white rounded-md disabled:opacity-40 transition-colors">
                  <Send size={16} />
                </button>
              </form>
            </div>
          </div>

          {/* Bottom action bar */}
          <div className="sticky bottom-0 bg-white border-t border-[#E2E6EA] px-3 sm:px-5 py-3 flex flex-wrap items-center gap-2 shrink-0 pb-6 sm:pb-3">
            {isPM ? (
              <>
                <LoadingButton loading={saving} onClick={handleSave} className="px-4 sm:px-5 bg-[#1B6FC8] hover:bg-[#1558A0] text-white text-xs sm:text-sm font-semibold rounded-md flex-1 sm:flex-none min-h-[44px]">
                  Save Changes
                </LoadingButton>
                <button onClick={handleDelete} className="flex items-center gap-1.5 px-3 sm:px-4 py-3 text-[#DA3633] hover:bg-red-50 text-xs sm:text-sm font-medium rounded-md transition-colors ml-auto min-h-[44px]">
                  <Trash2 size={14} /> Delete
                </button>
              </>
            ) : (
              <>
                {(snag.status === 'open' || snag.status === 'reassigned') && (
                  <LoadingButton loading={saving} onClick={markComplete} className="px-4 sm:px-5 bg-[#2EA043] hover:bg-[#27903A] text-white text-xs sm:text-sm font-semibold rounded-md w-full sm:w-auto min-h-[44px]">
                    <CheckCircle2 size={14} className="mr-1.5" /> Mark as Complete
                  </LoadingButton>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
