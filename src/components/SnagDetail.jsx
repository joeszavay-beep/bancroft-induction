import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import LoadingButton from './LoadingButton'
import {
  X, MapPin, Calendar, User, MessageSquare, Send,
  CheckCircle2, XCircle, RefreshCw, Trash2, AlertTriangle
} from 'lucide-react'

const STATUS_BADGE = {
  open: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-600',
  reassigned: 'bg-amber-100 text-amber-700',
}

export default function SnagDetail({ snag, onClose, onUpdated, isPM, operatives, drawing }) {
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [sending, setSending] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [reassignTo, setReassignTo] = useState('')
  const [showReassign, setShowReassign] = useState(false)

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

  const isOverdue = snag.due_date && new Date(snag.due_date) < new Date() && snag.status === 'open'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${STATUS_BADGE[snag.status]}`}>
              {snag.status.toUpperCase()}
            </span>
            <h3 className="text-base font-bold text-slate-900">Snag #{snag.snag_number}</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Photo */}
          {snag.photo_url && (
            <img src={snag.photo_url} alt="Snag photo" className="w-full h-48 object-cover rounded-xl" />
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            {snag.trade && (
              <div className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-400 uppercase">Trade</p>
                <p className="text-sm text-slate-900 font-medium">{snag.trade}</p>
              </div>
            )}
            {snag.type && (
              <div className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-400 uppercase">Type</p>
                <p className="text-sm text-slate-900 font-medium">{snag.type}</p>
              </div>
            )}
            <div className="bg-slate-50 rounded-lg p-2.5">
              <p className="text-[10px] text-slate-400 uppercase">Priority</p>
              <p className={`text-sm font-medium ${
                snag.priority === 'high' ? 'text-red-600' : snag.priority === 'medium' ? 'text-amber-600' : 'text-blue-600'
              }`}>{snag.priority}</p>
            </div>
            <div className={`rounded-lg p-2.5 ${isOverdue ? 'bg-red-50' : 'bg-slate-50'}`}>
              <p className="text-[10px] text-slate-400 uppercase">Due Date</p>
              <p className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-slate-900'}`}>
                {snag.due_date ? new Date(snag.due_date).toLocaleDateString() : 'Not set'}
                {isOverdue && ' (OVERDUE)'}
              </p>
            </div>
          </div>

          {/* Description */}
          <div>
            <p className="text-[10px] text-slate-400 uppercase mb-1">Description</p>
            <p className="text-sm text-slate-700">{snag.description || 'No description'}</p>
          </div>

          {/* Meta */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
            {snag.assigned_to && <span className="flex items-center gap-1"><User size={10} /> {snag.assigned_to}</span>}
            {snag.raised_by && <span className="flex items-center gap-1"><User size={10} /> Raised by {snag.raised_by}</span>}
            <span className="flex items-center gap-1"><Calendar size={10} /> {new Date(snag.created_at).toLocaleDateString()}</span>
            <span className="flex items-center gap-1"><MapPin size={10} /> {drawing?.level_ref || drawing?.name}</span>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {snag.status === 'open' && (
              <button onClick={() => updateStatus('completed')} disabled={updating}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors">
                <CheckCircle2 size={14} /> Mark Complete
              </button>
            )}
            {isPM && snag.status !== 'closed' && (
              <>
                <button onClick={() => updateStatus('closed')} disabled={updating}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-500 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-colors">
                  <XCircle size={14} /> Close
                </button>
                <button onClick={() => setShowReassign(!showReassign)} disabled={updating}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg transition-colors">
                  <RefreshCw size={14} /> Reassign
                </button>
                <button onClick={deleteSnag}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg transition-colors ml-auto">
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>

          {/* Reassign picker */}
          {showReassign && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <select value={reassignTo} onChange={e => setReassignTo(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-blue-400">
                <option value="">Select person/company</option>
                {operatives.map(op => <option key={op.id} value={op.name}>{op.name}{op.role ? ` — ${op.role}` : ''}</option>)}
              </select>
              <button onClick={() => updateStatus('reassigned')} disabled={!reassignTo || updating}
                className="w-full px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
                Confirm Reassign
              </button>
            </div>
          )}

          {/* Comments */}
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <MessageSquare size={14} className="text-blue-500" />
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Comments ({comments.length})</p>
            </div>

            {comments.length > 0 && (
              <div className="space-y-2 mb-3">
                {comments.map(c => (
                  <div key={c.id} className="bg-slate-50 rounded-lg p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-slate-700">{c.author_name} <span className="text-slate-400 font-normal">({c.author_role})</span></p>
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
                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:border-blue-400"
              />
              <button type="submit" disabled={sending || !newComment.trim()}
                className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50 transition-colors">
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
